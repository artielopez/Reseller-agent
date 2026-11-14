-- Optimistic inventory saves include photos/listing-only edits, independently
-- of the buyer-facts revision. Existing unversioned editors fail closed on edits.
begin;
alter table public.items add column save_revision uuid not null default gen_random_uuid();
create function public.inventory_save_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
begin new.save_revision:=gen_random_uuid(); return new; end;
$$;
revoke all on function public.inventory_save_revision() from public, anon, authenticated;
create trigger inventory_save_revision before insert or update on public.items
for each row execute function public.inventory_save_revision();

create or replace function public.save_inventory_item(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  item_uuid uuid := (payload->>'id')::uuid;
  user_uuid uuid := auth.uid();
  photo jsonb;
  listing jsonb;
  photo_position integer := 0;
  expected uuid := (payload->>'saveRevision')::uuid;
  affected integer;
begin
  if user_uuid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(payload->'photos') is distinct from 'array' or jsonb_array_length(payload->'photos') > 10 then raise exception 'Invalid photos'; end if;
  if jsonb_typeof(payload->'listings') is distinct from 'array' or jsonb_array_length(payload->'listings') <> 3 then raise exception 'Three channels are required'; end if;
  if (select count(distinct value->>'channel') from jsonb_array_elements(payload->'listings')) <> 3 then raise exception 'Duplicate channels'; end if;
  if expected is null then
    insert into public.items (id, owner_id, title, description, price, category, condition, status)
    values (item_uuid, user_uuid, trim(payload->>'title'), payload->>'description', (payload->>'price')::numeric, payload->>'category', payload->>'condition', payload->>'status')
    on conflict (id) do nothing;
  else
    update public.items set title=trim(payload->>'title'), description=payload->>'description',
      price=(payload->>'price')::numeric, category=payload->>'category', condition=payload->>'condition', status=payload->>'status'
      where id=item_uuid and owner_id=user_uuid and save_revision=expected;
  end if;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Item changed. Reload inventory before saving again.' using errcode='PT409';
  end if;

  delete from public.item_photos where item_id = item_uuid;
  for photo in select value from jsonb_array_elements(payload->'photos') loop
    insert into public.item_photos (id, item_id, owner_id, path, position)
    values ((photo->>'id')::uuid, item_uuid, user_uuid, photo->>'path', photo_position);
    photo_position := photo_position + 1;
  end loop;
  for listing in select value from jsonb_array_elements(payload->'listings') loop
    insert into public.listings (item_id, owner_id, channel, title, description, status, url, published_at)
    values (item_uuid, user_uuid, listing->>'channel', listing->>'title', listing->>'description', listing->>'status', trim(listing->>'url'), case when listing->>'status' = 'Published' then now() else null end)
    on conflict (item_id, channel) do update set title = excluded.title, description = excluded.description,
      status = excluded.status, url = excluded.url,
      published_at = case when excluded.status = 'Published' then coalesce(public.listings.published_at, now()) else null end;
  end loop;
  return item_uuid;
end;
$$;
revoke all on function public.save_inventory_item(jsonb) from public, anon;
grant execute on function public.save_inventory_item(jsonb) to authenticated;


-- Return the exact transaction's revision instead of inventing a timestamp or
-- reading another client's later revision in a second HTTP request.
create function public.save_inventory_item_checked(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved_id uuid;
begin
  saved_id:=public.save_inventory_item(payload);
  return (select jsonb_build_object('saveRevision',save_revision::text,
    'updatedAt',updated_at,'replyContextRevision',reply_context_revision::text)
    from public.items where id=saved_id and owner_id=auth.uid());
end;
$$;
revoke all on function public.save_inventory_item_checked(jsonb) from public, anon;
grant execute on function public.save_inventory_item_checked(jsonb) to authenticated;
commit;

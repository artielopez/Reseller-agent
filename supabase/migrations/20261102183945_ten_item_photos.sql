-- Expand photo capacity without changing ownership, private paths or atomic saves.
begin;
alter table public.item_photos drop constraint item_photos_position_check;
alter table public.item_photos add constraint item_photos_position_check
  check (position between 0 and 9);

create or replace function public.save_inventory_item(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  item_uuid uuid := (payload->>'id')::uuid;
  user_uuid uuid := auth.uid();
  photo jsonb;
  listing jsonb;
  photo_position integer := 0;
begin
  if user_uuid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(payload->'photos') is distinct from 'array' or jsonb_array_length(payload->'photos') > 10 then raise exception 'Invalid photos'; end if;
  if jsonb_typeof(payload->'listings') is distinct from 'array' or jsonb_array_length(payload->'listings') <> 3 then raise exception 'Three channels are required'; end if;
  if (select count(distinct value->>'channel') from jsonb_array_elements(payload->'listings')) <> 3 then raise exception 'Duplicate channels'; end if;
  insert into public.items (id, owner_id, title, description, price, category, condition, status)
  values (item_uuid, user_uuid, trim(payload->>'title'), payload->>'description', (payload->>'price')::numeric, payload->>'category', payload->>'condition', payload->>'status')
  on conflict (id) do update set title = excluded.title, description = excluded.description,
    price = excluded.price, category = excluded.category, condition = excluded.condition, status = excluded.status;

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

commit;

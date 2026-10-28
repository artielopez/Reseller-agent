-- Reseller Agent MVP. Apply once to a new Supabase project.
-- Authentication and storage schemas are provided by Supabase.
begin;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  price numeric not null check (price >= 0 and price <= 9999999.99 and price = round(price, 2)),
  category text not null check (category in ('Electronics','Fashion','Home & living','Sports & outdoors','Books & hobbies','Other')),
  condition text not null check (condition in ('Like new','Good','Fair','For parts')),
  status text not null default 'Draft' check (status in ('Draft','Ready','Listed','Reserved','Sold')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create index items_owner_updated on public.items(owner_id, updated_at desc);

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  owner_id uuid not null default auth.uid(),
  path text not null unique,
  position smallint not null check (position between 0 and 5),
  foreign key (item_id, owner_id) references public.items(id, owner_id) on delete cascade,
  unique (item_id, position),
  check (path = owner_id::text || '/' || item_id::text || '/' || id::text || '.jpg')
);
create index item_photos_owner on public.item_photos(owner_id);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  owner_id uuid not null default auth.uid(),
  channel text not null check (channel in ('carousell','marketplace','groups')),
  title text not null default '' check (char_length(title) <= 160),
  description text not null default '' check (char_length(description) <= 6000),
  status text not null default 'Not posted' check (status in ('Not posted','Published','Removed')),
  url text not null default '' check (char_length(url) <= 2048),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (item_id, owner_id) references public.items(id, owner_id) on delete cascade,
  unique (item_id, channel),
  unique (id, owner_id),
  check (status <> 'Published' or url <> ''),
  check (url = '' or (case when channel = 'carousell'
    then url ~ '^https://([A-Za-z0-9-]+\.)*carousell\.ph(/|\?|#|$)'
    else url ~ '^https://([A-Za-z0-9-]+\.)*facebook\.com(/|\?|#|$)' end))
);
create index listings_owner on public.listings(owner_id);

-- Future manual import / authorized integration only. No message access or sending code.
create table public.buyer_inquiries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id uuid not null,
  channel text not null check (channel in ('carousell','marketplace','groups')),
  buyer_name text check (char_length(buyer_name) <= 200),
  message text not null check (char_length(message) between 1 and 10000),
  source text not null default 'manual' check (source in ('manual','authorized_integration')),
  status text not null default 'Open' check (status in ('Open','Answered','Closed')),
  received_at timestamptz not null default now(),
  foreign key (item_id, owner_id) references public.items(id, owner_id) on delete cascade,
  unique (id, owner_id)
);
create index buyer_inquiries_owner_item on public.buyer_inquiries(owner_id, item_id);
create table public.suggested_replies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  inquiry_id uuid not null,
  body text not null check (char_length(body) between 1 and 10000),
  status text not null default 'Draft' check (status in ('Draft','Approved','Dismissed')),
  created_at timestamptz not null default now(),
  foreign key (inquiry_id, owner_id) references public.buyer_inquiries(id, owner_id) on delete cascade
);
create index suggested_replies_owner_inquiry on public.suggested_replies(owner_id, inquiry_id);

alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.listings enable row level security;
alter table public.buyer_inquiries enable row level security;
alter table public.suggested_replies enable row level security;
create policy own_items on public.items for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_photos on public.item_photos for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_listings on public.listings for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_inquiries on public.buyer_inquiries for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy own_replies on public.suggested_replies for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
revoke all on public.items, public.item_photos, public.listings, public.buyer_inquiries, public.suggested_replies from anon;
grant select, insert, update, delete on public.items, public.item_photos, public.listings, public.buyer_inquiries, public.suggested_replies to authenticated;

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger items_updated_at before update on public.items for each row execute function public.set_updated_at();
create trigger listings_updated_at before update on public.listings for each row execute function public.set_updated_at();

-- An invoker function: all writes still pass the caller's RLS policies.
-- Item, photo metadata and all three channel records commit or roll back together.
create function public.save_inventory_item(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  item_uuid uuid := (payload->>'id')::uuid;
  user_uuid uuid := auth.uid();
  photo jsonb;
  listing jsonb;
  photo_position integer := 0;
begin
  if user_uuid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(payload->'photos') is distinct from 'array' or jsonb_array_length(payload->'photos') > 6 then raise exception 'Invalid photos'; end if;
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

create table public.ai_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  requests integer not null check (requests between 1 and 20),
  primary key (owner_id, usage_date)
);
alter table public.ai_usage enable row level security;
create policy own_ai_usage on public.ai_usage for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
-- Atomic, durable budget check across server instances; failed provider calls also count.
create function public.reserve_ai_generation() returns boolean
language plpgsql security definer set search_path = '' as $$
declare accepted integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.ai_usage(owner_id, usage_date, requests)
  values (auth.uid(), (now() at time zone 'Asia/Manila')::date, 1)
  on conflict (owner_id, usage_date) do update set requests = public.ai_usage.requests + 1
    where public.ai_usage.requests < 20
  returning requests into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.reserve_ai_generation() from public, anon;
grant execute on function public.reserve_ai_generation() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 2097152, array['image/jpeg']);
create policy own_photo_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy own_photo_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy own_photo_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No UPDATE policy: uploads use immutable unique paths, never overwrite another file.
commit;

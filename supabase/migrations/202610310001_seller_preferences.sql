-- Owner-supplied general terms and in-app review, independent of delivery simulation.
create table public.seller_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision>=0),
 terms_revision bigint not null default 0 check(terms_revision>=0),
 pickup_area text not null default '' check(length(pickup_area)<=160),
 delivery_notes text not null default '' check(length(delivery_notes)<=500),
 payment_notes text not null default '' check(length(payment_notes)<=300),
 digest_enabled boolean not null default false,
 digest_time text not null default '09:00' check(digest_time ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'),
 last_reviewed_at timestamptz,
 check(terms_revision>0 or (pickup_area='' and delivery_notes='' and payment_notes=''))
);
alter table public.seller_preferences enable row level security;
revoke all on public.seller_preferences from public,anon,authenticated;
grant select on public.seller_preferences to authenticated;
create policy seller_preferences_owner on public.seller_preferences for select to authenticated using(owner_id=auth.uid());

create function public.seller_terms_context(who uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('seller_terms',jsonb_build_object('revision',terms_revision::text,'pickup_area',pickup_area,'delivery_notes',delivery_notes,'payment_notes',payment_notes)) from public.seller_preferences where owner_id=who and terms_revision>0),'{}'::jsonb)
$$;

create or replace function public.buyer_context(qid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('inquiry_id',q.id,'inquiry_revision',q.revision::text,'item_revision',i.reply_context_revision::text,
 'channel',q.channel,'surface',q.surface,'message',q.message,
 'item',jsonb_build_object('id',i.id,'title',i.title,'description',i.description,'price',i.price,'condition',i.condition,'category',i.category,'status',i.status))
 || public.seller_terms_context(auth.uid())
 from public.buyer_inquiries q join public.items i on (i.id,i.owner_id)=(q.item_id,q.owner_id)
 where q.id=qid and q.owner_id=auth.uid()
$$;

create or replace function public.draft_owned_context(who uuid,qid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('inquiry_id',q.id,'inquiry_revision',q.revision::text,'item_revision',i.reply_context_revision::text,
 'channel',q.channel,'surface',q.surface,'message',q.message,
 'item',jsonb_build_object('id',i.id,'title',i.title,'description',i.description,'price',i.price,'condition',i.condition,'category',i.category,'status',i.status))
 || public.seller_terms_context(who)
 from public.buyer_inquiries q join public.items i on (i.id,i.owner_id)=(q.item_id,q.owner_id)
 where q.id=qid and q.owner_id=who and q.status='Open' and q.surface='dm'
$$;

create function public.seller_workspace(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 who uuid:=auth.uid(); op text:=command->>'op'; p public.seller_preferences; v jsonb; allowed text[];
 pickup text; delivery text; payment text; enabled boolean; reminder text; changed_terms boolean;
 preferences jsonb; summary jsonb; since_at timestamptz; as_of timestamptz:=clock_timestamp();
begin
 if who is null then raise exception 'Authentication required' using errcode='42501';end if;
 if command is null or jsonb_typeof(command)<>'object' or octet_length(command::text)>16384 then raise exception 'Invalid command' using errcode='22023';end if;
 allowed:=case op when 'get' then array['op'] when 'save' then array['op','input','expected_revision'] when 'review' then array['op','expected_revision'] else null end;
 if allowed is null or exists(select 1 from jsonb_object_keys(command) k where not(k=any(allowed))) then raise exception 'Invalid operation' using errcode='22023';end if;
 if op<>'get' then
  if jsonb_typeof(command->'expected_revision') is distinct from 'string' or (command->>'expected_revision') !~ '^(0|[1-9][0-9]{0,38})$' then raise exception 'Revision required' using errcode='22023';end if;
  insert into public.seller_preferences(owner_id) values(who) on conflict do nothing;
  select * into p from public.seller_preferences where owner_id=who for update;
  if p.revision::numeric<>(command->>'expected_revision')::numeric then raise exception 'Preferences changed' using errcode='40001';end if;
  if op='save' then
   v:=command->'input';
   if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v) k where not(k=any(array['pickup_area','delivery_notes','payment_notes','digest_enabled','digest_time']))) then raise exception 'Invalid preferences' using errcode='22023';end if;
   if jsonb_typeof(v->'pickup_area') is distinct from 'string' or jsonb_typeof(v->'delivery_notes') is distinct from 'string' or jsonb_typeof(v->'payment_notes') is distinct from 'string' or jsonb_typeof(v->'digest_enabled') is distinct from 'boolean' or jsonb_typeof(v->'digest_time') is distinct from 'string' then raise exception 'Invalid preference types' using errcode='22023';end if;
   pickup:=btrim(v->>'pickup_area');delivery:=btrim(v->>'delivery_notes');payment:=btrim(v->>'payment_notes');enabled:=(v->>'digest_enabled')::boolean;reminder:=v->>'digest_time';
   if length(pickup)>160 or length(delivery)>500 or length(payment)>300 or reminder !~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid preferences' using errcode='22023';end if;
   changed_terms:=(p.pickup_area,p.delivery_notes,p.payment_notes) is distinct from (pickup,delivery,payment);
   if changed_terms or (p.digest_enabled,p.digest_time) is distinct from (enabled,reminder) then
    update public.seller_preferences set pickup_area=pickup,delivery_notes=delivery,payment_notes=payment,digest_enabled=enabled,digest_time=reminder,revision=revision+1,terms_revision=terms_revision+case when changed_terms then 1 else 0 end where owner_id=who returning * into p;
    if changed_terms then
     update public.suggested_replies set status='Draft',approved_at=null,revision=revision+1,updated_at=as_of where owner_id=who and status='Approved';
    end if;
   end if;
  else
   update public.seller_preferences set last_reviewed_at=as_of,revision=revision+1 where owner_id=who returning * into p;
  end if;
 else
  select * into p from public.seller_preferences where owner_id=who;
 end if;
 preferences:=jsonb_build_object('revision',coalesce(p.revision,0)::text,'terms_revision',coalesce(p.terms_revision,0)::text,'pickup_area',coalesce(p.pickup_area,''),'delivery_notes',coalesce(p.delivery_notes,''),'payment_notes',coalesce(p.payment_notes,''),'digest_enabled',coalesce(p.digest_enabled,false),'digest_time',coalesce(p.digest_time,'09:00'),'last_reviewed_at',p.last_reviewed_at);
 since_at:=coalesce(p.last_reviewed_at,date_trunc('day',as_of at time zone 'Asia/Manila') at time zone 'Asia/Manila');
 with recent as (select * from public.buyer_inquiries where owner_id=who order by updated_at desc,id limit 200),
 states as (select q.*,exists(select 1 from public.suggested_replies r where r.owner_id=who and r.inquiry_id=q.id and r.status='Approved' and r.context_snapshot=public.buyer_context(q.id)) ready,
 exists(select 1 from public.suggested_replies r where r.owner_id=who and r.inquiry_id=q.id and r.status<>'Dismissed') has_reply from recent q)
 select jsonb_build_object('total',count(*),'open',count(*) filter(where status='Open'),'ready',count(*) filter(where status='Open' and ready),'needs_review',count(*) filter(where status='Open' and has_reply and not ready),'received',count(*) filter(where received_at>=since_at and received_at<=as_of),'since',since_at,'as_of',as_of) into summary from states;
 return jsonb_build_object('preferences',preferences,'summary',summary);
end $$;
revoke all on function public.seller_terms_context(uuid),public.seller_workspace(jsonb) from public,anon,authenticated;
grant execute on function public.seller_workspace(jsonb) to authenticated;

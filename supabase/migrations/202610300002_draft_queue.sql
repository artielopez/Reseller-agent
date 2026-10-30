-- Draft-only worker capability. No platform reader, approval or sender.
begin;
alter table public.suggested_replies drop constraint suggested_replies_source_check;
alter table public.suggested_replies add constraint suggested_replies_source_check check (source in ('manual','template','agent'));
alter table public.suggested_replies add column review_note text check (char_length(review_note)<=500);
create table public.draft_controls (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 paused boolean not null default true,
 revision bigint not null default 1
);
create table public.draft_workers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 label text not null check (char_length(btrim(label)) between 1 and 80),
 token_hash text not null unique,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '7 days'),
 revoked_at timestamptz,
 last_seen_at timestamptz,
 unique(id,owner_id)
);
create table public.draft_jobs (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 inquiry_id uuid not null,
 context_snapshot jsonb not null,
 status text not null default 'queued' check(status in ('queued','leased','completed','failed','canceled')),
 reason text,
 worker_id uuid,
 lease_id uuid,
 lease_expires_at timestamptz,
 attempt_started boolean not null default false,
 reply_id uuid references public.suggested_replies(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(inquiry_id,owner_id) references public.buyer_inquiries(id,owner_id) on delete cascade,
 foreign key(worker_id,owner_id) references public.draft_workers(id,owner_id),
 unique(id,owner_id)
);
create unique index one_active_draft_job on public.draft_jobs(inquiry_id) where status in ('queued','leased');
create index draft_jobs_owner_created on public.draft_jobs(owner_id,created_at);
alter table public.draft_controls enable row level security;
alter table public.draft_workers enable row level security;
alter table public.draft_jobs enable row level security;
create policy own_draft_controls on public.draft_controls for select to authenticated using(owner_id=(select auth.uid()));
create policy own_draft_workers on public.draft_workers for select to authenticated using(owner_id=(select auth.uid()));
create policy own_draft_jobs on public.draft_jobs for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.draft_controls,public.draft_workers,public.draft_jobs from public,anon,authenticated;
grant select on public.draft_controls,public.draft_jobs to authenticated;
grant select(id,label,created_at,expires_at,revoked_at,last_seen_at) on public.draft_workers to authenticated;

-- Private helper: caller has already established owner and locked the item/inquiry.
create function public.draft_owned_context(who uuid,qid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('inquiry_id',q.id,'inquiry_revision',q.revision::text,'item_revision',i.reply_context_revision::text,
 'channel',q.channel,'surface',q.surface,'message',q.message,
 'item',jsonb_build_object('id',i.id,'title',i.title,'description',i.description,'price',i.price,'condition',i.condition,'category',i.category,'status',i.status))
 from public.buyer_inquiries q join public.items i on (i.id,i.owner_id)=(q.item_id,q.owner_id)
 where q.id=qid and q.owner_id=who and q.status='Open' and q.surface='dm'
$$;

create function public.draft_queue(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 who uuid:=auth.uid();op text:=command->>'op';allowed text[];
 c public.draft_controls;j public.draft_jobs;ctx jsonb;iid uuid;qid uuid;wid uuid;secret text;
begin
 if who is null then raise exception 'Authentication required' using errcode='42501';end if;
 if command is null or jsonb_typeof(command)<>'object' or octet_length(command::text)>16384 then raise exception 'Invalid command' using errcode='22023';end if;
 allowed:=case op when 'list' then array['op'] when 'enroll' then array['op','label'] when 'revoke' then array['op','id'] when 'pause' then array['op','paused','expected_revision'] when 'enqueue' then array['op','id','inquiry_id'] when 'cancel' then array['op','id'] else null end;
 if allowed is null or command-allowed<>'{}'::jsonb then raise exception 'Invalid command' using errcode='22023';end if;
 insert into public.draft_controls(owner_id) values(who) on conflict do nothing;
 select * into c from public.draft_controls where owner_id=who for update;
 if op='list' then
  return jsonb_build_object('paused',c.paused,'revision',c.revision::text,
   'workers',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'label',w.label,'expires_at',w.expires_at,'revoked_at',w.revoked_at,'last_seen_at',w.last_seen_at) order by w.created_at desc) from public.draft_workers w where w.owner_id=who),'[]'::jsonb),
   'jobs',coalesce((select jsonb_agg(x.entry order by x.created_at desc,x.id) from (select to_jsonb(d)-'owner_id'-'context_snapshot'-'lease_id' entry,d.created_at,d.id from public.draft_jobs d where d.owner_id=who order by d.created_at desc,d.id limit 100)x),'[]'::jsonb));
 elsif op='enroll' then
  if jsonb_typeof(command->'label') is distinct from 'string' or char_length(btrim(command->>'label')) not between 1 and 80 then raise exception 'Invalid worker label' using errcode='22023';end if;
  if (select count(*) from public.draft_workers where owner_id=who and revoked_at is null and expires_at>clock_timestamp())>=5 then raise exception 'Revoke an existing worker first' using errcode='22023';end if;
  secret:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.draft_workers(owner_id,label,token_hash) values(who,btrim(command->>'label'),encode(sha256(convert_to(secret,'UTF8')),'hex')) returning id into wid;
  return jsonb_build_object('id',wid,'token',secret,'expires_at',clock_timestamp()+interval '7 days');
 elsif op='pause' then
  if jsonb_typeof(command->'paused') is distinct from 'boolean' or command->>'expected_revision' is distinct from c.revision::text then raise exception 'Stale controls' using errcode='40001';end if;
  update public.draft_controls set paused=(command->>'paused')::boolean,revision=revision+1 where owner_id=who;
  if (command->>'paused')::boolean then update public.draft_jobs set status='canceled',reason='paused',updated_at=clock_timestamp() where owner_id=who and status in ('queued','leased');end if;
  return jsonb_build_object('paused',(command->>'paused')::boolean,'revision',(c.revision+1)::text);
 elsif op='revoke' then
  update public.draft_workers set revoked_at=coalesce(revoked_at,clock_timestamp()) where owner_id=who and id=(command->>'id')::uuid returning id into wid;
  if wid is null then raise exception 'Record unavailable' using errcode='P0002';end if;
  update public.draft_jobs set status='canceled',reason='worker_revoked',updated_at=clock_timestamp() where owner_id=who and worker_id=wid and status='leased';
  return jsonb_build_object('revoked',true);
 elsif op='cancel' then
  update public.draft_jobs set status='canceled',reason='owner_canceled',updated_at=clock_timestamp() where owner_id=who and id=(command->>'id')::uuid and status in ('queued','leased');
  if not found then raise exception 'Record unavailable' using errcode='P0002';end if;
  return jsonb_build_object('canceled',true);
 end if;
 qid:=(command->>'inquiry_id')::uuid;
 select item_id into iid from public.buyer_inquiries where id=qid and owner_id=who;
 perform 1 from public.items where id=iid and owner_id=who for update;
 perform 1 from public.buyer_inquiries where id=qid and owner_id=who for update;
 ctx:=public.draft_owned_context(who,qid);
 if ctx is null then raise exception 'Open private question required' using errcode='P0002';end if;
 select * into j from public.draft_jobs where id=(command->>'id')::uuid and owner_id=who;
 if j.id is not null then
  if j.inquiry_id<>qid or j.context_snapshot is distinct from ctx then raise exception 'Conflicting retry' using errcode='40001';end if;
 else
  select * into j from public.draft_jobs where inquiry_id=qid and owner_id=who and status in ('queued','leased');
  if j.id is null then
   if (select count(*) from public.draft_jobs where owner_id=who and status in ('queued','leased'))>=100 then raise exception 'Queue full' using errcode='22023';end if;
   insert into public.draft_jobs(id,owner_id,inquiry_id,context_snapshot) values((command->>'id')::uuid,who,qid,ctx) returning * into j;
  end if;
 end if;
 return jsonb_build_object('id',j.id,'status',j.status);
end $$;

create function public.draft_worker(worker_token text,command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 w public.draft_workers;c public.draft_controls;j public.draft_jobs;op text:=command->>'op';allowed text[];
 ctx jsonb;iid uuid;jid uuid;accepted integer;rid uuid;existing_body text;existing_note text;
begin
 if worker_token is null or worker_token !~ '^[a-f0-9]{64}$' then raise exception 'Worker unavailable' using errcode='42501';end if;
 select * into w from public.draft_workers where token_hash=encode(sha256(convert_to(worker_token,'UTF8')),'hex');
 if w.id is null then raise exception 'Worker unavailable' using errcode='42501';end if;
 select * into c from public.draft_controls where owner_id=w.owner_id for update;
 select * into w from public.draft_workers where id=w.id for update;
 if w.revoked_at is not null or w.expires_at<=clock_timestamp() then raise exception 'Worker unavailable' using errcode='42501';end if;
 if command is null or jsonb_typeof(command)<>'object' or octet_length(command::text)>16384 then raise exception 'Invalid command' using errcode='22023';end if;
 allowed:=case op when 'claim' then array['op'] when 'context' then array['op','job_id','lease_id'] when 'start' then array['op','job_id','lease_id'] when 'submit' then array['op','job_id','lease_id','body','review_reason'] when 'fail' then array['op','job_id','lease_id','reason'] else null end;
 if allowed is null or command-allowed<>'{}'::jsonb then raise exception 'Invalid command' using errcode='22023';end if;
 if c.paused then
  if op='claim' then return null;end if;
  raise exception 'Drafting is paused' using errcode='42501';
 end if;
 update public.draft_workers set last_seen_at=clock_timestamp() where id=w.id;
 if op='claim' then
  -- Pick one candidate without taking a job lock. Lock its item first below.
  select id into jid from public.draft_jobs where owner_id=w.owner_id and (status='queued' or (status='leased' and lease_expires_at<=clock_timestamp())) order by created_at,id limit 1;
  if jid is null then return null;end if;
 else jid:=(command->>'job_id')::uuid;end if;
 select q.item_id into iid from public.draft_jobs d join public.buyer_inquiries q on (q.id,q.owner_id)=(d.inquiry_id,d.owner_id) where d.id=jid and d.owner_id=w.owner_id;
 perform 1 from public.items where id=iid and owner_id=w.owner_id for update;
 select * into j from public.draft_jobs where id=jid and owner_id=w.owner_id for update;
 if j.id is null then raise exception 'Job unavailable' using errcode='P0002';end if;
 if w.expires_at<=clock_timestamp() then raise exception 'Worker unavailable' using errcode='42501';end if;
 if op='claim' and j.status='leased' and j.lease_expires_at<=clock_timestamp() then
  update public.draft_jobs set status='failed',reason='lease_expired',updated_at=clock_timestamp() where id=j.id;return null;
 end if;
 if op='submit' and j.status='completed' and j.worker_id=w.id and j.lease_id::text=command->>'lease_id' then
  select body,review_note into existing_body,existing_note from public.suggested_replies where id=j.reply_id and owner_id=w.owner_id;
  if existing_body is distinct from btrim(command->>'body') or existing_note is distinct from btrim(command->>'review_reason') then raise exception 'Conflicting result retry' using errcode='40001';end if;
  return jsonb_build_object('reply_id',j.reply_id);
 end if;
 if op<>'claim' and (j.status<>'leased' or j.worker_id is distinct from w.id or j.lease_id::text is distinct from command->>'lease_id' or j.lease_expires_at<=clock_timestamp()) then raise exception 'Lease unavailable' using errcode='40001';end if;
 if op='fail' then
  if command->>'reason' is null or command->>'reason' not in ('runtime_unverified','provider_unavailable','invalid_output','timeout') then raise exception 'Invalid failure reason' using errcode='22023';end if;
  update public.draft_jobs set status='failed',reason=command->>'reason',updated_at=clock_timestamp() where id=j.id;
  return jsonb_build_object('failed',true);
 end if;
 perform 1 from public.buyer_inquiries where id=j.inquiry_id and owner_id=w.owner_id for update;
 ctx:=public.draft_owned_context(w.owner_id,j.inquiry_id);
 if ctx is null or ctx is distinct from j.context_snapshot then
  if op='claim' then
   update public.draft_jobs set status='failed',reason='context_changed',updated_at=clock_timestamp() where id=j.id;return null;
  end if;
  raise exception 'Saved context changed' using errcode='40001';
 end if;
 if w.expires_at<=clock_timestamp() then raise exception 'Worker unavailable' using errcode='42501';end if;
 if op<>'claim' and j.lease_expires_at<=clock_timestamp() then raise exception 'Lease unavailable' using errcode='40001';end if;
 if op='claim' then
  update public.draft_jobs set status='leased',worker_id=w.id,lease_id=gen_random_uuid(),lease_expires_at=least(clock_timestamp()+interval '60 seconds',w.expires_at),updated_at=clock_timestamp() where id=j.id returning * into j;
  return jsonb_build_object('id',j.id,'lease_id',j.lease_id,'context',ctx,'status',j.status,'lease_expires_at',j.lease_expires_at);
 elsif op='context' then return ctx;
 elsif op='start' then
  if j.attempt_started then return jsonb_build_object('admitted',false);end if;
  insert into public.ai_usage(owner_id,usage_date,requests) values(w.owner_id,(clock_timestamp() at time zone 'Asia/Manila')::date,1)
   on conflict(owner_id,usage_date) do update set requests=public.ai_usage.requests+1 where public.ai_usage.requests<20 returning requests into accepted;
  if accepted is null then return jsonb_build_object('admitted',false);end if;
  update public.draft_jobs set attempt_started=true,updated_at=clock_timestamp() where id=j.id;
  -- Quota row contention may have consumed the remaining lease. Roll back the
  -- reservation and state change if admission is no longer valid.
  if w.expires_at<=clock_timestamp() then raise exception 'Worker unavailable' using errcode='42501';end if;
  if j.lease_expires_at<=clock_timestamp() then raise exception 'Lease unavailable' using errcode='40001';end if;
  return jsonb_build_object('admitted',true);
 end if;
 if not j.attempt_started then raise exception 'Attempt not admitted' using errcode='42501';end if;
 if jsonb_typeof(command->'body') is distinct from 'string' or char_length(btrim(command->>'body')) not between 1 and 2000 or jsonb_typeof(command->'review_reason') is distinct from 'string' or char_length(btrim(command->>'review_reason')) not between 1 and 500 then raise exception 'Invalid result' using errcode='22023';end if;
 insert into public.suggested_replies(owner_id,inquiry_id,body,source,context_snapshot,review_note) values(w.owner_id,j.inquiry_id,btrim(command->>'body'),'agent',ctx,btrim(command->>'review_reason')) returning id into rid;
 update public.draft_jobs set status='completed',reply_id=rid,updated_at=clock_timestamp() where id=j.id;
 if w.expires_at<=clock_timestamp() then raise exception 'Worker unavailable' using errcode='42501';end if;
 if j.lease_expires_at<=clock_timestamp() then raise exception 'Lease unavailable' using errcode='40001';end if;
 return jsonb_build_object('reply_id',rid);
end $$;
revoke all on function public.draft_owned_context(uuid,uuid),public.draft_queue(jsonb),public.draft_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.draft_queue(jsonb) to authenticated;
grant execute on function public.draft_worker(text,jsonb) to anon,authenticated;
commit;

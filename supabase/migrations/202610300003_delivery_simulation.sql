-- Owner-only durable fake-delivery lab. No live transport, anonymous/worker capability or release mode.
begin;
create table public.delivery_simulation_controls (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 paused boolean not null default true, revision bigint not null default 1
);
create table public.delivery_simulation_threads (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 item_id uuid not null, channel text not null check(channel in ('marketplace','carousell','groups')),
 surface text not null check(surface in ('dm','group_comment')),
 account_id text not null check(account_id ~ '^synthetic:.{1,150}$'),
 source_thread_id text not null check(source_thread_id ~ '^synthetic:.{1,150}$'),
 post_id text check(post_id ~ '^synthetic:.{1,150}$'),
 paused boolean not null default false, native boolean not null default false, takeover boolean not null default false,
 revision bigint not null default 1,
 foreign key(item_id,owner_id) references public.items(id,owner_id), unique(id,owner_id),
 unique(owner_id,channel,account_id,source_thread_id,surface),
 check((surface='group_comment' and channel='groups' and post_id is not null) or (surface='dm' and post_id is null))
);
create table public.delivery_simulation_sources (
 inquiry_id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null, message_id text not null check(message_id ~ '^synthetic:.{1,150}$'),
 comment_id text check(comment_id ~ '^synthetic:.{1,150}$'),
 source_revision text not null check(source_revision ~ '^[1-9][0-9]{0,39}$'),
 complete boolean not null, deleted boolean not null,
 observed_at timestamptz not null default clock_timestamp(),
 foreign key(inquiry_id,owner_id) references public.buyer_inquiries(id,owner_id),
 foreign key(thread_id,owner_id) references public.delivery_simulation_threads(id,owner_id),
 unique(owner_id,thread_id,message_id)
);
create table public.delivery_simulation_outbox (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 thread_id uuid not null, inquiry_id uuid not null, reply_id uuid not null,
 candidate jsonb not null,
 status text not null default 'pending' check(status in ('pending','claimed','submitted','confirmed','unknown','failed','canceled')),
 lease_id uuid, lease_expires_at timestamptz, submitted_at timestamptz,
 outcome_evidence jsonb, reason text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 foreign key(thread_id,owner_id) references public.delivery_simulation_threads(id,owner_id),
 foreign key(inquiry_id,owner_id) references public.buyer_inquiries(id,owner_id),
 foreign key(reply_id) references public.suggested_replies(id)
);
create unique index one_active_simulation_per_inquiry on public.delivery_simulation_outbox(inquiry_id) where status in ('pending','claimed','submitted','unknown');
create index simulation_owner_created on public.delivery_simulation_outbox(owner_id,created_at);
alter table public.delivery_simulation_controls enable row level security;
alter table public.delivery_simulation_threads enable row level security;
alter table public.delivery_simulation_sources enable row level security;
alter table public.delivery_simulation_outbox enable row level security;
create policy own_simulation_controls on public.delivery_simulation_controls for select to authenticated using(owner_id=(select auth.uid()));
create policy own_simulation_threads on public.delivery_simulation_threads for select to authenticated using(owner_id=(select auth.uid()));
create policy own_simulation_sources on public.delivery_simulation_sources for select to authenticated using(owner_id=(select auth.uid()));
create policy own_simulation_outbox on public.delivery_simulation_outbox for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.delivery_simulation_controls,public.delivery_simulation_threads,public.delivery_simulation_sources,public.delivery_simulation_outbox from public,anon,authenticated;
grant select on public.delivery_simulation_controls,public.delivery_simulation_threads,public.delivery_simulation_sources,public.delivery_simulation_outbox to authenticated;

-- Caller establishes owner, serializes owner controls, then locks item/inquiry/reply.
-- Content stays in the existing inbox; the immutable candidate is the audit copy.
create function public.delivery_simulation_candidate(who uuid,qid uuid,rid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('simulation',true,'inquiry_id',q.id,'reply_id',r.id,'reply_revision',r.revision::text,
 'context',public.buyer_context(q.id),'body',r.body,'source',r.source,'source_revision',s.source_revision,
 'thread_revision',t.revision::text,'control_revision',c.revision::text,
 'destination',jsonb_build_object('channel',t.channel,'surface',t.surface,'account_id',t.account_id,'thread_id',t.source_thread_id,'post_id',t.post_id,'comment_id',s.comment_id,'message_id',s.message_id))
 from public.buyer_inquiries q
 join public.suggested_replies r on r.inquiry_id=q.id and r.owner_id=q.owner_id
 join public.delivery_simulation_sources s on s.inquiry_id=q.id and s.owner_id=q.owner_id
 join public.delivery_simulation_threads t on t.id=s.thread_id and t.owner_id=q.owner_id
 join public.delivery_simulation_controls c on c.owner_id=q.owner_id
 where q.owner_id=who and q.id=qid and r.id=rid and q.status='Open' and r.status='Approved'
 and r.context_snapshot=public.buyer_context(q.id) and s.complete and not s.deleted
 and t.item_id=q.item_id and t.channel=q.channel and t.surface=q.surface
 and ((t.surface='dm' and s.comment_id is null) or (t.surface='group_comment' and s.comment_id is not null))
$$;
revoke all on function public.delivery_simulation_candidate(uuid,uuid,uuid) from public,anon,authenticated;

create function public.delivery_simulation(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 who uuid:=auth.uid(); op text:=command->>'op'; allowed text[]; field text;
 c public.delivery_simulation_controls; t public.delivery_simulation_threads; s public.delivery_simulation_sources;
 j public.delivery_simulation_outbox; q public.buyer_inquiries; r public.suggested_replies;
 ctx jsonb; iid uuid; qid uuid; rid uuid; tid uuid; evidence jsonb; outcome text; why text;
begin
 if who is null then raise exception 'Authentication required' using errcode='42501';end if;
 if command is null or jsonb_typeof(command)<>'object' or octet_length(command::text)>16384 then raise exception 'Invalid command' using errcode='22023';end if;
 allowed:=case op when 'state' then array['op'] when 'thread' then array['op','id','item_id','channel','surface','account_id','thread_id','post_id'] when 'source' then array['op','thread_id','inquiry_id','message_id','source_revision','complete','deleted','comment_id'] when 'enqueue' then array['op','id','inquiry_id','reply_id'] when 'control' then array['op','paused','expected_revision'] when 'threadControl' then array['op','id','paused','native','takeover','expected_revision','confirm_native_disabled'] when 'claim' then array['op','id'] when 'start' then array['op','id','lease_id'] when 'outcome' then array['op','id','lease_id','outcome','evidence'] when 'reconcile' then array['op','id','evidence'] else null end;
 if allowed is null or command-allowed<>'{}'::jsonb then raise exception 'Invalid simulation command' using errcode='22023';end if;
 foreach field in array allowed loop
  if field in ('post_id','comment_id','evidence','confirm_native_disabled') and not command?field then continue;end if;
  if jsonb_typeof(command->field) is distinct from (case when field in ('paused','native','takeover','complete','deleted','confirm_native_disabled') then 'boolean' when field='evidence' then 'object' else 'string' end) then raise exception 'Invalid simulation field type' using errcode='22023';end if;
 end loop;
 if command?'expected_revision' and command->>'expected_revision' !~ '^[1-9][0-9]{0,39}$' then raise exception 'Invalid revision' using errcode='22023';end if;

 insert into public.delivery_simulation_controls(owner_id) values(who) on conflict do nothing;
 select * into c from public.delivery_simulation_controls where owner_id=who for update;
 if op='state' then
  return jsonb_build_object('simulation',true,'paused',c.paused,'revision',c.revision::text,
   'threads',coalesce((select jsonb_agg((to_jsonb(x)-'owner_id')||jsonb_build_object('revision',x.revision::text) order by x.id) from public.delivery_simulation_threads x where x.owner_id=who),'[]'::jsonb),
   'jobs',coalesce((select jsonb_agg(x.entry order by x.stamp desc,x.id) from (select (to_jsonb(o)-'owner_id'-'lease_id')||jsonb_build_object('simulation',true) entry,o.created_at stamp,o.id from public.delivery_simulation_outbox o where o.owner_id=who order by o.created_at desc,o.id limit 100)x),'[]'::jsonb));
 elsif op='control' then
  if jsonb_typeof(command->'paused') is distinct from 'boolean' or command->>'expected_revision' is distinct from c.revision::text then raise exception 'Stale simulation controls' using errcode='40001';end if;
  update public.delivery_simulation_controls set paused=(command->>'paused')::boolean,revision=revision+1 where owner_id=who returning * into c;
  update public.delivery_simulation_outbox set status='canceled',reason='controls_changed',updated_at=clock_timestamp() where owner_id=who and status in ('pending','claimed');
  return jsonb_build_object('paused',c.paused,'revision',c.revision::text,'simulation',true);
 elsif op='threadControl' then
  foreach field in array array['paused','native','takeover'] loop
   if jsonb_typeof(command->field) is distinct from 'boolean' then raise exception 'Invalid thread controls' using errcode='22023';end if;
  end loop;
  select * into t from public.delivery_simulation_threads where id=(command->>'id')::uuid and owner_id=who for update;
  if t.id is null or command->>'expected_revision' is distinct from t.revision::text then raise exception 'Stale thread controls' using errcode='40001';end if;
  if t.native and not (command->>'native')::boolean and command->'confirm_native_disabled' is distinct from 'true'::jsonb then raise exception 'Confirm native mode is disabled' using errcode='22023';end if;
  update public.delivery_simulation_threads set paused=(command->>'paused')::boolean,native=(command->>'native')::boolean,takeover=(command->>'takeover')::boolean,revision=revision+1 where id=t.id and owner_id=who returning * into t;
  update public.delivery_simulation_outbox set status='canceled',reason='thread_changed',updated_at=clock_timestamp() where owner_id=who and thread_id=t.id and status in ('pending','claimed');
  return jsonb_build_object('id',t.id,'revision',t.revision::text,'simulation',true);
 elsif op='thread' then
  foreach field in array array['id','item_id','channel','surface','account_id','thread_id'] loop
   if jsonb_typeof(command->field) is distinct from 'string' then raise exception 'Invalid thread' using errcode='22023';end if;
  end loop;
  if command?'post_id' and jsonb_typeof(command->'post_id') is distinct from 'string' then raise exception 'Invalid post' using errcode='22023';end if;
  iid:=(command->>'item_id')::uuid;
  perform 1 from public.items where id=iid and owner_id=who for update;
  if not found then raise exception 'Record unavailable' using errcode='P0002';end if;
  select * into t from public.delivery_simulation_threads where id=(command->>'id')::uuid and owner_id=who;
  if t.id is null then
   if (select count(*) from public.delivery_simulation_threads where owner_id=who)>=200 then raise exception 'Simulation thread limit reached' using errcode='22023';end if;
   insert into public.delivery_simulation_threads(id,owner_id,item_id,channel,surface,account_id,source_thread_id,post_id)
   values((command->>'id')::uuid,who,iid,command->>'channel',command->>'surface',command->>'account_id',command->>'thread_id',command->>'post_id') returning * into t;
  elsif row(t.item_id,t.channel,t.surface,t.account_id,t.source_thread_id,t.post_id) is distinct from row(iid,command->>'channel',command->>'surface',command->>'account_id',command->>'thread_id',command->>'post_id') then raise exception 'Conflicting thread retry' using errcode='40001';end if;
  return jsonb_build_object('id',t.id,'revision',t.revision::text,'simulation',true);
 elsif op='source' then
  foreach field in array array['thread_id','inquiry_id','message_id','source_revision'] loop
   if jsonb_typeof(command->field) is distinct from 'string' then raise exception 'Invalid source' using errcode='22023';end if;
  end loop;
  if jsonb_typeof(command->'complete') is distinct from 'boolean' or jsonb_typeof(command->'deleted') is distinct from 'boolean' or (command?'comment_id' and jsonb_typeof(command->'comment_id') is distinct from 'string') then raise exception 'Invalid source flags' using errcode='22023';end if;
  qid:=(command->>'inquiry_id')::uuid;tid:=(command->>'thread_id')::uuid;
  select * into q from public.buyer_inquiries where id=qid and owner_id=who;
  select * into t from public.delivery_simulation_threads where id=tid and owner_id=who;
  if q.id is null or t.id is null or row(q.item_id,q.channel,q.surface) is distinct from row(t.item_id,t.channel,t.surface) then raise exception 'Matching owned inquiry required' using errcode='P0002';end if;
  if (t.surface='dm' and command?'comment_id') or (t.surface='group_comment' and not command?'comment_id') then raise exception 'Destination kind mismatch' using errcode='22023';end if;
  if command->>'source_revision' !~ '^[1-9][0-9]{0,39}$' then raise exception 'Invalid source revision' using errcode='22023';end if;
  select * into s from public.delivery_simulation_sources where inquiry_id=qid and owner_id=who;
  if s.inquiry_id is null then
   insert into public.delivery_simulation_sources(inquiry_id,owner_id,thread_id,message_id,source_revision,complete,deleted,comment_id) values(qid,who,tid,command->>'message_id',command->>'source_revision',(command->>'complete')::boolean,(command->>'deleted')::boolean,command->>'comment_id') returning * into s;
  elsif row(s.thread_id,s.message_id,s.comment_id) is distinct from row(tid,command->>'message_id',command->>'comment_id') or s.source_revision::numeric>(command->>'source_revision')::numeric then raise exception 'Conflicting source identity/revision' using errcode='40001';
  elsif s.source_revision=command->>'source_revision' then
   if row(s.complete,s.deleted) is distinct from row((command->>'complete')::boolean,(command->>'deleted')::boolean) then raise exception 'Conflicting source retry' using errcode='40001';end if;
  else
   update public.delivery_simulation_sources set source_revision=command->>'source_revision',complete=(command->>'complete')::boolean,deleted=(command->>'deleted')::boolean,observed_at=clock_timestamp() where inquiry_id=qid and owner_id=who returning * into s;
   update public.delivery_simulation_outbox set status='canceled',reason='source_changed',updated_at=clock_timestamp() where inquiry_id=qid and owner_id=who and status in ('pending','claimed');
  end if;
  return jsonb_build_object('inquiry_id',s.inquiry_id,'source_revision',s.source_revision,'simulation',true);
 end if;
 if op in ('claim','start','outcome','reconcile') then
  select * into j from public.delivery_simulation_outbox where id=(command->>'id')::uuid and owner_id=who;
  if j.id is null then
   if op='claim' then return null;end if;
   raise exception 'Simulation unavailable' using errcode='P0002';
  end if;
  select * into t from public.delivery_simulation_threads where id=j.thread_id and owner_id=who;
  if op in ('outcome','reconcile') then
   if op='outcome' and (command->>'lease_id' is null or command->>'lease_id' is distinct from j.lease_id::text) then raise exception 'Invalid simulation fence' using errcode='40001';end if;
   outcome:=case when op='reconcile' then 'confirmed' else command->>'outcome' end;
   if outcome is null or outcome not in ('submitted','confirmed','unknown','failed') then raise exception 'Invalid outcome' using errcode='22023';end if;
   if outcome='confirmed' then
    evidence:=command->'evidence';
    if evidence is null or jsonb_typeof(evidence)<>'object' or evidence-array['simulation_id','destination','external_id']<>'{}'::jsonb or evidence->>'simulation_id' is distinct from j.id::text or evidence->'destination' is distinct from j.candidate->'destination' or jsonb_typeof(evidence->'external_id') is distinct from 'string' or evidence->>'external_id' !~ '^synthetic:.{1,150}$' then raise exception 'Exact synthetic confirmation evidence required' using errcode='22023';end if;
   elsif command?'evidence' then raise exception 'Unexpected evidence' using errcode='22023';
   end if;
   if j.status in ('confirmed','failed') then
    if j.status=outcome and j.outcome_evidence is not distinct from evidence then return jsonb_build_object('id',j.id,'status',j.status,'simulation',true);end if;
    raise exception 'Simulation already terminal' using errcode='40001';
   end if;
   if j.status not in ('submitted','unknown') or (j.status='unknown' and outcome not in ('unknown','confirmed')) then raise exception 'No submitted simulation to resolve' using errcode='40001';end if;
   update public.delivery_simulation_outbox set status=outcome,outcome_evidence=evidence,updated_at=clock_timestamp() where id=j.id and owner_id=who returning * into j;
   return jsonb_build_object('id',j.id,'status',j.status,'simulation',true);
  end if;
  if j.status='submitted' and j.lease_expires_at<=clock_timestamp() then
   update public.delivery_simulation_outbox set status='unknown',reason='submission_acknowledgment_expired',updated_at=clock_timestamp() where id=j.id and owner_id=who;
   if op='claim' then return null;end if;
   -- No re-dispatch; separate reconciliation is required.
   return jsonb_build_object('id',j.id,'status','unknown','simulation',true);
  end if;
  if j.status='claimed' and j.lease_expires_at<=clock_timestamp() then
   update public.delivery_simulation_outbox set status='canceled',reason='claim_expired',updated_at=clock_timestamp() where id=j.id and owner_id=who;
   if op='claim' then return null;end if;
   return jsonb_build_object('id',j.id,'status','canceled','simulation',true);
  end if;
  if op='claim' and j.status<>'pending' then return null;end if;
  if op='start' and (j.status<>'claimed' or command->>'lease_id' is null or command->>'lease_id' is distinct from j.lease_id::text) then raise exception 'Simulation claim unavailable' using errcode='40001';end if;
  -- Consistent controls -> item -> inquiry -> reply -> outbox lock order.
  perform 1 from public.items where id=t.item_id and owner_id=who for update;
  select * into q from public.buyer_inquiries where id=j.inquiry_id and owner_id=who for update;
  select * into r from public.suggested_replies where id=j.reply_id and owner_id=who for update;
  ctx:=public.delivery_simulation_candidate(who,j.inquiry_id,j.reply_id);
  select * into s from public.delivery_simulation_sources where inquiry_id=j.inquiry_id and owner_id=who;
  why:=case
   when c.paused or t.paused then 'paused'
   when t.native then 'native_responder'
   when t.takeover then 'seller_takeover'
   when ctx is null or ctx is distinct from j.candidate then 'context_changed'
   when q.received_at>clock_timestamp() or q.received_at<clock_timestamp()-interval '24 hours' then 'stale_source'
   when exists(select 1 from public.delivery_simulation_outbox x where x.owner_id=who and x.thread_id=j.thread_id and x.id<>j.id and x.status in ('claimed','submitted','unknown')) then 'thread_busy_or_unknown'
   when exists(select 1 from public.delivery_simulation_sources x join public.buyer_inquiries iq on iq.id=x.inquiry_id and iq.owner_id=x.owner_id where x.owner_id=who and x.thread_id=j.thread_id and x.inquiry_id<>j.inquiry_id and iq.received_at>=q.received_at) then 'newer_question'
   when t.surface='group_comment' and (r.source<>'template' or r.body is distinct from 'The asking price is PHP '||to_char((ctx#>>'{context,item,price}')::numeric,'FM99999990.00')||'.') then 'public_text_not_allowed'
   when r.source='template' and (select count(*) from public.delivery_simulation_outbox x where x.owner_id=who and x.thread_id=j.thread_id and x.candidate->>'source'='template' and x.submitted_at>clock_timestamp()-interval '1 hour')>=3 then 'template_limit'
   else null end;
  if why is not null then
   update public.delivery_simulation_outbox set status='canceled',reason=why,updated_at=clock_timestamp() where id=j.id and owner_id=who;
   if op='claim' then return null;end if;
   return jsonb_build_object('id',j.id,'status','canceled','simulation',true);
  end if;
  if greatest(q.received_at,s.observed_at)>clock_timestamp()-interval '15 seconds' then
   if op='claim' then return null;end if;
   raise exception 'Simulation debounce not complete' using errcode='22023';
  end if;
  if op='claim' then
   update public.delivery_simulation_outbox set status='claimed',lease_id=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() where id=j.id and owner_id=who returning * into j;
   return jsonb_build_object('id',j.id,'lease_id',j.lease_id,'status',j.status,'candidate',j.candidate,'simulation',true);
  end if;
  update public.delivery_simulation_outbox set status='submitted',submitted_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id and owner_id=who returning * into j;
  return jsonb_build_object('id',j.id,'status',j.status,'candidate',j.candidate,'simulation',true);
 end if;
 -- Enqueue a separately requested simulation, never permission for real delivery.
 qid:=(command->>'inquiry_id')::uuid;rid:=(command->>'reply_id')::uuid;
 select item_id into iid from public.buyer_inquiries where id=qid and owner_id=who;
 perform 1 from public.items where id=iid and owner_id=who for update;
 perform 1 from public.buyer_inquiries where id=qid and owner_id=who for update;
 perform 1 from public.suggested_replies where id=rid and inquiry_id=qid and owner_id=who for update;
 ctx:=public.delivery_simulation_candidate(who,qid,rid);
 if ctx is null then raise exception 'Current approved reply and complete matching source required' using errcode='P0002';end if;
 select * into j from public.delivery_simulation_outbox where id=(command->>'id')::uuid and owner_id=who;
 if j.id is not null then
  if j.inquiry_id<>qid or j.reply_id<>rid or j.candidate is distinct from ctx then raise exception 'Conflicting simulation retry' using errcode='40001';end if;
 else
  if exists(select 1 from public.delivery_simulation_outbox x where x.owner_id=who and x.inquiry_id=qid and x.status='confirmed' and x.candidate->>'source_revision'=ctx->>'source_revision') then raise exception 'Source already simulated' using errcode='40001';end if;
  if (select count(*) from public.delivery_simulation_outbox where owner_id=who and status in ('pending','claimed','submitted','unknown'))>=100 then raise exception 'Simulation queue full' using errcode='22023';end if;
  select thread_id into tid from public.delivery_simulation_sources where inquiry_id=qid and owner_id=who;
  insert into public.delivery_simulation_outbox(id,owner_id,thread_id,inquiry_id,reply_id,candidate) values((command->>'id')::uuid,who,tid,qid,rid,ctx) returning * into j;
 end if;
 return jsonb_build_object('id',j.id,'status',j.status,'simulation',true);
end $$;
revoke all on function public.delivery_simulation(jsonb) from public,anon;
grant execute on function public.delivery_simulation(jsonb) to authenticated;
commit;

-- One owner control races an already-leased anonymous worker request.
-- Run only against this run's synthetic fixture. Choose one literal scenario:
-- pause, revoke, edit, quota. Start the delayed HTTP peer first.
begin;
set local statement_timeout='20s';
set local lock_timeout='15s';
set local application_name='reseller-acceptance-held-owner';
set local request.jwt.claim.sub='__OWNER_ID__';
set local request.jwt.claims='{"sub":"__OWNER_ID__","role":"authenticated"}';
set local role authenticated;
do $owner$
declare state jsonb; result jsonb;
begin
  perform set_config('reseller.acceptance_started',clock_timestamp()::text,true);
  case '__SCENARIO__'
    when 'pause' then
      state:=public.draft_queue('{"op":"list"}');
      result:=public.draft_queue(jsonb_build_object('op','pause','paused',true,'expected_revision',state->>'revision'));
    when 'revoke' then
      result:=public.draft_queue(jsonb_build_object('op','revoke','id','__WORKER_ID__'));
    when 'edit' then
      update public.items set price=900 where id='__ITEM_ID__'::uuid and owner_id=auth.uid();
      if not found then raise exception 'Synthetic item missing';end if;
      result:='{"changed":true}';
    when 'quota' then
      if public.reserve_ai_generation() is distinct from true then raise exception 'Last slot was not reserved';end if;
      result:='{"last_slot_reserved":true}';
    else raise exception 'Unknown acceptance scenario';
  end case;
  perform set_config('reseller.acceptance_result',result::text,true);
end $owner$;
reset role;
do $observe$
declare observed jsonb;
begin
  for n in 1..6 loop
    perform pg_sleep(1);
    perform pg_stat_clear_snapshot();
    select coalesce(jsonb_agg(jsonb_build_object('pid',pid,'wait_event_type',wait_event_type,
      'blocked_by',pg_blocking_pids(pid))),'[]'::jsonb) into observed
      from pg_stat_activity
      where datname=current_database() and pid<>pg_backend_pid()
        and pg_backend_pid()=any(pg_blocking_pids(pid));
    exit when jsonb_array_length(observed)>0;
  end loop;
  perform set_config('reseller.acceptance_observed',observed::text,true);
  perform pg_sleep(2);
end $observe$;
select pg_backend_pid() as pid,
  current_setting('reseller.acceptance_started') as started_at,
  clock_timestamp() as finished_at,
  current_setting('reseller.acceptance_observed')::jsonb as blocked_sessions,
  current_setting('reseller.acceptance_result')::jsonb as result;
commit;

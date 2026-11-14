-- Run this SQL session concurrently with ONE HTTP draft_worker RPC.
-- Start http-peer.mjs --delayed and confirm its live process/ready output,
-- then immediately run this SQL. The peer sends after 6 seconds. Verify that
-- a blocking PID is observed, not just that both calls eventually return.
-- Substitute validated runtime-only values; never save a filled copy.
begin;
set local statement_timeout='20s';
set local lock_timeout='15s';
set local application_name='reseller-acceptance-held';
set local request.jwt.claim.sub='';
set local request.jwt.claims='{"role":"anon"}';
set local role anon;
do $session$
begin
  perform set_config('reseller.acceptance_started',clock_timestamp()::text,true);
  perform set_config('reseller.acceptance_result',
    coalesce(public.draft_worker('__WORKER_TOKEN__','__COMMAND_JSON__'::jsonb)::text,'null'),true);
end $session$;
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

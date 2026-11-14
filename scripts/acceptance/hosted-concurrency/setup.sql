-- Operator-run acceptance fixture, NOT a migration. Commit is necessary for
-- independent sessions to see the same rows. Always run cleanup.sql afterward.
-- Substitute a fresh UUID for __OWNER_ID__ and retain it privately BEFORE
-- executing: cleanup must remain possible after a lost setup response.
-- No email/password/identity/session is created. Return capabilities only to
-- private operator memory; never put the result in logs, Git or a PR.
begin;
set local statement_timeout='15s';
create temporary table reseller_acceptance_result (data jsonb) on commit drop;
do $fixture$
declare
  who uuid:='__OWNER_ID__'::uuid; iid uuid:=gen_random_uuid();
  qid uuid:=gen_random_uuid(); jid uuid:=gen_random_uuid();
  a jsonb; b jsonb; state jsonb;
begin
  insert into auth.users(id,raw_app_meta_data)
    values(who,'{"reseller_acceptance":"hosted-concurrency"}');
  perform set_config('request.jwt.claim.sub',who::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.items(id,title,price,condition,category,status)
    values(iid,'TEST — synthetic concurrency acceptance lamp',850,'Good','Other','Listed');
  perform public.buyer_workspace(jsonb_build_object('op','saveInquiry','expected_revision',null,
    'input',jsonb_build_object('id',qid,'item_id',iid,'channel','marketplace','surface','dm',
    'buyer_name','','message','What is the price?','received_at','2026-11-03T00:00:00Z')));
  a:=public.draft_queue('{"op":"enroll","label":"Synthetic concurrency A"}');
  b:=public.draft_queue('{"op":"enroll","label":"Synthetic concurrency B"}');
  state:=public.draft_queue('{"op":"list"}');
  perform public.draft_queue(jsonb_build_object('op','pause','paused',false,'expected_revision',state->>'revision'));
  perform public.draft_queue(jsonb_build_object('op','enqueue','id',jid,'inquiry_id',qid));
  reset role;
  -- Reduce accidental leftover capability lifetime for this fixture only.
  update public.draft_workers set expires_at=clock_timestamp()+interval '5 minutes' where owner_id=who;
  insert into reseller_acceptance_result values(jsonb_build_object('owner_id',who,'item_id',iid,
    'inquiry_id',qid,'job_id',jid,'worker_a',a,'worker_b',b));
end $fixture$;
select data from reseller_acceptance_result;
commit;

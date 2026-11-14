-- Execute this entire file as ONE transaction in the dedicated project.
-- Synthetic fixtures and capabilities never escape the transaction; always rolls back.
-- Exercises actual PostgreSQL roles, not HTTP sessions, concurrent sessions or AI.
begin;
set local statement_timeout = '20s';
do $acceptance$
declare
  owner_a uuid := gen_random_uuid(); owner_b uuid := gen_random_uuid();
  item_id uuid := gen_random_uuid(); inquiry_id uuid := gen_random_uuid();
  token_a text; token_other text; worker_id uuid;
  state jsonb; claim jsonb; command jsonb; result jsonb; prefs jsonb;
  rejected boolean; n integer;
begin
  insert into auth.users(id) values(owner_a),(owner_b);
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.items(id,title,price,condition,category,status)
    values(item_id,'Synthetic draft acceptance lamp',850,'Good','Other','Listed');
  perform public.buyer_workspace(jsonb_build_object('op','saveInquiry','expected_revision',null,
    'input',jsonb_build_object('id',inquiry_id,'item_id',item_id,'channel','marketplace',
    'surface','dm','buyer_name','','message','What is the price?','received_at','2026-11-02T00:00:00Z')));
  state := public.draft_queue('{"op":"enroll","label":"Synthetic acceptance"}');
  token_a := state->>'token'; worker_id := (state->>'id')::uuid;
  token_other := public.draft_queue('{"op":"enroll","label":"Synthetic other worker"}')->>'token';
  state := public.draft_queue('{"op":"list"}');
  if (state->>'paused')::boolean is distinct from true or state::text like '%'||token_a||'%'
    or state::text like '%token_hash%' then raise exception 'Unsafe enrollment state'; end if;
  perform public.draft_queue(jsonb_build_object('op','enqueue','id',gen_random_uuid(),'inquiry_id',inquiry_id));

  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  if public.draft_worker(token_a,'{"op":"claim"}') is not null then raise exception 'Paused queue admitted work'; end if;
  rejected := false;
  begin perform public.draft_queue('{"op":"list"}'); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anonymous queue control accepted'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated')::text,true);
  set local role authenticated;
  state := public.draft_queue('{"op":"list"}');
  if state->'jobs' is distinct from '[]'::jsonb or state->'workers' is distinct from '[]'::jsonb then raise exception 'Cross-owner queue leak'; end if;
  rejected := false;
  begin perform public.draft_queue(jsonb_build_object('op','enqueue','id',gen_random_uuid(),'inquiry_id',inquiry_id)); exception when no_data_found then rejected := true; end;
  if not rejected then raise exception 'Cross-owner enqueue accepted'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  state := public.draft_queue('{"op":"list"}');
  perform public.draft_queue(jsonb_build_object('op','pause','paused',false,'expected_revision',state->>'revision'));
  perform public.reserve_ai_generation(); -- Listing and worker share the same allowance.
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  claim := public.draft_worker(token_a,'{"op":"claim"}');
  if claim->>'status' is distinct from 'leased' then raise exception 'No owned lease'; end if;
  if public.draft_worker(token_a,'{"op":"claim"}') is not null then raise exception 'Duplicate claim'; end if;
  command := jsonb_build_object('job_id',claim->>'id','lease_id',claim->>'lease_id');
  rejected := false;
  begin perform public.draft_worker(token_other,command||'{"op":"context"}'); exception when sqlstate 'PT409' then rejected := true; end;
  if not rejected then raise exception 'Other worker acquired lease'; end if;
  if public.draft_worker(token_a,command||'{"op":"start"}') is distinct from '{"admitted":true}'::jsonb then raise exception 'No admission'; end if;
  if public.draft_worker(token_a,command||'{"op":"start"}') is distinct from '{"admitted":false}'::jsonb then raise exception 'Duplicate admission'; end if;
  command := command||'{"op":"submit","body":"The asking price is PHP 850.","review_reason":"Synthetic acceptance; review before use."}';
  result := public.draft_worker(token_a,command);
  if public.draft_worker(token_a,command) is distinct from result then raise exception 'Result retry not idempotent'; end if;
  rejected := false;
  begin perform public.draft_worker(token_a,command||'{"body":"Different result"}'); exception when sqlstate 'PT409' then rejected := true; end;
  if not rejected then raise exception 'Conflicting result accepted'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  if not exists(select 1 from public.suggested_replies where id=(result->>'reply_id')::uuid and status='Draft' and source='agent') then raise exception 'Result is not an unapproved agent Draft'; end if;
  if not exists(select 1 from public.buyer_inquiries where id=inquiry_id and status='Open') then raise exception 'Draft changed inquiry status'; end if;
  select requests into n from public.ai_usage where owner_id=owner_a and usage_date=(clock_timestamp() at time zone 'Asia/Manila')::date;
  if n is distinct from 2 then raise exception 'Shared allowance mismatch'; end if;
  perform public.draft_queue(jsonb_build_object('op','enqueue','id',gen_random_uuid(),'inquiry_id',inquiry_id));
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  claim := public.draft_worker(token_a,'{"op":"claim"}');
  command := jsonb_build_object('job_id',claim->>'id','lease_id',claim->>'lease_id');
  if public.draft_worker(token_a,command||'{"op":"start"}') is distinct from '{"admitted":true}'::jsonb then raise exception 'Stale-case admission failed'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  prefs := public.seller_workspace('{"op":"get"}');
  perform public.seller_workspace(jsonb_build_object('op','save','expected_revision',prefs#>>'{preferences,revision}',
    'input',jsonb_build_object('pickup_area','Synthetic changed area','delivery_notes','','payment_notes','','digest_enabled',false,'digest_time','09:00')));
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  rejected := false;
  begin perform public.draft_worker(token_a,command||'{"op":"submit","body":"Stale answer","review_reason":"Synthetic"}'); exception when sqlstate 'PT409' then rejected := true; end;
  if not rejected then raise exception 'Changed seller terms accepted stale result'; end if;

  reset role;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  state := public.draft_queue('{"op":"list"}');
  perform public.draft_queue(jsonb_build_object('op','pause','paused',true,'expected_revision',state->>'revision'));
  state := public.draft_queue('{"op":"list"}');
  if not exists(select 1 from jsonb_array_elements(state->'jobs') j where j->>'id'=claim->>'id' and j->>'status'='canceled') then raise exception 'Pause did not cancel pending work'; end if;
  perform public.draft_queue(jsonb_build_object('op','pause','paused',false,'expected_revision',state->>'revision'));
  for n in 1..17 loop perform public.reserve_ai_generation(); end loop;
  perform public.draft_queue(jsonb_build_object('op','enqueue','id',gen_random_uuid(),'inquiry_id',inquiry_id));
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  claim := public.draft_worker(token_a,'{"op":"claim"}');
  command := jsonb_build_object('job_id',claim->>'id','lease_id',claim->>'lease_id');
  if public.draft_worker(token_a,command||'{"op":"start"}') is distinct from '{"admitted":false}'::jsonb then raise exception 'Exhausted allowance admitted work'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.draft_queue(jsonb_build_object('op','revoke','id',worker_id));
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  set local role anon;
  rejected := false;
  begin perform public.draft_worker(token_a,'{"op":"claim"}'); exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Revoked capability accepted'; end if;
  reset role;
end $acceptance$;
rollback;
select 'passed: paused/owned queue; scoped lease; single admission; shared quota; draft-only idempotent result; stale terms; pause and revocation; all fixtures rolled back' as acceptance;

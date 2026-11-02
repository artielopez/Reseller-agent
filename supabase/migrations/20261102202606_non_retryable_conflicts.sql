-- Business conflicts require caller review, not transaction replay.
-- PostgREST 14 retries 40001 indefinitely; PT409 returns HTTP 409 instead.
-- Preserve applied migrations and each function's current body/owner/ACL/config:
-- change only explicit custom errcode assignments in these named application RPCs.
begin;
do $migration$
declare
  signature text; target regprocedure; definition text; updated text;
begin
  foreach signature in array array[
    'public.buyer_workspace(jsonb)',
    'public.draft_queue(jsonb)',
    'public.draft_worker(text,jsonb)',
    'public.seller_workspace(jsonb)',
    'public.delivery_simulation(jsonb)'
  ] loop
    target:=to_regprocedure(signature);
    if target is null then
      if signature='public.delivery_simulation(jsonb)' then continue;end if;
      raise exception 'Required application RPC is missing: %',signature;
    end if;
    select pg_get_functiondef(target) into definition;
    updated:=regexp_replace(definition,'errcode\s*=\s*''40001''','errcode=''PT409''','gi');
    if updated=definition and position('''PT409''' in definition)=0 then
      raise exception 'Expected conflict guard not found: %',signature;
    end if;
    if updated<>definition then execute updated;end if;
  end loop;
end $migration$;
commit;

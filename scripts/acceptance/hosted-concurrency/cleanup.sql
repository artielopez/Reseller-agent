-- Substitute ONLY the UUID returned by this run's setup. This deletes that
-- synthetic owner and cascaded fixture rows, never real app users or their data.
begin;
set local statement_timeout='15s';
do $cleanup$
declare removed integer;
begin
  delete from auth.users u where u.id='__OWNER_ID__'::uuid
    and u.raw_app_meta_data->>'reseller_acceptance'='hosted-concurrency'
    and u.email is null
    and not exists(select 1 from auth.identities i where i.user_id=u.id)
    and not exists(select 1 from auth.sessions s where s.user_id=u.id);
  get diagnostics removed=row_count;
  if removed<>1 then raise exception 'Fixture cleanup guard failed';end if;
end $cleanup$;
commit;
select
  (select count(*) from auth.users where id='__OWNER_ID__'::uuid) as users,
  (select count(*) from public.items where owner_id='__OWNER_ID__'::uuid) as items,
  (select count(*) from public.buyer_inquiries where owner_id='__OWNER_ID__'::uuid) as inquiries,
  (select count(*) from public.suggested_replies where owner_id='__OWNER_ID__'::uuid) as replies,
  (select count(*) from public.draft_controls where owner_id='__OWNER_ID__'::uuid) as controls,
  (select count(*) from public.draft_workers where owner_id='__OWNER_ID__'::uuid) as workers,
  (select count(*) from public.draft_jobs where owner_id='__OWNER_ID__'::uuid) as jobs,
  (select count(*) from public.ai_usage where owner_id='__OWNER_ID__'::uuid) as usage,
  (select count(*) from public.seller_preferences where owner_id='__OWNER_ID__'::uuid) as preferences;

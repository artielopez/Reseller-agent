-- Run as one transaction on the dedicated project after inventory_save_revision.
-- Synthetic owners only; no real sessions or Storage objects. Always rolls back.
begin;
set local statement_timeout='20s';
do $acceptance$
declare
  owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
  fixture_item uuid:=gen_random_uuid(); photo_id uuid:=gen_random_uuid();
  payload jsonb; initial jsonb; latest jsonb; rejected boolean;
begin
  insert into auth.users(id,aud,role) values(owner_a,'authenticated','authenticated'),(owner_b,'authenticated','authenticated');
  perform set_config('request.jwt.claim.sub',owner_a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
  set local role authenticated;
  payload:=jsonb_build_object('id',fixture_item,'title','Synthetic inventory revision acceptance','description','Rollback-only fixture','price',900,'category','Other','condition','Good','status','Draft','photos','[]'::jsonb,'listings',(select jsonb_agg(jsonb_build_object('channel',c,'title','Test lamp','description','Synthetic','status','Not posted','url','')) from unnest(array['carousell','marketplace','groups']) c));
  initial:=public.save_inventory_item_checked(payload);
  if initial->>'saveRevision' is null or initial->>'updatedAt' is null or initial->>'replyContextRevision' is null then raise exception 'Incomplete save receipt';end if;
  latest:=public.save_inventory_item_checked(payload||initial||jsonb_build_object('photos',jsonb_build_array(jsonb_build_object('id',photo_id,'path',owner_a||'/'||fixture_item||'/'||photo_id||'.jpg'))));
  if latest->>'saveRevision'=initial->>'saveRevision' or latest->>'replyContextRevision'<>initial->>'replyContextRevision' then raise exception 'Photo-only revisions incorrect';end if;
  rejected:=false;
  begin perform public.save_inventory_item_checked(payload||initial||'{"price":1}'::jsonb);exception when sqlstate 'PT409' then rejected:=true;end;
  if not rejected then raise exception 'Stale save allowed';end if;
  rejected:=false;
  begin perform public.save_inventory_item(payload);exception when sqlstate 'PT409' then rejected:=true;end;
  if not rejected then raise exception 'Legacy overwrite allowed';end if;
  if (select price from public.items where id=fixture_item)<>900 or (select count(*) from public.item_photos where item_id=fixture_item)<>1 then raise exception 'Saved state changed';end if;
  perform set_config('request.jwt.claim.sub',owner_b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated')::text,true);
  rejected:=false;
  begin perform public.save_inventory_item_checked(payload||latest);exception when sqlstate 'PT409' then rejected:=true;end;
  if not rejected or exists(select 1 from public.items where id=fixture_item) then raise exception 'Cross-owner access allowed';end if;
  reset role;
end $acceptance$;
select 'passed: receipt, photo-only token, stale/legacy rejection, photo retention, cross-owner isolation' as result;
rollback;

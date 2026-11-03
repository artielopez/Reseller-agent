-- Read-only, owner-scoped counts. This does not activate a retention policy.
begin;
create function public.workspace_privacy_preview(window_days integer default 30)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 who uuid := auth.uid();
 checked timestamptz := statement_timestamp();
 cutoff timestamptz;
 result jsonb;
begin
 if who is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if window_days is null or window_days not in (30,90,180) then
  raise exception 'Choose a supported preview window' using errcode='22023';
 end if;
 cutoff := checked - make_interval(days => window_days);
 with history as (
  select q.id from public.buyer_inquiries q
  where q.owner_id=who and q.status in ('Answered','Closed') and q.updated_at < cutoff
   and not exists (select 1 from public.suggested_replies r where r.owner_id=who and r.inquiry_id=q.id and r.updated_at >= cutoff)
   and not exists (select 1 from public.draft_jobs j where j.owner_id=who and j.inquiry_id=q.id and (j.status in ('queued','leased') or j.updated_at >= cutoff))
 ), owned_objects as (
  select o.name,o.created_at from storage.objects o
  where o.bucket_id='item-photos' and (storage.foldername(o.name))[1]=who::text
 )
 select jsonb_build_object(
  'as_of',checked,'window_days',window_days,'cutoff',cutoff,
  'items',(select count(*) from public.items i where i.owner_id=who),
  'photo_references',(select count(*) from public.item_photos p where p.owner_id=who),
  'photo_objects',(select count(*) from owned_objects),
  'questions',(select count(*) from public.buyer_inquiries q where q.owner_id=who),
  'replies',(select count(*) from public.suggested_replies r where r.owner_id=who),
  'history_candidates',(select count(*) from history),
  'history_candidate_replies',(select count(*) from public.suggested_replies r join history h on h.id=r.inquiry_id where r.owner_id=who),
  'unlinked_photo_candidates',(select count(*) from owned_objects o
    where o.created_at < checked - interval '24 hours'
    and not exists (select 1 from public.item_photos p where p.owner_id=who and p.path=o.name))
 ) into result;
 return result;
end;
$$;
revoke all on function public.workspace_privacy_preview(integer) from public,anon,authenticated;
grant execute on function public.workspace_privacy_preview(integer) to authenticated;
comment on function public.workspace_privacy_preview(integer) is 'Read-only privacy preview; candidates are not deletion authorization. Storage is queried only, never modified.';
commit;

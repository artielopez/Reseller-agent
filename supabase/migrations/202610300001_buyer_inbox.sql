-- Manual reviewed inbox foundation. No connector, worker credential or sending endpoint.
begin;
alter table public.items add column reply_context_revision bigint not null default 1;
alter table public.buyer_inquiries add column revision bigint not null default 1,
 add column updated_at timestamptz not null default now(),
 add column surface text not null default 'dm' check(surface in ('dm','group_comment')),
 add constraint inquiry_public_channel check(surface <> 'group_comment' or channel='groups');
update public.buyer_inquiries set buyer_name='' where buyer_name is null;
alter table public.buyer_inquiries alter column buyer_name set default '', alter column buyer_name set not null;
alter table public.suggested_replies add column revision bigint not null default 1,
 add column source text not null default 'manual' check(source in ('manual','template')),
 add column context_snapshot jsonb,
 add column approved_at timestamptz,
 add column updated_at timestamptz not null default now();

create function public.buyer_context(qid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('inquiry_id',q.id,'inquiry_revision',q.revision::text,'item_revision',i.reply_context_revision::text,
 'channel',q.channel,'surface',q.surface,'message',q.message,
 'item',jsonb_build_object('id',i.id,'title',i.title,'description',i.description,'price',i.price,'condition',i.condition,'category',i.category,'status',i.status))
 from public.buyer_inquiries q join public.items i on (i.id,i.owner_id)=(q.item_id,q.owner_id)
 where q.id=qid and q.owner_id=auth.uid()
$$;
-- Preserve legacy text, but never trust a legacy approval with no context snapshot.
update public.suggested_replies set status=case when status='Approved' then 'Draft' else status end,approved_at=null;
-- Legacy snapshots deliberately remain null: a fresh draft must be created after review.

create function public.buyer_item_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then new.reply_context_revision:=1; return new; end if;
 new.reply_context_revision:=old.reply_context_revision;
 if row(new.title,new.description,new.price,new.condition,new.category,new.status) is distinct from row(old.title,old.description,old.price,old.condition,old.category,old.status) then
  new.reply_context_revision:=old.reply_context_revision+1;
  update public.suggested_replies r set status='Draft',approved_at=null,revision=r.revision+1,updated_at=now()
  where r.owner_id=old.owner_id and r.status='Approved' and exists(select 1 from public.buyer_inquiries q where q.id=r.inquiry_id and q.owner_id=old.owner_id and q.item_id=old.id);
 end if;
 return new;
end $$;
create trigger buyer_item_revision before insert or update on public.items for each row execute function public.buyer_item_changed();
create function public.buyer_inquiry_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.revision:=old.revision+1;new.updated_at:=now();
 update public.suggested_replies set status='Draft',approved_at=null,revision=revision+1,updated_at=now() where inquiry_id=old.id and owner_id=old.owner_id and status='Approved';
 return new;
end $$;
create trigger buyer_inquiry_revision before update on public.buyer_inquiries for each row execute function public.buyer_inquiry_changed();

create function public.buyer_thread(qid uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('inquiry',(to_jsonb(q)-'owner_id')||jsonb_build_object('revision',q.revision::text),'context',public.buyer_context(q.id),'replies',coalesce((select jsonb_agg((to_jsonb(r)-'owner_id'-'context_snapshot')||jsonb_build_object('revision',r.revision::text,'context',r.context_snapshot) order by r.created_at desc,r.id) from public.suggested_replies r where r.inquiry_id=q.id and r.owner_id=auth.uid()),'[]'::jsonb))
 from public.buyer_inquiries q where q.id=qid and q.owner_id=auth.uid()
$$;

create function public.buyer_workspace(command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 who uuid:=auth.uid(); op text:=command->>'op'; data jsonb:=command->'input';
 qid uuid;iid uuid;rid uuid; q public.buyer_inquiries; r public.suggested_replies;
 ctx jsonb; expected text:=command->>'expected_revision'; stamp timestamptz;
 allowed text[]; field text;
begin
 if who is null then raise exception 'Authentication required' using errcode='42501';end if;
 if command is null or jsonb_typeof(command)<>'object' or octet_length(command::text)>16384 then raise exception 'Invalid payload' using errcode='22023';end if;
 allowed:=case op when 'list' then array['op'] when 'get' then array['op','id'] when 'saveInquiry' then array['op','input','expected_revision'] when 'draft' then array['op','id','inquiry_id','body','source','context'] when 'edit' then array['op','id','body','expected_revision'] when 'approve' then array['op','id','expected_revision','context'] when 'copy' then array['op','id','expected_revision'] when 'status' then array['op','id','status','expected_revision'] else null end;
 if allowed is null or command-allowed<>'{}'::jsonb then raise exception 'Invalid command' using errcode='22023';end if;
 if op='list' then
  return coalesce((select jsonb_agg(x.entry order by x.stamp desc,x.id) from (select (to_jsonb(b)-'owner_id')||jsonb_build_object('revision',b.revision::text) entry,b.updated_at stamp,b.id from public.buyer_inquiries b where b.owner_id=who order by b.updated_at desc,b.id limit 200) x),'[]'::jsonb);
 end if;
 if op='saveInquiry' then
  if data is null or jsonb_typeof(data)<>'object' or data-array['id','item_id','channel','surface','buyer_name','message','received_at']<>'{}'::jsonb then raise exception 'Invalid inquiry' using errcode='22023';end if;
  if data->>'channel' is null or data->>'channel' not in ('carousell','marketplace','groups') or data->>'surface' is null or data->>'surface' not in ('dm','group_comment') or (data->>'surface'='group_comment' and data->>'channel'<>'groups') or coalesce(char_length(btrim(data->>'message')),0) not between 1 and 10000 or char_length(coalesce(data->>'buyer_name',''))>200 then raise exception 'Invalid inquiry' using errcode='22023';end if;
  foreach field in array array['id','item_id','channel','surface','buyer_name','message','received_at'] loop
   if jsonb_typeof(data->field) is distinct from 'string' then raise exception 'Invalid inquiry field' using errcode='22023';end if;
  end loop;
  if data->>'received_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Use an ISO timestamp with timezone' using errcode='22023';end if;
  stamp:=(data->>'received_at')::timestamptz;
  if stamp is null or not isfinite(stamp) then raise exception 'Invalid time' using errcode='22023';end if;
  qid:=(data->>'id')::uuid;iid:=(data->>'item_id')::uuid;
 elsif op in ('get','status') then qid:=(command->>'id')::uuid;
 elsif op='draft' then qid:=(command->>'inquiry_id')::uuid;rid:=(command->>'id')::uuid;
 else
  rid:=(command->>'id')::uuid;select inquiry_id into qid from public.suggested_replies where id=rid and owner_id=who;
 end if;
 if iid is null then select item_id into iid from public.buyer_inquiries where id=qid and owner_id=who;end if;
 -- All mutation/read-copy paths take locks in this order, also respected by item invalidation.
 perform 1 from public.items where id=iid and owner_id=who for update;
 if not found or qid is null then raise exception 'Record unavailable' using errcode='P0002';end if;
 select * into q from public.buyer_inquiries where id=qid and owner_id=who for update;
 if op='saveInquiry' then
  if q.id is null then
   if expected is not null then raise exception 'Record unavailable' using errcode='P0002';end if;
   insert into public.buyer_inquiries(id,owner_id,item_id,channel,surface,buyer_name,message,received_at) values(qid,who,iid,data->>'channel',data->>'surface',coalesce(data->>'buyer_name',''),btrim(data->>'message'),stamp);
  elsif q.item_id<>iid then raise exception 'Cannot move inquiry to another item' using errcode='22023';
  elsif expected is null then
   if row(q.channel,q.surface,coalesce(q.buyer_name,''),q.message,q.received_at) is distinct from row(data->>'channel',data->>'surface',coalesce(data->>'buyer_name',''),btrim(data->>'message'),stamp) then raise exception 'Conflicting retry' using errcode='40001';end if;
  else
   if expected<>q.revision::text then raise exception 'Stale inquiry' using errcode='40001';end if;
   update public.buyer_inquiries set channel=data->>'channel',surface=data->>'surface',buyer_name=coalesce(data->>'buyer_name',''),message=btrim(data->>'message'),received_at=stamp where id=qid and owner_id=who;
  end if;
  return public.buyer_thread(qid);
 end if;
 if q.id is null then raise exception 'Record unavailable' using errcode='P0002';end if;
 if op='get' then return public.buyer_thread(qid);end if;
 if op='status' then
  if expected is null or expected<>q.revision::text then raise exception 'Stale inquiry' using errcode='40001';end if;
  if command->>'status' is null or command->>'status' not in ('Open','Answered','Closed') then raise exception 'Invalid status' using errcode='22023';end if;
  if command->>'status'<>q.status then update public.buyer_inquiries set status=command->>'status' where id=qid and owner_id=who;end if;
  return public.buyer_thread(qid);
 end if;
 ctx:=public.buyer_context(qid);
 if op in ('draft','edit') and jsonb_typeof(command->'body') is distinct from 'string' then raise exception 'Invalid reply type' using errcode='22023';end if;
 if op in ('draft','edit') and coalesce(char_length(btrim(command->>'body')),0) not between 1 and 10000 then raise exception 'Invalid reply' using errcode='22023';end if;
 if op='draft' then
  if rid is null or command->>'source' is null or command->>'source' not in ('manual','template') or command->'context' is distinct from ctx then raise exception 'Stale or invalid draft context' using errcode='40001';end if;
  select * into r from public.suggested_replies where id=rid and owner_id=who for update;
  if r.id is not null then
   if r.inquiry_id<>qid or r.body<>btrim(command->>'body') or r.source<>command->>'source' or r.context_snapshot is distinct from ctx then raise exception 'Conflicting retry' using errcode='40001';end if;
  else insert into public.suggested_replies(id,owner_id,inquiry_id,body,source,context_snapshot) values(rid,who,qid,btrim(command->>'body'),command->>'source',ctx);end if;
  return public.buyer_thread(qid);
 end if;
 select * into r from public.suggested_replies where id=rid and owner_id=who for update;
 if r.id is null then raise exception 'Record unavailable' using errcode='P0002';end if;
 if expected is null or expected<>r.revision::text then raise exception 'Stale reply' using errcode='40001';end if;
 if op='edit' then
  update public.suggested_replies set body=btrim(command->>'body'),source='manual',status='Draft',approved_at=null,revision=revision+1,updated_at=now() where id=rid and owner_id=who;
 elsif op in ('approve','copy') then
  if q.status<>'Open' or r.context_snapshot is distinct from ctx then raise exception 'Stale context; create a new draft' using errcode='40001';end if;
  if op='approve' then
   if command->'context' is distinct from ctx or r.status='Dismissed' then raise exception 'Stale review' using errcode='40001';end if;
   update public.suggested_replies set status='Approved',approved_at=now(),revision=revision+1,updated_at=now() where id=rid and owner_id=who;
  else
   if r.status<>'Approved' then raise exception 'Approval required' using errcode='22023';end if;
   return jsonb_build_object('body',r.body,'revision',r.revision::text);
  end if;
 end if;
 return public.buyer_thread(qid);
end $$;

-- Writes only through the bounded owner-checked RPC; reads remain owner-scoped by RLS.
revoke insert,update,delete on public.buyer_inquiries,public.suggested_replies from authenticated;
revoke all on function public.buyer_context(uuid),public.buyer_thread(uuid),public.buyer_item_changed(),public.buyer_inquiry_changed(),public.buyer_workspace(jsonb) from public,anon,authenticated;
grant execute on function public.buyer_workspace(jsonb) to authenticated;
commit;

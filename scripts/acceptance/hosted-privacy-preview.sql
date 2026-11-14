-- One transaction; synthetic owners/rows only; no Storage mutations. Always rollback.
begin;
set local statement_timeout='20s';
do $acceptance$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); i uuid:=gen_random_uuid();
 result jsonb; rejected boolean:=false;
begin
 insert into auth.users(id) values(a),(b);
 insert into public.items(id,owner_id,title,price,category,condition) values(i,a,'Synthetic privacy rollback acceptance',10,'Other','Good');
 insert into public.buyer_inquiries(owner_id,item_id,channel,message,status,updated_at)
 values(a,i,'marketplace','Synthetic closed history','Closed',now()-interval '40 days'),
       (a,i,'marketplace','Synthetic open history','Open',now()-interval '40 days');
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 result:=public.workspace_privacy_preview(30);
 if result->>'items'<>'1' or result->>'questions'<>'2' or result->>'history_candidates'<>'1' or result->>'photo_objects'<>'0' then raise exception 'Owned preview mismatch';end if;
 if public.workspace_privacy_preview(90)->>'history_candidates'<>'0' then raise exception 'Window ignored';end if;
 begin perform public.workspace_privacy_preview(1);exception when invalid_parameter_value then rejected:=true;end;
 if not rejected then raise exception 'Invalid window accepted';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 result:=public.workspace_privacy_preview(30);
 if result->>'items'<>'0' or result->>'questions'<>'0' or result->>'photo_objects'<>'0' or result->>'history_candidates'<>'0' then raise exception 'Other owner visible';end if;
 set local role anon;
 rejected:=false;
 begin perform public.workspace_privacy_preview(30);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous preview allowed';end if;
 reset role;
 if (select count(*) from public.buyer_inquiries where owner_id=a)<>2 then raise exception 'Preview changed data';end if;
end $acceptance$;
select 'passed: owner counts, history window, open exclusion, invalid-window/anonymous rejection, cross-owner database/Storage isolation, no deletion' as result;
rollback;

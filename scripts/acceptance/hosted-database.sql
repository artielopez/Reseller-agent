-- Run against the dedicated Reseller Agent project after its four app migrations.
-- Uses synthetic records in one transaction. ROLLBACK leaves no users or content.
-- Tests real Postgres roles/RLS, not Auth login, HTTP JWT validation or concurrency.
begin;
set local statement_timeout = '20s';
do $acceptance$
declare
 owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
 item_id uuid:=gen_random_uuid(); question_id uuid:=gen_random_uuid(); reply_id uuid:=gen_random_uuid();
 payload jsonb; thread jsonb; prefs jsonb; approved_revision text; rejected boolean; count_rows integer;
begin
 insert into auth.users(id,aud,role) values(owner_a,'authenticated','authenticated'),(owner_b,'authenticated','authenticated');
 perform set_config('request.jwt.claim.sub',owner_a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_a,'role','authenticated')::text,true);
 set local role authenticated;
 payload:=jsonb_build_object('id',item_id,'title','Synthetic acceptance lamp','description','Synthetic test only','price',850,'category','Other','condition','Good','status','Draft','photos','[]'::jsonb,'listings',(select jsonb_agg(jsonb_build_object('channel',c,'title','Test lamp','description','Synthetic','status','Not posted','url','')) from unnest(array['carousell','marketplace','groups']) c));
 perform public.save_inventory_item(payload);
 select count(*) into count_rows from public.items where id=item_id;
 if count_rows<>1 then raise exception 'Owner cannot read own item';end if;
 thread:=public.buyer_workspace(jsonb_build_object('op','saveInquiry','expected_revision',null,'input',jsonb_build_object('id',question_id,'item_id',item_id,'channel','marketplace','surface','dm','buyer_name','','message','Pickup area?','received_at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
 thread:=public.buyer_workspace(jsonb_build_object('op','draft','id',reply_id,'inquiry_id',question_id,'body','The asking price is PHP 850.','source','manual','context',thread->'context'));
 thread:=public.buyer_workspace(jsonb_build_object('op','approve','id',reply_id,'expected_revision',thread#>>'{replies,0,revision}','context',thread->'context'));
 approved_revision:=thread#>>'{replies,0,revision}';
 if public.buyer_workspace(jsonb_build_object('op','copy','id',reply_id,'expected_revision',approved_revision))->>'body'<>'The asking price is PHP 850.' then raise exception 'Approved copy mismatch';end if;
 prefs:=public.seller_workspace(jsonb_build_object('op','save','expected_revision','0','input',jsonb_build_object('pickup_area','','delivery_notes','','payment_notes','','digest_enabled',true,'digest_time','09:00')));
 perform public.buyer_workspace(jsonb_build_object('op','copy','id',reply_id,'expected_revision',approved_revision));
 prefs:=public.seller_workspace(jsonb_build_object('op','save','expected_revision',prefs#>>'{preferences,revision}','input',jsonb_build_object('pickup_area','Synthetic area','delivery_notes','','payment_notes','','digest_enabled',true,'digest_time','09:00')));
 rejected:=false;
 begin perform public.buyer_workspace(jsonb_build_object('op','copy','id',reply_id,'expected_revision',approved_revision));exception when sqlstate '40001' then rejected:=true;end;
 if not rejected then raise exception 'Stale approval remained copyable';end if;
 thread:=public.buyer_workspace(jsonb_build_object('op','get','id',question_id));
 if thread#>>'{replies,0,status}'<>'Draft' or thread#>>'{context,seller_terms,pickup_area}'<>'Synthetic area' or thread#>>'{inquiry,status}'<>'Open' then raise exception 'Term invalidation or copy/status separation failed';end if;
 if (public.draft_queue('{"op":"list"}'::jsonb)->>'paused')::boolean is distinct from true then raise exception 'Worker did not default to paused';end if;
 perform set_config('request.jwt.claim.sub',owner_b::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_b,'role','authenticated')::text,true);
 select count(*) into count_rows from public.items where id=item_id;
 if count_rows<>0 then raise exception 'Cross-owner inventory leak';end if;
 if public.buyer_workspace('{"op":"list"}'::jsonb)<>'[]'::jsonb then raise exception 'Cross-owner inbox leak';end if;
 if public.seller_workspace('{"op":"get"}'::jsonb)#>>'{preferences,pickup_area}'<>'' then raise exception 'Cross-owner terms leak';end if;
 rejected:=false;
 begin perform public.buyer_workspace(jsonb_build_object('op','get','id',question_id));exception when no_data_found then rejected:=true;end;
 if not rejected then raise exception 'Cross-owner thread accessible';end if;
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 set local role anon;
 rejected:=false;
 begin perform public.buyer_workspace('{"op":"list"}'::jsonb);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous inbox accessible';end if;
 rejected:=false;
 begin perform public.draft_worker(repeat('0',64),'{"op":"claim"}'::jsonb);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Invalid worker token accepted';end if;
 reset role;
 if not exists(select 1 from storage.buckets where id='item-photos' and public=false and file_size_limit=2097152 and allowed_mime_types=array['image/jpeg']) then raise exception 'Private storage configuration mismatch';end if;
end $acceptance$;
select 'passed: owned inventory/inbox/terms; stale-copy rejection; paused worker; anonymous/token rejection; private bucket' as acceptance;
rollback;

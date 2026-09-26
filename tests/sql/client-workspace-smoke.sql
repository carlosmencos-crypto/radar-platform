-- Internal transaction smoke only: no persistent clients, invitations or emails.
begin;
do $$
declare actor uuid; municipality text; request uuid:=gen_random_uuid(); input jsonb; account jsonb; campaign uuid; contract uuid; ref text; content jsonb; blocked boolean:=false; second_user uuid:=gen_random_uuid();
begin
 select p.user_id into actor from public.profiles p join auth.users u on u.id=p.user_id where p.platform_role='super_admin' and p.is_active and u.raw_app_meta_data->>'platform_role'='super_admin' limit 1;
 select m.municipality_code into municipality from public.municipalities m where not m.is_synthetic and not exists(select 1 from admin_vault.commercial_contracts cc where cc.municipality_id=m.id and cc.status in ('RESERVED','ACTIVE','SUSPENDED')) limit 1;
 input:=jsonb_build_object('request_id',request,'municipality_code',municipality,'name','Transactional smoke only','display_name','Test administrator','email','nobody@example.invalid','seat_limit',1,'valid_until',(current_date+30)::text);
 account:=public.radar_admin_clients_v1(actor,'super_admin','onboard',input);campaign:=(account->>'campaign_id')::uuid;
 if public.radar_admin_clients_v1(actor,'super_admin','onboard',input)->>'campaign_id'<>campaign::text then raise exception 'Idempotency failed'; end if;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,actor,'campaign_admin','Smoke');
 insert into auth.users(id,email) values(second_user,second_user::text||'@example.invalid');
 begin perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,second_user,'campaign_viewer','Seat test'); exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'Seat cap failed'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 content:=public.radar_admin_content_v1(actor,'super_admin','save',jsonb_build_object('kind','notice','title','Transactional notice','body','Smoke only','municipality_code',municipality));
 perform public.radar_admin_content_v1(actor,'super_admin','publish',jsonb_build_object('id',content->>'id'));
 if jsonb_array_length(public.radar_shared_content_v1(campaign))<>1 then raise exception 'Notice delivery failed'; end if;
 perform public.radar_ack_notice_v1(campaign,(content->>'id')::uuid);
 if jsonb_array_length(public.radar_shared_content_v1(campaign))<>0 then raise exception 'Notice acknowledgement failed'; end if;
 select id,contract_ref into contract,ref from admin_vault.commercial_contracts where campaign_id=campaign;
 perform public.radar_admin_release_contract_v1(actor,'super_admin',contract,ref,'Transactional release');
 if private.is_campaign_member(campaign,null) then raise exception 'Archive access remained'; end if;
 perform public.radar_admin_clients_v1(actor,'super_admin','reactivate',jsonb_build_object('campaign_id',campaign,'valid_until',(current_date+60)::text));
 if not exists(select 1 from public.campaigns where id=campaign and status='active') then raise exception 'Reactivation failed'; end if;
end $$;
select 'PASS: onboarding, retry, seat cap, notice delivery and acknowledgement, archive and reactivation. All rolled back.' as result;
rollback;

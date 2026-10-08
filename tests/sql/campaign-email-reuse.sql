-- Transaction-only regression: no email dispatch, no persistent users or campaigns.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare
 actor uuid; usr uuid:=gen_random_uuid(); old_campaign uuid; new_campaign uuid;
 other_campaign uuid; mun record; second_mun record; result jsonb;
 source uuid; voter bigint; interaction uuid; contact uuid; activity uuid;
 mail uuid; test_email text:='radar-reuse-'||gen_random_uuid()||'@example.invalid';
begin
 select u.id into strict actor from auth.users u join public.profiles p on p.user_id=u.id
 where u.raw_app_meta_data->>'platform_role'='super_admin' and p.is_active limit 1;
 select m.id,m.municipality_code into strict mun from public.municipalities m
 where not m.is_synthetic and not exists(select 1 from public.campaigns c where c.municipality_id=m.id and not c.is_demo)
 and exists(select 1 from campaign_vault.national_register_2023 n where n.municipality_id=m.id)
 order by m.municipality_code limit 1;
 select m.id,m.municipality_code into strict second_mun from public.municipalities m
 where not m.is_synthetic and m.id<>mun.id and not exists(select 1 from public.campaigns c where c.municipality_id=m.id and not c.is_demo)
 order by m.municipality_code limit 1;
 insert into auth.users(id,email,role,aud,encrypted_password,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
 values(usr,test_email,'authenticated','authenticated','rollback-only-password-sentinel','{}','{"name":"QA temporal"}',now());
 result:=public.radar_admin_clients_v1(actor,'super_admin','onboard',jsonb_build_object(
 'request_id',gen_random_uuid(),'seat_limit',10,'name','ROLLBACK email reuse old','display_name','QA temporal','email',test_email,
 'municipality_code',mun.municipality_code,'valid_until',current_date+1));
 old_campaign:=(result->>'campaign_id')::uuid;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',old_campaign,usr,'campaign_admin','Rollback verification');
 result:=public.radar_admin_clients_v1(actor,'super_admin','onboard',jsonb_build_object(
 'request_id',gen_random_uuid(),'seat_limit',10,'name','ROLLBACK unrelated campaign','display_name','QA temporal','email',test_email,
 'municipality_code',second_mun.municipality_code,'valid_until',current_date+1));
 other_campaign:=(result->>'campaign_id')::uuid;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',other_campaign,usr,'campaign_admin','Rollback verification');
 insert into campaign_vault.contacts(campaign_id,full_name,created_by) values(old_campaign,'QA removed contact',usr) returning id into contact;
 insert into campaign_vault.activities(campaign_id,title,created_by) values(old_campaign,'QA removed activity',usr) returning id into activity;
 insert into campaign_vault.activities(campaign_id,title,created_by) values(other_campaign,'QA retained activity',usr);
 insert into campaign_vault.contact_workspace_interactions(owner_id,source_id,record_id,municipality_id,interaction_type,notes)
 select usr,source_id,id,second_mun.id,'REUNION','QA retained history'
 from campaign_vault.national_register_2023 where municipality_id=second_mun.id limit 1;
 select source_id,id into strict source,voter from campaign_vault.national_register_2023 where municipality_id=mun.id limit 1;
 insert into campaign_vault.contact_workspace_profiles(owner_id,source_id,record_id,municipality_id,profile)
 values(usr,source,voter,mun.id,'{"notes":"QA removed annotation"}');
 insert into campaign_vault.contact_workspace_interactions(owner_id,source_id,record_id,municipality_id,interaction_type,notes)
 values(usr,source,voter,mun.id,'REUNION','QA removed history') returning id into interaction;
 perform set_config('request.jwt.claim.sub',usr::text,true);
 if not private.is_campaign_member(old_campaign,array['campaign_admin']) then raise exception 'Original access failed'; end if;
 result:=public.radar_admin_purge_campaign_v1(actor,'super_admin',jsonb_build_object(
 'campaign_id',old_campaign,'confirmation','ELIMINAR '||mun.municipality_code,'acknowledge','yes'));
 mail:=(result->>'mail_id')::uuid;
 if not exists(select 1 from auth.users where id=usr and email=test_email and encrypted_password='rollback-only-password-sentinel')
 then raise exception 'User or password was changed';end if;
 if private.is_campaign_member(old_campaign,null) then raise exception 'Deleted campaign still accessible';end if;
 if exists(select 1 from campaign_vault.contacts where id=contact)
 or exists(select 1 from campaign_vault.activities where id=activity)
 or exists(select 1 from campaign_vault.contact_workspace_profiles where owner_id=usr and municipality_id=mun.id)
 or exists(select 1 from admin_vault.campaign_archives where campaign_id=old_campaign)
 then raise exception 'Private campaign data survived deletion';end if;
 if exists(select 1 from campaign_vault.contact_workspace_interactions where id=interaction)
 then raise exception 'Private voter history survived deletion';end if;
 result:=public.radar_admin_clients_v1(actor,'super_admin','onboard',jsonb_build_object(
 'request_id',gen_random_uuid(),'seat_limit',10,'name','ROLLBACK email reuse new','display_name','QA temporal','email',upper(test_email),
 'municipality_code',mun.municipality_code,'valid_until',current_date+1));
 new_campaign:=(result->>'campaign_id')::uuid;
 if new_campaign=old_campaign then raise exception 'Campaign identity reused';end if;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',new_campaign,usr,'campaign_admin','Rollback reused email');
 result:=public.radar_my_campaigns_v1();
 if jsonb_array_length(result->'campaigns')<>2
 or not private.is_campaign_member(new_campaign,array['campaign_admin'])
 or not private.is_campaign_member(other_campaign,array['campaign_admin'])
 then raise exception 'New access or other municipality affected';end if;
 if exists(select 1 from campaign_vault.contacts where campaign_id=new_campaign)
 or exists(select 1 from campaign_vault.activities where campaign_id=new_campaign)
 then raise exception 'New campaign inherited private records';end if;
 if not exists(select 1 from campaign_vault.activities where campaign_id=other_campaign and title='QA retained activity')
 or (exists(select 1 from campaign_vault.national_register_2023 where municipality_id=second_mun.id)
 and not exists(select 1 from campaign_vault.contact_workspace_interactions where owner_id=usr and municipality_id=second_mun.id and notes='QA retained history'))
 then raise exception 'Other municipality private data removed';end if;
 if not exists(select 1 from admin_vault.lifecycle_mail where id=mail and kind='deleted' and status='pending' and campaign_id is null)
 then raise exception 'Deletion notification not queued';end if;
end $$;
rollback;
select 'PASS: same account/password reused, new campaign clean, old access removed, other municipality preserved; all test data rolled back' result;

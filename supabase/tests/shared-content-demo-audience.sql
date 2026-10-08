-- Rollback-only integration test: no publication or fixture survives this transaction.
begin;
do $test$
declare
 actor uuid; real_campaign uuid; demo_campaign uuid; territory text; other_territory text;
 test_user uuid:=gen_random_uuid(); real_notice uuid; demo_notice uuid; both_notice uuid;
 resource_id uuid; path text:=gen_random_uuid()::text||'/audience-test.pdf';
 saved jsonb; visible jsonb; blocked boolean:=false;
begin
 select u.id into actor from auth.users u join public.profiles p on p.user_id=u.id
 where u.raw_app_meta_data->>'platform_role'='super_admin' and p.is_active limit 1;
 select r.id,d.id,m.municipality_code into real_campaign,demo_campaign,territory
 from public.campaigns r join public.campaigns d on d.municipality_id=r.municipality_id and d.is_demo and d.status='active'
 join public.municipalities m on m.id=r.municipality_id
 where not r.is_demo and r.status='active'
 and (not exists(select 1 from admin_vault.client_accounts a where a.campaign_id=r.id)
 or exists(select 1 from admin_vault.commercial_contracts cc where cc.campaign_id=r.id and cc.status='ACTIVE' and cc.contract_period @> current_date)) limit 1;
 if actor is null or real_campaign is null then raise exception 'Missing authorized test context'; end if;
 select municipality_code into other_territory from public.municipalities where not is_synthetic and municipality_code<>territory limit 1;
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
 values(test_user,'authenticated','authenticated','radar-audience-'||test_user||'@example.invalid','{}','{}');
 insert into public.profiles(user_id,display_name,platform_role,is_active) values(test_user,'Rollback test','user',true) on conflict(user_id) do nothing;
 insert into public.campaign_members(campaign_id,user_id,member_role) values(real_campaign,test_user,'campaign_viewer');
 saved:=public.radar_admin_content_v1(actor,'super_admin','save',jsonb_build_object('kind','notice','title','Rollback REAL','municipality_code',territory));
 if saved->>'target_environment'<>'REAL' or saved->>'status'<>'DRAFT' then raise exception 'Unsafe default draft audience'; end if;
 real_notice:=(saved->>'id')::uuid;
 perform public.radar_admin_content_v1(actor,'super_admin','publish',jsonb_build_object('id',real_notice));
 saved:=public.radar_admin_content_v1(actor,'super_admin','save',jsonb_build_object('kind','notice','title','Rollback DEMO','target_environment','DEMO','municipality_code',territory));
 demo_notice:=(saved->>'id')::uuid;
 perform public.radar_admin_content_v1(actor,'super_admin','publish',jsonb_build_object('id',demo_notice));
 saved:=public.radar_admin_content_v1(actor,'super_admin','save',jsonb_build_object('kind','notice','title','Rollback ALL','target_environment','ALL'));
 both_notice:=(saved->>'id')::uuid;
 perform public.radar_admin_content_v1(actor,'super_admin','publish',jsonb_build_object('id',both_notice));
 saved:=public.radar_admin_content_v1(actor,'super_admin','save',jsonb_build_object('kind','resource','title','Rollback resource','target_environment','DEMO','municipality_code',territory,'storage_path',path,'file_name','audience-test.pdf'));
 resource_id:=(saved->>'id')::uuid;
 perform public.radar_admin_content_v1(actor,'super_admin','publish',jsonb_build_object('id',resource_id));
 begin
  perform public.radar_admin_content_v1(actor,'super_admin','save','{"kind":"notice","title":"Invalid","target_environment":"INVALID"}');
 exception when others then blocked:=true; end;
 if not blocked then raise exception 'Invalid audience accepted'; end if;
 perform set_config('request.jwt.claim.sub',test_user::text,true);
 set local role authenticated;
 visible:=public.radar_shared_content_v1(real_campaign);
 if not visible @> jsonb_build_array(jsonb_build_object('id',real_notice)) or not visible @> jsonb_build_array(jsonb_build_object('id',both_notice))
 or visible @> jsonb_build_array(jsonb_build_object('id',demo_notice)) or visible @> jsonb_build_array(jsonb_build_object('id',resource_id)) then raise exception 'Real delivery isolation failed'; end if;
 if private.can_read_shared_resource(path) then raise exception 'Real user downloaded demo resource'; end if;
 blocked:=false;
 begin perform public.radar_shared_content_v1(demo_campaign); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Campaign membership bypassed'; end if;
 reset role;
 delete from public.campaign_members where user_id=test_user;
 insert into public.campaign_members(campaign_id,user_id,member_role) values(demo_campaign,test_user,'demo_viewer');
 set local role authenticated;
 visible:=public.radar_shared_content_v1(demo_campaign);
 if not visible @> jsonb_build_array(jsonb_build_object('id',demo_notice)) or not visible @> jsonb_build_array(jsonb_build_object('id',both_notice))
 or not visible @> jsonb_build_array(jsonb_build_object('id',resource_id)) or visible @> jsonb_build_array(jsonb_build_object('id',real_notice)) then raise exception 'Demo delivery isolation failed'; end if;
 if not private.can_read_shared_resource(path) then raise exception 'Demo resource download denied'; end if;
 perform public.radar_ack_notice_v1(demo_campaign,demo_notice);
 if public.radar_shared_content_v1(demo_campaign) @> jsonb_build_array(jsonb_build_object('id',demo_notice)) then raise exception 'Acknowledged notice reappeared'; end if;
 reset role;
 update admin_vault.shared_content set municipality_code=other_territory where id=resource_id;
 set local role authenticated;
 if private.can_read_shared_resource(path) or public.radar_shared_content_v1(demo_campaign) @> jsonb_build_array(jsonb_build_object('id',resource_id)) then raise exception 'Municipality audience ignored'; end if;
 reset role;
 update admin_vault.shared_content set municipality_code=territory,status='DRAFT' where id=resource_id;
 set local role authenticated;
 if private.can_read_shared_resource(path) then raise exception 'Draft download allowed'; end if;
 reset role;
 if has_function_privilege('anon','public.radar_shared_content_v1(uuid)','EXECUTE') or has_function_privilege('authenticated','public.radar_admin_content_v1(uuid,text,text,jsonb)','EXECUTE') then raise exception 'RPC grants expanded'; end if;
end $test$;
rollback;
select true as real_demo_delivery_isolated, true as resource_download_scoped,
 true as draft_and_invalid_audience_checked, true as receipt_and_membership_checked,
 true as no_test_data_persisted;

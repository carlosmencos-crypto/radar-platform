begin;
do $$
declare actor uuid:=gen_random_uuid(); target uuid:=gen_random_uuid(); campaign uuid:=gen_random_uuid(); contract uuid:=gen_random_uuid(); municipality uuid; organization uuid; blocked boolean;
begin
 insert into auth.users(id,email,raw_app_meta_data) values(actor,actor::text||'@example.invalid','{"platform_role":"super_admin"}'),(target,target::text||'@example.invalid','{}');
 insert into public.profiles(user_id,platform_role,is_active) values(actor,'super_admin',true) on conflict(user_id) do update set platform_role='super_admin',is_active=true;
 select id into municipality from public.municipalities where not exists(select 1 from admin_vault.commercial_contracts cc where cc.municipality_id=municipalities.id and cc.status in ('RESERVED','ACTIVE','SUSPENDED')) limit 1;
 select id into organization from public.organizations limit 1;
 insert into public.campaigns(id,organization_id,country_code,municipality_id,name,slug,is_demo,status) values(campaign,organization,'GT',municipality,'Release test',campaign::text,false,'active');
 insert into public.campaign_members values(campaign,target,'campaign_admin',now());
 insert into admin_vault.commercial_contracts(id,municipality_id,campaign_id,client_organization_id,contract_ref,valid_from,status,created_by) values(contract,municipality,campaign,organization,contract::text,current_date,'ACTIVE',actor);
 blocked:=false;
 begin perform public.radar_admin_release_contract_v1(actor,'super_admin',contract,'wrong','QA'); exception when others then blocked:=true; end;
 if not blocked or not exists(select 1 from public.campaign_members where campaign_id=campaign) then raise exception 'FAIL confirmation guard'; end if;
 perform public.radar_admin_release_contract_v1(actor,'super_admin',contract,contract::text,'QA release');
 if exists(select 1 from public.campaign_members where campaign_id=campaign) then raise exception 'FAIL access removal'; end if;
 if not exists(select 1 from public.campaigns where id=campaign and status='paused') then raise exception 'FAIL campaign retention'; end if;
 if not exists(select 1 from admin_vault.commercial_contracts where id=contract and status='ENDED') then raise exception 'FAIL contract ended'; end if;
 if not exists(select 1 from admin_vault.audit_events where entity_id=contract::text and action='RELEASE_CONTRACT' and jsonb_array_length(before_state->'members')=1) then raise exception 'FAIL audit'; end if;
 if has_function_privilege('authenticated','public.radar_admin_release_contract_v1(uuid,text,uuid,text,text)','EXECUTE') then raise exception 'FAIL grants'; end if;
end $$;
select 'PASS: confirmation, revoke access, retain campaign, end exclusivity, audit, service-only' as result;
rollback;

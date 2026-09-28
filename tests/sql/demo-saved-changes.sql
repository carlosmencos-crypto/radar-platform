-- Execute within a transaction and ROLLBACK. No real demos are reset.
do $$
declare demo uuid; actor uuid:='7e3eca65-d75b-4542-a581-613fa6eddf07'; contact uuid; stamp timestamptz; result jsonb;
begin
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status)
 select organization_id,country_code,municipality_id,'ROLLBACK demo change detection','rollback-'||gen_random_uuid(),true,'active' from public.campaigns where is_demo limit 1 returning id into demo;
 if exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Provisioning marked as change'; end if;
 perform 1 from demo_vault.contacts where campaign_id=demo;
 if exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Read marked as change'; end if;
 insert into demo_vault.contacts(campaign_id,full_name) values(demo,'Test') returning id into contact;
 if not exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Contact not tracked'; end if;
 select last_changed_at into stamp from admin_vault.demo_usage where campaign_id=demo;
 update demo_vault.contacts set updated_at=now() where id=contact;
 if (select last_changed_at from admin_vault.demo_usage where campaign_id=demo)<>stamp then raise exception 'No-op tracked'; end if;
 delete from demo_vault.contacts where id=contact;
 if not exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Delete cleared dirty'; end if;
 result:=public.radar_admin_clients_v1(actor,'super_admin','reset_demo',jsonb_build_object('campaign_id',demo,'confirmation','ROLLBACK demo change detection'));
 if exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Reset did not clear'; end if;
 insert into demo_vault.campaign_identity(campaign_id,party_logo_data_url) values(demo,'test-logo');
 if not exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Logo not tracked'; end if;
 result:=public.radar_admin_clients_v1(actor,'super_admin','reset_demo',jsonb_build_object('campaign_id',demo,'confirmation','ROLLBACK demo change detection'));
 insert into demo_vault.activities(campaign_id,title) values(demo,'Test activity');
 if not exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Activity not tracked'; end if;
 if has_table_privilege('authenticated','admin_vault.demo_usage','UPDATE') then raise exception 'Private tracking exposed'; end if;
end $$;

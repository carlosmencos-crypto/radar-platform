-- QA regression. All fixtures and mutations roll back. Sends no invitations/emails.
begin isolation level repeatable read;
do $$
declare actor uuid; code text; other_code text; account jsonb; target uuid; other_campaign uuid; org uuid; input jsonb; blocked boolean; t record; before_data jsonb:='{}'; after_data jsonb:='{}'; digest text; audit_id bigint;
begin
 select p.user_id into actor from public.profiles p join auth.users u on u.id=p.user_id where p.platform_role='super_admin' and p.is_active and u.raw_app_meta_data->>'platform_role'='super_admin' limit 1;
 select m.municipality_code into code from public.municipalities m where not m.is_synthetic and not exists(select 1 from admin_vault.commercial_contracts cc where cc.municipality_id=m.id and cc.status in ('RESERVED','ACTIVE','SUSPENDED')) order by m.municipality_code limit 1;
 select m.municipality_code into other_code from public.municipalities m where not m.is_synthetic and m.municipality_code<>code and not exists(select 1 from admin_vault.commercial_contracts cc where cc.municipality_id=m.id and cc.status in ('RESERVED','ACTIVE','SUSPENDED')) order by m.municipality_code limit 1;
 input:=jsonb_build_object('request_id',gen_random_uuid(),'municipality_code',code,'name','Erasure rollback fixture','display_name','Fictional administrator','email','fixture@example.invalid','seat_limit',10,'valid_until',(current_date+30)::text);
 account:=public.radar_admin_clients_v1(actor,'super_admin','onboard',input);target:=(account->>'campaign_id')::uuid;
 account:=public.radar_admin_clients_v1(actor,'super_admin','onboard',input||jsonb_build_object('request_id',gen_random_uuid(),'municipality_code',other_code));other_campaign:=(account->>'campaign_id')::uuid;
 select organization_id into org from public.campaigns where id=target;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',target,actor,'campaign_admin','Fixture');
 insert into campaign_vault.contacts(campaign_id,full_name,notes) values(target,'Private fixture','Must be erased'),(other_campaign,'Control fixture','Must remain');
 for t in select tablename from pg_tables where schemaname='data_vault' loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from data_vault.%I r',t.tablename) into digest;
  before_data:=before_data||jsonb_build_object(t.tablename,digest);
 end loop;
 -- Rejected confirmations and roles must leave data intact.
 blocked:=false;
 begin perform public.radar_admin_purge_campaign_v1(actor,'super_admin',jsonb_build_object('campaign_id',target,'confirmation','wrong','acknowledge','yes')); exception when others then blocked:=true; end;
 if not blocked then raise exception 'Confirmation guard failed'; end if;
 blocked:=false;
 begin perform public.radar_admin_purge_campaign_v1(actor,'commercial_ops',jsonb_build_object('campaign_id',target,'confirmation','ELIMINAR '||code,'acknowledge','yes')); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Role guard failed'; end if;
 if has_function_privilege('authenticated','public.radar_admin_purge_campaign_v1(uuid,text,jsonb)','execute') or has_function_privilege('anon','public.radar_admin_purge_campaign_v1(uuid,text,jsonb)','execute') then raise exception 'RPC exposed to client'; end if;
 if has_table_privilege('service_role','admin_vault.campaign_erasure_authorizations','INSERT') then raise exception 'Erasure authorization exposed'; end if;
 perform public.radar_admin_purge_campaign_v1(actor,'super_admin',jsonb_build_object('campaign_id',target,'confirmation','ELIMINAR '||code,'acknowledge','yes'));
 if exists(select 1 from public.campaigns where id=target) or exists(select 1 from campaign_vault.contacts where campaign_id=target) or exists(select 1 from public.campaign_members where campaign_id=target) or exists(select 1 from admin_vault.commercial_contracts where campaign_id=target) or exists(select 1 from admin_vault.client_accounts where campaign_id=target) or exists(select 1 from public.organizations where id=org) then raise exception 'Private data or access survived'; end if;
 if private.is_campaign_member(target,null) then raise exception 'Deleted campaign remained authorized'; end if;
 if exists(select 1 from admin_vault.audit_events where campaign_id=target or entity_id=target::text or before_state::text like '%'||target::text||'%' or after_state::text like '%'||target::text||'%') then raise exception 'Private history survived'; end if;
 if not exists(select 1 from campaign_vault.contacts where campaign_id=other_campaign and full_name='Control fixture') then raise exception 'Other campaign changed'; end if;
 if exists(select 1 from admin_vault.campaign_erasure_authorizations) then raise exception 'Erasure permission persisted'; end if;
 select id into audit_id from admin_vault.audit_events where action='PURGE_CAMPAIGN' and entity_id=code order by id desc limit 1;
 if audit_id is null then raise exception 'Missing minimal deletion receipt'; end if;
 blocked:=false;
 begin delete from admin_vault.audit_events where id=audit_id; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Append-only audit protection failed'; end if;
 for t in select tablename from pg_tables where schemaname='data_vault' loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(r)::text),'''' order by md5(to_jsonb(r)::text)),'''')) from data_vault.%I r',t.tablename) into digest;
  after_data:=after_data||jsonb_build_object(t.tablename,digest);
 end loop;
 if before_data<>after_data then raise exception 'Official intelligence changed'; end if;
 -- Municipality can be assigned anew after erasure.
 perform public.radar_admin_clients_v1(actor,'super_admin','onboard',input||jsonb_build_object('request_id',gen_random_uuid()));
end $$;
rollback;
select 'PASS: erasure, guards, isolation, official-data checksums, audit integrity and reassignment; fixtures rolled back.' result;

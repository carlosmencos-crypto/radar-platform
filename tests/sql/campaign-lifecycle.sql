-- Run in one transaction with the migration, then ROLLBACK. Never dispatch queued mail.
do $$
declare actor uuid:='7e3eca65-d75b-4542-a581-613fa6eddf07'; usr uuid; a uuid; b uuid; ct record; r jsonb; before_users bigint; source uuid; rec bigint; muni uuid;
begin
 select id into strict usr from auth.users where email='carlos.mencos3@gmail.com';
 select count(*) into before_users from auth.users;
 r:=public.radar_admin_clients_v1(actor,'super_admin','onboard',jsonb_build_object('request_id',gen_random_uuid(),'seat_limit',10,'name','ROLLBACK lifecycle A','display_name','Prueba','email','carlos.mencos3@gmail.com','municipality_code','0102','valid_until',current_date+30)); a:=(r->>'campaign_id')::uuid;
 r:=public.radar_admin_clients_v1(actor,'super_admin','onboard',jsonb_build_object('request_id',gen_random_uuid(),'seat_limit',10,'name','ROLLBACK lifecycle B','display_name','Prueba','email','carlos.mencos3@gmail.com','municipality_code','0103','valid_until',current_date+30)); b:=(r->>'campaign_id')::uuid;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',a,usr,'campaign_admin','Rollback test');
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',b,usr,'campaign_editor','Rollback test');
 perform set_config('request.jwt.claim.sub',usr::text,true);
 r:=public.radar_my_campaigns_v1();
 if not exists(select 1 from jsonb_array_elements(r->'campaigns') x where x->>'campaign_id'=a::text) or not exists(select 1 from jsonb_array_elements(r->'campaigns') x where x->>'campaign_id'=b::text) then raise exception 'Multi campaign selection failed'; end if;
 select municipality_id into muni from public.campaigns where id=a;
 select source_id,id into source,rec from campaign_vault.national_register_2023 where municipality_id=muni limit 1;
 if rec is not null then insert into campaign_vault.contact_workspace_profiles(owner_id,source_id,record_id,municipality_id,profile) values(usr,source,rec,muni,'{"notes":"ROLLBACK retention test"}'); end if;
 select * into ct from admin_vault.commercial_contracts where campaign_id=a;
 r:=public.radar_admin_release_contract_v1(actor,'super_admin',ct.id,ct.contract_ref,'Rollback test');
 if r->>'mail_id' is null or private.is_campaign_member(a,null) or not private.is_campaign_member(b,null) then raise exception 'Conclude/isolation failed'; end if;
 if exists(select 1 from campaign_vault.contact_workspace_profiles where owner_id=usr and municipality_id=muni) then raise exception 'Directory annotations leaked after conclusion'; end if;
 if not exists(select 1 from admin_vault.campaign_archives where campaign_id=a) then raise exception 'Retention failed'; end if;
 perform public.radar_admin_release_contract_v1(actor,'super_admin',ct.id,ct.contract_ref,'Duplicate retry');
 if (select count(*) from admin_vault.lifecycle_mail where campaign_id=a and kind='concluded')<>1 then raise exception 'Duplicate close mail'; end if;
 -- A new contract in the same municipality must prevent reactivation of the previous one.
 update admin_vault.commercial_contracts set status='RESERVED' where id=ct.id;
 begin
  perform public.radar_admin_clients_v1(actor,'super_admin','reactivate',jsonb_build_object('campaign_id',a,'valid_until',current_date+30));
  raise exception 'Expected exclusivity rejection';
 exception when exclusion_violation then null; end;
 update admin_vault.commercial_contracts set status='ENDED' where id=ct.id;
 r:=public.radar_admin_clients_v1(actor,'super_admin','reactivate',jsonb_build_object('campaign_id',a,'valid_until',current_date+30));
 if not private.is_campaign_member(a,array['campaign_admin']) or r->>'mail_id' is null then raise exception 'Reactivation failed'; end if;
 if rec is not null and not exists(select 1 from campaign_vault.contact_workspace_profiles where owner_id=usr and municipality_id=muni and profile->>'notes'='ROLLBACK retention test') then raise exception 'Directory restoration failed'; end if;
 begin
  perform public.radar_admin_purge_campaign_v1(actor,'super_admin',jsonb_build_object('campaign_id',a,'confirmation','WRONG','acknowledge','yes'));
  raise exception 'Expected confirmation rejection';
 exception when others then if sqlerrm='Expected confirmation rejection' then raise; end if; end;
 r:=public.radar_admin_purge_campaign_v1(actor,'super_admin',jsonb_build_object('campaign_id',a,'confirmation','ELIMINAR 0102','acknowledge','yes'));
 if exists(select 1 from public.campaigns where id=a) or exists(select 1 from campaign_vault.contact_workspace_profiles where owner_id=usr and municipality_id=muni) or exists(select 1 from admin_vault.campaign_archives where campaign_id=a) then raise exception 'Erasure incomplete'; end if;
 if not private.is_campaign_member(b,null) or (select count(*) from auth.users)<>before_users then raise exception 'Other municipality or user affected'; end if;
 if not exists(select 1 from admin_vault.lifecycle_mail where id=(r->>'mail_id')::uuid and kind='deleted' and status='pending' and campaign_id is null) then raise exception 'Deletion mail not queued'; end if;
 if has_function_privilege('authenticated','public.radar_lifecycle_mail_v1(text,uuid,text)','EXECUTE') or has_function_privilege('anon','public.radar_my_campaigns_v1()','EXECUTE') then raise exception 'Privilege leak'; end if;
 raise notice 'PASS: multiple municipalities, conclusion, retention, annotation isolation, exclusivity, reactivation, purge, preserved account, mail queue, denied anonymous access';
end $$;

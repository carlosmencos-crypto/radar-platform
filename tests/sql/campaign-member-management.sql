begin;
do $$
declare actor uuid:=gen_random_uuid(); first_user uuid:=gen_random_uuid(); second_user uuid:=gen_random_uuid(); campaign uuid:=gen_random_uuid(); blocked boolean;
begin
 insert into auth.users(id,email,raw_app_meta_data) values(actor,actor::text||'@example.invalid','{"platform_role":"super_admin"}'),(first_user,first_user::text||'@example.invalid','{}'),(second_user,second_user::text||'@example.invalid','{}');
 insert into public.profiles(user_id,platform_role,is_active) values(actor,'super_admin',true) on conflict(user_id) do update set platform_role='super_admin',is_active=true;
 insert into public.campaigns(id,organization_id,country_code,municipality_id,name,slug,is_demo,status)
 select campaign,organization_id,country_code,municipality_id,'Isolated membership test',campaign::text,false,'active' from public.campaigns limit 1;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,first_user,'campaign_admin','QA assign first admin');
 blocked:=false;
 begin perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,first_user,null,'QA last admin'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'FAIL last administrator removal'; end if;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,second_user,'campaign_admin','QA replacement');
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,first_user,'campaign_viewer','QA demote');
 perform set_config('request.jwt.claim.sub',first_user::text,true);
 if not private.is_campaign_member(campaign,array['campaign_viewer']) or private.is_campaign_member(campaign,array['campaign_editor']) then raise exception 'FAIL role permissions'; end if;
 perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,first_user,null,'QA remove');
 if private.is_campaign_member(campaign,null) then raise exception 'FAIL revoked access'; end if;
 blocked:=false;
 begin perform public.radar_admin_campaign_member_v1(actor,'support',campaign,first_user,'campaign_admin','QA forbidden role'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'FAIL operator escalation'; end if;
 blocked:=false;
 begin perform public.radar_admin_campaign_member_v1(actor,'super_admin',campaign,first_user,'demo_admin','QA invalid role'); exception when others then blocked:=true; end;
 if not blocked then raise exception 'FAIL demo role crossover'; end if;
 if has_function_privilege('authenticated','public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text)','EXECUTE') or has_function_privilege('anon','public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text)','EXECUTE') then raise exception 'FAIL RPC exposed'; end if;
 if (select count(*) from admin_vault.audit_events where campaign_id=campaign)<>4 then raise exception 'FAIL audit events'; end if;
end $$;
select 'PASS: assignment, last admin protection, role change, immediate revocation, role boundaries, service-only RPC, audit' as result;
rollback;

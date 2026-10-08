begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $$
declare actor uuid; demo uuid; demo2 uuid; mun record; voter bigint; before_profile jsonb; r jsonb;
begin
 select u.id into strict actor from auth.users u join public.profiles p on p.user_id=u.id
 where u.raw_app_meta_data->>'platform_role'='super_admin' and p.is_active limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select m.id,m.municipality_code,c.organization_id into strict mun
 from public.campaigns c join public.municipalities m on m.id=c.municipality_id
 where c.is_demo and c.status='active' and exists(
 select 1 from campaign_vault.national_register_2023 n where n.municipality_id=m.id) limit 1;
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status)
 values(mun.organization_id,'GT',mun.id,'ROLLBACK location A','rollback-location-'||gen_random_uuid(),true,'active') returning id into demo;
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status)
 values(mun.organization_id,'GT',mun.id,'ROLLBACK location B','rollback-location-'||gen_random_uuid(),true,'active') returning id into demo2;
 r:=public.radar_demo_authorized_contact_directory_page_v1(demo,mun.municipality_code);
 voter:=(r->'items'->0->>'id')::bigint;
 if voter is null then raise exception 'No authorized test contact'; end if;
 before_profile:=public.radar_authorized_nominal_detail_v1(mun.municipality_code,voter);
 perform public.radar_demo_save_contact_profile_v1(demo,mun.municipality_code,voter,'{"latitude":"14.5","longitude":"-90.5"}');
 r:=public.radar_demo_authorized_nominal_detail_v1(demo,mun.municipality_code,voter);
 if r->'profile'->>'latitude' is distinct from '14.5' or r->'profile'->>'longitude' is distinct from '-90.5' then raise exception 'Demo coordinates not persisted'; end if;
 if public.radar_authorized_nominal_detail_v1(mun.municipality_code,voter) is distinct from before_profile then raise exception 'Demo changed real profile'; end if;
 if public.radar_demo_authorized_nominal_detail_v1(demo2,mun.municipality_code,voter)->'profile'->>'latitude' is not null then raise exception 'Demo location leaked to another demo'; end if;
 perform public.radar_save_contact_profile_v1(mun.municipality_code,voter,'{"latitude":"14.6","longitude":"-90.6"}');
 r:=public.radar_authorized_nominal_detail_v1(mun.municipality_code,voter);
 if r->'profile'->>'latitude' is distinct from '14.6' or r->'profile'->>'longitude' is distinct from '-90.6' then raise exception 'Real coordinates not persisted'; end if;
 if public.radar_demo_authorized_nominal_detail_v1(demo,mun.municipality_code,voter)->'profile'->>'latitude' is distinct from '14.5' then raise exception 'Real location changed demo'; end if;
 perform public.radar_demo_save_contact_profile_v1(demo,mun.municipality_code,voter,'{"latitude":null,"longitude":null}');
 if public.radar_demo_authorized_nominal_detail_v1(demo,mun.municipality_code,voter)->'profile'->>'latitude' is not null then raise exception 'Remove location failed'; end if;
end $$;
rollback;
select 'PASS: coordinates save, reload and removal; real/demo/second-demo isolation preserved; all data rolled back' result;

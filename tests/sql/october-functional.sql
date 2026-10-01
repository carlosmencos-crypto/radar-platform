begin;
do $$
declare actor uuid; campaign uuid; contact uuid:=gen_random_uuid(); vid bigint; code text; r jsonb; rid uuid; passed boolean;
begin
 select id into actor from auth.users where raw_app_meta_data->>'platform_role'='super_admin' limit 1;
 if actor is null then raise exception 'No operator'; end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status)
 select c.organization_id,c.country_code,c.municipality_id,'ROLLBACK responsible','rollback-filter-'||gen_random_uuid(),true,'active' from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.is_demo and c.status='active' and m.municipality_code='0509' limit 1 returning id into campaign;
 insert into demo_vault.contacts(id,campaign_id,full_name) values(contact,campaign,'ROLLBACK Responsible');
 r:=public.radar_demo_authorized_contact_directory_page_v1(campaign,'0509');
 vid:=(r->'items'->0->>'id')::bigint;
 perform public.radar_demo_save_contact_profile_v1(campaign,'0509',vid,jsonb_build_object('assigned_contact_id',contact,'assigned_person_name','ROLLBACK Responsible'));
 r:=private.radar_demo_authorized_contact_directory_page_v1(campaign,'0509',p_responsible=>contact);
 if jsonb_array_length(r->'items')<>1 or (r->'items'->0->>'id')::bigint<>vid then raise exception 'Responsible filter failed'; end if;
 r:=private.radar_demo_authorized_contact_directory_page_v1(campaign,'0509',p_responsible=>gen_random_uuid());
 if jsonb_array_length(r->'items')<>0 then raise exception 'Unrelated responsible matched'; end if;
 insert into admin_vault.shared_content(kind,title,status,created_by,storage_path,file_name) values('resource','ROLLBACK resource','ARCHIVED',actor,'rollback/no-file.txt','no-file.txt') returning id into rid;
 perform public.radar_admin_delete_resource_v1(actor,'super_admin',jsonb_build_object('id',rid,'confirmation','ELIMINAR'));
 if exists(select 1 from admin_vault.shared_content where id=rid) then raise exception 'Resource retained'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 if exists(select 1 from public.day_d_evidence e where private.can_read_rtd_evidence(e.bucket_id,e.object_path)) then raise exception 'Anonymous evidence access'; end if;
end $$;
rollback;
select 'PASS: demo responsible filter, nonmatching filter, resource deletion, anonymous evidence isolation; fixtures rolled back' as result;

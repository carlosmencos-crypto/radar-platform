-- Execute in a transaction and roll back; fixtures never persist.
do $$
declare actor uuid:='7e3eca65-d75b-4542-a581-613fa6eddf07'; demo uuid; demo2 uuid; vid bigint; r jsonb; before_profile jsonb; allowed boolean;
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status)
 select c.organization_id,c.country_code,c.municipality_id,'ROLLBACK directory demo','rollback-dir-'||gen_random_uuid(),true,'active' from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.is_demo and m.municipality_code='0509' limit 1 returning id into demo;
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status)
 select organization_id,country_code,municipality_id,'ROLLBACK directory demo 2','rollback-dir-'||gen_random_uuid(),true,'active' from public.campaigns where id=demo returning id into demo2;
 r:=public.radar_demo_authorized_contact_directory_page_v1(demo,'0509');
 if jsonb_array_length(r->'items')=0 then raise exception 'Demo directory empty'; end if;
 vid:=(r->'items'->0->>'id')::bigint;
 before_profile:=public.radar_authorized_nominal_detail_v1('0509',vid);
 if exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Read marked dirty'; end if;
 perform public.radar_demo_save_contact_profile_v1(demo,'0509',vid,'{"notes":"ROLLBACK demo isolated","contact_status":"CONTACTADO","photo_url":"https://example.org/rollback-avatar.png"}');
 r:=public.radar_demo_authorized_contact_directory_page_v1(demo,'0509');
 if not exists(select 1 from jsonb_array_elements(r->'items') item where (item->>'id')::bigint=vid and item->>'photo_url'='https://example.org/rollback-avatar.png') then raise exception 'List photo missing'; end if;
 perform public.radar_demo_add_contact_interaction_v1(demo,'0509',vid,'{"interaction_type":"LLAMADA","notes":"ROLLBACK demo interaction"}');
 r:=public.radar_demo_authorized_nominal_detail_v1(demo,'0509',vid);
 if r->'profile'->>'notes'<>'ROLLBACK demo isolated' or jsonb_array_length(r->'interactions')<>1 then raise exception 'Demo save/detail failed'; end if;
 if public.radar_authorized_nominal_detail_v1('0509',vid) is distinct from before_profile then raise exception 'Real profile changed'; end if;
 if public.radar_demo_authorized_nominal_detail_v1(demo2,'0509',vid)->'profile'->>'notes' is not null then raise exception 'Demo isolation failed'; end if;
 if public.radar_demo_authorized_nominal_detail_v1(demo,'0101',vid) is not null then raise exception 'Territory isolation failed'; end if;
 if not exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Demo not marked'; end if;
 perform public.radar_admin_clients_v1(actor,'super_admin','reset_demo',jsonb_build_object('campaign_id',demo,'confirmation','ROLLBACK directory demo'));
 if exists(select 1 from demo_vault.contact_workspace_profiles where campaign_id=demo) or exists(select 1 from demo_vault.contact_workspace_interactions where campaign_id=demo) or exists(select 1 from admin_vault.demo_usage where campaign_id=demo) then raise exception 'Demo reset incomplete'; end if;
 if public.radar_authorized_nominal_detail_v1('0509',vid) is distinct from before_profile then raise exception 'Reset affected real data'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 if public.radar_demo_authorized_nominal_detail_v1(demo,'0509',vid) is not null then raise exception 'Anonymous access'; end if;
end $$;

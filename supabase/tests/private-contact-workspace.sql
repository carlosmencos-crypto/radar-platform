-- Transactional integration check: synthetic annotations are rolled back.
-- Never outputs names, identifiers, documents or contact data.
begin;
do $$
declare rid bigint; other_rid bigint; original_hash text; result jsonb; blocked boolean;
begin
  select -r.id,md5(to_jsonb(r)::text) into strict rid,original_hash
    from campaign_vault.national_register_2023 r join public.municipalities m on m.id=r.municipality_id
    join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
    where m.municipality_code='1208' order by r.id limit 1;
  select -r.id into strict other_rid from campaign_vault.national_register_2023 r
    join public.municipalities m on m.id=r.municipality_id
    join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
    where m.municipality_code='0509' order by r.id limit 1;
  perform set_config('request.jwt.claim.sub','7e3eca65-d75b-4542-a581-613fa6eddf07',true);
  set local role authenticated;
  result := public.radar_save_contact_profile_v1('1208',rid,
    '{"contact_status":"CONTACTADO","phone_primary":"QA-ROLLBACK","notes":"Temporary integration check", "photo_url":"data:image/png;base64,iVBORw0KGgo=","dpi_front_url":"data:image/png;base64,iVBORw0KGgo=","dpi_back_url":"data:image/png;base64,iVBORw0KGgo=","assigned_person_name":"QA"}'::jsonb);
  if result->>'saved'<>'true' then raise exception 'Save failed'; end if;
  perform public.radar_add_contact_interaction_v1('1208',rid,
    '{"interaction_type":"LLAMADA","interaction_at":"2026-09-23T00:00:00Z","notes":"QA-ROLLBACK","responsible_name":"QA"}'::jsonb);
  result:=public.radar_authorized_nominal_detail_v1('1208',rid);
  if result->>'read_only'<>'false' or result#>>'{profile,phone_primary}'<>'QA-ROLLBACK'
    or result#>>'{profile,dpi_back_url}'<>'data:image/png;base64,iVBORw0KGgo='
    or not exists(select 1 from jsonb_array_elements(result->'interactions') i where i->>'notes'='QA-ROLLBACK') then
    raise exception 'Detail did not persist the complete contact';
  end if;
  result:=public.radar_authorized_nominal_directory_v1('1208',p_status=>'CONTACTADO');
  if not exists(select 1 from jsonb_array_elements(result->'items') i where (i->>'id')::bigint=rid and i->>'phone_primary'='QA-ROLLBACK') then
    raise exception 'Directory/filter missing saved contact';
  end if;
  result:=public.radar_authorized_contact_directory_page_v1('1208',p_status=>'CONTACTADO');
  if (result->>'total_count')::int<1 or not exists(select 1 from jsonb_array_elements(result->'items') i where (i->>'id')::bigint=rid) then
    raise exception 'Fast page missing saved contact';
  end if;
  result:=public.radar_authorized_contact_directory_page_v1('1208',p_query=>'QA_IMPOSSIBLE_NO_CONTACT_MATCH');
  if result->>'total_count'<>'0' or result->>'has_more'<>'false' then raise exception 'Empty page contract failed'; end if;
  if public.radar_authorized_nominal_detail_v1('0509',rid) is not null then raise exception 'Cross-municipality read'; end if;
  blocked:=false;
  begin perform public.radar_save_contact_profile_v1('1208',other_rid,'{}');
    exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-municipality write'; end if;
  blocked:=false;
  begin perform public.radar_save_contact_profile_v1('1208',rid,'{"owner_id":"override"}');
    exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Unsupported ownership field accepted'; end if;
  blocked:=false;
  begin perform public.radar_save_contact_profile_v1('1208',rid,'{"photo_url":"javascript:alert(1)"}');
    exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Unsafe image accepted'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  if public.radar_authorized_nominal_detail_v1('1208',rid) is not null then raise exception 'Unauthorized actor read'; end if;
  blocked:=false;
  begin perform public.radar_add_contact_interaction_v1('1208',rid,'{"interaction_type":"VISITA"}');
    exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Unauthorized actor write'; end if;
  reset role;
  set local role anon;
  blocked:=false;
  begin perform public.radar_save_contact_profile_v1('1208',rid,'{}');
    exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Anon write'; end if;
  reset role;
  if original_hash<>(select md5(to_jsonb(r)::text) from campaign_vault.national_register_2023 r
    join campaign_vault.national_register_sources s on s.id=r.source_id and s.active where r.id=-rid) then
    raise exception 'Original source modified';
  end if;
end $$;
select 'PASS: contact save, image fields, history, filters, source immutability and access isolation' as result;
rollback;

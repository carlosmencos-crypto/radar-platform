CREATE OR REPLACE FUNCTION private.radar_authorized_contact_directory_page_v1(p_municipality_code text, p_query text DEFAULT NULL::text, p_dpi text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_age_min integer DEFAULT NULL::integer, p_age_max integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_affiliation text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_responsible uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET work_mem TO '32MB'
AS $function$
declare
  name_patterns text[] := array(
    select '%' || replace(replace(replace(term,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') || '%'
    from (select distinct lower(word) as term
      from regexp_split_to_table(coalesce(p_query,''),'[[:space:],]+') as words(word)
      where word<>'') tokens
    order by length(term) desc,term
  );
  muni uuid; source uuid; total bigint; items jsonb; filtered boolean; page_limit integer := least(greatest(coalesce(p_limit,25),1),50); has_more boolean;
begin
  select m.id into muni from public.municipalities m where m.country_code='GT'
    and m.municipality_code=p_municipality_code;
  if muni is null or not private.can_read_national_register(muni) then
    raise exception 'Municipality not authorized' using errcode='42501';
  end if;
  select s.source_id,s.total_count into source,total
    from campaign_vault.national_register_municipal_stats s
    join campaign_vault.national_register_sources r on r.id=s.source_id and r.active
    where s.municipality_id=muni;
  if source is null then raise exception 'Municipal source is not active'; end if;
  filtered := nullif(btrim(p_query),'') is not null or nullif(p_dpi,'') is not null
    or nullif(p_community,'') is not null or p_age_min is not null or p_age_max is not null or nullif(p_status,'') is not null
    or nullif(p_affiliation,'') is not null or nullif(p_role,'') is not null or p_responsible is not null;
  if filtered then total:=null; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id desc),'[]'::jsonb) into items from (
    select -r.id as id,r.full_name,r.community,
      case when r.age_base between 18 and 110 then r.age_base+3 end as estimated_age_2026,
      repeat('•',9)||right(r.identification,4) as masked_identification,
      coalesce(cp.profile->>'contact_status','SIN_CONTACTO') as contact_status,cp.profile->>'phone_primary' as phone_primary,
      cp.profile->>'assigned_person_name' as assigned_person_name,cp.profile->>'campaign_role' as campaign_role,
      cp.profile->>'party_affiliation' as party_affiliation, cp.profile->>'photo_url' as photo_url,
      p_municipality_code as municipality_code,total as total_count
    from campaign_vault.national_register_2023 r
    left join campaign_vault.contact_workspace_profiles cp on cp.owner_id=(select auth.uid())
      and cp.source_id=r.source_id and cp.record_id=r.id and cp.municipality_id=muni
    where r.source_id=source and r.municipality_id=muni
      and (cardinality(name_patterns)=0 or (lower(r.full_name) like name_patterns[1] and (cardinality(name_patterns)<2 or lower(r.full_name) like name_patterns[2]) and lower(r.full_name) like all(name_patterns)))
      and (nullif(p_dpi,'') is null or r.identification=regexp_replace(p_dpi,'[^0-9]','','g'))
      and (nullif(p_community,'') is null or r.community=p_community)
      and (p_age_min is null or (r.age_base between 18 and 110 and r.age_base+3>=p_age_min))
      and (p_age_max is null or (r.age_base between 18 and 110 and r.age_base+3<=p_age_max))
      and (nullif(p_status,'') is null or coalesce(cp.profile->>'contact_status','SIN_CONTACTO')=p_status)
      and (nullif(p_affiliation,'') is null or cp.profile->>'party_affiliation'=p_affiliation)
      and (nullif(p_role,'') is null or cp.profile->>'campaign_role'=p_role)
      and (p_responsible is null or cp.profile->>'assigned_contact_id'=p_responsible::text or (
 nullif(cp.profile->>'assigned_contact_id','') is null and exists (
 select 1 from campaign_vault.contacts responsible_contact
 join public.campaigns responsible_campaign on responsible_campaign.id=responsible_contact.campaign_id
 where responsible_contact.id=p_responsible and responsible_contact.active
 and responsible_campaign.municipality_id=muni 
 and responsible_contact.full_name=cp.profile->>'assigned_person_name')))
    order by r.id offset greatest(coalesce(p_offset,0),0) limit page_limit+1
  ) page;
  has_more := jsonb_array_length(items)>page_limit;
  if has_more then items:=items-page_limit; end if;
  if filtered and not has_more and (jsonb_array_length(items)>0 or coalesce(p_offset,0)=0) then
    total:=greatest(coalesce(p_offset,0),0)+jsonb_array_length(items);
  end if;
  return jsonb_build_object('has_more',has_more,'municipality_code',p_municipality_code,'items',items,
    'total_count',total,'source_year',2023);
end;
$function$
;
CREATE OR REPLACE FUNCTION private.radar_demo_authorized_contact_directory_page_v1(p_demo_campaign uuid, p_municipality_code text, p_query text DEFAULT NULL::text, p_dpi text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_age_min integer DEFAULT NULL::integer, p_age_max integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_affiliation text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_responsible uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET work_mem TO '32MB'
AS $function$
declare
  name_patterns text[] := array(
    select '%' || replace(replace(replace(term,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') || '%'
    from (select distinct lower(word) as term
      from regexp_split_to_table(coalesce(p_query,''),'[[:space:],]+') as words(word)
      where word<>'') tokens
    order by length(term) desc,term
  );
  muni uuid; source uuid; total bigint; items jsonb; filtered boolean; page_limit integer := least(greatest(coalesce(p_limit,25),1),50); has_more boolean;
begin
  select m.id into muni from public.municipalities m where m.country_code='GT'
    and m.municipality_code=p_municipality_code;
  if muni is null or not private.can_read_demo_directory(p_demo_campaign, muni) then
    raise exception 'Municipality not authorized' using errcode='42501';
  end if;
  select s.source_id,s.total_count into source,total
    from campaign_vault.national_register_municipal_stats s
    join campaign_vault.national_register_sources r on r.id=s.source_id and r.active
    where s.municipality_id=muni;
  if source is null then raise exception 'Municipal source is not active'; end if;
  filtered := nullif(btrim(p_query),'') is not null or nullif(p_dpi,'') is not null
    or nullif(p_community,'') is not null or p_age_min is not null or p_age_max is not null or nullif(p_status,'') is not null
    or nullif(p_affiliation,'') is not null or nullif(p_role,'') is not null or p_responsible is not null;
  if filtered then total:=null; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id desc),'[]'::jsonb) into items from (
    select -r.id as id,r.full_name,r.community,
      case when r.age_base between 18 and 110 then r.age_base+3 end as estimated_age_2026,
      repeat('•',9)||right(r.identification,4) as masked_identification,
      coalesce(cp.profile->>'contact_status','SIN_CONTACTO') as contact_status,cp.profile->>'phone_primary' as phone_primary,
      cp.profile->>'assigned_person_name' as assigned_person_name,cp.profile->>'campaign_role' as campaign_role,
      cp.profile->>'party_affiliation' as party_affiliation, cp.profile->>'photo_url' as photo_url,
      p_municipality_code as municipality_code,total as total_count
    from campaign_vault.national_register_2023 r
    left join demo_vault.contact_workspace_profiles cp on cp.campaign_id=p_demo_campaign and cp.owner_id=(select auth.uid())
      and cp.source_id=r.source_id and cp.record_id=r.id and cp.municipality_id=muni
    where r.source_id=source and r.municipality_id=muni
      and (cardinality(name_patterns)=0 or (lower(r.full_name) like name_patterns[1] and (cardinality(name_patterns)<2 or lower(r.full_name) like name_patterns[2]) and lower(r.full_name) like all(name_patterns)))
      and (nullif(p_dpi,'') is null or r.identification=regexp_replace(p_dpi,'[^0-9]','','g'))
      and (nullif(p_community,'') is null or r.community=p_community)
      and (p_age_min is null or (r.age_base between 18 and 110 and r.age_base+3>=p_age_min))
      and (p_age_max is null or (r.age_base between 18 and 110 and r.age_base+3<=p_age_max))
      and (nullif(p_status,'') is null or coalesce(cp.profile->>'contact_status','SIN_CONTACTO')=p_status)
      and (nullif(p_affiliation,'') is null or cp.profile->>'party_affiliation'=p_affiliation)
      and (nullif(p_role,'') is null or cp.profile->>'campaign_role'=p_role)
      and (p_responsible is null or cp.profile->>'assigned_contact_id'=p_responsible::text or (
 nullif(cp.profile->>'assigned_contact_id','') is null and exists (
 select 1 from demo_vault.contacts responsible_contact
 join public.campaigns responsible_campaign on responsible_campaign.id=responsible_contact.campaign_id
 where responsible_contact.id=p_responsible and responsible_contact.active
 and responsible_campaign.municipality_id=muni and responsible_contact.campaign_id=p_demo_campaign
 and responsible_contact.full_name=cp.profile->>'assigned_person_name')))
    order by r.id offset greatest(coalesce(p_offset,0),0) limit page_limit+1
  ) page;
  has_more := jsonb_array_length(items)>page_limit;
  if has_more then items:=items-page_limit; end if;
  if filtered and not has_more and (jsonb_array_length(items)>0 or coalesce(p_offset,0)=0) then
    total:=greatest(coalesce(p_offset,0),0)+jsonb_array_length(items);
  end if;
  return jsonb_build_object('has_more',has_more,'municipality_code',p_municipality_code,'items',items,
    'total_count',total,'source_year',2023);
end;
$function$
;

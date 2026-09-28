create table demo_vault.contact_workspace_profiles (like campaign_vault.contact_workspace_profiles including defaults, campaign_id uuid not null references public.campaigns(id) on delete cascade, primary key(campaign_id,owner_id,source_id,record_id));
create table demo_vault.contact_workspace_interactions (like campaign_vault.contact_workspace_interactions including defaults, campaign_id uuid not null references public.campaigns(id) on delete cascade, primary key(id));
create index on demo_vault.contact_workspace_interactions(campaign_id,owner_id,source_id,record_id);
alter table demo_vault.contact_workspace_profiles enable row level security;
alter table demo_vault.contact_workspace_interactions enable row level security;
revoke all on demo_vault.contact_workspace_profiles,demo_vault.contact_workspace_interactions from public,anon,authenticated;
create function private.can_read_demo_directory(p_demo_campaign uuid,p_municipality_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.campaigns c where c.id=p_demo_campaign and c.is_demo and c.status='active' and c.municipality_id=p_municipality_id)
 and private.can_use_demo_campaign(p_demo_campaign) and private.can_read_national_register(p_municipality_id);
$$;
revoke all on function private.can_read_demo_directory(uuid,uuid) from public,anon;
grant execute on function private.can_read_demo_directory(uuid,uuid) to authenticated;
CREATE OR REPLACE FUNCTION private.radar_demo_reveal_nominal_identification_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare value text; muni uuid;
begin
  select r.identification,m.id into value,muni from campaign_vault.national_register_2023 r
  join public.municipalities m on m.id=r.municipality_id
  join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
  where m.country_code='GT' and m.municipality_code=p_municipality_code
    and p_voter_id<0 and r.id=-p_voter_id and private.can_read_demo_directory(p_demo_campaign, m.id);
  if value is not null then
    insert into campaign_vault.national_register_access_log(actor_id,municipality_id,record_id)
      values(auth.uid(),muni,-p_voter_id);
  end if;
  return value;
end;
$function$
;
revoke all on function private.radar_demo_reveal_nominal_identification_v1(uuid,text,bigint) from public,anon;
grant execute on function private.radar_demo_reveal_nominal_identification_v1(uuid,text,bigint) to authenticated;
CREATE OR REPLACE FUNCTION public.radar_demo_reveal_nominal_identification_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint)
returns text language sql security invoker set search_path='' as $$ select private.radar_demo_reveal_nominal_identification_v1(p_demo_campaign,p_municipality_code,p_voter_id); $$;
revoke all on function public.radar_demo_reveal_nominal_identification_v1(uuid,text,bigint) from public,anon;
grant execute on function public.radar_demo_reveal_nominal_identification_v1(uuid,text,bigint) to authenticated;
CREATE OR REPLACE FUNCTION private.radar_demo_authorized_nominal_availability_v1(p_demo_campaign uuid, p_municipality_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('municipality_code',p_municipality_code,
    'available',s.total_count is not null,'total_count',coalesce(s.total_count,0),
    'source_year',2023,'read_only',true,'communities',coalesce(s.communities,'[]'::jsonb))
  from public.municipalities m
  left join (campaign_vault.national_register_municipal_stats s
    join campaign_vault.national_register_sources src on src.id=s.source_id and src.active)
    on s.municipality_id=m.id
  where m.country_code='GT' and m.municipality_code=p_municipality_code
    and private.can_read_demo_directory(p_demo_campaign, m.id);
$function$
;
revoke all on function private.radar_demo_authorized_nominal_availability_v1(uuid,text) from public,anon;
grant execute on function private.radar_demo_authorized_nominal_availability_v1(uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION public.radar_demo_authorized_nominal_availability_v1(p_demo_campaign uuid, p_municipality_code text)
returns jsonb language sql security invoker set search_path='' as $$ select private.radar_demo_authorized_nominal_availability_v1(p_demo_campaign,p_municipality_code); $$;
revoke all on function public.radar_demo_authorized_nominal_availability_v1(uuid,text) from public,anon;
grant execute on function public.radar_demo_authorized_nominal_availability_v1(uuid,text) to authenticated;
CREATE OR REPLACE FUNCTION private.demo_contact_workspace_scope(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint)
 RETURNS TABLE(source_id uuid, municipality_id uuid, record_id bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null or p_voter_id>=0 or p_voter_id=-9223372036854775808 then
    raise exception 'Contact not authorized' using errcode='42501';
  end if;
  return query select r.source_id,r.municipality_id,r.id
    from campaign_vault.national_register_2023 r
    join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
    join public.municipalities m on m.id=r.municipality_id
    where m.country_code='GT' and m.municipality_code=p_municipality_code
      and r.id=-p_voter_id and private.can_read_demo_directory(p_demo_campaign, m.id);
  if not found then raise exception 'Contact not authorized' using errcode='42501'; end if;
end;
$function$
;
revoke all on function private.demo_contact_workspace_scope(uuid,text,bigint) from public,anon;
grant execute on function private.demo_contact_workspace_scope(uuid,text,bigint) to authenticated;
CREATE OR REPLACE FUNCTION private.radar_demo_save_contact_profile_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint, p_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare scope record; entry record; clean jsonb := '{}'::jsonb; value text; stamp timestamptz;
begin
  if not private.can_manage_demo_campaign(p_demo_campaign) then raise exception 'DEMO_ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into strict scope from private.demo_contact_workspace_scope(p_demo_campaign, p_municipality_code,p_voter_id);
  if p_profile is null or jsonb_typeof(p_profile)<>'object' or octet_length(p_profile::text)>19000000 then
    raise exception 'Invalid contact profile';
  end if;
  for entry in select * from jsonb_each(p_profile) loop
    if entry.key not in ('photo_url','dpi_front_url','dpi_back_url','contact_status','phone_primary','phone_secondary',
      'exact_address','location_reference','confirmed_community','assigned_contact_id','assigned_person_name',
      'campaign_role','party_affiliation','notes','next_action','next_action_at','latitude','longitude') then
      raise exception 'Unsupported contact field: %',entry.key;
    end if;
    value := nullif(btrim(p_profile->>entry.key),'');
    if jsonb_typeof(entry.value) not in ('string','number','null') then raise exception 'Invalid field value'; end if;
    if entry.key in ('photo_url','dpi_front_url','dpi_back_url') then
      if value is not null and (length(value)>8400000 or
        not (value ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or value ~ '^https://[^[:space:]]+$')) then
        raise exception 'Invalid contact image';
      end if;
    elsif length(value)>12000 then raise exception 'Contact field too long'; end if;
    if entry.key='contact_status' and value is not null and value not in
      ('SIN_CONTACTO','CONTACTADO','INTERESADO','NO_INTERESADO','VOLUNTARIO','LIDER') then raise exception 'Invalid contact status'; end if;
    if entry.key='party_affiliation' and value is not null and value not in ('SI','NO') then raise exception 'Invalid affiliation value'; end if;
    -- No arbitrary campaign contact may be linked into this private workspace.
    if entry.key='assigned_contact_id' and value is not null then raise exception 'Use the workspace responsible name'; end if;
    if entry.key='next_action_at' and value is not null then stamp:=value::timestamptz; end if;
    if entry.key='latitude' and value is not null and not (value::numeric between -90 and 90) then raise exception 'Invalid latitude'; end if;
    if entry.key='longitude' and value is not null and not (value::numeric between -180 and 180) then raise exception 'Invalid longitude'; end if;
    clean := clean || jsonb_build_object(entry.key,value);
  end loop;
  clean := clean || jsonb_build_object('contact_status',coalesce(clean->>'contact_status','SIN_CONTACTO'));
  insert into demo_vault.contact_workspace_profiles as current (campaign_id,owner_id,source_id,record_id,municipality_id,profile)
    values(p_demo_campaign,auth.uid(),scope.source_id,scope.record_id,scope.municipality_id,clean)
    on conflict(campaign_id,owner_id,source_id,record_id) do update set profile=excluded.profile,updated_at=now();
  return jsonb_build_object('municipality_code',p_municipality_code,'voter_id',p_voter_id,'saved',true);
end;
$function$
;
revoke all on function private.radar_demo_save_contact_profile_v1(uuid,text,bigint,jsonb) from public,anon;
grant execute on function private.radar_demo_save_contact_profile_v1(uuid,text,bigint,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.radar_demo_save_contact_profile_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint, p_profile jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.radar_demo_save_contact_profile_v1(p_demo_campaign,p_municipality_code,p_voter_id,p_profile); $$;
revoke all on function public.radar_demo_save_contact_profile_v1(uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.radar_demo_save_contact_profile_v1(uuid,text,bigint,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION private.radar_demo_add_contact_interaction_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint, p_interaction jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare scope record; result_id uuid; kind text;
begin
  if not private.can_manage_demo_campaign(p_demo_campaign) then raise exception 'DEMO_ADMIN_REQUIRED' using errcode='42501'; end if;
  select * into strict scope from private.demo_contact_workspace_scope(p_demo_campaign, p_municipality_code,p_voter_id);
  if p_interaction is null or jsonb_typeof(p_interaction)<>'object' or octet_length(p_interaction::text)>40000 then
    raise exception 'Invalid contact interaction';
  end if;
  kind:=p_interaction->>'interaction_type';
  if kind is null or kind not in ('LLAMADA','VISITA','REUNION','MENSAJE','COMPROMISO','OTRA') then raise exception 'Invalid interaction type'; end if;
  if nullif(p_interaction->>'responsible_contact_id','') is not null then raise exception 'Use the workspace responsible name'; end if;
  insert into demo_vault.contact_workspace_interactions(campaign_id,owner_id,source_id,record_id,municipality_id,
    interaction_type,interaction_at,responsible_name,notes,commitment)
    values(p_demo_campaign,auth.uid(),scope.source_id,scope.record_id,scope.municipality_id,kind,
      coalesce(nullif(p_interaction->>'interaction_at','')::timestamptz,now()),
      nullif(p_interaction->>'responsible_name',''),nullif(p_interaction->>'notes',''),nullif(p_interaction->>'commitment',''))
    returning id into result_id;
  return jsonb_build_object('id',result_id,'municipality_code',p_municipality_code,'voter_id',p_voter_id);
end;
$function$
;
revoke all on function private.radar_demo_add_contact_interaction_v1(uuid,text,bigint,jsonb) from public,anon;
grant execute on function private.radar_demo_add_contact_interaction_v1(uuid,text,bigint,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.radar_demo_add_contact_interaction_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint, p_interaction jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.radar_demo_add_contact_interaction_v1(p_demo_campaign,p_municipality_code,p_voter_id,p_interaction); $$;
revoke all on function public.radar_demo_add_contact_interaction_v1(uuid,text,bigint,jsonb) from public,anon;
grant execute on function public.radar_demo_add_contact_interaction_v1(uuid,text,bigint,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION private.radar_demo_authorized_nominal_detail_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object('elector',jsonb_build_object('id',-r.id,'full_name',r.full_name,
    'community',r.community,'estimated_age_2026',case when r.age_base between 18 and 110 then r.age_base+3 end,
    'municipality_code',m.municipality_code,'municipality_name',m.municipality_name,
    'masked_identification',repeat('•',9)||right(r.identification,4)),
    'profile',coalesce(cp.profile,jsonb_build_object('contact_status','SIN_CONTACTO')),
    'interactions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'interaction_type',i.interaction_type,
      'interaction_at',i.interaction_at,'responsible_name',i.responsible_name,'notes',i.notes,'commitment',i.commitment)
      order by i.interaction_at desc,i.created_at desc) from demo_vault.contact_workspace_interactions i
      where i.campaign_id=p_demo_campaign and i.owner_id=(select auth.uid()) and i.source_id=r.source_id and i.record_id=r.id and i.municipality_id=m.id),'[]'::jsonb),
    'source_year',2023,'read_only',not private.can_manage_demo_campaign(p_demo_campaign),'workspace_kind','DEMO_CONTACT')
  from campaign_vault.national_register_2023 r
  join public.municipalities m on m.id=r.municipality_id
  join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
  left join demo_vault.contact_workspace_profiles cp on cp.campaign_id=p_demo_campaign and cp.owner_id=(select auth.uid())
    and cp.source_id=r.source_id and cp.record_id=r.id and cp.municipality_id=m.id
  where m.country_code='GT' and m.municipality_code=p_municipality_code
    and p_voter_id<0 and r.id=-(nullif(p_voter_id,-9223372036854775808)) and private.can_read_demo_directory(p_demo_campaign, m.id);
$function$
;
revoke all on function private.radar_demo_authorized_nominal_detail_v1(uuid,text,bigint) from public,anon;
grant execute on function private.radar_demo_authorized_nominal_detail_v1(uuid,text,bigint) to authenticated;
CREATE OR REPLACE FUNCTION public.radar_demo_authorized_nominal_detail_v1(p_demo_campaign uuid, p_municipality_code text, p_voter_id bigint)
returns jsonb language sql security invoker set search_path='' as $$ select private.radar_demo_authorized_nominal_detail_v1(p_demo_campaign,p_municipality_code,p_voter_id); $$;
revoke all on function public.radar_demo_authorized_nominal_detail_v1(uuid,text,bigint) from public,anon;
grant execute on function public.radar_demo_authorized_nominal_detail_v1(uuid,text,bigint) to authenticated;
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
      cp.profile->>'party_affiliation' as party_affiliation,
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
      and p_responsible is null
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
revoke all on function private.radar_demo_authorized_contact_directory_page_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) from public,anon;
grant execute on function private.radar_demo_authorized_contact_directory_page_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) to authenticated;
CREATE OR REPLACE FUNCTION public.radar_demo_authorized_contact_directory_page_v1(p_demo_campaign uuid, p_municipality_code text, p_query text DEFAULT NULL::text, p_dpi text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_age_min integer DEFAULT NULL::integer, p_age_max integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_affiliation text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_responsible uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25)
returns jsonb language sql security invoker set search_path='' as $$ select private.radar_demo_authorized_contact_directory_page_v1(p_demo_campaign,p_municipality_code,p_query,p_dpi,p_community,p_age_min,p_age_max,p_status,p_affiliation,p_role,p_responsible,p_offset,p_limit); $$;
revoke all on function public.radar_demo_authorized_contact_directory_page_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) from public,anon;
grant execute on function public.radar_demo_authorized_contact_directory_page_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) to authenticated;
CREATE OR REPLACE FUNCTION private.radar_demo_authorized_nominal_directory_v1(p_demo_campaign uuid, p_municipality_code text, p_query text DEFAULT NULL::text, p_dpi text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_age_min integer DEFAULT NULL::integer, p_age_max integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_affiliation text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_responsible uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25)
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
  muni uuid; source uuid; total bigint; items jsonb; filtered boolean;
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
  if filtered then
    select count(*) into total from campaign_vault.national_register_2023 r
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
      and p_responsible is null;
  end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id desc),'[]'::jsonb) into items from (
    select -r.id as id,r.full_name,r.community,
      case when r.age_base between 18 and 110 then r.age_base+3 end as estimated_age_2026,
      repeat('•',9)||right(r.identification,4) as masked_identification,
      coalesce(cp.profile->>'contact_status','SIN_CONTACTO') as contact_status,cp.profile->>'phone_primary' as phone_primary,
      cp.profile->>'assigned_person_name' as assigned_person_name,cp.profile->>'campaign_role' as campaign_role,
      cp.profile->>'party_affiliation' as party_affiliation,
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
      and p_responsible is null
    order by r.id offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,25),1),50)
  ) page;
  return jsonb_build_object('municipality_code',p_municipality_code,'items',items,
    'total_count',total,'source_year',2023);
end;
$function$
;
revoke all on function private.radar_demo_authorized_nominal_directory_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) from public,anon;
grant execute on function private.radar_demo_authorized_nominal_directory_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) to authenticated;
CREATE OR REPLACE FUNCTION public.radar_demo_authorized_nominal_directory_v1(p_demo_campaign uuid, p_municipality_code text, p_query text DEFAULT NULL::text, p_dpi text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_age_min integer DEFAULT NULL::integer, p_age_max integer DEFAULT NULL::integer, p_status text DEFAULT NULL::text, p_affiliation text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_responsible uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 25)
returns jsonb language sql security invoker set search_path='' as $$ select private.radar_demo_authorized_nominal_directory_v1(p_demo_campaign,p_municipality_code,p_query,p_dpi,p_community,p_age_min,p_age_max,p_status,p_affiliation,p_role,p_responsible,p_offset,p_limit); $$;
revoke all on function public.radar_demo_authorized_nominal_directory_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) from public,anon;
grant execute on function public.radar_demo_authorized_nominal_directory_v1(uuid,text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) to authenticated;

create trigger track_demo_saved_change after insert or update or delete on demo_vault.contact_workspace_profiles for each row execute function private.track_demo_saved_change();
create trigger track_demo_saved_change after insert or update or delete on demo_vault.contact_workspace_interactions for each row execute function private.track_demo_saved_change();
-- Extend current reset implementation without replacing concurrent RTD integrations.
do $$
declare d text;
begin
 select pg_get_functiondef('public.radar_admin_clients_core_v1(uuid,text,text,jsonb)'::regprocedure) into d;
 if position('contact_workspace_profiles' in d)=0 then
  d:=replace(d,'''pulse_snapshots'']','''pulse_snapshots'',''contact_workspace_profiles'',''contact_workspace_interactions'']');
  if position('contact_workspace_profiles' in d)=0 then raise exception 'Reset integration shape changed'; end if;
  execute d;
 end if;
 select pg_get_functiondef('private.reset_demo_campaign(uuid)'::regprocedure) into d;
 d:=replace(d,'delete from admin_vault.demo_usage where campaign_id=target_campaign;',
 'delete from demo_vault.contact_workspace_profiles where campaign_id=target_campaign;
  delete from demo_vault.contact_workspace_interactions where campaign_id=target_campaign;
  delete from admin_vault.demo_usage where campaign_id=target_campaign;');
 execute d;
end $$;

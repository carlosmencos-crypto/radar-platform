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
    -- Link only an active responsible contact inside the authorized campaign territory.
    if entry.key='assigned_contact_id' and value is not null then
      if not exists(select 1 from demo_vault.contacts c join public.campaigns p on p.id=c.campaign_id
        where c.id=value::uuid and c.active and p.municipality_id=scope.municipality_id and p.status='active'
        and p.id=p_demo_campaign) then
        raise exception 'Responsable no autorizado para esta campaña' using errcode='42501';
      end if;
    end if;
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

CREATE OR REPLACE FUNCTION private.radar_save_contact_profile_v1(p_municipality_code text, p_voter_id bigint, p_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare scope record; entry record; clean jsonb := '{}'::jsonb; value text; stamp timestamptz;
begin
  select * into strict scope from private.contact_workspace_scope(p_municipality_code,p_voter_id);
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
    -- Link only an active responsible contact inside the authorized campaign territory.
    if entry.key='assigned_contact_id' and value is not null then
      if not exists(select 1 from campaign_vault.contacts c join public.campaigns p on p.id=c.campaign_id
        where c.id=value::uuid and c.active and p.municipality_id=scope.municipality_id and p.status='active'
        and not p.is_demo and (private.is_campaign_member(p.id,array['campaign_admin','campaign_editor']) or (private.current_platform_role()='platform_admin' and private.can_read_data_vault('GT',p.municipality_id)))) then
        raise exception 'Responsable no autorizado para esta campaña' using errcode='42501';
      end if;
    end if;
    if entry.key='next_action_at' and value is not null then stamp:=value::timestamptz; end if;
    if entry.key='latitude' and value is not null and not (value::numeric between -90 and 90) then raise exception 'Invalid latitude'; end if;
    if entry.key='longitude' and value is not null and not (value::numeric between -180 and 180) then raise exception 'Invalid longitude'; end if;
    clean := clean || jsonb_build_object(entry.key,value);
  end loop;
  clean := clean || jsonb_build_object('contact_status',coalesce(clean->>'contact_status','SIN_CONTACTO'));
  insert into campaign_vault.contact_workspace_profiles as current (owner_id,source_id,record_id,municipality_id,profile)
    values(auth.uid(),scope.source_id,scope.record_id,scope.municipality_id,clean)
    on conflict(owner_id,source_id,record_id) do update set profile=excluded.profile,updated_at=now();
  return jsonb_build_object('municipality_code',p_municipality_code,'voter_id',p_voter_id,'saved',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.can_read_rtd_evidence(p_bucket text, p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
select auth.uid() is not null and exists (
 select 1 from public.day_d_evidence e
 join public.day_d_rtd_folios f on f.id=e.subject_id and e.subject_type='RTD' and f.campaign_id=e.campaign_id
 join public.day_d_jrv_assignments a on a.id=e.assignment_id and a.id=f.assignment_id and a.campaign_id=e.campaign_id
 join public.campaigns c on c.id=e.campaign_id and c.status='active'
 where e.bucket_id=p_bucket and e.object_path=p_path and f.is_demo=c.is_demo and a.is_demo=c.is_demo
 
 and ((c.is_demo and private.can_use_demo_campaign(c.id))
 or (not c.is_demo and (private.is_campaign_member(c.id,array['campaign_admin','campaign_editor','campaign_viewer']) or (private.current_platform_role()='platform_admin' and private.can_read_data_vault('GT',c.municipality_id)))))
);
$function$
;
CREATE OR REPLACE FUNCTION private.radar_rtd_evidence_list_v1(p_campaign_id uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or not exists (
  select 1 from public.campaigns c where c.id=p_campaign_id and c.status='active'
  and ((c.is_demo and private.can_use_demo_campaign(c.id)) or
  (not c.is_demo and (private.is_campaign_member(c.id,array['campaign_admin','campaign_editor','campaign_viewer']) or (private.current_platform_role()='platform_admin' and private.can_read_data_vault('GT',c.municipality_id)))))
 ) then raise exception 'Campaign not authorized' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(rows)) from (
  select e.id,e.subject_id as folio_id,e.bucket_id,e.object_path,e.file_name,e.mime_type,e.file_size,
   f.election_type,f.jrv_number,f.municipality_code,m.municipality_name,a.center_name,f.status,f.is_test
  from public.day_d_evidence e
  join public.day_d_rtd_folios f on f.id=e.subject_id and f.campaign_id=e.campaign_id and e.subject_type='RTD'
  join public.day_d_jrv_assignments a on a.id=e.assignment_id and a.id=f.assignment_id and a.campaign_id=e.campaign_id
  join public.campaigns c on c.id=e.campaign_id
  join public.municipalities m on m.id=c.municipality_id
  where e.campaign_id=p_campaign_id and f.is_demo=c.is_demo and a.is_demo=c.is_demo 
  order by f.jrv_number,f.election_type,e.id limit 500 offset greatest(coalesce(p_offset,0),0)
 ) rows),'[]'::jsonb);
end;
$function$
;


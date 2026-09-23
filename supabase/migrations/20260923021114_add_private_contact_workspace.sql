-- Private, owner-scoped annotations for the existing municipal contact directory.
-- Original source records are immutable. No campaign or source membership is fabricated.
create table campaign_vault.contact_workspace_profiles (
  owner_id uuid not null references auth.users(id),
  source_id uuid not null,
  record_id bigint not null,
  municipality_id uuid not null references public.municipalities(id),
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile)='object'),
  updated_at timestamptz not null default now(),
  primary key(owner_id,source_id,record_id),
  foreign key(source_id,record_id) references campaign_vault.national_register_2023(source_id,id)
);
create index contact_workspace_profiles_municipality_idx
  on campaign_vault.contact_workspace_profiles(owner_id,municipality_id,source_id,record_id);
create index contact_workspace_profiles_source_idx
  on campaign_vault.contact_workspace_profiles(source_id,record_id);
create table campaign_vault.contact_workspace_interactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  source_id uuid not null,
  record_id bigint not null,
  municipality_id uuid not null references public.municipalities(id),
  interaction_type text not null check (interaction_type in ('LLAMADA','VISITA','REUNION','MENSAJE','COMPROMISO','OTRA')),
  interaction_at timestamptz not null default now(),
  responsible_name text,
  notes text,
  commitment text,
  created_at timestamptz not null default now(),
  foreign key(source_id,record_id) references campaign_vault.national_register_2023(source_id,id)
);
create index contact_workspace_interactions_record_idx
  on campaign_vault.contact_workspace_interactions(owner_id,source_id,record_id,interaction_at desc);
create index contact_workspace_interactions_source_idx
  on campaign_vault.contact_workspace_interactions(source_id,record_id);
create index contact_workspace_interactions_municipality_idx
  on campaign_vault.contact_workspace_interactions(municipality_id);
alter table campaign_vault.contact_workspace_profiles enable row level security;
alter table campaign_vault.contact_workspace_interactions enable row level security;
revoke all on campaign_vault.contact_workspace_profiles,campaign_vault.contact_workspace_interactions from public,anon,authenticated;
create policy contact_workspace_profile_owner on campaign_vault.contact_workspace_profiles
  for all to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));
create policy contact_workspace_interaction_owner on campaign_vault.contact_workspace_interactions
  for all to authenticated using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));

-- A private helper checks actor, active source, municipality AND record on every write.
create function private.contact_workspace_scope(p_municipality_code text,p_voter_id bigint)
returns table(source_id uuid,municipality_id uuid,record_id bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if (select auth.uid()) is null or p_voter_id>=0 or p_voter_id=-9223372036854775808 then
    raise exception 'Contact not authorized' using errcode='42501';
  end if;
  return query select r.source_id,r.municipality_id,r.id
    from campaign_vault.national_register_2023 r
    join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
    join public.municipalities m on m.id=r.municipality_id
    where m.country_code='GT' and m.municipality_code=p_municipality_code
      and r.id=-p_voter_id and private.can_read_national_register(m.id);
  if not found then raise exception 'Contact not authorized' using errcode='42501'; end if;
end;
$$;
revoke all on function private.contact_workspace_scope(text,bigint) from public,anon,authenticated;

create function private.radar_save_contact_profile_v1(p_municipality_code text,p_voter_id bigint,p_profile jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
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
    -- No arbitrary campaign contact may be linked into this private workspace.
    if entry.key='assigned_contact_id' and value is not null then raise exception 'Use the workspace responsible name'; end if;
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
$$;

create function private.radar_add_contact_interaction_v1(p_municipality_code text,p_voter_id bigint,p_interaction jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare scope record; result_id uuid; kind text;
begin
  select * into strict scope from private.contact_workspace_scope(p_municipality_code,p_voter_id);
  if p_interaction is null or jsonb_typeof(p_interaction)<>'object' or octet_length(p_interaction::text)>40000 then
    raise exception 'Invalid contact interaction';
  end if;
  kind:=p_interaction->>'interaction_type';
  if kind is null or kind not in ('LLAMADA','VISITA','REUNION','MENSAJE','COMPROMISO','OTRA') then raise exception 'Invalid interaction type'; end if;
  if nullif(p_interaction->>'responsible_contact_id','') is not null then raise exception 'Use the workspace responsible name'; end if;
  insert into campaign_vault.contact_workspace_interactions(owner_id,source_id,record_id,municipality_id,
    interaction_type,interaction_at,responsible_name,notes,commitment)
    values(auth.uid(),scope.source_id,scope.record_id,scope.municipality_id,kind,
      coalesce(nullif(p_interaction->>'interaction_at','')::timestamptz,now()),
      nullif(p_interaction->>'responsible_name',''),nullif(p_interaction->>'notes',''),nullif(p_interaction->>'commitment',''))
    returning id into result_id;
  return jsonb_build_object('id',result_id,'municipality_code',p_municipality_code,'voter_id',p_voter_id);
end;
$$;
create function public.radar_save_contact_profile_v1(p_municipality_code text,p_voter_id bigint,p_profile jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.radar_save_contact_profile_v1(p_municipality_code,p_voter_id,p_profile);
$$;
create function public.radar_add_contact_interaction_v1(p_municipality_code text,p_voter_id bigint,p_interaction jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.radar_add_contact_interaction_v1(p_municipality_code,p_voter_id,p_interaction);
$$;
revoke all on function private.radar_save_contact_profile_v1(text,bigint,jsonb),
  private.radar_add_contact_interaction_v1(text,bigint,jsonb),
  public.radar_save_contact_profile_v1(text,bigint,jsonb),
  public.radar_add_contact_interaction_v1(text,bigint,jsonb) from public,anon;
grant execute on function private.radar_save_contact_profile_v1(text,bigint,jsonb),
  private.radar_add_contact_interaction_v1(text,bigint,jsonb),
  public.radar_save_contact_profile_v1(text,bigint,jsonb),
  public.radar_add_contact_interaction_v1(text,bigint,jsonb) to authenticated;

create or replace function private.radar_authorized_nominal_detail_v1(p_municipality_code text,p_voter_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('elector',jsonb_build_object('id',-r.id,'full_name',r.full_name,
    'community',r.community,'estimated_age_2026',case when r.age_base between 18 and 110 then r.age_base+3 end,
    'municipality_code',m.municipality_code,'municipality_name',m.municipality_name,
    'masked_identification',repeat('•',9)||right(r.identification,4)),
    'profile',coalesce(cp.profile,jsonb_build_object('contact_status','SIN_CONTACTO')),
    'interactions',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'interaction_type',i.interaction_type,
      'interaction_at',i.interaction_at,'responsible_name',i.responsible_name,'notes',i.notes,'commitment',i.commitment)
      order by i.interaction_at desc,i.created_at desc) from campaign_vault.contact_workspace_interactions i
      where i.owner_id=(select auth.uid()) and i.source_id=r.source_id and i.record_id=r.id and i.municipality_id=m.id),'[]'::jsonb),
    'source_year',2023,'read_only',false,'workspace_kind','PRIVATE_CONTACT')
  from campaign_vault.national_register_2023 r
  join public.municipalities m on m.id=r.municipality_id
  join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
  left join campaign_vault.contact_workspace_profiles cp on cp.owner_id=(select auth.uid())
    and cp.source_id=r.source_id and cp.record_id=r.id and cp.municipality_id=m.id
  where m.country_code='GT' and m.municipality_code=p_municipality_code
    and p_voter_id<0 and r.id=-(nullif(p_voter_id,-9223372036854775808)) and private.can_read_national_register(m.id);
$$;


create or replace function private.radar_authorized_nominal_directory_v1(
  p_municipality_code text, p_query text default null, p_dpi text default null,
  p_community text default null, p_age_min integer default null, p_age_max integer default null,
  p_status text default null, p_affiliation text default null, p_role text default null,
  p_responsible uuid default null, p_offset integer default 0, p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path = '' set work_mem='32MB' as $$
declare
  muni uuid; source uuid; total bigint; items jsonb; filtered boolean;
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
  if filtered then
    select count(*) into total from campaign_vault.national_register_2023 r
    left join campaign_vault.contact_workspace_profiles cp on cp.owner_id=(select auth.uid())
      and cp.source_id=r.source_id and cp.record_id=r.id and cp.municipality_id=muni
    where r.source_id=source and r.municipality_id=muni
      and (nullif(btrim(p_query),'') is null or lower(r.full_name) like '%'||lower(btrim(p_query))||'%')
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
    left join campaign_vault.contact_workspace_profiles cp on cp.owner_id=(select auth.uid())
      and cp.source_id=r.source_id and cp.record_id=r.id and cp.municipality_id=muni
    where r.source_id=source and r.municipality_id=muni
      and (nullif(btrim(p_query),'') is null or lower(r.full_name) like '%'||lower(btrim(p_query))||'%')
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
$$;


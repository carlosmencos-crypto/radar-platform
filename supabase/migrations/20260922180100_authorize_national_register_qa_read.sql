-- QA access uses the existing active platform-admin identity and municipal scope.
-- Campaign directories and their write RPCs remain unchanged.
alter table campaign_vault.national_register_municipal_stats
  add column communities jsonb not null default '[]'::jsonb;
create function private.can_read_national_register(p_municipality_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and exists (select 1 from public.profiles p where p.user_id=(select auth.uid())
      and p.is_active and p.platform_role='platform_admin')
    and private.can_read_data_vault('GT',p_municipality_id);
$$;
revoke all on function private.can_read_national_register(uuid) from public,anon,authenticated;

create function public.radar_authorized_nominal_availability_v1(p_municipality_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('municipality_code',p_municipality_code,
    'available',s.total_count is not null,'total_count',coalesce(s.total_count,0),
    'source_year',2023,'read_only',true,'communities',coalesce(s.communities,'[]'::jsonb))
  from public.municipalities m
  left join (campaign_vault.national_register_municipal_stats s
    join campaign_vault.national_register_sources src on src.id=s.source_id and src.active)
    on s.municipality_id=m.id
  where m.country_code='GT' and m.municipality_code=p_municipality_code
    and private.can_read_national_register(m.id);
$$;

create function public.radar_authorized_nominal_directory_v1(
  p_municipality_code text, p_query text default null, p_dpi text default null,
  p_community text default null, p_age_min integer default null, p_age_max integer default null,
  p_status text default null, p_affiliation text default null, p_role text default null,
  p_responsible uuid default null, p_offset integer default 0, p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
  if nullif(p_status,'') is not null and p_status<>'SIN_CONTACTO'
    or nullif(p_affiliation,'') is not null or nullif(p_role,'') is not null or p_responsible is not null then
    return jsonb_build_object('municipality_code',p_municipality_code,'items','[]'::jsonb,'total_count',0,'source_year',2023);
  end if;
  filtered := nullif(btrim(p_query),'') is not null or nullif(p_dpi,'') is not null
    or nullif(p_community,'') is not null or p_age_min is not null or p_age_max is not null;
  if filtered then
    select count(*) into total from campaign_vault.national_register_2023 r
    where r.source_id=source and r.municipality_id=muni
      and (nullif(btrim(p_query),'') is null or lower(r.full_name) like '%'||lower(btrim(p_query))||'%')
      and (nullif(p_dpi,'') is null or r.identification=regexp_replace(p_dpi,'[^0-9]','','g'))
      and (nullif(p_community,'') is null or r.community=p_community)
      and (p_age_min is null or (r.age_base between 18 and 110 and r.age_base+3>=p_age_min))
      and (p_age_max is null or (r.age_base between 18 and 110 and r.age_base+3<=p_age_max));
  end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id desc),'[]'::jsonb) into items from (
    select -r.id as id,r.full_name,r.community,
      case when r.age_base between 18 and 110 then r.age_base+3 end as estimated_age_2026,
      repeat('•',9)||right(r.identification,4) as masked_identification,
      'SIN_CONTACTO'::text as contact_status,null::text as phone_primary,
      null::text as assigned_person_name,null::text as campaign_role,null::text as party_affiliation,
      p_municipality_code as municipality_code,total as total_count
    from campaign_vault.national_register_2023 r
    where r.source_id=source and r.municipality_id=muni
      and (nullif(btrim(p_query),'') is null or lower(r.full_name) like '%'||lower(btrim(p_query))||'%')
      and (nullif(p_dpi,'') is null or r.identification=regexp_replace(p_dpi,'[^0-9]','','g'))
      and (nullif(p_community,'') is null or r.community=p_community)
      and (p_age_min is null or (r.age_base between 18 and 110 and r.age_base+3>=p_age_min))
      and (p_age_max is null or (r.age_base between 18 and 110 and r.age_base+3<=p_age_max))
    order by r.id offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,25),1),50)
  ) page;
  return jsonb_build_object('municipality_code',p_municipality_code,'items',items,
    'total_count',total,'source_year',2023);
end;
$$;

create function public.radar_authorized_nominal_detail_v1(p_municipality_code text,p_voter_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('elector',jsonb_build_object('id',-r.id,'full_name',r.full_name,
    'community',r.community,'estimated_age_2026',case when r.age_base between 18 and 110 then r.age_base+3 end,
    'municipality_code',m.municipality_code,'municipality_name',m.municipality_name,
    'masked_identification',repeat('•',9)||right(r.identification,4)),
    'profile',jsonb_build_object('contact_status','SIN_CONTACTO'),
    'interactions','[]'::jsonb,'source_year',2023,'read_only',true)
  from campaign_vault.national_register_2023 r
  join public.municipalities m on m.id=r.municipality_id
  join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
  where m.country_code='GT' and m.municipality_code=p_municipality_code
    and p_voter_id<0 and r.id=-p_voter_id and private.can_read_national_register(m.id);
$$;

create table campaign_vault.national_register_access_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null, municipality_id uuid not null,
  record_id bigint not null, accessed_at timestamptz not null default now()
);
alter table campaign_vault.national_register_access_log enable row level security;
revoke all on campaign_vault.national_register_access_log from public,anon,authenticated;
create function public.radar_reveal_nominal_identification_v1(p_municipality_code text,p_voter_id bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare value text; muni uuid;
begin
  select r.identification,m.id into value,muni from campaign_vault.national_register_2023 r
  join public.municipalities m on m.id=r.municipality_id
  join campaign_vault.national_register_sources s on s.id=r.source_id and s.active
  where m.country_code='GT' and m.municipality_code=p_municipality_code
    and p_voter_id<0 and r.id=-p_voter_id and private.can_read_national_register(m.id);
  if value is not null then
    insert into campaign_vault.national_register_access_log(actor_id,municipality_id,record_id)
      values(auth.uid(),muni,-p_voter_id);
  end if;
  return value;
end;
$$;
revoke all on function public.radar_authorized_nominal_availability_v1(text),
  public.radar_authorized_nominal_directory_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer),
  public.radar_authorized_nominal_detail_v1(text,bigint),
  public.radar_reveal_nominal_identification_v1(text,bigint) from public,anon;
grant execute on function public.radar_authorized_nominal_availability_v1(text),
  public.radar_authorized_nominal_directory_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer),
  public.radar_authorized_nominal_detail_v1(text,bigint),
  public.radar_reveal_nominal_identification_v1(text,bigint) to authenticated;

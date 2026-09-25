-- First real-municipality demo workspace. The route is fail-closed: a demo
-- requires one explicit demo membership and never falls back to a real campaign.

insert into public.campaigns (
  organization_id, country_code, municipality_id, name, slug, is_demo, status
)
select
  o.id, m.country_code, m.id,
  'RADAR Demo · San José 0509', 'radar-demo-0509', true, 'active'
from public.organizations o
join public.municipalities m
  on m.country_code = 'GT'
 and m.is_synthetic = false
 and m.municipality_code = '0509'
where o.is_platform_owner = true
  and not exists (
    select 1 from public.campaigns c
    where c.organization_id = o.id and c.slug = 'radar-demo-0509'
  );

do $$
begin
  if not exists (
    select 1
    from public.campaigns c
    join public.municipalities m on m.id = c.municipality_id
    where c.slug = 'radar-demo-0509'
      and c.is_demo = true
      and c.status = 'active'
      and m.country_code = 'GT'
      and m.is_synthetic = false
      and m.municipality_code = '0509'
  ) then
    raise exception 'RADAR_DEMO_0509_CAMPAIGN_INVARIANT';
  end if;
end
$$;

insert into public.campaign_members (campaign_id, user_id, member_role)
select c.id, u.id, 'demo_admin'
from public.campaigns c
join auth.users u on lower(u.email) = lower('carlos.mencos@gmail.com')
join public.municipalities m on m.id = c.municipality_id
where c.slug = 'radar-demo-0509'
  and c.is_demo = true
  and c.status = 'active'
  and m.country_code = 'GT'
  and m.municipality_code = '0509'
on conflict (campaign_id, user_id)
do update set member_role = excluded.member_role;

create or replace function private.can_use_demo_campaign(target_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with actor as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true
  )
  select exists (
    select 1
    from actor a
    join public.campaigns c
      on c.id = target_campaign and c.is_demo = true and c.status = 'active'
    left join public.campaign_members cm
      on cm.campaign_id = c.id and cm.user_id = a.user_id
    where a.platform_role = 'platform_admin'
       or (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
       or cm.member_role in ('demo_admin', 'demo_viewer')
  )
$$;

create or replace function private.can_manage_demo_campaign(target_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with actor as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true
  )
  select exists (
    select 1
    from actor a
    join public.campaigns c
      on c.id = target_campaign and c.is_demo = true and c.status = 'active'
    left join public.campaign_members cm
      on cm.campaign_id = c.id and cm.user_id = a.user_id
    where a.platform_role = 'platform_admin'
       or (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
       or cm.member_role = 'demo_admin'
  )
$$;

create or replace function private.radar_authorized_context(route_kind text, route_key text)
returns table (
  country_code text, municipality_id uuid, municipality_code text,
  municipality_name text, department_code text, department_name text,
  campaign_id uuid, campaign_name text, user_role text,
  permissions text[], is_demo boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with actor as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = (select auth.uid()) and p.is_active = true
  ), candidates as (
    select
      m.country_code, m.id as municipality_id,
      coalesce(m.municipality_code, lower(replace(m.synthetic_key, '_', '-'))) as municipality_code,
      m.municipality_name, coalesce(m.department_code, 'DEMO') as department_code,
      coalesce(m.department_name, 'Territorio sintético') as department_name,
      c.id as campaign_id, c.name as campaign_name,
      case
        when route_kind = 'demo' and cm.member_role in ('demo_admin','demo_viewer') then cm.member_role
        when a.platform_role = 'platform_admin' then 'platform_admin'
        when a.platform_role = 'organization_admin' and a.organization_id = c.organization_id then 'organization_admin'
        else cm.member_role
      end as user_role,
      c.is_demo, c.created_at,
      count(*) over () as candidate_count
    from actor a
    join public.campaigns c on c.status = 'active'
    join public.municipalities m on m.id = c.municipality_id
    left join public.campaign_members cm
      on cm.campaign_id = c.id and cm.user_id = a.user_id
    where (
      route_kind = 'municipality'
      and m.is_synthetic = false
      and m.municipality_code = route_key
      and c.is_demo = false
      and (
        a.platform_role = 'platform_admin'
        or (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
        or cm.user_id is not null
      )
    ) or (
      route_kind = 'demo'
      and c.is_demo = true
      and (
        (m.is_synthetic = true and m.synthetic_key = upper(replace(route_key, '-', '_')))
        or
        (m.is_synthetic = false and m.municipality_code = route_key)
      )
      and (
        (m.is_synthetic = false and cm.member_role in ('demo_admin','demo_viewer'))
        or
        (m.is_synthetic = true and (
          a.platform_role = 'platform_admin'
          or (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
          or cm.member_role in ('demo_admin','demo_viewer')
        ))
      )
    )
  ), authorized as (
    select *
    from candidates
    where (route_kind <> 'demo' or candidate_count = 1)
      and (
        route_kind = 'demo'
        or user_role in ('platform_admin','organization_admin','campaign_admin','campaign_editor','campaign_viewer')
      )
    order by (user_role is not null) desc, created_at
    limit 1
  )
  select
    a.country_code, a.municipality_id, a.municipality_code, a.municipality_name,
    a.department_code, a.department_name, a.campaign_id, a.campaign_name, a.user_role,
    case a.user_role
      when 'platform_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write','demo_vault:read','demo_vault:write','demo_vault:reset','admin:access']
      when 'organization_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write','demo_vault:read','demo_vault:write']
      when 'campaign_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write']
      when 'campaign_editor' then array['data_vault:read','campaign_vault:read','campaign_vault:write']
      when 'campaign_viewer' then array['data_vault:read','campaign_vault:read']
      when 'demo_admin' then array['data_vault:read','demo_vault:read','demo_vault:write','demo_vault:reset']
      when 'demo_viewer' then array['data_vault:read','demo_vault:read']
      else array[]::text[]
    end,
    a.is_demo
  from authorized a
  where a.user_role in (
    'platform_admin','organization_admin','campaign_admin','campaign_editor',
    'campaign_viewer','demo_admin','demo_viewer'
  )
$$;

create or replace function public.radar_authorized_layers_v2(route_kind text, route_key text)
returns table (
  layer_id text, period text, payload jsonb, source_status text,
  source_label text, synthetic_notice text
)
language sql
stable
set search_path = pg_catalog, public, data_vault, private, pg_temp
as $$
  with authorized_context as (
    select * from public.radar_authorized_context_v2(route_kind, route_key)
  )
  select r.layer_id, r.period, r.payload, r.source_status, r.source_label, null::text
  from authorized_context c
  join public.municipalities m on m.id = c.municipality_id and m.is_synthetic = false
  join data_vault.municipality_layer_records r
    on r.country_code = c.country_code and r.municipality_id = c.municipality_id
  union all
  select s.layer_id, s.period, s.payload, 'AVAILABLE'::text, null::text, s.synthetic_notice
  from authorized_context c
  join public.municipalities m on m.id = c.municipality_id and m.is_synthetic = true
  join data_vault.synthetic_municipality_layers s on s.municipality_id = c.municipality_id
$$;

create or replace function public.radar_municipality_geo_bundle_v2(
  route_kind text, route_key text, p_feature_types text[] default null
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, data_vault, private, pg_temp
as $$
  with authorized_context as (
    select * from public.radar_authorized_context_v2(route_kind, route_key)
    where country_code = 'GT' and municipality_code = route_key
    limit 1
  ), target as (
    select m.* from authorized_context c
    join public.municipalities m
      on m.id = c.municipality_id and m.country_code = c.country_code and m.is_synthetic = false
  )
  select jsonb_build_object(
    'municipality', jsonb_build_object(
      'id', m.id, 'country_code', m.country_code, 'municipality_code', m.municipality_code,
      'department_code', m.department_code, 'department_name', m.department_name,
      'municipality_name', m.municipality_name, 'slug', m.slug
    ),
    'feature_counts', coalesce((
      select jsonb_object_agg(x.feature_type, x.cnt order by x.feature_type)
      from (
        select gf.feature_type, count(*)::bigint as cnt
        from data_vault.geo_features gf
        where gf.country_code = m.country_code and gf.municipality_id = m.id
          and (p_feature_types is null or gf.feature_type = any(p_feature_types))
        group by gf.feature_type
      ) x
    ), '{}'::jsonb),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object(
        'feature_type', gf.feature_type, 'source_key', gf.source_key,
        'feature_name', gf.feature_name, 'latitude', gf.latitude, 'longitude', gf.longitude,
        'geometry_json', gf.geometry_json, 'properties', gf.properties,
        'source_id', gf.source_id, 'source_label', gf.source_label,
        'period', gf.period, 'updated_at', gf.updated_at
      ) order by gf.feature_type, gf.source_key)
      from data_vault.geo_features gf
      where gf.country_code = m.country_code and gf.municipality_id = m.id
        and (p_feature_types is null or gf.feature_type = any(p_feature_types))
    ), '[]'::jsonb)
  )
  from target m
  limit 1
$$;

create or replace function public.radar_authorized_voter_communities_v2(
  route_kind text, route_key text
)
returns table (
  municipality_code text, community_label text, community_normalized text,
  elector_count integer, average_age_base numeric, age_18_29 integer,
  age_30_44 integer, age_45_59 integer, age_60_plus integer, coverage_band text
)
language sql
stable
set search_path = pg_catalog, public, private, data_vault, pg_temp
as $$
  with authorized as (
    select municipality_id, municipality_code
    from public.radar_authorized_context_v2(route_kind, route_key)
    where municipality_code = route_key
    limit 1
  )
  select a.municipality_code, v.community_label, v.community_normalized,
         v.elector_count, v.average_age_base, v.age_18_29, v.age_30_44,
         v.age_45_59, v.age_60_plus, v.coverage_band
  from authorized a
  join data_vault.voter_roll_community_aggregates v
    on v.municipality_id = a.municipality_id and v.source_year = 2023
  order by v.elector_count desc, v.community_label
$$;

create or replace function public.radar_authorized_runtime_v9(route_kind text, route_key text)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, data_vault, private, pg_temp
as $$
  with context_row as materialized (
    select * from public.radar_authorized_context_v2(route_kind, route_key)
    where municipality_code = route_key
      and ((route_kind = 'demo' and is_demo = true) or (route_kind = 'municipality' and is_demo = false))
    limit 1
  ), target as materialized (
    select m.* from context_row c
    join public.municipalities m on m.id = c.municipality_id
    where m.country_code = 'GT' and m.is_synthetic = false
  ), layer_rows as materialized (
    select l.* from public.radar_authorized_layers_v2(route_kind, route_key) l
    where l.layer_id = any(array[
      'ROUTES_340','NUCLEO_ELECTORAL','RGM_SERVICIOS','INAB_FORESTAL',
      'CONRED_INFORM','CONAP_SIGAP','INE_CENSO_B2_B6','SESAN_TALLA',
      'PDM_PDMOT','MSPAS_SALUD','MINEDUC_ESCUELAS','MINFIN_HIST',
      'MINFIN_YTD','SNIP_2026','GUATECOMPRAS','ACTIVOS_RESUMEN','TSE_CENTROS_GEO'
    ]::text[])
  ), geo_features as materialized (
    select gf.* from target m
    join data_vault.geo_features gf on gf.country_code=m.country_code and gf.municipality_id=m.id
  ), geo_stats as (
    select count(*)::bigint feature_total,
      min(latitude) filter (where latitude is not null and longitude is not null) south,
      max(latitude) filter (where latitude is not null and longitude is not null) north,
      min(longitude) filter (where latitude is not null and longitude is not null) west,
      max(longitude) filter (where latitude is not null and longitude is not null) east,
      max(updated_at) updated_at
    from geo_features
  ), voter_rows as materialized (
    select v.*,
      case
        when v.source_year=2023 and v.source_product_id='GT_RADAR_PADRON_2023_AGREGADOS_340_v1' then 'PADRON_DETALLADO_2023'
        when v.source_year=2026 and v.source_product_id='GT_RADAR_PORTAL_MASTER_340_DASHBOARD_READY_v6' then 'NUCLEO_ELECTORAL_2026'
        else 'OTRO_UNIVERSO_DECLARADO'
      end universe
    from target m join data_vault.voter_roll_municipal_aggregates v on v.municipality_id=m.id
    where v.source_year in (2023,2026)
  ), demographics as (
    select jsonb_build_object(
      'municipality_code',m.municipality_code,'projection_year',d.projection_year,
      'reference_date',d.reference_date,'population_total',d.population_total,
      'population_male',d.population_male,'population_female',d.population_female,
      'source_product_id',d.source_product_id,'source_label',d.source_label
    ) value
    from target m join data_vault.municipality_demographic_aggregates d on d.municipality_id=m.id
    where d.projection_year=2026 and d.source_product_id='GT-TSE-ACUERDO-327-2026'
    limit 1
  ), elector_profile as (
    select to_jsonb(x) value from (
      select m.municipality_code,p.cutoff_at,p.total_active,p.women_active,p.men_active,
        p.women_literate,p.women_illiterate,p.men_literate,p.men_illiterate,
        p.age_total,p.age_women,p.age_men,p.source_id,p.source_label,p.source_status
      from target m join data_vault.tse_active_voter_profiles_2026 p on p.municipality_id=m.id
      order by p.cutoff_at desc limit 1
    ) x
  ), electoral_basis as (
    select (to_jsonb(b)-'municipality_id'-'created_at'-'updated_at')
      || jsonb_build_object('municipality_code',m.municipality_code) value
    from target m join data_vault.municipality_electoral_basis_2027 b on b.municipality_id=m.id
    limit 1
  ), intelligence as (
    select jsonb_set(p.profile,'{electoral_basis_2027}',coalesce(eb.value,'null'::jsonb),true) value,
           p.readiness_status
    from target m
    join data_vault.municipality_intelligence_profiles_v1 p on p.municipality_id=m.id
    left join electoral_basis eb on true
    limit 1
  ), readiness as (
    select jsonb_build_object(
      'municipality_code',route_key,
      'status',case when i.readiness_status='INTELLIGENCE_READY' then 'INTELLIGENCE_READY' else 'BLOCKED' end,
      'public_data_ready',coalesce(i.readiness_status='INTELLIGENCE_READY',false),
      'trep_ready',coalesce((select count(distinct layer_id)=6 from layer_rows where layer_id like 'TREP_%'),false),
      'campaign_connected',exists(select 1 from context_row where campaign_id is not null),
      'possible_voters_loaded',false,'possible_voters_count',0,
      'missing_requirements',jsonb_build_array('DEMO_PRIVATE_DIRECTORY')
    ) value
    from intelligence i
  )
  select jsonb_build_object(
    'context',to_jsonb(c),
    'layers',coalesce((select jsonb_agg(to_jsonb(l) order by l.layer_id) from layer_rows l),'[]'::jsonb),
    'geo',jsonb_build_object(
      'municipality',jsonb_build_object('id',m.id,'country_code',m.country_code,
        'municipality_code',m.municipality_code,'department_code',m.department_code,
        'department_name',m.department_name,'municipality_name',m.municipality_name,'slug',m.slug),
      'feature_counts',coalesce((select jsonb_object_agg(x.feature_type,x.cnt order by x.feature_type)
        from (select feature_type,count(*)::bigint cnt from geo_features group by feature_type) x),'{}'::jsonb),
      'feature_total',gs.feature_total,
      'bbox',case when gs.south is null or gs.north is null or gs.west is null or gs.east is null then null
        else jsonb_build_object('south',gs.south,'north',gs.north,'west',gs.west,'east',gs.east) end,
      'updated_at',gs.updated_at
    ),
    'voter_roll',jsonb_build_object(
      'municipality_code',m.municipality_code,
      'aggregates',coalesce((select jsonb_agg(to_jsonb(v)-'id'-'municipality_id'-'created_at' order by v.source_year) from voter_rows v),'[]'::jsonb),
      'coverage',jsonb_build_object(
        'detailed_2023',exists(select 1 from voter_rows where source_year=2023 and source_product_id='GT_RADAR_PADRON_2023_AGREGADOS_340_v1'),
        'active_2026',exists(select 1 from voter_rows where source_year=2026 and source_product_id='GT_RADAR_PORTAL_MASTER_340_DASHBOARD_READY_v6'),
        'community_detail_2023',exists(select 1 from data_vault.voter_roll_community_aggregates vc where vc.municipality_id=m.id and vc.source_year=2023)
      )
    ),
    'demographics',(select value from demographics),
    'elector_profile',(select value from elector_profile),
    'voting_centers',public.radar_authorized_voting_center_directory_v1(route_key),
    'intelligence_profile',(select value from intelligence),
    'client_readiness',(select value from readiness),
    'electoral_basis_2027',(select value from electoral_basis)
  )
  from context_row c join target m on true cross join geo_stats gs
  limit 1
$$;

revoke all on function public.radar_municipality_geo_bundle_v2(text,text,text[]) from public, anon;
revoke all on function public.radar_authorized_voter_communities_v2(text,text) from public, anon;
revoke all on function public.radar_authorized_runtime_v9(text,text) from public, anon;
grant execute on function public.radar_municipality_geo_bundle_v2(text,text,text[]) to authenticated;
grant execute on function public.radar_authorized_voter_communities_v2(text,text) to authenticated;
grant execute on function public.radar_authorized_runtime_v9(text,text) to authenticated;

-- Bring the demo workspace tables to the same application contract without
-- moving or rewriting any existing demo rows.
alter table demo_vault.activities
  add column if not exists details jsonb not null default '{}'::jsonb;
alter table demo_vault.contacts
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists contact_type text not null default 'CONTACTO',
  add column if not exists active boolean not null default true,
  add column if not exists photo_url text,
  add column if not exists identification text,
  add column if not exists social_url text,
  add column if not exists file_code text,
  add column if not exists is_in_crm boolean not null default true,
  add column if not exists phone_secondary text,
  add column if not exists candidate_position text;

create table if not exists demo_vault.campaign_identity (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  candidate_name text, party_name text, party_logo_data_url text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_campaign_identity_logo_size check (
    party_logo_data_url is null or length(party_logo_data_url) <= 1400000
  )
);

create table if not exists demo_vault.campaign_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  module_key text not null, category text not null, title text not null,
  details text, status text not null default 'EN_PROCESO',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists demo_campaign_records_scope_idx
  on demo_vault.campaign_records(campaign_id,module_key,updated_at desc,id);
create index if not exists demo_campaign_identity_updated_by_idx
  on demo_vault.campaign_identity(updated_by);
create index if not exists demo_campaign_records_created_by_idx
  on demo_vault.campaign_records(created_by);
create index if not exists demo_contacts_scope_idx
  on demo_vault.contacts(campaign_id,active,full_name,id);
create unique index if not exists demo_strategy_scenario_key
  on demo_vault.strategy_items(campaign_id,item_type)
  where item_type in ('scenario_conservador','scenario_base','scenario_optimista');
alter table demo_vault.campaign_identity enable row level security;
alter table demo_vault.campaign_records enable row level security;
revoke all on demo_vault.campaign_identity, demo_vault.campaign_records from public, anon;
grant select,insert,update,delete on demo_vault.campaign_identity, demo_vault.campaign_records to authenticated;

drop policy if exists demo_campaign_identity_select on demo_vault.campaign_identity;
drop policy if exists demo_campaign_identity_write on demo_vault.campaign_identity;
drop policy if exists demo_campaign_identity_insert on demo_vault.campaign_identity;
drop policy if exists demo_campaign_identity_update on demo_vault.campaign_identity;
drop policy if exists demo_campaign_identity_delete on demo_vault.campaign_identity;
create policy demo_campaign_identity_select on demo_vault.campaign_identity
  for select to authenticated using ((select private.can_use_demo_campaign(campaign_id)));
create policy demo_campaign_identity_insert on demo_vault.campaign_identity
  for insert to authenticated
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_identity_update on demo_vault.campaign_identity
  for update to authenticated using ((select private.can_manage_demo_campaign(campaign_id)))
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_identity_delete on demo_vault.campaign_identity
  for delete to authenticated using ((select private.can_manage_demo_campaign(campaign_id)));

drop policy if exists demo_campaign_records_select on demo_vault.campaign_records;
drop policy if exists demo_campaign_records_write on demo_vault.campaign_records;
drop policy if exists demo_campaign_records_insert on demo_vault.campaign_records;
drop policy if exists demo_campaign_records_update on demo_vault.campaign_records;
drop policy if exists demo_campaign_records_delete on demo_vault.campaign_records;
create policy demo_campaign_records_select on demo_vault.campaign_records
  for select to authenticated using ((select private.can_use_demo_campaign(campaign_id)));
create policy demo_campaign_records_insert on demo_vault.campaign_records
  for insert to authenticated
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_records_update on demo_vault.campaign_records
  for update to authenticated using ((select private.can_manage_demo_campaign(campaign_id)))
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_records_delete on demo_vault.campaign_records
  for delete to authenticated using ((select private.can_manage_demo_campaign(campaign_id)));

create or replace function public.radar_campaign_bundle_v1(p_campaign_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
  select case
    when private.can_use_demo_campaign(p_campaign_id) then jsonb_build_object(
      'identity',coalesce((select to_jsonb(i)-'updated_by' from demo_vault.campaign_identity i where i.campaign_id=p_campaign_id),'{}'::jsonb),
      'activities',coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at nulls last,a.created_at) from demo_vault.activities a where a.campaign_id=p_campaign_id),'[]'::jsonb),
      'commitments',coalesce((select jsonb_agg(to_jsonb(c) order by c.due_date nulls last,c.created_at) from demo_vault.commitments c where c.campaign_id=p_campaign_id),'[]'::jsonb)
    )
    when private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor','campaign_viewer'])
      and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false)
    then jsonb_build_object(
      'identity',coalesce((select to_jsonb(i)-'updated_by' from campaign_vault.campaign_identity i where i.campaign_id=p_campaign_id),'{}'::jsonb),
      'activities',coalesce((select jsonb_agg(to_jsonb(a) order by a.starts_at nulls last,a.created_at) from campaign_vault.activities a where a.campaign_id=p_campaign_id),'[]'::jsonb),
      'commitments',coalesce((select jsonb_agg(to_jsonb(c) order by c.due_date nulls last,c.created_at) from campaign_vault.commitments c where c.campaign_id=p_campaign_id),'[]'::jsonb)
    )
    else null end
$$;

create or replace function public.radar_campaign_contacts_v1(p_campaign_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
  select case
    when private.can_use_demo_campaign(p_campaign_id) then coalesce((
      select jsonb_agg(to_jsonb(c)-'created_by' order by c.full_name,c.id)
      from demo_vault.contacts c where c.campaign_id=p_campaign_id and c.active
    ),'[]'::jsonb)
    when private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor','campaign_viewer'])
      and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false)
    then coalesce((select jsonb_agg(to_jsonb(c)-'created_by' order by c.full_name,c.id)
      from campaign_vault.contacts c where c.campaign_id=p_campaign_id and c.active),'[]'::jsonb)
    else null end
$$;

create or replace function public.radar_campaign_records_v1(p_campaign_id uuid,p_module_key text)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
  select case
    when private.can_use_demo_campaign(p_campaign_id) then coalesce((
      select jsonb_agg(to_jsonb(r)-'created_by' order by r.updated_at desc,r.id)
      from demo_vault.campaign_records r where r.campaign_id=p_campaign_id and r.module_key=p_module_key
    ),'[]'::jsonb)
    when private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor','campaign_viewer'])
      and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false)
    then coalesce((select jsonb_agg(to_jsonb(r)-'created_by' order by r.updated_at desc,r.id)
      from campaign_vault.campaign_records r where r.campaign_id=p_campaign_id and r.module_key=p_module_key),'[]'::jsonb)
    else null end
$$;

create or replace function public.radar_save_campaign_identity_v1(p_campaign_id uuid,p_identity jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
declare saved jsonb; logo text:=nullif(btrim(p_identity->>'party_logo_data_url'),'');
begin
  if logo is not null and (length(logo)>1400000 or logo !~ '^data:image/(png|jpeg|webp);base64,') then
    raise exception 'invalid campaign logo' using errcode='22023';
  end if;
  if private.can_manage_demo_campaign(p_campaign_id) then
    insert into demo_vault.campaign_identity as saved_row(campaign_id,candidate_name,party_name,party_logo_data_url,updated_by)
    values(p_campaign_id,nullif(btrim(p_identity->>'candidate_name'),''),nullif(btrim(p_identity->>'party_name'),''),logo,auth.uid())
    on conflict(campaign_id) do update set candidate_name=excluded.candidate_name,party_name=excluded.party_name,
      party_logo_data_url=excluded.party_logo_data_url,updated_by=auth.uid(),updated_at=now()
    returning to_jsonb(saved_row)-'updated_by' into saved;
  elsif private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor'])
    and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false) then
    insert into campaign_vault.campaign_identity as saved_row(campaign_id,candidate_name,party_name,party_logo_data_url,updated_by)
    values(p_campaign_id,nullif(btrim(p_identity->>'candidate_name'),''),nullif(btrim(p_identity->>'party_name'),''),logo,auth.uid())
    on conflict(campaign_id) do update set candidate_name=excluded.candidate_name,party_name=excluded.party_name,
      party_logo_data_url=excluded.party_logo_data_url,updated_by=auth.uid(),updated_at=now()
    returning to_jsonb(saved_row)-'updated_by' into saved;
  else raise exception 'campaign access denied' using errcode='42501'; end if;
  return saved;
end
$$;

create or replace function public.radar_save_activity_v1(p_campaign_id uuid,p_activity_id uuid,p_activity jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
declare saved jsonb; title_value text:=nullif(btrim(p_activity->>'title'),'');
  starts_value timestamptz:=nullif(p_activity->>'starts_at','')::timestamptz;
  latitude_value double precision:=nullif(p_activity->>'latitude','')::double precision;
  longitude_value double precision:=nullif(p_activity->>'longitude','')::double precision;
  details_value jsonb:=coalesce(p_activity->'details','{}'::jsonb);
begin
  if title_value is null then raise exception 'activity title required' using errcode='22023'; end if;
  if (latitude_value is null)<>(longitude_value is null) then raise exception 'activity coordinates must be paired' using errcode='22023'; end if;
  if latitude_value is not null and (latitude_value not between 13.5 and 18.0 or longitude_value not between -92.5 and -88.0) then raise exception 'activity coordinates outside Guatemala' using errcode='22023'; end if;
  if jsonb_typeof(details_value)<>'object' then raise exception 'activity details must be an object' using errcode='22023'; end if;
  if private.can_manage_demo_campaign(p_campaign_id) then
    if p_activity_id is null then
      insert into demo_vault.activities as saved_row(campaign_id,title,activity_type,starts_at,community,latitude,longitude,status,notes,details,created_by)
      values(p_campaign_id,title_value,nullif(btrim(p_activity->>'activity_type'),''),starts_value,nullif(btrim(p_activity->>'community'),''),latitude_value,longitude_value,coalesce(nullif(btrim(p_activity->>'status'),''),'PLANIFICADA'),nullif(btrim(p_activity->>'notes'),''),details_value,auth.uid()) returning to_jsonb(saved_row) into saved;
    else
      update demo_vault.activities as saved_row set title=title_value,activity_type=nullif(btrim(p_activity->>'activity_type'),''),starts_at=starts_value,
        community=nullif(btrim(p_activity->>'community'),''),latitude=case when p_activity?'latitude' then latitude_value else latitude end,
        longitude=case when p_activity?'longitude' then longitude_value else longitude end,status=coalesce(nullif(btrim(p_activity->>'status'),''),status),
        notes=nullif(btrim(p_activity->>'notes'),''),details=details_value,updated_at=now()
      where id=p_activity_id and campaign_id=p_campaign_id returning to_jsonb(saved_row) into saved;
    end if;
  elsif private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor'])
    and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false) then
    if p_activity_id is null then
      insert into campaign_vault.activities as saved_row(campaign_id,title,activity_type,starts_at,community,latitude,longitude,status,notes,details,created_by)
      values(p_campaign_id,title_value,nullif(btrim(p_activity->>'activity_type'),''),starts_value,nullif(btrim(p_activity->>'community'),''),latitude_value,longitude_value,coalesce(nullif(btrim(p_activity->>'status'),''),'PLANIFICADA'),nullif(btrim(p_activity->>'notes'),''),details_value,auth.uid()) returning to_jsonb(saved_row) into saved;
    else
      update campaign_vault.activities as saved_row set title=title_value,activity_type=nullif(btrim(p_activity->>'activity_type'),''),starts_at=starts_value,
        community=nullif(btrim(p_activity->>'community'),''),latitude=case when p_activity?'latitude' then latitude_value else latitude end,
        longitude=case when p_activity?'longitude' then longitude_value else longitude end,status=coalesce(nullif(btrim(p_activity->>'status'),''),status),
        notes=nullif(btrim(p_activity->>'notes'),''),details=details_value,updated_at=now()
      where id=p_activity_id and campaign_id=p_campaign_id returning to_jsonb(saved_row) into saved;
    end if;
  else raise exception 'campaign access denied' using errcode='42501'; end if;
  if saved is null then raise exception 'activity not found' using errcode='P0002'; end if;
  return saved;
end
$$;

create or replace function public.radar_delete_activity_v1(p_campaign_id uuid,p_activity_id uuid)
returns boolean language plpgsql
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
begin
  if private.can_manage_demo_campaign(p_campaign_id) then
    delete from demo_vault.activities where campaign_id=p_campaign_id and id=p_activity_id;
  elsif private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor'])
    and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false) then
    delete from campaign_vault.activities where campaign_id=p_campaign_id and id=p_activity_id;
  else raise exception 'campaign access denied' using errcode='42501'; end if;
  return found;
end
$$;

create or replace function public.radar_save_campaign_contact_v1(p_campaign_id uuid,p_contact_id uuid,p_contact jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
declare saved jsonb; name_value text:=nullif(btrim(p_contact->>'full_name'),'');
begin
  if name_value is null then raise exception 'contact name required' using errcode='22023'; end if;
  if private.can_manage_demo_campaign(p_campaign_id) then
    if p_contact_id is null then
      insert into demo_vault.contacts as saved_row(campaign_id,full_name,phone,phone_secondary,community,address_text,status,notes,email,role,contact_type,candidate_position,active,photo_url,identification,social_url,file_code,is_in_crm,created_by)
      values(p_campaign_id,name_value,nullif(btrim(p_contact->>'phone'),''),nullif(btrim(p_contact->>'phone_secondary'),''),nullif(btrim(p_contact->>'community'),''),nullif(btrim(p_contact->>'address_text'),''),coalesce(nullif(btrim(p_contact->>'status'),''),'base'),nullif(btrim(p_contact->>'notes'),''),nullif(btrim(p_contact->>'email'),''),nullif(btrim(p_contact->>'role'),''),coalesce(nullif(btrim(p_contact->>'contact_type'),''),'CONTACTO'),nullif(btrim(p_contact->>'candidate_position'),''),coalesce((p_contact->>'active')::boolean,true),nullif(btrim(p_contact->>'photo_url'),''),nullif(btrim(p_contact->>'identification'),''),nullif(btrim(p_contact->>'social_url'),''),nullif(btrim(p_contact->>'file_code'),''),coalesce((p_contact->>'is_in_crm')::boolean,true),auth.uid())
      returning to_jsonb(saved_row)-'created_by' into saved;
    else
      update demo_vault.contacts as saved_row set full_name=name_value,phone=nullif(btrim(p_contact->>'phone'),''),phone_secondary=nullif(btrim(p_contact->>'phone_secondary'),''),community=nullif(btrim(p_contact->>'community'),''),address_text=nullif(btrim(p_contact->>'address_text'),''),status=coalesce(nullif(btrim(p_contact->>'status'),''),status),notes=nullif(btrim(p_contact->>'notes'),''),email=nullif(btrim(p_contact->>'email'),''),role=nullif(btrim(p_contact->>'role'),''),contact_type=coalesce(nullif(btrim(p_contact->>'contact_type'),''),contact_type),candidate_position=nullif(btrim(p_contact->>'candidate_position'),''),active=coalesce((p_contact->>'active')::boolean,active),photo_url=nullif(btrim(p_contact->>'photo_url'),''),identification=nullif(btrim(p_contact->>'identification'),''),social_url=nullif(btrim(p_contact->>'social_url'),''),file_code=nullif(btrim(p_contact->>'file_code'),''),is_in_crm=coalesce((p_contact->>'is_in_crm')::boolean,is_in_crm),updated_at=now()
      where id=p_contact_id and campaign_id=p_campaign_id returning to_jsonb(saved_row)-'created_by' into saved;
    end if;
  elsif private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor'])
    and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false) then
    if p_contact_id is null then
      insert into campaign_vault.contacts as saved_row(campaign_id,full_name,phone,phone_secondary,community,address_text,status,notes,email,role,contact_type,candidate_position,active,photo_url,identification,social_url,file_code,is_in_crm,created_by)
      values(p_campaign_id,name_value,nullif(btrim(p_contact->>'phone'),''),nullif(btrim(p_contact->>'phone_secondary'),''),nullif(btrim(p_contact->>'community'),''),nullif(btrim(p_contact->>'address_text'),''),coalesce(nullif(btrim(p_contact->>'status'),''),'base'),nullif(btrim(p_contact->>'notes'),''),nullif(btrim(p_contact->>'email'),''),nullif(btrim(p_contact->>'role'),''),coalesce(nullif(btrim(p_contact->>'contact_type'),''),'CONTACTO'),nullif(btrim(p_contact->>'candidate_position'),''),coalesce((p_contact->>'active')::boolean,true),nullif(btrim(p_contact->>'photo_url'),''),nullif(btrim(p_contact->>'identification'),''),nullif(btrim(p_contact->>'social_url'),''),nullif(btrim(p_contact->>'file_code'),''),coalesce((p_contact->>'is_in_crm')::boolean,true),auth.uid())
      returning to_jsonb(saved_row)-'created_by' into saved;
    else
      update campaign_vault.contacts as saved_row set full_name=name_value,phone=nullif(btrim(p_contact->>'phone'),''),phone_secondary=nullif(btrim(p_contact->>'phone_secondary'),''),community=nullif(btrim(p_contact->>'community'),''),address_text=nullif(btrim(p_contact->>'address_text'),''),status=coalesce(nullif(btrim(p_contact->>'status'),''),status),notes=nullif(btrim(p_contact->>'notes'),''),email=nullif(btrim(p_contact->>'email'),''),role=nullif(btrim(p_contact->>'role'),''),contact_type=coalesce(nullif(btrim(p_contact->>'contact_type'),''),contact_type),candidate_position=nullif(btrim(p_contact->>'candidate_position'),''),active=coalesce((p_contact->>'active')::boolean,active),photo_url=nullif(btrim(p_contact->>'photo_url'),''),identification=nullif(btrim(p_contact->>'identification'),''),social_url=nullif(btrim(p_contact->>'social_url'),''),file_code=nullif(btrim(p_contact->>'file_code'),''),is_in_crm=coalesce((p_contact->>'is_in_crm')::boolean,is_in_crm),updated_at=now()
      where id=p_contact_id and campaign_id=p_campaign_id returning to_jsonb(saved_row)-'created_by' into saved;
    end if;
  else raise exception 'campaign access denied' using errcode='42501'; end if;
  if saved is null then raise exception 'contact not found' using errcode='P0002'; end if;
  return saved;
end
$$;

create or replace function public.radar_save_campaign_record_v1(p_campaign_id uuid,p_record_id uuid,p_record jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
declare saved jsonb; module_value text:=nullif(btrim(p_record->>'module_key'),''); category_value text:=nullif(btrim(p_record->>'category'),''); title_value text:=nullif(btrim(p_record->>'title'),''); payload_value jsonb:=coalesce(p_record->'payload','{}'::jsonb);
begin
  if module_value is null or category_value is null or title_value is null then raise exception 'module, category and title are required' using errcode='22023'; end if;
  if jsonb_typeof(payload_value)<>'object' then raise exception 'payload must be an object' using errcode='22023'; end if;
  if private.can_manage_demo_campaign(p_campaign_id) then
    if p_record_id is null then
      insert into demo_vault.campaign_records as saved_row(campaign_id,module_key,category,title,details,status,payload,created_by)
      values(p_campaign_id,module_value,category_value,title_value,nullif(btrim(p_record->>'details'),''),coalesce(nullif(btrim(p_record->>'status'),''),'EN_PROCESO'),payload_value,auth.uid()) returning to_jsonb(saved_row)-'created_by' into saved;
    else
      update demo_vault.campaign_records as saved_row set module_key=module_value,category=category_value,title=title_value,details=nullif(btrim(p_record->>'details'),''),status=coalesce(nullif(btrim(p_record->>'status'),''),status),payload=payload_value,updated_at=now()
      where id=p_record_id and campaign_id=p_campaign_id returning to_jsonb(saved_row)-'created_by' into saved;
    end if;
  elsif private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor'])
    and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false) then
    if p_record_id is null then
      insert into campaign_vault.campaign_records as saved_row(campaign_id,module_key,category,title,details,status,payload,created_by)
      values(p_campaign_id,module_value,category_value,title_value,nullif(btrim(p_record->>'details'),''),coalesce(nullif(btrim(p_record->>'status'),''),'EN_PROCESO'),payload_value,auth.uid()) returning to_jsonb(saved_row)-'created_by' into saved;
    else
      update campaign_vault.campaign_records as saved_row set module_key=module_value,category=category_value,title=title_value,details=nullif(btrim(p_record->>'details'),''),status=coalesce(nullif(btrim(p_record->>'status'),''),status),payload=payload_value,updated_at=now()
      where id=p_record_id and campaign_id=p_campaign_id returning to_jsonb(saved_row)-'created_by' into saved;
    end if;
  else raise exception 'campaign access denied' using errcode='42501'; end if;
  if saved is null then raise exception 'campaign record not found' using errcode='P0002'; end if;
  return saved;
end
$$;

create or replace function public.radar_delete_campaign_record_v1(p_campaign_id uuid,p_record_id uuid)
returns boolean language plpgsql
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
begin
  if private.can_manage_demo_campaign(p_campaign_id) then
    delete from demo_vault.campaign_records where campaign_id=p_campaign_id and id=p_record_id;
  elsif private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor'])
    and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false) then
    delete from campaign_vault.campaign_records where campaign_id=p_campaign_id and id=p_record_id;
  else raise exception 'campaign access denied' using errcode='42501'; end if;
  return found;
end
$$;

create or replace function public.radar_strategy_scenarios_v1(p_campaign_id uuid)
returns jsonb language sql stable
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
  select case
    when private.can_use_demo_campaign(p_campaign_id) then jsonb_build_object(
      'conservador',coalesce((select target_value from demo_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_conservador' limit 1),0),
      'base',coalesce((select target_value from demo_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_base' limit 1),0),
      'optimista',coalesce((select target_value from demo_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_optimista' limit 1),0))
    when private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor','campaign_viewer'])
      and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false) then jsonb_build_object(
      'conservador',coalesce((select target_value from campaign_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_conservador' limit 1),0),
      'base',coalesce((select target_value from campaign_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_base' limit 1),0),
      'optimista',coalesce((select target_value from campaign_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_optimista' limit 1),0))
    else null end
$$;

create or replace function public.radar_save_strategy_scenarios_v1(p_campaign_id uuid,p_scenarios jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, public, private, campaign_vault, demo_vault, pg_temp
as $$
declare key_value text; numeric_value numeric;
begin
  if not private.can_manage_demo_campaign(p_campaign_id)
    and not (private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor'])
      and exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.is_demo=false)) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  foreach key_value in array array['conservador','base','optimista'] loop
    numeric_value:=nullif(regexp_replace(coalesce(p_scenarios->>key_value,''),'[^0-9.]','','g'),'')::numeric;
    if numeric_value is not null and (numeric_value<0 or numeric_value>100000000) then raise exception 'invalid scenario value' using errcode='22023'; end if;
    if private.can_manage_demo_campaign(p_campaign_id) then
      insert into demo_vault.strategy_items(campaign_id,item_type,title,target_value,status)
      values(p_campaign_id,'scenario_'||key_value,initcap(key_value),numeric_value,'activo')
      on conflict(campaign_id,item_type) where item_type in ('scenario_conservador','scenario_base','scenario_optimista')
      do update set target_value=excluded.target_value,status='activo';
    else
      insert into campaign_vault.strategy_items(campaign_id,item_type,title,target_value,status)
      values(p_campaign_id,'scenario_'||key_value,initcap(key_value),numeric_value,'activo')
      on conflict(campaign_id,item_type) where item_type in ('scenario_conservador','scenario_base','scenario_optimista')
      do update set target_value=excluded.target_value,status='activo';
    end if;
  end loop;
  return public.radar_strategy_scenarios_v1(p_campaign_id);
end
$$;

-- The same private bucket remains safe because the first path segment is the
-- campaign UUID. Demo access is granted only for active demo campaigns.
drop policy if exists radar_campaign_vault_files_select on storage.objects;
drop policy if exists radar_campaign_vault_files_insert on storage.objects;
drop policy if exists radar_campaign_vault_files_update on storage.objects;
drop policy if exists radar_campaign_vault_files_delete on storage.objects;
create policy radar_campaign_vault_files_select on storage.objects for select to authenticated
using (bucket_id='radar-campaign-vault' and (
  private.is_campaign_member(((storage.foldername(name))[1])::uuid,array['campaign_admin','campaign_editor','campaign_viewer'])
  or private.can_use_demo_campaign(((storage.foldername(name))[1])::uuid)
));
create policy radar_campaign_vault_files_insert on storage.objects for insert to authenticated
with check (bucket_id='radar-campaign-vault' and (
  private.is_campaign_member(((storage.foldername(name))[1])::uuid,array['campaign_admin','campaign_editor'])
  or private.can_manage_demo_campaign(((storage.foldername(name))[1])::uuid)
));
create policy radar_campaign_vault_files_update on storage.objects for update to authenticated
using (bucket_id='radar-campaign-vault' and (
  private.is_campaign_member(((storage.foldername(name))[1])::uuid,array['campaign_admin','campaign_editor'])
  or private.can_manage_demo_campaign(((storage.foldername(name))[1])::uuid)
)) with check (bucket_id='radar-campaign-vault' and (
  private.is_campaign_member(((storage.foldername(name))[1])::uuid,array['campaign_admin','campaign_editor'])
  or private.can_manage_demo_campaign(((storage.foldername(name))[1])::uuid)
));
create policy radar_campaign_vault_files_delete on storage.objects for delete to authenticated
using (bucket_id='radar-campaign-vault' and (
  private.is_campaign_member(((storage.foldername(name))[1])::uuid,array['campaign_admin','campaign_editor'])
  or private.can_manage_demo_campaign(((storage.foldername(name))[1])::uuid)
));

notify pgrst, 'reload schema';

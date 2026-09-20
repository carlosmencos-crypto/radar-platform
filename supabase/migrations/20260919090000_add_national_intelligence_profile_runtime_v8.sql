-- One municipality, one intelligence contract.  The 17 canonical product layers
-- remain unchanged; this profile composes their validated national source detail
-- without creating a second visual implementation for Puerto San Jose.

create table if not exists data_vault.municipality_intelligence_profiles_v1 (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'GT' references public.countries(country_code),
  municipality_id uuid not null unique references public.municipalities(id) on delete cascade,
  profile jsonb not null,
  readiness_status text not null check (readiness_status in ('BLOCKED','INTELLIGENCE_READY')),
  missing_requirements text[] not null default array[]::text[],
  source_manifest jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint municipality_intelligence_profile_code_check
    check (profile ? 'municipality_code'),
  constraint municipality_intelligence_profile_sections_check
    check (
      profile ? 'active_voter_profile'
      and profile ? 'census_2018'
      and profile ? 'electoral_history'
      and profile ? 'community_catalog'
      and profile ? 'voting_centers'
    )
);

create index if not exists municipality_intelligence_profiles_v1_status_idx
  on data_vault.municipality_intelligence_profiles_v1(readiness_status, municipality_id);

alter table data_vault.municipality_intelligence_profiles_v1 enable row level security;
revoke all on data_vault.municipality_intelligence_profiles_v1 from public, anon, authenticated;
grant select on data_vault.municipality_intelligence_profiles_v1 to authenticated;

drop policy if exists municipality_intelligence_profiles_v1_authorized_read
  on data_vault.municipality_intelligence_profiles_v1;
create policy municipality_intelligence_profiles_v1_authorized_read
on data_vault.municipality_intelligence_profiles_v1
for select to authenticated
using (private.can_read_data_vault(country_code, municipality_id));

create or replace function public.radar_authorized_intelligence_profile_v1(p_municipality_code text)
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','public','data_vault','private','pg_temp'
as $function$
  select p.profile
  from public.radar_authorized_context_v2('municipality', p_municipality_code) c
  join public.municipalities m
    on m.country_code = c.country_code
   and m.municipality_code = c.municipality_code
  join data_vault.municipality_intelligence_profiles_v1 p
    on p.municipality_id = m.id
   and p.country_code = m.country_code
  where c.country_code = 'GT'
    and c.municipality_code = p_municipality_code
  limit 1;
$function$;

revoke all on function public.radar_authorized_intelligence_profile_v1(text) from public, anon;
grant execute on function public.radar_authorized_intelligence_profile_v1(text) to authenticated;

create or replace function public.radar_authorized_client_readiness_v1(p_municipality_code text)
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','public','data_vault','private','campaign_vault','pg_temp'
as $function$
  with context_row as (
    select *
    from public.radar_authorized_context_v2('municipality', p_municipality_code)
    where country_code = 'GT'
      and municipality_code = p_municipality_code
    limit 1
  ), municipality_row as (
    select m.id, c.campaign_id
    from context_row c
    join public.municipalities m
      on m.country_code = c.country_code
     and m.municipality_code = c.municipality_code
  ), profile_row as (
    select p.readiness_status
    from municipality_row m
    join data_vault.municipality_intelligence_profiles_v1 p on p.municipality_id = m.id
  ), trep as (
    select count(distinct l.layer_id)::integer as layer_count
    from municipality_row m
    join data_vault.municipality_layer_records l on l.municipality_id = m.id
    where l.layer_id in (
      'TREP_2023_CENTER_INDEX',
      'TREP_2023_CENTER_RESULTS_PRESIDENTE',
      'TREP_2023_CENTER_RESULTS_DIP_NAC',
      'TREP_2023_CENTER_RESULTS_DIP_DIST',
      'TREP_2023_CENTER_RESULTS_CORPORACION_MUNICIPAL',
      'TREP_2023_CENTER_RESULTS_DIP_PAR'
    )
      and l.source_status = 'DASHBOARD_READY'
  ), directory as (
    select coalesce(max(s.total_count), 0)::bigint as total_count
    from municipality_row m
    left join campaign_vault.voter_directory_stats s on s.campaign_id = m.campaign_id
  ), state as (
    select
      coalesce((select readiness_status = 'INTELLIGENCE_READY' from profile_row), false) as public_data_ready,
      coalesce((select layer_count = 6 from trep), false) as trep_ready,
      coalesce((select campaign_id is not null from municipality_row), false) as campaign_connected,
      coalesce((select total_count > 0 from directory), false) as possible_voters_loaded,
      coalesce((select total_count from directory), 0)::bigint as possible_voters_count
  )
  select jsonb_build_object(
    'municipality_code', p_municipality_code,
    'status', case
      when public_data_ready and trep_ready and campaign_connected and possible_voters_loaded then 'CLIENT_READY'
      when public_data_ready and trep_ready then 'INTELLIGENCE_READY'
      else 'BLOCKED'
    end,
    'public_data_ready', public_data_ready,
    'trep_ready', trep_ready,
    'campaign_connected', campaign_connected,
    'possible_voters_loaded', possible_voters_loaded,
    'possible_voters_count', possible_voters_count,
    'missing_requirements', to_jsonb(array_remove(array[
      case when not public_data_ready then 'NATIONAL_INTELLIGENCE_PROFILE' end,
      case when not trep_ready then 'TREP_2023_SIX_LAYERS' end,
      case when not campaign_connected then 'AUTHORIZED_CAMPAIGN' end,
      case when not possible_voters_loaded then 'CAMPAIGN_VOTER_DIRECTORY' end
    ], null))
  )
  from state;
$function$;

revoke all on function public.radar_authorized_client_readiness_v1(text) from public, anon;
grant execute on function public.radar_authorized_client_readiness_v1(text) to authenticated;

create or replace function public.radar_authorized_runtime_v8(p_municipality_code text)
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog','public','data_vault','private','campaign_vault','pg_temp'
as $function$
  with base as (
    -- Runtime v7 already contributes the validated TSE active-voter profile.
    -- Build on it instead of replacing or duplicating that contract.
    select public.radar_authorized_runtime_v7(p_municipality_code) as value
  ), profile as (
    select public.radar_authorized_intelligence_profile_v1(p_municipality_code) as value
  ), readiness as (
    select public.radar_authorized_client_readiness_v1(p_municipality_code) as value
  )
  select case
    when b.value is null then null
    else jsonb_set(
      jsonb_set(b.value, '{intelligence_profile}', coalesce(p.value, 'null'::jsonb), true),
      '{client_readiness}', coalesce(r.value, 'null'::jsonb), true
    )
  end
  from base b
  cross join profile p
  cross join readiness r;
$function$;

revoke all on function public.radar_authorized_runtime_v8(text) from public, anon;
grant execute on function public.radar_authorized_runtime_v8(text) to authenticated;

create or replace function public.radar_authorized_voter_roll_summary_v1(
  p_municipality_code text
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'data_vault', 'private', 'pg_temp'
as $function$
  with context_row as (
    select *
    from public.radar_authorized_context_v2('municipality', p_municipality_code)
    where country_code = 'GT'
      and municipality_code = p_municipality_code
    limit 1
  ),
  aggregate_rows as (
    select
      v.source_year,
      v.elector_count,
      v.community_count,
      v.average_age_base,
      v.age_missing_count,
      v.age_18_29,
      v.age_30_44,
      v.age_45_59,
      v.age_60_plus,
      v.reconciliation_delta,
      v.source_product_id,
      case
        when v.source_year = 2023
          and v.source_product_id = 'GT_RADAR_PADRON_2023_AGREGADOS_340_v1'
          then 'PADRON_DETALLADO_2023'
        when v.source_year = 2026
          and v.source_product_id = 'GT_RADAR_PORTAL_MASTER_340_DASHBOARD_READY_v6'
          then 'NUCLEO_ELECTORAL_2026'
        else 'OTRO_UNIVERSO_DECLARADO'
      end as universe
    from context_row c
    join data_vault.voter_roll_municipal_aggregates v
      on v.municipality_id = c.municipality_id
    where v.source_year in (2023, 2026)
  ),
  aggregate_json as (
    select coalesce(jsonb_agg(to_jsonb(a) order by a.source_year), '[]'::jsonb) as value
    from aggregate_rows a
  ),
  coverage as (
    select jsonb_build_object(
      'detailed_2023', exists (
        select 1 from aggregate_rows
        where source_year = 2023
          and source_product_id = 'GT_RADAR_PADRON_2023_AGREGADOS_340_v1'
      ),
      'active_2026', exists (
        select 1 from aggregate_rows
        where source_year = 2026
          and source_product_id = 'GT_RADAR_PORTAL_MASTER_340_DASHBOARD_READY_v6'
      ),
      'community_detail_2023', exists (
        select 1
        from context_row c
        join data_vault.voter_roll_community_aggregates vc
          on vc.municipality_id = c.municipality_id
        where vc.source_year = 2023
      )
    ) as value
  )
  select jsonb_build_object(
    'municipality_code', c.municipality_code,
    'aggregates', a.value,
    'coverage', cv.value
  )
  from context_row c
  cross join aggregate_json a
  cross join coverage cv
  limit 1;
$function$;

revoke all on function public.radar_authorized_voter_roll_summary_v1(text) from public;
revoke all on function public.radar_authorized_voter_roll_summary_v1(text) from anon;
grant execute on function public.radar_authorized_voter_roll_summary_v1(text) to authenticated;

create or replace function public.radar_authorized_runtime_v4(
  p_municipality_code text
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'data_vault', 'private', 'pg_temp'
as $function$
  with base as (
    select public.radar_authorized_runtime_v3(p_municipality_code) as value
  ),
  voter as (
    select public.radar_authorized_voter_roll_summary_v1(p_municipality_code) as value
  )
  select case
    when b.value is null then null
    else b.value || jsonb_build_object('voter_roll', v.value)
  end
  from base b
  cross join voter v;
$function$;

revoke all on function public.radar_authorized_runtime_v4(text) from public;
revoke all on function public.radar_authorized_runtime_v4(text) from anon;
grant execute on function public.radar_authorized_runtime_v4(text) to authenticated;

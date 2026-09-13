create or replace function public.radar_authorized_voting_center_directory_v1(p_municipality_code text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'data_vault', 'private', 'pg_temp'
as $function$
  with target as (
    select id, municipality_code
    from public.municipalities
    where country_code='GT' and municipality_code=p_municipality_code
    limit 1
  ), aggregated as (
    select
      l.center_correlative,
      min(l.center_name) as center_name,
      min(l.community) as community,
      min(l.address) as address,
      min(l.zone) as zone,
      sum(l.registered_voters)::bigint as registered_voters,
      min(l.jrv_initial) as jrv_initial,
      max(l.jrv_final) as jrv_final,
      sum(l.jrv_total)::bigint as jrv_total,
      string_agg(distinct l.institution, ' · ' order by l.institution) as institution,
      string_agg(distinct l.grouping_codes, ', ' order by l.grouping_codes) as grouping_codes,
      min(g.source_key) as geo_source_key,
      min(g.latitude) as latitude,
      min(g.longitude) as longitude
    from target t
    join data_vault.tse_voting_center_logistics_2023 l on l.municipality_id=t.id
    left join data_vault.geo_features g
      on g.municipality_id=t.id
     and g.feature_type='tse_voting_center'
     and nullif(g.properties->>'center_correlative','')::integer=l.center_correlative
    group by l.center_correlative
  )
  select jsonb_build_object(
    'municipality_code', p_municipality_code,
    'center_count', count(*),
    'jrv_total', coalesce(sum(jrv_total),0),
    'registered_voters_total', coalesce(sum(registered_voters),0),
    'centers', coalesce(jsonb_agg(
      jsonb_build_object(
        'center_correlative', center_correlative,
        'center_name', center_name,
        'community', community,
        'address', address,
        'zone', zone,
        'registered_voters', registered_voters,
        'jrv_initial', jrv_initial,
        'jrv_final', jrv_final,
        'jrv_total', jrv_total,
        'institution', institution,
        'grouping_codes', grouping_codes,
        'geo_source_key', geo_source_key,
        'latitude', latitude,
        'longitude', longitude
      ) order by center_correlative
    ), '[]'::jsonb)
  )
  from aggregated;
$function$;

revoke all on function public.radar_authorized_voting_center_directory_v1(text) from public;
grant execute on function public.radar_authorized_voting_center_directory_v1(text) to authenticated;

create or replace function public.radar_authorized_runtime_v6(p_municipality_code text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'data_vault', 'private', 'pg_temp'
as $function$
  with base as (
    select public.radar_authorized_runtime_v5(p_municipality_code) as value
  ),
  assets as (
    select coalesce(jsonb_agg(to_jsonb(l) order by l.layer_id), '[]'::jsonb) as value
    from public.radar_authorized_layers_v2('municipality', p_municipality_code) l
    where l.layer_id = 'ACTIVOS_RESUMEN'
      and coalesce(l.source_status, '') <> 'POST_LAUNCH'
      and coalesce(l.payload->>'data_present', 'false') = 'true'
  ),
  elector_profile as (
    select public.radar_authorized_active_voter_profile_v1(p_municipality_code) as value
  ),
  voting_centers as (
    select public.radar_authorized_voting_center_directory_v1(p_municipality_code) as value
  )
  select case
    when b.value is null then null
    else (
      jsonb_set(
        b.value,
        '{layers}',
        coalesce(b.value->'layers', '[]'::jsonb) || a.value,
        true
      ) || jsonb_build_object('elector_profile', ep.value, 'voting_centers', vc.value)
    )
  end
  from base b
  cross join assets a
  cross join elector_profile ep
  cross join voting_centers vc;
$function$;
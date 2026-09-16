create or replace function public.radar_municipality_geo_bundle(
  p_municipality_code text,
  p_feature_types text[] default null
)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'data_vault', 'private', 'pg_temp'
as $function$
  with authorized_context as (
    select *
    from public.radar_authorized_context_v2('municipality', p_municipality_code)
    where country_code = 'GT'
      and municipality_code = p_municipality_code
    limit 1
  ),
  target as (
    select m.*
    from authorized_context c
    join public.municipalities m
      on m.id = c.municipality_id
     and m.country_code = c.country_code
     and m.is_synthetic = false
  )
  select jsonb_build_object(
    'municipality', jsonb_build_object(
      'id', m.id,
      'country_code', m.country_code,
      'municipality_code', m.municipality_code,
      'department_code', m.department_code,
      'department_name', m.department_name,
      'municipality_name', m.municipality_name,
      'slug', m.slug
    ),
    'feature_counts', coalesce((
      select jsonb_object_agg(x.feature_type, x.cnt order by x.feature_type)
      from (
        select gf.feature_type, count(*)::bigint as cnt
        from data_vault.geo_features gf
        where gf.country_code = m.country_code
          and gf.municipality_id = m.id
          and (p_feature_types is null or gf.feature_type = any(p_feature_types))
        group by gf.feature_type
      ) x
    ), '{}'::jsonb),
    'features', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'feature_type', gf.feature_type,
          'source_key', gf.source_key,
          'feature_name', gf.feature_name,
          'latitude', gf.latitude,
          'longitude', gf.longitude,
          'geometry_json', gf.geometry_json,
          'properties', gf.properties,
          'source_id', gf.source_id,
          'source_label', gf.source_label,
          'period', gf.period,
          'updated_at', gf.updated_at
        ) order by gf.feature_type, gf.source_key
      )
      from data_vault.geo_features gf
      where gf.country_code = m.country_code
        and gf.municipality_id = m.id
        and (p_feature_types is null or gf.feature_type = any(p_feature_types))
    ), '[]'::jsonb)
  )
  from target m
  limit 1;
$function$;

revoke all on function public.radar_municipality_geo_bundle(text, text[]) from public;
revoke all on function public.radar_municipality_geo_bundle(text, text[]) from anon;
grant execute on function public.radar_municipality_geo_bundle(text, text[]) to authenticated;

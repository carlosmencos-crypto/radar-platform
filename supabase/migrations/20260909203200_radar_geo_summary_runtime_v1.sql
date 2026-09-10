create or replace function public.radar_municipality_geo_summary(
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
  ),
  filtered_geo as (
    select gf.*
    from target m
    join data_vault.geo_features gf
      on gf.country_code = m.country_code
     and gf.municipality_id = m.id
    where p_feature_types is null
       or gf.feature_type = any(p_feature_types)
  ),
  stats as (
    select
      count(*)::bigint as feature_total,
      min(latitude) filter (where latitude is not null and longitude is not null) as south,
      max(latitude) filter (where latitude is not null and longitude is not null) as north,
      min(longitude) filter (where latitude is not null and longitude is not null) as west,
      max(longitude) filter (where latitude is not null and longitude is not null) as east,
      max(updated_at) as updated_at
    from filtered_geo
  ),
  counts as (
    select coalesce(jsonb_object_agg(feature_type, cnt order by feature_type), '{}'::jsonb) as feature_counts
    from (
      select feature_type, count(*)::bigint as cnt
      from filtered_geo
      group by feature_type
    ) x
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
    'feature_counts', c.feature_counts,
    'feature_total', s.feature_total,
    'bbox', case
      when s.south is null or s.north is null or s.west is null or s.east is null then null
      else jsonb_build_object('south', s.south, 'north', s.north, 'west', s.west, 'east', s.east)
    end,
    'updated_at', s.updated_at
  )
  from target m
  cross join stats s
  cross join counts c
  limit 1;
$function$;

revoke all on function public.radar_municipality_geo_summary(text, text[]) from public;
revoke all on function public.radar_municipality_geo_summary(text, text[]) from anon;
grant execute on function public.radar_municipality_geo_summary(text, text[]) to authenticated;

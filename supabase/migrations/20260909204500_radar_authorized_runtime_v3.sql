create or replace function public.radar_authorized_runtime_v3(
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
  layer_rows as (
    select l.*
    from context_row c
    cross join lateral public.radar_authorized_layers_v2('municipality', c.municipality_code) l
  ),
  layers_json as (
    select coalesce(jsonb_agg(to_jsonb(l) order by l.layer_id), '[]'::jsonb) as value
    from layer_rows l
  ),
  geo_json as (
    select public.radar_municipality_geo_summary(c.municipality_code, null) as value
    from context_row c
  )
  select case
    when c.municipality_code is null then null
    else jsonb_build_object(
      'context', to_jsonb(c),
      'layers', lj.value,
      'geo', gj.value
    )
  end
  from context_row c
  cross join layers_json lj
  cross join geo_json gj
  limit 1;
$function$;

revoke all on function public.radar_authorized_runtime_v3(text) from public;
revoke all on function public.radar_authorized_runtime_v3(text) from anon;
grant execute on function public.radar_authorized_runtime_v3(text) to authenticated;

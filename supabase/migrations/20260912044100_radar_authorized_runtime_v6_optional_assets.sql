-- Runtime v6 preserves the 16-layer national baseline and appends ACTIVOS_RESUMEN
-- only where a validated, data-bearing source exists. This reconciles the five
-- canonical 17-layer municipalities without making absent data look like zero.

create or replace function public.radar_authorized_runtime_v6(p_municipality_code text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog','public','data_vault','private','pg_temp'
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
  )
  select case
    when b.value is null then null
    else jsonb_set(
      b.value,
      '{layers}',
      coalesce(b.value->'layers', '[]'::jsonb) || a.value,
      true
    )
  end
  from base b
  cross join assets a;
$function$;

revoke all on function public.radar_authorized_runtime_v6(text) from public;
revoke all on function public.radar_authorized_runtime_v6(text) from anon;
grant execute on function public.radar_authorized_runtime_v6(text) to authenticated;

-- Preserve all stored asset records while keeping POST_LAUNCH placeholders
-- out of the published municipal runtime contract.
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
      and (
        l.layer_id <> 'ACTIVOS_RESUMEN'
        or (
          coalesce(l.source_status, '') <> 'POST_LAUNCH'
          and coalesce(l.payload->>'data_present', 'false') = 'true'
        )
      )
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

revoke all on function public.radar_authorized_runtime_v9(text,text) from public, anon;
grant execute on function public.radar_authorized_runtime_v9(text,text) to authenticated;


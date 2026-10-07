do $guard$
begin
  if md5(pg_get_functiondef('public.radar_admin_national_rtd_v1(uuid,text,jsonb)'::regprocedure))
     <> 'c69d3ea71b0e4b708788610a1f06740e' then
    raise exception 'National RTD definition changed since audit; review before applying';
  end if;
end;
$guard$;

-- Fix the municipal reception table without changing canonical actas or national totals.
-- Aggregate assignments and reports independently to avoid a many-to-many join.
CREATE OR REPLACE FUNCTION public.radar_admin_national_rtd_v1(p_actor_user_id uuid, p_actor_role text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'admin_vault', 'campaign_vault', 'pg_temp'
AS $function$
declare
  payload jsonb;
  requested_election text := upper(nullif(btrim(p_input->>'election_type'), ''));
  election text;
  cycle integer := (p_input->>'election_cycle')::integer;
  round_no integer := (p_input->>'election_round')::integer;
  data_mode text := upper(coalesce(nullif(btrim(p_input->>'data_mode'), ''), 'REAL'));
begin
  if p_actor_role is distinct from 'super_admin' then
    raise exception 'Consolidado nacional exclusivo de superadministración' using errcode = '42501';
  end if;
  perform public.radar_admin_operator_context_v1(p_actor_user_id, p_actor_role);
  if not exists (
    select 1 from auth.users
    where id = p_actor_user_id
      and raw_app_meta_data->>'platform_role' = 'super_admin'
  ) then
    raise exception 'Actor no autorizado' using errcode = '42501';
  end if;

  election := case requested_election
    when 'ALCALDIA' then 'CORPORACION_MUNICIPAL'
    when 'DIPUTADOS_DISTRITO' then 'DIP_DIST'
    when 'DIPUTADOS_NACIONAL' then 'DIP_NAC'
    when 'PARLACEN' then 'DIP_PAR'
    else requested_election
  end;

  if election is null
     or election not in ('CORPORACION_MUNICIPAL', 'DIP_DIST', 'DIP_NAC', 'DIP_PAR', 'PRESIDENTE')
     or cycle is null or cycle not between 2023 and 2100
     or round_no is null or round_no not in (1, 2)
     or (election <> 'PRESIDENTE' and round_no <> 1)
     or data_mode not in ('REAL', 'DEMO') then
    raise exception 'Elección, año, vuelta o entorno no válidos';
  end if;

  with campaigns_in_scope as (
    select c.id, m.municipality_code, m.municipality_name, m.department_code
    from public.campaigns c
    join public.municipalities m on m.id = c.municipality_id
    where c.is_demo = (data_mode = 'DEMO')
      and c.status = 'active'
      and (data_mode = 'DEMO' or not m.is_synthetic)
      and (nullif(p_input->>'municipality_code', '') is null or m.municipality_code = p_input->>'municipality_code')
      and (nullif(p_input->>'department_code', '') is null or m.department_code = p_input->>'department_code')
  ), reports as (
    select
      f.*,
      c.municipality_name,
      c.department_code,
      coalesce(nullif(substring(f.catalog_version from '(20[0-9]{2})'), '')::integer, 2027) election_cycle,
      case when upper(f.catalog_version) ~ '(VUELTA[_ -]?2|SEGUNDA|ROUND[_ -]?2)' then 2 else 1 end election_round
    from public.day_d_rtd_folios f
    join campaigns_in_scope c on c.id = f.campaign_id
    where f.election_type = election
      and f.is_demo = (data_mode = 'DEMO')
      and not f.is_test
  ), selected_reports as (
    select * from reports
    where election_cycle = cycle and election_round = round_no
  ), vote_totals as (
    select
      r.id,
      coalesce(sum(v.votes), 0)::bigint valid_votes,
      count(v.id)::integer option_count,
      count(distinct v.option_code)::integer distinct_options,
      coalesce(bool_and(v.votes >= 0 and nullif(btrim(v.option_code), '') is not null), false) rows_valid
    from selected_reports r
    left join public.day_d_rtd_votes v on v.rtd_folio_id = r.id
    group by r.id
  ), checked as (
    select
      r.*,
      v.valid_votes,
      (
        r.status in ('ENVIADO', 'VALIDADO', 'CORREGIDO')
        and v.option_count > 0
        and v.option_count = v.distinct_options
        and v.rows_valid
        and r.blank_votes >= 0 and r.null_votes >= 0
        and r.total_digitized = v.valid_votes + r.blank_votes + r.null_votes
        and r.voters_present = r.total_digitized
        and r.ballots_received = r.voters_present + r.ballots_unused
      ) eligible,
      case
        when election = 'CORPORACION_MUNICIPAL' then r.municipality_code
        when election = 'DIP_DIST' then r.department_code
        else 'GT'
      end territory
    from selected_reports r
    join vote_totals v on v.id = r.id
  ), accepted as (
    select * from checked where eligible
  ), totals as (
    select
      a.territory,
      v.option_code party_id,
      min(coalesce(nullif(v.option_label, ''), v.option_code)) party_name,
      null::text candidate_name,
      sum(v.votes)::bigint votes
    from accepted a
    join public.day_d_rtd_votes v on v.rtd_folio_id = a.id
    group by a.territory, v.option_code
  ), assignment_rollup as (
    select
      assignment.campaign_id,
      count(*) filter (where assignment.active) fiscales
    from public.day_d_jrv_assignments assignment
    join campaigns_in_scope c on c.id = assignment.campaign_id
    where assignment.is_demo = (data_mode = 'DEMO')
    group by assignment.campaign_id
  ), report_rollup as (
    select
      report.campaign_id,
      count(*) received,
      count(*) filter (where report.eligible) counted,
      coalesce(sum(report.valid_votes) filter (where report.eligible), 0)::bigint valid_votes
    from checked report
    group by report.campaign_id
  ), municipality_rollup as (
    select
      c.municipality_code,
      c.municipality_name,
      c.department_code,
      coalesce(sum(assignment.fiscales), 0)::bigint fiscales,
      coalesce(sum(report.received), 0)::bigint received,
      coalesce(sum(report.counted), 0)::bigint counted,
      coalesce(sum(report.valid_votes), 0)::bigint valid_votes
    from campaigns_in_scope c
    left join assignment_rollup assignment on assignment.campaign_id = c.id
    left join report_rollup report on report.campaign_id = c.id
    group by c.municipality_code, c.municipality_name, c.department_code
  )
  select jsonb_build_object(
    'generated_at', now(),
    'election_type', election,
    'election_cycle', cycle,
    'election_round', round_no,
    'environment', data_mode,
    'summary', jsonb_build_object(
      'fiscales', (select count(distinct assignment.id) from public.day_d_jrv_assignments assignment join campaigns_in_scope c on c.id = assignment.campaign_id where assignment.active and assignment.is_demo = (data_mode = 'DEMO')),
      'municipalities', (select count(distinct municipality_code) from campaigns_in_scope),
      'reporting_municipalities', (select count(distinct municipality_code) from accepted),
      'received', (select count(*) from selected_reports),
      'counted', (select count(*) from accepted),
      'pending', (select count(*) from checked where not coalesce(eligible, false)),
      'conflicts', 0,
      'duplicates', 0,
      'missing_context', 0,
      'valid_votes', (select coalesce(sum(valid_votes), 0) from accepted),
      'blank_votes', (select coalesce(sum(blank_votes), 0) from accepted),
      'null_votes', (select coalesce(sum(null_votes), 0) from accepted),
      'last_report', (select max(coalesce(submitted_at, created_at)) from selected_reports)
    ),
    'results', (select coalesce(jsonb_agg(to_jsonb(t) order by territory, votes desc, party_id), '[]'::jsonb) from totals t),
    'territories', (select coalesce(jsonb_agg(to_jsonb(t) order by territory), '[]'::jsonb) from (select territory, count(*) actas, sum(valid_votes) valid_votes, sum(blank_votes) blank_votes, sum(null_votes) null_votes from accepted group by territory) t),
    'municipalities', (select coalesce(jsonb_agg(to_jsonb(m) order by municipality_code), '[]'::jsonb) from municipality_rollup m)
  ) into payload;

  return payload;
end;
$function$;


revoke all on function public.radar_admin_national_rtd_v1(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.radar_admin_national_rtd_v1(uuid, text, jsonb) to service_role;

-- Makes the fiscal portal RTD folio the single source of truth for both the
-- municipal Dia D workspace and the national superadmin consolidation.

create or replace function admin_vault.publish_day_d_rtd_folio(
  p_rtd_folio_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
declare
  folio_row public.day_d_rtd_folios%rowtype;
  assignment_row public.day_d_jrv_assignments%rowtype;
  target_schema text;
  mirror_id uuid;
  evidence_count integer;
  vote_rows jsonb;
  folio_payload jsonb;
begin
  select * into folio_row
  from public.day_d_rtd_folios
  where id = p_rtd_folio_id;

  if folio_row.id is null then
    return;
  end if;

  select * into assignment_row
  from public.day_d_jrv_assignments
  where id = folio_row.assignment_id;

  if assignment_row.id is null
     or assignment_row.campaign_id <> folio_row.campaign_id
     or assignment_row.is_demo <> folio_row.is_demo then
    raise exception 'El RTD fiscal no coincide con su asignación Día D';
  end if;

  target_schema := case when folio_row.is_demo then 'demo_vault' else 'campaign_vault' end;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'option_code', vote.option_code,
        'option_label', vote.option_label,
        'votes', vote.votes
      ) order by vote.option_code
    ),
    '[]'::jsonb
  ) into vote_rows
  from public.day_d_rtd_votes vote
  where vote.rtd_folio_id = folio_row.id;

  select count(*)::integer into evidence_count
  from public.day_d_evidence
  where subject_type = 'RTD_FOLIO'
    and subject_id = folio_row.id;

  folio_payload := jsonb_build_object(
    'source_rtd_folio_id', folio_row.id,
    'folio', folio_row.folio,
    'assignment_id', folio_row.assignment_id,
    'municipality_code', folio_row.municipality_code,
    'center_id', folio_row.center_id,
    'center_name', assignment_row.center_name,
    'jrv', folio_row.jrv_number,
    'fiscal_id', folio_row.fiscal_person_id,
    'fiscal_name', assignment_row.fiscal_name,
    'election_type', folio_row.election_type,
    'catalog_version', folio_row.catalog_version,
    'rtd_status', folio_row.status,
    'null_votes', folio_row.null_votes,
    'blank_votes', folio_row.blank_votes,
    'total_digitized', folio_row.total_digitized,
    'voters_present', folio_row.voters_present,
    'ballots_received', folio_row.ballots_received,
    'ballots_unused', folio_row.ballots_unused,
    'observations', folio_row.observations,
    'inconsistency', folio_row.inconsistency,
    'submitted_at', folio_row.submitted_at,
    'validated_at', folio_row.validated_at,
    'version', folio_row.version,
    'evidence_count', evidence_count,
    'votes', vote_rows,
    'is_demo', folio_row.is_demo,
    'is_test', folio_row.is_test
  );

  execute format(
    'update %I.campaign_records
       set title = $1,
           details = $2,
           status = $3,
           payload = $4,
           updated_at = now()
     where campaign_id = $5
       and module_key = ''dia-d''
       and category = ''RTD_FOLIO''
       and payload->>''source_rtd_folio_id'' = $6
     returning id',
    target_schema
  )
  into mirror_id
  using
    folio_row.folio || ' · ' || replace(folio_row.election_type, '_', ' '),
    assignment_row.center_name || ' · JRV ' || folio_row.jrv_number::text,
    folio_row.status,
    folio_payload,
    folio_row.campaign_id,
    folio_row.id::text;

  if mirror_id is null then
    execute format(
      'insert into %I.campaign_records(
         campaign_id, module_key, category, title, details, status, payload, created_by
       ) values ($1, ''dia-d'', ''RTD_FOLIO'', $2, $3, $4, $5, null)',
      target_schema
    ) using
      folio_row.campaign_id,
      folio_row.folio || ' · ' || replace(folio_row.election_type, '_', ' '),
      assignment_row.center_name || ' · JRV ' || folio_row.jrv_number::text,
      folio_row.status,
      folio_payload;
  end if;
end;
$$;

revoke all on function admin_vault.publish_day_d_rtd_folio(uuid) from public;

create or replace function admin_vault.sync_day_d_rtd_folio_dashboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
declare
  target_schema text;
begin
  if tg_op = 'DELETE' then
    target_schema := case when old.is_demo then 'demo_vault' else 'campaign_vault' end;
    execute format(
      'delete from %I.campaign_records
       where campaign_id = $1
         and module_key = ''dia-d''
         and category = ''RTD_FOLIO''
         and payload->>''source_rtd_folio_id'' = $2',
      target_schema
    ) using old.campaign_id, old.id::text;
    perform admin_vault.publish_day_d_assignment_status(old.assignment_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.is_demo <> new.is_demo or old.campaign_id <> new.campaign_id) then
    target_schema := case when old.is_demo then 'demo_vault' else 'campaign_vault' end;
    execute format(
      'delete from %I.campaign_records
       where campaign_id = $1
         and module_key = ''dia-d''
         and category = ''RTD_FOLIO''
         and payload->>''source_rtd_folio_id'' = $2',
      target_schema
    ) using old.campaign_id, old.id::text;
  end if;

  perform admin_vault.publish_day_d_rtd_folio(new.id);
  perform admin_vault.publish_day_d_assignment_status(new.assignment_id);
  if tg_op = 'UPDATE' and old.assignment_id <> new.assignment_id then
    perform admin_vault.publish_day_d_assignment_status(old.assignment_id);
  end if;
  return new;
end;
$$;

revoke all on function admin_vault.sync_day_d_rtd_folio_dashboard() from public;

drop trigger if exists sync_day_d_rtd_dashboard on public.day_d_rtd_folios;
create trigger sync_day_d_rtd_dashboard
after insert or update or delete on public.day_d_rtd_folios
for each row execute function admin_vault.sync_day_d_rtd_folio_dashboard();

create or replace function admin_vault.sync_day_d_rtd_vote_dashboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform admin_vault.publish_day_d_rtd_folio(old.rtd_folio_id);
    return old;
  end if;
  perform admin_vault.publish_day_d_rtd_folio(new.rtd_folio_id);
  if tg_op = 'UPDATE' and old.rtd_folio_id <> new.rtd_folio_id then
    perform admin_vault.publish_day_d_rtd_folio(old.rtd_folio_id);
  end if;
  return new;
end;
$$;

revoke all on function admin_vault.sync_day_d_rtd_vote_dashboard() from public;

drop trigger if exists sync_day_d_rtd_vote_dashboard on public.day_d_rtd_votes;
create trigger sync_day_d_rtd_vote_dashboard
after insert or update or delete on public.day_d_rtd_votes
for each row execute function admin_vault.sync_day_d_rtd_vote_dashboard();

create or replace function admin_vault.sync_day_d_rtd_evidence_dashboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.subject_type = 'RTD_FOLIO' then
      perform admin_vault.publish_day_d_rtd_folio(old.subject_id);
    end if;
    return old;
  end if;
  if new.subject_type = 'RTD_FOLIO' then
    perform admin_vault.publish_day_d_rtd_folio(new.subject_id);
  end if;
  return new;
end;
$$;

revoke all on function admin_vault.sync_day_d_rtd_evidence_dashboard() from public;

drop trigger if exists sync_day_d_rtd_evidence_dashboard on public.day_d_evidence;
create trigger sync_day_d_rtd_evidence_dashboard
after insert or delete on public.day_d_evidence
for each row execute function admin_vault.sync_day_d_rtd_evidence_dashboard();

create or replace function public.radar_admin_national_rtd_v1(
  p_actor_user_id uuid,
  p_actor_role text,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, pg_temp
as $$
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
  ), municipality_rollup as (
    select
      c.municipality_code,
      c.municipality_name,
      c.department_code,
      count(distinct assignment.id) filter (where assignment.active) fiscales,
      count(distinct report.id) received,
      count(distinct report.id) filter (where report.eligible) counted,
      coalesce(sum(report.valid_votes) filter (where report.eligible), 0)::bigint valid_votes
    from campaigns_in_scope c
    left join public.day_d_jrv_assignments assignment
      on assignment.campaign_id = c.id
     and assignment.is_demo = (data_mode = 'DEMO')
    left join checked report on report.campaign_id = c.id
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
$$;

revoke all on function public.radar_admin_national_rtd_v1(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.radar_admin_national_rtd_v1(uuid, text, jsonb) to service_role;

-- Backfill current RTD folios into their correct campaign vault.
do $$
declare
  folio_id uuid;
begin
  for folio_id in select id from public.day_d_rtd_folios loop
    perform admin_vault.publish_day_d_rtd_folio(folio_id);
  end loop;
end;
$$;

-- Publishes the hardened fiscal portal state into the scoped campaign records
-- consumed by the municipal Dia D dashboard. Real and demo universes remain
-- separated by the campaign's canonical is_demo flag.

create or replace function admin_vault.publish_day_d_assignment_status(
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
declare
  assignment_row public.day_d_jrv_assignments%rowtype;
  target_schema text;
  submitted_elections jsonb;
  rtd_statuses jsonb;
  status_patch jsonb;
begin
  select * into assignment_row
  from public.day_d_jrv_assignments
  where id = p_assignment_id;

  if assignment_row.id is null then
    return;
  end if;

  target_schema := case when assignment_row.is_demo then 'demo_vault' else 'campaign_vault' end;

  select coalesce(jsonb_agg(election_key order by election_key), '[]'::jsonb)
  into submitted_elections
  from (
    select distinct case election_type
      when 'DIP_DIST' then 'DIPUTADOS_DISTRITO'
      when 'DIP_NAC' then 'DIPUTADOS_NACIONAL'
      when 'DIP_PAR' then 'PARLACEN'
      else election_type
    end as election_key
    from public.day_d_rtd_folios
    where assignment_id = assignment_row.id
      and status <> 'BORRADOR'
  ) submitted;

  select coalesce(jsonb_object_agg(election_key, status), '{}'::jsonb)
  into rtd_statuses
  from (
    select distinct on (election_type)
      case election_type
        when 'DIP_DIST' then 'DIPUTADOS_DISTRITO'
        when 'DIP_NAC' then 'DIPUTADOS_NACIONAL'
        when 'DIP_PAR' then 'PARLACEN'
        else election_type
      end as election_key,
      status
    from public.day_d_rtd_folios
    where assignment_id = assignment_row.id
    order by election_type, updated_at desc
  ) latest;

  status_patch := jsonb_build_object(
    'checked_in', assignment_row.checked_in,
    'checked_in_at', assignment_row.checked_in_at,
    'checked_in_phone_at', assignment_row.checked_in_phone_at,
    'table_closed', assignment_row.table_closed,
    'table_closed_at', assignment_row.table_closed_at,
    'transport_ready', assignment_row.transport_ready,
    'transport_reported_at', assignment_row.transport_reported_at,
    'food_ready', assignment_row.food_ready,
    'food_reported_at', assignment_row.food_reported_at,
    'mobile_data_ready', assignment_row.mobile_data_ready,
    'mobile_data_source', assignment_row.mobile_data_source,
    'mobile_data_reported_at', assignment_row.mobile_data_reported_at,
    'support_needed', assignment_row.support_needed,
    'support_reported_at', assignment_row.support_reported_at,
    'last_fiscal_sync_at', assignment_row.last_fiscal_sync_at,
    'rtd_submitted', assignment_row.rtd_submitted,
    'rtd_submitted_at', assignment_row.rtd_submitted_at,
    'rtd_elections', submitted_elections,
    'rtd_statuses', rtd_statuses
  );

  execute format(
    'update %I.campaign_records
       set payload = payload || $1,
           updated_at = now()
     where id = $2
       and campaign_id = $3
       and module_key = ''dia-d''
       and category = ''ASIGNACION_JRV''',
    target_schema
  ) using status_patch, assignment_row.source_assignment_id, assignment_row.campaign_id;
end;
$$;

revoke all on function admin_vault.publish_day_d_assignment_status(uuid) from public;

create or replace function admin_vault.sync_day_d_assignment_dashboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
begin
  if tg_op <> 'DELETE' then
    perform admin_vault.publish_day_d_assignment_status(new.id);
    return new;
  end if;
  return old;
end;
$$;

revoke all on function admin_vault.sync_day_d_assignment_dashboard() from public;

drop trigger if exists sync_day_d_assignment_dashboard on public.day_d_jrv_assignments;
create trigger sync_day_d_assignment_dashboard
after insert or update on public.day_d_jrv_assignments
for each row execute function admin_vault.sync_day_d_assignment_dashboard();

create or replace function admin_vault.sync_day_d_rtd_dashboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform admin_vault.publish_day_d_assignment_status(old.assignment_id);
    return old;
  end if;

  perform admin_vault.publish_day_d_assignment_status(new.assignment_id);
  if tg_op = 'UPDATE' and old.assignment_id <> new.assignment_id then
    perform admin_vault.publish_day_d_assignment_status(old.assignment_id);
  end if;
  return new;
end;
$$;

revoke all on function admin_vault.sync_day_d_rtd_dashboard() from public;

drop trigger if exists sync_day_d_rtd_dashboard on public.day_d_rtd_folios;
create trigger sync_day_d_rtd_dashboard
after insert or update or delete on public.day_d_rtd_folios
for each row execute function admin_vault.sync_day_d_rtd_dashboard();

create or replace function admin_vault.publish_day_d_incident(
  p_incident_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
declare
  incident_row public.day_d_incidents%rowtype;
  assignment_row public.day_d_jrv_assignments%rowtype;
  target_schema text;
  mirror_id uuid;
  evidence_count integer;
  incident_payload jsonb;
begin
  select * into incident_row
  from public.day_d_incidents
  where id = p_incident_id;

  if incident_row.id is null then
    return;
  end if;

  select * into assignment_row
  from public.day_d_jrv_assignments
  where id = incident_row.assignment_id;

  if assignment_row.id is null
     or assignment_row.campaign_id <> incident_row.campaign_id
     or assignment_row.is_demo <> incident_row.is_demo then
    raise exception 'La incidencia fiscal no coincide con su asignación Día D';
  end if;

  target_schema := case when incident_row.is_demo then 'demo_vault' else 'campaign_vault' end;

  select count(*)::integer into evidence_count
  from public.day_d_evidence
  where subject_type = 'INCIDENT'
    and subject_id = incident_row.id;

  incident_payload := jsonb_build_object(
    'source_incident_id', incident_row.id,
    'folio', incident_row.folio,
    'assignment_id', incident_row.assignment_id,
    'center_id', incident_row.center_id,
    'center_name', assignment_row.center_name,
    'jrv', incident_row.jrv_number,
    'fiscal_id', incident_row.fiscal_person_id,
    'fiscal_name', assignment_row.fiscal_name,
    'occurred_at', incident_row.occurred_at,
    'category', incident_row.category,
    'description', incident_row.description,
    'urgency', incident_row.urgency,
    'incident_status', incident_row.status,
    'action_taken', incident_row.action_taken,
    'resolved_at', incident_row.resolved_at,
    'evidence_count', evidence_count,
    'is_demo', incident_row.is_demo,
    'is_test', incident_row.is_test
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
       and category = ''INCIDENCIA_FISCAL''
       and payload->>''source_incident_id'' = $6
     returning id',
    target_schema
  )
  into mirror_id
  using
    incident_row.folio || ' · ' || replace(incident_row.category, '_', ' '),
    incident_row.description,
    incident_row.status,
    incident_payload,
    incident_row.campaign_id,
    incident_row.id::text;

  if mirror_id is null then
    execute format(
      'insert into %I.campaign_records(
         campaign_id, module_key, category, title, details, status, payload, created_by
       ) values ($1, ''dia-d'', ''INCIDENCIA_FISCAL'', $2, $3, $4, $5, null)',
      target_schema
    ) using
      incident_row.campaign_id,
      incident_row.folio || ' · ' || replace(incident_row.category, '_', ' '),
      incident_row.description,
      incident_row.status,
      incident_payload;
  end if;
end;
$$;

revoke all on function admin_vault.publish_day_d_incident(uuid) from public;

create or replace function admin_vault.sync_day_d_incident_dashboard()
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
         and category = ''INCIDENCIA_FISCAL''
         and payload->>''source_incident_id'' = $2',
      target_schema
    ) using old.campaign_id, old.id::text;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.is_demo <> new.is_demo or old.campaign_id <> new.campaign_id) then
    target_schema := case when old.is_demo then 'demo_vault' else 'campaign_vault' end;
    execute format(
      'delete from %I.campaign_records
       where campaign_id = $1
         and module_key = ''dia-d''
         and category = ''INCIDENCIA_FISCAL''
         and payload->>''source_incident_id'' = $2',
      target_schema
    ) using old.campaign_id, old.id::text;
  end if;

  perform admin_vault.publish_day_d_incident(new.id);
  return new;
end;
$$;

revoke all on function admin_vault.sync_day_d_incident_dashboard() from public;

drop trigger if exists sync_day_d_incident_dashboard on public.day_d_incidents;
create trigger sync_day_d_incident_dashboard
after insert or update or delete on public.day_d_incidents
for each row execute function admin_vault.sync_day_d_incident_dashboard();

create or replace function admin_vault.sync_day_d_incident_evidence_dashboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.subject_type = 'INCIDENT' then
      perform admin_vault.publish_day_d_incident(old.subject_id);
    end if;
    return old;
  end if;

  if new.subject_type = 'INCIDENT' then
    perform admin_vault.publish_day_d_incident(new.subject_id);
  end if;
  return new;
end;
$$;

revoke all on function admin_vault.sync_day_d_incident_evidence_dashboard() from public;

drop trigger if exists sync_day_d_incident_evidence_dashboard on public.day_d_evidence;
create trigger sync_day_d_incident_evidence_dashboard
after insert or delete on public.day_d_evidence
for each row execute function admin_vault.sync_day_d_incident_evidence_dashboard();

-- Backfill previously recorded portal activity without changing the canonical rows.
do $$
declare
  assignment_id uuid;
  incident_id uuid;
begin
  for assignment_id in select id from public.day_d_jrv_assignments loop
    perform admin_vault.publish_day_d_assignment_status(assignment_id);
  end loop;
  for incident_id in select id from public.day_d_incidents loop
    perform admin_vault.publish_day_d_incident(incident_id);
  end loop;
end;
$$;

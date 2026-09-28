-- A municipality's real and demo campaigns are separate tenants even when they
-- share the same official municipality code. Enforce that invariant at the
-- database boundary so an API or UI regression cannot cross the two worlds.

create or replace function private.radar_enforce_vault_environment_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  campaign_demo boolean;
  expected_demo boolean := tg_table_schema = 'demo_vault';
begin
  select c.is_demo into campaign_demo
  from public.campaigns c
  where c.id = new.campaign_id;

  if campaign_demo is null then
    raise exception 'VAULT_CAMPAIGN_NOT_FOUND' using errcode = '23503';
  end if;
  if campaign_demo is distinct from expected_demo then
    raise exception 'VAULT_ENVIRONMENT_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.radar_enforce_vault_environment_v1() from public, anon, authenticated;

do $$
declare
  target record;
  has_mismatch boolean;
begin
  for target in
    select columns.table_schema, columns.table_name
    from information_schema.columns columns
    where columns.table_schema in ('campaign_vault', 'demo_vault')
      and columns.column_name = 'campaign_id'
    order by columns.table_schema, columns.table_name
  loop
    execute format(
      'select exists (
         select 1
         from %I.%I tenant_row
         left join public.campaigns campaign on campaign.id = tenant_row.campaign_id
         where campaign.id is null or campaign.is_demo is distinct from $1
       )',
      target.table_schema,
      target.table_name
    ) into has_mismatch using target.table_schema = 'demo_vault';

    if has_mismatch then
      raise exception 'Existing tenant rows violate real/demo isolation in %.%', target.table_schema, target.table_name;
    end if;

    execute format(
      'drop trigger if exists radar_vault_environment_guard on %I.%I',
      target.table_schema,
      target.table_name
    );
    execute format(
      'create trigger radar_vault_environment_guard
       before insert or update of campaign_id on %I.%I
       for each row execute function private.radar_enforce_vault_environment_v1()',
      target.table_schema,
      target.table_name
    );
  end loop;
end;
$$;

create or replace function private.radar_day_d_enforce_submission_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  assignment_row public.day_d_jrv_assignments%rowtype;
  campaign_demo boolean;
  campaign_municipality text;
  campaign_status text;
begin
  if tg_op = 'UPDATE' and new.assignment_id is distinct from old.assignment_id then
    raise exception 'DAY_D_ASSIGNMENT_IMMUTABLE' using errcode = '23514';
  end if;

  select * into assignment_row
  from public.day_d_jrv_assignments assignment
  where assignment.id = new.assignment_id;

  if assignment_row.id is null then
    raise exception 'DAY_D_ASSIGNMENT_NOT_FOUND' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' and not assignment_row.active then
    raise exception 'DAY_D_ASSIGNMENT_NOT_ACTIVE' using errcode = '23514';
  end if;

  select campaign.is_demo, municipality.municipality_code, campaign.status
  into campaign_demo, campaign_municipality, campaign_status
  from public.campaigns campaign
  join public.municipalities municipality on municipality.id = campaign.municipality_id
  where campaign.id = assignment_row.campaign_id;

  if campaign_demo is null then
    raise exception 'DAY_D_CAMPAIGN_NOT_FOUND' using errcode = '23503';
  end if;
  if tg_op = 'INSERT' and campaign_status <> 'active' then
    raise exception 'DAY_D_CAMPAIGN_NOT_ACTIVE' using errcode = '23514';
  end if;
  if assignment_row.is_demo is distinct from campaign_demo
     or assignment_row.municipality_code is distinct from campaign_municipality then
    raise exception 'DAY_D_ASSIGNMENT_ENVIRONMENT_MISMATCH' using errcode = '23514';
  end if;

  if new.campaign_id is distinct from assignment_row.campaign_id
     or new.municipality_code is distinct from assignment_row.municipality_code
     or new.is_demo is distinct from assignment_row.is_demo
     or new.center_id is distinct from assignment_row.center_id
     or new.jrv_number is distinct from assignment_row.jrv_number
     or new.fiscal_person_id is distinct from assignment_row.fiscal_person_id then
    raise exception 'DAY_D_SUBMISSION_SCOPE_MISMATCH' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.radar_day_d_lock_assignment_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.campaign_id is not distinct from old.campaign_id
     and new.municipality_code is not distinct from old.municipality_code
     and new.is_demo is not distinct from old.is_demo
     and new.center_id is not distinct from old.center_id
     and new.jrv_number is not distinct from old.jrv_number
     and new.fiscal_person_id is not distinct from old.fiscal_person_id then
    return new;
  end if;

  if exists (select 1 from public.day_d_rtd_folios where assignment_id = old.id)
     or exists (select 1 from public.day_d_incidents where assignment_id = old.id)
     or exists (select 1 from public.day_d_evidence where assignment_id = old.id) then
    raise exception 'DAY_D_ASSIGNMENT_SCOPE_LOCKED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.radar_day_d_enforce_grant_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare assignment_row public.day_d_jrv_assignments%rowtype;
begin
  if tg_op = 'UPDATE' and new.assignment_id is distinct from old.assignment_id then
    raise exception 'DAY_D_GRANT_ASSIGNMENT_IMMUTABLE' using errcode = '23514';
  end if;

  select * into assignment_row
  from public.day_d_jrv_assignments assignment
  where assignment.id = new.assignment_id;

  if assignment_row.id is null then
    raise exception 'DAY_D_ASSIGNMENT_NOT_FOUND' using errcode = '23503';
  end if;
  if new.campaign_id is distinct from assignment_row.campaign_id
     or new.municipality_code is distinct from assignment_row.municipality_code
     or new.demo_mode is distinct from assignment_row.is_demo
     or new.center_id is distinct from assignment_row.center_id
     or new.jrv_number is distinct from assignment_row.jrv_number
     or new.fiscal_person_id is distinct from assignment_row.fiscal_person_id then
    raise exception 'DAY_D_GRANT_SCOPE_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.radar_day_d_enforce_session_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare grant_row public.day_d_fiscal_access_grants%rowtype;
begin
  if tg_op = 'UPDATE' and new.access_grant_id is distinct from old.access_grant_id then
    raise exception 'DAY_D_SESSION_GRANT_IMMUTABLE' using errcode = '23514';
  end if;

  select * into grant_row
  from public.day_d_fiscal_access_grants access_grant
  where access_grant.id = new.access_grant_id;

  if grant_row.id is null then
    raise exception 'DAY_D_GRANT_NOT_FOUND' using errcode = '23503';
  end if;
  if new.assignment_id is distinct from grant_row.assignment_id
     or new.campaign_id is distinct from grant_row.campaign_id
     or new.municipality_code is distinct from grant_row.municipality_code
     or new.center_id is distinct from grant_row.center_id
     or new.jrv_number is distinct from grant_row.jrv_number
     or new.fiscal_person_id is distinct from grant_row.fiscal_person_id then
    raise exception 'DAY_D_SESSION_SCOPE_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.radar_day_d_enforce_evidence_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare assignment_row public.day_d_jrv_assignments%rowtype;
begin
  if tg_op = 'UPDATE' and (
       new.assignment_id is distinct from old.assignment_id
       or new.subject_type is distinct from old.subject_type
       or new.subject_id is distinct from old.subject_id
     ) then
    raise exception 'DAY_D_EVIDENCE_SUBJECT_IMMUTABLE' using errcode = '23514';
  end if;

  select * into assignment_row
  from public.day_d_jrv_assignments assignment
  where assignment.id = new.assignment_id;

  if assignment_row.id is null then
    raise exception 'DAY_D_ASSIGNMENT_NOT_FOUND' using errcode = '23503';
  end if;
  if new.campaign_id is distinct from assignment_row.campaign_id then
    raise exception 'DAY_D_EVIDENCE_CAMPAIGN_MISMATCH' using errcode = '23514';
  end if;
  if new.object_path not like assignment_row.municipality_code || '/' || assignment_row.campaign_id::text || '/%' then
    raise exception 'DAY_D_EVIDENCE_PATH_MISMATCH' using errcode = '23514';
  end if;

  if new.subject_type = 'INCIDENT' then
    if not exists (
      select 1 from public.day_d_incidents incident
      where incident.id = new.subject_id
        and incident.assignment_id = new.assignment_id
        and incident.campaign_id = new.campaign_id
    ) then
      raise exception 'DAY_D_EVIDENCE_INCIDENT_MISMATCH' using errcode = '23514';
    end if;
  elsif new.subject_type in ('RTD', 'RTD_FOLIO') then
    if not exists (
      select 1 from public.day_d_rtd_folios folio
      where folio.id = new.subject_id
        and folio.assignment_id = new.assignment_id
        and folio.campaign_id = new.campaign_id
    ) then
      raise exception 'DAY_D_EVIDENCE_RTD_MISMATCH' using errcode = '23514';
    end if;
  else
    raise exception 'DAY_D_EVIDENCE_SUBJECT_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.radar_day_d_enforce_submission_scope_v1() from public, anon, authenticated;
revoke all on function private.radar_day_d_lock_assignment_scope_v1() from public, anon, authenticated;
revoke all on function private.radar_day_d_enforce_grant_scope_v1() from public, anon, authenticated;
revoke all on function private.radar_day_d_enforce_session_scope_v1() from public, anon, authenticated;
revoke all on function private.radar_day_d_enforce_evidence_scope_v1() from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from public.day_d_rtd_folios folio
    join public.day_d_jrv_assignments assignment on assignment.id = folio.assignment_id
    where folio.campaign_id is distinct from assignment.campaign_id
       or folio.municipality_code is distinct from assignment.municipality_code
       or folio.is_demo is distinct from assignment.is_demo
       or folio.center_id is distinct from assignment.center_id
       or folio.jrv_number is distinct from assignment.jrv_number
       or folio.fiscal_person_id is distinct from assignment.fiscal_person_id
  ) then raise exception 'Existing RTD folios violate assignment isolation'; end if;

  if exists (
    select 1 from public.day_d_incidents incident
    join public.day_d_jrv_assignments assignment on assignment.id = incident.assignment_id
    where incident.campaign_id is distinct from assignment.campaign_id
       or incident.municipality_code is distinct from assignment.municipality_code
       or incident.is_demo is distinct from assignment.is_demo
       or incident.center_id is distinct from assignment.center_id
       or incident.jrv_number is distinct from assignment.jrv_number
       or incident.fiscal_person_id is distinct from assignment.fiscal_person_id
  ) then raise exception 'Existing incidents violate assignment isolation'; end if;

  if exists (
    select 1 from public.day_d_fiscal_access_grants access_grant
    join public.day_d_jrv_assignments assignment on assignment.id = access_grant.assignment_id
    where access_grant.campaign_id is distinct from assignment.campaign_id
       or access_grant.municipality_code is distinct from assignment.municipality_code
       or access_grant.demo_mode is distinct from assignment.is_demo
       or access_grant.center_id is distinct from assignment.center_id
       or access_grant.jrv_number is distinct from assignment.jrv_number
       or access_grant.fiscal_person_id is distinct from assignment.fiscal_person_id
  ) then raise exception 'Existing access grants violate assignment isolation'; end if;

  if exists (
    select 1 from public.day_d_fiscal_sessions fiscal_session
    join public.day_d_fiscal_access_grants access_grant on access_grant.id = fiscal_session.access_grant_id
    where fiscal_session.assignment_id is distinct from access_grant.assignment_id
       or fiscal_session.campaign_id is distinct from access_grant.campaign_id
       or fiscal_session.municipality_code is distinct from access_grant.municipality_code
       or fiscal_session.center_id is distinct from access_grant.center_id
       or fiscal_session.jrv_number is distinct from access_grant.jrv_number
       or fiscal_session.fiscal_person_id is distinct from access_grant.fiscal_person_id
  ) then raise exception 'Existing fiscal sessions violate grant isolation'; end if;

  if exists (
    select 1 from public.day_d_evidence evidence
    join public.day_d_jrv_assignments assignment on assignment.id = evidence.assignment_id
    where evidence.campaign_id is distinct from assignment.campaign_id
       or evidence.object_path not like assignment.municipality_code || '/' || assignment.campaign_id::text || '/%'
  ) then raise exception 'Existing evidence violates assignment isolation'; end if;
end;
$$;

drop trigger if exists day_d_assignment_scope_lock on public.day_d_jrv_assignments;
create trigger day_d_assignment_scope_lock
before update of campaign_id, municipality_code, is_demo, center_id, jrv_number, fiscal_person_id
on public.day_d_jrv_assignments
for each row execute function private.radar_day_d_lock_assignment_scope_v1();

drop trigger if exists day_d_rtd_scope_guard on public.day_d_rtd_folios;
create trigger day_d_rtd_scope_guard
before insert or update on public.day_d_rtd_folios
for each row execute function private.radar_day_d_enforce_submission_scope_v1();

drop trigger if exists day_d_incident_scope_guard on public.day_d_incidents;
create trigger day_d_incident_scope_guard
before insert or update on public.day_d_incidents
for each row execute function private.radar_day_d_enforce_submission_scope_v1();

drop trigger if exists day_d_grant_scope_guard on public.day_d_fiscal_access_grants;
create trigger day_d_grant_scope_guard
before insert or update on public.day_d_fiscal_access_grants
for each row execute function private.radar_day_d_enforce_grant_scope_v1();

drop trigger if exists day_d_session_scope_guard on public.day_d_fiscal_sessions;
create trigger day_d_session_scope_guard
before insert or update on public.day_d_fiscal_sessions
for each row execute function private.radar_day_d_enforce_session_scope_v1();

drop trigger if exists day_d_evidence_scope_guard on public.day_d_evidence;
create trigger day_d_evidence_scope_guard
before insert or update on public.day_d_evidence
for each row execute function private.radar_day_d_enforce_evidence_scope_v1();

-- Source: 20260918183000_add_pulse_scope_runtime.sql
-- Pulso Electoral: one source of truth with publication scope enforced server-side.
-- ALCALDIA is municipal, DIP_DIST is departmental, and the remaining elections
-- are national. Clients never receive rows outside their authorized territory.

create table if not exists data_vault.pulse_measurements (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  election_type text not null,
  scope_type text not null,
  country_code text not null default 'GT',
  department_code text,
  municipality_code text,
  field_start date,
  field_end date not null,
  sample_size integer not null,
  scope_label text not null,
  methodology text not null,
  source_label text not null default 'RADAR',
  status text not null default 'BORRADOR',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pulse_measurements_election_check check (
    election_type in ('ALCALDIA','PRESIDENTE','DIP_NAC','DIP_DIST','PARLACEN')
  ),
  constraint pulse_measurements_scope_check check (
    scope_type in ('MUNICIPALITY','DEPARTMENT','NATIONAL')
  ),
  constraint pulse_measurements_status_check check (
    status in ('BORRADOR','PUBLICADA','ARCHIVADA')
  ),
  constraint pulse_measurements_sample_check check (sample_size > 0),
  constraint pulse_measurements_dates_check check (
    field_start is null or field_start <= field_end
  ),
  constraint pulse_measurements_scope_integrity_check check (
    (
      election_type = 'ALCALDIA'
      and scope_type = 'MUNICIPALITY'
      and municipality_code ~ '^[0-9]{4}$'
      and department_code = left(municipality_code, 2)
    )
    or (
      election_type = 'DIP_DIST'
      and scope_type = 'DEPARTMENT'
      and municipality_code is null
      and department_code ~ '^[0-9]{2}$'
    )
    or (
      election_type in ('PRESIDENTE','DIP_NAC','PARLACEN')
      and scope_type = 'NATIONAL'
      and municipality_code is null
      and department_code is null
    )
  )
);

create table if not exists data_vault.pulse_results (
  id bigint generated always as identity primary key,
  measurement_id uuid not null references data_vault.pulse_measurements(id) on delete cascade,
  option_code text not null,
  candidate_name text not null,
  organization text,
  result_value numeric(6,2) not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pulse_results_measurement_option_key unique (measurement_id, option_code),
  constraint pulse_results_value_check check (result_value between 0 and 100)
);

create index if not exists pulse_measurements_visibility_idx
  on data_vault.pulse_measurements (
    status, country_code, scope_type, department_code, municipality_code,
    election_type, field_end desc
  );
create index if not exists pulse_results_measurement_order_idx
  on data_vault.pulse_results (measurement_id, display_order, id);

alter table data_vault.pulse_measurements enable row level security;
alter table data_vault.pulse_results enable row level security;

revoke all on data_vault.pulse_measurements from public, anon, authenticated;
revoke all on data_vault.pulse_results from public, anon, authenticated;
revoke all on sequence data_vault.pulse_results_id_seq from public, anon, authenticated;

create or replace function public.radar_authorized_pulse_v1(
  p_municipality_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, data_vault, pg_temp
as $$
declare
  ctx record;
  payload jsonb;
begin
  if p_municipality_code !~ '^[0-9]{4}$' then
    raise exception 'invalid municipality code' using errcode = '22023';
  end if;

  select * into ctx
  from public.radar_authorized_context_v2('municipality', p_municipality_code)
  limit 1;

  if ctx.municipality_code is null or ctx.campaign_id is null then
    raise exception 'pulse access denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', measurement.id,
      'folio', measurement.folio,
      'election_type', measurement.election_type,
      'scope_type', measurement.scope_type,
      'country_code', measurement.country_code,
      'department_code', measurement.department_code,
      'municipality_code', measurement.municipality_code,
      'field_start', measurement.field_start,
      'field_end', measurement.field_end,
      'sample_size', measurement.sample_size,
      'scope_label', measurement.scope_label,
      'methodology', measurement.methodology,
      'source_label', measurement.source_label,
      'results', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'option_code', result.option_code,
            'candidate_name', result.candidate_name,
            'organization', result.organization,
            'value', result.result_value
          ) order by result.display_order, result.id
        )
        from data_vault.pulse_results result
        where result.measurement_id = measurement.id
      ), '[]'::jsonb)
    ) order by measurement.field_end desc, measurement.folio
  ), '[]'::jsonb) into payload
  from data_vault.pulse_measurements measurement
  where measurement.status = 'PUBLICADA'
    and measurement.country_code = ctx.country_code
    and (
      (
        measurement.scope_type = 'MUNICIPALITY'
        and measurement.election_type = 'ALCALDIA'
        and measurement.municipality_code = ctx.municipality_code
      )
      or (
        measurement.scope_type = 'DEPARTMENT'
        and measurement.election_type = 'DIP_DIST'
        and measurement.department_code = ctx.department_code
      )
      or (
        measurement.scope_type = 'NATIONAL'
        and measurement.election_type in ('PRESIDENTE','DIP_NAC','PARLACEN')
      )
    );

  return payload;
end
$$;

create or replace function public.radar_admin_save_pulse_v1(
  p_measurement jsonb,
  p_results jsonb,
  p_measurement_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, data_vault, pg_temp
as $$
declare
  saved data_vault.pulse_measurements;
  election_value text := upper(nullif(btrim(p_measurement->>'election_type'), ''));
  status_value text := upper(coalesce(nullif(btrim(p_measurement->>'status'), ''), 'BORRADOR'));
  municipality_value text := nullif(btrim(p_measurement->>'municipality_code'), '');
  department_value text := nullif(btrim(p_measurement->>'department_code'), '');
  country_value text := upper(coalesce(nullif(btrim(p_measurement->>'country_code'), ''), 'GT'));
  scope_value text;
  result_total numeric;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.platform_role = 'platform_admin'
      and profile.is_active = true
  ) then
    raise exception 'pulse administration denied' using errcode = '42501';
  end if;

  if election_value = 'ALCALDIA' then
    scope_value := 'MUNICIPALITY';
    select municipality.country_code, municipality.department_code
      into country_value, department_value
    from public.municipalities municipality
    where municipality.municipality_code = municipality_value;
    if not found then
      raise exception 'unknown municipality scope' using errcode = '22023';
    end if;
  elsif election_value = 'DIP_DIST' then
    scope_value := 'DEPARTMENT';
    municipality_value := null;
    if department_value !~ '^[0-9]{2}$' or not exists (
      select 1 from public.municipalities municipality
      where municipality.country_code = country_value
        and municipality.department_code = department_value
    ) then
      raise exception 'unknown department scope' using errcode = '22023';
    end if;
  elsif election_value in ('PRESIDENTE','DIP_NAC','PARLACEN') then
    scope_value := 'NATIONAL';
    municipality_value := null;
    department_value := null;
  else
    raise exception 'invalid election type' using errcode = '22023';
  end if;

  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) < 2 then
    raise exception 'at least two pulse results are required' using errcode = '22023';
  end if;

  select sum(row_value.value) into result_total
  from jsonb_to_recordset(p_results) as row_value(value numeric);
  if result_total is null or result_total < 99 or result_total > 101 then
    raise exception 'pulse results must total approximately 100 percent' using errcode = '22023';
  end if;

  insert into data_vault.pulse_measurements (
    id, folio, election_type, scope_type, country_code, department_code,
    municipality_code, field_start, field_end, sample_size, scope_label,
    methodology, source_label, status, created_by, updated_by
  ) values (
    coalesce(p_measurement_id, gen_random_uuid()),
    nullif(btrim(p_measurement->>'folio'), ''), election_value, scope_value,
    country_value, department_value, municipality_value,
    nullif(p_measurement->>'field_start', '')::date,
    nullif(p_measurement->>'field_end', '')::date,
    nullif(p_measurement->>'sample_size', '')::integer,
    nullif(btrim(p_measurement->>'scope_label'), ''),
    nullif(btrim(p_measurement->>'methodology'), ''),
    coalesce(nullif(btrim(p_measurement->>'source_label'), ''), 'RADAR'),
    status_value, auth.uid(), auth.uid()
  )
  on conflict (id) do update set
    folio = excluded.folio,
    election_type = excluded.election_type,
    scope_type = excluded.scope_type,
    country_code = excluded.country_code,
    department_code = excluded.department_code,
    municipality_code = excluded.municipality_code,
    field_start = excluded.field_start,
    field_end = excluded.field_end,
    sample_size = excluded.sample_size,
    scope_label = excluded.scope_label,
    methodology = excluded.methodology,
    source_label = excluded.source_label,
    status = excluded.status,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into saved;

  delete from data_vault.pulse_results where measurement_id = saved.id;
  insert into data_vault.pulse_results (
    measurement_id, option_code, candidate_name, organization,
    result_value, display_order
  )
  select saved.id, row_value.option_code, row_value.candidate_name,
    nullif(btrim(row_value.organization), ''), row_value.value,
    row_number() over ()
  from jsonb_to_recordset(p_results) as row_value(
    option_code text,
    candidate_name text,
    organization text,
    value numeric
  );

  return jsonb_build_object(
    'id', saved.id,
    'folio', saved.folio,
    'scope_type', saved.scope_type,
    'status', saved.status
  );
end
$$;

revoke all on function public.radar_authorized_pulse_v1(text) from public, anon;
revoke all on function public.radar_admin_save_pulse_v1(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.radar_authorized_pulse_v1(text) to authenticated;
grant execute on function public.radar_admin_save_pulse_v1(jsonb, jsonb, uuid) to authenticated;

-- Source: 20260918183100_superadmin_national_control_plane_v1.sql
-- RADAR national superadministration control plane.
-- This migration is intentionally not applied to production by this branch.
-- Privileged RPCs are callable only by service_role and must be reached through
-- the audited radar-admin-api Edge Function.

create extension if not exists btree_gist with schema extensions;

alter table public.profiles drop constraint if exists profiles_platform_role_check;
alter table public.profiles add constraint profiles_platform_role_check check (
  platform_role in (
    'super_admin','data_ops','qa','support','commercial_ops','rtd_ops',
    'platform_admin','organization_admin','campaign_admin','campaign_editor',
    'campaign_viewer','demo_admin','demo_viewer','user'
  )
);

create schema if not exists admin_vault;
revoke all on schema admin_vault from public, anon, authenticated;

create table if not exists admin_vault.canonical_layers (
  layer_id text primary key,
  layer_order integer not null unique check (layer_order between 1 and 17),
  label text not null,
  domain text not null,
  expected_scope text not null default 'MUNICIPALITY',
  created_at timestamptz not null default now(),
  constraint canonical_layers_scope_check check (expected_scope in ('MUNICIPALITY','DEPARTMENT','NATIONAL'))
);

insert into admin_vault.canonical_layers (layer_id,layer_order,label,domain) values
  ('ROUTES_340',1,'Rutas municipales','Navegación'),
  ('NUCLEO_ELECTORAL',2,'Núcleo electoral','Electoral'),
  ('RGM_SERVICIOS',3,'Servicios públicos RGM','Servicios públicos'),
  ('INAB_FORESTAL',4,'Cobertura forestal INAB','Ambiente'),
  ('CONRED_INFORM',5,'Riesgo CONRED INFORM','Riesgo'),
  ('CONAP_SIGAP',6,'Áreas protegidas CONAP','Ambiente'),
  ('INE_CENSO_B2_B6',7,'Censo INE B2–B6','Demografía y hogares'),
  ('SESAN_TALLA',8,'Censo de talla SESAN','Nutrición'),
  ('PDM_PDMOT',9,'Catálogo PDM/PDM-OT','Planificación'),
  ('MSPAS_SALUD',10,'Establecimientos MSPAS','Salud'),
  ('MINEDUC_ESCUELAS',11,'Establecimientos educativos','Educación'),
  ('MINFIN_HIST',12,'Ejecución municipal MINFIN','Finanzas'),
  ('MINFIN_YTD',13,'Egresos municipales MINFIN','Finanzas'),
  ('SNIP_2026',14,'Proyectos SNIP','Inversión pública'),
  ('GUATECOMPRAS',15,'Contratos Guatecompras','Compras'),
  ('ACTIVOS_RESUMEN',16,'Resumen de activos municipales','Activos'),
  ('TSE_CENTROS_GEO',17,'Centros de votación TSE · geolocalización','Electoral')
on conflict (layer_id) do update set
  layer_order=excluded.layer_order,label=excluded.label,domain=excluded.domain;

create table if not exists admin_vault.operator_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_role text not null,
  country_code text not null default 'GT',
  department_code text,
  municipality_code text,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  permissions text[] not null default '{}',
  reason text not null,
  is_active boolean not null default true,
  valid_until timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_scopes_role_check check (platform_role in ('super_admin','data_ops','qa','support','commercial_ops','rtd_ops')),
  constraint operator_scopes_country_check check (country_code='GT'),
  constraint operator_scopes_department_check check (department_code is null or department_code ~ '^[0-9]{2}$'),
  constraint operator_scopes_municipality_check check (municipality_code is null or municipality_code ~ '^[0-9]{4}$'),
  constraint operator_scopes_hierarchy_check check (municipality_code is null or department_code=left(municipality_code,2))
);
create unique index if not exists operator_scopes_unique_active_idx
  on admin_vault.operator_scopes (
    user_id,platform_role,country_code,
    coalesce(department_code,''),coalesce(municipality_code,''),
    coalesce(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid)
  ) where is_active;

create table if not exists admin_vault.commercial_contracts (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id),
  campaign_id uuid references public.campaigns(id),
  client_organization_id uuid not null references public.organizations(id),
  contract_ref text not null unique,
  valid_from date not null,
  valid_until date,
  contract_period daterange generated always as (daterange(valid_from,valid_until,'[]')) stored,
  status text not null default 'RESERVED',
  notes text,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_contracts_status_check check (status in ('DRAFT','RESERVED','ACTIVE','SUSPENDED','ENDED','CANCELLED')),
  constraint commercial_contracts_dates_check check (valid_until is null or valid_until>=valid_from),
  constraint commercial_contracts_exclusivity exclude using gist (
    municipality_id with =,
    contract_period with &&
  ) where (status in ('RESERVED','ACTIVE','SUSPENDED'))
);
create unique index if not exists commercial_contract_campaign_unique_idx
  on admin_vault.commercial_contracts(campaign_id) where campaign_id is not null and status in ('RESERVED','ACTIVE','SUSPENDED');

create table if not exists admin_vault.source_registry (
  source_id text primary key,
  layer_id text not null references admin_vault.canonical_layers(layer_id),
  source_label text not null,
  source_url text,
  territorial_scale text not null,
  source_period text,
  validation_status text not null default 'REGISTERED',
  lineage jsonb not null default '{}'::jsonb,
  registered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_registry_scale_check check (territorial_scale in ('MUNICIPALITY','DEPARTMENT','NATIONAL')),
  constraint source_registry_status_check check (validation_status in ('REGISTERED','EXTRACTED','PREVALIDATED','VALIDATED','QUARANTINED','RETIRED'))
);

create table if not exists admin_vault.publication_batches (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null,
  layer_id text references admin_vault.canonical_layers(layer_id),
  election_type text,
  scope_type text not null,
  country_code text not null default 'GT',
  department_code text,
  municipality_code text,
  campaign_id uuid references public.campaigns(id),
  source_id text not null,
  source_label text not null,
  source_period text,
  storage_path text not null,
  file_sha256 text not null,
  row_count bigint,
  state text not null default 'UPLOADED',
  diff_summary jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  release_manifest jsonb not null default '{}'::jsonb,
  preview_hash text,
  uploaded_by uuid not null references auth.users(id),
  previewed_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  published_by uuid references auth.users(id),
  rejected_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  previewed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz,
  reason text,
  constraint publication_batches_scope_check check (scope_type in ('MUNICIPALITY','DEPARTMENT','NATIONAL')),
  constraint publication_batches_state_check check (state in ('UPLOADED','PREVALIDATED','APPROVED','PUBLISHED','REJECTED','ROLLED_BACK')),
  constraint publication_batches_country_check check (country_code='GT'),
  constraint publication_batches_sha_check check (file_sha256 ~ '^[a-f0-9]{64}$'),
  constraint publication_batches_scope_integrity_check check (
    (scope_type='MUNICIPALITY' and municipality_code ~ '^[0-9]{4}$' and department_code=left(municipality_code,2)) or
    (scope_type='DEPARTMENT' and municipality_code is null and department_code ~ '^[0-9]{2}$') or
    (scope_type='NATIONAL' and municipality_code is null and department_code is null)
  )
);
create index if not exists publication_batches_state_idx on admin_vault.publication_batches(state,uploaded_at desc);
create index if not exists publication_batches_scope_idx on admin_vault.publication_batches(dataset_key,country_code,department_code,municipality_code,uploaded_at desc);

create table if not exists admin_vault.publication_issues (
  id bigint generated always as identity primary key,
  batch_id uuid not null references admin_vault.publication_batches(id) on delete cascade,
  severity text not null,
  issue_code text not null,
  row_reference text,
  field_name text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint publication_issues_severity_check check (severity in ('INFO','WARNING','ERROR','BLOCKER'))
);
create index if not exists publication_issues_batch_idx on admin_vault.publication_issues(batch_id,severity);

create table if not exists admin_vault.dataset_releases (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references admin_vault.publication_batches(id),
  dataset_key text not null,
  scope_key text not null,
  version_number integer not null check (version_number>0),
  source_id text not null,
  source_period text,
  release_manifest jsonb not null,
  supersedes_release_id uuid references admin_vault.dataset_releases(id),
  rolled_back_from_release_id uuid references admin_vault.dataset_releases(id),
  is_current boolean not null default true,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now(),
  constraint dataset_releases_version_unique unique(dataset_key,scope_key,version_number)
);
create unique index if not exists dataset_releases_current_unique_idx
  on admin_vault.dataset_releases(dataset_key,scope_key) where is_current;

create table if not exists admin_vault.audit_events (
  id bigint generated always as identity primary key,
  request_id uuid not null default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  municipality_code text,
  department_code text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on admin_vault.audit_events(created_at desc,id desc);
create index if not exists audit_events_entity_idx on admin_vault.audit_events(entity_type,entity_id,created_at desc);

create table if not exists admin_vault.support_sessions (
  id uuid primary key default gen_random_uuid(),
  ticket_ref text not null,
  operator_user_id uuid not null references auth.users(id),
  municipality_code text,
  campaign_id uuid references public.campaigns(id),
  access_mode text not null default 'READ_ONLY',
  reason text not null,
  status text not null default 'OPEN',
  expires_at timestamptz not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint support_sessions_scope_check check (municipality_code is not null or campaign_id is not null),
  constraint support_sessions_mode_check check (access_mode in ('READ_ONLY','MINIMAL_DIAGNOSTIC')),
  constraint support_sessions_status_check check (status in ('OPEN','CLOSED','EXPIRED')),
  constraint support_sessions_expiry_check check (expires_at>opened_at)
);
create unique index if not exists support_sessions_one_open_idx
  on admin_vault.support_sessions(operator_user_id,ticket_ref) where status='OPEN';

create table if not exists admin_vault.qa_runs (
  id uuid primary key default gen_random_uuid(),
  git_sha text not null,
  git_branch text not null,
  environment text not null default 'QA',
  suite text not null,
  status text not null,
  checks jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  constraint qa_runs_status_check check (status in ('RUNNING','PASSED','FAILED','BLOCKED'))
);

create table if not exists admin_vault.deployments (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  git_sha text not null,
  build_id text,
  version_label text not null,
  status text not null,
  deployed_by uuid references auth.users(id) on delete set null,
  deployed_at timestamptz,
  blockers jsonb not null default '[]'::jsonb,
  constraint deployments_environment_check check (environment in ('QA','PRODUCTION')),
  constraint deployments_status_check check (status in ('PLANNED','BUILDING','READY','DEPLOYED','FAILED','BLOCKED'))
);

create table if not exists admin_vault.rtd_monitoring_snapshots (
  id bigint generated always as identity primary key,
  country_code text not null default 'GT',
  department_code text,
  municipality_code text,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  centers_total integer,
  jrv_total integer,
  fiscales_assigned integer,
  actas_expected integer,
  actas_received integer,
  actas_with_error integer,
  delayed_jrv integer,
  snapshot_at timestamptz not null default now(),
  constraint rtd_monitoring_nonnegative check (
    coalesce(centers_total,0)>=0 and coalesce(jrv_total,0)>=0 and
    coalesce(fiscales_assigned,0)>=0 and coalesce(actas_expected,0)>=0 and
    coalesce(actas_received,0)>=0 and coalesce(actas_with_error,0)>=0 and
    coalesce(delayed_jrv,0)>=0
  )
);

alter table admin_vault.canonical_layers enable row level security;
alter table admin_vault.operator_scopes enable row level security;
alter table admin_vault.commercial_contracts enable row level security;
alter table admin_vault.source_registry enable row level security;
alter table admin_vault.publication_batches enable row level security;
alter table admin_vault.publication_issues enable row level security;
alter table admin_vault.dataset_releases enable row level security;
alter table admin_vault.audit_events enable row level security;
alter table admin_vault.support_sessions enable row level security;
alter table admin_vault.qa_runs enable row level security;
alter table admin_vault.deployments enable row level security;
alter table admin_vault.rtd_monitoring_snapshots enable row level security;

revoke all on all tables in schema admin_vault from public,anon,authenticated;
revoke all on all sequences in schema admin_vault from public,anon,authenticated;
grant usage on schema admin_vault to service_role;
grant all on all tables in schema admin_vault to service_role;
grant all on all sequences in schema admin_vault to service_role;

create or replace function admin_vault.prevent_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog,admin_vault,pg_temp as $$
begin
  raise exception 'audit events are append-only' using errcode='42501';
end
$$;
drop trigger if exists audit_events_append_only on admin_vault.audit_events;
create trigger audit_events_append_only before update or delete on admin_vault.audit_events
for each row execute function admin_vault.prevent_audit_mutation();

create or replace function public.radar_admin_audit_v1(
  p_actor_user_id uuid,p_actor_role text,p_action text,p_entity_type text,p_entity_id text,
  p_before_state jsonb,p_after_state jsonb,p_reason text,p_request_id uuid default gen_random_uuid(),
  p_municipality_code text default null,p_department_code text default null,p_campaign_id uuid default null
)
returns bigint language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare event_id bigint;
begin
  if p_actor_role not in ('super_admin','data_ops','qa','support','commercial_ops','rtd_ops') then
    raise exception 'invalid administrative role' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users where id=p_actor_user_id) then
    raise exception 'unknown administrative actor' using errcode='42501';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'audit reason required' using errcode='22023'; end if;
  insert into admin_vault.audit_events(
    request_id,actor_user_id,actor_role,action,entity_type,entity_id,
    municipality_code,department_code,campaign_id,before_state,after_state,reason
  ) values (
    coalesce(p_request_id,gen_random_uuid()),p_actor_user_id,p_actor_role,p_action,p_entity_type,p_entity_id,
    p_municipality_code,p_department_code,p_campaign_id,p_before_state,p_after_state,p_reason
  ) returning id into event_id;
  return event_id;
end
$$;

create or replace function public.radar_admin_operator_context_v1(
  p_actor_user_id uuid,p_actor_role text
)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare payload jsonb;
begin
  if p_actor_role not in ('super_admin','data_ops','qa','support','commercial_ops','rtd_ops') then
    raise exception 'invalid administrative role' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_actor_user_id and p.is_active and (p.platform_role=p_actor_role or (p_actor_role='super_admin' and p.platform_role='platform_admin'))) then
    raise exception 'inactive administrative profile' using errcode='42501';
  end if;
  select jsonb_build_object(
    'user_id',p_actor_user_id,
    'user_role',p_actor_role,
    'permissions',case when p_actor_role='super_admin' then jsonb_build_array('*') else coalesce((
      select jsonb_agg(distinct permission order by permission)
      from admin_vault.operator_scopes scope
      cross join unnest(scope.permissions) permission
      where scope.user_id=p_actor_user_id and scope.platform_role=p_actor_role and scope.is_active
        and (scope.valid_until is null or scope.valid_until>now())
    ),'[]'::jsonb) end,
    'scopes',case when p_actor_role='super_admin' then jsonb_build_array(jsonb_build_object('country_code','GT')) else coalesce((
      select jsonb_agg(jsonb_build_object(
        'country_code',scope.country_code,'department_code',scope.department_code,
        'municipality_code',scope.municipality_code,'campaign_id',scope.campaign_id,
        'valid_until',scope.valid_until
      ) order by scope.created_at)
      from admin_vault.operator_scopes scope
      where scope.user_id=p_actor_user_id and scope.platform_role=p_actor_role and scope.is_active
        and (scope.valid_until is null or scope.valid_until>now())
    ),'[]'::jsonb) end
  ) into payload;
  if p_actor_role<>'super_admin' and jsonb_array_length(payload->'scopes')=0 then
    raise exception 'administrative scope missing' using errcode='42501';
  end if;
  return payload;
end
$$;

create or replace function public.radar_admin_snapshot_v1(
  p_actor_user_id uuid,p_actor_role text,p_second_municipality_code text default '1901'
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,data_vault,campaign_vault,admin_vault,pg_temp as $$
declare payload jsonb;
begin
  if p_actor_role not in ('super_admin','data_ops','qa','support','commercial_ops','rtd_ops') then
    raise exception 'admin snapshot denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_actor_user_id and p.is_active and (p.platform_role=p_actor_role or (p_actor_role='super_admin' and p.platform_role='platform_admin'))) then
    raise exception 'inactive administrative profile' using errcode='42501';
  end if;
  if p_second_municipality_code !~ '^[0-9]{4}$' or not exists(
    select 1 from public.municipalities where municipality_code=p_second_municipality_code and not is_synthetic
  ) then raise exception 'unknown second municipality' using errcode='22023'; end if;

  with municipal_state as (
    select m.id,m.municipality_code,m.municipality_name,m.department_code,m.department_name,
      (select count(distinct r.layer_id) from data_vault.municipality_layer_records r
        join admin_vault.canonical_layers cl on cl.layer_id=r.layer_id where r.municipality_id=m.id) as canonical_layers_present,
      (select max(r.updated_at) from data_vault.municipality_layer_records r
        join admin_vault.canonical_layers cl on cl.layer_id=r.layer_id where r.municipality_id=m.id) as data_updated_at,
      (select count(*) from public.campaigns c where c.municipality_id=m.id and c.status='active' and not c.is_demo) as active_campaigns,
      (select count(distinct cm.user_id) from public.campaigns c join public.campaign_members cm on cm.campaign_id=c.id
        where c.municipality_id=m.id and not c.is_demo) as campaign_members,
      (select count(*) from admin_vault.commercial_contracts cc where cc.municipality_id=m.id
        and cc.status in ('RESERVED','ACTIVE','SUSPENDED') and cc.contract_period @> current_date) as protected_contracts
    from public.municipalities m where not m.is_synthetic
  ), layer_base as (
    select cl.layer_id,cl.layer_order,cl.label,cl.domain,
      count(distinct r.municipality_id) as municipalities_present,
      count(r.municipality_id) filter(where r.source_status is null) as rows_without_status,
      max(r.updated_at) as last_updated
    from admin_vault.canonical_layers cl
    left join data_vault.municipality_layer_records r on r.layer_id=cl.layer_id
    group by cl.layer_id,cl.layer_order,cl.label,cl.domain
  ), layer_status as (
    select r.layer_id,coalesce(r.source_status,'<null>') source_status,count(*)::bigint cnt
    from data_vault.municipality_layer_records r
    join admin_vault.canonical_layers cl on cl.layer_id=r.layer_id
    group by r.layer_id,coalesce(r.source_status,'<null>')
  ), layer_state as (
    select lb.*,
      coalesce((select jsonb_object_agg(ls.source_status,ls.cnt) from layer_status ls where ls.layer_id=lb.layer_id),'{}'::jsonb) status_counts
    from layer_base lb
  ), rtd_state as (
    select m.municipality_code,m.department_code,c.id campaign_id,
      (select count(*) from campaign_vault.fiscales f where f.campaign_id=c.id) fiscales,
      (select count(distinct rr.voting_center_code) from campaign_vault.rtd_results rr where rr.campaign_id=c.id) centers_received,
      (select count(distinct (rr.voting_center_code,rr.jrv_code)) from campaign_vault.rtd_results rr where rr.campaign_id=c.id) jrv_received,
      (select count(*) from campaign_vault.rtd_results rr where rr.campaign_id=c.id and rr.status='draft') drafts,
      (select count(*) from campaign_vault.rtd_results rr where rr.campaign_id=c.id and rr.status in ('confirmed','submitted','validated')) confirmed,
      (select count(*) from campaign_vault.incidents i where i.campaign_id=c.id and i.status='open') open_incidents,
      (select max(coalesce(rr.submitted_at,rr.created_at)) from campaign_vault.rtd_results rr where rr.campaign_id=c.id) last_update
    from public.campaigns c join public.municipalities m on m.id=c.municipality_id
    where not c.is_demo
  )
  select jsonb_build_object(
    'generated_at',now(),
    'contract',jsonb_build_object('context_fields',jsonb_build_array('municipality_code','campaign_id','user_role','permissions'),'country_code','GT'),
    'national',jsonb_build_object(
      'municipalities',(select count(*) from municipal_state),
      'departments',(select count(distinct department_code) from municipal_state),
      'municipalities_with_17_layers',(select count(*) from municipal_state where canonical_layers_present=17),
      'active_campaigns',(select count(*) from public.campaigns where status='active' and not is_demo),
      'protected_contracts',(select count(*) from admin_vault.commercial_contracts where status in ('RESERVED','ACTIVE','SUSPENDED') and contract_period @> current_date),
      'active_profiles',(select count(*) from public.profiles where is_active),
      'last_data_update',(select max(data_updated_at) from municipal_state)
    ),
    'municipalities',(select coalesce(jsonb_agg(jsonb_build_object(
      'municipality_code',municipality_code,'municipality_name',municipality_name,
      'department_code',department_code,'department_name',department_name,
      'canonical_layers_present',canonical_layers_present,'active_campaigns',active_campaigns,
      'campaign_members',campaign_members,'protected_contracts',protected_contracts,
      'data_updated_at',data_updated_at,
      'operational_state',case when protected_contracts>0 then 'CONTRACT_PROTECTED' when active_campaigns>0 then 'CAMPAIGN_CONFIGURED' else 'DATA_ONLY' end
    ) order by municipality_code),'[]'::jsonb) from municipal_state),
    'vertical_qa',(select coalesce(jsonb_agg(to_jsonb(ms) order by ms.municipality_code),'[]'::jsonb) from municipal_state ms where ms.municipality_code in ('0509',p_second_municipality_code)),
    'layers',(select coalesce(jsonb_agg(to_jsonb(ls) order by ls.layer_order),'[]'::jsonb) from layer_state ls),
    'sources',(select coalesce(jsonb_agg(to_jsonb(sr) order by sr.layer_id,sr.source_id),'[]'::jsonb)
      from (select source_id,layer_id,source_label,source_url,territorial_scale,source_period,validation_status,lineage,created_at,updated_at from admin_vault.source_registry) sr),
    'campaigns',(select coalesce(jsonb_agg(to_jsonb(x) order by x.municipality_code,x.name),'[]'::jsonb) from (
      select c.id,c.name,c.slug,c.status,c.is_demo,c.created_at,m.municipality_code,m.department_code,
        count(cm.user_id) as member_count
      from public.campaigns c join public.municipalities m on m.id=c.municipality_id
      left join public.campaign_members cm on cm.campaign_id=c.id
      group by c.id,m.municipality_code,m.department_code
    ) x),
    'contracts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.valid_from desc),'[]'::jsonb) from (
      select cc.id,cc.contract_ref,m.municipality_code,m.department_code,cc.campaign_id,cc.client_organization_id,
        cc.valid_from,cc.valid_until,cc.status,cc.created_at,cc.updated_at
      from admin_vault.commercial_contracts cc join public.municipalities m on m.id=cc.municipality_id
    ) x),
    'campaign_health',(select coalesce(jsonb_agg(to_jsonb(x) order by x.municipality_code),'[]'::jsonb) from (
      select c.id campaign_id,m.municipality_code,m.department_code,
        (select count(*) from campaign_vault.voter_directory v where v.campaign_id=c.id) voter_records,
        (select count(*) from campaign_vault.contacts v where v.campaign_id=c.id) contacts,
        (select count(*) from campaign_vault.activities v where v.campaign_id=c.id) activities,
        (select count(*) from campaign_vault.fiscales v where v.campaign_id=c.id) fiscales,
        (select count(*) from campaign_vault.rtd_results v where v.campaign_id=c.id) rtd_records,
        (select count(*) from campaign_vault.incidents v where v.campaign_id=c.id and v.status='open') open_incidents
      from public.campaigns c join public.municipalities m on m.id=c.municipality_id where not c.is_demo
    ) x),
    'publication_batches',(select coalesce(jsonb_agg(to_jsonb(x) order by x.uploaded_at desc),'[]'::jsonb) from (
      select b.id,b.dataset_key,b.layer_id,b.election_type,b.scope_type,b.country_code,b.department_code,b.municipality_code,b.campaign_id,
        b.source_id,b.source_label,b.source_period,b.file_sha256,b.row_count,b.state,b.diff_summary,b.validation_summary,
        b.preview_hash,b.uploaded_at,b.previewed_at,b.approved_at,b.published_at,b.rejected_at,b.reason,
        (select count(*) from admin_vault.publication_issues i where i.batch_id=b.id and i.severity in ('ERROR','BLOCKER')) blocking_issues
      from admin_vault.publication_batches b order by b.uploaded_at desc limit 100
    ) x),
    'publication_issues',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id desc),'[]'::jsonb)
      from (select id,batch_id,severity,issue_code,row_reference,field_name,message,created_at
        from admin_vault.publication_issues order by created_at desc,id desc limit 200) i),
    'pulse_measurements',(select coalesce(jsonb_agg(to_jsonb(x) order by x.field_end desc,x.folio),'[]'::jsonb) from (
      select p.id,p.folio,p.election_type,p.scope_type,p.country_code,p.department_code,p.municipality_code,
        p.field_start,p.field_end,p.sample_size,p.scope_label,p.methodology,p.technical_sheet,p.source_label,p.version,p.status,
        p.preview_hash,p.previewed_at,p.validated_at,p.approved_at,p.published_at,p.updated_at,
        (select count(*) from data_vault.pulse_results r where r.measurement_id=p.id) result_count
      from data_vault.pulse_measurements p order by p.field_end desc,p.folio limit 100
    ) x),
    'publication_states',(select coalesce(jsonb_object_agg(state,cnt),'{}'::jsonb) from (select state,count(*) cnt from admin_vault.publication_batches group by state) x),
    'pulse_states',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status,count(*) cnt from data_vault.pulse_measurements group by status) x),
    'rtd',(select coalesce(jsonb_agg(to_jsonb(rs) order by rs.municipality_code),'[]'::jsonb) from rtd_state rs),
    'rtd_monitoring',(select coalesce(jsonb_agg(to_jsonb(rm) order by rm.snapshot_at desc),'[]'::jsonb)
      from (select id,country_code,department_code,municipality_code,campaign_id,centers_total,jrv_total,fiscales_assigned,
        actas_expected,actas_received,actas_with_error,delayed_jrv,snapshot_at from admin_vault.rtd_monitoring_snapshots order by snapshot_at desc limit 200) rm),
    'qa_runs',(select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) from (select id,git_sha,git_branch,environment,suite,status,checks,started_at,finished_at,created_at from admin_vault.qa_runs order by created_at desc limit 20) q),
    'deployments',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb) from (select id,environment,git_sha,build_id,version_label,status,deployed_at,blockers,created_at from admin_vault.deployments order by created_at desc limit 20) d),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) from (select id,request_id,actor_user_id,actor_role,action,entity_type,entity_id,municipality_code,department_code,campaign_id,reason,created_at from admin_vault.audit_events order by created_at desc limit 50) a),
    'support',(select coalesce(jsonb_agg(to_jsonb(s) order by s.opened_at desc),'[]'::jsonb) from (select id,ticket_ref,operator_user_id,municipality_code,campaign_id,access_mode,reason,status,expires_at,opened_at,closed_at from admin_vault.support_sessions order by opened_at desc limit 50) s)
  ) into payload;

  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'READ_SNAPSHOT','CONTROL_PLANE',null,null,null,'Consulta operativa del superadministrador');
  return payload;
end
$$;

create or replace function admin_vault.operator_has_scope(
  p_actor_user_id uuid,p_actor_role text,p_permission text,p_country_code text,
  p_department_code text,p_municipality_code text,p_campaign_id uuid
)
returns boolean language sql stable security definer
set search_path=pg_catalog,admin_vault,pg_temp as $$
  select p_actor_role='super_admin' or exists(
    select 1 from admin_vault.operator_scopes scope
    where scope.user_id=p_actor_user_id and scope.platform_role=p_actor_role and scope.is_active
      and (scope.valid_until is null or scope.valid_until>now())
      and ('*'=any(scope.permissions) or p_permission=any(scope.permissions))
      and scope.country_code=p_country_code
      and (scope.department_code is null or scope.department_code=p_department_code)
      and (scope.municipality_code is null or scope.municipality_code=p_municipality_code)
      and (scope.campaign_id is null or scope.campaign_id=p_campaign_id)
  )
$$;

create or replace function public.radar_admin_reserve_contract_v1(
  p_actor_user_id uuid,p_actor_role text,p_municipality_code text,p_organization_id uuid,
  p_campaign_id uuid,p_contract_ref text,p_valid_from date,p_valid_until date,p_status text,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare municipality_row public.municipalities; saved admin_vault.commercial_contracts;
begin
  if p_actor_role not in ('super_admin','commercial_ops') then raise exception 'commercial operation denied' using errcode='42501'; end if;
  select * into municipality_row from public.municipalities where municipality_code=p_municipality_code and not is_synthetic;
  if municipality_row.id is null then raise exception 'unknown municipality' using errcode='22023'; end if;
  if not admin_vault.operator_has_scope(p_actor_user_id,p_actor_role,'contracts:write','GT',municipality_row.department_code,p_municipality_code,p_campaign_id) then
    raise exception 'commercial territorial scope denied' using errcode='42501';
  end if;
  if p_campaign_id is not null and not exists(select 1 from public.campaigns where id=p_campaign_id and municipality_id=municipality_row.id) then
    raise exception 'campaign municipality mismatch' using errcode='22023';
  end if;
  insert into admin_vault.commercial_contracts(
    municipality_id,campaign_id,client_organization_id,contract_ref,valid_from,valid_until,status,notes,created_by,updated_by
  ) values (
    municipality_row.id,p_campaign_id,p_organization_id,nullif(btrim(p_contract_ref),''),p_valid_from,p_valid_until,upper(p_status),p_reason,p_actor_user_id,p_actor_user_id
  ) returning * into saved;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'RESERVE_CONTRACT','COMMERCIAL_CONTRACT',saved.id::text,null,to_jsonb(saved),p_reason,null,p_municipality_code,municipality_row.department_code,p_campaign_id);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_create_campaign_v1(
  p_actor_user_id uuid,p_actor_role text,p_municipality_code text,p_organization_id uuid,
  p_name text,p_slug text,p_status text,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare municipality_row public.municipalities; saved public.campaigns; protected_contract admin_vault.commercial_contracts;
begin
  if p_actor_role not in ('super_admin','commercial_ops') then raise exception 'campaign creation denied' using errcode='42501'; end if;
  select * into municipality_row from public.municipalities where municipality_code=p_municipality_code and not is_synthetic;
  if municipality_row.id is null then raise exception 'unknown municipality' using errcode='22023'; end if;
  if not admin_vault.operator_has_scope(p_actor_user_id,p_actor_role,'campaigns:write','GT',municipality_row.department_code,p_municipality_code,null) then
    raise exception 'campaign territorial scope denied' using errcode='42501';
  end if;
  select * into protected_contract from admin_vault.commercial_contracts cc
    where cc.municipality_id=municipality_row.id and cc.client_organization_id=p_organization_id
      and cc.status in ('RESERVED','ACTIVE') and cc.contract_period @> current_date for update;
  if protected_contract.id is null then raise exception 'active protected contract required' using errcode='42501'; end if;
  if upper(p_status) not in ('PAUSED','ACTIVE') then raise exception 'invalid campaign status' using errcode='22023'; end if;
  insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status)
  values(p_organization_id,'GT',municipality_row.id,nullif(btrim(p_name),''),lower(nullif(btrim(p_slug),'')),false,lower(p_status))
  returning * into saved;
  update admin_vault.commercial_contracts set campaign_id=saved.id,status=case when upper(p_status)='ACTIVE' then 'ACTIVE' else status end,
    updated_by=p_actor_user_id,updated_at=now() where id=protected_contract.id;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'CREATE_CAMPAIGN','CAMPAIGN',saved.id::text,null,to_jsonb(saved),p_reason,null,p_municipality_code,municipality_row.department_code,saved.id);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_register_source_v1(
  p_actor_user_id uuid,p_actor_role text,p_source jsonb,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare previous admin_vault.source_registry; saved admin_vault.source_registry; source_key text:=nullif(btrim(p_source->>'source_id'),'');
begin
  if p_actor_role not in ('super_admin','data_ops') then raise exception 'source registry denied' using errcode='42501'; end if;
  if p_actor_role<>'super_admin' and not exists(
    select 1 from admin_vault.operator_scopes scope where scope.user_id=p_actor_user_id and scope.platform_role=p_actor_role and scope.is_active
      and (scope.valid_until is null or scope.valid_until>now()) and ('*'=any(scope.permissions) or 'data:preview'=any(scope.permissions))
  ) then raise exception 'source registry permission denied' using errcode='42501'; end if;
  select * into previous from admin_vault.source_registry where source_id=source_key for update;
  insert into admin_vault.source_registry(source_id,layer_id,source_label,source_url,territorial_scale,source_period,validation_status,lineage,registered_by)
  values(source_key,nullif(btrim(p_source->>'layer_id'),''),nullif(btrim(p_source->>'source_label'),''),nullif(btrim(p_source->>'source_url'),''),
    upper(nullif(btrim(p_source->>'territorial_scale'),'')),nullif(btrim(p_source->>'source_period'),''),
    upper(coalesce(nullif(btrim(p_source->>'validation_status'),''),'REGISTERED')),coalesce(p_source->'lineage','{}'::jsonb),p_actor_user_id)
  on conflict(source_id) do update set layer_id=excluded.layer_id,source_label=excluded.source_label,source_url=excluded.source_url,
    territorial_scale=excluded.territorial_scale,source_period=excluded.source_period,validation_status=excluded.validation_status,
    lineage=excluded.lineage,updated_at=now() returning * into saved;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'REGISTER_SOURCE','SOURCE_REGISTRY',saved.source_id,
    case when previous.source_id is null then null else to_jsonb(previous) end,to_jsonb(saved),p_reason);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_transition_publication_v1(
  p_actor_user_id uuid,p_actor_role text,p_batch_id uuid,p_target_state text,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare current_batch admin_vault.publication_batches; previous_state jsonb; target_state text:=upper(p_target_state); scope_value text; release_row admin_vault.dataset_releases; next_version integer;
begin
  select * into current_batch from admin_vault.publication_batches where id=p_batch_id for update;
  if current_batch.id is null then raise exception 'publication batch not found' using errcode='P0002'; end if;
  if not admin_vault.operator_has_scope(p_actor_user_id,p_actor_role,
    case when upper(p_target_state)='PUBLISHED' then 'data:publish' else 'data:approve' end,
    current_batch.country_code,current_batch.department_code,current_batch.municipality_code,current_batch.campaign_id) then
    raise exception 'publication territorial scope denied' using errcode='42501';
  end if;
  previous_state:=to_jsonb(current_batch);
  if target_state='APPROVED' then
    if p_actor_role not in ('super_admin','qa') or current_batch.state<>'PREVALIDATED' then raise exception 'publication approval denied' using errcode='42501'; end if;
    if exists(select 1 from admin_vault.publication_issues where batch_id=p_batch_id and severity in ('ERROR','BLOCKER')) then raise exception 'blocking validation issues remain' using errcode='22023'; end if;
    update admin_vault.publication_batches set state='APPROVED',approved_by=p_actor_user_id,approved_at=now(),reason=p_reason where id=p_batch_id returning * into current_batch;
  elsif target_state='PUBLISHED' then
    if p_actor_role not in ('super_admin','qa') or current_batch.state<>'APPROVED' then raise exception 'publication denied' using errcode='42501'; end if;
    scope_value:=concat_ws(':',current_batch.scope_type,current_batch.country_code,coalesce(current_batch.department_code,'-'),coalesce(current_batch.municipality_code,'-'),coalesce(current_batch.campaign_id::text,'-'));
    select coalesce(max(version_number),0)+1 into next_version from admin_vault.dataset_releases where dataset_key=current_batch.dataset_key and scope_key=scope_value;
    update admin_vault.dataset_releases set is_current=false where dataset_key=current_batch.dataset_key and scope_key=scope_value and is_current;
    insert into admin_vault.dataset_releases(batch_id,dataset_key,scope_key,version_number,source_id,source_period,release_manifest,supersedes_release_id,published_by)
    select current_batch.id,current_batch.dataset_key,scope_value,next_version,current_batch.source_id,current_batch.source_period,current_batch.release_manifest,
      (select id from admin_vault.dataset_releases where dataset_key=current_batch.dataset_key and scope_key=scope_value order by version_number desc limit 1),p_actor_user_id
    returning * into release_row;
    update admin_vault.publication_batches set state='PUBLISHED',published_by=p_actor_user_id,published_at=now(),reason=p_reason where id=p_batch_id returning * into current_batch;
  elsif target_state='REJECTED' then
    if p_actor_role not in ('super_admin','qa','data_ops') or current_batch.state not in ('UPLOADED','PREVALIDATED','APPROVED') then raise exception 'publication rejection denied' using errcode='42501'; end if;
    update admin_vault.publication_batches set state='REJECTED',rejected_by=p_actor_user_id,rejected_at=now(),reason=p_reason where id=p_batch_id returning * into current_batch;
  else raise exception 'invalid publication transition' using errcode='22023'; end if;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'PUBLICATION_'||target_state,'PUBLICATION_BATCH',p_batch_id::text,previous_state,to_jsonb(current_batch),p_reason,null,current_batch.municipality_code,current_batch.department_code,current_batch.campaign_id);
  return jsonb_build_object('batch',to_jsonb(current_batch),'release',case when release_row.id is null then null else to_jsonb(release_row) end);
end
$$;

create or replace function public.radar_admin_create_publication_preview_v1(
  p_actor_user_id uuid,p_actor_role text,p_batch jsonb,p_issues jsonb,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare saved admin_vault.publication_batches; issue_row jsonb; blocker_count integer; previous_row_count bigint; issue_counts jsonb;
begin
  if p_actor_role not in ('super_admin','data_ops') then raise exception 'publication preview denied' using errcode='42501'; end if;
  if jsonb_typeof(p_issues)<>'array' then raise exception 'publication issues must be an array' using errcode='22023'; end if;
  if nullif(btrim(p_batch->>'preview_hash'),'') is null then raise exception 'preview hash required' using errcode='22023'; end if;
  if not admin_vault.operator_has_scope(p_actor_user_id,p_actor_role,'data:preview',
    upper(coalesce(nullif(btrim(p_batch->>'country_code'),''),'GT')),
    nullif(btrim(p_batch->>'department_code'),''),nullif(btrim(p_batch->>'municipality_code'),''),nullif(p_batch->>'campaign_id','')::uuid) then
    raise exception 'publication preview territorial scope denied' using errcode='42501';
  end if;
  insert into admin_vault.publication_batches(
    dataset_key,layer_id,election_type,scope_type,country_code,department_code,municipality_code,campaign_id,
    source_id,source_label,source_period,storage_path,file_sha256,row_count,state,diff_summary,
    validation_summary,release_manifest,preview_hash,uploaded_by,previewed_by,previewed_at,reason
  ) values (
    nullif(btrim(p_batch->>'dataset_key'),''),nullif(btrim(p_batch->>'layer_id'),''),nullif(btrim(p_batch->>'election_type'),''),
    upper(nullif(btrim(p_batch->>'scope_type'),'')),upper(coalesce(nullif(btrim(p_batch->>'country_code'),''),'GT')),
    nullif(btrim(p_batch->>'department_code'),''),nullif(btrim(p_batch->>'municipality_code'),''),nullif(p_batch->>'campaign_id','')::uuid,
    nullif(btrim(p_batch->>'source_id'),''),nullif(btrim(p_batch->>'source_label'),''),nullif(btrim(p_batch->>'source_period'),''),
    nullif(btrim(p_batch->>'storage_path'),''),lower(nullif(btrim(p_batch->>'file_sha256'),'')),nullif(p_batch->>'row_count','')::bigint,
    'PREVALIDATED',coalesce(p_batch->'diff_summary','{}'::jsonb),coalesce(p_batch->'validation_summary','{}'::jsonb),
    coalesce(p_batch->'release_manifest','{}'::jsonb),nullif(btrim(p_batch->>'preview_hash'),''),p_actor_user_id,p_actor_user_id,now(),p_reason
  ) returning * into saved;
  for issue_row in select value from jsonb_array_elements(p_issues) loop
    insert into admin_vault.publication_issues(batch_id,severity,issue_code,row_reference,field_name,message,details)
    values(saved.id,upper(coalesce(nullif(btrim(issue_row->>'severity'),''),'ERROR')),nullif(btrim(issue_row->>'issue_code'),''),
      nullif(btrim(issue_row->>'row_reference'),''),nullif(btrim(issue_row->>'field_name'),''),nullif(btrim(issue_row->>'message'),''),
      coalesce(issue_row->'details','{}'::jsonb));
  end loop;
  select count(*) into blocker_count from admin_vault.publication_issues where batch_id=saved.id and severity in ('ERROR','BLOCKER');
  select b.row_count into previous_row_count
  from admin_vault.publication_batches b
  where b.id<>saved.id and b.dataset_key=saved.dataset_key and b.scope_type=saved.scope_type
    and b.country_code=saved.country_code
    and b.department_code is not distinct from saved.department_code
    and b.municipality_code is not distinct from saved.municipality_code
    and b.campaign_id is not distinct from saved.campaign_id
    and b.state='PUBLISHED'
  order by b.published_at desc nulls last limit 1;
  select coalesce(jsonb_object_agg(severity,cnt),'{}'::jsonb) into issue_counts
  from (select severity,count(*)::bigint cnt from admin_vault.publication_issues where batch_id=saved.id group by severity) counts;
  update admin_vault.publication_batches set
    diff_summary=coalesce(saved.diff_summary,'{}'::jsonb)||jsonb_build_object(
      'previous_row_count',previous_row_count,
      'candidate_row_count',saved.row_count,
      'row_count_delta',case when previous_row_count is null or saved.row_count is null then null else saved.row_count-previous_row_count end
    ),
    validation_summary=coalesce(saved.validation_summary,'{}'::jsonb)||jsonb_build_object('issues_by_severity',issue_counts,'blocking_issues',blocker_count)
  where id=saved.id returning * into saved;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'CREATE_PUBLICATION_PREVIEW','PUBLICATION_BATCH',saved.id::text,null,
    jsonb_build_object('batch',to_jsonb(saved),'blocking_issues',blocker_count),p_reason,null,saved.municipality_code,saved.department_code,saved.campaign_id);
  return jsonb_build_object('batch',to_jsonb(saved),'blocking_issues',blocker_count);
end
$$;

create or replace function public.radar_admin_rollback_release_v1(
  p_actor_user_id uuid,p_actor_role text,p_current_release_id uuid,p_restore_release_id uuid,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare current_release admin_vault.dataset_releases; restore_release admin_vault.dataset_releases; rollback_release admin_vault.dataset_releases; current_batch admin_vault.publication_batches; next_version integer;
begin
  if p_actor_role not in ('super_admin','qa') then raise exception 'rollback denied' using errcode='42501'; end if;
  select * into current_release from admin_vault.dataset_releases where id=p_current_release_id and is_current for update;
  select * into restore_release from admin_vault.dataset_releases where id=p_restore_release_id;
  if current_release.id is null or restore_release.id is null or current_release.dataset_key<>restore_release.dataset_key or current_release.scope_key<>restore_release.scope_key then raise exception 'invalid rollback pair' using errcode='22023'; end if;
  select * into current_batch from admin_vault.publication_batches where id=current_release.batch_id;
  if not admin_vault.operator_has_scope(p_actor_user_id,p_actor_role,'data:rollback',current_batch.country_code,current_batch.department_code,current_batch.municipality_code,current_batch.campaign_id) then
    raise exception 'rollback territorial scope denied' using errcode='42501';
  end if;
  select max(version_number)+1 into next_version from admin_vault.dataset_releases where dataset_key=current_release.dataset_key and scope_key=current_release.scope_key;
  update admin_vault.dataset_releases set is_current=false where id=current_release.id;
  insert into admin_vault.dataset_releases(batch_id,dataset_key,scope_key,version_number,source_id,source_period,release_manifest,supersedes_release_id,rolled_back_from_release_id,is_current,published_by)
  values(restore_release.batch_id,restore_release.dataset_key,restore_release.scope_key,next_version,restore_release.source_id,restore_release.source_period,restore_release.release_manifest,current_release.id,current_release.id,true,p_actor_user_id)
  returning * into rollback_release;
  update admin_vault.publication_batches set state='ROLLED_BACK',reason=p_reason where id=current_release.batch_id;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'ROLLBACK_RELEASE','DATASET_RELEASE',rollback_release.id::text,to_jsonb(current_release),to_jsonb(rollback_release),p_reason);
  return to_jsonb(rollback_release);
end
$$;

create or replace function public.radar_admin_revoke_user_sessions_v1(
  p_actor_user_id uuid,p_actor_role text,p_target_user_id uuid,p_reason text
)
returns bigint language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare removed bigint;
begin
  if p_actor_role<>'super_admin' then raise exception 'session revocation denied' using errcode='42501'; end if;
  delete from auth.sessions where user_id=p_target_user_id;
  get diagnostics removed=row_count;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'REVOKE_SESSIONS','AUTH_USER',p_target_user_id::text,null,jsonb_build_object('sessions_removed',removed),p_reason);
  return removed;
end
$$;

create or replace function public.radar_admin_open_support_session_v1(
  p_actor_user_id uuid,p_actor_role text,p_ticket_ref text,p_municipality_code text,p_campaign_id uuid,p_access_mode text,p_reason text,p_expires_at timestamptz
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare saved admin_vault.support_sessions;
begin
  if p_actor_role not in ('super_admin','support') then raise exception 'support session denied' using errcode='42501'; end if;
  if p_expires_at>now()+interval '8 hours' then raise exception 'support session exceeds maximum duration' using errcode='22023'; end if;
  insert into admin_vault.support_sessions(ticket_ref,operator_user_id,municipality_code,campaign_id,access_mode,reason,expires_at)
  values(nullif(btrim(p_ticket_ref),''),p_actor_user_id,p_municipality_code,p_campaign_id,upper(p_access_mode),p_reason,p_expires_at) returning * into saved;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'OPEN_SUPPORT_SESSION','SUPPORT_SESSION',saved.id::text,null,to_jsonb(saved),p_reason,null,p_municipality_code,null,p_campaign_id);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_close_support_session_v1(
  p_actor_user_id uuid,p_actor_role text,p_session_id uuid,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare previous admin_vault.support_sessions; saved admin_vault.support_sessions;
begin
  if p_actor_role not in ('super_admin','support') then raise exception 'support close denied' using errcode='42501'; end if;
  select * into previous from admin_vault.support_sessions where id=p_session_id and status='OPEN' for update;
  if previous.id is null then raise exception 'open support session not found' using errcode='P0002'; end if;
  if p_actor_role='support' and previous.operator_user_id<>p_actor_user_id then raise exception 'support session ownership mismatch' using errcode='42501'; end if;
  update admin_vault.support_sessions set status='CLOSED',closed_at=now() where id=p_session_id returning * into saved;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'CLOSE_SUPPORT_SESSION','SUPPORT_SESSION',saved.id::text,to_jsonb(previous),to_jsonb(saved),p_reason,null,saved.municipality_code,null,saved.campaign_id);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_assign_operator_scope_v1(
  p_actor_user_id uuid,p_actor_role text,p_target_user_id uuid,p_target_role text,p_scope jsonb,p_permissions text[],p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare saved admin_vault.operator_scopes;
begin
  if p_actor_role<>'super_admin' then raise exception 'operator scope assignment denied' using errcode='42501'; end if;
  if p_target_role not in ('super_admin','data_ops','qa','support','commercial_ops','rtd_ops') then raise exception 'invalid target role' using errcode='22023'; end if;
  insert into admin_vault.operator_scopes(
    user_id,platform_role,country_code,department_code,municipality_code,campaign_id,permissions,reason,valid_until,granted_by
  ) values (
    p_target_user_id,p_target_role,upper(coalesce(nullif(btrim(p_scope->>'country_code'),''),'GT')),
    nullif(btrim(p_scope->>'department_code'),''),nullif(btrim(p_scope->>'municipality_code'),''),nullif(p_scope->>'campaign_id','')::uuid,
    coalesce(p_permissions,'{}'),p_reason,nullif(p_scope->>'valid_until','')::timestamptz,p_actor_user_id
  ) returning * into saved;
  update public.profiles set platform_role=p_target_role,is_active=true,updated_at=now() where user_id=p_target_user_id;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'ASSIGN_OPERATOR_SCOPE','AUTH_USER',p_target_user_id::text,null,to_jsonb(saved),p_reason);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_set_profile_state_v1(
  p_actor_user_id uuid,p_actor_role text,p_target_user_id uuid,p_is_active boolean,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare previous public.profiles; saved public.profiles;
begin
  if p_actor_role<>'super_admin' or p_target_user_id=p_actor_user_id then raise exception 'profile state change denied' using errcode='42501'; end if;
  select * into previous from public.profiles where user_id=p_target_user_id for update;
  if previous.user_id is null then raise exception 'profile not found' using errcode='P0002'; end if;
  update public.profiles set is_active=p_is_active,updated_at=now() where user_id=p_target_user_id returning * into saved;
  if not p_is_active then update admin_vault.operator_scopes set is_active=false,updated_at=now() where user_id=p_target_user_id and is_active; end if;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,case when p_is_active then 'ACTIVATE_USER' else 'SUSPEND_USER' end,'AUTH_USER',p_target_user_id::text,to_jsonb(previous),to_jsonb(saved),p_reason);
  return to_jsonb(saved);
end
$$;

-- Pulso hardening. The preceding Pulso migration creates the tables and base RPCs.
alter table data_vault.pulse_measurements add column if not exists technical_sheet jsonb not null default '{}'::jsonb;
alter table data_vault.pulse_measurements add column if not exists source_id text;
alter table data_vault.pulse_measurements add column if not exists version integer not null default 1;
alter table data_vault.pulse_measurements add column if not exists preview_hash text;
alter table data_vault.pulse_measurements add column if not exists previewed_at timestamptz;
alter table data_vault.pulse_measurements add column if not exists validated_at timestamptz;
alter table data_vault.pulse_measurements add column if not exists approved_at timestamptz;
alter table data_vault.pulse_measurements add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table data_vault.pulse_measurements add column if not exists published_at timestamptz;
alter table data_vault.pulse_measurements add column if not exists published_by uuid references auth.users(id) on delete set null;
alter table data_vault.pulse_measurements add column if not exists supersedes_measurement_id uuid references data_vault.pulse_measurements(id);
alter table data_vault.pulse_measurements drop constraint if exists pulse_measurements_status_check;
alter table data_vault.pulse_measurements add constraint pulse_measurements_status_check check (
  status in ('BORRADOR','PREVALIDADA','APROBADA','PUBLICADA','ARCHIVADA','REVERTIDA')
);

create or replace function admin_vault.enforce_pulse_publication_workflow()
returns trigger language plpgsql set search_path=pg_catalog,data_vault,admin_vault,pg_temp as $$
begin
  if new.status='PUBLICADA' and (new.preview_hash is null or new.previewed_at is null or new.validated_at is null or new.approved_at is null or new.approved_by is null or new.published_at is null or new.published_by is null) then
    raise exception 'pulse publication requires preview, validation and approval' using errcode='22023';
  end if;
  return new;
end
$$;
drop trigger if exists pulse_publication_workflow_guard on data_vault.pulse_measurements;
create trigger pulse_publication_workflow_guard before insert or update on data_vault.pulse_measurements
for each row execute function admin_vault.enforce_pulse_publication_workflow();

create or replace function public.radar_admin_save_pulse_v2(
  p_actor_user_id uuid,p_actor_role text,p_measurement jsonb,p_results jsonb,p_measurement_id uuid,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,data_vault,admin_vault,pg_temp as $$
declare
  saved data_vault.pulse_measurements; existing data_vault.pulse_measurements;
  election_value text:=upper(nullif(btrim(p_measurement->>'election_type'),''));
  municipality_value text:=nullif(btrim(p_measurement->>'municipality_code'),'');
  department_value text:=nullif(btrim(p_measurement->>'department_code'),'');
  country_value text:=upper(coalesce(nullif(btrim(p_measurement->>'country_code'),''),'GT'));
  scope_value text; result_total numeric; result_row jsonb;
begin
  if p_actor_role not in ('super_admin','data_ops') then raise exception 'pulse draft denied' using errcode='42501'; end if;
  if election_value='ALCALDIA' then
    scope_value:='MUNICIPALITY';
    select m.country_code,m.department_code into country_value,department_value from public.municipalities m
      where m.municipality_code=municipality_value and not m.is_synthetic;
    if not found then raise exception 'unknown municipality scope' using errcode='22023'; end if;
  elsif election_value='DIP_DIST' then
    scope_value:='DEPARTMENT'; municipality_value:=null;
    if department_value !~ '^[0-9]{2}$' or not exists(select 1 from public.municipalities m where m.country_code=country_value and m.department_code=department_value and not m.is_synthetic)
      then raise exception 'unknown department scope' using errcode='22023'; end if;
  elsif election_value in ('PRESIDENTE','DIP_NAC','PARLACEN') then
    scope_value:='NATIONAL'; municipality_value:=null; department_value:=null;
  else raise exception 'invalid election type' using errcode='22023'; end if;
  if not admin_vault.operator_has_scope(p_actor_user_id,p_actor_role,'pulse:draft',country_value,department_value,municipality_value,null) then
    raise exception 'pulse territorial scope denied' using errcode='42501';
  end if;
  if nullif(btrim(p_measurement->>'source_id'),'') is null then raise exception 'pulse source_id required' using errcode='22023'; end if;
  if coalesce(jsonb_typeof(p_measurement->'technical_sheet'),'null')<>'object' or p_measurement->'technical_sheet'='{}'::jsonb then
    raise exception 'pulse technical_sheet required' using errcode='22023';
  end if;
  if jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results)<2 then raise exception 'at least two pulse results are required' using errcode='22023'; end if;
  select sum(nullif(value->>'value','')::numeric) into result_total from jsonb_array_elements(p_results) value;
  if result_total is null or result_total<99 or result_total>101 then raise exception 'pulse results must total approximately 100 percent' using errcode='22023'; end if;
  if p_measurement_id is not null then
    select * into existing from data_vault.pulse_measurements where id=p_measurement_id for update;
    if existing.id is null then raise exception 'pulse measurement not found' using errcode='P0002'; end if;
    if existing.status not in ('BORRADOR','PREVALIDADA') then raise exception 'approved or published pulse is immutable; create a new version' using errcode='42501'; end if;
  end if;
  insert into data_vault.pulse_measurements(
    id,folio,election_type,scope_type,country_code,department_code,municipality_code,field_start,field_end,
    sample_size,scope_label,methodology,technical_sheet,source_id,source_label,version,status,created_by,updated_by
  ) values (
    coalesce(p_measurement_id,gen_random_uuid()),nullif(btrim(p_measurement->>'folio'),''),election_value,scope_value,country_value,
    department_value,municipality_value,nullif(p_measurement->>'field_start','')::date,nullif(p_measurement->>'field_end','')::date,
    nullif(p_measurement->>'sample_size','')::integer,nullif(btrim(p_measurement->>'scope_label'),''),nullif(btrim(p_measurement->>'methodology'),''),
    p_measurement->'technical_sheet',nullif(btrim(p_measurement->>'source_id'),''),coalesce(nullif(btrim(p_measurement->>'source_label'),''),'RADAR'),
    coalesce(nullif(p_measurement->>'version','')::integer,1),'BORRADOR',p_actor_user_id,p_actor_user_id
  ) on conflict(id) do update set
    folio=excluded.folio,election_type=excluded.election_type,scope_type=excluded.scope_type,country_code=excluded.country_code,
    department_code=excluded.department_code,municipality_code=excluded.municipality_code,field_start=excluded.field_start,field_end=excluded.field_end,
    sample_size=excluded.sample_size,scope_label=excluded.scope_label,methodology=excluded.methodology,technical_sheet=excluded.technical_sheet,
    source_id=excluded.source_id,source_label=excluded.source_label,version=excluded.version,status='BORRADOR',preview_hash=null,previewed_at=null,
    validated_at=null,approved_at=null,approved_by=null,published_at=null,published_by=null,updated_by=p_actor_user_id,updated_at=now()
  returning * into saved;
  delete from data_vault.pulse_results where measurement_id=saved.id;
  for result_row in select value from jsonb_array_elements(p_results) loop
    insert into data_vault.pulse_results(measurement_id,option_code,candidate_name,organization,result_value,display_order)
    values(saved.id,nullif(btrim(result_row->>'option_code'),''),nullif(btrim(result_row->>'candidate_name'),''),
      nullif(btrim(result_row->>'organization'),''),nullif(result_row->>'value','')::numeric,
      coalesce(nullif(result_row->>'display_order','')::integer,0));
  end loop;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'SAVE_PULSE_DRAFT','PULSE_MEASUREMENT',saved.id::text,
    case when existing.id is null then null else to_jsonb(existing) end,to_jsonb(saved),p_reason,null,
    saved.municipality_code,saved.department_code,null);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_transition_pulse_v1(
  p_actor_user_id uuid,p_actor_role text,p_measurement_id uuid,p_target_status text,p_preview_hash text,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,data_vault,admin_vault,pg_temp as $$
declare measurement data_vault.pulse_measurements; previous jsonb; target text:=upper(p_target_status);
begin
  select * into measurement from data_vault.pulse_measurements where id=p_measurement_id for update;
  if measurement.id is null then raise exception 'pulse measurement not found' using errcode='P0002'; end if;
  if not admin_vault.operator_has_scope(p_actor_user_id,p_actor_role,
    case when upper(p_target_status)='PREVALIDADA' then 'pulse:draft' else 'pulse:approve' end,
    measurement.country_code,measurement.department_code,measurement.municipality_code,null) then
    raise exception 'pulse territorial scope denied' using errcode='42501';
  end if;
  previous:=to_jsonb(measurement);
  if target='PREVALIDADA' and measurement.status='BORRADOR' and p_actor_role in ('super_admin','data_ops') then
    if nullif(btrim(p_preview_hash),'') is null then raise exception 'pulse preview hash required' using errcode='22023'; end if;
    update data_vault.pulse_measurements set status=target,preview_hash=nullif(btrim(p_preview_hash),''),previewed_at=now(),validated_at=now(),updated_by=p_actor_user_id,updated_at=now() where id=p_measurement_id returning * into measurement;
  elsif target='APROBADA' and measurement.status='PREVALIDADA' and p_actor_role in ('super_admin','qa') then
    update data_vault.pulse_measurements set status=target,approved_by=p_actor_user_id,approved_at=now(),updated_by=p_actor_user_id,updated_at=now() where id=p_measurement_id returning * into measurement;
  elsif target='PUBLICADA' and measurement.status='APROBADA' and p_actor_role in ('super_admin','qa') then
    update data_vault.pulse_measurements set status=target,published_by=p_actor_user_id,published_at=now(),updated_by=p_actor_user_id,updated_at=now() where id=p_measurement_id returning * into measurement;
  elsif target in ('ARCHIVADA','REVERTIDA') and measurement.status='PUBLICADA' and p_actor_role in ('super_admin','qa') then
    update data_vault.pulse_measurements set status=target,updated_by=p_actor_user_id,updated_at=now() where id=p_measurement_id returning * into measurement;
  else raise exception 'invalid pulse transition' using errcode='42501'; end if;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'PULSE_'||target,'PULSE_MEASUREMENT',measurement.id::text,previous,to_jsonb(measurement),p_reason,null,measurement.municipality_code,measurement.department_code,null);
  return to_jsonb(measurement);
end
$$;

revoke all on function public.radar_admin_save_pulse_v1(jsonb,jsonb,uuid) from authenticated;
revoke all on function public.radar_admin_save_pulse_v1(jsonb,jsonb,uuid) from service_role;

-- Supabase Storage does not support native S3 object versioning. Every upload
-- therefore uses an immutable UUID path (upsert=false) and is versioned through
-- publication_batches + dataset_releases, both tied to a SHA-256 digest.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('radar-admin-staging','radar-admin-staging',false,52428800,array[
  'text/csv','application/json','application/pdf','application/zip',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

revoke all on function public.radar_admin_audit_v1(uuid,text,text,text,text,jsonb,jsonb,text,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.radar_admin_operator_context_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.radar_admin_snapshot_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.radar_admin_reserve_contract_v1(uuid,text,text,uuid,uuid,text,date,date,text,text) from public,anon,authenticated;
revoke all on function public.radar_admin_create_campaign_v1(uuid,text,text,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.radar_admin_register_source_v1(uuid,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.radar_admin_transition_publication_v1(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.radar_admin_create_publication_preview_v1(uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.radar_admin_rollback_release_v1(uuid,text,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.radar_admin_revoke_user_sessions_v1(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.radar_admin_open_support_session_v1(uuid,text,text,text,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.radar_admin_close_support_session_v1(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.radar_admin_assign_operator_scope_v1(uuid,text,uuid,text,jsonb,text[],text) from public,anon,authenticated;
revoke all on function public.radar_admin_set_profile_state_v1(uuid,text,uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.radar_admin_transition_pulse_v1(uuid,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.radar_admin_save_pulse_v2(uuid,text,jsonb,jsonb,uuid,text) from public,anon,authenticated;

grant execute on function public.radar_admin_audit_v1(uuid,text,text,text,text,jsonb,jsonb,text,uuid,text,text,uuid) to service_role;
grant execute on function public.radar_admin_operator_context_v1(uuid,text) to service_role;
grant execute on function public.radar_admin_snapshot_v1(uuid,text,text) to service_role;
grant execute on function public.radar_admin_reserve_contract_v1(uuid,text,text,uuid,uuid,text,date,date,text,text) to service_role;
grant execute on function public.radar_admin_create_campaign_v1(uuid,text,text,uuid,text,text,text,text) to service_role;
grant execute on function public.radar_admin_register_source_v1(uuid,text,jsonb,text) to service_role;
grant execute on function public.radar_admin_transition_publication_v1(uuid,text,uuid,text,text) to service_role;
grant execute on function public.radar_admin_create_publication_preview_v1(uuid,text,jsonb,jsonb,text) to service_role;
grant execute on function public.radar_admin_rollback_release_v1(uuid,text,uuid,uuid,text) to service_role;
grant execute on function public.radar_admin_revoke_user_sessions_v1(uuid,text,uuid,text) to service_role;
grant execute on function public.radar_admin_open_support_session_v1(uuid,text,text,text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.radar_admin_close_support_session_v1(uuid,text,uuid,text) to service_role;
grant execute on function public.radar_admin_assign_operator_scope_v1(uuid,text,uuid,text,jsonb,text[],text) to service_role;
grant execute on function public.radar_admin_set_profile_state_v1(uuid,text,uuid,boolean,text) to service_role;
grant execute on function public.radar_admin_transition_pulse_v1(uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.radar_admin_save_pulse_v2(uuid,text,jsonb,jsonb,uuid,text) to service_role;

comment on schema admin_vault is 'Private control plane for RADAR national superadministration; not exposed to browser clients.';
comment on table admin_vault.commercial_contracts is 'Database-enforced territorial exclusivity using non-overlapping dateranges.';
comment on table admin_vault.audit_events is 'Append-only audit log with actor, role, before/after and reason.';
comment on function public.radar_admin_snapshot_v1(uuid,text,text) is 'Service-role-only aggregated snapshot; never returns voter, DPI, CRM or private document rows.';

-- Source: 20260918183200_superadmin_security_hardening_v1.sql
-- Defense-in-depth for service-only administrative functions.

create or replace function public.radar_admin_open_support_session_v1(
  p_actor_user_id uuid,p_actor_role text,p_ticket_ref text,p_municipality_code text,p_campaign_id uuid,p_access_mode text,p_reason text,p_expires_at timestamptz
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare
  saved admin_vault.support_sessions;
  municipality_value text:=nullif(btrim(p_municipality_code),'');
  department_value text;
  campaign_municipality text;
begin
  if p_actor_role not in ('super_admin','support') then raise exception 'support session denied' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '8 hours' then
    raise exception 'support session expiry must be within the next 8 hours' using errcode='22023';
  end if;
  if municipality_value is not null then
    select department_code into department_value from public.municipalities
      where municipality_code=municipality_value and not is_synthetic;
    if not found then raise exception 'unknown support municipality' using errcode='22023'; end if;
  end if;
  if p_campaign_id is not null then
    select m.municipality_code,m.department_code into campaign_municipality,department_value
      from public.campaigns c join public.municipalities m on m.id=c.municipality_id
      where c.id=p_campaign_id and not m.is_synthetic;
    if not found then raise exception 'unknown support campaign' using errcode='22023'; end if;
    if municipality_value is not null and municipality_value<>campaign_municipality then
      raise exception 'support campaign municipality mismatch' using errcode='22023';
    end if;
    municipality_value:=campaign_municipality;
  end if;
  if municipality_value is null and p_campaign_id is null then
    raise exception 'support scope required' using errcode='22023';
  end if;
  if not admin_vault.operator_has_scope(
    p_actor_user_id,p_actor_role,'support:open','GT',department_value,municipality_value,p_campaign_id
  ) then raise exception 'support territorial scope denied' using errcode='42501'; end if;
  insert into admin_vault.support_sessions(ticket_ref,operator_user_id,municipality_code,campaign_id,access_mode,reason,expires_at)
  values(nullif(btrim(p_ticket_ref),''),p_actor_user_id,municipality_value,p_campaign_id,upper(p_access_mode),p_reason,p_expires_at)
  returning * into saved;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'OPEN_SUPPORT_SESSION','SUPPORT_SESSION',saved.id::text,null,to_jsonb(saved),p_reason,null,municipality_value,department_value,p_campaign_id);
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_admin_close_support_session_v1(
  p_actor_user_id uuid,p_actor_role text,p_session_id uuid,p_reason text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare
  previous admin_vault.support_sessions;
  saved admin_vault.support_sessions;
  department_value text;
begin
  if p_actor_role not in ('super_admin','support') then raise exception 'support close denied' using errcode='42501'; end if;
  select * into previous from admin_vault.support_sessions where id=p_session_id and status='OPEN' for update;
  if previous.id is null then raise exception 'open support session not found' using errcode='P0002'; end if;
  if p_actor_role='support' and previous.operator_user_id<>p_actor_user_id then
    raise exception 'support session ownership mismatch' using errcode='42501';
  end if;
  select department_code into department_value from public.municipalities
    where municipality_code=previous.municipality_code and not is_synthetic;
  if not admin_vault.operator_has_scope(
    p_actor_user_id,p_actor_role,'support:close','GT',department_value,previous.municipality_code,previous.campaign_id
  ) then raise exception 'support territorial scope denied' using errcode='42501'; end if;
  update admin_vault.support_sessions set status='CLOSED',closed_at=now() where id=p_session_id returning * into saved;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'CLOSE_SUPPORT_SESSION','SUPPORT_SESSION',saved.id::text,to_jsonb(previous),to_jsonb(saved),p_reason,null,saved.municipality_code,department_value,saved.campaign_id);
  return to_jsonb(saved);
end
$$;

revoke all on all functions in schema admin_vault from public,anon,authenticated;
grant execute on all functions in schema admin_vault to service_role;
revoke all on function public.radar_admin_open_support_session_v1(uuid,text,text,text,uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.radar_admin_close_support_session_v1(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.radar_admin_open_support_session_v1(uuid,text,text,text,uuid,text,text,timestamptz) to service_role;
grant execute on function public.radar_admin_close_support_session_v1(uuid,text,uuid,text) to service_role;

-- Source: 20260918183300_superadmin_performance_hardening_v1.sql
-- Cover foreign keys used by the national control plane and close a trigger-only
-- SECURITY DEFINER function that must never be callable as an RPC.

revoke all on function public.handle_new_user() from public,anon,authenticated;

create index if not exists operator_scopes_campaign_idx on admin_vault.operator_scopes(campaign_id) where campaign_id is not null;
create index if not exists operator_scopes_granted_by_idx on admin_vault.operator_scopes(granted_by) where granted_by is not null;
create index if not exists commercial_contracts_organization_idx on admin_vault.commercial_contracts(client_organization_id);
create index if not exists commercial_contracts_created_by_idx on admin_vault.commercial_contracts(created_by);
create index if not exists commercial_contracts_updated_by_idx on admin_vault.commercial_contracts(updated_by) where updated_by is not null;
create index if not exists source_registry_layer_idx on admin_vault.source_registry(layer_id);
create index if not exists source_registry_registered_by_idx on admin_vault.source_registry(registered_by) where registered_by is not null;
create index if not exists publication_batches_layer_idx on admin_vault.publication_batches(layer_id) where layer_id is not null;
create index if not exists publication_batches_campaign_idx on admin_vault.publication_batches(campaign_id) where campaign_id is not null;
create index if not exists publication_batches_uploaded_by_idx on admin_vault.publication_batches(uploaded_by);
create index if not exists publication_batches_previewed_by_idx on admin_vault.publication_batches(previewed_by) where previewed_by is not null;
create index if not exists publication_batches_approved_by_idx on admin_vault.publication_batches(approved_by) where approved_by is not null;
create index if not exists publication_batches_published_by_idx on admin_vault.publication_batches(published_by) where published_by is not null;
create index if not exists publication_batches_rejected_by_idx on admin_vault.publication_batches(rejected_by) where rejected_by is not null;
create index if not exists dataset_releases_batch_idx on admin_vault.dataset_releases(batch_id);
create index if not exists dataset_releases_supersedes_idx on admin_vault.dataset_releases(supersedes_release_id) where supersedes_release_id is not null;
create index if not exists dataset_releases_rollback_idx on admin_vault.dataset_releases(rolled_back_from_release_id) where rolled_back_from_release_id is not null;
create index if not exists dataset_releases_published_by_idx on admin_vault.dataset_releases(published_by);
create index if not exists audit_events_actor_idx on admin_vault.audit_events(actor_user_id) where actor_user_id is not null;
create index if not exists audit_events_campaign_idx on admin_vault.audit_events(campaign_id) where campaign_id is not null;
create index if not exists support_sessions_campaign_idx on admin_vault.support_sessions(campaign_id) where campaign_id is not null;
create index if not exists deployments_deployed_by_idx on admin_vault.deployments(deployed_by) where deployed_by is not null;
create index if not exists rtd_monitoring_campaign_idx on admin_vault.rtd_monitoring_snapshots(campaign_id) where campaign_id is not null;

create index if not exists pulse_measurements_created_by_idx on data_vault.pulse_measurements(created_by) where created_by is not null;
create index if not exists pulse_measurements_updated_by_idx on data_vault.pulse_measurements(updated_by) where updated_by is not null;
create index if not exists pulse_measurements_approved_by_idx on data_vault.pulse_measurements(approved_by) where approved_by is not null;
create index if not exists pulse_measurements_published_by_idx on data_vault.pulse_measurements(published_by) where published_by is not null;
create index if not exists pulse_measurements_supersedes_idx on data_vault.pulse_measurements(supersedes_measurement_id) where supersedes_measurement_id is not null;

-- Source: 20260925022700_admin_snapshot_qa_schema_compatibility.sql
create or replace function admin_vault.radar_optional_campaign_row_count_v1(
  p_relation_name text,
  p_campaign_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_relation regclass;
  row_count bigint;
begin
  target_relation := to_regclass(p_relation_name);
  if target_relation is null then
    return 0;
  end if;

  execute format('select count(*) from %s where campaign_id = $1', target_relation)
    into row_count
    using p_campaign_id;

  return coalesce(row_count, 0);
end
$$;

revoke all on function admin_vault.radar_optional_campaign_row_count_v1(text,uuid)
  from public, anon, authenticated;
grant execute on function admin_vault.radar_optional_campaign_row_count_v1(text,uuid)
  to service_role;

comment on function admin_vault.radar_optional_campaign_row_count_v1(text,uuid)
  is 'Returns a campaign row count for an optional vault relation without exposing its rows.';

do $$
declare
  snapshot_definition text;
  patched_definition text;
  old_voter_expression constant text :=
    '(select count(*) from campaign_vault.voter_directory v where v.campaign_id=c.id) voter_records,';
  new_voter_expression constant text :=
    'admin_vault.radar_optional_campaign_row_count_v1(''campaign_vault.voter_directory'',c.id) voter_records,';
  old_deployment_expression constant text :=
    '(select id,environment,git_sha,build_id,version_label,status,deployed_at,blockers,created_at from admin_vault.deployments order by created_at desc limit 20)';
  new_deployment_expression constant text :=
    '(select id,environment,git_sha,build_id,version_label,status,deployed_at,blockers,deployed_at as created_at from admin_vault.deployments order by deployed_at desc limit 20)';
begin
  select pg_get_functiondef('public.radar_admin_snapshot_v1(uuid,text,text)'::regprocedure)
    into snapshot_definition;

  patched_definition := replace(snapshot_definition, old_voter_expression, new_voter_expression);
  patched_definition := replace(patched_definition, old_deployment_expression, new_deployment_expression);

  if patched_definition = snapshot_definition then
    raise exception 'radar_admin_snapshot_v1 compatibility patch targets were not found';
  end if;

  execute patched_definition;
end
$$;

revoke all on function public.radar_admin_snapshot_v1(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.radar_admin_snapshot_v1(uuid,text,text)
  to service_role;

-- Source: 20260925081534_campaign_member_management.sql
-- QA control plane: membership changes are atomic, audited and service-only.
create or replace function public.radar_admin_campaign_member_v1(
 p_actor_user_id uuid,p_actor_role text,p_campaign_id uuid,p_user_id uuid,p_member_role text,p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare c public.campaigns; previous public.campaign_members; saved public.campaign_members;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Indica el motivo'; end if;
 select * into c from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Campaña inexistente'; end if;
 if p_member_role is not null and ((c.is_demo and p_member_role not in ('demo_admin','demo_viewer')) or (not c.is_demo and p_member_role not in ('campaign_admin','campaign_editor','campaign_viewer'))) then raise exception 'Rol incompatible con la campaña'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Usuario inexistente'; end if;
 select * into previous from public.campaign_members where campaign_id=p_campaign_id and user_id=p_user_id;
 if previous.member_role in ('campaign_admin','demo_admin') and (p_member_role is null or p_member_role not in ('campaign_admin','demo_admin')) and not exists(select 1 from public.campaign_members where campaign_id=p_campaign_id and user_id<>p_user_id and member_role in ('campaign_admin','demo_admin')) then raise exception 'Asigna otro administrador antes de retirar este acceso'; end if;
 if p_member_role is null then
   delete from public.campaign_members where campaign_id=p_campaign_id and user_id=p_user_id;
 else
   insert into public.profiles(user_id,platform_role,is_active) values(p_user_id,'user',true) on conflict(user_id) do nothing;
   insert into public.campaign_members(campaign_id,user_id,member_role) values(p_campaign_id,p_user_id,p_member_role)
   on conflict(campaign_id,user_id) do update set member_role=excluded.member_role returning * into saved;
 end if;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,case when p_member_role is null then 'REMOVE_CAMPAIGN_MEMBER' else 'ASSIGN_CAMPAIGN_MEMBER' end,'CAMPAIGN_MEMBER',p_campaign_id::text||':'||p_user_id::text,to_jsonb(previous),to_jsonb(saved),p_reason,null,null,null,p_campaign_id);
 return jsonb_build_object('campaign_id',p_campaign_id,'user_id',p_user_id,'member_role',p_member_role);
end $$;
revoke all on function public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text) to service_role;

-- Source: 20260925081917_contract_release_workflow.sql
-- Release only a selected contract. Retain private records and revoke campaign memberships.
create or replace function public.radar_admin_release_contract_v1(p_actor_user_id uuid,p_actor_role text,p_contract_id uuid,p_confirmation text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare previous admin_vault.commercial_contracts; saved admin_vault.commercial_contracts; members jsonb;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Indica el motivo'; end if;
 select * into previous from admin_vault.commercial_contracts where id=p_contract_id for update;
 if not found then raise exception 'Contrato inexistente'; end if;
 if p_confirmation is distinct from previous.contract_ref then raise exception 'Escribe la referencia exacta del contrato'; end if;
 if previous.status not in ('RESERVED','ACTIVE','SUSPENDED') then raise exception 'El contrato ya no protege el municipio'; end if;
 if previous.campaign_id is not null then
  perform 1 from public.campaigns where id=previous.campaign_id for update;
  select coalesce(jsonb_agg(to_jsonb(cm)),'[]') into members from public.campaign_members cm where campaign_id=previous.campaign_id;
  delete from public.campaign_members where campaign_id=previous.campaign_id;
  update public.campaigns set status='paused' where id=previous.campaign_id;
 end if;
 update admin_vault.commercial_contracts set status='ENDED',updated_by=p_actor_user_id,updated_at=now() where id=p_contract_id returning * into saved;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'RELEASE_CONTRACT','COMMERCIAL_CONTRACT',p_contract_id::text,jsonb_build_object('contract',to_jsonb(previous),'members',members),to_jsonb(saved),p_reason,null,null,null,previous.campaign_id);
 return jsonb_build_object('contract_id',p_contract_id,'status','ENDED','removed_members',coalesce(jsonb_array_length(members),0));
end $$;
revoke all on function public.radar_admin_release_contract_v1(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.radar_admin_release_contract_v1(uuid,text,uuid,text,text) to service_role;

-- Source: 20260925082241_campaign_member_active_admin_guard.sql
-- QA control plane: membership changes are atomic, audited and service-only.
create or replace function public.radar_admin_campaign_member_v1(
 p_actor_user_id uuid,p_actor_role text,p_campaign_id uuid,p_user_id uuid,p_member_role text,p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare c public.campaigns; previous public.campaign_members; saved public.campaign_members;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Indica el motivo'; end if;
 select * into c from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Campaña inexistente'; end if;
 if p_member_role is not null and ((c.is_demo and p_member_role not in ('demo_admin','demo_viewer')) or (not c.is_demo and p_member_role not in ('campaign_admin','campaign_editor','campaign_viewer'))) then raise exception 'Rol incompatible con la campaña'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Usuario inexistente'; end if;
 select * into previous from public.campaign_members where campaign_id=p_campaign_id and user_id=p_user_id;
 if previous.member_role in ('campaign_admin','demo_admin') and (p_member_role is null or p_member_role not in ('campaign_admin','demo_admin')) and not exists(select 1 from public.campaign_members cm join public.profiles p on p.user_id=cm.user_id and p.is_active join auth.users u on u.id=cm.user_id where cm.campaign_id=p_campaign_id and cm.user_id<>p_user_id and cm.member_role in ('campaign_admin','demo_admin') and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Asigna otro administrador antes de retirar este acceso'; end if;
 if p_member_role is null then
   delete from public.campaign_members where campaign_id=p_campaign_id and user_id=p_user_id;
 else
   insert into public.profiles(user_id,platform_role,is_active) values(p_user_id,'user',true) on conflict(user_id) do nothing;
   insert into public.campaign_members(campaign_id,user_id,member_role) values(p_campaign_id,p_user_id,p_member_role)
   on conflict(campaign_id,user_id) do update set member_role=excluded.member_role returning * into saved;
 end if;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,case when p_member_role is null then 'REMOVE_CAMPAIGN_MEMBER' else 'ASSIGN_CAMPAIGN_MEMBER' end,'CAMPAIGN_MEMBER',p_campaign_id::text||':'||p_user_id::text,to_jsonb(previous),to_jsonb(saved),p_reason,null,null,null,p_campaign_id);
 return jsonb_build_object('campaign_id',p_campaign_id,'user_id',p_user_id,'member_role',p_member_role);
end $$;
revoke all on function public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text) to service_role;

-- Source: 20260925083113_admin_service_read_grants.sql
-- Internal Edge service reads; client grants and RLS remain unchanged.
grant select on public.campaign_members, public.campaigns, public.municipalities to service_role;

-- Source: 20260926004419_client_lifecycle_workspace.sql
create table admin_vault.client_accounts (
 campaign_id uuid primary key references public.campaigns(id),
 request_id uuid not null unique,
 administrator_name text not null,
 administrator_email text not null,
 seat_limit integer not null default 10 check(seat_limit between 1 and 1000),
 created_at timestamptz not null default now()
);
alter table admin_vault.client_accounts enable row level security;
revoke all on admin_vault.client_accounts from anon,authenticated;

create or replace function admin_vault.check_campaign_seat_limit() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare capacity integer;
begin
 perform 1 from public.campaigns where id=new.campaign_id for update;
 select seat_limit into capacity from admin_vault.client_accounts where campaign_id=new.campaign_id;
 if capacity is not null and not exists(select 1 from public.campaign_members where campaign_id=new.campaign_id and user_id=new.user_id) and (select count(*) from public.campaign_members where campaign_id=new.campaign_id)>=capacity then
  raise exception 'Se alcanzó el cupo de usuarios. Solicita una ampliación a RADAR.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function admin_vault.check_campaign_seat_limit() from public,anon,authenticated;
create trigger campaign_seat_limit before insert or update on public.campaign_members for each row execute function admin_vault.check_campaign_seat_limit();

create or replace function public.radar_admin_clients_v1(p_actor_user_id uuid,p_actor_role text,p_operation text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare municipality public.municipalities; campaign public.campaigns; account admin_vault.client_accounts; organization uuid; contract uuid; request uuid; result jsonb; capacity integer; archive jsonb; table_name text;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if p_operation='list' then
  return (select coalesce(jsonb_agg(to_jsonb(a)),'[]') from admin_vault.client_accounts a);
 elsif p_operation='onboard' then
  request:=(p_input->>'request_id')::uuid;
  select * into account from admin_vault.client_accounts where request_id=request;
  if found then return to_jsonb(account); end if;
  capacity:=(p_input->>'seat_limit')::integer;
  if capacity not between 1 and 1000 or capacity is null then raise exception 'Cupo inválido'; end if;
  if nullif(trim(p_input->>'name'),'') is null or nullif(trim(p_input->>'display_name'),'') is null or coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Completa nombre de campaña, administrador y correo'; end if;
  select * into municipality from public.municipalities where municipality_code=p_input->>'municipality_code' and not is_synthetic for update;
  if not found then raise exception 'Municipio no válido'; end if;
  if exists(select 1 from admin_vault.commercial_contracts where municipality_id=municipality.id and status in ('RESERVED','ACTIVE','SUSPENDED') and contract_period && daterange(current_date,(p_input->>'valid_until')::date,'[]')) then raise exception 'El municipio ya tiene un contrato que coincide con esta vigencia'; end if;
  insert into public.organizations(name,slug,country_code) values(trim(p_input->>'name'),'cliente-'||request::text,'GT') returning id into organization;
  insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status) values(organization,'GT',municipality.id,trim(p_input->>'name'),'campana-'||request::text,false,'active') returning * into campaign;
  insert into admin_vault.commercial_contracts(municipality_id,campaign_id,client_organization_id,contract_ref,valid_from,valid_until,status,created_by) values(municipality.id,campaign.id,organization,'RADAR-'||municipality.municipality_code||'-'||left(request::text,8),current_date,(p_input->>'valid_until')::date,'ACTIVE',p_actor_user_id) returning id into contract;
  insert into admin_vault.client_accounts(campaign_id,request_id,administrator_name,administrator_email,seat_limit) values(campaign.id,request,trim(p_input->>'display_name'),lower(trim(p_input->>'email')),capacity) returning * into account;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'ONBOARD_CLIENT','CAMPAIGN',campaign.id::text,null,to_jsonb(account),'Contratación confirmada desde Clientes y municipios',null,municipality.municipality_code,municipality.department_code,campaign.id);
  return to_jsonb(account);
 elsif p_operation='limit' then
  perform 1 from public.campaigns where id=(p_input->>'campaign_id')::uuid for update;
  capacity:=(p_input->>'seat_limit')::integer;
  if capacity<(select count(*) from public.campaign_members where campaign_id=(p_input->>'campaign_id')::uuid) then raise exception 'El cupo no puede ser menor al equipo actual'; end if;
  update admin_vault.client_accounts set seat_limit=capacity where campaign_id=(p_input->>'campaign_id')::uuid returning * into account;
  if not found then raise exception 'Esta campaña todavía no tiene ficha de contratación'; end if;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'UPDATE_SEAT_LIMIT','CAMPAIGN',account.campaign_id::text,null,to_jsonb(account),'Ajuste de cupo contratado',null,null,null,account.campaign_id);
  return to_jsonb(account);
 elsif p_operation='reactivate' then
  select * into campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and not is_demo for update;
  if not found or campaign.status='active' then raise exception 'Selecciona una campaña archivada o pausada'; end if;
  select * into municipality from public.municipalities where id=campaign.municipality_id for update;
  insert into admin_vault.commercial_contracts(municipality_id,campaign_id,client_organization_id,contract_ref,valid_from,valid_until,status,created_by) values(campaign.municipality_id,campaign.id,campaign.organization_id,'RADAR-REN-'||gen_random_uuid()::text,current_date,(p_input->>'valid_until')::date,'ACTIVE',p_actor_user_id);
  update public.campaigns set status='active' where id=campaign.id;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'REACTIVATE_CLIENT','CAMPAIGN',campaign.id::text,to_jsonb(campaign),jsonb_build_object('status','active'),'Recontratación; los accesos se asignan nuevamente desde la ficha',null,municipality.municipality_code,municipality.department_code,campaign.id);
  return jsonb_build_object('campaign_id',campaign.id);
 elsif p_operation='reset_demo' then
  select * into campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and is_demo for update;
  if not found then raise exception 'Solo se pueden reiniciar campañas demo'; end if;
  if p_input->>'confirmation' is distinct from campaign.name then raise exception 'Escribe el nombre exacto de la demo'; end if;
  archive:='{}';
  foreach table_name in array array['rtd_results','incidents','activities','fiscales','contacts','candidates','campaign_identity','campaign_records','commitments','resources','strategy_items','pulse_snapshots'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from demo_vault.%I t where campaign_id=$1',table_name) into result using campaign.id;
   archive:=archive||jsonb_build_object(table_name,result);
  end loop;
  -- Preserve a private recovery copy in the existing closed, append-only audit log.
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'RESET_DEMO','CAMPAIGN',campaign.id::text,archive,'{}','Reinicio de información privada de demostración',null,null,null,campaign.id);
  foreach table_name in array array['rtd_results','incidents','activities','fiscales','contacts','candidates','campaign_identity','campaign_records','commitments','resources','strategy_items','pulse_snapshots'] loop
   execute format('delete from demo_vault.%I where campaign_id=$1',table_name) using campaign.id;
  end loop;
  return jsonb_build_object('campaign_id',campaign.id,'reset',true);
 end if;
 raise exception 'Operación no reconocida';
end $$;
revoke all on function public.radar_admin_clients_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_clients_v1(uuid,text,text,jsonb) to service_role;

-- Source: 20260926004853_shared_resources_announcements.sql
create table admin_vault.shared_content (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('resource','notice')),
 title text not null check(length(trim(title))>0),body text not null default '',category text,
 storage_path text,file_name text,version text not null default '1',
 municipality_code text check(municipality_code is null or municipality_code ~ '^[0-9]{4}$'),
 starts_at timestamptz not null default now(),ends_at timestamptz,
 status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','ARCHIVED')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at),check(kind<>'resource' or storage_path is not null)
);
alter table admin_vault.shared_content enable row level security;
create table admin_vault.notice_receipts(content_id uuid references admin_vault.shared_content(id),user_id uuid references auth.users(id),seen_at timestamptz default now(),primary key(content_id,user_id));
alter table admin_vault.notice_receipts enable row level security;
revoke all on admin_vault.shared_content,admin_vault.notice_receipts from anon,authenticated;

create or replace function public.radar_admin_content_v1(p_actor_user_id uuid,p_actor_role text,p_operation text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare saved admin_vault.shared_content; previous admin_vault.shared_content;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if p_operation='list' then return (select coalesce(jsonb_agg(to_jsonb(c) order by created_at desc),'[]') from admin_vault.shared_content c); end if;
 if p_operation='save' then
  if nullif(p_input->>'municipality_code','') is not null and not exists(select 1 from public.municipalities where municipality_code=p_input->>'municipality_code' and not is_synthetic) then raise exception 'Municipio inválido'; end if;
  insert into admin_vault.shared_content(kind,title,body,category,storage_path,file_name,version,municipality_code,starts_at,ends_at,created_by)
  values(p_input->>'kind',trim(p_input->>'title'),coalesce(p_input->>'body',''),p_input->>'category',p_input->>'storage_path',p_input->>'file_name',coalesce(nullif(p_input->>'version',''),'1'),nullif(p_input->>'municipality_code',''),coalesce(nullif(p_input->>'starts_at','')::timestamptz,now()),nullif(p_input->>'ends_at','')::timestamptz,p_actor_user_id) returning * into saved;
 elsif p_operation in ('publish','archive') then
  select * into previous from admin_vault.shared_content where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'Publicación inexistente'; end if;
  update admin_vault.shared_content set status=case when p_operation='publish' then 'PUBLISHED' else 'ARCHIVED' end where id=previous.id returning * into saved;
 else raise exception 'Operación inválida'; end if;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'CONTENT_'||upper(p_operation),'SHARED_CONTENT',saved.id::text,to_jsonb(previous),to_jsonb(saved),'Publicación gestionada desde Recursos y Avisos');
 return to_jsonb(saved);
end $$;
revoke all on function public.radar_admin_content_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_content_v1(uuid,text,text,jsonb) to service_role;

create or replace function public.radar_shared_content_v1(p_campaign_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare municipality text;
begin
 if auth.uid() is null or not private.is_campaign_member(p_campaign_id,null) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select m.municipality_code into municipality from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.id=p_campaign_id and c.status='active';
 if not found then raise exception 'Campaña no activa'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(c)-'created_by'),'[]') from admin_vault.shared_content c where status='PUBLISHED' and starts_at<=now() and (ends_at is null or ends_at>now()) and (c.municipality_code is null or c.municipality_code=municipality) and (kind='resource' or not exists(select 1 from admin_vault.notice_receipts r where r.content_id=c.id and r.user_id=auth.uid())));
end $$;
revoke all on function public.radar_shared_content_v1(uuid) from public,anon;
grant execute on function public.radar_shared_content_v1(uuid) to authenticated;

create or replace function public.radar_ack_notice_v1(p_campaign_id uuid,p_content_id uuid) returns boolean language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
begin
 if not exists(select 1 from jsonb_array_elements(public.radar_shared_content_v1(p_campaign_id)) x where x->>'id'=p_content_id::text and x->>'kind'='notice') then raise exception 'Aviso no disponible'; end if;
 insert into admin_vault.notice_receipts(content_id,user_id) values(p_content_id,auth.uid()) on conflict do nothing;
 return true;
end $$;
revoke all on function public.radar_ack_notice_v1(uuid,uuid) from public,anon;
grant execute on function public.radar_ack_notice_v1(uuid,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('radar-shared-resources','radar-shared-resources',false,26214400) on conflict(id) do nothing;
create or replace function private.can_read_shared_resource(target_path text) returns boolean language sql stable security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
 select exists(select 1 from admin_vault.shared_content s where s.storage_path=target_path and s.kind='resource' and s.status='PUBLISHED' and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and exists(select 1 from public.campaign_members cm join public.campaigns c on c.id=cm.campaign_id and c.status='active' join public.profiles p on p.user_id=cm.user_id and p.is_active join public.municipalities m on m.id=c.municipality_id where cm.user_id=auth.uid() and (s.municipality_code is null or s.municipality_code=m.municipality_code)))
$$;
revoke all on function private.can_read_shared_resource(text) from public,anon;
grant execute on function private.can_read_shared_resource(text) to authenticated;
create policy shared_resource_member_read on storage.objects for select to authenticated using(bucket_id='radar-shared-resources' and private.can_read_shared_resource(name));

-- Source: 20260926005345_campaign_team_self_service.sql
create or replace function public.radar_campaign_team_v1(p_actor_user_id uuid,p_campaign_id uuid,p_operation text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare target uuid; target_role text; previous public.campaign_members; capacity integer; municipality text;
begin
 perform 1 from public.campaigns where id=p_campaign_id and status='active' and not is_demo for update;
 if not found or not exists(select 1 from public.campaign_members cm join public.profiles p on p.user_id=cm.user_id and p.is_active where cm.campaign_id=p_campaign_id and cm.user_id=p_actor_user_id and cm.member_role='campaign_admin') then raise exception 'Solo el administrador de esta campaña puede gestionar su equipo' using errcode='42501'; end if;
 select seat_limit into capacity from admin_vault.client_accounts where campaign_id=p_campaign_id;
 capacity:=coalesce(capacity,10);
 select m.municipality_code into municipality from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.id=p_campaign_id;
 if p_operation='list' then return jsonb_build_object('seat_limit',capacity,'municipality_code',municipality,'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',cm.user_id,'email',u.email,'member_role',cm.member_role)),'[]') from public.campaign_members cm join auth.users u on u.id=cm.user_id where cm.campaign_id=p_campaign_id)); end if;
 if p_operation='prepare_invite' then
  if (select count(*) from public.campaign_members where campaign_id=p_campaign_id)>=capacity then raise exception 'Cupo completo. Solicita una ampliación a RADAR.'; end if;
  return jsonb_build_object('municipality_code',municipality);
 end if;
 target:=(p_input->>'user_id')::uuid;target_role:=p_input->>'member_role';
 select * into previous from public.campaign_members where campaign_id=p_campaign_id and user_id=target;
 if previous.member_role='campaign_admin' or target=p_actor_user_id then raise exception 'El administrador principal solo puede cambiarse desde RADAR'; end if;
 if p_operation='remove' then delete from public.campaign_members where campaign_id=p_campaign_id and user_id=target;
 elsif p_operation='assign' then
  if target_role not in ('campaign_editor','campaign_viewer') or target_role is null then raise exception 'Selecciona Editor o Consulta'; end if;
  if previous.user_id is null and (select count(*) from public.campaign_members where campaign_id=p_campaign_id)>=capacity then raise exception 'Cupo completo'; end if;
  insert into public.campaign_members(campaign_id,user_id,member_role) values(p_campaign_id,target,target_role) on conflict(campaign_id,user_id) do update set member_role=excluded.member_role;
 else raise exception 'Operación inválida'; end if;
 insert into admin_vault.audit_events(actor_user_id,actor_role,action,entity_type,entity_id,campaign_id,before_state,after_state,reason)
 values(p_actor_user_id,'campaign_admin','TEAM_'||upper(p_operation),'CAMPAIGN_MEMBER',target::text,p_campaign_id,to_jsonb(previous),jsonb_build_object('member_role',case when p_operation='remove' then null else target_role end),'Gestión de equipo por el administrador del cliente');
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.radar_campaign_team_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_campaign_team_v1(uuid,uuid,text,jsonb) to service_role;

-- Source: 20260926010130_client_contract_access_guard.sql
-- Contract dates apply to the newly contracted clients; legacy QA fixtures are unchanged.
create or replace function private.is_campaign_member(target_campaign uuid,allowed_roles text[] default null) returns boolean language sql stable security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
 select exists(select 1 from public.campaign_members cm join public.profiles p on p.user_id=cm.user_id and p.is_active join public.campaigns c on c.id=cm.campaign_id and c.status='active'
 where cm.campaign_id=target_campaign and cm.user_id=auth.uid() and (allowed_roles is null or cm.member_role=any(allowed_roles))
 and (not exists(select 1 from admin_vault.client_accounts a where a.campaign_id=c.id) or exists(select 1 from admin_vault.commercial_contracts cc where cc.campaign_id=c.id and cc.status='ACTIVE' and cc.contract_period @> current_date)));
$$;
-- Apply the same active-contract guard when resolving a customer's runtime context.
create or replace function public.radar_authorized_context_v2(route_kind text,route_key text)
returns table(country_code text,municipality_id uuid,municipality_code text,municipality_name text,department_code text,department_name text,campaign_id uuid,campaign_name text,user_role text,permissions text[],is_demo boolean)
language sql stable set search_path=pg_catalog,public,private,pg_temp as $$
 select * from private.radar_authorized_context_v2(route_kind,route_key) c where c.user_role='platform_admin' or private.is_campaign_member(c.campaign_id,null)
$$;

-- Source: 20260926010311_client_shared_access_hardening.sql
create or replace function public.radar_campaign_team_v1(p_actor_user_id uuid,p_campaign_id uuid,p_operation text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare target uuid; target_role text; previous public.campaign_members; capacity integer; municipality text;
begin
 perform 1 from public.campaigns where id=p_campaign_id and status='active' and not is_demo for update;
 if not found or not exists(select 1 from public.campaign_members cm join public.profiles p on p.user_id=cm.user_id and p.is_active where cm.campaign_id=p_campaign_id and cm.user_id=p_actor_user_id and cm.member_role='campaign_admin') then raise exception 'Solo el administrador de esta campaña puede gestionar su equipo' using errcode='42501'; end if;
 select seat_limit into capacity from admin_vault.client_accounts where campaign_id=p_campaign_id;
 capacity:=coalesce(capacity,10);
 if exists(select 1 from admin_vault.client_accounts where campaign_id=p_campaign_id) and not exists(select 1 from admin_vault.commercial_contracts where campaign_id=p_campaign_id and status='ACTIVE' and contract_period @> current_date) then raise exception 'El contrato de esta campaña no está vigente'; end if;
 select m.municipality_code into municipality from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.id=p_campaign_id;
 if p_operation='list' then return jsonb_build_object('seat_limit',capacity,'municipality_code',municipality,'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',cm.user_id,'email',u.email,'member_role',cm.member_role)),'[]') from public.campaign_members cm join auth.users u on u.id=cm.user_id where cm.campaign_id=p_campaign_id)); end if;
 if p_operation='prepare_invite' then
  if (select count(*) from public.campaign_members where campaign_id=p_campaign_id)>=capacity then raise exception 'Cupo completo. Solicita una ampliación a RADAR.'; end if;
  return jsonb_build_object('municipality_code',municipality);
 end if;
 target:=(p_input->>'user_id')::uuid;target_role:=p_input->>'member_role';
 select * into previous from public.campaign_members where campaign_id=p_campaign_id and user_id=target;
 if previous.member_role='campaign_admin' or target=p_actor_user_id then raise exception 'El administrador principal solo puede cambiarse desde RADAR'; end if;
 if p_operation='remove' then delete from public.campaign_members where campaign_id=p_campaign_id and user_id=target;
 elsif p_operation='assign' then
  if target_role not in ('campaign_editor','campaign_viewer') or target_role is null then raise exception 'Selecciona Editor o Consulta'; end if;
  if previous.user_id is null and (select count(*) from public.campaign_members where campaign_id=p_campaign_id)>=capacity then raise exception 'Cupo completo'; end if;
  insert into public.campaign_members(campaign_id,user_id,member_role) values(p_campaign_id,target,target_role) on conflict(campaign_id,user_id) do update set member_role=excluded.member_role;
 else raise exception 'Operación inválida'; end if;
 insert into admin_vault.audit_events(actor_user_id,actor_role,action,entity_type,entity_id,campaign_id,before_state,after_state,reason)
 values(p_actor_user_id,'campaign_admin','TEAM_'||upper(p_operation),'CAMPAIGN_MEMBER',target::text,p_campaign_id,to_jsonb(previous),jsonb_build_object('member_role',case when p_operation='remove' then null else target_role end),'Gestión de equipo por el administrador del cliente');
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.radar_campaign_team_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_campaign_team_v1(uuid,uuid,text,jsonb) to service_role;

create or replace function private.can_read_shared_resource(target_path text) returns boolean language sql stable security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
 select exists(select 1 from admin_vault.shared_content s where s.storage_path=target_path and s.kind='resource' and s.status='PUBLISHED' and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and exists(select 1 from public.campaign_members cm join public.campaigns c on c.id=cm.campaign_id and c.status='active' join public.profiles p on p.user_id=cm.user_id and p.is_active join public.municipalities m on m.id=c.municipality_id where cm.user_id=auth.uid() and private.is_campaign_member(cm.campaign_id,null) and (s.municipality_code is null or s.municipality_code=m.municipality_code)))
$$;
revoke all on function private.can_read_shared_resource(text) from public,anon;
grant execute on function private.can_read_shared_resource(text) to authenticated;

-- Source: 20260926064749_campaign_private_erasure.sql
-- Explicit private-data erasure. Ordinary audit events remain append-only.
-- Only this service-only RPC can authorize deletion of specific audit IDs, within its transaction.
create table admin_vault.campaign_erasure_authorizations (
 transaction_id bigint primary key,
 audit_ids bigint[] not null
);
alter table admin_vault.campaign_erasure_authorizations enable row level security;
revoke all on admin_vault.campaign_erasure_authorizations from public, anon, authenticated, service_role;

create or replace function admin_vault.prevent_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog,admin_vault,pg_temp as $$
begin
 if tg_op='DELETE' and current_user=pg_get_userbyid((select relowner from pg_class where oid='admin_vault.campaign_erasure_authorizations'::regclass)) then
  if exists(select 1 from admin_vault.campaign_erasure_authorizations where transaction_id=txid_current() and old.id=any(audit_ids)) then return old; end if;
 end if;
 raise exception 'audit events are append-only' using errcode='42501';
end $$;

create or replace function public.radar_admin_purge_campaign_v1(p_actor_user_id uuid,p_actor_role text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare target_campaign public.campaigns; municipality public.municipalities; entity_ids text[]; erase_organization boolean; related_audits bigint[];
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores' using errcode='42501'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado' using errcode='42501'; end if;
 select * into target_campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and not is_demo;
 if not found then raise exception 'Selecciona una campaña real existente'; end if;
 select * into municipality from public.municipalities where id=target_campaign.municipality_id for update;
 select * into target_campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and not is_demo for update;
 if not found then raise exception 'La campaña ya no existe'; end if;
 if p_input->>'confirmation' is distinct from 'ELIMINAR '||municipality.municipality_code or p_input->>'acknowledge' is distinct from 'yes' then
  raise exception 'Confirma el código del municipio y la eliminación definitiva';
 end if;
 perform 1 from public.organizations where id=target_campaign.organization_id for update;
 erase_organization:=not exists(select 1 from public.campaigns where organization_id=target_campaign.organization_id and id<>target_campaign.id)
  and not exists(select 1 from admin_vault.commercial_contracts where client_organization_id=target_campaign.organization_id and campaign_id is distinct from target_campaign.id);
 select array_agg(id) into entity_ids from (
  select target_campaign.id::text id
  union all select id::text from admin_vault.commercial_contracts where campaign_id=target_campaign.id
  union all select id::text from admin_vault.support_sessions where campaign_id=target_campaign.id
  union all select target_campaign.organization_id::text where erase_organization
 ) related;
 select coalesce(array_agg(id),'{}'::bigint[]) into related_audits from admin_vault.audit_events where campaign_id=target_campaign.id or entity_id=any(entity_ids);
 insert into admin_vault.campaign_erasure_authorizations(transaction_id,audit_ids) values(txid_current(),related_audits);
 delete from admin_vault.audit_events where id=any(related_audits);
 delete from admin_vault.campaign_erasure_authorizations where transaction_id=txid_current();
 -- Publication records describe official intelligence; preserve them, unlink the customer.
 update admin_vault.publication_batches set campaign_id=null where campaign_id=target_campaign.id;
 delete from admin_vault.support_sessions where campaign_id=target_campaign.id;
 delete from admin_vault.client_accounts where campaign_id=target_campaign.id;
 delete from admin_vault.commercial_contracts where campaign_id=target_campaign.id;
 -- Foreign keys remove memberships, six private campaign tables, scopes and RTD snapshots atomically.
 delete from public.campaigns where id=target_campaign.id;
 if erase_organization then
  update public.profiles set organization_id=null where organization_id=target_campaign.organization_id;
  delete from public.organizations where id=target_campaign.organization_id;
 end if;
 -- Minimal accountability only: no campaign UUID/name, private record copy, or contact information.
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'PURGE_CAMPAIGN','MUNICIPALITY',municipality.municipality_code,null,null,'Eliminación definitiva confirmada de campaña y datos privados',null,municipality.municipality_code,municipality.department_code,null);
 return jsonb_build_object('deleted',true,'municipality_code',municipality.municipality_code);
end $$;
revoke all on function public.radar_admin_purge_campaign_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_purge_campaign_v1(uuid,text,jsonb) to service_role;

-- Source: 20260926072535_national_rtd_rollup.sql
-- Explicit election context; old records without it are not mixed into a new election.
alter table campaign_vault.rtd_results add column if not exists election_cycle integer;
alter table campaign_vault.rtd_results add column if not exists election_round smallint;
alter table campaign_vault.rtd_results add column if not exists electoral_district_code text;

create or replace function public.radar_admin_national_rtd_v1(p_actor_user_id uuid,p_actor_role text,p_input jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin_vault,campaign_vault,pg_temp as $$
declare payload jsonb; election text:=p_input->>'election_type'; cycle integer:=(p_input->>'election_cycle')::integer; round_no integer:=(p_input->>'election_round')::integer;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Consolidado nacional exclusivo de superadministración' using errcode='42501'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado' using errcode='42501'; end if;
 if election is null or election not in ('ALCALDIA','DIP_DIST','DIP_NAC','PRESIDENTE') or cycle is null or cycle not between 2023 and 2100 or round_no is null or round_no not in (1,2) or (election<>'PRESIDENTE' and round_no<>1) then raise exception 'Elección, año o vuelta no válidos'; end if;
 with campaigns_in_scope as (
  select c.id,m.municipality_code,m.municipality_name,m.department_code
  from public.campaigns c join public.municipalities m on m.id=c.municipality_id
  where not c.is_demo and c.status='active' and not m.is_synthetic
   and (nullif(p_input->>'municipality_code','') is null or m.municipality_code=p_input->>'municipality_code')
   and (nullif(p_input->>'department_code','') is null or m.department_code=p_input->>'department_code')
 ), reports as (
  select r.*,c.municipality_code,c.municipality_name,c.department_code,
   case when jsonb_typeof(r.results)='array' then r.results else '[]'::jsonb end entries
  from campaign_vault.rtd_results r join campaigns_in_scope c on c.id=r.campaign_id
  where r.election_type=election and r.election_cycle=cycle and r.election_round=round_no
 ), checked as (
  select r.*,v.valid_votes,v.options,
   (r.status in ('confirmed','validated') and nullif(trim(r.voting_center_code),'') is not null and nullif(trim(r.jrv_code),'') is not null
    and (election<>'DIP_DIST' or nullif(trim(r.electoral_district_code),'') is not null)
    and jsonb_typeof(r.results)='array' and coalesce(v.rows_valid,true)
    and v.option_count=v.distinct_options and r.blank_votes>=0 and r.null_votes>=0
    and r.total_ballots>=v.valid_votes+r.blank_votes+r.null_votes) eligible,
   case when election='ALCALDIA' then r.municipality_code when election='DIP_DIST' then r.electoral_district_code else 'GT' end territory
  from reports r cross join lateral (
   select coalesce(sum(case when e->>'votes' ~ '^[0-9]{1,9}$' then (e->>'votes')::bigint else 0 end),0) valid_votes,
    bool_and(jsonb_typeof(e)='object' and nullif(trim(e->>'party_id'),'') is not null and coalesce(e->>'votes','') ~ '^[0-9]{1,9}$') rows_valid,
    count(*) option_count,count(distinct e->>'party_id') distinct_options,
    coalesce(jsonb_agg(jsonb_build_object('party_id',e->>'party_id','votes',case when e->>'votes' ~ '^[0-9]{1,9}$' then (e->>'votes')::bigint else 0 end) order by e->>'party_id'),'[]') options
   from jsonb_array_elements(r.entries) e
  ) v
 ), signatures as (
  select *,jsonb_build_object('options',options,'blank',blank_votes,'null',null_votes,'ballots',total_ballots,'district',electoral_district_code)::text signature
  from checked where eligible
 ), acta_groups as (
  select municipality_code,voting_center_code,jrv_code,count(*) reports,count(distinct signature) versions
  from signatures group by municipality_code,voting_center_code,jrv_code
 ), accepted as (
  select distinct on (s.municipality_code,s.voting_center_code,s.jrv_code) s.*
  from signatures s join acta_groups g using(municipality_code,voting_center_code,jrv_code)
  where g.versions=1
  order by s.municipality_code,s.voting_center_code,s.jrv_code,s.submitted_at desc nulls last,s.created_at desc,s.id
 ), totals as (
  select a.territory,e->>'party_id' party_id,min(coalesce(nullif(e->>'party_name',''),e->>'party_id')) party_name,
   case when count(distinct nullif(e->>'candidate_name',''))=1 then min(nullif(e->>'candidate_name','')) else null end candidate_name,
   sum((e->>'votes')::bigint) votes
  from accepted a cross join lateral jsonb_array_elements(a.entries) e group by a.territory,e->>'party_id'
 ), municipalities as (
  select c.municipality_code,c.municipality_name,c.department_code,
   (select count(*) from campaign_vault.fiscales f join campaigns_in_scope s on s.id=f.campaign_id where s.municipality_code=c.municipality_code) fiscales,
   (select count(*) from reports r where r.municipality_code=c.municipality_code) received,
   (select count(*) from accepted a where a.municipality_code=c.municipality_code) counted,
   (select coalesce(sum(valid_votes),0) from accepted a where a.municipality_code=c.municipality_code) valid_votes
  from campaigns_in_scope c group by c.municipality_code,c.municipality_name,c.department_code
 )
 select jsonb_build_object(
  'generated_at',now(),'election_type',election,'election_cycle',cycle,'election_round',round_no,'environment','PRODUCTION',
  'summary',jsonb_build_object(
   'fiscales',(select count(*) from campaign_vault.fiscales f join campaigns_in_scope c on c.id=f.campaign_id),
   'municipalities',(select count(distinct municipality_code) from campaigns_in_scope),
   'reporting_municipalities',(select count(distinct municipality_code) from accepted),
   'received',(select count(*) from reports),'counted',(select count(*) from accepted),
   'pending',(select count(*) from checked where not coalesce(eligible,false)),
   'conflicts',(select count(*) from acta_groups where versions>1),
   'duplicates',(select coalesce(sum(reports-1),0) from acta_groups where versions=1),
   'missing_context',(select count(*) from campaign_vault.rtd_results r join campaigns_in_scope c on c.id=r.campaign_id where r.election_type=election and (r.election_cycle is null or r.election_round is null)),
   'valid_votes',(select coalesce(sum(valid_votes),0) from accepted),
   'blank_votes',(select coalesce(sum(blank_votes),0) from accepted),'null_votes',(select coalesce(sum(null_votes),0) from accepted),
   'last_report',(select max(coalesce(submitted_at,created_at)) from reports)),
  'results',(select coalesce(jsonb_agg(to_jsonb(t) order by territory,votes desc,party_id),'[]') from totals t),
  'territories',(select coalesce(jsonb_agg(to_jsonb(t) order by territory),'[]') from (select territory,count(*) actas,sum(valid_votes) valid_votes,sum(blank_votes) blank_votes,sum(null_votes) null_votes from accepted group by territory)t),
  'municipalities',(select coalesce(jsonb_agg(to_jsonb(m) order by municipality_code),'[]') from municipalities m)
 ) into payload;
 return payload;
end $$;
revoke all on function public.radar_admin_national_rtd_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_national_rtd_v1(uuid,text,jsonb) to service_role;

-- Source: 20260926073332_normalize_national_rtd_jrv.sql
-- Treat 001 and 1 as the same JRV; retain raw source identifiers.
create or replace function public.radar_admin_national_rtd_v1(p_actor_user_id uuid,p_actor_role text,p_input jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin_vault,campaign_vault,pg_temp as $$
declare payload jsonb; election text:=p_input->>'election_type'; cycle integer:=(p_input->>'election_cycle')::integer; round_no integer:=(p_input->>'election_round')::integer;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Consolidado nacional exclusivo de superadministración' using errcode='42501'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado' using errcode='42501'; end if;
 if election is null or election not in ('ALCALDIA','DIP_DIST','DIP_NAC','PRESIDENTE') or cycle is null or cycle not between 2023 and 2100 or round_no is null or round_no not in (1,2) or (election<>'PRESIDENTE' and round_no<>1) then raise exception 'Elección, año o vuelta no válidos'; end if;
 with campaigns_in_scope as (
  select c.id,m.municipality_code,m.municipality_name,m.department_code
  from public.campaigns c join public.municipalities m on m.id=c.municipality_id
  where not c.is_demo and c.status='active' and not m.is_synthetic
   and (nullif(p_input->>'municipality_code','') is null or m.municipality_code=p_input->>'municipality_code')
   and (nullif(p_input->>'department_code','') is null or m.department_code=p_input->>'department_code')
 ), reports as (
  select r.*,c.municipality_code,c.municipality_name,c.department_code,
   trim(r.voting_center_code) center_key, coalesce(nullif(ltrim(trim(r.jrv_code),'0'),''),'0') jrv_key,
   case when jsonb_typeof(r.results)='array' then r.results else '[]'::jsonb end entries
  from campaign_vault.rtd_results r join campaigns_in_scope c on c.id=r.campaign_id
  where r.election_type=election and r.election_cycle=cycle and r.election_round=round_no
 ), checked as (
  select r.*,v.valid_votes,v.options,
   (r.status in ('confirmed','validated') and nullif(trim(r.voting_center_code),'') is not null and trim(r.jrv_code) ~ '^[0-9]+$'
    and (election<>'DIP_DIST' or nullif(trim(r.electoral_district_code),'') is not null)
    and jsonb_typeof(r.results)='array' and coalesce(v.rows_valid,true)
    and v.option_count=v.distinct_options and r.blank_votes>=0 and r.null_votes>=0
    and r.total_ballots>=v.valid_votes+r.blank_votes+r.null_votes) eligible,
   case when election='ALCALDIA' then r.municipality_code when election='DIP_DIST' then r.electoral_district_code else 'GT' end territory
  from reports r cross join lateral (
   select coalesce(sum(case when e->>'votes' ~ '^[0-9]{1,9}$' then (e->>'votes')::bigint else 0 end),0) valid_votes,
    bool_and(jsonb_typeof(e)='object' and nullif(trim(e->>'party_id'),'') is not null and coalesce(e->>'votes','') ~ '^[0-9]{1,9}$') rows_valid,
    count(*) option_count,count(distinct e->>'party_id') distinct_options,
    coalesce(jsonb_agg(jsonb_build_object('party_id',e->>'party_id','votes',case when e->>'votes' ~ '^[0-9]{1,9}$' then (e->>'votes')::bigint else 0 end) order by e->>'party_id'),'[]') options
   from jsonb_array_elements(r.entries) e
  ) v
 ), signatures as (
  select *,jsonb_build_object('options',options,'blank',blank_votes,'null',null_votes,'ballots',total_ballots,'district',electoral_district_code)::text signature
  from checked where eligible
 ), acta_groups as (
  select municipality_code,center_key,jrv_key,count(*) reports,count(distinct signature) versions
  from signatures group by municipality_code,center_key,jrv_key
 ), accepted as (
  select distinct on (s.municipality_code,s.center_key,s.jrv_key) s.*
  from signatures s join acta_groups g using(municipality_code,center_key,jrv_key)
  where g.versions=1
  order by s.municipality_code,s.center_key,s.jrv_key,s.submitted_at desc nulls last,s.created_at desc,s.id
 ), totals as (
  select a.territory,e->>'party_id' party_id,min(coalesce(nullif(e->>'party_name',''),e->>'party_id')) party_name,
   case when count(distinct nullif(e->>'candidate_name',''))=1 then min(nullif(e->>'candidate_name','')) else null end candidate_name,
   sum((e->>'votes')::bigint) votes
  from accepted a cross join lateral jsonb_array_elements(a.entries) e group by a.territory,e->>'party_id'
 ), municipalities as (
  select c.municipality_code,c.municipality_name,c.department_code,
   (select count(*) from campaign_vault.fiscales f join campaigns_in_scope s on s.id=f.campaign_id where s.municipality_code=c.municipality_code) fiscales,
   (select count(*) from reports r where r.municipality_code=c.municipality_code) received,
   (select count(*) from accepted a where a.municipality_code=c.municipality_code) counted,
   (select coalesce(sum(valid_votes),0) from accepted a where a.municipality_code=c.municipality_code) valid_votes
  from campaigns_in_scope c group by c.municipality_code,c.municipality_name,c.department_code
 )
 select jsonb_build_object(
  'generated_at',now(),'election_type',election,'election_cycle',cycle,'election_round',round_no,'environment','PRODUCTION',
  'summary',jsonb_build_object(
   'fiscales',(select count(*) from campaign_vault.fiscales f join campaigns_in_scope c on c.id=f.campaign_id),
   'municipalities',(select count(distinct municipality_code) from campaigns_in_scope),
   'reporting_municipalities',(select count(distinct municipality_code) from accepted),
   'received',(select count(*) from reports),'counted',(select count(*) from accepted),
   'pending',(select count(*) from checked where not coalesce(eligible,false)),
   'conflicts',(select count(*) from acta_groups where versions>1),
   'duplicates',(select coalesce(sum(reports-1),0) from acta_groups where versions=1),
   'missing_context',(select count(*) from campaign_vault.rtd_results r join campaigns_in_scope c on c.id=r.campaign_id where r.election_type=election and (r.election_cycle is null or r.election_round is null)),
   'valid_votes',(select coalesce(sum(valid_votes),0) from accepted),
   'blank_votes',(select coalesce(sum(blank_votes),0) from accepted),'null_votes',(select coalesce(sum(null_votes),0) from accepted),
   'last_report',(select max(coalesce(submitted_at,created_at)) from reports)),
  'results',(select coalesce(jsonb_agg(to_jsonb(t) order by territory,votes desc,party_id),'[]') from totals t),
  'territories',(select coalesce(jsonb_agg(to_jsonb(t) order by territory),'[]') from (select territory,count(*) actas,sum(valid_votes) valid_votes,sum(blank_votes) blank_votes,sum(null_votes) null_votes from accepted group by territory)t),
  'municipalities',(select coalesce(jsonb_agg(to_jsonb(m) order by municipality_code),'[]') from municipalities m)
 ) into payload;
 return payload;
end $$;
revoke all on function public.radar_admin_national_rtd_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_national_rtd_v1(uuid,text,jsonb) to service_role;

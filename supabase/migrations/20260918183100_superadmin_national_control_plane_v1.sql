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
  if not exists(select 1 from public.profiles p where p.user_id=p_actor_user_id and p.is_active and p.platform_role=p_actor_role) then
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
  if not exists(select 1 from public.profiles p where p.user_id=p_actor_user_id and p.is_active and p.platform_role=p_actor_role) then
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

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types,versioning_status)
values('radar-admin-staging','radar-admin-staging',false,52428800,array[
  'text/csv','application/json','application/pdf','application/zip',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
],'ENABLED')
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types,versioning_status='ENABLED';
update storage.buckets set versioning_status='ENABLED' where id='radar-campaign-vault';

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

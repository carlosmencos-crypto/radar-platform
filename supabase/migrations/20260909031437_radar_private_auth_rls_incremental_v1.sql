-- RADAR private runtime boundary (applied 20260909031437).
-- Incremental over:
--   radar_foundation_auth_vaults_v1
--   radar_lock_security_definer_functions_v1
--   valle_nexo_demo_v1_fix
--   move_demo_seeds_private
--   private_demo_seed_security_cleanup
--
-- This migration intentionally creates no vault/table/user/demo seed and performs
-- no data deletion outside the existing, explicitly demo-only reset function.

-- The public territorial catalog is static. No database table is public.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema data_vault from anon;
revoke all on all tables in schema campaign_vault from anon;
revoke all on all tables in schema demo_vault from anon;
revoke usage on schema data_vault, campaign_vault, demo_vault, private from anon;

-- Authenticated clients may read Data Vault through RLS, never write or reset it.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema data_vault from authenticated;
grant usage on schema data_vault to authenticated;
grant select on all tables in schema data_vault to authenticated;

-- Public identity/context tables remain read-only and protected by their RLS.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;
grant select on public.profiles, public.campaigns, public.campaign_members,
  public.municipalities, public.countries, public.organizations to authenticated;

-- Real Data Vault access requires a real active campaign assignment (or the
-- matching organization-admin scope). demo_admin is never a global bypass.
create or replace function private.can_read_data_vault(
  target_country text,
  target_municipality uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with actor as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
  )
  select coalesce((
    select
      a.platform_role = 'platform_admin'
      or exists (
        select 1
        from public.campaigns c
        left join public.campaign_members cm
          on cm.campaign_id = c.id
         and cm.user_id = a.user_id
        where c.country_code = target_country
          and c.municipality_id = target_municipality
          and c.status = 'active'
          and c.is_demo = false
          and (
            (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
            or cm.member_role in ('campaign_admin', 'campaign_editor', 'campaign_viewer')
          )
      )
    from actor a
  ), false)
$$;

-- Demo read and write authorization are deliberately separate. A demo_viewer
-- can read its assigned demo; only a demo_admin can mutate/reset it.
create or replace function private.can_use_demo_campaign(target_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with actor as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
  )
  select coalesce((
    select
      a.platform_role = 'platform_admin'
      or exists (
        select 1
        from public.campaigns c
        left join public.campaign_members cm
          on cm.campaign_id = c.id
         and cm.user_id = a.user_id
        where c.id = target_campaign
          and c.is_demo = true
          and c.status = 'active'
          and (
            (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
            or cm.member_role in ('demo_admin', 'demo_viewer')
          )
      )
    from actor a
  ), false)
$$;

create or replace function private.can_manage_demo_campaign(target_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with actor as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
  )
  select coalesce((
    select
      a.platform_role = 'platform_admin'
      or exists (
        select 1
        from public.campaigns c
        left join public.campaign_members cm
          on cm.campaign_id = c.id
         and cm.user_id = a.user_id
        where c.id = target_campaign
          and c.is_demo = true
          and c.status = 'active'
          and (
            (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
            or cm.member_role = 'demo_admin'
          )
      )
    from actor a
  ), false)
$$;

-- Only the assigned demo campaign may expose synthetic Data Vault rows.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'data_vault'
      and tablename = 'synthetic_municipality_layers'
      and policyname = 'synthetic_layers_auth_read'
  ) then
    alter policy synthetic_layers_auth_read
      on data_vault.synthetic_municipality_layers
      to authenticated
      using (
        exists (
          select 1 from public.campaigns c
          where c.municipality_id = synthetic_municipality_layers.municipality_id
            and c.is_demo = true
            and c.status = 'active'
            and private.can_use_demo_campaign(c.id)
        )
      );
  else
    create policy synthetic_layers_auth_read
      on data_vault.synthetic_municipality_layers
      for select to authenticated
      using (
        exists (
          select 1 from public.campaigns c
          where c.municipality_id = synthetic_municipality_layers.municipality_id
            and c.is_demo = true
            and c.status = 'active'
            and private.can_use_demo_campaign(c.id)
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'data_vault'
      and tablename = 'synthetic_geo_features'
      and policyname = 'synthetic_geo_auth_read'
  ) then
    alter policy synthetic_geo_auth_read
      on data_vault.synthetic_geo_features
      to authenticated
      using (
        exists (
          select 1 from public.campaigns c
          where c.municipality_id = synthetic_geo_features.municipality_id
            and c.is_demo = true
            and c.status = 'active'
            and private.can_use_demo_campaign(c.id)
        )
      );
  else
    create policy synthetic_geo_auth_read
      on data_vault.synthetic_geo_features
      for select to authenticated
      using (
        exists (
          select 1 from public.campaigns c
          where c.municipality_id = synthetic_geo_features.municipality_id
            and c.is_demo = true
            and c.status = 'active'
            and private.can_use_demo_campaign(c.id)
        )
      );
  end if;
end
$$;

-- Enforce read-only demo_viewer semantics on every existing Demo Vault table.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('activities', 'dv_activities_write'),
      ('candidates', 'dv_candidates_write'),
      ('commitments', 'dv_commitments_write'),
      ('contacts', 'dv_contacts_write'),
      ('fiscales', 'dv_fiscales_write'),
      ('incidents', 'dv_incidents_write'),
      ('pulse_snapshots', 'dv_pulse_write'),
      ('resources', 'dv_resources_write'),
      ('rtd_results', 'dv_rtd_write'),
      ('strategy_items', 'dv_strategy_write')
    ) as policies(table_name, policy_name)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = 'demo_vault'
        and tablename = item.table_name
        and policyname = item.policy_name
    ) then
      execute format(
        'alter policy %I on demo_vault.%I to authenticated using (private.can_manage_demo_campaign(campaign_id)) with check (private.can_manage_demo_campaign(campaign_id))',
        item.policy_name,
        item.table_name
      );
    else
      execute format(
        'create policy %I on demo_vault.%I for all to authenticated using (private.can_manage_demo_campaign(campaign_id)) with check (private.can_manage_demo_campaign(campaign_id))',
        item.policy_name,
        item.table_name
      );
    end if;
  end loop;
end
$$;

create or replace function public.radar_authorized_context(
  route_kind text,
  route_key text
)
returns table (
  country_code text,
  municipality_id uuid,
  municipality_code text,
  municipality_name text,
  department_code text,
  department_name text,
  campaign_id uuid,
  campaign_name text,
  user_role text,
  permissions text[],
  is_demo boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  with actor as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.is_active = true
  ), authorized as (
    select
      m.country_code,
      m.id as municipality_id,
      coalesce(m.municipality_code, lower(replace(m.synthetic_key, '_', '-'))) as municipality_code,
      m.municipality_name,
      coalesce(m.department_code, 'DEMO') as department_code,
      coalesce(m.department_name, 'Territorio sintético') as department_name,
      c.id as campaign_id,
      c.name as campaign_name,
      case
        when a.platform_role = 'platform_admin' then 'platform_admin'
        when a.platform_role = 'organization_admin' and a.organization_id = c.organization_id then 'organization_admin'
        else cm.member_role
      end as user_role,
      c.is_demo
    from actor a
    join public.campaigns c on c.status = 'active'
    join public.municipalities m on m.id = c.municipality_id
    left join public.campaign_members cm
      on cm.campaign_id = c.id
     and cm.user_id = a.user_id
    where (
      (route_kind = 'municipality'
        and m.is_synthetic = false
        and m.municipality_code = route_key
        and c.is_demo = false)
      or
      (route_kind = 'demo'
        and m.is_synthetic = true
        and m.synthetic_key = upper(replace(route_key, '-', '_'))
        and c.is_demo = true)
    )
      and (
        a.platform_role = 'platform_admin'
        or (a.platform_role = 'organization_admin' and a.organization_id = c.organization_id)
        or cm.user_id is not null
      )
    order by (cm.user_id is not null) desc, c.created_at
    limit 1
  )
  select
    a.country_code,
    a.municipality_id,
    a.municipality_code,
    a.municipality_name,
    a.department_code,
    a.department_name,
    a.campaign_id,
    a.campaign_name,
    a.user_role,
    case a.user_role
      when 'platform_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write','demo_vault:read','demo_vault:write','demo_vault:reset','admin:access']
      when 'organization_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write','demo_vault:read','demo_vault:write']
      when 'campaign_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write']
      when 'campaign_editor' then array['data_vault:read','campaign_vault:read','campaign_vault:write']
      when 'campaign_viewer' then array['data_vault:read','campaign_vault:read']
      when 'demo_admin' then array['data_vault:read','demo_vault:read','demo_vault:write','demo_vault:reset']
      when 'demo_viewer' then array['data_vault:read','demo_vault:read']
      else array[]::text[]
    end,
    a.is_demo
  from authorized a
  where a.user_role in (
    'platform_admin', 'organization_admin', 'campaign_admin', 'campaign_editor',
    'campaign_viewer', 'demo_admin', 'demo_viewer'
  )
$$;

-- The layer RPC remains SECURITY INVOKER so Data Vault RLS is always applied.
create or replace function public.radar_authorized_layers(
  route_kind text,
  route_key text
)
returns table (
  layer_id text,
  period text,
  payload jsonb,
  source_status text,
  source_label text,
  synthetic_notice text
)
language sql
stable
security invoker
set search_path = pg_catalog, public, data_vault, private, pg_temp
as $$
  with authorized_context as (
    select * from public.radar_authorized_context(route_kind, route_key)
  )
  select r.layer_id, r.period, r.payload, r.source_status, r.source_label, null::text
  from authorized_context c
  join data_vault.municipality_layer_records r
    on r.country_code = c.country_code
   and r.municipality_id = c.municipality_id
  where c.is_demo = false
  union all
  select s.layer_id, s.period, s.payload, 'AVAILABLE'::text, null::text, s.synthetic_notice
  from authorized_context c
  join data_vault.synthetic_municipality_layers s
    on s.municipality_id = c.municipality_id
  where c.is_demo = true
$$;

-- Keep the existing reset semantics and seed data, but require exact demo
-- membership and reject every real campaign before any deletion can run.
create or replace function private.reset_demo_campaign(target_campaign uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, demo_vault, private, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = target_campaign
      and c.is_demo = true
      and c.status = 'active'
  ) then
    raise exception 'NOT_AN_ACTIVE_DEMO_CAMPAIGN';
  end if;

  delete from demo_vault.rtd_results where campaign_id = target_campaign;
  delete from demo_vault.incidents where campaign_id = target_campaign;
  delete from demo_vault.fiscales where campaign_id = target_campaign;
  delete from demo_vault.activities where campaign_id = target_campaign;
  delete from demo_vault.contacts where campaign_id = target_campaign;
  delete from demo_vault.candidates where campaign_id = target_campaign;
  delete from demo_vault.commitments where campaign_id = target_campaign;
  delete from demo_vault.resources where campaign_id = target_campaign;
  delete from demo_vault.strategy_items where campaign_id = target_campaign;
  delete from demo_vault.pulse_snapshots where campaign_id = target_campaign;

  insert into demo_vault.contacts select * from private.seed_contacts where campaign_id = target_campaign;
  insert into demo_vault.activities select * from private.seed_activities where campaign_id = target_campaign;
  insert into demo_vault.candidates select * from private.seed_candidates where campaign_id = target_campaign;
  insert into demo_vault.fiscales select * from private.seed_fiscales where campaign_id = target_campaign;
  insert into demo_vault.incidents select * from private.seed_incidents where campaign_id = target_campaign;
  insert into demo_vault.rtd_results select * from private.seed_rtd_results where campaign_id = target_campaign;
  insert into demo_vault.commitments select * from private.seed_commitments where campaign_id = target_campaign;
  insert into demo_vault.resources select * from private.seed_resources where campaign_id = target_campaign;
  insert into demo_vault.strategy_items select * from private.seed_strategy_items where campaign_id = target_campaign;
  insert into demo_vault.pulse_snapshots select * from private.seed_pulse_snapshots where campaign_id = target_campaign;
end
$$;

create or replace function public.reset_demo_campaign(target_campaign uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
  select private.reset_demo_campaign(target_campaign)
$$;

-- SECURITY DEFINER helpers are callable only by authenticated sessions and are
-- unreachable through the Data API because the private schema is not exposed.
revoke all on function private.current_platform_role() from public, anon;
revoke all on function private.is_campaign_member(uuid, text[]) from public, anon;
revoke all on function private.can_read_data_vault(text, uuid) from public, anon;
revoke all on function private.can_use_demo_campaign(uuid) from public, anon;
revoke all on function private.can_manage_demo_campaign(uuid) from public, anon;
revoke all on function private.reset_demo_campaign(uuid) from public, anon;
grant execute on function private.current_platform_role() to authenticated;
grant execute on function private.is_campaign_member(uuid, text[]) to authenticated;
grant execute on function private.can_read_data_vault(text, uuid) to authenticated;
grant execute on function private.can_use_demo_campaign(uuid) to authenticated;
grant execute on function private.can_manage_demo_campaign(uuid) to authenticated;
grant execute on function private.reset_demo_campaign(uuid) to authenticated;

revoke all on function public.radar_authorized_context(text, text) from public, anon;
revoke all on function public.radar_authorized_layers(text, text) from public, anon;
revoke all on function public.reset_demo_campaign(uuid) from public, anon;
grant execute on function public.radar_authorized_context(text, text) to authenticated;
grant execute on function public.radar_authorized_layers(text, text) to authenticated;
grant execute on function public.reset_demo_campaign(uuid) to authenticated;

notify pgrst, 'reload schema';

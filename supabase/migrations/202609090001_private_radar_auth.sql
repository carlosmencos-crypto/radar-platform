-- RADAR private runtime boundary. Apply through a Supabase development branch first.

revoke all on all tables in schema public from anon;
revoke all on all tables in schema data_vault from anon;
revoke all on all tables in schema campaign_vault from anon;
revoke all on all tables in schema demo_vault from anon;

revoke truncate, references, trigger on all tables in schema public from authenticated;
grant select on public.profiles, public.campaigns, public.campaign_members,
  public.municipalities, public.countries, public.organizations to authenticated;

create or replace function private.can_read_data_vault(target_country text, target_municipality uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when private.current_platform_role() = 'platform_admin' then true
    else exists (
      select 1
      from public.campaign_members cm
      join public.campaigns c on c.id = cm.campaign_id
      join public.profiles p on p.user_id = cm.user_id and p.is_active = true
      where cm.user_id = auth.uid()
        and c.country_code = target_country
        and c.municipality_id = target_municipality
        and c.status = 'active'
        and c.is_demo = false
    )
  end
$$;

drop policy if exists synthetic_layers_auth_read on data_vault.synthetic_municipality_layers;
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

drop policy if exists synthetic_geo_auth_read on data_vault.synthetic_geo_features;
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

create or replace function public.radar_authorized_context(route_kind text, route_key text)
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
set search_path = public, private, pg_temp
as $$
  with identity as (
    select p.user_id, p.platform_role, p.organization_id
    from public.profiles p
    where p.user_id = auth.uid() and p.is_active = true
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
        when i.platform_role in ('platform_admin','organization_admin','demo_admin') then i.platform_role
        else cm.member_role
      end as user_role,
      c.is_demo
    from identity i
    join public.campaigns c on c.status = 'active'
    join public.municipalities m on m.id = c.municipality_id
    left join public.campaign_members cm on cm.campaign_id = c.id and cm.user_id = i.user_id
    where (
      (route_kind = 'municipality' and m.is_synthetic = false and m.municipality_code = route_key and c.is_demo = false)
      or
      (route_kind = 'demo' and m.is_synthetic = true and m.synthetic_key = upper(route_key) and c.is_demo = true)
    )
    and (
      i.platform_role = 'platform_admin'
      or (i.platform_role = 'organization_admin' and i.organization_id = c.organization_id)
      or (i.platform_role = 'demo_admin' and c.is_demo = true)
      or cm.user_id is not null
    )
    order by (cm.user_id is not null) desc, c.created_at
    limit 1
  )
  select
    a.country_code, a.municipality_id, a.municipality_code, a.municipality_name,
    a.department_code, a.department_name, a.campaign_id, a.campaign_name,
    a.user_role,
    case a.user_role
      when 'platform_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write','admin:access']
      when 'organization_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write']
      when 'campaign_admin' then array['data_vault:read','campaign_vault:read','campaign_vault:write']
      when 'campaign_editor' then array['data_vault:read','campaign_vault:read','campaign_vault:write']
      when 'campaign_viewer' then array['data_vault:read','campaign_vault:read']
      when 'demo_admin' then array['data_vault:read','demo_vault:read','demo_vault:write','demo_vault:reset']
      when 'demo_viewer' then array['data_vault:read','demo_vault:read']
      else array[]::text[]
    end,
    a.is_demo
  from authorized a
  where a.user_role in ('platform_admin','organization_admin','campaign_admin','campaign_editor','campaign_viewer','demo_admin','demo_viewer')
$$;

create or replace function public.radar_authorized_layers(route_kind text, route_key text)
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
set search_path = public, data_vault, private, pg_temp
as $$
  with context as (
    select * from public.radar_authorized_context(route_kind, route_key)
  )
  select r.layer_id, r.period, r.payload, r.source_status, r.source_label, null::text
  from context c
  join data_vault.municipality_layer_records r
    on r.country_code = c.country_code and r.municipality_id = c.municipality_id
  where c.is_demo = false
  union all
  select s.layer_id, s.period, s.payload, 'AVAILABLE'::text, null::text, s.synthetic_notice
  from context c
  join data_vault.synthetic_municipality_layers s on s.municipality_id = c.municipality_id
  where c.is_demo = true
$$;

revoke all on function public.radar_authorized_context(text, text) from public, anon;
revoke all on function public.radar_authorized_layers(text, text) from public, anon;
grant execute on function public.radar_authorized_context(text, text) to authenticated;
grant execute on function public.radar_authorized_layers(text, text) to authenticated;

-- Existing reset remains server-owned. Its implementation only deletes/inserts demo_vault rows,
-- requires auth.uid(), demo_admin/platform_admin, and verifies campaigns.is_demo = true.
alter function public.reset_demo_campaign(uuid) security definer;
alter function public.reset_demo_campaign(uuid) set search_path = public, private, pg_temp;
revoke all on function public.reset_demo_campaign(uuid) from public, anon;
grant execute on function public.reset_demo_campaign(uuid) to authenticated;

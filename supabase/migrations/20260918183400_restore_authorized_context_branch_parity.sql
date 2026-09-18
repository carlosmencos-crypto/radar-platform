-- Version the authorization context that existed in the remote project but was
-- missing from repository migrations. Fresh branches now reproduce production
-- behavior without copying any production rows.

create or replace function private.radar_authorized_context(route_kind text,route_key text)
returns table(
  country_code text,municipality_id uuid,municipality_code text,municipality_name text,
  department_code text,department_name text,campaign_id uuid,campaign_name text,
  user_role text,permissions text[],is_demo boolean
)
language sql stable security definer
set search_path=pg_catalog,public,private,pg_temp as $$
  with actor as (
    select p.user_id,p.platform_role,p.organization_id
    from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active=true
  ), authorized as (
    select
      m.country_code,m.id as municipality_id,
      coalesce(m.municipality_code,lower(replace(m.synthetic_key,'_','-'))) as municipality_code,
      m.municipality_name,coalesce(m.department_code,'DEMO') as department_code,
      coalesce(m.department_name,'Territorio sintético') as department_name,
      c.id as campaign_id,c.name as campaign_name,
      case
        when a.platform_role='platform_admin' then 'platform_admin'
        when a.platform_role='organization_admin' and a.organization_id=c.organization_id then 'organization_admin'
        else cm.member_role
      end as user_role,
      c.is_demo
    from actor a
    join public.campaigns c on c.status='active'
    join public.municipalities m on m.id=c.municipality_id
    left join public.campaign_members cm on cm.campaign_id=c.id and cm.user_id=a.user_id
    where (
      (route_kind='municipality' and not m.is_synthetic and m.municipality_code=route_key and not c.is_demo)
      or
      (route_kind='demo' and m.is_synthetic and m.synthetic_key=upper(replace(route_key,'-','_')) and c.is_demo)
    ) and (
      a.platform_role='platform_admin'
      or (a.platform_role='organization_admin' and a.organization_id=c.organization_id)
      or cm.user_id is not null
    )
    order by (cm.user_id is not null) desc,c.created_at
    limit 1
  )
  select
    a.country_code,a.municipality_id,a.municipality_code,a.municipality_name,
    a.department_code,a.department_name,a.campaign_id,a.campaign_name,a.user_role,
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
    'platform_admin','organization_admin','campaign_admin','campaign_editor',
    'campaign_viewer','demo_admin','demo_viewer'
  )
$$;

create or replace function private.radar_authorized_context_v2(route_kind text,route_key text)
returns table(
  country_code text,municipality_id uuid,municipality_code text,municipality_name text,
  department_code text,department_name text,campaign_id uuid,campaign_name text,
  user_role text,permissions text[],is_demo boolean
)
language sql stable security definer
set search_path=pg_catalog,public,private,pg_temp as $$
  with base as (
    select * from private.radar_authorized_context(route_kind,route_key)
  ), actor as (
    select p.user_id,p.platform_role
    from public.profiles p
    where p.user_id=(select auth.uid()) and p.is_active=true
  ), platform_fallback as (
    select
      m.country_code,m.id as municipality_id,m.municipality_code,m.municipality_name,
      m.department_code,m.department_name,c.id as campaign_id,c.name as campaign_name,
      'platform_admin'::text as user_role,
      case when c.id is null
        then array['data_vault:read','admin:access']::text[]
        else array['data_vault:read','campaign_vault:read','campaign_vault:write','demo_vault:read','demo_vault:write','demo_vault:reset','admin:access']::text[]
      end as permissions,
      false as is_demo
    from actor a
    join public.municipalities m on m.country_code='GT' and not m.is_synthetic and m.municipality_code=route_key
    left join lateral (
      select c0.id,c0.name from public.campaigns c0
      where c0.country_code=m.country_code and c0.municipality_id=m.id
        and c0.status='active' and not c0.is_demo
      order by c0.created_at limit 1
    ) c on true
    where route_kind='municipality' and a.platform_role='platform_admin'
      and not exists(select 1 from base)
  )
  select * from base
  union all
  select * from platform_fallback
$$;

create or replace function public.radar_authorized_context(route_kind text,route_key text)
returns table(
  country_code text,municipality_id uuid,municipality_code text,municipality_name text,
  department_code text,department_name text,campaign_id uuid,campaign_name text,
  user_role text,permissions text[],is_demo boolean
)
language sql stable
set search_path=pg_catalog,public,private,pg_temp as $$
  select * from private.radar_authorized_context(route_kind,route_key)
$$;

create or replace function public.radar_authorized_context_v2(route_kind text,route_key text)
returns table(
  country_code text,municipality_id uuid,municipality_code text,municipality_name text,
  department_code text,department_name text,campaign_id uuid,campaign_name text,
  user_role text,permissions text[],is_demo boolean
)
language sql stable
set search_path=pg_catalog,public,private,pg_temp as $$
  select * from private.radar_authorized_context_v2(route_kind,route_key)
$$;

grant usage on schema private to authenticated;
revoke all on function private.radar_authorized_context(text,text) from public,anon,service_role;
revoke all on function private.radar_authorized_context_v2(text,text) from public,anon,service_role;
revoke all on function public.radar_authorized_context(text,text) from public,anon,service_role;
revoke all on function public.radar_authorized_context_v2(text,text) from public,anon,service_role;
grant execute on function private.radar_authorized_context(text,text) to authenticated;
grant execute on function private.radar_authorized_context_v2(text,text) to authenticated;
grant execute on function public.radar_authorized_context(text,text) to authenticated;
grant execute on function public.radar_authorized_context_v2(text,text) to authenticated;

comment on function public.radar_authorized_context_v2(text,text) is
  'Versioned parity wrapper for the canonical authenticated municipality/campaign authorization contract.';

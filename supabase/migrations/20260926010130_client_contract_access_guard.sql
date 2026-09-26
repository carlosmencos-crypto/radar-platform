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

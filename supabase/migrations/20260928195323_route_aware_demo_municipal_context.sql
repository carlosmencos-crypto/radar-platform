-- Preserve the real/demo campaign boundary while allowing the shared municipal
-- runtime RPCs to resolve the route selected by the authenticated web client.

create or replace function public.radar_authorized_context_v2(route_kind text, route_key text)
returns table(
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
set search_path to 'pg_catalog','public','private','pg_temp'
as $function$
  with request_scope as (
    select case
      when route_kind = 'municipality'
       and lower(coalesce(
         nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-client-info',
         ''
       )) like '%radar-route=demo%'
      then 'demo'::text
      else route_kind
    end as effective_route_kind
  )
  select c.*
  from request_scope r
  cross join lateral private.radar_authorized_context_v2(r.effective_route_kind, route_key) c
  where c.user_role = 'platform_admin'
     or private.is_campaign_member(c.campaign_id, null);
$function$;

revoke all on function public.radar_authorized_context_v2(text, text) from public;
revoke all on function public.radar_authorized_context_v2(text, text) from anon;
grant execute on function public.radar_authorized_context_v2(text, text) to authenticated;

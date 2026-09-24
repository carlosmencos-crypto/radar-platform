-- Return the current campaign identity only for an active fiscal session.
-- The service role is used exclusively by the secret-protected validation Edge Function.
create or replace function public.radar_fiscal_campaign_identity_v1(
  p_session_id uuid,
  p_grant_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'campaign_id', g.campaign_id,
        'party_name', coalesce(ci.party_name, g.party_name),
        'party_logo_data_url', coalesce(ci.party_logo_data_url, ''),
        'updated_at', coalesce(ci.updated_at, g.updated_at)
      )
      from campaign_vault.day_d_fiscal_sessions s
      join campaign_vault.day_d_access_grants g
        on g.id = s.grant_id
      left join campaign_vault.campaign_identity ci
        on ci.campaign_id = g.campaign_id
      where s.id = p_session_id
        and g.id = p_grant_id
        and s.status = 'active'
        and g.status = 'active'
        and s.revoked_at is null
        and s.expires_at > now()
        and g.expires_at > now()
      limit 1
    ),
    jsonb_build_object('ok', false)
  );
$function$;

revoke all on function public.radar_fiscal_campaign_identity_v1(uuid, uuid) from public;
revoke all on function public.radar_fiscal_campaign_identity_v1(uuid, uuid) from anon;
revoke all on function public.radar_fiscal_campaign_identity_v1(uuid, uuid) from authenticated;
grant execute on function public.radar_fiscal_campaign_identity_v1(uuid, uuid) to service_role;

grant usage on schema campaign_vault to service_role;
grant select (id, grant_id, status, expires_at, revoked_at)
  on campaign_vault.day_d_fiscal_sessions to service_role;
grant select (id, campaign_id, party_name, status, expires_at, updated_at)
  on campaign_vault.day_d_access_grants to service_role;
grant select (campaign_id, party_name, party_logo_data_url, updated_at)
  on campaign_vault.campaign_identity to service_role;

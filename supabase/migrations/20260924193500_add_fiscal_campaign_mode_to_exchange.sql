-- Preserve the campaign's real/demo mode in the fiscal access scope returned
-- to the isolated portal. Access remains service-role only; the browser never
-- receives or selects its own campaign, municipality, center or JRV scope.

create or replace function public.radar_exchange_fiscal_access_v1(
  p_credential_hash text,
  p_credential_kind text,
  p_auth_user_id uuid,
  p_network_hash text default null,
  p_device_hash text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=pg_catalog,public,private,campaign_vault,pg_temp
as $$
declare
  matched campaign_vault.day_d_access_grants;
  session_record campaign_vault.day_d_fiscal_sessions;
  failed_attempts integer;
  outcome_value text;
  campaign_is_demo boolean;
begin
  if current_user <> 'service_role' then
    raise exception 'server exchange required' using errcode='42501';
  end if;
  if p_credential_hash !~ '^[0-9a-f]{64}$' or p_credential_kind not in ('token','code') then
    raise exception 'invalid exchange request' using errcode='22023';
  end if;
  if p_network_hash is not null and p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid network digest' using errcode='22023';
  end if;
  if p_device_hash is not null and p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device digest' using errcode='22023';
  end if;

  select count(*) into failed_attempts
  from campaign_vault.day_d_access_attempts
  where attempted_at > now()-interval '15 minutes'
    and outcome in ('invalid','expired','suspended','revoked','rate_limited')
    and (auth_user_id=p_auth_user_id or (p_network_hash is not null and network_hash=p_network_hash));
  if failed_attempts >= 5 then
    insert into campaign_vault.day_d_access_attempts(auth_user_id,network_hash,credential_kind,outcome)
    values(p_auth_user_id,p_network_hash,p_credential_kind,'rate_limited');
    return jsonb_build_object('ok',false,'reason','rate_limited');
  end if;

  if p_credential_kind='token' then
    select * into matched from campaign_vault.day_d_access_grants where token_hash=p_credential_hash for update;
  else
    select * into matched from campaign_vault.day_d_access_grants where code_hash=p_credential_hash for update;
  end if;
  if matched.id is null then
    insert into campaign_vault.day_d_access_attempts(auth_user_id,network_hash,credential_kind,outcome)
    values(p_auth_user_id,p_network_hash,p_credential_kind,'invalid');
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;

  outcome_value := case
    when matched.expires_at <= now() then 'expired'
    when matched.status='suspended' then 'suspended'
    when matched.status='revoked' then 'revoked'
    when matched.status='expired' then 'expired'
    else 'accepted'
  end;
  insert into campaign_vault.day_d_access_attempts(auth_user_id,network_hash,credential_kind,outcome)
  values(p_auth_user_id,p_network_hash,p_credential_kind,outcome_value);
  if outcome_value <> 'accepted' then
    if outcome_value='expired' then
      if matched.status='active' then
        update campaign_vault.day_d_access_grants
        set status='expired',status_changed_at=now(),updated_at=now()
        where id=matched.id;
      end if;
      update campaign_vault.day_d_fiscal_sessions
      set status='expired',revoked_at=now()
      where grant_id=matched.id and status='active';
    end if;
    return jsonb_build_object('ok',false,'reason',outcome_value);
  end if;

  select is_demo into campaign_is_demo from public.campaigns where id=matched.campaign_id;
  if campaign_is_demo is null then
    raise exception 'campaign not found for fiscal access' using errcode='P0002';
  end if;

  update campaign_vault.day_d_fiscal_sessions
  set status='revoked',revoked_at=now()
  where grant_id=matched.id and status='active';
  insert into campaign_vault.day_d_fiscal_sessions(grant_id,auth_user_id,device_hash,expires_at)
  values(matched.id,p_auth_user_id,p_device_hash,matched.expires_at)
  returning * into session_record;
  update campaign_vault.day_d_access_grants set last_used_at=now(),updated_at=now() where id=matched.id;
  insert into campaign_vault.day_d_audit_events(campaign_id,grant_id,session_id,actor_user_id,event_type,event_data)
  values(matched.campaign_id,matched.id,session_record.id,p_auth_user_id,'access_exchanged',jsonb_build_object('credential_kind',p_credential_kind));

  return jsonb_build_object(
    'ok',true,'session_id',session_record.id,'grant_id',matched.id,
    'assignment_id',matched.assignment_record_id,'auth_user_id',p_auth_user_id,
    'expires_at',session_record.expires_at,
    'campaign_id',matched.campaign_id,'campaign_name',matched.campaign_name,
    'is_demo',campaign_is_demo,
    'party_name',matched.party_name,'municipality_code',matched.municipality_code,
    'municipality_name',matched.municipality_name,
    'center_id',matched.center_id,'jrv',matched.jrv,'fiscal_id',matched.fiscal_id,
    'fiscal_name',matched.fiscal_name,'center_name',matched.center_name,
    'center_reference',matched.center_reference,'responsible_name',matched.responsible_name
  );
end
$$;

revoke all on function public.radar_exchange_fiscal_access_v1(text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.radar_exchange_fiscal_access_v1(text,text,uuid,text,text) to service_role;

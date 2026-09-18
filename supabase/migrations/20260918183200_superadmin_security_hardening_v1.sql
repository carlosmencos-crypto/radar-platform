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

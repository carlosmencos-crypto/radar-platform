-- Operational parity for Valle Nexo. Functions only: no seed, table or policy mutations.
-- All writes are constrained to the authorized demo campaign and demo_vault.

create or replace function public.radar_demo_save_fiscal(
  target_campaign uuid,
  target_id uuid,
  fiscal jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
as $$
declare
  saved_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(fiscal->>'full_name'), '') is null then
    raise exception 'FISCAL_NAME_REQUIRED' using errcode = '22023';
  end if;

  if target_id is null then
    insert into demo_vault.fiscales (
      campaign_id, full_name, phone, voting_center_code, jrv_code, status
    ) values (
      target_campaign,
      btrim(fiscal->>'full_name'),
      nullif(btrim(fiscal->>'phone'), ''),
      nullif(btrim(fiscal->>'voting_center_code'), ''),
      nullif(btrim(fiscal->>'jrv_code'), ''),
      coalesce(nullif(btrim(fiscal->>'status'), ''), 'assigned')
    ) returning id into saved_id;
  else
    update demo_vault.fiscales
       set full_name = btrim(fiscal->>'full_name'),
           phone = nullif(btrim(fiscal->>'phone'), ''),
           voting_center_code = nullif(btrim(fiscal->>'voting_center_code'), ''),
           jrv_code = nullif(btrim(fiscal->>'jrv_code'), ''),
           status = coalesce(nullif(btrim(fiscal->>'status'), ''), 'assigned')
     where id = target_id
       and campaign_id = target_campaign
     returning id into saved_id;
    if saved_id is null then
      raise exception 'FISCAL_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
end
$$;

create or replace function public.radar_demo_save_incident(
  target_campaign uuid,
  target_id uuid,
  incident jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
as $$
declare
  saved_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(incident->>'incident_type'), '') is null
     or nullif(btrim(incident->>'description'), '') is null then
    raise exception 'INCIDENT_TYPE_AND_DESCRIPTION_REQUIRED' using errcode = '22023';
  end if;

  if target_id is null then
    insert into demo_vault.incidents (
      campaign_id, incident_type, severity, description,
      voting_center_code, jrv_code, status, created_by
    ) values (
      target_campaign,
      btrim(incident->>'incident_type'),
      nullif(btrim(incident->>'severity'), ''),
      btrim(incident->>'description'),
      nullif(btrim(incident->>'voting_center_code'), ''),
      nullif(btrim(incident->>'jrv_code'), ''),
      coalesce(nullif(btrim(incident->>'status'), ''), 'open'),
      (select auth.uid())
    ) returning id into saved_id;
  else
    update demo_vault.incidents
       set incident_type = btrim(incident->>'incident_type'),
           severity = nullif(btrim(incident->>'severity'), ''),
           description = btrim(incident->>'description'),
           voting_center_code = nullif(btrim(incident->>'voting_center_code'), ''),
           jrv_code = nullif(btrim(incident->>'jrv_code'), ''),
           status = coalesce(nullif(btrim(incident->>'status'), ''), 'open')
     where id = target_id
       and campaign_id = target_campaign
     returning id into saved_id;
    if saved_id is null then
      raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
end
$$;

create or replace function public.radar_demo_save_resource(
  target_campaign uuid,
  target_id uuid,
  resource jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
as $$
declare
  saved_id uuid;
  resource_quantity numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(resource->>'resource_type'), '') is null
     or nullif(btrim(resource->>'name'), '') is null then
    raise exception 'RESOURCE_TYPE_AND_NAME_REQUIRED' using errcode = '22023';
  end if;
  resource_quantity := nullif(resource->>'quantity', '')::numeric;
  if resource_quantity is not null and resource_quantity < 0 then
    raise exception 'RESOURCE_QUANTITY_INVALID' using errcode = '22023';
  end if;

  if target_id is null then
    insert into demo_vault.resources (
      campaign_id, resource_type, name, quantity, unit, status, location, notes
    ) values (
      target_campaign,
      btrim(resource->>'resource_type'),
      btrim(resource->>'name'),
      resource_quantity,
      nullif(btrim(resource->>'unit'), ''),
      coalesce(nullif(btrim(resource->>'status'), ''), 'disponible'),
      nullif(btrim(resource->>'location'), ''),
      nullif(btrim(resource->>'notes'), '')
    ) returning id into saved_id;
  else
    update demo_vault.resources
       set resource_type = btrim(resource->>'resource_type'),
           name = btrim(resource->>'name'),
           quantity = resource_quantity,
           unit = nullif(btrim(resource->>'unit'), ''),
           status = coalesce(nullif(btrim(resource->>'status'), ''), 'disponible'),
           location = nullif(btrim(resource->>'location'), ''),
           notes = nullif(btrim(resource->>'notes'), '')
     where id = target_id
       and campaign_id = target_campaign
     returning id into saved_id;
    if saved_id is null then
      raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return saved_id;
end
$$;

revoke all on function public.radar_demo_save_fiscal(uuid, uuid, jsonb) from public, anon;
revoke all on function public.radar_demo_save_incident(uuid, uuid, jsonb) from public, anon;
revoke all on function public.radar_demo_save_resource(uuid, uuid, jsonb) from public, anon;

grant execute on function public.radar_demo_save_fiscal(uuid, uuid, jsonb) to authenticated;
grant execute on function public.radar_demo_save_incident(uuid, uuid, jsonb) to authenticated;
grant execute on function public.radar_demo_save_resource(uuid, uuid, jsonb) to authenticated;

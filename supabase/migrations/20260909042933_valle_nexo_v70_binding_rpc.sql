-- Valle Nexo V70 binding. Functions only: no seed, table or policy mutations.

create or replace function public.radar_demo_bundle(target_campaign uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = 'pg_catalog', 'public', 'data_vault', 'demo_vault', 'private', 'pg_temp'
as $$
declare
  target_municipality uuid;
  bundle jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not private.can_use_demo_campaign(target_campaign) then
    raise exception 'DEMO_ACCESS_DENIED';
  end if;

  select c.municipality_id
    into target_municipality
  from public.campaigns c
  where c.id = target_campaign
    and c.is_demo = true
    and c.status = 'active';

  if target_municipality is null then
    raise exception 'NOT_AN_ACTIVE_DEMO_CAMPAIGN';
  end if;

  select jsonb_build_object(
    'campaign', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'slug', c.slug,
        'is_demo', c.is_demo,
        'status', c.status
      )
      from public.campaigns c
      where c.id = target_campaign
    ),
    'geo_features', coalesce((
      select jsonb_agg(to_jsonb(g) - 'municipality_id' order by g.feature_type, g.feature_code)
      from data_vault.synthetic_geo_features g
      where g.municipality_id = target_municipality
    ), '[]'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.list_position nulls last, t.full_name)
      from demo_vault.candidates t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.full_name)
      from demo_vault.contacts t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'fiscales', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.voting_center_code, t.jrv_code, t.full_name)
      from demo_vault.fiscales t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.starts_at nulls last, t.title)
      from demo_vault.activities t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.reported_at desc, t.incident_type)
      from demo_vault.incidents t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'rtd_results', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.voting_center_code, t.jrv_code, t.election_type)
      from demo_vault.rtd_results t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'commitments', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.due_date nulls last, t.title)
      from demo_vault.commitments t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.resource_type, t.name)
      from demo_vault.resources t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'strategy_items', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.item_type, t.title)
      from demo_vault.strategy_items t where t.campaign_id = target_campaign
    ), '[]'::jsonb),
    'pulse_snapshots', coalesce((
      select jsonb_agg(to_jsonb(t) - 'campaign_id' order by t.snapshot_date, t.label)
      from demo_vault.pulse_snapshots t where t.campaign_id = target_campaign
    ), '[]'::jsonb)
  ) into bundle;

  return bundle;
end
$$;

create or replace function public.radar_demo_save_contact(
  target_campaign uuid,
  target_id uuid,
  contact jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
as $$
declare
  saved_id uuid;
begin
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED';
  end if;

  if nullif(btrim(contact->>'full_name'), '') is null then
    raise exception 'CONTACT_NAME_REQUIRED';
  end if;

  if target_id is null then
    insert into demo_vault.contacts (
      campaign_id, full_name, phone, community, address_text, status, notes, created_by
    ) values (
      target_campaign,
      btrim(contact->>'full_name'),
      nullif(btrim(contact->>'phone'), ''),
      nullif(btrim(contact->>'community'), ''),
      nullif(btrim(contact->>'address_text'), ''),
      coalesce(nullif(btrim(contact->>'status'), ''), 'base'),
      nullif(btrim(contact->>'notes'), ''),
      (select auth.uid())
    ) returning id into saved_id;
  else
    update demo_vault.contacts
       set full_name = btrim(contact->>'full_name'),
           phone = nullif(btrim(contact->>'phone'), ''),
           community = nullif(btrim(contact->>'community'), ''),
           address_text = nullif(btrim(contact->>'address_text'), ''),
           status = coalesce(nullif(btrim(contact->>'status'), ''), 'base'),
           notes = nullif(btrim(contact->>'notes'), ''),
           updated_at = now()
     where id = target_id
       and campaign_id = target_campaign
     returning id into saved_id;
    if saved_id is null then raise exception 'CONTACT_NOT_FOUND'; end if;
  end if;

  return saved_id;
end
$$;

create or replace function public.radar_demo_delete_contact(target_campaign uuid, target_id uuid)
returns void
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
as $$
begin
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED';
  end if;
  delete from demo_vault.contacts where campaign_id = target_campaign and id = target_id;
  if not found then raise exception 'CONTACT_NOT_FOUND'; end if;
end
$$;

create or replace function public.radar_demo_save_activity(
  target_campaign uuid,
  target_id uuid,
  activity jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
as $$
declare
  saved_id uuid;
  starts_at_value timestamptz;
begin
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED';
  end if;
  if nullif(btrim(activity->>'title'), '') is null then
    raise exception 'ACTIVITY_TITLE_REQUIRED';
  end if;
  starts_at_value := nullif(activity->>'starts_at', '')::timestamptz;

  if target_id is null then
    insert into demo_vault.activities (
      campaign_id, title, activity_type, starts_at, community, latitude, longitude, status, notes, created_by
    ) values (
      target_campaign,
      btrim(activity->>'title'),
      nullif(btrim(activity->>'activity_type'), ''),
      starts_at_value,
      nullif(btrim(activity->>'community'), ''),
      nullif(activity->>'latitude', '')::double precision,
      nullif(activity->>'longitude', '')::double precision,
      coalesce(nullif(btrim(activity->>'status'), ''), 'planned'),
      nullif(btrim(activity->>'notes'), ''),
      (select auth.uid())
    ) returning id into saved_id;
  else
    update demo_vault.activities
       set title = btrim(activity->>'title'),
           activity_type = nullif(btrim(activity->>'activity_type'), ''),
           starts_at = starts_at_value,
           community = nullif(btrim(activity->>'community'), ''),
           latitude = nullif(activity->>'latitude', '')::double precision,
           longitude = nullif(activity->>'longitude', '')::double precision,
           status = coalesce(nullif(btrim(activity->>'status'), ''), 'planned'),
           notes = nullif(btrim(activity->>'notes'), ''),
           updated_at = now()
     where id = target_id
       and campaign_id = target_campaign
     returning id into saved_id;
    if saved_id is null then raise exception 'ACTIVITY_NOT_FOUND'; end if;
  end if;

  return saved_id;
end
$$;

create or replace function public.radar_demo_delete_activity(target_campaign uuid, target_id uuid)
returns void
language plpgsql
security invoker
set search_path = 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
as $$
begin
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED';
  end if;
  delete from demo_vault.activities where campaign_id = target_campaign and id = target_id;
  if not found then raise exception 'ACTIVITY_NOT_FOUND'; end if;
end
$$;

revoke all on function public.radar_demo_bundle(uuid) from public, anon;
revoke all on function public.radar_demo_save_contact(uuid, uuid, jsonb) from public, anon;
revoke all on function public.radar_demo_delete_contact(uuid, uuid) from public, anon;
revoke all on function public.radar_demo_save_activity(uuid, uuid, jsonb) from public, anon;
revoke all on function public.radar_demo_delete_activity(uuid, uuid) from public, anon;

grant execute on function public.radar_demo_bundle(uuid) to authenticated;
grant execute on function public.radar_demo_save_contact(uuid, uuid, jsonb) to authenticated;
grant execute on function public.radar_demo_delete_contact(uuid, uuid) to authenticated;
grant execute on function public.radar_demo_save_activity(uuid, uuid, jsonb) to authenticated;
grant execute on function public.radar_demo_delete_activity(uuid, uuid) to authenticated;

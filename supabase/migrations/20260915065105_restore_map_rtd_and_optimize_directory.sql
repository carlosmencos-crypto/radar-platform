create index if not exists voter_directory_campaign_name_page_idx
  on campaign_vault.voter_directory (campaign_id, full_name, id);

create or replace function public.radar_save_activity_v1(
  p_campaign_id uuid,
  p_activity_id uuid,
  p_activity jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare
  saved campaign_vault.activities;
  title_value text := nullif(btrim(p_activity->>'title'), '');
  starts_value timestamptz;
  latitude_value double precision := nullif(p_activity->>'latitude', '')::double precision;
  longitude_value double precision := nullif(p_activity->>'longitude', '')::double precision;
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode = '42501';
  end if;
  if title_value is null then
    raise exception 'activity title required' using errcode = '22023';
  end if;
  if nullif(p_activity->>'starts_at', '') is not null then
    starts_value := (p_activity->>'starts_at')::timestamptz;
  end if;
  if (latitude_value is null) <> (longitude_value is null) then
    raise exception 'activity coordinates must be paired' using errcode = '22023';
  end if;
  if latitude_value is not null and (
    latitude_value not between 13.5 and 18.0
    or longitude_value not between -92.5 and -88.0
  ) then
    raise exception 'activity coordinates outside Guatemala' using errcode = '22023';
  end if;

  if p_activity_id is null then
    insert into campaign_vault.activities (
      campaign_id, title, activity_type, starts_at, community,
      latitude, longitude, status, notes, created_by
    ) values (
      p_campaign_id,
      title_value,
      nullif(btrim(p_activity->>'activity_type'), ''),
      starts_value,
      nullif(btrim(p_activity->>'community'), ''),
      latitude_value,
      longitude_value,
      coalesce(nullif(btrim(p_activity->>'status'), ''), 'planned'),
      nullif(btrim(p_activity->>'notes'), ''),
      auth.uid()
    ) returning * into saved;
  else
    update campaign_vault.activities set
      title = title_value,
      activity_type = nullif(btrim(p_activity->>'activity_type'), ''),
      starts_at = starts_value,
      community = nullif(btrim(p_activity->>'community'), ''),
      latitude = case when p_activity ? 'latitude' then latitude_value else latitude end,
      longitude = case when p_activity ? 'longitude' then longitude_value else longitude end,
      status = coalesce(nullif(btrim(p_activity->>'status'), ''), status),
      notes = nullif(btrim(p_activity->>'notes'), ''),
      updated_at = now()
    where id = p_activity_id and campaign_id = p_campaign_id
    returning * into saved;
    if saved.id is null then
      raise exception 'activity not found' using errcode = 'P0002';
    end if;
  end if;

  return to_jsonb(saved);
end
$$;

create or replace function public.radar_authorized_voter_directory_v1(
  p_municipality_code text,
  p_query text default null,
  p_dpi text default null,
  p_community text default null,
  p_age_min integer default null,
  p_age_max integer default null,
  p_status text default null,
  p_affiliation text default null,
  p_role text default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  id bigint,
  full_name text,
  community text,
  estimated_age_2026 integer,
  masked_identification text,
  contact_status text,
  phone_primary text,
  assigned_person_name text,
  campaign_role text,
  party_affiliation text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public, private, campaign_vault, extensions, pg_temp
as $$
  with authorized as materialized (
    select ctx.campaign_id
    from public.radar_authorized_context_v2('municipality', p_municipality_code) ctx
    where ctx.campaign_id is not null
      and private.is_campaign_member(ctx.campaign_id, array['campaign_admin','campaign_editor','campaign_viewer'])
    limit 1
  ), filtered as not materialized (
    select v.*
    from campaign_vault.voter_directory v
    join authorized a on a.campaign_id = v.campaign_id
    where (nullif(btrim(p_query), '') is null
      or v.full_name ilike '%' || btrim(p_query) || '%'
      or similarity(lower(v.full_name), lower(btrim(p_query))) >= 0.24)
      and (nullif(regexp_replace(coalesce(p_dpi, ''), '\D', '', 'g'), '') is null
        or regexp_replace(coalesce(v.identification, ''), '\D', '', 'g') = regexp_replace(p_dpi, '\D', '', 'g'))
      and (nullif(btrim(p_community), '') is null or v.community = p_community)
      and (p_age_min is null or v.estimated_age_2026 >= p_age_min)
      and (p_age_max is null or v.estimated_age_2026 <= p_age_max)
      and (nullif(btrim(p_status), '') is null or v.contact_status = upper(p_status))
      and (nullif(btrim(p_affiliation), '') is null or v.party_affiliation = upper(p_affiliation))
      and (nullif(btrim(p_role), '') is null or v.campaign_role ilike '%' || btrim(p_role) || '%')
  ), totals as (
    select count(*)::bigint as total_count from filtered
  ), page_rows as (
    select
      v.*,
      case when nullif(btrim(p_query), '') is null
        then 0
        else similarity(lower(v.full_name), lower(btrim(p_query)))
      end as match_rank
    from filtered v
    order by match_rank desc, v.full_name, v.id
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  )
  select
    v.id,
    v.full_name,
    v.community,
    v.estimated_age_2026,
    case
      when v.identification is null then null
      when length(v.identification) <= 8 then repeat('•', greatest(length(v.identification) - 2, 0)) || right(v.identification, 2)
      else left(v.identification, 4) || repeat('•', greatest(length(v.identification) - 8, 0)) || right(v.identification, 4)
    end,
    v.contact_status,
    v.phone_primary,
    v.assigned_person_name,
    v.campaign_role,
    v.party_affiliation,
    totals.total_count
  from page_rows v
  cross join totals
  order by v.match_rank desc, v.full_name, v.id
$$;

revoke all on function public.radar_save_activity_v1(uuid, uuid, jsonb) from public, anon;
revoke all on function public.radar_authorized_voter_directory_v1(text, text, text, text, integer, integer, text, text, text, integer, integer) from public, anon;
grant execute on function public.radar_save_activity_v1(uuid, uuid, jsonb) to authenticated;
grant execute on function public.radar_authorized_voter_directory_v1(text, text, text, text, integer, integer, text, text, text, integer, integer) to authenticated;

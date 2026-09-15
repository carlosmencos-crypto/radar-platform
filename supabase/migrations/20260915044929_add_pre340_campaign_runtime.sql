create extension if not exists pg_trgm with schema extensions;

create table if not exists campaign_vault.campaign_identity (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  candidate_name text,
  party_name text,
  party_logo_data_url text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_identity_logo_size check (
    party_logo_data_url is null or length(party_logo_data_url) <= 1400000
  )
);

create table if not exists campaign_vault.voter_directory (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_row integer not null,
  full_name text not null,
  community text,
  estimated_age_2026 integer,
  identification text,
  contact_status text not null default 'SIN_CONTACTO',
  phone_primary text,
  assigned_person_name text,
  campaign_role text,
  party_affiliation text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voter_directory_campaign_source_key unique (campaign_id, source_row),
  constraint voter_directory_age_check check (
    estimated_age_2026 is null or estimated_age_2026 between 18 and 120
  ),
  constraint voter_directory_contact_status_check check (
    contact_status in ('SIN_CONTACTO', 'CONTACTADO', 'INTERESADO', 'NO_INTERESADO', 'VOLUNTARIO', 'LIDER')
  ),
  constraint voter_directory_affiliation_check check (
    party_affiliation is null or party_affiliation in ('SI', 'NO')
  )
);

create index if not exists voter_directory_campaign_name_trgm_idx
  on campaign_vault.voter_directory using gin (lower(full_name) extensions.gin_trgm_ops);
create index if not exists voter_directory_campaign_identification_idx
  on campaign_vault.voter_directory (campaign_id, identification);
create index if not exists voter_directory_campaign_community_idx
  on campaign_vault.voter_directory (campaign_id, community);

alter table campaign_vault.campaign_identity enable row level security;
alter table campaign_vault.voter_directory enable row level security;

revoke all on campaign_vault.campaign_identity from public, anon;
revoke all on campaign_vault.voter_directory from public, anon;
grant usage on schema campaign_vault to authenticated;
grant select, insert, update on campaign_vault.campaign_identity to authenticated;
grant select, update on campaign_vault.voter_directory to authenticated;
grant usage, select on sequence campaign_vault.voter_directory_id_seq to authenticated;

drop policy if exists campaign_identity_select on campaign_vault.campaign_identity;
create policy campaign_identity_select
on campaign_vault.campaign_identity for select to authenticated
using (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor','campaign_viewer']));

drop policy if exists campaign_identity_write on campaign_vault.campaign_identity;
create policy campaign_identity_write
on campaign_vault.campaign_identity for all to authenticated
using (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']))
with check (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']));

drop policy if exists voter_directory_select on campaign_vault.voter_directory;
create policy voter_directory_select
on campaign_vault.voter_directory for select to authenticated
using (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor','campaign_viewer']));

drop policy if exists voter_directory_update on campaign_vault.voter_directory;
create policy voter_directory_update
on campaign_vault.voter_directory for update to authenticated
using (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']))
with check (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']));

create or replace function public.radar_campaign_bundle_v1(p_campaign_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
  select case
    when private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor','campaign_viewer']) then
      jsonb_build_object(
        'identity', coalesce((
          select to_jsonb(i) - 'updated_by'
          from campaign_vault.campaign_identity i
          where i.campaign_id = p_campaign_id
        ), '{}'::jsonb),
        'activities', coalesce((
          select jsonb_agg(to_jsonb(a) order by a.starts_at nulls last, a.created_at)
          from campaign_vault.activities a
          where a.campaign_id = p_campaign_id
        ), '[]'::jsonb),
        'commitments', coalesce((
          select jsonb_agg(to_jsonb(c) order by c.due_date nulls last, c.created_at)
          from campaign_vault.commitments c
          where c.campaign_id = p_campaign_id
        ), '[]'::jsonb)
      )
    else null
  end
$$;

create or replace function public.radar_save_campaign_identity_v1(
  p_campaign_id uuid,
  p_identity jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare
  saved campaign_vault.campaign_identity;
  logo text := nullif(btrim(p_identity->>'party_logo_data_url'), '');
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode = '42501';
  end if;
  if logo is not null and (
    length(logo) > 1400000
    or logo !~ '^data:image/(png|jpeg|webp);base64,'
  ) then
    raise exception 'invalid campaign logo' using errcode = '22023';
  end if;

  insert into campaign_vault.campaign_identity (
    campaign_id, candidate_name, party_name, party_logo_data_url, updated_by
  ) values (
    p_campaign_id,
    nullif(btrim(p_identity->>'candidate_name'), ''),
    nullif(btrim(p_identity->>'party_name'), ''),
    logo,
    auth.uid()
  )
  on conflict (campaign_id) do update set
    candidate_name = excluded.candidate_name,
    party_name = excluded.party_name,
    party_logo_data_url = excluded.party_logo_data_url,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into saved;

  return to_jsonb(saved) - 'updated_by';
end
$$;

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

  if p_activity_id is null then
    insert into campaign_vault.activities (
      campaign_id, title, activity_type, starts_at, community, status, notes, created_by
    ) values (
      p_campaign_id,
      title_value,
      nullif(btrim(p_activity->>'activity_type'), ''),
      starts_value,
      nullif(btrim(p_activity->>'community'), ''),
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
  with authorized as (
    select ctx.campaign_id
    from public.radar_authorized_context_v2('municipality', p_municipality_code) ctx
    where ctx.campaign_id is not null
      and private.is_campaign_member(ctx.campaign_id, array['campaign_admin','campaign_editor','campaign_viewer'])
    limit 1
  ), filtered as (
    select v.*
    from campaign_vault.voter_directory v
    join authorized a on a.campaign_id = v.campaign_id
    where (nullif(btrim(p_query), '') is null
      or v.full_name ilike '%' || btrim(p_query) || '%'
      or similarity(lower(v.full_name), lower(btrim(p_query))) >= 0.24)
      and (nullif(regexp_replace(coalesce(p_dpi, ''), '\\D', '', 'g'), '') is null
        or regexp_replace(coalesce(v.identification, ''), '\\D', '', 'g') = regexp_replace(p_dpi, '\\D', '', 'g'))
      and (nullif(btrim(p_community), '') is null or v.community = p_community)
      and (p_age_min is null or v.estimated_age_2026 >= p_age_min)
      and (p_age_max is null or v.estimated_age_2026 <= p_age_max)
      and (nullif(btrim(p_status), '') is null or v.contact_status = upper(p_status))
      and (nullif(btrim(p_affiliation), '') is null or v.party_affiliation = upper(p_affiliation))
      and (nullif(btrim(p_role), '') is null or v.campaign_role ilike '%' || btrim(p_role) || '%')
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
    count(*) over()
  from filtered v
  order by
    case when nullif(btrim(p_query), '') is null then 0 else similarity(lower(v.full_name), lower(btrim(p_query))) end desc,
    v.full_name,
    v.id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 50)
$$;

revoke all on function public.radar_campaign_bundle_v1(uuid) from public, anon;
revoke all on function public.radar_save_campaign_identity_v1(uuid, jsonb) from public, anon;
revoke all on function public.radar_save_activity_v1(uuid, uuid, jsonb) from public, anon;
revoke all on function public.radar_authorized_voter_directory_v1(text, text, text, text, integer, integer, text, text, text, integer, integer) from public, anon;
grant execute on function public.radar_campaign_bundle_v1(uuid) to authenticated;
grant execute on function public.radar_save_campaign_identity_v1(uuid, jsonb) to authenticated;
grant execute on function public.radar_save_activity_v1(uuid, uuid, jsonb) to authenticated;
grant execute on function public.radar_authorized_voter_directory_v1(text, text, text, text, integer, integer, text, text, text, integer, integer) to authenticated;

with target as (
  select o.id as organization_id, m.id as municipality_id, m.country_code
  from public.organizations o
  join public.municipalities m on m.country_code = 'GT' and m.municipality_code = '0509'
  where o.is_platform_owner = true
  order by o.created_at
  limit 1
)
insert into public.campaigns (organization_id, country_code, municipality_id, name, slug, is_demo, status)
select organization_id, country_code, municipality_id, 'Campaña Alcaldía · San José', 'radar-0509-campaign', false, 'active'
from target
on conflict (organization_id, slug) do update set
  municipality_id = excluded.municipality_id,
  country_code = excluded.country_code,
  name = excluded.name,
  is_demo = false,
  status = 'active';

insert into public.campaign_members (campaign_id, user_id, member_role)
select c.id, p.user_id, 'campaign_admin'
from public.campaigns c
join public.municipalities m on m.id = c.municipality_id and m.municipality_code = '0509'
join public.profiles p on p.platform_role = 'platform_admin' and p.is_active = true
where c.status = 'active' and c.is_demo = false
on conflict (campaign_id, user_id) do update set member_role = excluded.member_role;

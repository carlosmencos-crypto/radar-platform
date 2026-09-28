-- Restore the interactive V70 campaign workflows on top of the shared national
-- runtime. All private writes stay scoped by campaign membership and RLS.

alter table campaign_vault.activities
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table campaign_vault.contacts
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists contact_type text not null default 'CONTACTO',
  add column if not exists active boolean not null default true,
  add column if not exists photo_url text,
  add column if not exists identification text,
  add column if not exists social_url text,
  add column if not exists file_code text,
  add column if not exists is_in_crm boolean not null default true;

alter table campaign_vault.voter_directory
  add column if not exists phone_secondary text,
  add column if not exists exact_address text,
  add column if not exists location_reference text,
  add column if not exists confirmed_community text,
  add column if not exists assigned_contact_id uuid references campaign_vault.contacts(id) on delete set null,
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz,
  add column if not exists notes text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists dpi_front_url text,
  add column if not exists dpi_back_url text,
  add column if not exists is_manual boolean not null default false;

create table if not exists campaign_vault.voter_interactions (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  voter_id bigint not null references campaign_vault.voter_directory(id) on delete cascade,
  interaction_type text not null,
  interaction_at timestamptz not null default now(),
  responsible_contact_id uuid references campaign_vault.contacts(id) on delete set null,
  notes text,
  commitment text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists activities_campaign_starts_idx
  on campaign_vault.activities (campaign_id, starts_at, id);
create index if not exists contacts_campaign_active_name_idx
  on campaign_vault.contacts (campaign_id, active, full_name, id);
create index if not exists voter_directory_campaign_source_page_idx
  on campaign_vault.voter_directory (campaign_id, source_row, id);
create index if not exists voter_interactions_campaign_voter_at_idx
  on campaign_vault.voter_interactions (campaign_id, voter_id, interaction_at desc, id desc);
create unique index if not exists strategy_items_campaign_v70_scenario_idx
  on campaign_vault.strategy_items (campaign_id, item_type)
  where item_type in ('scenario_conservador','scenario_base','scenario_optimista');

alter table campaign_vault.voter_interactions enable row level security;

revoke all on campaign_vault.voter_interactions from public, anon;
grant select, insert on campaign_vault.voter_interactions to authenticated;
grant usage, select on sequence campaign_vault.voter_interactions_id_seq to authenticated;
grant insert on campaign_vault.voter_directory to authenticated;

drop policy if exists voter_interactions_select on campaign_vault.voter_interactions;
create policy voter_interactions_select
on campaign_vault.voter_interactions for select to authenticated
using (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor','campaign_viewer']));

drop policy if exists voter_interactions_insert on campaign_vault.voter_interactions;
create policy voter_interactions_insert
on campaign_vault.voter_interactions for insert to authenticated
with check (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']));

drop policy if exists voter_directory_insert on campaign_vault.voter_directory;
create policy voter_directory_insert
on campaign_vault.voter_directory for insert to authenticated
with check (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']));

create or replace function public.radar_strategy_scenarios_v1(p_campaign_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
  select case
    when private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor','campaign_viewer']) then
      jsonb_build_object(
        'conservador', coalesce((select target_value from campaign_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_conservador' limit 1), 0),
        'base', coalesce((select target_value from campaign_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_base' limit 1), 0),
        'optimista', coalesce((select target_value from campaign_vault.strategy_items where campaign_id=p_campaign_id and item_type='scenario_optimista' limit 1), 0)
      )
    else null
  end
$$;

create or replace function public.radar_save_strategy_scenarios_v1(
  p_campaign_id uuid,
  p_scenarios jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare
  key_value text;
  numeric_value numeric;
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  foreach key_value in array array['conservador','base','optimista'] loop
    numeric_value := nullif(regexp_replace(coalesce(p_scenarios->>key_value,''), '[^0-9.]', '', 'g'), '')::numeric;
    if numeric_value is not null and (numeric_value < 0 or numeric_value > 100000000) then
      raise exception 'invalid scenario value' using errcode='22023';
    end if;
    insert into campaign_vault.strategy_items (
      campaign_id, item_type, title, target_value, status
    ) values (
      p_campaign_id, 'scenario_' || key_value, initcap(key_value), numeric_value, 'activo'
    )
    on conflict (campaign_id, item_type)
      where item_type in ('scenario_conservador','scenario_base','scenario_optimista')
    do update set target_value=excluded.target_value, status='activo';
  end loop;
  return public.radar_strategy_scenarios_v1(p_campaign_id);
end
$$;

create or replace function public.radar_campaign_contacts_v1(p_campaign_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
  select case
    when private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor','campaign_viewer']) then
      coalesce((
        select jsonb_agg(to_jsonb(c) - 'created_by' order by c.full_name, c.id)
        from campaign_vault.contacts c
        where c.campaign_id=p_campaign_id and c.active
      ), '[]'::jsonb)
    else null
  end
$$;

create or replace function public.radar_save_campaign_contact_v1(
  p_campaign_id uuid,
  p_contact_id uuid,
  p_contact jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare
  saved campaign_vault.contacts;
  name_value text := nullif(btrim(p_contact->>'full_name'), '');
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  if name_value is null then raise exception 'contact name required' using errcode='22023'; end if;

  if p_contact_id is null then
    insert into campaign_vault.contacts (
      campaign_id, full_name, phone, community, address_text, status, notes,
      email, role, contact_type, active, photo_url, identification, social_url,
      file_code, is_in_crm, created_by
    ) values (
      p_campaign_id, name_value, nullif(btrim(p_contact->>'phone'), ''),
      nullif(btrim(p_contact->>'community'), ''), nullif(btrim(p_contact->>'address_text'), ''),
      coalesce(nullif(btrim(p_contact->>'status'), ''), 'base'), nullif(btrim(p_contact->>'notes'), ''),
      nullif(btrim(p_contact->>'email'), ''), nullif(btrim(p_contact->>'role'), ''),
      coalesce(nullif(btrim(p_contact->>'contact_type'), ''), 'CONTACTO'),
      coalesce((p_contact->>'active')::boolean, true), nullif(btrim(p_contact->>'photo_url'), ''),
      nullif(btrim(p_contact->>'identification'), ''), nullif(btrim(p_contact->>'social_url'), ''),
      nullif(btrim(p_contact->>'file_code'), ''), coalesce((p_contact->>'is_in_crm')::boolean, true), auth.uid()
    ) returning * into saved;
  else
    update campaign_vault.contacts set
      full_name=name_value,
      phone=nullif(btrim(p_contact->>'phone'), ''),
      community=nullif(btrim(p_contact->>'community'), ''),
      address_text=nullif(btrim(p_contact->>'address_text'), ''),
      status=coalesce(nullif(btrim(p_contact->>'status'), ''), status),
      notes=nullif(btrim(p_contact->>'notes'), ''),
      email=nullif(btrim(p_contact->>'email'), ''),
      role=nullif(btrim(p_contact->>'role'), ''),
      contact_type=coalesce(nullif(btrim(p_contact->>'contact_type'), ''), contact_type),
      active=coalesce((p_contact->>'active')::boolean, active),
      photo_url=nullif(btrim(p_contact->>'photo_url'), ''),
      identification=nullif(btrim(p_contact->>'identification'), ''),
      social_url=nullif(btrim(p_contact->>'social_url'), ''),
      file_code=nullif(btrim(p_contact->>'file_code'), ''),
      is_in_crm=coalesce((p_contact->>'is_in_crm')::boolean, is_in_crm),
      updated_at=now()
    where id=p_contact_id and campaign_id=p_campaign_id
    returning * into saved;
    if saved.id is null then raise exception 'contact not found' using errcode='P0002'; end if;
  end if;
  return to_jsonb(saved) - 'created_by';
end
$$;

create or replace function public.radar_authorized_voter_suggestions_v1(
  p_municipality_code text,
  p_query text,
  p_limit integer default 8
)
returns table (id bigint, full_name text, community text, estimated_age_2026 integer)
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
  )
  select v.id, v.full_name, v.community, v.estimated_age_2026
  from campaign_vault.voter_directory v
  join authorized a on a.campaign_id=v.campaign_id
  where length(btrim(coalesce(p_query,''))) >= 2
    and (v.full_name ilike '%' || btrim(p_query) || '%'
      or similarity(lower(v.full_name), lower(btrim(p_query))) >= 0.24)
  order by similarity(lower(v.full_name), lower(btrim(p_query))) desc, v.source_row, v.id
  limit least(greatest(coalesce(p_limit,8),1),12)
$$;

create or replace function public.radar_authorized_voter_detail_v1(
  p_municipality_code text,
  p_voter_id bigint
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
  with authorized as materialized (
    select ctx.campaign_id, ctx.municipality_name
    from public.radar_authorized_context_v2('municipality', p_municipality_code) ctx
    where ctx.campaign_id is not null
      and private.is_campaign_member(ctx.campaign_id, array['campaign_admin','campaign_editor','campaign_viewer'])
    limit 1
  ), target as (
    select v.*, a.municipality_name
    from campaign_vault.voter_directory v
    join authorized a on a.campaign_id=v.campaign_id
    where v.id=p_voter_id
  )
  select jsonb_build_object(
    'elector', jsonb_build_object(
      'id', t.id, 'full_name', t.full_name, 'community', t.community,
      'estimated_age_2026', t.estimated_age_2026, 'municipality_code', p_municipality_code,
      'municipality_name', t.municipality_name,
      'masked_identification', case when t.identification is null then null when length(t.identification)<=8 then repeat('•',greatest(length(t.identification)-2,0))||right(t.identification,2) else left(t.identification,4)||repeat('•',greatest(length(t.identification)-8,0))||right(t.identification,4) end
    ),
    'profile', to_jsonb(t) - array['identification','municipality_name','campaign_id','created_at','updated_at','source_row'],
    'interactions', coalesce((
      select jsonb_agg(to_jsonb(i) - array['campaign_id','voter_id','created_by'] order by i.interaction_at desc, i.id desc)
      from campaign_vault.voter_interactions i where i.campaign_id=t.campaign_id and i.voter_id=t.id
    ), '[]'::jsonb)
  )
  from target t
$$;

create or replace function public.radar_reveal_voter_identification_v1(
  p_municipality_code text,
  p_voter_id bigint
)
returns text
language sql
stable
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
  select v.identification
  from campaign_vault.voter_directory v
  join public.radar_authorized_context_v2('municipality', p_municipality_code) ctx
    on ctx.campaign_id=v.campaign_id
  where v.id=p_voter_id
    and private.is_campaign_member(v.campaign_id, array['campaign_admin','campaign_editor'])
  limit 1
$$;

create or replace function public.radar_save_voter_profile_v1(
  p_campaign_id uuid,
  p_voter_id bigint,
  p_profile jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare saved campaign_vault.voter_directory;
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  update campaign_vault.voter_directory set
    contact_status=coalesce(nullif(upper(btrim(p_profile->>'contact_status')),''),contact_status),
    phone_primary=nullif(btrim(p_profile->>'phone_primary'),''),
    phone_secondary=nullif(btrim(p_profile->>'phone_secondary'),''),
    exact_address=nullif(btrim(p_profile->>'exact_address'),''),
    location_reference=nullif(btrim(p_profile->>'location_reference'),''),
    confirmed_community=nullif(btrim(p_profile->>'confirmed_community'),''),
    assigned_contact_id=nullif(p_profile->>'assigned_contact_id','')::uuid,
    assigned_person_name=nullif(btrim(p_profile->>'assigned_person_name'),''),
    campaign_role=nullif(btrim(p_profile->>'campaign_role'),''),
    party_affiliation=nullif(upper(btrim(p_profile->>'party_affiliation')),''),
    photo_url=nullif(btrim(p_profile->>'photo_url'),''),
    dpi_front_url=nullif(btrim(p_profile->>'dpi_front_url'),''),
    dpi_back_url=nullif(btrim(p_profile->>'dpi_back_url'),''),
    notes=nullif(btrim(p_profile->>'notes'),''),
    next_action=nullif(btrim(p_profile->>'next_action'),''),
    next_action_at=nullif(p_profile->>'next_action_at','')::timestamptz,
    latitude=nullif(p_profile->>'latitude','')::double precision,
    longitude=nullif(p_profile->>'longitude','')::double precision,
    updated_at=now()
  where id=p_voter_id and campaign_id=p_campaign_id
  returning * into saved;
  if saved.id is null then raise exception 'voter not found' using errcode='P0002'; end if;
  return to_jsonb(saved) - array['identification','campaign_id','created_at','updated_at','source_row'];
end
$$;

create or replace function public.radar_create_manual_voter_v1(
  p_campaign_id uuid,
  p_voter jsonb
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare saved_id bigint; next_source integer; name_value text:=nullif(btrim(p_voter->>'full_name'),'');
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  if name_value is null then raise exception 'voter name required' using errcode='22023'; end if;
  select coalesce(max(source_row),0)+1 into next_source from campaign_vault.voter_directory where campaign_id=p_campaign_id;
  insert into campaign_vault.voter_directory (
    campaign_id, source_row, full_name, identification, community, estimated_age_2026, is_manual
  ) values (
    p_campaign_id, next_source, name_value, nullif(regexp_replace(coalesce(p_voter->>'identification',''),'\D','','g'),''),
    nullif(btrim(p_voter->>'community'),''), nullif(p_voter->>'estimated_age_2026','')::integer, true
  ) returning id into saved_id;
  update campaign_vault.voter_directory_stats set total_count=total_count+1, updated_at=now() where campaign_id=p_campaign_id;
  return saved_id;
end
$$;

create or replace function public.radar_add_voter_interaction_v1(
  p_campaign_id uuid,
  p_voter_id bigint,
  p_interaction jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare saved campaign_vault.voter_interactions;
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  insert into campaign_vault.voter_interactions (
    campaign_id, voter_id, interaction_type, interaction_at, responsible_contact_id, notes, commitment, created_by
  ) values (
    p_campaign_id, p_voter_id, coalesce(nullif(btrim(p_interaction->>'interaction_type'),''),'LLAMADA'),
    coalesce(nullif(p_interaction->>'interaction_at','')::timestamptz,now()),
    nullif(p_interaction->>'responsible_contact_id','')::uuid,
    nullif(btrim(p_interaction->>'notes'),''), nullif(btrim(p_interaction->>'commitment'),''), auth.uid()
  ) returning * into saved;
  return to_jsonb(saved) - array['campaign_id','voter_id','created_by'];
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
  title_value text:=nullif(btrim(p_activity->>'title'),'');
  starts_value timestamptz:=nullif(p_activity->>'starts_at','')::timestamptz;
  latitude_value double precision:=nullif(p_activity->>'latitude','')::double precision;
  longitude_value double precision:=nullif(p_activity->>'longitude','')::double precision;
  details_value jsonb:=coalesce(p_activity->'details','{}'::jsonb);
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  if title_value is null then raise exception 'activity title required' using errcode='22023'; end if;
  if (latitude_value is null)<>(longitude_value is null) then raise exception 'activity coordinates must be paired' using errcode='22023'; end if;
  if latitude_value is not null and (latitude_value not between 13.5 and 18.0 or longitude_value not between -92.5 and -88.0) then
    raise exception 'activity coordinates outside Guatemala' using errcode='22023';
  end if;
  if jsonb_typeof(details_value)<>'object' then raise exception 'activity details must be an object' using errcode='22023'; end if;
  if p_activity_id is null then
    insert into campaign_vault.activities (campaign_id,title,activity_type,starts_at,community,latitude,longitude,status,notes,details,created_by)
    values (p_campaign_id,title_value,nullif(btrim(p_activity->>'activity_type'),''),starts_value,nullif(btrim(p_activity->>'community'),''),latitude_value,longitude_value,coalesce(nullif(btrim(p_activity->>'status'),''),'PLANIFICADA'),nullif(btrim(p_activity->>'notes'),''),details_value,auth.uid())
    returning * into saved;
  else
    update campaign_vault.activities set title=title_value,activity_type=nullif(btrim(p_activity->>'activity_type'),''),starts_at=starts_value,
      community=nullif(btrim(p_activity->>'community'),''),latitude=case when p_activity?'latitude' then latitude_value else latitude end,
      longitude=case when p_activity?'longitude' then longitude_value else longitude end,status=coalesce(nullif(btrim(p_activity->>'status'),''),status),
      notes=nullif(btrim(p_activity->>'notes'),''),details=details_value,updated_at=now()
    where id=p_activity_id and campaign_id=p_campaign_id returning * into saved;
    if saved.id is null then raise exception 'activity not found' using errcode='P0002'; end if;
  end if;
  return to_jsonb(saved);
end
$$;

create or replace function public.radar_delete_activity_v1(p_campaign_id uuid,p_activity_id uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
begin
  if not private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  delete from campaign_vault.activities where campaign_id=p_campaign_id and id=p_activity_id;
  return found;
end
$$;

-- Preserve the source order used by the approved V70 pilot when there is no
-- search term. Ranked fuzzy matches retain relevance ordering.
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
  id bigint, full_name text, community text, estimated_age_2026 integer,
  masked_identification text, contact_status text, phone_primary text,
  assigned_person_name text, campaign_role text, party_affiliation text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public, private, campaign_vault, extensions, pg_temp
as $$
  with input_state as materialized (
    select (nullif(btrim(p_query),'') is not null or nullif(regexp_replace(coalesce(p_dpi,''),'\D','','g'),'') is not null
      or nullif(btrim(p_community),'') is not null or p_age_min is not null or p_age_max is not null
      or nullif(btrim(p_status),'') is not null or nullif(btrim(p_affiliation),'') is not null or nullif(btrim(p_role),'') is not null) has_filters
  ), authorized as materialized (
    select ctx.campaign_id from public.radar_authorized_context_v2('municipality',p_municipality_code) ctx
    where ctx.campaign_id is not null and private.is_campaign_member(ctx.campaign_id,array['campaign_admin','campaign_editor','campaign_viewer']) limit 1
  ), filtered as not materialized (
    select v.* from campaign_vault.voter_directory v join authorized a on a.campaign_id=v.campaign_id
    where (nullif(btrim(p_query),'') is null or v.full_name ilike '%'||btrim(p_query)||'%' or similarity(lower(v.full_name),lower(btrim(p_query)))>=.24)
      and (nullif(regexp_replace(coalesce(p_dpi,''),'\D','','g'),'') is null or regexp_replace(coalesce(v.identification,''),'\D','','g')=regexp_replace(p_dpi,'\D','','g'))
      and (nullif(btrim(p_community),'') is null or v.community=p_community)
      and (p_age_min is null or v.estimated_age_2026>=p_age_min) and (p_age_max is null or v.estimated_age_2026<=p_age_max)
      and (nullif(btrim(p_status),'') is null or v.contact_status=upper(p_status))
      and (nullif(btrim(p_affiliation),'') is null or v.party_affiliation=upper(p_affiliation))
      and (nullif(btrim(p_role),'') is null or v.campaign_role ilike '%'||btrim(p_role)||'%')
  ), totals as (
    select s.total_count from authorized a join campaign_vault.voter_directory_stats s on s.campaign_id=a.campaign_id cross join input_state i where not i.has_filters
    union all select count(*)::bigint from filtered cross join input_state i where i.has_filters having (select has_filters from input_state)
  ), page_rows as (
    select v.*,case when nullif(btrim(p_query),'') is null then 0 else similarity(lower(v.full_name),lower(btrim(p_query))) end match_rank
    from filtered v
    order by
      case when nullif(btrim(p_query),'') is null then 0 else similarity(lower(v.full_name),lower(btrim(p_query))) end desc,
      case when nullif(btrim(p_query),'') is null then v.source_row end,
      case when nullif(btrim(p_query),'') is not null then v.full_name end,
      v.id
    offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,25),1),50)
  )
  select v.id,v.full_name,v.community,v.estimated_age_2026,
    case when v.identification is null then null when length(v.identification)<=8 then repeat('•',greatest(length(v.identification)-2,0))||right(v.identification,2) else left(v.identification,4)||repeat('•',greatest(length(v.identification)-8,0))||right(v.identification,4) end,
    v.contact_status,v.phone_primary,v.assigned_person_name,v.campaign_role,v.party_affiliation,totals.total_count
  from page_rows v cross join totals
  order by v.match_rank desc,
    case when nullif(btrim(p_query),'') is null then v.source_row end,
    case when nullif(btrim(p_query),'') is not null then v.full_name end,
    v.id
$$;

revoke all on function public.radar_strategy_scenarios_v1(uuid) from public, anon;
revoke all on function public.radar_save_strategy_scenarios_v1(uuid,jsonb) from public, anon;
revoke all on function public.radar_campaign_contacts_v1(uuid) from public, anon;
revoke all on function public.radar_save_campaign_contact_v1(uuid,uuid,jsonb) from public, anon;
revoke all on function public.radar_authorized_voter_suggestions_v1(text,text,integer) from public, anon;
revoke all on function public.radar_authorized_voter_detail_v1(text,bigint) from public, anon;
revoke all on function public.radar_reveal_voter_identification_v1(text,bigint) from public, anon;
revoke all on function public.radar_save_voter_profile_v1(uuid,bigint,jsonb) from public, anon;
revoke all on function public.radar_create_manual_voter_v1(uuid,jsonb) from public, anon;
revoke all on function public.radar_add_voter_interaction_v1(uuid,bigint,jsonb) from public, anon;
revoke all on function public.radar_delete_activity_v1(uuid,uuid) from public, anon;

grant execute on function public.radar_strategy_scenarios_v1(uuid) to authenticated;
grant execute on function public.radar_save_strategy_scenarios_v1(uuid,jsonb) to authenticated;
grant execute on function public.radar_campaign_contacts_v1(uuid) to authenticated;
grant execute on function public.radar_save_campaign_contact_v1(uuid,uuid,jsonb) to authenticated;
grant execute on function public.radar_authorized_voter_suggestions_v1(text,text,integer) to authenticated;
grant execute on function public.radar_authorized_voter_detail_v1(text,bigint) to authenticated;
grant execute on function public.radar_reveal_voter_identification_v1(text,bigint) to authenticated;
grant execute on function public.radar_save_voter_profile_v1(uuid,bigint,jsonb) to authenticated;
grant execute on function public.radar_create_manual_voter_v1(uuid,jsonb) to authenticated;
grant execute on function public.radar_add_voter_interaction_v1(uuid,bigint,jsonb) to authenticated;
grant execute on function public.radar_delete_activity_v1(uuid,uuid) to authenticated;

revoke all on function public.radar_authorized_voter_directory_v1(text,text,text,text,integer,integer,text,text,text,integer,integer) from public, anon;
grant execute on function public.radar_authorized_voter_directory_v1(text,text,text,text,integer,integer,text,text,text,integer,integer) to authenticated;

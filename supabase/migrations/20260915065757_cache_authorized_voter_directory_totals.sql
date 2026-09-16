create table if not exists campaign_vault.voter_directory_stats (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  total_count bigint not null check (total_count >= 0),
  updated_at timestamptz not null default now()
);

insert into campaign_vault.voter_directory_stats (campaign_id, total_count, updated_at)
select campaign_id, count(*)::bigint, now()
from campaign_vault.voter_directory
group by campaign_id
on conflict (campaign_id) do update set
  total_count = excluded.total_count,
  updated_at = excluded.updated_at;

alter table campaign_vault.voter_directory_stats enable row level security;
revoke all on campaign_vault.voter_directory_stats from public, anon;
grant select on campaign_vault.voter_directory_stats to authenticated;

drop policy if exists voter_directory_stats_select on campaign_vault.voter_directory_stats;
create policy voter_directory_stats_select
on campaign_vault.voter_directory_stats for select to authenticated
using (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor','campaign_viewer']));

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
  with input_state as materialized (
    select (
      nullif(btrim(p_query), '') is not null
      or nullif(regexp_replace(coalesce(p_dpi, ''), '\D', '', 'g'), '') is not null
      or nullif(btrim(p_community), '') is not null
      or p_age_min is not null
      or p_age_max is not null
      or nullif(btrim(p_status), '') is not null
      or nullif(btrim(p_affiliation), '') is not null
      or nullif(btrim(p_role), '') is not null
    ) as has_filters
  ), authorized as materialized (
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
    select s.total_count
    from authorized a
    join campaign_vault.voter_directory_stats s on s.campaign_id = a.campaign_id
    cross join input_state i
    where not i.has_filters
    union all
    select count(*)::bigint
    from filtered
    cross join input_state i
    where i.has_filters
    having (select has_filters from input_state)
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

revoke all on function public.radar_authorized_voter_directory_v1(text, text, text, text, integer, integer, text, text, text, integer, integer) from public, anon;
grant execute on function public.radar_authorized_voter_directory_v1(text, text, text, text, integer, integer, text, text, text, integer, integer) to authenticated;

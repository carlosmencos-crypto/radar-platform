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
  p_responsible uuid default null,
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
      or nullif(btrim(p_status),'') is not null or nullif(btrim(p_affiliation),'') is not null
      or nullif(btrim(p_role),'') is not null or p_responsible is not null) has_filters
  ), authorized as materialized (
    select ctx.campaign_id from public.radar_authorized_context_v2('municipality',p_municipality_code) ctx
    where ctx.campaign_id is not null
      and private.is_campaign_member(ctx.campaign_id,array['campaign_admin','campaign_editor','campaign_viewer'])
    limit 1
  ), filtered as materialized (
    select v.* from campaign_vault.voter_directory v join authorized a on a.campaign_id=v.campaign_id
    where (nullif(btrim(p_query),'') is null
      or lower(v.full_name) like '%'||lower(btrim(p_query))||'%'
      or lower(v.full_name) operator(extensions.%) lower(btrim(p_query)))
      and (nullif(regexp_replace(coalesce(p_dpi,''),'\D','','g'),'') is null or regexp_replace(coalesce(v.identification,''),'\D','','g')=regexp_replace(p_dpi,'\D','','g'))
      and (nullif(btrim(p_community),'') is null or v.community=p_community)
      and (p_age_min is null or v.estimated_age_2026>=p_age_min)
      and (p_age_max is null or v.estimated_age_2026<=p_age_max)
      and (nullif(btrim(p_status),'') is null or v.contact_status=upper(p_status))
      and (nullif(btrim(p_affiliation),'') is null or v.party_affiliation=upper(p_affiliation))
      and (nullif(btrim(p_role),'') is null or v.campaign_role ilike '%'||btrim(p_role)||'%')
      and (p_responsible is null or v.assigned_contact_id=p_responsible)
  ), totals as (
    select s.total_count from authorized a
    join campaign_vault.voter_directory_stats s on s.campaign_id=a.campaign_id
    cross join input_state i where not i.has_filters
    union all
    select count(*)::bigint from filtered cross join input_state i
    where i.has_filters having (select has_filters from input_state)
  ), page_rows as (
    select v.*,case when nullif(btrim(p_query),'') is null then 0 else similarity(lower(v.full_name),lower(btrim(p_query))) end match_rank
    from filtered v
    order by
      case when nullif(btrim(p_query),'') is null then 0 else similarity(lower(v.full_name),lower(btrim(p_query))) end desc,
      case when nullif(btrim(p_query),'') is null then v.source_row end,
      case when nullif(btrim(p_query),'') is not null then v.full_name end,
      v.id
    offset greatest(coalesce(p_offset,0),0)
    limit least(greatest(coalesce(p_limit,25),1),50)
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

revoke all on function public.radar_authorized_voter_directory_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) from public, anon;
grant execute on function public.radar_authorized_voter_directory_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) to authenticated;

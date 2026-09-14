create or replace function public.radar_authorized_voter_communities(p_municipality_code text)
returns table(
  municipality_code text,
  community_label text,
  community_normalized text,
  elector_count integer,
  average_age_base numeric,
  age_18_29 integer,
  age_30_44 integer,
  age_45_59 integer,
  age_60_plus integer,
  coverage_band text
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, data_vault, pg_temp
as $$
  with authorized as (
    select municipality_id, municipality_code
    from private.radar_authorized_context_v2('municipality', p_municipality_code)
    limit 1
  )
  select
    a.municipality_code,
    v.community_label,
    v.community_normalized,
    v.elector_count,
    v.average_age_base,
    v.age_18_29,
    v.age_30_44,
    v.age_45_59,
    v.age_60_plus,
    v.coverage_band
  from authorized a
  join data_vault.voter_roll_community_aggregates v
    on v.municipality_id = a.municipality_id
   and v.source_year = 2023
  order by v.elector_count desc, v.community_label;
$$;

revoke all on function public.radar_authorized_voter_communities(text) from public;
grant execute on function public.radar_authorized_voter_communities(text) to authenticated;

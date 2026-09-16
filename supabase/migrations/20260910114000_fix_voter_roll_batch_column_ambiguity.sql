create or replace function private.apply_voter_roll_community_batch(p_batch_id text)
returns table (
  municipality_code text,
  staged_rows bigint,
  target_rows bigint,
  staged_electors bigint,
  target_electors bigint,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, data_vault, private
as $$
declare
  v_bad_count integer;
begin
  if p_batch_id is null or btrim(p_batch_id) = '' then
    raise exception 'batch_id is required';
  end if;

  if not exists (
    select 1 from private.stg_voter_roll_community_aggregates s
    where s.batch_id = p_batch_id
  ) then
    raise exception 'batch % has no staged rows', p_batch_id;
  end if;

  select count(*) into v_bad_count
  from (
    select s.municipality_code
    from private.stg_voter_roll_community_aggregates s
    left join public.municipalities m on m.municipality_code = s.municipality_code
    where s.batch_id = p_batch_id
    group by s.municipality_code
    having count(distinct m.id) <> 1
  ) q;
  if v_bad_count <> 0 then
    raise exception 'batch % contains unresolved municipality codes', p_batch_id;
  end if;

  select count(*) into v_bad_count
  from (
    select s.municipality_code, s.source_year
    from private.stg_voter_roll_community_aggregates s
    join public.municipalities m on m.municipality_code = s.municipality_code
    left join data_vault.voter_roll_municipal_aggregates a
      on a.municipality_id = m.id and a.source_year = s.source_year
    where s.batch_id = p_batch_id
    group by s.municipality_code, s.source_year,
      a.municipality_id, a.community_count, a.elector_count,
      a.age_18_29, a.age_30_44, a.age_45_59, a.age_60_plus, a.age_missing_count
    having a.municipality_id is null
       or count(*) <> a.community_count
       or sum(s.elector_count) <> a.elector_count
       or sum(s.age_18_29) <> a.age_18_29
       or sum(s.age_30_44) <> a.age_30_44
       or sum(s.age_45_59) <> a.age_45_59
       or sum(s.age_60_plus) <> a.age_60_plus
       or sum(s.age_unclassified_count) <> a.age_missing_count
       or sum(s.age_18_29+s.age_30_44+s.age_45_59+s.age_60_plus+s.age_unclassified_count) <> sum(s.elector_count)
  ) q;
  if v_bad_count <> 0 then
    raise exception 'batch % failed pre-upsert reconciliation for % municipality set(s)', p_batch_id, v_bad_count;
  end if;

  insert into data_vault.voter_roll_community_aggregates (
    municipality_id,source_year,community_normalized,community_label,elector_count,average_age_base,
    age_18_29,age_30_44,age_45_59,age_60_plus,age_unclassified_count,coverage_band,updated_at
  )
  select m.id,s.source_year,s.community_normalized,s.community_label,s.elector_count,s.average_age_base,
         s.age_18_29,s.age_30_44,s.age_45_59,s.age_60_plus,s.age_unclassified_count,'COMMUNITY',now()
  from private.stg_voter_roll_community_aggregates s
  join public.municipalities m on m.municipality_code=s.municipality_code
  where s.batch_id=p_batch_id
  on conflict (municipality_id,source_year,community_normalized) do update set
    community_label=excluded.community_label,
    elector_count=excluded.elector_count,
    average_age_base=excluded.average_age_base,
    age_18_29=excluded.age_18_29,
    age_30_44=excluded.age_30_44,
    age_45_59=excluded.age_45_59,
    age_60_plus=excluded.age_60_plus,
    age_unclassified_count=excluded.age_unclassified_count,
    coverage_band=excluded.coverage_band,
    updated_at=now();

  select count(*) into v_bad_count
  from (
    select b.municipality_code,b.source_year
    from (
      select distinct s.municipality_code,s.source_year
      from private.stg_voter_roll_community_aggregates s
      where s.batch_id=p_batch_id
    ) b
    join public.municipalities m on m.municipality_code=b.municipality_code
    join data_vault.voter_roll_municipal_aggregates a
      on a.municipality_id=m.id and a.source_year=b.source_year
    left join lateral (
      select count(*)::bigint as target_rows,
             coalesce(sum(t.elector_count),0)::bigint as electors,
             coalesce(sum(t.age_18_29),0)::bigint as a18,
             coalesce(sum(t.age_30_44),0)::bigint as a30,
             coalesce(sum(t.age_45_59),0)::bigint as a45,
             coalesce(sum(t.age_60_plus),0)::bigint as a60,
             coalesce(sum(t.age_unclassified_count),0)::bigint as amiss
      from data_vault.voter_roll_community_aggregates t
      where t.municipality_id=m.id and t.source_year=b.source_year
    ) x on true
    where x.target_rows <> a.community_count
       or x.electors <> a.elector_count
       or x.a18 <> a.age_18_29
       or x.a30 <> a.age_30_44
       or x.a45 <> a.age_45_59
       or x.a60 <> a.age_60_plus
       or x.amiss <> a.age_missing_count
  ) q;
  if v_bad_count <> 0 then
    raise exception 'batch % failed post-upsert reconciliation for % municipality set(s)', p_batch_id, v_bad_count;
  end if;

  return query
  select s.municipality_code,
         count(*)::bigint,
         count(t.*)::bigint,
         sum(s.elector_count)::bigint,
         sum(t.elector_count)::bigint,
         'PASS'::text
  from private.stg_voter_roll_community_aggregates s
  join public.municipalities m on m.municipality_code=s.municipality_code
  join data_vault.voter_roll_community_aggregates t
    on t.municipality_id=m.id
   and t.source_year=s.source_year
   and t.community_normalized=s.community_normalized
  where s.batch_id=p_batch_id
  group by s.municipality_code
  order by s.municipality_code;
end;
$$;

revoke all on function private.apply_voter_roll_community_batch(text) from public, anon, authenticated;

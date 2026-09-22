#!/usr/bin/env python3
"""Emit a fail-closed activation transaction from the public source report.

This does not connect to the database. Execute the emitted SQL only after upload.
No names, identity numbers or access tokens are included in the transaction.
"""
import json
from pathlib import Path
import re

report = json.loads((Path(__file__).resolve().parents[1] / "docs/qa/national-nominal-source-report.json").read_text())
counts = report["municipal_counts"]
assert report["status"] == "PASS" and report["source_year"] == 2023
assert re.fullmatch(r"[a-f0-9]{64}", report["source_sha256"])
assert len(counts) == 340 and all(re.fullmatch(r"[0-9]{4}", code) for code in counts)
assert all(isinstance(count, int) and count > 0 for count in counts.values())
assert sum(counts.values()) == report["total_rows"]

print(f"""begin;
do $activate$
declare
  source campaign_vault.national_register_sources%rowtype;
  expected jsonb := '{json.dumps(counts, separators=(',', ':'))}'::jsonb;
  actual jsonb; total bigint; duplicates bigint; empty_ages bigint; range_ages bigint;
begin
  select * into strict source from campaign_vault.national_register_sources
    where source_sha256='{report['source_sha256']}' for update;
  if source.expected_rows <> {report['total_rows']} or source.source_year <> 2023 then
    raise exception 'Source identity mismatch';
  end if;
  perform 1 from campaign_vault.national_register_batches where source_id=source.id for update;
  if (select count(*) from campaign_vault.national_register_batches where source_id=source.id) <> 895
    or exists(select 1 from campaign_vault.national_register_batches where source_id=source.id and loaded_at is null)
    or (select sum(expected_rows) from campaign_vault.national_register_batches where source_id=source.id) <> source.expected_rows then
    raise exception 'Import manifest is incomplete';
  end if;
  select count(*),count(*) filter(where age_base is null),
    count(*) filter(where age_base is not null and age_base not between 18 and 110)
    into total,empty_ages,range_ages
    from campaign_vault.national_register_2023 where source_id=source.id;
  if total <> source.expected_rows or empty_ages <> {report['quality']['AGE_EMPTY']}
    or range_ages <> {report['quality']['AGE_RANGE']} then
    raise exception 'Source totals or age flags do not reconcile';
  end if;
  if exists(select 1 from campaign_vault.national_register_2023 r
    join public.municipalities m on m.id=r.municipality_id
    where r.source_id=source.id and (m.country_code<>'GT' or m.is_synthetic or m.municipality_code<>r.municipality_code)) then
    raise exception 'Cross-municipality source association';
  end if;
  select count(*) into duplicates from (
    select identification from campaign_vault.national_register_2023 where source_id=source.id
    group by identification having count(*)>1
  ) d;
  if duplicates <> {report['duplicate_identity_groups']} then
    raise exception 'Preserved duplicate groups do not reconcile';
  end if;
  insert into campaign_vault.national_register_municipal_stats
    (source_id,municipality_id,municipality_code,total_count,communities)
  select source.id,municipality_id,municipality_code,sum(community_total),
    coalesce(jsonb_agg(community order by community) filter(where community<>''),'[]'::jsonb)
  from (select municipality_id,municipality_code,community,count(*) community_total
    from campaign_vault.national_register_2023 where source_id=source.id
    group by municipality_id,municipality_code,community) grouped
  group by municipality_id,municipality_code
  on conflict(source_id,municipality_id) do update set
    municipality_code=excluded.municipality_code,total_count=excluded.total_count,communities=excluded.communities;
  select jsonb_object_agg(municipality_code,total_count) into actual
    from campaign_vault.national_register_municipal_stats where source_id=source.id;
  if actual is distinct from expected then
    raise exception 'Municipal source counts do not reconcile';
  end if;
  update campaign_vault.national_register_sources
    set active=true,import_closed_at=coalesce(import_closed_at,now()) where id=source.id;
end;
$activate$;
commit;
""")

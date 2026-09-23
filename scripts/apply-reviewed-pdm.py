#!/usr/bin/env python3
"""Import explicit semantic reviews into the shared national data contract.

Anchors check location only: they never generate claims or mark a plan complete.
Reviewers must read each claim in its table/paragraph context before adding it.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--sources', type=Path, required=True)
parser.add_argument('--migration', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
reviews = json.loads((root / 'supabase/fixtures/pdm-semantic-reviews.json').read_text())
fixture = root / 'supabase/fixtures/municipal-public-depth.json'
rows = json.loads(fixture.read_text())
by_code = {r['municipality_code']: r for r in rows}
normalize = lambda s: re.sub(r'\s+', ' ', s).strip()
sql_rows = []
skipped = []
for review in reviews:
    code = review['municipality_code']
    planning = by_code[code]['planning']
    assert planning['document']['file_id'] == review['file_id']
    assert review['review_scope'] == 'HISTORICAL_PLAN_DIAGNOSIS'
    entries = []
    for kind, label, page, anchor in review['priorities']:
        assert kind in ('PROBLEMA', 'POTENCIALIDAD') and isinstance(page, int) and page > 0
        entries.append({
            'municipality_code': code, 'kind': kind, 'label': label, 'pdf_page': page,
            'source_id': f'GT-SEGEPLAN-PDMOT-{code}-001', 'status': 'SOURCE_VERIFIED',
            'evidence_kind': 'DIRECT_PDF_REVIEW', 'evidence_scope': review['review_scope'],
            'source_pdf_sha256': review['pdf_sha256'], 'readable_export_sha256': review['layout_sha256'],
            'product_id': 'RADAR-PDM-SEMANTIC-REVIEW-V1', 'product_url': planning['document']['url'],
        })
    prior = planning['priorities']
    if (prior == entries and planning.get('review_notes') == review['exclusions']
            and planning['review_status'] == 'PARTIAL_VALIDATED_CONTENT'):
        skipped.append(code)
        continue
    assert not prior, 'Existing review differs: reconcile it explicitly instead of overwriting'
    for ext, key in [('pdf', 'pdf_sha256'), ('layout.txt', 'layout_sha256')]:
        path = args.sources / (f'{code}.pdf' if ext == 'pdf' else f'{code}-layout.txt')
        assert hashlib.sha256(path.read_bytes()).hexdigest() == review[key], code
    pages = (args.sources / f'{code}-layout.txt').read_text().split('\f')
    for _, _, page, anchor in review['priorities']:
        assert normalize(anchor) in normalize(pages[page - 1]), f'Source anchor mismatch: {code} / {page}'
    planning['priorities'] = entries
    planning['review_notes'] = review['exclusions']
    planning['review_status'] = 'PARTIAL_VALIDATED_CONTENT'
    quote = lambda value: "'" + value.replace("'", "''") + "'"
    sql_rows.append('(' + ','.join([quote(code), quote(review['file_id']), quote(json.dumps(entries, ensure_ascii=False))+'::jsonb', quote(json.dumps(review['exclusions'], ensure_ascii=False))+'::jsonb']) + ')')
if not sql_rows:
    print(json.dumps({'new_reviews': 0, 'already_integrated': skipped, 'writes': 0}))
    raise SystemExit(0)
fixture.write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n')
args.migration.write_text('''-- Reviewed historical plan diagnoses, not current measurements or acceptance.
-- Preserve original source observations, unresolved dates, and all other data.
do $migration$
declare changed integer;
begin
  with reviewed(code, file_id, priorities, notes) as (values
''' + ',\n'.join(sql_rows) + '''
  )
  update data_vault.municipality_intelligence_profiles_v1 p
  set profile=jsonb_set(jsonb_set(jsonb_set(p.profile,
    '{public_context,planning,priorities}',r.priorities),
    '{public_context,planning,review_notes}',r.notes),
    '{public_context,planning,review_status}','"PARTIAL_VALIDATED_CONTENT"'::jsonb),updated_at=now()
  from reviewed r, public.municipalities m
  where m.country_code='GT' and not m.is_synthetic and m.municipality_code=r.code
    and p.municipality_id=m.id and p.country_code=m.country_code
    and p.profile->>'municipality_code'=r.code
    and p.profile#>>'{public_context,planning,municipality_code}'=r.code
    and p.profile#>>'{public_context,planning,document,file_id}'=r.file_id
    and p.profile#>'{public_context,planning,priorities}'='[]'::jsonb;
  get diagnostics changed=row_count;
  if changed <> ''' + str(len(sql_rows)) + ''' then raise exception 'PDM_REVIEW_CONCURRENT_CHANGE_OR_SCOPE_MISMATCH_%', changed; end if;
end $migration$;
''')
print(json.dumps({'new_reviews':len(sql_rows),'already_integrated':skipped,'national_acceptance':'OPEN'}))

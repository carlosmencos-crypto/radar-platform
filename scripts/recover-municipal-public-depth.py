#!/usr/bin/env python3
"""Reuse existing validated Vault products; never promote lexical PDM counts.

Inputs are the readable exports of the named Vault workbooks and the preserved
DR-102 index. No extraction, network calls, source edits or inferred indicators.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path


def table(text, key, required):
    matches = []
    for sheet in text.split('\f'):
        rows = list(csv.reader(io.StringIO(sheet)))
        for i, row in enumerate(rows):
            if key in row and required in row:
                matches.append([dict(zip(row[1:], value[1:])) for value in rows[i+1:] if len(value) > 1 and value[1]])
                break
    if len(matches) != 1:
        raise ValueError(f'Ambiguous source table: {key}/{required}')
    return matches[0]


def number(value):
    return None if value in ('', None) else float(value)


def build(source_dir, index):
    def read(name):
        return (source_dir / f'{name}.txt').read_text()
    products = {
        'poverty': ('GT_SEGEPLAN_2023_MAPAS_POBREZA_MUNICIPAL_340_DASHBOARD_READY_v1', '1ZiPFKH3sHWjKqgI7Hpzv4uuQw1PKIpac'),
        'pdm-indicators': ('GT_SEGEPLAN_2019_INFRAESTRUCTURA_PRIORITARIA_0509_CLEAN_v1', '17C8sS9MS0o1qdbdZeu6-KNaYa73gydmp'),
        'pdm-priorities': ('GT_SEGEPLAN_PDMOT_ESCUINTLA_PRIORIDAD3_DASHBOARD_READY_v1', '19lzoDvf9xQ8256mRGk7mqj-wsIEng2b9'),
    }
    provenance = {key: {'product_id': name, 'product_url': f'https://docs.google.com/spreadsheets/d/{drive_id}/edit',
                         'readable_export_sha256': hashlib.sha256(read(key).encode()).hexdigest()}
                  for key, (name, drive_id) in products.items()}
    poverty = table(read('poverty'), 'codigo_municipal', 'data_status')
    indicators = table(read('pdm-indicators'), 'municipality_code', 'indicator_id')
    priorities = table(read('pdm-priorities'), 'municipality_code', 'priority_type')
    assert len(poverty) == 340 and len({r['codigo_municipal'] for r in poverty}) == 340
    assert sum(r['pobreza_extrema_pct'] == '' for r in poverty) == 23
    assert len(indicators) == 12 and len(priorities) == 36
    catalog = {row['municipality_code']: row for row in index['municipalities']}
    assert set(catalog) == {row['codigo_municipal'] for row in poverty}
    result = []
    for row in poverty:
        code = row['codigo_municipal']
        assert row['data_status'] == 'VALIDATED_MODELED_ESTIMATE' and row['periodo'] == '2023'
        source = catalog[code]
        document = {k: source.get(k) for k in ('file_id', 'file_name', 'document_type', 'publication_year',
                    'plan_start', 'plan_end', 'horizon_status', 'source_qa', 'source_observation', 'coverage_status')}
        # A valid document link is independently derived from the inventory ID;
        # it is not evidence that the document's semantic review has finished.
        document['url'] = f"https://drive.google.com/file/d/{source['file_id']}/view" if source.get('file_id') else None
        out = {'schema_version': 1, 'municipality_code': code,
               'poverty': {'municipality_code': code, 'period': 2023, 'status': row['data_status'],
                  'source_id': row['source_id'], **provenance['poverty'],
                  'general_pct': number(row['pobreza_general_pct']),
                  'extreme_pct': number(row['pobreza_extrema_pct']),
                  'general_population': number(row['poblacion_pobreza_general']),
                  'extreme_population': number(row['poblacion_pobreza_extrema']),
                  'gap_pct': number(row['brecha_general_pct']),
                  'consumption_per_capita_month_gtq': number(row['consumo_promedio_q_mes']),
                  'national_rank': number(row['rank_pobreza_general_nacional'])},
               'planning': {'municipality_code': code, 'catalog_product_id': index['product_id'],
                            'document': document, 'priorities': [], 'indicators': [],
                            'review_status': 'PENDING_SEMANTIC_REVIEW' if source.get('file_id') else 'NO_DOCUMENT_IN_INVENTORY'}}
        for r in priorities:
            if r['municipality_code'] != code:
                continue
            assert r['quality_flag'] == 'SOURCE_VERIFIED'
            assert r['source_id'] == f'GT-SEGEPLAN-PDMOT-{code}-001'
            out['planning']['priorities'].append({
                'municipality_code': code, 'kind': r['priority_type'], 'label': r['priority_label'],
                'pdf_page': int(r['pdf_page']), 'source_id': r['source_id'], 'status': r['quality_flag'],
                **provenance['pdm-priorities']})
        for r in indicators:
            if r['municipality_code'] != code:
                continue
            assert r['validation_status'] == 'VALIDATED_PDM_BASELINE' and r['coverage_level'] == 'MUNICIPAL'
            assert r['source_id'] == f'GT-SEGEPLAN-PDMOT-{code}-001'
            out['planning']['indicators'].append({
                'municipality_code': code, 'id': r['indicator_id'], 'theme': r['theme'], 'label': r['indicator_name'],
                'baseline': number(r['baseline_value']), 'baseline_unit': r['baseline_unit'],
                'baseline_year': number(r['baseline_year']), 'target': number(r['target_value']), 'target_unit': r['target_unit'],
                # The source does not assign a year to every individual target.
                'target_year': None, 'source_id': r['source_id'], 'reference': r['source_reference'],
                'status': r['validation_status'], 'note': r['note'], **provenance['pdm-indicators']})
        if out['planning']['priorities'] or out['planning']['indicators']:
            out['planning']['review_status'] = 'PARTIAL_VALIDATED_CONTENT'
        assert 0 <= out['poverty']['general_pct'] <= 100
        assert out['poverty']['extreme_pct'] is None or 0 <= out['poverty']['extreme_pct'] <= out['poverty']['general_pct']
        result.append(out)
    return result


def migration(rows):
    values = ',\n'.join("('%s', '%s'::jsonb)" % (r['municipality_code'], json.dumps(r, ensure_ascii=False, separators=(',', ':')).replace("'", "''")) for r in rows)
    sql = """-- Reuse accepted Vault products without modifying original sources or readiness.
-- DR-102 lexical signals are intentionally excluded. Five document absences,
-- 128 unresolved source discrepancies and partial semantic status are preserved.
do $migration$
declare changed integer;
begin
  with source_rows(code, context) as (values
""" + values + """
  )
  update data_vault.municipality_intelligence_profiles_v1 p
  set profile = jsonb_set(p.profile, '{public_context}', s.context, true), updated_at = now()
  from source_rows s, public.municipalities m
  where m.country_code = 'GT' and not m.is_synthetic and m.municipality_code = s.code
    and p.municipality_id = m.id and p.country_code = m.country_code
    and p.profile->>'municipality_code' = s.code;
  get diagnostics changed = row_count;
  if changed <> 340 then raise exception 'PUBLIC_DEPTH_EXPECTED_340_GOT_%', changed; end if;
end $migration$;
"""
    return sql.replace("changed <> 340", f"changed <> {len(rows)}").replace("PUBLIC_DEPTH_EXPECTED_340", f"PUBLIC_DEPTH_EXPECTED_{len(rows)}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--migration', type=Path, required=True, nargs='+')
    args = parser.parse_args()
    rows = build(args.source_dir, json.loads(args.index.read_text()))
    args.fixture.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
    assert len(rows) % len(args.migration) == 0
    batch = len(rows) // len(args.migration)
    for i, target in enumerate(args.migration):
        target.write_text(migration(rows[i * batch:(i + 1) * batch]))
    print(json.dumps({'municipalities': len(rows), 'poverty_extreme_unavailable': sum(r['poverty']['extreme_pct'] is None for r in rows),
                      'pdm_priorities': sum(len(r['planning']['priorities']) for r in rows),
                      'pdm_indicators': sum(len(r['planning']['indicators']) for r in rows),
                      'pdm_partial_municipalities': sum(r['planning']['review_status'] == 'PARTIAL_VALIDATED_CONTENT' for r in rows)}))

#!/usr/bin/env python3
"""Read-only reconciliation of retained public planning products against fixtures.

Does not extract PDFs, infer diagnoses, change runtime data or grant acceptance.
Readable exports are intermediate inputs; their hashes are not binary file hashes.
"""
import argparse
import collections
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def reconcile(sources, index_path):
    spec = importlib.util.spec_from_file_location('recovery', ROOT / 'scripts/recover-municipal-public-depth.py')
    recovery = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recovery)
    index = json.loads(index_path.read_text())
    original = recovery.build(sources, index)
    current_path = ROOT / 'supabase/fixtures/municipal-public-depth.json'
    current = json.loads(current_path.read_text())
    by_code = {r['municipality_code']: r for r in current}
    if len(current) != 340 or len(by_code) != 340:
        raise ValueError('Expected 340 unique municipal fixture rows')
    catalog = recovery.table((sources / 'catalog-current.txt').read_text(), 'municipality_code', 'coverage_status')
    catalog_by_code = {r['municipality_code']: r for r in catalog}
    if len(catalog) != 340 or set(catalog_by_code) != set(by_code):
        raise ValueError('Catalog and fixture municipal universes differ')
    master = recovery.table((sources / 'master.txt').read_text(), 'source_id', 'validation_status')
    plans = [r for r in master if r['source_id'].startswith('GT-SEGEPLAN-PDM')]
    master_by_code = {r['municipality_code']: r for r in plans}
    if len(plans) != 335 or len(master_by_code) != 335:
        raise ValueError('Retained master does not contain 335 unique plans')
    errors, municipal = [], []
    reused_priorities = reused_indicators = 0
    for baseline in original:
        code = baseline['municipality_code']
        row = by_code[code]
        plan = row['planning']
        if row['poverty'] != baseline['poverty']:
            errors.append([code, 'retained_poverty_differs'])
        if plan['municipality_code'] != code:
            errors.append([code, 'planning_code_mismatch'])
        if (plan['document'].get('file_id') or '') != catalog_by_code[code]['file_id']:
            errors.append([code, 'catalog_file_id_mismatch'])
        for kind in ('priorities', 'indicators'):
            for entry in baseline['planning'][kind]:
                if entry not in plan[kind]:
                    errors.append([code, 'retained_entry_missing', kind])
            for entry in plan[kind]:
                if entry['municipality_code'] != code:
                    errors.append([code, 'foreign_entry', kind])
        reused_priorities += len(baseline['planning']['priorities'])
        reused_indicators += len(baseline['planning']['indicators'])
        municipal.append({
            'municipality_code': code,
            'file_id': plan['document'].get('file_id'),
            'master_validation_status': master_by_code.get(code, {}).get('validation_status'),
            'fixture_review_status': plan['review_status'],
            'retained_priorities_matched': len(baseline['planning']['priorities']),
            'retained_indicators_matched': len(baseline['planning']['indicators']),
            'integrated_priorities': len(plan['priorities']),
            'integrated_indicators': len(plan['indicators']),
        })
    inputs = {name: hashlib.sha256((sources / name).read_bytes()).hexdigest()
              for name in ('master.txt', 'catalog-current.txt', 'audit-v2.txt', 'poverty.txt', 'pdm-priorities.txt', 'pdm-indicators.txt')}
    return {
        'schema_version': 1,
        'checked_on': '2026-09-24',
        'published_code_reference': '73b0091a0ff30d6673c568ee300e11ddd0f9ea13',
        'scope': 'Retained public products versus repository fixture; not a live database or UI acceptance test',
        'limits': [
            'The retained master is v1.60 (2026-07-29); it is not a claim about all later Vault products.',
            'The current Drive catalog explicitly validates document availability, not internal PDF content.',
            'Search discovery is not proof that no other semantic product exists.',
            'Unreviewed available content is not institutionally unavailable.',
            'A partial plan must not be marked complete because its existing entries match.',
        ],
        'input_readable_export_sha256': inputs,
        'index_sha256': hashlib.sha256(index_path.read_bytes()).hexdigest(),
        'fixture_sha256': hashlib.sha256(current_path.read_bytes()).hexdigest(),
        'summary': {
            'municipalities': len(current),
            'master_plan_statuses': dict(collections.Counter(r['validation_status'] for r in plans)),
            'fixture_plan_statuses': dict(collections.Counter(r['planning']['review_status'] for r in current)),
            'retained_priorities_matched': reused_priorities,
            'retained_indicators_matched': reused_indicators,
            'integrated_priorities': sum(len(r['planning']['priorities']) for r in current),
            'integrated_indicators': sum(len(r['planning']['indicators']) for r in current),
            'mismatches': len(errors),
        },
        'mismatches': errors,
        'municipalities': municipal,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--index', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = reconcile(args.sources, args.index)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['summary'], ensure_ascii=False))
    raise SystemExit(bool(result['mismatches']))

#!/usr/bin/env python3
"""Reuse the preserved INE EGM CLEAN export, never cached dashboard formulas."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path


def table(text, key, required):
    matches = []
    for sheet in text.split('\f'):
        rows = list(csv.reader(io.StringIO(sheet)))
        for i, row in enumerate(rows):
            if key in row and required in row:
                matches.append([dict(zip(row[1:], v[1:])) for v in rows[i+1:] if len(v) > 1 and v[1]])
                break
    if len(matches) != 1:
        raise ValueError('Missing or ambiguous source table')
    return matches[0]


def build(path):
    content = path.read_text()
    source_hash = hashlib.sha256(content.encode()).hexdigest()
    rows = table(content, 'indicator_code', 'value')
    municipalities = {}
    for row in rows:
        code = row['codigo_municipal']
        assert len(code) == 4 and code.isdigit() and row['anio'] == '2024'
        assert row['source_id'] == f'GT-INE-EGM-2024-{code[:2]}-XLSX-001'
        value = float(row['value']) if row['value'] else None
        assert (value is not None) == (row['status'] == 'VALIDATED')
        assert value is None or (math.isfinite(value) and value >= 0)
        entry = municipalities.setdefault(code, {
            'schema_version': 1, 'municipality_code': code, 'year': 2024,
            'product_url': 'https://docs.google.com/spreadsheets/d/1R1oecrZn0YbySHTB2hepoMlj5PHV02uA/edit',
            'validation_url': 'https://docs.google.com/spreadsheets/d/1cwnk1V4CfLhC-d7ruu8OpGcvTIyPFrST/edit',
            'readable_export_sha256': source_hash, 'source_id': row['source_id'],
            'source_file': row['source_file'], 'source_sheet': row['source_sheet'],
            'indicators': [],
        })
        assert all(entry[k] == row[k] for k in ('source_id', 'source_file', 'source_sheet'))
        entry['indicators'].append({
            'code': row['indicator_code'], 'label': row['indicator_name'], 'unit': row['unit'],
            'value': value, 'status': row['status'], 'source_table': row['source_table'],
            'source_row': int(row['source_row']) if row['source_row'] else None, 'note': row['note'],
        })
    assert len(municipalities) == 340 and len(rows) == 7820
    for entry in municipalities.values():
        assert len(entry['indicators']) == len({r['code'] for r in entry['indicators']}) == 23
        entry['caveats'] = ['Registros administrativos y proyecciones de 2024; no equivalen al padrón electoral ni a tasas de incidencia. Los vacíos y las declaraciones de ausencia de registros no se convierten en cero.']
        if entry['municipality_code'] == '1002':
            entry['caveats'].append('La fuente registra 35,314 habitantes, pero sus grupos de edad suman 39,280. Inconsistencia oficial conservada; no se publican tasas derivadas.')
        if entry['municipality_code'] == '1201':
            entry['caveats'].append('El cuadro de tránsito está rotulado para San José el Rodeo. Sus tres valores se excluyen de San Marcos.')
    assert sum(r['value'] is None for e in municipalities.values() for r in e['indicators']) == 1249
    return sorted(municipalities.values(), key=lambda r: r['municipality_code'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--migration', type=Path, nargs='+')
    args = parser.parse_args()
    rows = build(args.source)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + '\n')
    if args.migration:
      assert 340 % len(args.migration) == 0
      batch = 340 // len(args.migration)
      for i, target in enumerate(args.migration):
        values = ',\n'.join("('%s','%s'::jsonb)" % (r['municipality_code'], json.dumps(r, ensure_ascii=False, separators=(',', ':')).replace("'", "''")) for r in rows[i*batch:(i+1)*batch])
        target.write_text(('''-- Reuse INE EGM CLEAN; preserve 1249 missing values and documented exceptions.
-- No readiness changes, no new extraction, no derived rates.
do $migration$
declare changed integer;
begin
  with source_rows(code, context) as (values
''' + values + '''
  )
  update data_vault.municipality_intelligence_profiles_v1 p
  set profile = jsonb_set(p.profile, '{egm_2024}', s.context, true), updated_at = now()
  from source_rows s, public.municipalities m
  where m.country_code = 'GT' and not m.is_synthetic and m.municipality_code = s.code
    and p.municipality_id = m.id and p.country_code = m.country_code
    and p.profile->>'municipality_code' = s.code;
  get diagnostics changed = row_count;
  if changed <> 340 then raise exception 'EGM_EXPECTED_340_GOT_%', changed; end if;
end $migration$;
''').replace('changed <> 340', f'changed <> {batch}').replace('EGM_EXPECTED_340', f'EGM_EXPECTED_{batch}'))

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { municipalEgm } from '../src/data/municipalEgm.ts';
const rows = JSON.parse(fs.readFileSync(new URL('../supabase/fixtures/municipal-egm.json', import.meta.url), 'utf8'));
test('EGM covers 340 distinct municipalities without replacing 1249 source gaps with zero', () => {
  assert.equal(rows.length, 340);
  assert.equal(new Set(rows.map(r => r.municipality_code)).size, 340);
  assert.equal(rows.flatMap(r => r.indicators).filter(r => r.value === null).length, 1249);
  assert.equal(rows.flatMap(r => r.indicators).filter(r => r.status === 'VALIDATED').length, 6571);
  for (const row of rows) {
    assert.deepEqual(municipalEgm(row, row.municipality_code), row);
    assert.equal(municipalEgm(row, row.municipality_code === '0101' ? '0509' : '0101'), null);
  }
});
test('source exceptions stay explicit and invalid values fail closed', () => {
  const capital = rows.find(r => r.municipality_code === '0101');
  assert.equal(capital.indicators.find(r => r.code === 'VCM_MUJERES_AGRAVIADAS_TOTAL').value, null);
  const sanMarcos = rows.find(r => r.municipality_code === '1201');
  assert.equal(sanMarcos.indicators.filter(r => r.status === 'SOURCE_WRONG_MUNICIPALITY_LABEL').length, 3);
  assert.match(rows.find(r => r.municipality_code === '1002').caveats.join(' '), /39,280/);
  for (const value of [NaN, Infinity, -1, '0']) {
    const invalid = structuredClone(capital); invalid.indicators[0].value = value;
    assert.equal(municipalEgm(invalid, '0101'), null);
  }
  const invalid = structuredClone(capital);
  invalid.indicators.find(r => r.value === null).value = 0;
  assert.equal(municipalEgm(invalid, '0101'), null);
  const zero = structuredClone(capital); zero.indicators[0].value = 0;
  assert.equal(municipalEgm(zero, '0101').indicators[0].value, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fiscalJrvCoverage } from '../src/data/fiscalJrvCoverage.ts';
import { adaptAuthorizedElectoralTerritoryLayers as adapt } from '../src/data/v70ElectoralAdapter.ts';

const assignment = (center, jrv, changes = {}) => ({
  campaign_id: 'campaign-a', category: 'ASIGNACION_JRV',
  payload: { center_id: center, jrv, fiscal_id: 'fiscal-a' }, ...changes,
});

test('all 340 current municipal JRV universes reconcile without crossings', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../scripts/fixtures/public-national-jrv-coverage.json', import.meta.url)));
  assert.equal(fixture.municipalities.length, 340);
  assert.equal(new Set(fixture.municipalities.map(row => row.municipality_code)).size, 340);
  for (const row of fixture.municipalities) {
    assert.equal(row.source_code, row.municipality_code);
    const records = row.centers.flatMap(center => center.jrvRange.split(/[;,]+/).flatMap(segment => {
      const [start, end = start] = segment.trim().split('-').map(Number);
      return Array.from({ length: end - start + 1 }, (_, index) => assignment(center.id, start + index));
    }));
    const complete = fiscalJrvCoverage(row.centers, records, 'campaign-a');
    assert.ok(complete.total > 0, row.municipality_code);
    assert.equal(complete.covered, complete.total, row.municipality_code);
    assert.equal(complete.percent, 100, row.municipality_code);
    assert.equal(fiscalJrvCoverage(row.centers, [...records, ...records], 'campaign-a').covered, complete.total);
    assert.equal(fiscalJrvCoverage(row.centers, records, 'other-campaign').covered, 0);
    assert.equal(fiscalJrvCoverage(row.centers, [], 'campaign-a').percent, 0);
  }
});

test('coverage counts unique valid tables only in the current campaign', () => {
  const centers = [{ id: 'a', jrv: 3, jrvRange: '10-11; 15' }];
  const records = [assignment('a', 10), assignment('a', '010'), assignment('a', 15),
    assignment('a', 12), assignment('other', 11),
    assignment('a', 11, { campaign_id: 'campaign-b' }),
    assignment('a', 11, { payload: { center_id: 'a', jrv: 11, fiscal_id: '' } })];
  const coverage = fiscalJrvCoverage(centers, records, 'campaign-a');
  assert.equal(coverage.covered, 2);
  assert.equal(coverage.total, 3);
  assert.ok(Math.abs(coverage.percent - 200 / 3) < 1e-10);
  assert.equal(fiscalJrvCoverage(centers, records, null).covered, 0);
});

test('missing JRV data stays unavailable and incomplete ranges are not invented', () => {
  assert.deepEqual(fiscalJrvCoverage([], [], 'campaign-a'), { covered: 0, total: 0, percent: null });
  assert.equal(fiscalJrvCoverage([{ id: 'a', jrv: 3, jrvRange: '10' }], [assignment('a', 10)], 'campaign-a').covered, 0);
});

for (const code of ['0101', '0301', '0509', '0608', '1208', '1901']) {
  test(`municipal coverage uses actual source tables for ${code}`, () => {
    const fixture = JSON.parse(fs.readFileSync(new URL(`../scripts/fixtures/public-municipal-layers-${code}.json`, import.meta.url)));
    const centers = adapt(fixture.layers.filter(layer => layer.layer_id.startsWith('TREP_'))).centers;
    const records = centers.flatMap(center => center.jrvRange.split(/[;,]+/).flatMap(segment => {
      const [start, end = start] = segment.trim().split('-').map(Number);
      return Array.from({ length: end - start + 1 }, (_, index) => assignment(center.id, start + index));
    }));
    const result = fiscalJrvCoverage(centers, records, 'campaign-a');
    assert.equal(result.total, centers.reduce((sum, center) => sum + center.jrv, 0));
    assert.equal(result.covered, result.total);
    assert.equal(result.percent, 100);
    if (code === '0509') assert.equal(result.total, 103);
    if (code === '1208') assert.equal(result.total, 27);
  });
}

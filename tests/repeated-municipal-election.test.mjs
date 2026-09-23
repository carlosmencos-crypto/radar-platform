import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { adaptAuthorizedElectoralTerritoryLayers as adapt } from '../src/data/v70ElectoralAdapter.ts';

test('official repeated-election CSV, JSON, acta hashes and JRV universes reconcile', () => {
  execFileSync('python3', ['-c', `
import importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('recovery','scripts/recover-repeat-election.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
for row in json.loads((module.SRC/'retained-index.json').read_text()):
    generated=module.build(row)
    fixture=json.loads((module.ROOT/f"scripts/fixtures/public-repeat-election-{row['municipality_code']}.json").read_text())
    assert generated == fixture['layers'][1]
    assert fixture['layers'][0] == row
`], { cwd: new URL('../', import.meta.url) });
});

for (const [code, expected, counted, votes] of [['0104',24,22,4346],['1104',29,29,6671]]) {
  test(`repeated municipal results ${code} preserve event, coverage, other elections and held geolocation`, () => {
    const fixture = JSON.parse(fs.readFileSync(new URL(`../scripts/fixtures/public-repeat-election-${code}.json`, import.meta.url),'utf8'));
    const model = adapt(fixture.layers);
    const election = model.elections.find(e => e.code === 'CORPORACION_MUNICIPAL');
    assert.equal(election.snapshot,'2023-08-20T23:12:00-06:00');
    assert.equal(election.expected,expected); assert.equal(election.counted,counted);
    assert.equal(election.optionVotes,votes);
    assert.equal(election.resultStatus,'PRELIMINARY_SNAPSHOT');
    assert.match(election.sourceNotice,/Repetición municipal/);
    assert.equal(model.elections.find(e=>e.code==='PRESIDENTE').optionVotes,null);
    assert.equal(model.centers.reduce((n,c)=>n+c.elections.CORPORACION_MUNICIPAL.counted,0),counted);
    assert.equal(model.centers.reduce((n,c)=>n+c.elections.CORPORACION_MUNICIPAL.optionVotes,0),votes);
    assert.equal(model.qa.geoHeld,code==='0104'?1:5);
    if(code==='0104') {
      assert.match(election.sourceNotice,/2318 y 2319/);
      assert.equal(model.centers.find(c=>c.id==='004').elections.CORPORACION_MUNICIPAL.counted,1);
    }
    fixture.layers[1].payload.municipality_code='0509';
    assert.throws(()=>adapt(fixture.layers),/cruce municipal bloqueado/);
  });
}

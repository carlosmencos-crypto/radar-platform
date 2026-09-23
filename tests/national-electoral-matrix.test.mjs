import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptAuthorizedElectoralTerritoryLayers as adapt } from '../src/data/v70ElectoralAdapter.ts';
import { buildElectoralPartyPalette } from '../src/data/electoralPartyColors.ts';

function layers(format = 'nested') {
  const parties = Array.from({ length: 12 }, (_, i) => `PARTIDO ${i + 1}`);
  const cells = [parties.map((_, i) => i + 1), parties.map((_, i) => 12 - i)];
  const matrix = { rows: 'center_metrics', columns: 'options', values: format === 'flat' ? cells.flat() : cells };
  const index = { municipality_code: '1208', municipality_name: 'Sibinal', department_name: 'San Marcos', centers: ['001', '002'].map(code => ({ center_id: code, voting_center_code: code, voting_center_name: `Centro ${code}`, registered_voters_center: 100, total_jrv: 1, latitude: null, longitude: null, geo_association_status: 'SIN_ASOCIACION' })) };
  const payload = {
    municipality_code: '1208', qa: { status: 'PASS' },
    option_schema: ['source', 'key', 'municipal_votes', 'municipal_share', 'municipal_rank'],
    options: parties.map((party, i) => [party, party, 13, 1 / 12, i + 1]),
    election: { expected_actas: 2, counted_actas: 2, ballot_option_votes: 156 },
    center_metric_schema: ['code','counted','option_votes','leader_key','leader_votes','runner_key','runner_votes','margin_votes','margin_share'],
    // Deliberately reproduce the bad stored local summary: dense cells are authoritative.
    center_metrics: [['001', 1, 78, 'PARTIDO 1', 1, 'PARTIDO 12', 12, -11, -11/78], ['002', 1, 78, 'PARTIDO 1', 12, 'PARTIDO 2', 11, 1, 1/78]],
    votes_matrix: format === 'wrapped' ? [matrix] : matrix,
  };
  return [{ layer_id: 'TREP_2023_CENTER_INDEX', payload: index }, { layer_id: 'TREP_2023_CENTER_RESULTS_PRESIDENTE', payload }];
}

for (const format of ['nested', 'wrapped', 'flat']) test(`dense ${format} cells produce complete, reconciled local rankings`, () => {
  const model = adapt(layers(format));
  const first = model.centers[0].elections.PRESIDENTE;
  assert.equal(first.top.length, 12);
  assert.equal(model.elections[0].top.length, 12);
  assert.equal(first.top.reduce((sum, row) => sum + row.votes, 0), 78);
  assert.equal(first.leader, 'PARTIDO 12');
  assert.equal(first.leaderVotes, 12);
  assert.equal(first.runner, 'PARTIDO 11');
  assert.equal(first.marginVotes, 1);
  assert.equal(model.centers[1].elections.PRESIDENTE.leader, 'PARTIDO 1');
});

test('matrix rejects ambiguous dimensions, invalid votes and municipality crossings', () => {
  const mutations = [
    p => { p.votes_matrix.values.pop(); },
    p => { p.votes_matrix.values[0][0] = -1; },
    p => { p.votes_matrix.values[0][0] = 1.5; },
    p => { p.votes_matrix.values[0][0] = 200; },
    p => { p.votes_matrix.columns = 'other'; },
    p => { p.votes_matrix = [p.votes_matrix, p.votes_matrix]; },
    p => { p.municipality_code = '0509'; },
  ];
  for (const change of mutations) { const input = layers(); change(input[1].payload); assert.throws(() => adapt(input)); }
  const flat = layers('flat'); flat[1].payload.votes_matrix.values.pop(); assert.throws(() => adapt(flat));
});

test('missing matrices stay explicitly partial; real zero votes are retained', () => {
  const input = layers(); delete input[1].payload.votes_matrix;
  assert.equal(adapt(input).centers[0].elections.PRESIDENTE.availability, 'PARCIAL');
  const zero = layers(); zero[1].payload.votes_matrix.values[0] = Array(12).fill(0); zero[1].payload.center_metrics[0][2] = 0;
  const result = adapt(zero).centers[0].elections.PRESIDENTE;
  assert.equal(result.leader, null); assert.equal(result.runner, null);
  assert.equal(result.optionVotes, 0); assert.equal(result.top.length, 12);
  assert.ok(result.top.every(row => row.votes === 0 && row.share === 0));
});

test('complete party palette distinguishes unknown parties and survives reordered rankings', () => {
  const parties = ['FUTURO','TODOS','VOS','CABAL','UNE','VAMOS','SEMILLA','VIVA','PPN','ELEFANTE', ...Array.from({length: 12}, (_, i) => `OTRO ${i}`)];
  const palette = buildElectoralPartyPalette(parties);
  assert.equal(new Set(Object.values(palette)).size, parties.length);
  assert.equal(palette.UNE, '#2e78bd');
  assert.deepEqual(palette, buildElectoralPartyPalette([...parties].reverse()));
});

// Real public payloads cover both source batches and all five election types.
// These contain aggregate election/service data, never individual directory rows.
import fs from 'node:fs';
for (const code of ['0101','0301','0509','0608','1208','1901']) test(`published aggregate fixture ${code}: every center exposes all options`, () => {
  const fixture = JSON.parse(fs.readFileSync(new URL(`../scripts/fixtures/public-municipal-layers-${code}.json`, import.meta.url)));
  const model = adapt(fixture.layers.filter(layer => layer.layer_id.startsWith('TREP_')));
  assert.equal(model.municipalityCode, code);
  assert.equal(model.qa.status, 'PASS');
  for (const center of model.centers) for (const election of model.elections) {
    const local = center.elections[election.code];
    assert.equal(local.top.length, election.top.length);
    assert.equal(local.top.reduce((sum, item) => sum + item.votes, 0), local.optionVotes);
    assert.ok(local.marginVotes >= 0);
  }
});

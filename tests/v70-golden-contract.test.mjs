import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("V70 Golden source lock is immutable and explicit", async () => {
  const lock = JSON.parse(await text("reference/v70/V70_GOLDEN_SOURCE_LOCK.json"));
  assert.equal(lock.project, "radar-identidad-electoral");
  assert.equal(lock.version, 70);
  assert.equal(lock.published_commit, "eb6359211867ac0a81163b0a0242ea86608da56e");
  assert.equal(lock.source_archive.sha256, "964d06fb25ea95832b3c28c49b192de315e3b42337be4abb44940d499a2e41d2");
  assert.equal(lock.critical_files["app/municipio-360/page.tsx"], "7aad868c2af5daf741543588e978b71946d4852c52d8e7fc7a76c4b9e130a89d");
  assert.equal(lock.critical_files["app/globals.css"], "72cb2595f0bd5c386c7530a30435f253244e83dfc157ef10ddd47af665bb9a57");
  assert.deepEqual(lock.municipio_360_contract.election_tabs, ["Presidencia", "Lista nacional", "Distrito", "Alcaldía", "Parlacen"]);
  assert.deepEqual(lock.municipio_360_contract.map_layers, ["Electoral", "Escuelas", "CEM", "Salud", "Obras"]);
  assert.deepEqual(lock.municipio_360_contract.missing_data_states, ["NO_PUBLICADO", "PARCIAL", "SIN_REGISTRO", "SIN_ASOCIACION"]);
  assert.equal(lock.guardrails.no_dom_redesign, true);
  assert.equal(lock.guardrails.no_css_redesign, true);
  assert.equal(lock.guardrails.no_private_bundle, true);
  assert.equal(lock.guardrails.screenshot_parity_required, true);
});

test("V70 electoral adapter is RLS-neutral and preserves Golden semantics", async () => {
  const adapter = await text("src/data/v70ElectoralAdapter.ts");
  for (const layer of [
    "TREP_2023_CENTER_INDEX",
    "TREP_2023_CENTER_RESULTS_PRESIDENTE",
    "TREP_2023_CENTER_RESULTS_DIP_NAC",
    "TREP_2023_CENTER_RESULTS_DIP_DIST",
    "TREP_2023_CENTER_RESULTS_CORPORACION_MUNICIPAL",
    "TREP_2023_CENTER_RESULTS_DIP_PAR",
  ]) assert.match(adapter, new RegExp(layer));
  for (const label of ["Presidencia", "Lista nacional", "Distrito", "Alcaldía", "Parlacen", "SIN_ASOCIACION", "NO_PUBLICADO", "PARCIAL", "SIN_REGISTRO"])
    assert.ok(adapter.includes(label), `missing canonical label ${label}`);
  assert.equal(adapter.includes("fetch("), false, "adapter must not bypass authenticated radarRuntime");
  assert.equal(adapter.includes("VITE_SUPABASE"), false, "adapter must not own credentials");

  const script = `
    import assert from 'node:assert/strict';
    import { adaptAuthorizedElectoralTerritoryLayers, V70_ELECTION_ORDER } from './src/data/v70ElectoralAdapter.ts';
    const index={municipality_code:'0106',municipality_name:'Chinautla',department_name:'Guatemala',snapshot:'2023-06-29T08:48:00-06:00',result_status:'PRELIMINARY_SNAPSHOT',centers:[
      {center_id:'stable-001',voting_center_code:'001',voting_center_name:'Centro 1',community:'Cabecera',institution_type:'MINEDUC',registered_voters_center:800,total_jrv:2,jrv_ranges:'1-2',latitude:14.6,longitude:-90.5,geo_association_status:'ASSOCIATED_EXACT'},
      {center_id:'stable-002',voting_center_code:'002',voting_center_name:'Centro 2',community:'CEM',institution_type:'MINEDUC',registered_voters_center:400,total_jrv:1,jrv_ranges:'3',latitude:null,longitude:null,geo_association_status:'SIN_ASOCIACION'}]};
    const names={PRESIDENTE:'Presidente y Vicepresidente',DIP_NAC:'Diputados por Lista Nacional',DIP_DIST:'Diputados Distritales',CORPORACION_MUNICIPAL:'Corporación Municipal',DIP_PAR:'Diputados al Parlamento Centroamericano'};
    const layer=(code)=>({layer_id:'TREP_2023_CENTER_RESULTS_'+code,period:'2023',source_status:'DASHBOARD_READY',source_label:'fixture',synthetic_notice:null,payload:{qa:{status:'PASS_WITH_1_GEO_ASSOCIATION_HELD'},option_schema:['source','key','municipal_votes','municipal_share','municipal_rank'],options:[['A','A',21,.525,1],['B','B',19,.475,2]],election:{election_name:names[code],expected_actas:3,counted_actas:3,counted_share:1,turnout_counted:.5,votes_cast_counted:50,ballot_option_votes:40,leader:'A',leader_votes:21,leader_share:.525,runner_up:'B',runner_up_votes:19,margin_votes:2,margin_share:.05,result_status:'PRELIMINARY_SNAPSHOT'},center_metric_schema:['code','captured','counted','nominal','cast','turnout','valid','null','blank','option_votes','leader_key','leader_votes','leader_share','runner_key','runner_votes','margin_votes','margin_share','map_status'],center_metrics:[['001',2,2,800,30,.0375,24,4,2,24,'A',14,14/24,'B',10,4,4/24,'LISTO_PARA_MAPA'],['002',1,1,400,20,.05,16,3,1,16,'B',9,9/16,'A',7,2,2/16,'SIN_ASOCIACION']],votes_matrix:{rows:'center_metrics',columns:'options',values:[[14,10],[7,9]]}}});
    const layers=[{layer_id:'TREP_2023_CENTER_INDEX',period:'2023',payload:index,source_status:'DASHBOARD_READY',source_label:'fixture',synthetic_notice:null},...V70_ELECTION_ORDER.map(layer)];
    const vm=adaptAuthorizedElectoralTerritoryLayers(layers);
    assert.equal(vm.qa.status,'PASS');
    assert.equal(vm.qa.geoExact,1); assert.equal(vm.qa.geoHeld,1);
    assert.equal(vm.elections[3].shortName,'Alcaldía');
    assert.equal(vm.centers[1].geoState,'SIN_ASOCIACION');
    assert.equal(vm.centers[1].elections.PRESIDENTE.leader,'B');
    const partial=adaptAuthorizedElectoralTerritoryLayers(layers.filter((item)=>item.layer_id!=='TREP_2023_CENTER_RESULTS_DIP_PAR'));
    assert.equal(partial.qa.status,'PARTIAL');
    assert.equal(partial.elections[4].availability,'NO_PUBLICADO');
  `;
  execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], {
    cwd: root,
    stdio: "pipe",
  });
});

test("V70 electoral runtime retains Golden DOM vocabulary and fail-closed states", async () => {
  const component = await text("src/components/V70ElectoralTerritory.tsx");
  const unavailable = await text("src/components/V70ElectoralTerritoryUnavailable.tsx");
  const gate = await text("src/components/MunicipalityAccessGate.tsx");
  const cache = await text("src/data/radarRuntimeCache.ts");

  for (const token of [
    "INTELIGENCIA ELECTORAL TERRITORIAL",
    "El voto centro por centro",
    "election-switch",
    "map-workspace",
    "directory",
    "center-list",
    "intelligence-map-toolbar",
    "metric-switch",
    "layer-switch",
    "layer-electoral",
    "layer-schools",
    "layer-territory",
    "layer-health",
    "layer-works",
    "real-map",
    "center-card",
    "mini-ranking",
    "electoral-depth",
    "election-kpis",
    "full-ranking",
    "preliminary-note",
  ]) assert.ok(component.includes(token), `missing Golden DOM token ${token}`);

  for (const label of ["Presidencia", "Lista nacional", "Distrito", "Alcaldía", "Parlacen", "Electoral", "Escuelas", "CEM", "Salud", "Obras"])
    assert.ok(component.includes(label) || unavailable.includes(label), `missing Golden control ${label}`);
  for (const state of ["NO_PUBLICADO", "SIN_REGISTRO", "SIN_ASOCIACION"])
    assert.ok(component.includes(state) || unavailable.includes(state), `missing semantic state ${state}`);

  assert.ok(gate.includes("loadAuthorizedElectoralTerritoryLayers"));
  assert.ok(gate.includes("installRadarElectoralLayers"));
  assert.ok(cache.includes("authorizedElectoralLayersByMunicipality"));
  assert.equal(component.includes("VITE_SUPABASE"), false);
  assert.equal(unavailable.includes("VITE_SUPABASE"), false);
});

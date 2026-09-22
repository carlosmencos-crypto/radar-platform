import { attachRecoveredElectoralData, loadRecoveredManagementBenchmark } from "./qa-national-profile.mjs";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-render");
const municipalityCode = process.env.RADAR_RENDER_MUNICIPALITY_CODE ?? "0509";
const isGolden = municipalityCode === "0509";
const isSibinal = municipalityCode === "1208";
const out = path.join(root, `render-smoke-${municipalityCode}`);
const port = 4179;
const debugPort = 9223;
const contract = JSON.parse(fs.readFileSync(path.join(root, "src/data/radarContract.generated.json"), "utf8"));
const nav = contract.nav[municipalityCode];
if (!nav) throw new Error(`Municipality ${municipalityCode} is outside the national contract.`);

function loadNationalProfile(code) {
  const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
    .filter((name) => /load_national_intelligence_profiles_part_\d+\.sql$/.test(name))
    .sort();
  const prefix = `    ('${code}','`;
  for (const migration of migrations) {
    const lines = fs.readFileSync(path.join(root, "supabase/migrations", migration), "utf8").split("\n");
    const line = lines.find((item) => item.startsWith(prefix));
    if (!line) continue;
    const end = line.lastIndexOf("'::jsonb,");
    if (end < prefix.length) throw new Error(`Invalid national profile SQL for ${code}.`);
    return JSON.parse(line.slice(prefix.length, end).replace(/''/g, "'"));
  }
  throw new Error(`National intelligence profile ${code} was not found.`);
}

function bboxFor(features) {
  if (!features.length) return null;
  const latitudes = features.map((feature) => feature.latitude);
  const longitudes = features.map((feature) => feature.longitude);
  return {
    south: Math.min(...latitudes), north: Math.max(...latitudes),
    west: Math.min(...longitudes), east: Math.max(...longitudes),
  };
}

const nationalProfile = attachRecoveredElectoralData(loadNationalProfile(municipalityCode));
const goldenMapFixture = JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/v70-0509-map-render.json"), "utf8"));
const sibinalFeatures = [
  ["populated_place", "1208001", "Sibinal", 15.149219, -92.04861],
  ["health_facility", "MSPAS-1208-001", "Puesto de Salud Checamba", 15.15908213, -92.04364467],
  ["health_facility", "MSPAS-1208-002", "Puesto de Salud Chocabj", 15.1110288, -92.07544992],
  ["health_facility", "MSPAS-1208-003", "Farmacia PROAM Municipalidad Sibinal", 15.14925, -92.0486389],
  ["tse_voting_center", "TSE2023-1208-001", "ESCUELA OFICIAL URBANA MIXTA SIBINAL", 15.23805556, -92.07083333],
  ["tse_voting_center", "TSE2023-1208-002", "INSTITUTO MIXTO DE EDUCACIÓN BÁSICA POR COOPERATIVA SIBINAL", 15.14833333, -92.04722222],
  ["tse_voting_center", "TSE2023-1208-003", "INSTITUTO MUNICIPAL EL JARDIN", 15.15805556, -92.05055556],
  ["tse_voting_center", "TSE2023-1208-004", "ESCUELA OFICIAL RURAL MIXTA CASERÍO TIBANCUCHE", 15.11555556, -92.06472222],
  ["tse_voting_center", "TSE2023-1208-005", "ESCUELA OFICIAL RURAL MIXTA ALDEA VEGA DEL VOLCÁN", 15.11555556, -92.06472222],
  ["tse_voting_center", "TSE2023-1208-006", "ESCUELA OFICIAL RURAL MIXTA CASERIO SAN JOSE SANTA RITA", 15.08591667, -92.04608333],
  ["tse_voting_center", "TSE2023-1208-007", "INSTITUTO NACIONAL DE EDUCACION BASICA SAN JOSE SANTA RITA", 15.08594444, -92.04611111],
  ["tse_voting_center", "TSE2023-1208-008", "ESCUELA OFICIAL DE PARVULOS ANEXA A ESCUELA OFICIAL MIXTA SIBINAL", 15.14833333, -92.04722222],
].map(([feature_type, source_key, feature_name, latitude, longitude]) => ({ feature_type, source_key, feature_name, latitude, longitude, geometry_json: null, properties: { municipality_code: "1208", map_publishable: true }, source_id: "QA-1208-EXACT", source_label: "Supabase municipal fixture", period: "2023", updated_at: "2026-09-18T00:00:00.000Z" }));
const profileCenterFeatures = nationalProfile.voting_centers
  .filter((center) => Number.isFinite(center.latitude) && Number.isFinite(center.longitude))
  .map((center) => ({
    feature_type: "tse_voting_center", source_key: center.location_id, feature_name: center.name,
    latitude: center.latitude, longitude: center.longitude, geometry_json: null,
    properties: { municipality_code: municipalityCode, map_publishable: true },
    source_id: nationalProfile.source_manifest.center_directory,
    source_label: "TSE · centros de votación 2023", period: "2023", updated_at: "2026-09-19T00:00:00.000Z",
  }));
const genericMapFixture = {
  features: profileCenterFeatures,
  communities: [],
  bbox: bboxFor(profileCenterFeatures),
  provenance: { captured_for_qa: "2026-09-19T00:00:00.000Z" },
};
const mapFixture = isGolden ? goldenMapFixture : isSibinal
  ? { features: sibinalFeatures, communities: [], bbox: { south: 15.08591667, north: 15.23805556, west: -92.07544992, east: -92.04364467 }, provenance: { captured_for_qa: "2026-09-18T00:00:00.000Z" } }
  : genericMapFixture;
const layerIds = contract.layers.map((layer) => layer.layer_id);
const actions = contract.route_states[municipalityCode];
const activeProfile = nationalProfile.active_voter_profile;
const election2023 = nationalProfile.electoral_history.elections.find((election) => election.year === 2023);
const registeredVoters2023 = election2023?.registered_voters ?? null;
const age1835 = ["18_25", "26_30", "31_35"].reduce((sum, key) => sum + (activeProfile.age_total[key] ?? 0), 0);
const literate = activeProfile.women_literate + activeProfile.men_literate;
const centerJrv = nationalProfile.voting_centers.reduce((sum, center) => sum + (center.jrv ?? 0), 0);
const visibleLayers = layerIds.filter((_, index) => actions[index] !== "HIDE_POST_LAUNCH").map((layer_id) => ({
  layer_id,
  period: null,
  payload: layer_id === "NUCLEO_ELECTORAL" ? {
    municipality: {
      registered_voters_2023: registeredVoters2023,
      active_voters_2026: activeProfile.total_active,
      women_2026: activeProfile.women_active,
      age_18_35_2026: age1835,
      literacy_share_2026: literate / activeProfile.total_active,
      winner_2023: election2023?.winner_party ?? null,
      runner_up_2023: election2023?.runner_up_party ?? null,
      organizations_2023: election2023?.organizations ?? null,
    },
    centers_jrv: { physical_locations: nationalProfile.voting_centers.length, jrv: centerJrv },
    communities: { communities_count: nationalProfile.community_catalog.records.length },
  } : layer_id === "RGM_SERVICIOS" ? { management_benchmark: loadRecoveredManagementBenchmark(municipalityCode) } : layer_id === "TSE_CENTROS_GEO" ? { center_count: nationalProfile.voting_centers.length } : null,
  source_status: "QA_RENDER_MOCK",
  source_label: "V70 isolated render smoke",
  synthetic_notice: "QA-only browser render fixture; never shipped in the client bundle.",
}));

if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("dist-render/index.html missing. Build the isolated render bundle first.");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const municipality = {
  id: `qa-${municipalityCode}`,
  country_code: "GT",
  municipality_code: municipalityCode,
  department_code: nav.department_code,
  department_name: nav.department_name,
  municipality_name: nav.municipality_name,
  slug: `${nav.municipality_name}-${nav.department_name}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
};
const geoFeatureCounts = {
  populated_place: mapFixture.features.filter((feature) => feature.feature_type === "populated_place").length,
  tse_voting_center: mapFixture.features.filter((feature) => feature.feature_type === "tse_voting_center").length,
  school: mapFixture.features.filter((feature) => feature.feature_type === "school").length,
  health_facility: mapFixture.features.filter((feature) => feature.feature_type === "health_facility").length,
};
const runtime = {
  context: {
    country_code: "GT",
    municipality_id: `qa-${municipalityCode}`,
    municipality_code: municipalityCode,
    municipality_name: municipality.municipality_name,
    department_code: municipality.department_code,
    department_name: municipality.department_name,
    campaign_id: isGolden ? "qa-render-0509" : null,
    campaign_name: isGolden ? "QA V70 render smoke" : null,
    user_role: isGolden ? "owner" : "platform_admin",
    permissions: isGolden ? [`municipality:${municipalityCode}`, "campaign:read"] : ["data_vault:read", "admin:access"],
    is_demo: false,
  },
  layers: visibleLayers,
  geo: {
    municipality,
    feature_counts: geoFeatureCounts,
    feature_total: mapFixture.features.length,
    bbox: mapFixture.bbox,
    updated_at: mapFixture.provenance.captured_for_qa,
  },
  voter_roll: {
    municipality_code: municipalityCode,
    aggregates: [{ source_year: 2026, elector_count: activeProfile.total_active, community_count: nationalProfile.community_catalog.records.length, average_age_base: null, age_missing_count: null, age_18_29: null, age_30_44: null, age_45_59: null, age_60_plus: null, reconciliation_delta: null, source_product_id: nationalProfile.source_manifest.active_voters, universe: "NUCLEO_ELECTORAL_2026" }],
    coverage: { detailed_2023: isGolden, active_2026: true, community_detail_2023: isGolden },
  },
  demographics: null,
  elector_profile: {
    municipality_code: municipalityCode,
    cutoff_at: "2026-07-12T22:01:03-06:00",
    ...activeProfile,
    source_id: nationalProfile.source_manifest.active_voters,
    source_label: "TSE · ciudadanos empadronados activos · corte 12 julio 2026",
    source_status: "VALIDATED",
  },
  voting_centers: nationalProfile.voting_centers,
  intelligence_profile: nationalProfile,
  client_readiness: {
    municipality_code: municipalityCode,
    status: isGolden ? "CLIENT_READY" : "INTELLIGENCE_READY",
    public_data_ready: true,
    trep_ready: true,
    campaign_connected: isGolden,
    possible_voters_loaded: isGolden,
    possible_voters_count: isGolden ? 36878 : 0,
    missing_requirements: isGolden ? [] : ["AUTHORIZED_CAMPAIGN", "CAMPAIGN_VOTER_DIRECTORY"],
  },
};
const geoBundle = { municipality, feature_counts: geoFeatureCounts, features: mapFixture.features };
const voterCommunities = mapFixture.communities;
const municipalityName = municipality.municipality_name;
const departmentName = municipality.department_name;

const injection = `<script>(function(){
  const now=Date.now();
  localStorage.setItem("radar-supabase-session-v1",JSON.stringify({access_token:"qa-render-token",refresh_token:"qa-render-refresh",expires_at:now+3600000,token_type:"bearer"}));
  const runtime=${JSON.stringify(runtime)};
  const geoBundle=${JSON.stringify(geoBundle)};
  const voterCommunities=${JSON.stringify(voterCommunities)};
  const campaignBundle=${JSON.stringify(isGolden ? { identity: { candidate_name: "Nombre Apellido", party_name: "", party_logo_data_url: null }, activities: [{ id: "qa-map-activity", campaign_id: "qa-render-0509", title: "Actividad territorial QA", activity_type: "REUNION", starts_at: "2027-02-20T16:10:00.000Z", community: "Cabecera Municipal", latitude: 13.939, longitude: -90.821, status: "PLANIFICADA", notes: null, details: {}, created_at: "2026-09-16T00:00:00.000Z", updated_at: "2026-09-16T00:00:00.000Z" }], commitments: [] } : { identity: {}, activities: [], commitments: [] })};
  const voterRows=${JSON.stringify(isGolden ? [{ id: 1, full_name: "Registro autorizado QA", community: "Cabecera Municipal", estimated_age_2026: 40, masked_identification: "0000••••0000", contact_status: "SIN_CONTACTO", phone_primary: null, assigned_person_name: null, campaign_role: null, party_affiliation: null, total_count: 36878 }] : [])};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=String(typeof input==="string"?input:input?.url||"");
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_runtime_v8")) return new Response(JSON.stringify(runtime),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_layers_v2")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_municipality_geo_bundle")) return new Response(JSON.stringify(geoBundle),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_voter_communities")) return new Response(JSON.stringify(voterCommunities),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_bundle_v1")) return new Response(JSON.stringify(campaignBundle),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_contacts_v1")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_records_v1")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_pulse_v1")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_voter_directory_v1")) return new Response(JSON.stringify(voterRows),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_nominal_availability_v1")) return new Response(JSON.stringify({municipality_code:runtime.context.municipality_code,available:true,total_count:1,source_year:2023,read_only:true,communities:["Comunidad sintética QA"]}),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_nominal_directory_v1")) return new Response(JSON.stringify({municipality_code:runtime.context.municipality_code,source_year:2023,total_count:1,items:[{id:-1,municipality_code:runtime.context.municipality_code,full_name:"Registro sintético QA",community:"Comunidad sintética QA",estimated_age_2026:40,masked_identification:"•••••••••0000",contact_status:"SIN_CONTACTO",phone_primary:null,assigned_person_name:null,campaign_role:null,party_affiliation:null,total_count:1}]}),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_save_campaign_identity_v1")){const body=JSON.parse(init?.body||"{}"); return new Response(JSON.stringify(body.p_identity||{}),{status:200,headers:{"Content-Type":"application/json"}});}
    if(url.includes("/mock/rest/v1/rpc/radar_save_activity_v1")){const body=JSON.parse(init?.body||"{}"); return new Response(JSON.stringify({id:"qa-activity",campaign_id:"qa-render-0509",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...body.p_activity}),{status:200,headers:{"Content-Type":"application/json"}});}
    if(url.includes("nominatim.openstreetmap.org/search")) return new Response(JSON.stringify([{place_id:1,name:${JSON.stringify(`Municipalidad de ${municipalityName}`)},display_name:${JSON.stringify(`Municipalidad de ${municipalityName}, ${departmentName}, Guatemala`)},lat:${JSON.stringify(isSibinal ? "15.149219" : "13.939")},lon:${JSON.stringify(isSibinal ? "-92.04861" : "-90.821")},addresstype:"townhall"}]),{status:200,headers:{"Content-Type":"application/json"}});
    return nativeFetch(input,init);
  };
})();</script>`;

const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"], [".woff2", "font/woff2"], [".json", "application/json"], [".png", "image/png"],
]);
const index = fs.readFileSync(path.join(dist, "index.html"), "utf8").replace("</head>", `${injection}</head>`);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname);
  const file = path.join(dist, pathname.replace(/^\/+/, ""));
  if (pathname === "/" || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(index);
    return;
  }
  response.writeHead(200, { "Content-Type": mime.get(path.extname(file)) ?? "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });

function findChrome() {
  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const probe = spawnSync("bash", ["-lc", `command -v ${command}`], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  throw new Error("Chrome/Chromium not available on the QA runner.");
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}
async function waitForDebugTarget(timeoutMs = 15000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const targets = await json(`http://127.0.0.1:${debugPort}/json/list`);
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) { lastError = error; }
    await delay(150);
  }
  throw new Error(`Chrome DevTools target unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
function createCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  const open = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result ?? {});
      return;
    }
    if (message.method && listeners.has(message.method)) {
      for (const listener of listeners.get(message.method)) listener(message.params ?? {});
    }
  });
  async function send(method, params = {}) {
    await open;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  function once(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const set = listeners.get(method) ?? new Set();
      const timer = setTimeout(() => { set.delete(handler); reject(new Error(`Timed out waiting for ${method}`)); }, timeoutMs);
      const handler = (params) => { clearTimeout(timer); set.delete(handler); resolve(params); };
      set.add(handler);
      listeners.set(method, set);
    });
  }
  function on(method, listener) {
    const set = listeners.get(method) ?? new Set();
    set.add(listener);
    listeners.set(method, set);
    return () => set.delete(listener);
  }
  return { send, once, on, close: () => socket.close(), open };
}

const chrome = findChrome();
const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), "radar-v70-chrome-"));
const chromeLog = path.join(out, "chrome.stderr.txt");
const chromeErr = fs.openSync(chromeLog, "w");
const browser = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync",
  "--metrics-recording-only", "--no-first-run", "--window-size=1440,1100",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${chromeProfile}`, "about:blank",
], { stdio: ["ignore", "ignore", chromeErr] });

const routes = [
  ["inicio", `/municipio/${municipalityCode}`, "Planilla Municipal"],
  ["inteligencia", `/municipio/${municipalityCode}/inteligencia`, "Inteligencia Municipal"],
  ["estrategia", `/municipio/${municipalityCode}/estrategia`, "Estrategia"],
  ["directorio", `/municipio/${municipalityCode}/directorio`, "Directorio"],
  ["agenda", `/municipio/${municipalityCode}/agenda`, "Agenda"],
  ["mapa", `/municipio/${municipalityCode}/mapa`, "Mapa Inteligente"],
  ["dia-d", `/municipio/${municipalityCode}/dia-d`, "Día D"],
  ["recursos", `/municipio/${municipalityCode}/recursos`, "Recursos"],
  ["pulso", `/municipio/${municipalityCode}/pulso`, "Pulso Electoral"],
  ["ia-radar", `/municipio/${municipalityCode}/ia-radar`, "IA RADAR"],
  ["configuracion", `/municipio/${municipalityCode}/configuracion`, "Configuración"],
];
const results = [];
const interactions = [];
const runtimeEvents = [];
let cdp = null;
try {
  const target = await waitForDebugTarget();
  cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  cdp.on("Runtime.consoleAPICalled", (event) => {
    runtimeEvents.push({ type: event.type, text: (event.args ?? []).map((item) => item.value ?? item.description ?? item.type).join(" ") });
  });
  cdp.on("Runtime.exceptionThrown", (event) => {
    runtimeEvents.push({ type: "exception", text: event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? "Runtime exception" });
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  async function evaluate(expression) {
    const evaluated = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text || "Runtime.evaluate exception");
    return evaluated.result?.value;
  }
  async function waitFor(predicateExpression, label, timeoutMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(`Boolean(${predicateExpression})`)) return;
      await delay(120);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function navigate(pathname) {
    const loaded = cdp.once("Page.loadEventFired", 15000);
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}${pathname}` });
    await loaded;
  }
  async function clickSelector(selector) {
    const point = await evaluate(`(()=>{const item=document.querySelector(${JSON.stringify(selector)});if(!item)return null;item.scrollIntoView({block:'center',inline:'center',behavior:'instant'});const rect=item.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
    if (!point) throw new Error(`Clickable control missing: ${selector}`);
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  }
  async function capture(name) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    const target = path.join(out, `${name}.png`);
    fs.writeFileSync(target, Buffer.from(shot.data, "base64"));
    return fs.statSync(target).size;
  }

  for (const [slug, route, marker] of routes) {
    const url = `http://127.0.0.1:${port}${route}`;
    const loaded = cdp.once("Page.loadEventFired", 15000);
    await cdp.send("Page.navigate", { url });
    await loaded;
    await delay(slug === "mapa" ? 3500 : 1800);
    const evaluated = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({text:document.body?.innerText||"",html:document.documentElement?.outerHTML||"",href:location.href})`,
      returnByValue: true,
    });
    const snapshot = JSON.parse(evaluated.result?.value ?? "{}");
    const text = snapshot.text ?? "";
    const html = snapshot.html ?? "";
    const mapGeographyOk = html.includes("leaflet-container") || (
      !runtime.geo.bbox
      && html.includes("smart-map-unavailable")
      && text.includes("Mapa operativo aún no publicado")
      && text.includes("RADAR mantiene la estructura sin inventar ubicaciones")
    );
    const mapRouteOk = slug !== "mapa" || (
      mapGeographyOk
      && (!isGolden || html.includes("agenda-map-marker"))
      && html.includes("map-layer-agenda on")
      && !html.includes("map-layer-concentracion on")
      && html.includes("Todas")
      && (!isGolden || html.includes("Actividad territorial QA"))
    );
    const readinessOk = isGolden || slug !== "directorio" || (text.includes("Padrón nominal 2023") && text.includes("Registro sintético QA"));
    const slateOk = slug !== "inicio" || (html.match(/class="slate-member"/g) ?? []).length === nationalProfile.electoral_basis_2027.all_positions;
    const council2023 = nationalProfile.electoral_history.councils.find((item) => item.year === 2023);
    const officialIntelligenceOk = slug !== "inteligencia" || (
      text.includes(new Intl.NumberFormat("es-GT").format(nationalProfile.electoral_basis_2027.published_population_total))
      && text.includes(council2023.mayor)
      && html.includes(council2023.source_url)
    );
    const routeSpecificOk = mapRouteOk && readinessOk && slateOk && officialIntelligenceOk;
    const domOk = html.includes("portal-shell")
      && text.includes(marker)
      && routeSpecificOk
      && !text.includes("No pudimos actualizar este municipio.")
      && !text.includes("No tenés acceso a este municipio.")
      && !text.includes("Iniciar sesión")
      && text.includes(municipalityName)
      && (isGolden || !text.includes("Puerto San José"));
    fs.writeFileSync(path.join(out, `${slug}.html`), html);
    const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    const screenshot = path.join(out, `${slug}.png`);
    fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
    const screenshotBytes = fs.statSync(screenshot).size;
    const ok = domOk && screenshotBytes > 10_000;
    results.push({ slug, route, marker, ok, domOk, routeSpecificOk, screenshotBytes, href: snapshot.href ?? null });
    fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: ok ? "RUNNING" : "FAIL", routes: results, interactions, runtimeEvents: runtimeEvents.slice(-40) }, null, 2));
    if (!ok) {
      console.error("V70_RENDER_RUNTIME_EVENTS", JSON.stringify(runtimeEvents.slice(-12)));
      throw new Error(`Rendered route failed: ${route}; see render-smoke-${municipalityCode} diagnostics.`);
    }
  }

  await navigate(`/municipio/${municipalityCode}/mapa`);
  await waitFor(`Boolean(document.querySelector('.map-fullscreen-frame .map-fullscreen-button'))`, "Smart Map fullscreen control");
  await clickSelector(".map-fullscreen-frame .map-fullscreen-button");
  await waitFor(`document.fullscreenElement?.classList.contains('map-fullscreen-frame')`, "Smart Map fullscreen entry");
  await waitFor(`Boolean(document.fullscreenElement?.querySelector('.map-fullscreen-button.active'))`, "Smart Map fullscreen active state");
  const mapLayout = await evaluate(`(()=>{const frame=document.fullscreenElement,stage=frame?.querySelector('.map-stage'),search=frame?.querySelector('.map-toolbar-search'),activity=frame?.querySelector('.toolbar-select'),button=frame?.querySelector('.map-fullscreen-button.active');if(!frame||!stage||!search||!activity||!button)return null;const s=stage.getBoundingClientRect(),q=search.getBoundingClientRect(),a=activity.getBoundingClientRect();return{stageWidth:s.width,stageHeight:s.height,searchWidth:q.width,activityWidth:a.width,buttonLabel:button.getAttribute('aria-label')}})()`);
  const mapScreenshotBytes = await capture("mapa-fullscreen");
  const mapLayoutOk = Boolean(mapLayout && mapLayout.stageWidth >= 900 && mapLayout.stageHeight >= 600 && mapLayout.searchWidth <= 520 && mapLayout.activityWidth >= 170 && mapLayout.buttonLabel === "Salir de pantalla completa" && mapScreenshotBytes >= 10_000);
  interactions.push({ kind: "map-fullscreen", ...mapLayout, screenshotBytes: mapScreenshotBytes, ok: mapLayoutOk });
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: mapLayoutOk ? "RUNNING" : "FAIL", routes: results, interactions, runtimeEvents: runtimeEvents.slice(-40) }, null, 2));
  if (!mapLayoutOk) throw new Error(`Smart Map fullscreen failed for ${municipalityCode}: ${JSON.stringify(mapLayout)}`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(`!document.fullscreenElement`, "Smart Map fullscreen Escape exit");

  await navigate(`/municipio/${municipalityCode}/inteligencia`);
  await waitFor(`Boolean(document.querySelector('.intelligence-fullscreen-frame .map-fullscreen-button'))`, "Intelligence fullscreen control");
  const publicDepth = await evaluate(`(()=>{const text=document.body?.innerText||'';return{municipality:text.includes(${JSON.stringify(municipalityName)}),active:text.includes(new Intl.NumberFormat('es-GT').format(${activeProfile.total_active})),census:text.includes(new Intl.NumberFormat('es-GT').format(${nationalProfile.census_2018.population_total})),history:[2011,2015,2019,2023].every((year)=>text.includes(String(year)))}})()`);
  if (!publicDepth?.municipality || !publicDepth.active || !publicDepth.census || !publicDepth.history) throw new Error(`National intelligence depth failed for ${municipalityCode}: ${JSON.stringify(publicDepth)}`);
  const benchmarkRows = await evaluate(`document.querySelectorAll(".management-benchmark .benchmark-list article").length`);
  if (benchmarkRows !== 6) throw new Error(`RGM dimensions missing for ${municipalityCode}: ${benchmarkRows}`);
  await clickSelector(".intelligence-fullscreen-frame .map-fullscreen-button");
  await waitFor(`document.fullscreenElement?.classList.contains('intelligence-fullscreen-frame')`, "Intelligence fullscreen entry");
  await waitFor(`Boolean(document.fullscreenElement?.querySelector('.map-fullscreen-button.active'))`, "Intelligence fullscreen active state");
  const intelligenceLayout = await evaluate(`(()=>{const frame=document.fullscreenElement,map=frame?.querySelector('.real-map'),tabs=frame?.querySelector('.election-switch'),toolbar=frame?.querySelector('.intelligence-map-toolbar'),layers=frame?.querySelector('.layer-switch'),button=frame?.querySelector('.map-fullscreen-button.active');if(!frame||!map||!tabs||!toolbar||!layers||!button)return null;const m=map.getBoundingClientRect(),t=tabs.getBoundingClientRect(),l=layers.getBoundingClientRect();const tabText=tabs.innerText||'';const toolbarText=toolbar.innerText||'';return{mapWidth:m.width,mapHeight:m.height,tabsVisible:t.width>0&&t.height>0,layersVisible:l.width>0&&l.height>0,allElectionTabs:['Presidencia','Lista nacional','Distrito','Alcaldía','Parlacen'].every((label)=>tabText.includes(label)),allLayerControls:['Ganador','Participación','Margen','Actas','Electoral','Escuelas','CEM','Salud','Obras'].every((label)=>toolbarText.includes(label)),buttonLabel:button.getAttribute('aria-label')}})()`);
  const intelligenceScreenshotBytes = await capture("inteligencia-mapa-fullscreen");
  const intelligenceLayoutOk = Boolean(intelligenceLayout && intelligenceLayout.mapWidth >= 700 && intelligenceLayout.mapHeight >= 450 && intelligenceLayout.tabsVisible && intelligenceLayout.layersVisible && intelligenceLayout.allElectionTabs && intelligenceLayout.allLayerControls && intelligenceLayout.buttonLabel === "Salir de pantalla completa" && intelligenceScreenshotBytes >= 10_000);
  interactions.push({ kind: "intelligence-fullscreen", ...intelligenceLayout, screenshotBytes: intelligenceScreenshotBytes, ok: intelligenceLayoutOk });
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: intelligenceLayoutOk ? "RUNNING" : "FAIL", routes: results, interactions, publicDepth, runtimeEvents: runtimeEvents.slice(-40) }, null, 2));
  if (!intelligenceLayoutOk) throw new Error(`Intelligence fullscreen failed for ${municipalityCode}: ${JSON.stringify(intelligenceLayout)}`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(`!document.fullscreenElement`, "Intelligence fullscreen Escape exit");

  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: "PASS", routes: results, interactions, publicDepth, runtimeEvents: runtimeEvents.slice(-40) }, null, 2));
  console.log(`V70_RENDER_SMOKE_OK ${municipalityCode} ${results.filter((item) => item.ok).length}/11 routes · ${interactions.length}/2 fullscreen interactions · national profile isolated`);
} catch (error) {
  const failure = error instanceof Error ? error.message : String(error);
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: "FAIL", error: failure, routes: results, interactions, runtimeEvents: runtimeEvents.slice(-40) }, null, 2));
  throw error;
} finally {
  cdp?.close();
  server.close();
  browser.kill("SIGTERM");
  await delay(200);
  if (!browser.killed) browser.kill("SIGKILL");
  fs.closeSync(chromeErr);
  fs.rmSync(chromeProfile, { recursive: true, force: true });
}

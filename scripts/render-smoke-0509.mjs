import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-render");
const municipalityCode = process.env.RADAR_RENDER_MUNICIPALITY_CODE ?? "0509";
if (!["0509", "1208"].includes(municipalityCode)) throw new Error(`Municipality ${municipalityCode} has no isolated render fixture.`);
const isSibinal = municipalityCode === "1208";
const out = path.join(root, `render-smoke-${municipalityCode}`);
const port = 4179;
const debugPort = 9223;
const contract = JSON.parse(fs.readFileSync(path.join(root, "src/data/radarContract.generated.json"), "utf8"));
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
const mapFixture = isSibinal ? { features: sibinalFeatures, communities: [], bbox: { south: 15.08591667, north: 15.23805556, west: -92.07544992, east: -92.04364467 }, provenance: { captured_for_qa: "2026-09-18T00:00:00.000Z" } } : goldenMapFixture;
const layerIds = contract.layers.map((layer) => layer.layer_id);
const actions = contract.route_states[municipalityCode];
const visibleLayers = layerIds.filter((_, index) => actions[index] !== "HIDE_POST_LAUNCH").map((layer_id) => ({
  layer_id,
  period: null,
  payload: isSibinal && layer_id === "NUCLEO_ELECTORAL" ? { municipality: { registered_voters_2023: 9941, active_voters_2026: 11067, women_2026: 5789, age_18_35_2026: 4506, literacy_share_2026: 0.843046896 }, centers_jrv: { physical_locations: 8, jrv: 27 }, communities: { communities_count: 53 } } : null,
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
  department_code: isSibinal ? "12" : "05",
  department_name: isSibinal ? "San Marcos" : "Escuintla",
  municipality_name: isSibinal ? "Sibinal" : "San José",
  slug: isSibinal ? "sibinal-san-marcos" : "san-jose-escuintla",
};
const geoFeatureCounts = {
  populated_place: mapFixture.features.filter((feature) => feature.feature_type === "populated_place").length,
  tse_voting_center: 0,
  school: 0,
  health_facility: 0,
};
const runtime = {
  context: {
    country_code: "GT",
    municipality_id: `qa-${municipalityCode}`,
    municipality_code: municipalityCode,
    municipality_name: municipality.municipality_name,
    department_code: municipality.department_code,
    department_name: municipality.department_name,
    campaign_id: isSibinal ? "eafbedf8-752e-410c-b58a-3bde81a1d269" : "qa-render-0509",
    campaign_name: "QA V70 render smoke",
    user_role: "owner",
    permissions: [`municipality:${municipalityCode}`, "campaign:read"],
    is_demo: true,
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
    aggregates: isSibinal ? [{ source_year: 2023, elector_count: 9941, community_count: 53, average_age_base: null, age_missing_count: null, age_18_29: null, age_30_44: null, age_45_59: null, age_60_plus: null, reconciliation_delta: 0, source_product_id: "GT_RADAR_PADRON_2023_AGREGADOS_340_v1", universe: "PADRON_DETALLADO_2023" }, { source_year: 2026, elector_count: 11067, community_count: 53, average_age_base: null, age_missing_count: null, age_18_29: null, age_30_44: null, age_45_59: null, age_60_plus: null, reconciliation_delta: null, source_product_id: "GT_RADAR_PORTAL_MASTER_340_DASHBOARD_READY_v6", universe: "NUCLEO_ELECTORAL_2026" }] : [],
    coverage: { detailed_2023: true, active_2026: true, community_detail_2023: true },
  },
  demographics: null,
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
  const campaignBundle=${JSON.stringify(isSibinal ? { identity: {}, activities: [], commitments: [] } : { identity: { candidate_name: "Nombre Apellido", party_name: "", party_logo_data_url: null }, activities: [{ id: "qa-map-activity", campaign_id: "qa-render-0509", title: "Actividad territorial QA", activity_type: "REUNION", starts_at: "2027-02-20T16:10:00.000Z", community: "Cabecera Municipal", latitude: 13.939, longitude: -90.821, status: "PLANIFICADA", notes: null, details: {}, created_at: "2026-09-16T00:00:00.000Z", updated_at: "2026-09-16T00:00:00.000Z" }], commitments: [] })};
  const voterRows=${JSON.stringify(isSibinal ? [] : [{ id: 1, full_name: "Registro autorizado QA", community: "Cabecera Municipal", estimated_age_2026: 40, masked_identification: "0000••••0000", contact_status: "SIN_CONTACTO", phone_primary: null, assigned_person_name: null, campaign_role: null, party_affiliation: null, total_count: 36878 }])};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=String(typeof input==="string"?input:input?.url||"");
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_runtime_v6")) return new Response(JSON.stringify(runtime),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_layers_v2")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_municipality_geo_bundle")) return new Response(JSON.stringify(geoBundle),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_voter_communities")) return new Response(JSON.stringify(voterCommunities),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_bundle_v1")) return new Response(JSON.stringify(campaignBundle),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_contacts_v1")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_records_v1")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_pulse_v1")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_voter_directory_v1")) return new Response(JSON.stringify(voterRows),{status:200,headers:{"Content-Type":"application/json"}});
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
    const routeSpecificOk = slug !== "mapa" || (
      html.includes("leaflet-container")
      && (isSibinal || html.includes("agenda-map-marker"))
      && html.includes("map-layer-agenda on")
      && !html.includes("map-layer-concentracion on")
      && html.includes("Todas")
      && (isSibinal || html.includes("Actividad territorial QA"))
    );
    const domOk = html.includes("portal-shell")
      && text.includes(marker)
      && routeSpecificOk
      && !text.includes("No pudimos actualizar este municipio.")
      && !text.includes("No tenés acceso a este municipio.")
      && !text.includes("Iniciar sesión")
      && (!isSibinal || (text.includes("Sibinal") && !text.includes("Puerto San José")));
    fs.writeFileSync(path.join(out, `${slug}.html`), html);
    const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    const screenshot = path.join(out, `${slug}.png`);
    fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
    const screenshotBytes = fs.statSync(screenshot).size;
    const ok = domOk && screenshotBytes > 10_000;
    results.push({ slug, route, marker, ok, domOk, routeSpecificOk, screenshotBytes, href: snapshot.href ?? null });
    fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: ok ? "RUNNING" : "FAIL", routes: results, runtimeEvents: runtimeEvents.slice(-40) }, null, 2));
    if (!ok) {
      console.error("V70_RENDER_RUNTIME_EVENTS", JSON.stringify(runtimeEvents.slice(-12)));
      throw new Error(`Rendered route failed: ${route}; see render-smoke-${municipalityCode} diagnostics.`);
    }
  }
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: "PASS", routes: results, runtimeEvents: runtimeEvents.slice(-40) }, null, 2));
  console.log(`V70_RENDER_SMOKE_OK ${municipalityCode} ${results.filter((item) => item.ok).length}/11 routes rendered without auth/runtime/cross-municipality/white-screen failure`);
} finally {
  cdp?.close();
  server.close();
  browser.kill("SIGTERM");
  await delay(200);
  if (!browser.killed) browser.kill("SIGKILL");
  fs.closeSync(chromeErr);
  fs.rmSync(chromeProfile, { recursive: true, force: true });
}

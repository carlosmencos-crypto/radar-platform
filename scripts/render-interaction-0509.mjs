import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const dist = path.join(root, "dist-render");
const out = path.join(root, "render-interaction-0509");
const port = 4180;
const debugPort = 9224;
const contract = JSON.parse(fs.readFileSync(path.join(root, "src/data/radarContract.generated.json"), "utf8"));
const mapFixture = JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/v70-0509-map-render.json"), "utf8"));
const layerIds = contract.layers.map((layer) => layer.layer_id);
const actions = contract.route_states["0509"];
const visibleLayers = layerIds.filter((_, index) => actions[index] !== "HIDE_POST_LAUNCH").map((layer_id) => ({
  layer_id,
  period: null,
  payload: null,
  source_status: "QA_RENDER_MOCK",
  source_label: "V70 isolated interaction fixture",
  synthetic_notice: "QA-only browser fixture; never shipped in the client bundle.",
}));

if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("dist-render/index.html missing. Build the isolated render bundle first.");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const municipality = {
  id: "qa-0509",
  country_code: "GT",
  municipality_code: "0509",
  department_code: "05",
  department_name: "Escuintla",
  municipality_name: "San José",
  slug: "san-jose-escuintla",
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
    municipality_id: "qa-0509",
    municipality_code: "0509",
    municipality_name: "San José",
    department_code: "05",
    department_name: "Escuintla",
    campaign_id: "qa-render-0509",
    campaign_name: "QA V70 interaction smoke",
    user_role: "owner",
    permissions: ["municipality:0509", "campaign:read"],
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
    municipality_code: "0509",
    aggregates: [],
    coverage: { detailed_2023: true, active_2026: true, community_detail_2023: true },
  },
  demographics: null,
};
const geoBundle = { municipality, feature_counts: geoFeatureCounts, features: mapFixture.features };
const voterCommunities = mapFixture.communities;

const injection = `<script>(function(){
  const now=Date.now();
  localStorage.setItem("radar-supabase-session-v1",JSON.stringify({access_token:"qa-render-token",refresh_token:"qa-render-refresh",expires_at:now+3600000,token_type:"bearer"}));
  const runtime=${JSON.stringify(runtime)};
  const geoBundle=${JSON.stringify(geoBundle)};
  const voterCommunities=${JSON.stringify(voterCommunities)};
  const campaignBundle={identity:{candidate_name:"Ana María Pérez",party_name:"Movimiento Municipal",party_logo_data_url:"/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg"},activities:[{id:"qa-activity",campaign_id:"qa-render-0509",title:"Reunión con líderes comunitarios",activity_type:"REUNION",starts_at:new Date(now+86400000).toISOString(),community:"Puerto San José",latitude:13.939,longitude:-90.821,status:"PLANIFICADA",notes:"Validación territorial",details:{responsible:"Ana María Pérez"},created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()}],commitments:[{id:"qa-commitment",title:"Presentar propuesta de alumbrado",community:"Puerto San José",responsible:"Ana María Pérez",due_date:new Date(now+172800000).toISOString().slice(0,10),priority:"ALTA",status:"PENDIENTE",notes:"Seguimiento comunitario"}]};
  const campaignContacts=[{id:"qa-candidate",campaign_id:"qa-render-0509",full_name:"Ana María Pérez",phone:"5555 0101",phone_secondary:null,email:"ana@example.test",community:"Puerto San José",address_text:null,role:"Candidata a alcalde",contact_type:"Candidato",candidate_position:"Alcalde",status:"ACTIVO",notes:null,active:true,photo_url:"/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg",identification:null,social_url:null,file_code:"CA01",is_in_crm:true,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()},{id:"qa-fiscal",campaign_id:"qa-render-0509",full_name:"María López",phone:"5555 0202",phone_secondary:null,email:"maria@example.test",community:"Puerto San José",address_text:null,role:"Fiscal de mesa",contact_type:"Fiscal",candidate_position:null,status:"ACTIVO",notes:null,active:true,photo_url:null,identification:null,social_url:null,file_code:"FI01",is_in_crm:true,created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()}];
  const moduleRecords={estrategia:[{id:"qa-plan",campaign_id:"qa-render-0509",module_key:"estrategia",category:"PLAN_CAMPAÑA",title:"Objetivo general",details:"Consolidar una campaña territorial basada en evidencia y participación comunitaria.",status:"BORRADOR",payload:{},created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()}],legal:[],finanzas:[],medios:[],agenda:[],"dia-d":[{id:"qa-assignment",campaign_id:"qa-render-0509",module_key:"dia-d",category:"ASIGNACION_JRV",title:"Escuela Oficial Urbana Mixta · JRV 1",details:"María López",status:"ASIGNADO",payload:{center_id:"qa-center",center_name:"Escuela Oficial Urbana Mixta",center_reference:"Frente al parque central",jrv:1,fiscal_id:"qa-fiscal",fiscal_name:"María López",checked_in:true,transport_ready:true,food_ready:false,mobile_data_ready:true,table_closed:false,rtd_elections:["PRESIDENTE"]},created_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()}],recursos:[]};
  const voterRows=[{id:1,full_name:"Registro autorizado QA",community:"Cabecera Municipal",estimated_age_2026:40,masked_identification:"0000••••0000",contact_status:"SIN_CONTACTO",phone_primary:null,assigned_person_name:null,campaign_role:null,party_affiliation:null,total_count:36878}];
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=String(typeof input==="string"?input:input instanceof URL?input.toString():input?.url||"");
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_runtime_v6")) return new Response(JSON.stringify(runtime),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_layers_v2")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_municipality_geo_bundle")) return new Response(JSON.stringify(geoBundle),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_voter_communities")) return new Response(JSON.stringify(voterCommunities),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_bundle_v1")) return new Response(JSON.stringify(campaignBundle),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_contacts_v1")) return new Response(JSON.stringify(campaignContacts),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_campaign_records_v1")){const body=JSON.parse(init?.body||"{}"); return new Response(JSON.stringify(moduleRecords[body.p_module_key]||[]),{status:200,headers:{"Content-Type":"application/json"}});}
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_voter_directory_v1")) return new Response(JSON.stringify(voterRows),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_save_campaign_identity_v1")){const body=JSON.parse(init?.body||"{}"); return new Response(JSON.stringify(body.p_identity||{}),{status:200,headers:{"Content-Type":"application/json"}});}
    if(url.includes("/mock/rest/v1/rpc/radar_save_campaign_record_v1")){const body=JSON.parse(init?.body||"{}"); return new Response(JSON.stringify({id:body.p_record_id||"qa-record-"+Date.now(),campaign_id:"qa-render-0509",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...body.p_record}),{status:200,headers:{"Content-Type":"application/json"}});}
    if(url.includes("/mock/rest/v1/rpc/radar_save_activity_v1")){const body=JSON.parse(init?.body||"{}"); return new Response(JSON.stringify({id:"qa-activity",campaign_id:"qa-render-0509",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...body.p_activity}),{status:200,headers:{"Content-Type":"application/json"}});}
    if(url.includes("nominatim.openstreetmap.org/search")) return new Response(JSON.stringify([{place_id:1,name:"Municipalidad de San José",display_name:"Municipalidad de San José, Escuintla, Guatemala",lat:"13.939",lon:"-90.821",addresstype:"townhall"}]),{status:200,headers:{"Content-Type":"application/json"}});
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
  return { send, once, close: () => socket.close(), open };
}

const routes = [
  ["inicio", "/municipio/0509", "Planilla Municipal"],
  ["inteligencia", "/municipio/0509/inteligencia", "Inteligencia Municipal"],
  ["estrategia", "/municipio/0509/estrategia", "Estrategia"],
  ["directorio", "/municipio/0509/directorio", "Directorio"],
  ["agenda", "/municipio/0509/agenda", "Agenda"],
  ["mapa", "/municipio/0509/mapa", "Mapa Inteligente"],
  ["dia-d", "/municipio/0509/dia-d", "Día D"],
  ["recursos", "/municipio/0509/recursos", "Recursos"],
  ["pulso", "/municipio/0509/pulso", "Pulso Electoral"],
  ["ia-radar", "/municipio/0509/ia-radar", "IA RADAR"],
  ["configuracion", "/municipio/0509/configuracion", "Configuración"],
];
const diagnostics = { status: "RUNNING", navigation: [], modals: [], reports: [] };
const save = () => fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(diagnostics, null, 2));

const chrome = findChrome();
const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), "radar-v70-interaction-chrome-"));
const chromeLog = path.join(out, "chrome.stderr.txt");
const chromeErr = fs.openSync(chromeLog, "w");
const browser = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync",
  "--metrics-recording-only", "--no-first-run", "--window-size=1440,1100",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${chromeProfile}`, "about:blank",
], { stdio: ["ignore", "ignore", chromeErr] });

let cdp = null;
try {
  const target = await waitForDebugTarget();
  cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  async function evaluate(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate exception");
    return result.result?.value;
  }
  async function navigate(pathname) {
    const loaded = cdp.once("Page.loadEventFired", 15000);
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}${pathname}` });
    await loaded;
  }
  async function waitFor(predicateExpression, label, timeoutMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(`Boolean(${predicateExpression})`)) return;
      await delay(120);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
  async function snapshot() {
    return JSON.parse(await evaluate(`JSON.stringify({text:document.body?.innerText||"",html:document.documentElement?.outerHTML||"",pathname:location.pathname,href:location.href})`) || "{}");
  }
  async function capture(name) {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    const file = path.join(out, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    return fs.statSync(file).size;
  }
  function assertHealthy(snap, marker) {
    const text = snap.text ?? "";
    const html = snap.html ?? "";
    if (!html.includes("portal-shell")) throw new Error(`portal-shell missing at ${snap.pathname}`);
    if (!text.includes(marker)) throw new Error(`marker ${marker} missing at ${snap.pathname}`);
    for (const forbidden of ["No pudimos actualizar este municipio.", "No tenés acceso a este municipio.", "Iniciar sesión"]) {
      if (text.includes(forbidden)) throw new Error(`forbidden state ${forbidden} at ${snap.pathname}`);
    }
  }

  // Prove the actual SPA sidebar path, not only direct browser navigation.
  await navigate("/municipio/0509");
  await delay(1800);
  const candidateRoutes = await evaluate(`(()=>Array.from(document.querySelectorAll('.slate-member nav a')).slice(0,2).map((item)=>item.getAttribute('href')))()`);
  if (!candidateRoutes?.[0]?.startsWith("/municipio/0509/agenda?new=1&responsiblePersonId=") || !candidateRoutes?.[0]?.includes("&responsible=") || !candidateRoutes?.[1]?.startsWith("/municipio/0509/estrategia-legal?candidate=")) throw new Error("Candidate controls escaped the municipal route or lost their candidate-specific context.");
  const partyOpened = await evaluate(`(()=>{const button=document.querySelector('.party-signature-trigger'); if(!button)return false; button.click(); return true;})()`);
  if (!partyOpened) throw new Error("Campaign identity trigger is missing.");
  await waitFor(`Boolean(document.querySelector('.campaign-identity-modal'))`, "campaign identity modal");
  const partyModalLayout = await evaluate(`(()=>{const modal=document.querySelector('.campaign-identity-modal'); const backdrop=document.querySelector('.campaign-identity-backdrop'); if(!modal||!backdrop)return null; const rect=modal.getBoundingClientRect(); return {portal:backdrop.parentElement===document.body,top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,width:innerWidth,height:innerHeight};})()`);
  if (!partyModalLayout?.portal || partyModalLayout.top < 0 || partyModalLayout.left < 0 || partyModalLayout.bottom > partyModalLayout.height || partyModalLayout.right > partyModalLayout.width) {
    throw new Error(`Campaign identity modal is clipped or is not rendered through the body portal: ${JSON.stringify(partyModalLayout)}`);
  }
  diagnostics.modals.push({ selector: ".party-signature-trigger", kind: "campaign-identity", opened: true, fullyVisible: true, portal: true, ok: true });
  await evaluate(`document.querySelector('.campaign-identity-modal [data-modal-close]')?.click()`);
  await waitFor(`!document.querySelector('.campaign-identity-modal')`, "campaign identity close");
  for (const [slug, route, marker] of routes.slice(1)) {
    const clicked = await evaluate(`(()=>{const a=document.querySelector('.portal-sidebar nav a[href="${route}"]'); if(!a)return false; a.click(); return true;})()`);
    if (!clicked) throw new Error(`Sidebar link missing: ${route}`);
    await delay(50);
    if (await evaluate(`(document.body?.innerText||"").includes("Actualizando municipio…")`)) throw new Error(`Municipality reloaded during SPA transition to ${route}`);
    await waitFor(`location.pathname===${JSON.stringify(route)} && (document.body?.innerText||"").includes(${JSON.stringify(marker)})`, `SPA route ${route}`);
    await delay(slug === "mapa" ? 2800 : 700);
    if (slug === "directorio") await waitFor(`(document.body?.innerText||"").includes("Registro autorizado QA")`, "authorized voter directory rows");
    if (slug === "agenda") {
      const opened = await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.section-banner-actions button')).find((item)=>item.textContent.includes('Nueva actividad')); if(!button)return false; button.click(); return true;})()`);
      if (!opened) throw new Error("Agenda new-activity action is missing.");
      await waitFor(`Boolean(document.querySelector('.agenda-modal #new-activity-title'))`, "new activity modal");
      await evaluate(`document.querySelector('.agenda-modal form>header button')?.click()`);
    }
    if (slug === "mapa") {
      const focused = await evaluate(`(()=>{const input=document.querySelector('.map-search input'); if(!input)return false; input.focus(); return true;})()`);
      if (!focused) throw new Error("Map search input is missing.");
      await cdp.send("Input.insertText", { text: "municipalidad" });
      await waitFor(`(document.body?.innerText||"").includes("Municipalidad de San José")`, "territorial place suggestion");
      if (await evaluate(`Boolean(document.querySelector('.territory-card'))`)) throw new Error("Map search moved to a community before the user selected a suggestion.");
      await evaluate(`(()=>{const input=document.querySelector('.map-search input'); if(input){input.value=''; input.dispatchEvent(new Event('input',{bubbles:true}));} const button=document.querySelector('.map-new-activity'); button?.click();})()`);
      await waitFor(`Boolean(document.querySelector('.map-stage.picking-activity'))`, "exact map point mode");
      const mapPoint = await evaluate(`(()=>{const map=document.querySelector('.leaflet-container'); if(!map)return null; const r=map.getBoundingClientRect(); return {x:r.left+r.width*.67,y:r.top+r.height*.62};})()`);
      if (!mapPoint) throw new Error("Interactive map canvas is missing.");
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: mapPoint.x, y: mapPoint.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: mapPoint.x, y: mapPoint.y, button: "left", clickCount: 1 });
      await waitFor(`Boolean(document.querySelector('.free-place-card a[href*="lat="][href*="lon="]'))`, "exact map point handoff to Agenda");
    }
    if (slug === "dia-d") {
      const openedRtd = await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.internal-view-tabs button')).find((item)=>item.textContent.trim()==='RTD'); if(!button)return false; button.click(); return true;})()`);
      if (!openedRtd) throw new Error("RTD internal view is missing.");
      await waitFor(`Boolean(document.querySelector('.internal-view-content[data-view="rtd"]')) && (document.body?.innerText||'').includes('JRV con RTD recibido') && /\\d+\\s+de\\s+\\d+/i.test(document.querySelector('.internal-view-content[data-view="rtd"]')?.innerText||'')`, "RTD JRV coverage board");
      const openedFiscales = await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.internal-view-tabs button')).find((item)=>item.textContent.trim()==='Fiscales'); if(!button)return false; button.click(); return true;})()`);
      if (!openedFiscales) throw new Error("Fiscales internal view is missing.");
      await waitFor(`Boolean(document.querySelector('.internal-view-content[data-view="fiscales"] .day-d-actas-tooltip')) && (document.querySelector('.day-d-actas-tooltip')?.innerText||'').includes('1 / 5 actas recibidas') && (document.querySelector('.day-d-actas-tooltip')?.innerText||'').includes('Faltan:')`, "fiscal RTD five-acta status");
      const actaPoint = await evaluate(`(()=>{const item=document.querySelector('.day-d-actas-progress'); if(!item)return null; const rect=item.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};})()`);
      if (!actaPoint) throw new Error("Fiscal RTD five-acta control is missing.");
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: actaPoint.x, y: actaPoint.y });
      await waitFor(`getComputedStyle(document.querySelector('.day-d-actas-tooltip')).display==='block'`, "visible fiscal RTD hover detail");
      const actaHoverScreenshotBytes = await capture("day-d-fiscal-actas-hover");
      if (actaHoverScreenshotBytes < 10_000) throw new Error("Fiscal RTD hover screenshot is unexpectedly empty.");
      const generatedAccess = await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.day-d-access-actions button')).find((item)=>item.textContent.trim()==='Generar acceso'); if(!button)return false; button.click(); return true;})()`);
      if (!generatedAccess) throw new Error("Fiscal access generation control is missing.");
      await waitFor(`Boolean(document.querySelector('.day-d-access-modal')) && (document.body?.innerText||'').includes('ACCESO GENERADO') && (document.body?.innerText||'').includes('Código alterno')`, "functional fiscal access generation");
      await evaluate(`document.querySelector('.day-d-access-modal>header button')?.click()`);
      await waitFor(`!document.querySelector('.day-d-access-modal')`, "fiscal access modal close");
      const openedLogistics = await evaluate(`(()=>{const button=Array.from(document.querySelectorAll('.internal-view-tabs button')).find((item)=>item.textContent.trim()==='Logística'); if(!button)return false; button.click(); return true;})()`);
      if (!openedLogistics) throw new Error("Logistics internal view is missing.");
      await waitFor(`Boolean(document.querySelector('.internal-view-content[data-view="logistica"] .day-d-logistics-links'))`, "Day D logistics workspace");
      const openedGenericForecast = await evaluate(`(()=>{const button=document.querySelector('.internal-view-content[data-view="logistica"] .day-d-logistics-links button'); if(!button)return false; button.click(); return true;})()`);
      if (!openedGenericForecast) throw new Error("Top new-forecast action is missing.");
      await waitFor(`Boolean(document.querySelector('.logistics-modal')) && (document.querySelector('.logistics-modal')?.innerText||'').includes('Nueva previsión') && Boolean(document.querySelector('.logistics-modal input[placeholder="Escribe el tipo"]')) && !(document.querySelector('.logistics-modal')?.innerText||'').includes('Piloto (CRM)')`, "generic logistics forecast modal");
      const logisticsScreenshotBytes = await capture("modal-logistics-generic");
      diagnostics.modals.push({ selector: ".day-d-logistics-links button", kind: "generic-logistics-forecast", opened: true, screenshotBytes: logisticsScreenshotBytes, ok: logisticsScreenshotBytes > 10_000 });
      await evaluate(`document.querySelector('.logistics-modal>header button[aria-label="Cerrar"]')?.click()`);
      await waitFor(`!document.querySelector('.logistics-modal')`, "generic logistics forecast close");
    }
    const snap = await snapshot();
    assertHealthy(snap, marker);
    const screenshotBytes = await capture(`nav-${slug}`);
    const ok = screenshotBytes > 10_000;
    diagnostics.navigation.push({ slug, route, pathname: snap.pathname, marker, screenshotBytes, ok });
    save();
    if (!ok) throw new Error(`SPA screenshot too small for ${route}`);
  }

  // Every report control opens the same universal, print-friendly report builder.
  await navigate("/municipio/0509/inteligencia");
  await delay(1800);
  const rankLayout = await evaluate(`(()=>{const value=document.querySelector('.territory-overview>div:nth-child(3)>b'); if(!value)return null; const style=getComputedStyle(value); const rect=value.getBoundingClientRect(); return {whiteSpace:style.whiteSpace,height:rect.height,lineHeight:Number.parseFloat(style.lineHeight)};})()`);
  if (!rankLayout || rankLayout.whiteSpace !== "nowrap" || (Number.isFinite(rankLayout.lineHeight) && rankLayout.height > rankLayout.lineHeight * 1.5)) throw new Error(`Municipal rank typography wrapped: ${JSON.stringify(rankLayout)}`);
  for (const selector of [".floating-export", ".print-top-action"]) {
    const clicked = await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}); if(!b)return false; b.click(); return true;})()`);
    if (!clicked) throw new Error(`Intelligence export control missing: ${selector}`);
    await waitFor(`Boolean(document.querySelector('.report-builder')) && (document.body?.innerText||'').includes('Crear reporte PDF') && (document.body?.innerText||'').includes('Próximos 7 días')`, `universal report builder from ${selector}`);
    const screenshotBytes = await capture(`modal-${selector.includes("floating") ? "floating" : "top"}`);
    diagnostics.modals.push({ selector, kind: "universal-report-builder", opened: true, screenshotBytes, ok: screenshotBytes > 10_000 });
    save();
    const closed = await evaluate(`(()=>{const b=document.querySelector('.report-builder>header button[aria-label="Cerrar"]'); if(!b)return false; b.click(); return true;})()`);
    if (!closed) throw new Error(`Intelligence export close control missing for ${selector}`);
    await waitFor(`!document.querySelector('.report-builder')`, `Intelligence export close for ${selector}`);
  }

  // Normal PortalFrame routes use the canonical generic ReportBuilder and ModalEscape behavior.
  await navigate("/municipio/0509");
  await delay(1200);
  const genericClicked = await evaluate(`(()=>{const b=document.querySelector('.print-top-action'); if(!b)return false; b.click(); return true;})()`);
  if (!genericClicked) throw new Error("Generic Reporte PDF control missing on Inicio");
  await waitFor(`Boolean(document.querySelector('.report-builder')) && (document.body?.innerText||'').includes('Crear reporte PDF')`, "canonical generic ReportBuilder on Inicio");
  const genericScreenshotBytes = await capture("modal-generic-report-builder");
  diagnostics.modals.push({ selector: ".print-top-action@inicio", kind: "report-builder", opened: true, screenshotBytes: genericScreenshotBytes, ok: genericScreenshotBytes > 10_000 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor(`!document.querySelector('.report-builder')`, "generic ReportBuilder Escape close");

  // Render and print the exact municipio-360 report route opened by the canonical Intelligence export panel.
  const reportRoute = "/reporte/municipio-360?blocks=electoral,center,territory,indicators,finance";
  await navigate(reportRoute);
  await waitFor(`Boolean(document.querySelector('.report-shell'))`, "report shell DOM", 12000);
  await delay(900);
  const report = await snapshot();
  const reportHealthy = report.html.includes("report-shell") && report.html.includes("report-document")
    && report.html.includes("radar-electoral-logo-horizontal")
    && !report.text.includes("No tenés acceso a este municipio.")
    && !report.text.includes("Iniciar sesión");
  if (!reportHealthy) throw new Error("Report rendered without canonical shell/branding or hit auth failure.");
  const screenshotBytes = await capture("report-inteligencia");
  const pdf = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
  const pdfPath = path.join(out, "report-inteligencia.pdf");
  fs.writeFileSync(pdfPath, Buffer.from(pdf.data, "base64"));
  const pdfBytes = fs.statSync(pdfPath).size;
  const reportOk = screenshotBytes > 10_000 && pdfBytes > 10_000;
  diagnostics.reports.push({ route: reportRoute, screenshotBytes, pdfBytes, canonicalBranding: true, ok: reportOk });
  if (!reportOk) throw new Error("Report screenshot/PDF output is unexpectedly empty.");

  // Prove the general PDF is a useful executive report populated from live campaign modules.
  const executiveRoute = "/reporte/inicio?parts=summary,metrics,charts,sections,records,trace&activities=next7";
  await navigate(executiveRoute);
  await waitFor(`Boolean(document.querySelector('.report-shell')) && (document.body?.innerText||'').includes('Ana María Pérez') && (document.body?.innerText||'').includes('INTELIGENCIA MUNICIPAL') && (document.body?.innerText||'').includes('Plan de campaña vigente') && (document.body?.innerText||'').includes('Próximos 7 días')`, "populated executive report", 12000);
  await delay(900);
  const executive = await snapshot();
  const executiveHealthy = executive.html.includes("report-candidate-grid")
    && executive.html.includes("report-chart-grid")
    && executive.text.includes("CA01")
    && executive.text.includes("Reunión con líderes comunitarios")
    && executive.text.includes("Objetivo general")
    && executive.html.includes("report-intelligence-grid")
    && executive.html.includes("report-activity-grid")
    && executive.html.includes("radar-electoral-logo-horizontal");
  if (!executiveHealthy) throw new Error("Executive report omitted candidate, intelligence, plan or agenda content.");
  const executiveScreenshotBytes = await capture("report-inicio-ejecutivo");
  const executivePdf = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
  const executivePdfPath = path.join(out, "report-inicio-ejecutivo.pdf");
  fs.writeFileSync(executivePdfPath, Buffer.from(executivePdf.data, "base64"));
  const executivePdfBytes = fs.statSync(executivePdfPath).size;
  const executiveOk = executiveScreenshotBytes > 10_000 && executivePdfBytes > 20_000;
  diagnostics.reports.push({ route: executiveRoute, screenshotBytes: executiveScreenshotBytes, pdfBytes: executivePdfBytes, populatedExecutiveContent: true, ok: executiveOk });
  if (!executiveOk) throw new Error("Executive report screenshot/PDF output is unexpectedly empty.");

  diagnostics.status = "PASS";
  save();
  console.log(`V70_INTERACTION_SMOKE_OK ${diagnostics.navigation.length}/10 SPA transitions · ${diagnostics.modals.length}/5 critical modals · ${diagnostics.reports.length}/2 printable reports`);
} catch (error) {
  diagnostics.status = "FAIL";
  diagnostics.error = error instanceof Error ? error.stack ?? error.message : String(error);
  save();
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

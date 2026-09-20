import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-render");
const out = path.join(root, "render-client-ready-22");
const port = 4182;
const debugPort = 9226;
const contract = JSON.parse(fs.readFileSync(path.join(root, "src/data/radarContract.generated.json"), "utf8"));

if (!fs.existsSync(path.join(dist, "index.html"))) {
  throw new Error("dist-render/index.html missing. Build the isolated render bundle first.");
}

const representatives = [];
const seenDepartments = new Set();
for (const code of Object.keys(contract.nav).sort()) {
  const item = contract.nav[code];
  if (seenDepartments.has(item.department_code)) continue;
  seenDepartments.add(item.department_code);
  representatives.push(item);
}
if (representatives.length !== 22 || seenDepartments.size !== 22) {
  throw new Error(`Expected 22 departmental representatives, received ${representatives.length}.`);
}

const runtimes = Object.fromEntries(representatives.map((item) => {
  const municipality = {
    id: `qa-${item.municipality_code}`,
    country_code: "GT",
    municipality_code: item.municipality_code,
    department_code: item.department_code,
    department_name: item.department_name,
    municipality_name: item.municipality_name,
    slug: `qa-${item.municipality_code}`,
  };
  const visibleLayers = contract.layers
    .filter((_, index) => contract.route_states[item.municipality_code][index] !== "HIDE_POST_LAUNCH")
    .map((layer) => ({
      layer_id: layer.layer_id,
      period: null,
      payload: null,
      source_status: "QA_RENDER_MOCK",
      source_label: "V70 departmental visual QA fixture",
      synthetic_notice: "QA-only clean-client fixture; never shipped in the client bundle.",
    }));
  return [item.municipality_code, {
    context: {
      country_code: "GT",
      municipality_id: municipality.id,
      municipality_code: item.municipality_code,
      municipality_name: item.municipality_name,
      department_code: item.department_code,
      department_name: item.department_name,
      campaign_id: null,
      campaign_name: null,
      user_role: "campaign_viewer",
      permissions: ["data_vault:read"],
      is_demo: false,
    },
    layers: visibleLayers,
    geo: {
      municipality,
      feature_counts: { populated_place: 0, tse_voting_center: 0, school: 0, health_facility: 0 },
      feature_total: 0,
      bbox: null,
      updated_at: null,
    },
    voter_roll: {
      municipality_code: item.municipality_code,
      aggregates: [],
      coverage: { detailed_2023: false, active_2026: false, community_detail_2023: false },
    },
    demographics: null,
    intelligence_profile: null,
    client_readiness: {
      municipality_code: item.municipality_code,
      status: "BLOCKED",
      public_data_ready: false,
      trep_ready: true,
      campaign_connected: false,
      possible_voters_loaded: false,
      possible_voters_count: 0,
      missing_requirements: ["NATIONAL_INTELLIGENCE_PROFILE", "AUTHORIZED_CAMPAIGN", "CAMPAIGN_VOTER_DIRECTORY"],
    },
  }];
}));
const geoBundles = Object.fromEntries(Object.entries(runtimes).map(([code, runtime]) => [code, {
  municipality: runtime.geo.municipality,
  feature_counts: runtime.geo.feature_counts,
  features: [],
}]));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const injection = `<script>(function(){
  const now=Date.now();
  localStorage.setItem("radar-supabase-session-v1",JSON.stringify({access_token:"qa-render-token",refresh_token:"qa-render-refresh",expires_at:now+3600000,token_type:"bearer"}));
  const runtimes=${JSON.stringify(runtimes)};
  const geoBundles=${JSON.stringify(geoBundles)};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=String(typeof input==="string"?input:input?.url||"");
    let body={}; try{body=JSON.parse(init?.body||"{}");}catch{}
    const code=body.p_municipality_code||location.pathname.match(/\\/municipio\\/(\\d{4})/)?.[1];
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_runtime_v8")) return new Response(JSON.stringify(runtimes[code]||null),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_layers_v2")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_municipality_geo_bundle")) return new Response(JSON.stringify(geoBundles[code]||null),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_voter_communities")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
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

const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), "radar-v70-client-ready-22-"));
const chromeLog = path.join(out, "chrome.stderr.txt");
const chromeErr = fs.openSync(chromeLog, "w");
const browser = spawn(findChrome(), [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync",
  "--metrics-recording-only", "--no-first-run", "--window-size=1440,1100",
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${chromeProfile}`, "about:blank",
], { stdio: ["ignore", "ignore", chromeErr] });

const results = [];
let cdp = null;
try {
  const target = await waitForDebugTarget();
  cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  for (const item of representatives) {
    const route = `/municipio/${item.municipality_code}`;
    const loaded = cdp.once("Page.loadEventFired", 15000);
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}${route}` });
    await loaded;
    await delay(1200);
    const evaluated = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({text:document.body?.innerText||"",html:document.documentElement?.outerHTML||"",href:location.href,links:[...document.querySelectorAll(".portal-sidebar nav a")].map(a=>a.getAttribute("href"))})`,
      returnByValue: true,
    });
    const snapshot = JSON.parse(evaluated.result?.value ?? "{}");
    const links = snapshot.links ?? [];
    const expectedLinks = [route, `${route}/inteligencia`, `${route}/mapa`, `${route}/ia-radar`];
    const domOk = snapshot.html?.includes("portal-shell")
      && snapshot.html?.includes(`data-municipality-code="${item.municipality_code}"`)
      && snapshot.html?.includes("data-campaign-id=\"\"")
      && snapshot.html?.includes("data-client-readiness=\"BLOCKED\"")
      && snapshot.text?.includes(item.municipality_name)
      && snapshot.text?.includes(item.department_name)
      && snapshot.text?.includes("Campaña no configurada")
      && expectedLinks.every((href) => links.includes(href))
      && !links.some((href) => /\/(estrategia|directorio|agenda|dia-d|recursos|pulso|configuracion)$/.test(href))
      && !snapshot.text?.includes("No pudimos actualizar este municipio.")
      && !snapshot.text?.includes("No tenés acceso a este municipio.")
      && !snapshot.text?.includes("Iniciar sesión");
    const screenshot = path.join(out, `${item.department_code}-${item.municipality_code}.png`);
    const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
    const screenshotBytes = fs.statSync(screenshot).size;
    const ok = domOk && screenshotBytes > 10_000;
    results.push({
      department_code: item.department_code,
      department_name: item.department_name,
      municipality_code: item.municipality_code,
      municipality_name: item.municipality_name,
      route,
      readiness: "BLOCKED",
      campaign_id: null,
      visible_navigation: links,
      screenshot: path.basename(screenshot),
      screenshot_bytes: screenshotBytes,
      ok,
    });
    fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: ok ? "RUNNING" : "FAIL", departments: results }, null, 2));
    if (!ok) throw new Error(`Departmental client-ready render failed: ${route}.`);
  }
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({
    status: "PASS",
    departments_expected: 22,
    departments_rendered: results.length,
    unique_municipalities: new Set(results.map((item) => item.municipality_code)).size,
    clean_campaign_states: results.filter((item) => item.campaign_id === null).length,
    departments: results,
  }, null, 2));
  console.log(`CLIENT_READY_VISUAL_22_OK ${results.length}/22 departments · ${results.length}/22 clean campaign states`);
} finally {
  cdp?.close();
  server.close();
  browser.kill("SIGTERM");
  await delay(200);
  if (!browser.killed) browser.kill("SIGKILL");
  fs.closeSync(chromeErr);
  fs.rmSync(chromeProfile, { recursive: true, force: true });
}

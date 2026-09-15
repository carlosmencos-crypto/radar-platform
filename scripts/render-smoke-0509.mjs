import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-render");
const out = path.join(root, "render-smoke-0509");
const port = 4179;
const debugPort = 9223;
const contract = JSON.parse(fs.readFileSync(path.join(root, "src/data/radarContract.generated.json"), "utf8"));
const layerIds = contract.layers.map((layer) => layer.layer_id);
const actions = contract.route_states["0509"];
const visibleLayers = layerIds.filter((_, index) => actions[index] !== "HIDE_POST_LAUNCH").map((layer_id) => ({
  layer_id,
  period: null,
  payload: null,
  source_status: "QA_RENDER_MOCK",
  source_label: "V70 isolated render smoke",
  synthetic_notice: "QA-only browser render fixture; never shipped in the client bundle.",
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
const runtime = {
  context: {
    country_code: "GT",
    municipality_id: "qa-0509",
    municipality_code: "0509",
    municipality_name: "San José",
    department_code: "05",
    department_name: "Escuintla",
    campaign_id: "qa-render-0509",
    campaign_name: "QA V70 render smoke",
    user_role: "owner",
    permissions: ["municipality:0509", "campaign:read"],
    is_demo: true,
  },
  layers: visibleLayers,
  geo: { municipality, feature_counts: { populated_place: 0, tse_voting_center: 0, school: 0, health_facility: 0 }, feature_total: 0, bbox: null, updated_at: null },
  voter_roll: { municipality_code: "0509", aggregates: [], coverage: { detailed_2023: false, active_2026: true, community_detail_2023: false } },
  demographics: null,
};
const geoBundle = { municipality, feature_counts: { populated_place: 0, tse_voting_center: 0, school: 0, health_facility: 0 }, features: [] };

const injection = `<script>(function(){
  const now=Date.now();
  localStorage.setItem("radar-supabase-session-v1",JSON.stringify({access_token:"qa-render-token",refresh_token:"qa-render-refresh",expires_at:now+3600000,token_type:"bearer"}));
  const runtime=${JSON.stringify(runtime)};
  const geoBundle=${JSON.stringify(geoBundle)};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=String(typeof input==="string"?input:input?.url||"");
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_runtime_v6")) return new Response(JSON.stringify(runtime),{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_authorized_layers_v2")) return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
    if(url.includes("/mock/rest/v1/rpc/radar_municipality_geo_bundle")) return new Response(JSON.stringify(geoBundle),{status:200,headers:{"Content-Type":"application/json"}});
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
      for (const listener of [...listeners.get(message.method)]) listener(message.params ?? {});
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
const results = [];
let cdp = null;
try {
  const target = await waitForDebugTarget();
  cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  for (const [slug, route, marker] of routes) {
    const url = `http://127.0.0.1:${port}${route}`;
    const loaded = cdp.once("Page.loadEventFired", 15000);
    await cdp.send("Page.navigate", { url });
    await loaded;
    await delay(1800);
    const evaluated = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({text:document.body?.innerText||"",html:document.documentElement?.outerHTML||"",href:location.href})`,
      returnByValue: true,
    });
    const snapshot = JSON.parse(evaluated.result?.value ?? "{}");
    const text = snapshot.text ?? "";
    const html = snapshot.html ?? "";
    const domOk = html.includes("portal-shell")
      && text.includes(marker)
      && !text.includes("No pudimos actualizar este municipio.")
      && !text.includes("No tenés acceso a este municipio.")
      && !text.includes("Iniciar sesión");
    fs.writeFileSync(path.join(out, `${slug}.html`), html);
    const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    const screenshot = path.join(out, `${slug}.png`);
    fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
    const screenshotBytes = fs.statSync(screenshot).size;
    const ok = domOk && screenshotBytes > 10_000;
    results.push({ slug, route, marker, ok, domOk, screenshotBytes, href: snapshot.href ?? null });
    fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: ok ? "RUNNING" : "FAIL", routes: results }, null, 2));
    if (!ok) throw new Error(`Rendered route failed: ${route}; see render-smoke-0509 diagnostics.`);
  }
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: "PASS", routes: results }, null, 2));
  console.log(`V70_RENDER_SMOKE_OK ${results.filter((item) => item.ok).length}/11 routes rendered without auth/runtime/white-screen failure`);
} finally {
  cdp?.close();
  server.close();
  browser.kill("SIGTERM");
  await delay(200);
  if (!browser.killed) browser.kill("SIGKILL");
  fs.closeSync(chromeErr);
  fs.rmSync(chromeProfile, { recursive: true, force: true });
}

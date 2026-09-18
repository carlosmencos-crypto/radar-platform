import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-admin-render");
const out = path.resolve(root, "..", "superadmin-v70-preview");
const port = 4187;
const debugPort = 9237;

if (!fs.existsSync(path.join(dist, "index.html")))
  throw new Error("dist-admin-render/index.html missing");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const now = "2026-09-18T03:30:00.000Z";
const municipalities = [
  {
    municipality_code: "0509",
    municipality_name: "San José",
    department_code: "05",
    department_name: "Escuintla",
    canonical_layers_present: 17,
    active_campaigns: 1,
    campaign_members: 6,
    protected_contracts: 1,
    data_updated_at: now,
    operational_state: "CONTRACT_PROTECTED",
  },
  {
    municipality_code: "1901",
    municipality_name: "Zacapa",
    department_code: "19",
    department_name: "Zacapa",
    canonical_layers_present: 11,
    active_campaigns: 0,
    campaign_members: 0,
    protected_contracts: 0,
    data_updated_at: "2026-09-16T18:00:00.000Z",
    operational_state: "DATA_ONLY",
  },
  {
    municipality_code: "0501",
    municipality_name: "Escuintla",
    department_code: "05",
    department_name: "Escuintla",
    canonical_layers_present: 13,
    active_campaigns: 0,
    campaign_members: 0,
    protected_contracts: 0,
    data_updated_at: "2026-09-15T15:00:00.000Z",
    operational_state: "DATA_ONLY",
  },
  {
    municipality_code: "0502",
    municipality_name: "Santa Lucía Cotzumalguapa",
    department_code: "05",
    department_name: "Escuintla",
    canonical_layers_present: 12,
    active_campaigns: 0,
    campaign_members: 0,
    protected_contracts: 0,
    data_updated_at: "2026-09-15T15:00:00.000Z",
    operational_state: "DATA_ONLY",
  },
];
const layerNames = [
  "Rutas 340",
  "Núcleo electoral",
  "Demografía",
  "Padrón activo",
  "Históricos electorales",
  "Centros de votación",
  "JRV",
  "Lugares poblados",
  "Educación",
  "Salud",
  "Finanzas municipales",
  "Obras municipales",
  "SNIP",
  "PDM/PDM-OT",
  "Microrregiones",
  "COCODES",
  "TSE centros geo",
];
const layers = layerNames.map((label, index) => ({
  layer_id: label.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_"),
  layer_order: index + 1,
  label,
  domain:
    index < 7 ? "Electoral" : index < 10 ? "Territorio" : "Gestión pública",
  municipalities_present: index === 0 ? 340 : Math.max(1, 214 - index * 8),
  rows_without_status: 0,
  last_updated: now,
  status_counts: { VALIDATED: Math.max(1, 214 - index * 8) },
}));
const snapshot = {
  generated_at: now,
  contract: {
    context_fields: [
      "municipality_code",
      "campaign_id",
      "user_role",
      "permissions",
    ],
    country_code: "GT",
  },
  national: {
    municipalities: 340,
    departments: 22,
    municipalities_with_17_layers: 1,
    active_campaigns: 1,
    protected_contracts: 1,
    active_profiles: 3,
    last_data_update: now,
  },
  municipalities,
  vertical_qa: municipalities.slice(0, 2),
  layers,
  sources: [
    {
      source_id: "TSE-2023-CENTROS",
      layer_id: "TSE_CENTROS_GEO",
      source_label: "Tribunal Supremo Electoral",
      source_period: "2023",
      territorial_scale: "MUNICIPALITY",
      validation_status: "APPROVED",
    },
  ],
  campaigns: [
    {
      id: "campaign-qa-0509",
      name: "Alcaldía San José 2027",
      municipality_code: "0509",
      status: "active",
    },
  ],
  contracts: [
    {
      id: "contract-qa-0509",
      contract_ref: "RADAR-2027-0509",
      municipality_code: "0509",
      department_code: "05",
      client_organization_id: "organization-qa",
      valid_from: "2026-09-18",
      valid_until: "2027-12-31",
      status: "RESERVED",
      updated_at: now,
    },
  ],
  campaign_health: [
    {
      campaign_id: "campaign-qa-0509",
      municipality_code: "0509",
      voter_records: 38934,
      contacts: 0,
      activities: 0,
      fiscales: 0,
      rtd_records: 0,
      open_incidents: 0,
    },
  ],
  publication_batches: [
    {
      id: "batch-qa-1",
      dataset_key: "TSE · centros de votación",
      layer_id: "TSE_CENTROS_GEO",
      scope_type: "MUNICIPALITY",
      municipality_code: "0509",
      source_id: "TSE-2023-CENTROS",
      source_label: "Tribunal Supremo Electoral",
      source_period: "2023",
      row_count: 17,
      blocking_issues: 0,
      state: "PREVALIDATED",
    },
  ],
  publication_issues: [
    {
      id: "issue-qa-1",
      batch_id: "batch-qa-2",
      severity: "BLOCKER",
      issue_code: "PERIOD_REQUIRED",
      field_name: "source_period",
      message: "El período debe confirmarse antes de aprobar.",
    },
  ],
  pulse_measurements: [
    {
      id: "pulse-qa-1",
      folio: "PULSO-0509-001",
      version: 1,
      election_type: "ALCALDIA",
      scope_type: "MUNICIPALITY",
      municipality_code: "0509",
      field_start: "2026-09-01",
      field_end: "2026-09-05",
      sample_size: 400,
      result_count: 3,
      status: "PREVALIDADA",
      preview_hash: "qa-preview",
    },
    {
      id: "pulse-qa-2",
      folio: "PULSO-05-DIP-001",
      version: 1,
      election_type: "DIP_DIST",
      scope_type: "DEPARTMENT",
      department_code: "05",
      field_start: "2026-09-03",
      field_end: "2026-09-08",
      sample_size: 800,
      result_count: 5,
      status: "BORRADOR",
    },
  ],
  publication_states: { PREVALIDATED: 1 },
  pulse_states: { PREVALIDADA: 1, BORRADOR: 1 },
  rtd: [
    {
      campaign_id: "campaign-qa-0509",
      municipality_code: "0509",
      fiscales: 0,
      centers_received: 0,
      jrv_received: 0,
      drafts: 0,
      confirmed: 0,
      open_incidents: 1,
      last_update: now,
    },
  ],
  rtd_monitoring: [],
  qa_runs: [
    {
      id: "qa-1",
      suite: "Build + typecheck",
      status: "PASSED",
      git_branch: "superadmin/v70-national-qa",
      git_sha: "visual-preview",
      finished_at: now,
    },
  ],
  deployments: [],
  audit: [
    {
      id: "audit-1",
      action: "READ_SNAPSHOT",
      entity_type: "CONTROL_PLANE",
      reason: "Consulta operativa del superadministrador",
      actor_role: "super_admin",
      created_at: now,
    },
    {
      id: "audit-2",
      action: "CREATE_CONTRACT_RESERVATION",
      entity_type: "COMMERCIAL_CONTRACT",
      municipality_code: "0509",
      reason: "Reserva comercial aprobada",
      actor_role: "commercial_ops",
      created_at: "2026-09-18T02:50:00.000Z",
    },
  ],
  support: [],
  users: [
    {
      id: "user-qa-1",
      email: "administracion@radar.gt",
      display_name: "Administración RADAR",
      platform_role: "super_admin",
      mfa_enrolled: true,
      last_sign_in_at: now,
      banned_until: null,
    },
    {
      id: "user-qa-2",
      email: "datos@radar.gt",
      display_name: "Operación de datos",
      platform_role: "data_ops",
      mfa_enrolled: false,
      last_sign_in_at: "2026-09-17T18:00:00.000Z",
      banned_until: null,
    },
  ],
  operator_context: {
    user_id: "user-qa-1",
    user_role: "super_admin",
    permissions: ["*"],
    scopes: [{ country_code: "GT" }],
  },
};

const injection = `<script>(function(){
  localStorage.setItem("radar-supabase-session-v1",JSON.stringify({access_token:"qa-render-token",refresh_token:"qa-render-refresh",expires_at:Date.now()+3600000,token_type:"bearer"}));
  const snapshot=${JSON.stringify(snapshot)};
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=String(typeof input==="string"?input:input?.url||"");
    if(url.includes("/functions/v1/radar-admin-api")) return new Response(JSON.stringify({data:snapshot,request_id:"qa-visual-preview"}),{status:200,headers:{"Content-Type":"application/json"}});
    return nativeFetch(input,init);
  };
  document.addEventListener("DOMContentLoaded",function(){
    const badge=document.createElement("div"); badge.textContent="MUESTRA VISUAL · DATOS QA";
    badge.style.cssText="position:fixed;right:18px;bottom:16px;z-index:9999;padding:8px 11px;border-radius:20px;background:#552676;color:#fff;font:800 9px Inter,Arial;letter-spacing:.08em;box-shadow:0 8px 25px #0003";
    document.body.appendChild(badge);
  });
})();</script>`;

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"],
  [".json", "application/json"],
  [".png", "image/png"],
]);
const index = fs
  .readFileSync(path.join(dist, "index.html"), "utf8")
  .replace("</head>", `${injection}</head>`);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname,
  );
  const file = path.join(dist, pathname.replace(/^\/+/, ""));
  if (
    pathname === "/" ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(index);
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime.get(path.extname(file)) ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(response);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});

function findChrome() {
  const configured = process.env.RADAR_RENDER_CHROME?.trim();
  if (configured && fs.existsSync(configured)) return configured;
  for (const command of [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
  ]) {
    const probe = spawnSync("bash", ["-lc", `command -v ${command}`], {
      encoding: "utf8",
    });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  throw new Error("Chrome/Chromium not available");
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function waitForTarget() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await json(`http://127.0.0.1:${debugPort}/json/list`);
      const page = targets.find(
        (target) => target.type === "page" && target.webSocketDebuggerUrl,
      );
      if (page) return page;
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome DevTools target unavailable");
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
      const entry = pending.get(message.id);
      pending.delete(message.id);
      message.error
        ? entry.reject(new Error(message.error.message))
        : entry.resolve(message.result ?? {});
      return;
    }
    if (message.method && listeners.has(message.method))
      for (const listener of listeners.get(message.method))
        listener(message.params ?? {});
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
      const timer = setTimeout(() => {
        set.delete(handler);
        reject(new Error(`Timeout ${method}`));
      }, timeoutMs);
      const handler = (params) => {
        clearTimeout(timer);
        set.delete(handler);
        resolve(params);
      };
      set.add(handler);
      listeners.set(method, set);
    });
  }
  return { send, once, open, close: () => socket.close() };
}

const chromeProfile = fs.mkdtempSync(
  path.join(os.tmpdir(), "radar-superadmin-chrome-"),
);
const chromeErr = fs.openSync(path.join(out, "chrome.stderr.txt"), "w");
const browser = spawn(
  findChrome(),
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--disable-background-networking",
    "--no-first-run",
    "--window-size=1440,1100",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", chromeErr] },
);
const routes = [
  ["resumen", "/admin/resumen", "Resumen nacional", null, null],
  [
    "municipios",
    "/admin/municipios",
    "Municipios y campañas",
    "+ Nueva campaña",
    "Crear una campaña",
  ],
  [
    "exclusividad",
    "/admin/exclusividad",
    "Exclusividad comercial",
    null,
    null,
  ],
  [
    "usuarios",
    "/admin/usuarios",
    "Usuarios y permisos",
    null,
    null,
  ],
  ["data-vault", "/admin/data-vault", "Data Vault", null, null],
  [
    "publicaciones",
    "/admin/publicaciones",
    "Publicaciones",
    null,
    null,
  ],
  [
    "campaign-vault",
    "/admin/campaign-vault",
    "Campaign Vault",
    null,
    null,
  ],
  [
    "pulso",
    "/admin/pulso",
    "Pulso Electoral",
    "+ Nueva encuesta",
    "Cargar Pulso Electoral",
  ],
  ["rtd", "/admin/rtd", "RTD Día D", null, null],
  ["qa", "/admin/qa", "QA y despliegue", null, null],
  ["auditoria", "/admin/auditoria", "Auditoría", null, null],
  ["soporte", "/admin/soporte", "Soporte seguro", null, null],
];
const results = [];
let cdp;
try {
  const target = await waitForTarget();
  cdp = createCdp(target.webSocketDebuggerUrl);
  await cdp.open;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const [slug, route, marker, actionLabel, dialogMarker] of routes) {
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", {
      url: `http://127.0.0.1:${port}${route}`,
    });
    await loaded;
    await delay(1000);
    const evaluation = await cdp.send("Runtime.evaluate", {
      expression: "document.body?.innerText||''",
      returnByValue: true,
    });
    const bodyText = String(evaluation.result?.value ?? "");
    const navigation = await cdp.send("Runtime.evaluate", {
      expression: `JSON.stringify({
        pathname: location.pathname,
        links: Array.from(document.querySelectorAll('.superadmin-sidebar nav a')).map((link)=>link.getAttribute('href')),
        active: document.querySelector('.superadmin-sidebar nav a.active')?.getAttribute('href')||'',
        heroTitle: document.querySelector('.superadmin-hero h1')?.textContent?.trim()||''
      })`,
      returnByValue: true,
    });
    const navigationState = JSON.parse(
      String(navigation.result?.value ?? "{}"),
    );
    const capture = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true,
    });
    const screenshot = path.join(out, `${slug}.png`);
    fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
    const ok =
      bodyText.includes(marker) &&
      bodyText.includes("MUESTRA VISUAL · DATOS QA") &&
      navigationState.pathname === route &&
      navigationState.active === route &&
      navigationState.heroTitle === marker &&
      navigationState.links?.length === 12 &&
      fs.statSync(screenshot).size > 15_000;
    results.push({
      slug,
      route,
      ok,
      screenshot_bytes: fs.statSync(screenshot).size,
    });
    if (!ok) throw new Error(`Render failed: ${route}`);
    if (actionLabel) {
      await cdp.send("Runtime.evaluate", {
        expression: `Array.from(document.querySelectorAll('button')).find((button)=>button.textContent?.trim()===${JSON.stringify(actionLabel)})?.click()`,
      });
      await delay(250);
      const dialogTextResult = await cdp.send("Runtime.evaluate", {
        expression: "document.body?.innerText||''",
        returnByValue: true,
      });
      const dialogText = String(dialogTextResult.result?.value ?? "");
      const dialogCapture = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
        fromSurface: true,
      });
      const dialogScreenshot = path.join(out, `${slug}-asistente.png`);
      fs.writeFileSync(
        dialogScreenshot,
        Buffer.from(dialogCapture.data, "base64"),
      );
      const dialogOk =
        dialogText.includes(dialogMarker) &&
        fs.statSync(dialogScreenshot).size > 15_000;
      results.push({
        slug: `${slug}-asistente`,
        route,
        ok: dialogOk,
        screenshot_bytes: fs.statSync(dialogScreenshot).size,
      });
      if (!dialogOk) throw new Error(`Dialog render failed: ${route}`);
    }
  }
  fs.writeFileSync(
    path.join(out, "summary.json"),
    JSON.stringify({ status: "PASS", routes: results }, null, 2),
  );
  console.log(
    `SUPERADMIN_RENDER_OK ${results.filter((item) => item.ok).length}/${results.length}`,
  );
} finally {
  cdp?.close();
  server.close();
  browser.kill("SIGTERM");
  await delay(150);
  if (!browser.killed) browser.kill("SIGKILL");
  fs.closeSync(chromeErr);
  fs.rmSync(chromeProfile, { recursive: true, force: true });
}

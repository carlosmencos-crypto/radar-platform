import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist-render");
const out = path.join(root, "render-smoke-0509");
const port = 4179;
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

const chrome = findChrome();
const browserBaseArgs = [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync",
  "--metrics-recording-only", "--no-first-run", "--window-size=1440,1100", "--virtual-time-budget=5000",
];
const routes = [
  ["inicio", "/municipio/0509"],
  ["inteligencia", "/municipio/0509/inteligencia"],
  ["estrategia", "/municipio/0509/estrategia"],
  ["directorio", "/municipio/0509/directorio"],
  ["agenda", "/municipio/0509/agenda"],
  ["mapa", "/municipio/0509/mapa"],
  ["dia-d", "/municipio/0509/dia-d"],
  ["recursos", "/municipio/0509/recursos"],
  ["pulso", "/municipio/0509/pulso"],
  ["ia-radar", "/municipio/0509/ia-radar"],
  ["configuracion", "/municipio/0509/configuracion"],
];
const results = [];
try {
  for (const [slug, route] of routes) {
    const screenshot = path.join(out, `${slug}.png`);
    const url = `http://127.0.0.1:${port}${route}`;
    const run = spawnSync(chrome, [...browserBaseArgs, `--screenshot=${screenshot}`, url], {
      encoding: "utf8", timeout: 20000, maxBuffer: 4 * 1024 * 1024,
    });
    fs.writeFileSync(path.join(out, `${slug}.stderr.txt`), run.stderr ?? "");
    const screenshotBytes = fs.existsSync(screenshot) ? fs.statSync(screenshot).size : 0;
    const ok = run.status === 0 && screenshotBytes > 10_000;
    results.push({ slug, route, ok, status: run.status, signal: run.signal, error: run.error?.message ?? null, screenshotBytes });
    fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: ok ? "RUNNING" : "FAIL", routes: results }, null, 2));
    if (!ok) throw new Error(`Rendered screenshot failed: ${route}; see render-smoke-0509 diagnostics.`);
  }
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify({ status: "PASS", routes: results }, null, 2));
  console.log(`V70_RENDER_SMOKE_OK ${results.filter((item) => item.ok).length}/11 route screenshots rendered`);
} finally {
  server.close();
}

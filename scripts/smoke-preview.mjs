import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const municipalitiesSource = fs.readFileSync(path.join(root, "src/data/municipalities.ts"), "utf8");
const municipalityCodes = [...municipalitiesSource.matchAll(/\{ code: "(\d{4})", departmentCode:/g)].map((match) => match[1]);

if (municipalityCodes.length !== 340 || new Set(municipalityCodes).size !== 340) {
  throw new Error(`Municipality catalog mismatch: ${municipalityCodes.length}/340`);
}

const host = "127.0.0.1";
const port = 4173;
const baseUrl = `http://${host}:${port}`;
const preview = spawn("npm", ["run", "preview", "--", "--host", host, "--port", String(port)], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

let previewOutput = "";
preview.stdout.on("data", (chunk) => {
  previewOutput += chunk.toString();
});
preview.stderr.on("data", (chunk) => {
  previewOutput += chunk.toString();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // server not ready yet
    }
    await sleep(250);
  }
  throw new Error(`Preview server did not become ready. Output:\n${previewOutput}`);
}

async function checkRoute(route) {
  const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`${route} returned HTTP ${response.status}`);
  }
  if (!body.includes('id="root"')) {
    throw new Error(`${route} did not return the SPA shell`);
  }
  if (!body.includes("RADAR")) {
    throw new Error(`${route} did not return the canonical RADAR document`);
  }
  return route;
}

async function checkInBatches(routes, batchSize = 20) {
  const passed = [];
  for (let index = 0; index < routes.length; index += batchSize) {
    const batch = routes.slice(index, index + batchSize);
    passed.push(...(await Promise.all(batch.map(checkRoute))));
  }
  return passed;
}

async function shutdown() {
  if (preview.exitCode !== null) return;
  preview.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => preview.once("exit", resolve)),
    sleep(1500),
  ]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
}

try {
  await waitForServer();
  const goldenRoutes = ["/acceso", "/municipio/0509", "/municipio/1901"];
  await checkInBatches(goldenRoutes);

  const municipalityRoutes = municipalityCodes.map((code) => `/municipio/${code}`);
  const passed = await checkInBatches(municipalityRoutes);

  console.log(
    `PREVIEW_ROUTE_SMOKE_OK ${passed.length}/340 municipal deep links + /acceso + 0509/1901 · built SPA fallback verified · no deployment/cutover`,
  );
} finally {
  await shutdown();
}

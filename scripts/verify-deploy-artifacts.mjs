import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = new URL("../dist/", import.meta.url).pathname;
const assetsDir = join(distDir, "assets");
const maxTransportBytes = 740_000;

if (!existsSync(join(distDir, "index.html")) || !existsSync(assetsDir)) {
  throw new Error("Falta dist/. Ejecuta npm run build antes de verificar.");
}

const deployAssets = readdirSync(assetsDir)
  .filter((name) => /\.(?:js|css)$/.test(name))
  .map((name) => ({ name, path: join(assetsDir, name) }));

for (const asset of deployAssets) {
  const size = statSync(asset.path).size;
  if (size > maxTransportBytes) {
    throw new Error(
      `${asset.name} pesa ${size} bytes y supera el límite seguro de ${maxTransportBytes}.`,
    );
  }
  if (asset.name.endsWith(".js")) {
    execFileSync(process.execPath, ["--check", asset.path], { stdio: "inherit" });
  }
}

const html = readFileSync(join(distDir, "index.html"), "utf8");
const referencedAssets = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map(
  ([, name]) => name,
);

for (const name of referencedAssets) {
  if (!existsSync(join(assetsDir, name))) {
    throw new Error(`index.html referencia un archivo inexistente: assets/${name}`);
  }
}

console.log(`Deploy verificado: ${deployAssets.length} archivos JS/CSS dentro del límite seguro.`);

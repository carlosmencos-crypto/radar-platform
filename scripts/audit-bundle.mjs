import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

if (!fs.existsSync(dist)) throw new Error("Falta dist/. Ejecute el build antes de auditar.");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const files = walk(dist);
const relativeFiles = files.map((file) => path.relative(dist, file));
const sourceMaps = relativeFiles.filter((file) => file.endsWith(".map"));
if (sourceMaps.length) throw new Error(`Sourcemaps públicos encontrados: ${sourceMaps.join(", ")}`);

const text = files
  .filter((file) => /\.(?:html|js|css|json|svg|txt)$/i.test(file))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

const forbidden = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /radar-identidad-electoral\.carlos-mencos\.chatgpt\.site/i,
  /campaign-candidate-demo\.jpg/i,
  /campaign-party-logo-demo\.jpg/i,
  /Carlos Enrique Mencos Morales/i,
  /Ana Ruiz/i,
  /María José Garrido/i,
];

for (const pattern of forbidden) {
  if (pattern.test(text)) throw new Error(`Contenido no autorizado detectado por ${pattern}`);
}

if (/sourceMappingURL=/i.test(text)) throw new Error("Referencia a sourcemap detectada en el bundle.");

console.log(`BUNDLE_SECURITY_OK ${files.length} archivos · 0 sourcemaps · 0 secretos o datos privados detectados`);

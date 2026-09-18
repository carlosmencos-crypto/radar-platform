import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
  fs.readFileSync(path.join(root, "src/data/radarContract.generated.json"), "utf8"),
);

const municipalities = Object.values(contract.nav ?? {}).sort((a, b) =>
  a.municipality_code.localeCompare(b.municipality_code),
);
const codes = new Set(municipalities.map((row) => row.municipality_code));
const departments = new Set(municipalities.map((row) => row.department_code));

if (municipalities.length !== 340 || codes.size !== 340 || departments.size !== 22) {
  throw new Error(
    `Contrato municipal inválido: ${municipalities.length} filas, ${codes.size} códigos, ${departments.size} departamentos`,
  );
}
for (const required of ["0509", "1901"]) {
  if (!codes.has(required)) throw new Error(`Falta municipio QA ${required}`);
}

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const slug = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const values = municipalities.map((row) =>
  `('GT',${quote(row.municipality_code)},${quote(row.department_code)},${quote(row.department_name)},${quote(row.municipality_name)},${quote(slug(`${row.municipality_code}-${row.municipality_name}`))},false)`,
);

process.stdout.write(`-- QA-only canonical catalog generated from radarContract.generated.json.\n`);
process.stdout.write(`-- Contains territorial identifiers and names only; no electoral or private data.\n`);
process.stdout.write(`insert into public.municipalities(\n`);
process.stdout.write(`  country_code,municipality_code,department_code,department_name,municipality_name,slug,is_synthetic\n`);
process.stdout.write(`) values\n${values.join(",\n")}\n`);
process.stdout.write(`on conflict(country_code,municipality_code) do update set\n`);
process.stdout.write(`  department_code=excluded.department_code,\n`);
process.stdout.write(`  department_name=excluded.department_name,\n`);
process.stdout.write(`  municipality_name=excluded.municipality_name,\n`);
process.stdout.write(`  slug=excluded.slug,\n`);
process.stdout.write(`  is_synthetic=false;\n`);

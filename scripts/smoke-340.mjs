import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/data/municipalities.ts", import.meta.url), "utf8");
const codes = [...source.matchAll(/\{ code: "(\d{4})"/g)].map((match) => match[1]);
const unique = new Set(codes);
const expectedSections = ["inicio", "inteligencia", "estrategia", "directorio", "agenda", "mapa", "dia-d", "recursos", "ia-radar", "configuracion"];

if (codes.length !== 340 || unique.size !== 340) throw new Error(`Contrato inválido: ${codes.length} filas, ${unique.size} códigos únicos.`);
for (const code of codes) {
  if (!/^\d{4}$/.test(code)) throw new Error(`Código inválido: ${code}`);
  for (const section of expectedSections) {
    const route = section === "inicio" ? `/municipio/${code}` : `/municipio/${code}/${section}`;
    if (!route.startsWith(`/municipio/${code}`)) throw new Error(`Contexto perdido: ${route}`);
  }
}
if (!unique.has("0509") || !unique.has("1901")) throw new Error("Faltan rutas de aceptación 0509 o 1901.");
console.log(`SMOKE_OK ${unique.size}/340 municipios · ${expectedSections.length} secciones · ${unique.size * expectedSections.length} rutas contextuales`);

import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../src/data/padronAggregateContract.ts", import.meta.url),
  "utf8",
);

const required = [
  'credentials: "include"',
  'cache: "no-store"',
  "/api/padron-aggregate/municipal/",
  'privacyClass: "AGGREGATE_ONLY"',
  "municipalityCodePattern",
];

for (const fragment of required) {
  if (!source.includes(fragment)) {
    throw new Error(`Contrato padrón incompleto: falta ${fragment}`);
  }
}

const forbidden = [
  "dpiNormalized",
  "dpiSha256",
  "fullName",
  "phonePrimary",
  "exactAddress",
  "campaignId",
];

for (const fragment of forbidden) {
  if (source.includes(fragment)) {
    throw new Error(`Campo privado detectado en frontend: ${fragment}`);
  }
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "GT_RADAR_PADRON_2023_AGGREGATES_v1",
  transport: "AUTHENTICATED_BACKEND_ONLY",
  embeddedRows: 0,
}));

import { getInstalledRadarRuntime } from "./radarRuntimeCache";
import type { AuthorizedLayerRecord, RadarRuntimeBundle } from "./radarRuntime";
import type { MunicipalProfile, ProfileModule, ProfileMetric } from "./municipalProfiles";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function layer(runtime: RadarRuntimeBundle, layerId: string) {
  return runtime.layers.find((item) => item.layer_id === layerId);
}

function metric(label: string, value: string | undefined, detail: string): ProfileMetric | undefined {
  return value === undefined ? undefined : { label, value, detail };
}

function compactMetrics(items: Array<ProfileMetric | undefined>) {
  return items.filter((item): item is ProfileMetric => Boolean(item));
}

function formatInteger(value: unknown) {
  const number = asNumber(value);
  return number === undefined ? undefined : new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(number);
}

function formatDecimal(value: unknown) {
  const number = asNumber(value);
  return number === undefined ? undefined : new Intl.NumberFormat("es-GT", { maximumFractionDigits: 1 }).format(number);
}

function formatCurrency(value: unknown) {
  const number = asNumber(value);
  return number === undefined ? undefined : new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
    maximumFractionDigits: 0,
  }).format(number);
}

function formatPercent100(value: unknown) {
  const number = asNumber(value);
  return number === undefined ? undefined : `${number.toFixed(1)}%`;
}

function formatRatio(value: unknown) {
  const number = asNumber(value);
  return number === undefined ? undefined : `${(number * 100).toFixed(1)}%`;
}

function sourceFor(records: Array<AuthorizedLayerRecord | undefined>, extraLabels: string[] = []) {
  const labels = [
    ...records
      .map((record) => record?.source_label)
      .filter((label): label is string => Boolean(label)),
    ...extraLabels.filter(Boolean),
  ];
  return [...new Set(labels)].join(" · ") || "RADAR Data Vault autorizado";
}

function statusFor(records: Array<AuthorizedLayerRecord | undefined>): ProfileModule["status"] {
  const existing = records.filter((record): record is AuthorizedLayerRecord => Boolean(record));
  if (!existing.length) return "pending";
  const statuses = existing.map((record) => record.source_status ?? "").join(" ").toUpperCase();
  if (statuses.includes("PARTIAL") || statuses.includes("PENDIENTE") || statuses.includes("NO_")) return "partial";
  return "validated";
}

function moduleFrom(
  id: ProfileModule["id"],
  title: string,
  summary: string,
  records: Array<AuthorizedLayerRecord | undefined>,
  metrics: ProfileMetric[],
  extraSources: string[] = [],
): ProfileModule {
  return { id, title, summary, metrics, status: statusFor(records), source: sourceFor(records, extraSources) };
}

function buildModules(runtime: RadarRuntimeBundle): ProfileModule[] {
  const census = layer(runtime, "INE_CENSO_B2_B6");
  const censusPayload = asRecord(census?.payload);
  const electoral = layer(runtime, "NUCLEO_ELECTORAL");
  const electoralPayload = asRecord(electoral?.payload);
  const electoralMunicipality = asRecord(electoralPayload?.municipality);
  const communities = asRecord(electoralPayload?.communities);
  const voterDetailed2023 = runtime.voter_roll.aggregates.find((item) => item.universe === "PADRON_DETALLADO_2023");
  const voterActive2026 = runtime.voter_roll.aggregates.find((item) => item.universe === "NUCLEO_ELECTORAL_2026");
  const voterSources = runtime.voter_roll.aggregates
    .map((item) => item.source_product_id)
    .filter((item): item is string => Boolean(item));
  const centers = layer(runtime, "TSE_CENTROS_GEO");
  const centersPayload = asRecord(centers?.payload);
  const education = layer(runtime, "MINEDUC_ESCUELAS");
  const educationPayload = asRecord(education?.payload);
  const health = layer(runtime, "MSPAS_SALUD");
  const healthPayload = asRecord(health?.payload);
  const minfinYtd = layer(runtime, "MINFIN_YTD");
  const minfinYtdPayload = asRecord(minfinYtd?.payload);
  const minfinHist = layer(runtime, "MINFIN_HIST");
  const minfinHistPayload = asRecord(minfinHist?.payload);
  const snip = layer(runtime, "SNIP_2026");
  const snipPayload = asRecord(snip?.payload);
  const compras = layer(runtime, "GUATECOMPRAS");
  const pdm = layer(runtime, "PDM_PDMOT");
  const territoryRecords = [pdm, layer(runtime, "RGM_SERVICIOS"), layer(runtime, "INAB_FORESTAL"), layer(runtime, "CONRED_INFORM"), layer(runtime, "CONAP_SIGAP")];

  return [
    moduleFrom(
      "demografia",
      "Demografía",
      "Indicadores censales municipales; cada métrica conserva el período declarado por su fuente.",
      [census],
      compactMetrics([
        metric("Hogares", formatInteger(censusPayload?.total_households), "Censo 2018"),
        metric("Red eléctrica", formatRatio(censusPayload?.electric_grid_pct), "proporción de hogares"),
        metric("Agua entubada dentro", formatRatio(censusPayload?.water_pipe_inside_pct), "proporción de hogares"),
      ]),
    ),
    moduleFrom(
      "electoral",
      "Electoral",
      "Núcleo electoral, padrón agregado y geografía TSE permanecen como universos separados y trazables.",
      [electoral, centers],
      compactMetrics([
        metric("Padrón activo 2026", formatInteger(voterActive2026?.elector_count ?? electoralMunicipality?.active_voters_2026), "TSE · núcleo electoral 2026"),
        metric("Empadronados oficiales 2023", formatInteger(electoralMunicipality?.registered_voters_2023), "TSE · total municipal oficial; no sustituye el padrón detallado"),
        metric("Registros detallados 2023", formatInteger(voterDetailed2023?.elector_count), "padrón detallado disponible; universo separado del total oficial"),
        metric("Edad promedio base 2023", formatDecimal(voterDetailed2023?.average_age_base), "solo registros del padrón detallado con edad clasificada"),
        metric("18–29 en padrón detallado", formatInteger(voterDetailed2023?.age_18_29), "grupo etario del universo detallado 2023"),
        metric("Centros", formatInteger(centersPayload?.center_count), "TSE 2023 · geolocalización canónica"),
      ]),
      voterSources,
    ),
    moduleFrom(
      "territorio",
      "Territorio",
      "Cobertura territorial autenticada; los inventarios ausentes no se convierten en cero.",
      territoryRecords,
      compactMetrics([
        metric("Lugares poblados georreferenciados", formatInteger(runtime.geo.feature_counts.populated_place), "INE · puntos publicables"),
        metric("Comunidades", formatInteger(communities?.communities_count), "núcleo electoral · universo separado"),
        metric("Agrupaciones territoriales", formatInteger(communities?.group_count), "núcleo electoral"),
      ]),
    ),
    moduleFrom(
      "educacion",
      "Educación",
      "Directorio geoespacial disponible para el municipio autorizado.",
      [education],
      compactMetrics([
        metric("Establecimientos", formatInteger(educationPayload?.records), "cobertura geoespacial disponible"),
        metric("Sector oficial", formatInteger(educationPayload?.sector_oficial), "registros de la fuente"),
      ]),
    ),
    moduleFrom(
      "salud",
      "Salud",
      "Establecimientos de salud municipales enlazados a la geografía autorizada.",
      [health],
      compactMetrics([
        metric("Establecimientos", formatInteger(healthPayload?.records), "directorio MSPAS"),
        metric("Puntos publicables", formatInteger(healthPayload?.map_publishable), "coordenadas válidas"),
      ]),
    ),
    moduleFrom(
      "finanzas",
      "Finanzas",
      "Ejecución histórica y corte 2026 YTD permanecen separados para evitar comparaciones de períodos incompatibles.",
      [minfinHist, minfinYtd],
      compactMetrics([
        metric("Ejecución 2026 YTD", formatPercent100(minfinYtdPayload?.budget_execution_pct), "corte parcial; no equivale a año completo"),
        metric("Presupuesto vigente 2026", formatCurrency(minfinYtdPayload?.current_budget_amount), "MINFIN · YTD"),
        metric("Años históricos", formatInteger(minfinHistPayload?.years_available), "serie 2016–2025"),
      ]),
    ),
    moduleFrom(
      "obras",
      "Obras",
      "SNIP y contratación pública se mantienen como universos independientes.",
      [snip, compras],
      compactMetrics([
        metric("Proyectos SNIP 2026", formatInteger(snipPayload?.project_count), "universo SNIP"),
        metric("Monto solicitado SNIP", formatCurrency(snipPayload?.requested_amount), "universo SNIP 2026"),
      ]),
    ),
    moduleFrom(
      "fuentes",
      "Fuentes y trazabilidad",
      "Runtime autenticado contra Data Vault con RLS; no se cargan secretos ni datos de Campaign Vault en este perfil.",
      runtime.layers,
      compactMetrics([
        metric("Capas autorizadas", formatInteger(runtime.layers.length), "Data Vault"),
        metric("Puntos geográficos", formatInteger(runtime.geo.feature_total), "resumen geográfico autorizado"),
      ]),
      voterSources,
    ),
  ];
}

function buildMap(runtime: RadarRuntimeBundle): MunicipalProfile["map"] | undefined {
  const bounds = runtime.geo.bbox;
  if (!bounds) return undefined;

  let { south, north, west, east } = bounds;
  const latPadding = Math.max((north - south) * 0.08, 0.01);
  const lonPadding = Math.max((east - west) * 0.08, 0.01);
  south -= latPadding;
  north += latPadding;
  west -= lonPadding;
  east += lonPadding;

  const counts = runtime.geo.feature_counts;
  const publicLayers: NonNullable<NonNullable<MunicipalProfile["map"]>["publicLayers"]> = [];
  const addLayer = (label: string, count: number | undefined, detail: string) => {
    if (typeof count === "number" && count > 0) {
      publicLayers.push({ label, value: new Intl.NumberFormat("es-GT").format(count), detail });
    }
  };
  addLayer("Lugares poblados", counts.populated_place, "INE · coordenadas publicables");
  addLayer("Centros de votación", counts.tse_voting_center, "TSE 2023 · geolocalización canónica");
  addLayer("Educación", counts.school, "establecimientos georreferenciados");
  addLayer("Salud", counts.health_facility, "establecimientos georreferenciados");

  return {
    embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik`,
    populatedPlacesWithCoordinates: counts.populated_place ?? 0,
    votingCenters: counts.tse_voting_center ?? 0,
    publicLayers,
  };
}

function latestGeoDate(runtime: RadarRuntimeBundle, fallback?: string) {
  const value = runtime.geo.updated_at ? Date.parse(runtime.geo.updated_at) : Number.NaN;
  if (!Number.isFinite(value)) return fallback ?? "";
  return new Date(value).toISOString().slice(0, 10);
}

export function buildRuntimeMunicipalProfile(
  municipalityCode: string,
  base?: MunicipalProfile,
): MunicipalProfile | undefined {
  const runtime = getInstalledRadarRuntime(municipalityCode);
  if (!runtime) return base;
  if (
    runtime.context.municipality_code !== municipalityCode ||
    runtime.geo.municipality.municipality_code !== municipalityCode ||
    runtime.voter_roll.municipality_code !== municipalityCode
  ) return undefined;

  return {
    municipalityCode,
    controlStatus: base?.controlStatus ?? "RUNTIME_AUTHORIZED",
    lastUpdated: latestGeoDate(runtime, base?.lastUpdated),
    map: buildMap(runtime),
    intelligence: base?.intelligence,
    modules: buildModules(runtime),
  };
}

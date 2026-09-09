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

function payload(runtime: RadarRuntimeBundle, layerId: string) {
  return asRecord(layer(runtime, layerId)?.payload);
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

function sourceFor(records: Array<AuthorizedLayerRecord | undefined>) {
  const labels = records
    .map((record) => record?.source_label)
    .filter((label): label is string => Boolean(label));
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
): ProfileModule {
  return { id, title, summary, metrics, status: statusFor(records), source: sourceFor(records) };
}

function buildModules(runtime: RadarRuntimeBundle): ProfileModule[] {
  const census = layer(runtime, "INE_CENSO_B2_B6");
  const censusPayload = asRecord(census?.payload);
  const electoral = layer(runtime, "NUCLEO_ELECTORAL");
  const electoralPayload = asRecord(electoral?.payload);
  const electoralMunicipality = asRecord(electoralPayload?.municipality);
  const communities = asRecord(electoralPayload?.communities);
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
      "Núcleo electoral y geografía TSE consumidos como universos separados según el contrato canónico.",
      [electoral, centers],
      compactMetrics([
        metric("Padrón activo 2026", formatInteger(electoralMunicipality?.active_voters_2026), "TSE · núcleo electoral"),
        metric("Empadronados 2023", formatInteger(electoralMunicipality?.registered_voters_2023), "universo electoral 2023"),
        metric("Centros", formatInteger(centersPayload?.center_count), "TSE 2023 · geolocalización canónica"),
      ]),
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
        metric("Puntos geográficos", formatInteger(runtime.geo.features.length), "bundle municipal autorizado"),
      ]),
    ),
  ];
}

function buildMap(runtime: RadarRuntimeBundle): MunicipalProfile["map"] | undefined {
  const coordinates = runtime.geo.features
    .filter((feature) => typeof feature.latitude === "number" && typeof feature.longitude === "number")
    .map((feature) => ({ latitude: feature.latitude as number, longitude: feature.longitude as number }));
  if (!coordinates.length) return undefined;

  const latitudes = coordinates.map((point) => point.latitude);
  const longitudes = coordinates.map((point) => point.longitude);
  let south = Math.min(...latitudes);
  let north = Math.max(...latitudes);
  let west = Math.min(...longitudes);
  let east = Math.max(...longitudes);
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
    populatedPlacesWithCoordinates: counts.populated_place ?? coordinates.filter((_, index) => runtime.geo.features[index]?.feature_type === "populated_place").length,
    votingCenters: counts.tse_voting_center ?? coordinates.filter((_, index) => runtime.geo.features[index]?.feature_type === "tse_voting_center").length,
    publicLayers,
  };
}

function latestGeoDate(runtime: RadarRuntimeBundle, fallback?: string) {
  const timestamps = runtime.geo.features
    .map((feature) => Date.parse(feature.updated_at))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return fallback ?? "";
  return new Date(Math.max(...timestamps)).toISOString().slice(0, 10);
}

export function buildRuntimeMunicipalProfile(
  municipalityCode: string,
  base?: MunicipalProfile,
): MunicipalProfile | undefined {
  const runtime = getInstalledRadarRuntime(municipalityCode);
  if (!runtime) return base;
  if (
    runtime.context.municipality_code !== municipalityCode ||
    runtime.geo.municipality.municipality_code !== municipalityCode
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

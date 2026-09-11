import { getInstalledRadarRuntime } from "./radarRuntimeCache";
import type { AuthorizedLayerRecord, RadarRuntimeBundle } from "./radarRuntime";
import type { MunicipalProfile, ProfileModule, ProfileMetric } from "./municipalProfiles";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function formatSignedInteger(value: unknown) {
  const number = asNumber(value);
  if (number === undefined) return undefined;
  const formatted = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(Math.abs(number));
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatted}`;
}

function formatSignedRatio(value: unknown) {
  const number = asNumber(value);
  if (number === undefined) return undefined;
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${Math.abs(number * 100).toFixed(1)}%`;
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
  const comprasPayload = asRecord(compras?.payload);
  const pdm = layer(runtime, "PDM_PDMOT");
  const pdmPayload = asRecord(pdm?.payload);
  const services = layer(runtime, "RGM_SERVICIOS");
  const servicesPayload = asRecord(services?.payload);
  const forest = layer(runtime, "INAB_FORESTAL");
  const forestPayload = asRecord(forest?.payload);
  const risk = layer(runtime, "CONRED_INFORM");
  const riskPayload = asRecord(risk?.payload);
  const protectedAreas = layer(runtime, "CONAP_SIGAP");
  const protectedPayload = asRecord(protectedAreas?.payload);
  const nutrition = layer(runtime, "SESAN_TALLA");
  const nutritionPayload = asRecord(nutrition?.payload);
  const territoryRecords = [pdm, services, forest, risk, protectedAreas];

  const activeVoters = asNumber(voterActive2026?.elector_count ?? electoralMunicipality?.active_voters_2026);
  const womenVoters = asNumber(electoralMunicipality?.women_2026);
  const menVoters = activeVoters !== undefined && womenVoters !== undefined ? activeVoters - womenVoters : undefined;
  const forestNetChange = asNumber(forestPayload?.net_change_ha);

  return [
    moduleFrom(
      "demografia",
      "Demografía y condiciones de hogar",
      "Indicadores censales municipales de hogares; cada métrica conserva el período 2018 y no se interpreta como padrón electoral.",
      [census],
      compactMetrics([
        metric("Hogares", formatInteger(censusPayload?.total_households), "INE · Censo 2018"),
        metric("Red eléctrica", formatRatio(censusPayload?.electric_grid_pct), "proporción de hogares"),
        metric("Agua entubada dentro", formatRatio(censusPayload?.water_pipe_inside_pct), "proporción de hogares"),
        metric("Drenaje sanitario", formatRatio(censusPayload?.sanitary_drainage_pct), "proporción de hogares"),
        metric("Recolección de basura", formatRatio(censusPayload?.garbage_collection_pct), "proporción de hogares"),
        metric("Internet", formatRatio(censusPayload?.internet_pct), "proporción de hogares"),
      ]),
    ),
    moduleFrom(
      "electoral",
      "Electoral",
      "Núcleo electoral 2026, total oficial 2023, padrón detallado agregado y geografía TSE permanecen como universos separados y trazables.",
      [electoral, centers],
      compactMetrics([
        metric("Padrón activo 2026", formatInteger(activeVoters), "TSE · núcleo electoral 2026"),
        metric("Mujeres 2026", formatInteger(womenVoters), "TSE · padrón activo agregado"),
        metric("Hombres 2026", formatInteger(menVoters), "diferencia aritmética del total y mujeres de la misma fuente"),
        metric("Alfabetismo registrado", formatRatio(electoralMunicipality?.literacy_share_2026), "TSE · padrón activo 2026"),
        metric("18–35 años", formatInteger(electoralMunicipality?.age_18_35_2026), "TSE · padrón activo 2026"),
        metric("Peso 18–35", formatRatio(electoralMunicipality?.age_18_35_share_2026), "sobre padrón activo 2026"),
        metric("Empadronados oficiales 2023", formatInteger(electoralMunicipality?.registered_voters_2023), "TSE · total municipal oficial; no sustituye el padrón detallado"),
        metric("Variación 2023→2026", formatSignedRatio(electoralMunicipality?.electorate_change_2023_2026), "comparación indicativa entre totales oficiales"),
        metric("Registros detallados 2023", formatInteger(voterDetailed2023?.elector_count), "padrón detallado agregado; universo separado del total oficial"),
        metric("Edad promedio base 2023", formatDecimal(voterDetailed2023?.average_age_base), "solo registros detallados con edad clasificada"),
        metric("18–29 detallado 2023", formatInteger(voterDetailed2023?.age_18_29), "universo detallado 2023"),
        metric("30–44 detallado 2023", formatInteger(voterDetailed2023?.age_30_44), "universo detallado 2023"),
        metric("45–59 detallado 2023", formatInteger(voterDetailed2023?.age_45_59), "universo detallado 2023"),
        metric("60+ detallado 2023", formatInteger(voterDetailed2023?.age_60_plus), "universo detallado 2023"),
        metric("Centros", formatInteger(centersPayload?.center_count), "TSE 2023 · geolocalización canónica"),
        metric("Ganador municipal 2023", asText(electoralMunicipality?.winner_2023), "Memoria electoral · organización política"),
        metric("Votos ganador 2023", formatInteger(electoralMunicipality?.winner_votes_2023), "Memoria electoral"),
        metric("Margen 2023", formatInteger(electoralMunicipality?.margin_votes_2023), "votos sobre segundo lugar"),
        metric("Margen sobre válidos", formatRatio(electoralMunicipality?.margin_share_valid_2023), "Memoria electoral"),
        metric("Organizaciones 2023", formatInteger(electoralMunicipality?.organizations_2023), "competencia municipal registrada"),
      ]),
      voterSources,
    ),
    moduleFrom(
      "territorio",
      "Territorio, servicios y contexto",
      "Capas territoriales autenticadas; lugares, servicios, ambiente y riesgo conservan sus propios períodos y no se colapsan en un score único.",
      territoryRecords,
      compactMetrics([
        metric("Lugares poblados georreferenciados", formatInteger(runtime.geo.feature_counts.populated_place), "INE · puntos publicables"),
        metric("Comunidades electorales", formatInteger(communities?.communities_count), "núcleo electoral · universo separado"),
        metric("Agrupaciones territoriales", formatInteger(communities?.group_count), "núcleo electoral"),
        metric("Índice de servicios públicos", formatRatio(servicesPayload?.indice_servicios_publicos), `${asText(servicesPayload?.periodo) ?? "2020–2021"} · ${asText(servicesPayload?.indice_servicios_publicos_categoria) ?? "categoría fuente"}`),
        metric("Agua urbana", formatRatio(servicesPayload?.agua_cobertura_urbana), "RGM · cobertura declarada"),
        metric("Agua rural", formatRatio(servicesPayload?.agua_cobertura_rural), "RGM · cobertura declarada"),
        metric("Cobertura forestal 2020", formatDecimal(forestPayload?.forest_cover_2020_ha), "hectáreas · INAB"),
        metric("Cambio forestal 2016–2020", forestNetChange === undefined ? undefined : `${formatSignedInteger(forestNetChange)} ha`, `${asText(forestPayload?.trend) ?? "tendencia fuente"}`),
        metric("Riesgo INFORM", formatDecimal(riskPayload?.inform_risk), "CONRED · índice 2021"),
        metric("Rango nacional INFORM", formatInteger(riskPayload?.national_rank), "posición nacional declarada por la fuente"),
        metric("Áreas protegidas asociadas", formatInteger(protectedPayload?.explicit_protected_area_count), "CONAP · asociación explícita"),
        metric("Documento PDM/PDM-OT", formatInteger(pdmPayload?.document_count), `${asText(pdmPayload?.document_type) ?? "documento"} · inventario vigente`),
      ]),
    ),
    moduleFrom(
      "educacion",
      "Educación",
      "Directorio geoespacial disponible para el municipio autorizado, con desagregaciones de nivel y sector preservadas.",
      [education],
      compactMetrics([
        metric("Establecimientos", formatInteger(educationPayload?.records), "cobertura geoespacial disponible"),
        metric("Sector oficial", formatInteger(educationPayload?.sector_oficial), "registros de la fuente"),
        metric("Sector municipal", formatInteger(educationPayload?.sector_municipal), "registros de la fuente"),
        metric("Sector cooperativa", formatInteger(educationPayload?.sector_cooperativa), "registros de la fuente"),
        metric("Preprimaria", formatInteger(educationPayload?.level_preprimaria), "registros por nivel"),
        metric("Primaria", formatInteger(educationPayload?.level_primaria), "registros por nivel"),
        metric("Básico", formatInteger(educationPayload?.level_basico), "registros por nivel"),
        metric("Diversificado", formatInteger(educationPayload?.level_diversificado), "registros por nivel"),
      ]),
    ),
    moduleFrom(
      "salud",
      "Salud",
      "Establecimientos MSPAS enlazados a la geografía autorizada; la presencia registral no implica capacidad, horario o disponibilidad clínica.",
      [health],
      compactMetrics([
        metric("Establecimientos", formatInteger(healthPayload?.records), "directorio MSPAS"),
        metric("Puntos publicables", formatInteger(healthPayload?.map_publishable), "coordenadas válidas"),
        metric("Puestos de Salud", formatInteger(healthPayload?.["Puesto de Salud"]), "categoría fuente"),
        metric("Centros de Salud", formatInteger(healthPayload?.["Centro de Salud"]), "categoría fuente"),
        metric("CAP", formatInteger(healthPayload?.CAP), "categoría fuente"),
        metric("CAIMI", formatInteger(healthPayload?.CAIMI), "categoría fuente"),
        metric("Hospitales", formatInteger(healthPayload?.Hospital), "categoría fuente"),
        metric("Farmacias PROAM", formatInteger(healthPayload?.["Farmacia PROAM"]), "categoría fuente"),
      ]),
    ),
    moduleFrom(
      "finanzas",
      "Finanzas municipales",
      "Ejecución histórica y corte 2026 YTD permanecen separados para evitar comparaciones de períodos incompatibles.",
      [minfinHist, minfinYtd],
      compactMetrics([
        metric("Ejecución 2026 YTD", formatPercent100(minfinYtdPayload?.budget_execution_pct), "corte parcial; no equivale a año completo"),
        metric("Presupuesto vigente 2026", formatCurrency(minfinYtdPayload?.current_budget_amount), "MINFIN · YTD"),
        metric("Devengado 2026 YTD", formatCurrency(minfinYtdPayload?.accrued_amount), "MINFIN · YTD"),
        metric("Pagado 2026 YTD", formatCurrency(minfinYtdPayload?.paid_amount), "MINFIN · YTD"),
        metric("Inversión vigente 2026", formatCurrency(minfinYtdPayload?.investment_current_amount), "universo de inversión municipal del corte"),
        metric("Inversión devengada 2026", formatCurrency(minfinYtdPayload?.investment_accrued_amount), "universo de inversión municipal del corte"),
        metric("Ingresos percibidos 2016–2025", formatCurrency(minfinHistPayload?.ingresos_percibidos_10y), "serie histórica acumulada"),
        metric("Egresos devengados 2016–2025", formatCurrency(minfinHistPayload?.egresos_devengados_10y), "serie histórica acumulada"),
        metric("Ejecución media de ingresos", formatRatio(minfinHistPayload?.avg_pct_ejecucion_ingresos), "promedio de la serie histórica"),
        metric("Ejecución media de egresos", formatRatio(minfinHistPayload?.avg_pct_ejecucion_egresos), "promedio de la serie histórica"),
      ]),
    ),
    moduleFrom(
      "obras",
      "Obras, proyectos y contratación",
      "SNIP y Guatecompras se mantienen como universos independientes; publicación contractual no equivale a avance físico ni financiero.",
      [snip, compras],
      compactMetrics([
        metric("Proyectos SNIP 2026", formatInteger(snipPayload?.project_count), "universo SNIP"),
        metric("Monto solicitado SNIP", formatCurrency(snipPayload?.requested_amount), "universo SNIP 2026"),
        metric("Contratos publicados", formatInteger(comprasPayload?.contracts_total), "Guatecompras · 2025 + 2026 YTD"),
        metric("Contratos 2025", formatInteger(comprasPayload?.contracts_2025), "Guatecompras"),
        metric("Valor contractual 2025", formatCurrency(comprasPayload?.contract_value_2025_gtq), "Guatecompras; no implica ejecución física"),
        metric("Contratos 2026 YTD", formatInteger(comprasPayload?.contracts_2026_ytd), "Guatecompras · corte parcial"),
        metric("Valor contractual 2026 YTD", formatCurrency(comprasPayload?.contract_value_2026_ytd_gtq), "Guatecompras; corte parcial"),
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
        metric("Comunidades padrón detallado 2023", formatInteger(voterDetailed2023?.community_count), "agregado; sin PII individual"),
        metric("Escuelas georreferenciadas", formatInteger(runtime.geo.feature_counts.school), "resumen geográfico autorizado"),
        metric("Salud georreferenciada", formatInteger(runtime.geo.feature_counts.health_facility), "resumen geográfico autorizado"),
        metric("Centros TSE georreferenciados", formatInteger(runtime.geo.feature_counts.tse_voting_center), "resumen geográfico autorizado"),
        metric("Escolares analizados SESAN", formatInteger(nutritionPayload?.analyzed_students), "Censo de talla 2024"),
        metric("Prevalencia de retardo en talla", formatPercent100(nutritionPayload?.stunting_prevalence_pct), `${asText(nutritionPayload?.nutritional_vulnerability_category) ?? "categoría fuente"} · SESAN 2024`),
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

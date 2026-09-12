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

function formatSignedInteger(value: number | undefined) {
  if (value === undefined) return "";
  const absolute = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}${absolute}`;
}

function formatSignedRatio(value: number | undefined) {
  if (value === undefined) return "";
  return `${value >= 0 ? "+" : "−"}${(Math.abs(value) * 100).toFixed(1)}%`;
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
  const demographicSources = runtime.demographics?.source_label ? [runtime.demographics.source_label] : [];
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
  const rgm = layer(runtime, "RGM_SERVICIOS");
  const rgmPayload = asRecord(rgm?.payload);
  const forest = layer(runtime, "INAB_FORESTAL");
  const forestPayload = asRecord(forest?.payload);
  const risk = layer(runtime, "CONRED_INFORM");
  const riskPayload = asRecord(risk?.payload);
  const conap = layer(runtime, "CONAP_SIGAP");
  const conapPayload = asRecord(conap?.payload);
  const sesan = layer(runtime, "SESAN_TALLA");
  const sesanPayload = asRecord(sesan?.payload);
  const territoryRecords = [pdm, rgm, forest, risk, conap];

  return [
    moduleFrom(
      "demografia",
      "Demografía",
      "Proyección poblacional oficial y condiciones de los hogares se mantienen por período y universo.",
      [census],
      compactMetrics([
        metric("Proyección 2026", formatInteger(runtime.demographics?.population_total), "INE · población municipal proyectada"),
        metric("Mujeres proyectadas", formatInteger(runtime.demographics?.population_female), "INE · proyección por sexo"),
        metric("Hombres proyectados", formatInteger(runtime.demographics?.population_male), "INE · proyección por sexo"),
        metric("Hogares", formatInteger(censusPayload?.total_households), "Censo 2018"),
        metric("Red eléctrica", formatRatio(censusPayload?.electric_grid_pct), "proporción de hogares"),
        metric("Agua entubada dentro", formatRatio(censusPayload?.water_pipe_inside_pct), "proporción de hogares"),
        metric("Drenaje sanitario", formatRatio(censusPayload?.sanitary_drainage_pct), "proporción de hogares"),
        metric("Internet", formatRatio(censusPayload?.internet_pct), "proporción de hogares"),
      ]),
      demographicSources,
    ),
    moduleFrom(
      "electoral",
      "Electoral",
      "Núcleo electoral, padrón agregado y geografía TSE permanecen como universos separados y trazables.",
      [electoral, centers],
      compactMetrics([
        metric("Padrón activo 2026", formatInteger(voterActive2026?.elector_count ?? electoralMunicipality?.active_voters_2026), "TSE · núcleo electoral 2026"),
        metric("Mujeres 2026", formatInteger(electoralMunicipality?.women_2026), "TSE · núcleo electoral"),
        metric("18–35 años", formatInteger(electoralMunicipality?.age_18_35_2026), "TSE · núcleo electoral"),
        metric("Alfabetismo registrado", formatRatio(electoralMunicipality?.literacy_share_2026), "TSE · núcleo electoral"),
        metric("Empadronados oficiales 2023", formatInteger(electoralMunicipality?.registered_voters_2023), "TSE · total municipal oficial; universo separado"),
        metric("Registros detallados 2023", formatInteger(voterDetailed2023?.elector_count), "padrón detallado agregado"),
        metric("Ganador 2023", typeof electoralMunicipality?.winner_2023 === "string" ? electoralMunicipality.winner_2023 : undefined, "corporación municipal"),
        metric("Margen 2023", formatInteger(electoralMunicipality?.margin_votes_2023), "votos frente al segundo lugar"),
        metric("Centros", formatInteger(centersPayload?.center_count), "TSE 2023 · geolocalización canónica"),
      ]),
      voterSources,
    ),
    moduleFrom(
      "territorio",
      "Territorio",
      "Capas territoriales oficiales conectadas al expediente municipal; ausencias de fuente no se convierten en cero.",
      territoryRecords,
      compactMetrics([
        metric("Lugares poblados georreferenciados", formatInteger(runtime.geo.feature_counts.populated_place), "INE · puntos publicables"),
        metric("Comunidades", formatInteger(communities?.communities_count), "núcleo electoral · universo separado"),
        metric("Agrupaciones territoriales", formatInteger(communities?.group_count), "núcleo electoral"),
        metric("Índice de servicios públicos", formatDecimal(rgmPayload?.indice_servicios_publicos), "RGM 2020–2021"),
        metric("Cobertura forestal 2020", formatInteger(forestPayload?.forest_cover_2020_ha), "hectáreas"),
        metric("Cambio forestal 2016–2020", formatDecimal(forestPayload?.net_change_ha), "hectáreas"),
        metric("Riesgo INFORM", formatDecimal(riskPayload?.inform_risk), "CONRED 2021"),
        metric("Áreas protegidas asociadas", formatInteger(conapPayload?.explicit_protected_area_count), "asociación explícita en fuente"),
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
        metric("Preprimaria", formatInteger(educationPayload?.level_preprimaria), "registros"),
        metric("Primaria", formatInteger(educationPayload?.level_primaria), "registros"),
        metric("Básico", formatInteger(educationPayload?.level_basico), "registros"),
        metric("Diversificado", formatInteger(educationPayload?.level_diversificado), "registros"),
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
        metric("Puestos de salud", formatInteger(healthPayload?.["Puesto de Salud"]), "MSPAS"),
        metric("Centros de salud", formatInteger(healthPayload?.["Centro de Salud"]), "MSPAS"),
        metric("Hospitales", formatInteger(healthPayload?.Hospital), "MSPAS"),
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
        metric("Devengado 2026", formatCurrency(minfinYtdPayload?.accrued_amount), "MINFIN · YTD"),
        metric("Pagado 2026", formatCurrency(minfinYtdPayload?.paid_amount), "MINFIN · YTD"),
        metric("Inversión vigente", formatCurrency(minfinYtdPayload?.investment_current_amount), "MINFIN · YTD"),
        metric("Años históricos", formatInteger(minfinHistPayload?.years_available), "serie 2016–2025"),
        metric("Ingresos percibidos 10 años", formatCurrency(minfinHistPayload?.ingresos_percibidos_10y), "2016–2025"),
        metric("Egresos devengados 10 años", formatCurrency(minfinHistPayload?.egresos_devengados_10y), "2016–2025"),
      ]),
    ),
    moduleFrom(
      "obras",
      "Obras",
      "SNIP y contratación pública se mantienen como universos independientes para evitar dobles conteos.",
      [snip, compras],
      compactMetrics([
        metric("Proyectos SNIP 2026", formatInteger(snipPayload?.project_count), "universo SNIP"),
        metric("Monto solicitado SNIP", formatCurrency(snipPayload?.requested_amount), "universo SNIP 2026"),
        metric("Contratos publicados", formatInteger(comprasPayload?.contracts_total), "Guatecompras 2025 + 2026 YTD"),
        metric("Valor contratado 2025", formatCurrency(comprasPayload?.contract_value_2025_gtq), "Guatecompras"),
        metric("Valor contratado 2026 YTD", formatCurrency(comprasPayload?.contract_value_2026_ytd_gtq), "Guatecompras"),
      ]),
    ),
    moduleFrom(
      "fuentes",
      "Fuentes y trazabilidad",
      "Runtime autenticado contra Data Vault con RLS; Campaign Vault permanece separado de la inteligencia municipal.",
      runtime.layers,
      compactMetrics([
        metric("Capas autorizadas", formatInteger(runtime.layers.length), "Data Vault"),
        metric("Puntos geográficos", formatInteger(runtime.geo.feature_total), "resumen geográfico autorizado"),
        metric("Comunidades de padrón", formatInteger(voterDetailed2023?.community_count), "agregado 2023"),
        metric("Escuelas georreferenciadas", formatInteger(runtime.geo.feature_counts.school), "mapa"),
        metric("Salud georreferenciada", formatInteger(runtime.geo.feature_counts.health_facility), "mapa"),
        metric("Centros TSE georreferenciados", formatInteger(runtime.geo.feature_counts.tse_voting_center), "mapa"),
        metric("Prevalencia de talla baja", formatPercent100(sesanPayload?.stunting_prevalence_pct), "SESAN 2024"),
      ]),
      [...voterSources, ...demographicSources],
    ),
  ];
}

function buildIntelligence(runtime: RadarRuntimeBundle, base?: MunicipalProfile["intelligence"]): MunicipalProfile["intelligence"] {
  const electoralPayload = asRecord(layer(runtime, "NUCLEO_ELECTORAL")?.payload);
  const municipality = asRecord(electoralPayload?.municipality);
  const communities = asRecord(electoralPayload?.communities);
  const centersPayload = asRecord(layer(runtime, "TSE_CENTROS_GEO")?.payload);
  const activeAggregate = runtime.voter_roll.aggregates.find((item) => item.universe === "NUCLEO_ELECTORAL_2026");
  const detailed = runtime.voter_roll.aggregates.find((item) => item.universe === "PADRON_DETALLADO_2023");

  const active = asNumber(activeAggregate?.elector_count ?? municipality?.active_voters_2026) ?? 0;
  const women = asNumber(municipality?.women_2026);
  const men = women === undefined ? undefined : Math.max(active - women, 0);
  const registered2023 = asNumber(municipality?.registered_voters_2023);
  const growth = registered2023 === undefined ? undefined : active - registered2023;
  const literacyShare = asNumber(municipality?.literacy_share_2026);
  const literate = literacyShare === undefined ? undefined : Math.round(active * literacyShare);
  const unregisteredLiteracy = literate === undefined ? undefined : Math.max(active - literate, 0);
  const detailedTotal = asNumber(detailed?.elector_count) ?? 0;
  const ageRows: Array<[string, number | undefined]> = [
    ["18–29", asNumber(detailed?.age_18_29)],
    ["30–44", asNumber(detailed?.age_30_44)],
    ["45–59", asNumber(detailed?.age_45_59)],
    ["60+", asNumber(detailed?.age_60_plus)],
  ];
  const ages = detailedTotal > 0
    ? ageRows.flatMap(([label, value]) => value === undefined ? [] : [{
      label,
      value: formatInteger(value) ?? "0",
      share: value / detailedTotal * 100,
    }])
    : base?.ages ?? [];

  return {
    populationProjection: formatInteger(runtime.demographics?.population_total) ?? base?.populationProjection ?? "",
    voterRegister: formatInteger(active) ?? base?.voterRegister ?? "",
    voterWomen: formatInteger(women) ?? base?.voterWomen ?? "",
    voterMen: formatInteger(men) ?? base?.voterMen ?? "",
    votingCenters: formatInteger(centersPayload?.center_count) ?? base?.votingCenters ?? "",
    votingBoards: base?.votingBoards ?? "",
    communityRecords: formatInteger(communities?.communities_count) ?? base?.communityRecords ?? "",
    territorialGroups: formatInteger(communities?.group_count) ?? base?.territorialGroups ?? "",
    registerCut: base?.registerCut ?? "2026",
    registerGrowth: formatSignedInteger(growth) || base?.registerGrowth || "",
    registerGrowthRate: formatSignedRatio(asNumber(municipality?.electorate_change_2023_2026)) || base?.registerGrowthRate || "",
    literacyRate: formatRatio(literacyShare) ?? base?.literacyRate ?? "",
    literatePeople: formatInteger(literate) ?? base?.literatePeople ?? "",
    womenLiteracy: base?.womenLiteracy ?? "",
    menLiteracy: base?.menLiteracy ?? "",
    literacyUnregistered: formatInteger(unregisteredLiteracy) ?? base?.literacyUnregistered ?? "",
    ages,
    censusPopulation: base?.censusPopulation ?? "",
    censusUrban: base?.censusUrban ?? "",
    censusUrbanShare: base?.censusUrbanShare ?? 0,
    censusRural: base?.censusRural ?? "",
    censusRuralShare: base?.censusRuralShare ?? 0,
    projectionMen: formatInteger(runtime.demographics?.population_male) ?? base?.projectionMen ?? "",
    projectionWomen: formatInteger(runtime.demographics?.population_female) ?? base?.projectionWomen ?? "",
  };
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
    runtime.voter_roll.municipality_code !== municipalityCode ||
    (runtime.demographics !== null && runtime.demographics.municipality_code !== municipalityCode)
  ) return undefined;

  return {
    municipalityCode,
    controlStatus: runtime.layers.length >= 16 ? "CONTROL_VALIDADO" : (base?.controlStatus ?? "RUNTIME_AUTHORIZED"),
    lastUpdated: latestGeoDate(runtime, base?.lastUpdated),
    map: buildMap(runtime),
    intelligence: buildIntelligence(runtime, base?.intelligence),
    modules: buildModules(runtime),
  };
}

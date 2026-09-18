import type { AuthorizedLayerRecord, RadarRuntimeBundle } from "./radarRuntime";

export type MunicipalSignal = {
  title: string;
  detail: string;
  value: string;
  source: string;
  tone?: "alert" | "opportunity";
};

export type MunicipalHistoricalElection = {
  year: 2011 | 2015 | 2019 | 2023;
  winner: string | null;
  winnerVotes: number | null;
  runnerUp: string | null;
  runnerUpVotes: number | null;
  turnout: number | null;
  votesCast: number | null;
  validVotes: number | null;
  marginVotes: number | null;
};

export type MunicipalIntelligenceModel = {
  municipalityCode: string;
  municipalityName: string;
  departmentName: string;
  activeElectors: number | null;
  registered2023: number | null;
  projectedElectors2027: number | null;
  participationReference: number | null;
  magicNumber: number | null;
  women: number | null;
  men: number | null;
  age18To35: number | null;
  literacyShare: number | null;
  centers: number | null;
  jrv: number | null;
  communities: number | null;
  territorialGroups: number | null;
  population: number | null;
  populationWomen: number | null;
  populationMen: number | null;
  projectionYear: number | null;
  historicalElections: MunicipalHistoricalElection[];
  priorities: MunicipalSignal[];
  opportunities: MunicipalSignal[];
  payload: (layerId: string) => Record<string, unknown>;
  layer: (layerId: string) => AuthorizedLayerRecord | undefined;
};

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function formatInteger(value: number | null) {
  return value === null ? "No publicado" : new Intl.NumberFormat("es-GT").format(value);
}

export function formatDecimal(value: number | null, digits = 1) {
  return value === null
    ? "No publicado"
    : value.toLocaleString("es-GT", { maximumFractionDigits: digits });
}

export function formatPercent(value: number | null, fraction = true, digits = 1) {
  return value === null
    ? "No publicado"
    : `${(fraction ? value * 100 : value).toLocaleString("es-GT", { maximumFractionDigits: digits })}%`;
}

export function formatCurrency(value: number | null) {
  return value === null
    ? "No publicado"
    : new Intl.NumberFormat("es-GT", {
        style: "currency",
        currency: "GTQ",
        maximumFractionDigits: 0,
      }).format(value);
}

function assertLayerScope(runtime: RadarRuntimeBundle, layer: AuthorizedLayerRecord) {
  const payload = record(layer.payload);
  const nestedMunicipality = record(payload.municipality);
  const codes = [
    textValue(payload.municipality_code),
    textValue(nestedMunicipality.municipality_code),
  ].filter((value): value is string => Boolean(value));
  if (codes.some((code) => code !== runtime.context.municipality_code)) {
    throw new Error(`RADAR_CROSS_MUNICIPAL_LAYER_BLOCKED:${layer.layer_id}`);
  }
}

function annualElectorGrowth(active: number | null, registered2023: number | null) {
  if (active === null || registered2023 === null || active <= 0 || registered2023 <= 0) return null;
  return Math.pow(active / registered2023, 1 / 3);
}

function strategicRound(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const step = value >= 5_000 ? 1_000 : 500;
  return Math.max(step, Math.round(value / step) * step);
}

export function buildMunicipalIntelligenceModel(runtime: RadarRuntimeBundle): MunicipalIntelligenceModel {
  const municipalityCode = runtime.context.municipality_code;
  if (
    runtime.geo.municipality.municipality_code !== municipalityCode ||
    runtime.voter_roll.municipality_code !== municipalityCode ||
    (runtime.demographics && runtime.demographics.municipality_code !== municipalityCode)
  ) {
    throw new Error("RADAR_CROSS_MUNICIPAL_RUNTIME_BLOCKED");
  }

  const layerMap = new Map<string, AuthorizedLayerRecord>();
  for (const item of runtime.layers) {
    if (layerMap.has(item.layer_id)) throw new Error(`RADAR_DUPLICATE_LAYER:${item.layer_id}`);
    assertLayerScope(runtime, item);
    layerMap.set(item.layer_id, item);
  }
  const layer = (layerId: string) => layerMap.get(layerId);
  const payload = (layerId: string) => record(layer(layerId)?.payload);

  const nucleus = payload("NUCLEO_ELECTORAL");
  const municipality = record(nucleus.municipality);
  const centersJrv = record(nucleus.centers_jrv);
  const communitiesPayload = record(nucleus.communities);
  const activeAggregate = runtime.voter_roll.aggregates.find((item) => item.universe === "NUCLEO_ELECTORAL_2026");
  const detailedAggregate = runtime.voter_roll.aggregates.find((item) => item.universe === "PADRON_DETALLADO_2023");
  const activeElectors = finite(municipality.active_voters_2026) ?? activeAggregate?.elector_count ?? null;
  const registered2023 = finite(municipality.registered_voters_2023) ?? detailedAggregate?.elector_count ?? null;
  const women = finite(municipality.women_2026);
  const men = activeElectors !== null && women !== null ? Math.max(0, activeElectors - women) : null;
  const growth = annualElectorGrowth(activeElectors, registered2023);
  const projectedElectors2027 = activeElectors !== null && growth !== null
    ? Math.floor(activeElectors * growth)
    : null;

  const municipalElection = record(payload("TREP_2023_CENTER_RESULTS_CORPORACION_MUNICIPAL").election);
  const participationReference = finite(municipalElection.turnout_counted);
  const leaderShare = finite(municipalElection.leader_share);
  const magicNumber = strategicRound(
    projectedElectors2027 !== null && participationReference !== null && leaderShare !== null
      ? projectedElectors2027 * participationReference * leaderShare
      : null,
  );

  const historicalElections: MunicipalHistoricalElection[] = ([2011, 2015, 2019, 2023] as const).map((year) => ({
    year,
    winner: textValue(municipality[`winner_${year}`]),
    winnerVotes: year === 2023 ? finite(municipalElection.leader_votes) ?? finite(municipality.winner_votes_2023) : null,
    runnerUp: year === 2023 ? textValue(municipalElection.runner_up) ?? textValue(municipality.runner_up_2023) : null,
    runnerUpVotes: year === 2023 ? finite(municipalElection.runner_up_votes) ?? finite(municipality.runner_up_votes_2023) : null,
    turnout: year === 2023 ? participationReference : null,
    votesCast: year === 2023 ? finite(municipalElection.votes_cast_counted) : null,
    validVotes: year === 2023 ? finite(municipalElection.valid_votes) : null,
    marginVotes: year === 2023 ? finite(municipalElection.margin_votes) ?? finite(municipality.margin_votes_2023) : null,
  }));

  const census = payload("INE_CENSO_B2_B6");
  const nutrition = payload("SESAN_TALLA");
  const risk = payload("CONRED_INFORM");
  const finance = payload("MINFIN_YTD");
  const schools = payload("MINEDUC_ESCUELAS");
  const health = payload("MSPAS_SALUD");
  const forest = payload("INAB_FORESTAL");
  const projects = payload("SNIP_2026");
  const protectedAreas = payload("CONAP_SIGAP");

  const priorityPool: Array<{ score: number; signal: MunicipalSignal }> = [];
  const water = finite(census.water_pipe_inside_pct);
  if (water !== null) priorityPool.push({ score: 1 - water, signal: { tone: "alert", title: "Agua dentro de la vivienda", value: formatPercent(water), detail: "Cobertura censal que conviene verificar por comunidad.", source: "INE · Censo 2018" } });
  const drainage = finite(census.sanitary_drainage_pct);
  if (drainage !== null) priorityPool.push({ score: 1 - drainage, signal: { tone: "alert", title: "Drenaje sanitario", value: formatPercent(drainage), detail: "Proporción de hogares conectados según el censo.", source: "INE · Censo 2018" } });
  const burned = finite(census.garbage_burned_pct);
  if (burned !== null) priorityPool.push({ score: burned, signal: { tone: "alert", title: "Gestión de residuos", value: formatPercent(burned), detail: "Hogares que reportaron quemar la basura.", source: "INE · Censo 2018" } });
  const stunting = finite(nutrition.stunting_prevalence_pct);
  if (stunting !== null) priorityPool.push({ score: stunting / 100, signal: { tone: "alert", title: "Nutrición escolar", value: formatPercent(stunting, false), detail: `${formatInteger(finite(nutrition.analyzed_students))} estudiantes evaluados · ${textValue(nutrition.nutritional_vulnerability_category) ?? "categoría no publicada"}.`, source: "SESAN · 2024" } });
  const riskValue = finite(risk.inform_risk);
  if (riskValue !== null) priorityPool.push({ score: riskValue / 10, signal: { tone: "alert", title: "Riesgo territorial", value: formatDecimal(riskValue), detail: `Puesto nacional ${formatInteger(finite(risk.national_rank))}; requiere lectura preventiva local.`, source: "CONRED INFORM · 2021" } });
  const execution = finite(finance.budget_execution_pct);
  if (execution !== null) priorityPool.push({ score: 1 - execution / 100, signal: { tone: "alert", title: "Ejecución presupuestaria", value: formatPercent(execution, false), detail: "Corte 2026 YTD; no equivale al cierre anual.", source: "MINFIN · 2026 YTD" } });

  const opportunityPool: Array<{ score: number; signal: MunicipalSignal }> = [];
  const schoolCount = finite(schools.records);
  if (schoolCount !== null) opportunityPool.push({ score: schoolCount, signal: { tone: "opportunity", title: "Red educativa territorial", value: formatInteger(schoolCount), detail: `${formatInteger(finite(schools.level_primaria))} registros de primaria y ${formatInteger(finite(schools.level_basico))} de básico.`, source: "MINEDUC · alcance documentado" } });
  const healthCount = finite(health.records);
  if (healthCount !== null) opportunityPool.push({ score: healthCount, signal: { tone: "opportunity", title: "Red de salud", value: formatInteger(healthCount), detail: `${formatInteger(finite(health.map_publishable))} establecimientos georreferenciados.`, source: "MSPAS · directorio vigente" } });
  const forestCover = finite(forest.forest_cover_2020_ha);
  if (forestCover !== null) opportunityPool.push({ score: forestCover, signal: { tone: "opportunity", title: "Cobertura forestal", value: `${formatDecimal(forestCover)} ha`, detail: `${textValue(forest.trend)?.replaceAll("_", " ") ?? "Tendencia no publicada"}; cambio neto ${formatDecimal(finite(forest.net_change_ha))} ha.`, source: "INAB · 2016–2020" } });
  const projectCount = finite(projects.project_count);
  if (projectCount !== null) opportunityPool.push({ score: projectCount, signal: { tone: "opportunity", title: "Cartera de inversión", value: formatInteger(projectCount), detail: `${formatCurrency(finite(projects.requested_amount))} solicitados; universo SNIP separado.`, source: "SNIP · 2026" } });
  const protectedCount = finite(protectedAreas.explicit_protected_area_count);
  if (protectedCount !== null) opportunityPool.push({ score: protectedCount, signal: { tone: "opportunity", title: "Patrimonio natural", value: formatInteger(protectedCount), detail: textValue(protectedAreas.management_categories) ?? "Asociación explícita publicada.", source: "CONAP · asociación explícita" } });
  const communityCount = finite(communitiesPayload.communities_count);
  if (communityCount !== null) opportunityPool.push({ score: communityCount, signal: { tone: "opportunity", title: "Red comunitaria", value: formatInteger(communityCount), detail: `${formatInteger(finite(communitiesPayload.group_count))} agrupaciones territoriales para organizar escucha y presencia.`, source: "TSE · núcleo electoral" } });

  return {
    municipalityCode,
    municipalityName: runtime.context.municipality_name,
    departmentName: runtime.context.department_name,
    activeElectors,
    registered2023,
    projectedElectors2027,
    participationReference,
    magicNumber,
    women,
    men,
    age18To35: finite(municipality.age_18_35_2026),
    literacyShare: finite(municipality.literacy_share_2026),
    centers: finite(centersJrv.physical_locations),
    jrv: finite(centersJrv.jrv),
    communities: communityCount,
    territorialGroups: finite(communitiesPayload.group_count),
    population: runtime.demographics?.population_total ?? null,
    populationWomen: runtime.demographics?.population_female ?? null,
    populationMen: runtime.demographics?.population_male ?? null,
    projectionYear: runtime.demographics?.projection_year ?? null,
    historicalElections,
    priorities: priorityPool.sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.signal),
    opportunities: opportunityPool.sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.signal),
    payload,
    layer,
  };
}

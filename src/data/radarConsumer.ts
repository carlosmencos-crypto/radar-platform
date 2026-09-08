import { findMunicipality } from "./municipalities";
import {
  CANONICAL_CONTRACT_PRODUCTS,
  CANONICAL_LAYER_DEFINITIONS,
  EMPTY_COVERAGE_BY_LAYER,
  NAV_CONTRACT_340,
  RENDER_STATE_RULES,
  ROUTE_MODULE_STATES_5780,
  RUNTIME_GATE_340,
} from "./radarContract.generated";
import type {
  AvailabilityState,
  CanonicalCoverageStatus,
  CanonicalFrontendAction,
  CanonicalLayerId,
  CanonicalRenderRule,
  CanonicalSpecialState,
  ConsumerModule,
  MunicipalProfileModuleId,
  RadarMunicipalConsumer,
} from "../types/radar";

const UI_PROFILE_BY_LAYER: Record<CanonicalLayerId, MunicipalProfileModuleId> = {
  ROUTES_340: "fuentes",
  NUCLEO_ELECTORAL: "electoral",
  RGM_SERVICIOS: "territorio",
  INAB_FORESTAL: "territorio",
  CONRED_INFORM: "territorio",
  CONAP_SIGAP: "territorio",
  INE_CENSO_B2_B6: "demografia",
  SESAN_TALLA: "salud",
  PDM_PDMOT: "territorio",
  MSPAS_SALUD: "salud",
  MINEDUC_ESCUELAS: "educacion",
  MINFIN_HIST: "finanzas",
  MINFIN_YTD: "finanzas",
  SNIP_2026: "obras",
  GUATECOMPRAS: "obras",
  ACTIVOS_RESUMEN: "finanzas",
  TSE_CENTROS_GEO: "electoral",
};

function coverageStatus(action: CanonicalFrontendAction, layerId: CanonicalLayerId): CanonicalCoverageStatus {
  if (action === "SHOW") return "ANY_NON_EMPTY";
  if (action === "SHOW_PARTIAL_SCOPE") return "READY_PARTIAL_SCOPE";
  if (action === "HIDE_POST_LAUNCH") return "POST_LAUNCH";

  const emptyCoverage = EMPTY_COVERAGE_BY_LAYER[layerId];
  if (!emptyCoverage) throw new Error(`Contrato canónico incompleto para ${layerId}`);
  return emptyCoverage;
}

function resolveRenderRule(action: CanonicalFrontendAction, layerId: CanonicalLayerId): CanonicalRenderRule {
  const canonicalCoverage = coverageStatus(action, layerId);
  const rule = RENDER_STATE_RULES.find((candidate) => candidate.coverage_status === canonicalCoverage);
  if (!rule || rule.status !== "PASS") throw new Error(`RENDER_STATE_RULES no resolvió ${layerId}`);
  return rule;
}

function uiAvailability(rule: CanonicalRenderRule): AvailabilityState {
  if (rule.render_state === "AVAILABLE") return "disponible";
  if (rule.render_state === "PARTIAL" || rule.render_state === "EMPTY_EXPLICIT") return "parcial";
  if (rule.render_state === "PENDING") return "pendiente";
  return "no_publicado";
}

function specialState(rule: CanonicalRenderRule): CanonicalSpecialState {
  if (rule.render_state === "NOT_PUBLISHED") return "NOT_PUBLISHED";
  if (rule.empty_reason === "NO_EXPLICIT_ASSOCIATION") return "NO_EXPLICIT_ASSOCIATION";
  if (rule.empty_reason === "NO_RECORD_IN_SOURCE") return "NO_RECORD_IN_SOURCE";
  return null;
}

export function resolveCanonicalRouteModules(municipalityCode: string): ConsumerModule[] | undefined {
  const actions = ROUTE_MODULE_STATES_5780[municipalityCode];
  const gate = RUNTIME_GATE_340[municipalityCode];
  const navigation = NAV_CONTRACT_340[municipalityCode];

  if (!actions || !gate || !navigation || gate.status !== "PASS") return undefined;
  if (
    actions.length !== gate.expected_module_rows ||
    actions.length !== gate.observed_module_rows ||
    navigation.route_path !== gate.route_path ||
    navigation.department_code !== gate.department_code ||
    gate.route_path_mismatches !== 0 ||
    gate.department_mismatches !== 0
  ) return undefined;

  const visibleModules = actions.filter((action) => action !== "HIDE_POST_LAUNCH").length;
  const emptyStateModules = actions.filter((action) => action === "SHOW_WITH_EMPTY_STATE").length;
  if (
    visibleModules !== gate.expected_visible_modules ||
    visibleModules !== gate.observed_visible_modules ||
    emptyStateModules !== gate.expected_empty_state_modules ||
    emptyStateModules !== gate.observed_empty_state_modules
  ) return undefined;

  return CANONICAL_LAYER_DEFINITIONS.map((definition, index) => {
    const frontendAction = actions[index];
    const renderRule = resolveRenderRule(frontendAction, definition.layer_id);
    return {
      id: definition.layer_id,
      layer_id: definition.layer_id,
      layer_order: definition.layer_order,
      ui_profile_id: UI_PROFILE_BY_LAYER[definition.layer_id],
      label: definition.label,
      state: uiAvailability(renderRule),
      special_state: specialState(renderRule),
      vault: "data",
      source: `${definition.domain} · ${definition.period}`,
      frontend_action: frontendAction,
      coverage_status: renderRule.coverage_status,
      render_rule: renderRule,
      natural_key: definition.natural_key,
      primary: { format: definition.primary_asset_format, url: definition.primary_asset_url },
      fallback: { format: "GOOGLE_SHEET", url: definition.fallback_sheet_url },
      preferred_mode: definition.preferred_mode,
      period: definition.period,
      product_status: definition.status,
      null_semantics: definition.null_semantics,
      guardrail: definition.guardrail,
      traceability: {
        registry: CANONICAL_CONTRACT_PRODUCTS.registry,
        release_index: CANONICAL_CONTRACT_PRODUCTS.releaseIndex,
        route_modules: CANONICAL_CONTRACT_PRODUCTS.routeModules,
        natural_key_value: `municipality_code=${municipalityCode}`,
      },
    };
  });
}

export function resolveRadarConsumer(municipalityCode?: string): RadarMunicipalConsumer | undefined {
  const municipality = findMunicipality(municipalityCode);
  if (!municipality) return undefined;

  const navigation = NAV_CONTRACT_340[municipality.code];
  const runtimeGate = RUNTIME_GATE_340[municipality.code];
  const modules = resolveCanonicalRouteModules(municipality.code);
  if (
    !navigation ||
    !runtimeGate ||
    !modules ||
    navigation.department_code !== municipality.departmentCode ||
    navigation.route_path !== `/municipio/${municipality.code}`
  ) return undefined;

  return {
    context: {
      municipality_code: municipality.code,
      campaign_id: "public-demo",
      user_role: "public_viewer",
      permissions: ["data_vault:read_public"],
    },
    municipality,
    navigation,
    runtime_gate: runtimeGate,
    modules,
  };
}

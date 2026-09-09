import type { Municipality } from "./territory";

export type AvailabilityState = "disponible" | "parcial" | "pendiente" | "no_publicado";
export type UserRole = "public_viewer" | "municipal_admin" | "campaign_operator" | "national_admin";

export type CanonicalLayerId =
  | "ROUTES_340"
  | "NUCLEO_ELECTORAL"
  | "RGM_SERVICIOS"
  | "INAB_FORESTAL"
  | "CONRED_INFORM"
  | "CONAP_SIGAP"
  | "INE_CENSO_B2_B6"
  | "SESAN_TALLA"
  | "PDM_PDMOT"
  | "MSPAS_SALUD"
  | "MINEDUC_ESCUELAS"
  | "MINFIN_HIST"
  | "MINFIN_YTD"
  | "SNIP_2026"
  | "GUATECOMPRAS"
  | "ACTIVOS_RESUMEN"
  | "TSE_CENTROS_GEO";

export type CanonicalFrontendAction =
  | "SHOW"
  | "SHOW_WITH_EMPTY_STATE"
  | "SHOW_PARTIAL_SCOPE"
  | "HIDE_POST_LAUNCH";

export type CanonicalCoverageStatus =
  | "ANY_NON_EMPTY"
  | "READY_PARTIAL_SCOPE"
  | "POST_LAUNCH"
  | "NO_DOCUMENT_IN_INVENTORY"
  | "NO_CONTRACTS_PUBLISHED"
  | "NO_EXPLICIT_ASSOCIATION_IN_SOURCE"
  | "NO_RECORD_IN_SOURCE";

export type CanonicalRenderState = "AVAILABLE" | "PARTIAL" | "PENDING" | "NOT_PUBLISHED" | "EMPTY_EXPLICIT";
export type CanonicalSpecialState = "NOT_PUBLISHED" | "NO_EXPLICIT_ASSOCIATION" | "NO_RECORD_IN_SOURCE" | null;
export type MunicipalProfileModuleId = "demografia" | "electoral" | "territorio" | "educacion" | "salud" | "finanzas" | "obras" | "fuentes";

export interface CanonicalContractProducts {
  registry: "GT_RADAR_REGISTRO_CONSUMO_FRONTEND_17_v2";
  releaseIndex: "GT_RADAR_FRONTEND_RELEASE_INDEX_340_v1";
  navContract: "NAV_CONTRACT_340";
  routeModules: "ROUTE_MODULES_5780";
  renderRules: "RENDER_STATE_RULES";
  runtimeGate: "RUNTIME_GATE_340";
}

export interface CanonicalLayerDefinition {
  layer_order: number;
  layer_id: CanonicalLayerId;
  label: string;
  domain: string;
  period: string;
  coverage: string;
  status: string;
  natural_key: string;
  preferred_mode: string;
  primary_asset_format: string;
  primary_asset_url: string;
  fallback_sheet_url: string;
  schema_status: string;
  null_semantics: string;
  guardrail: string;
}

export interface CanonicalNavContract {
  municipality_code: string;
  department_code: string;
  department_name: string;
  municipality_name: string;
  search_label: string;
  route_path: string;
  comparator_key: string;
  department_selector_label: string;
  municipality_selector_label: string;
  release_status: string;
}

export interface CanonicalRenderRule {
  rule_order: number;
  source_condition: string;
  coverage_status: CanonicalCoverageStatus;
  render_state: CanonicalRenderState;
  module_visible: boolean;
  empty_reason: "NONE" | "PARTIAL_SCOPE" | "POST_LAUNCH" | "DOCUMENT_NOT_IN_INVENTORY" | "NO_CONTRACTS_PUBLISHED" | "NO_EXPLICIT_ASSOCIATION" | "NO_RECORD_IN_SOURCE";
  ui_copy_key: string;
  zero_semantics: "SOURCE_VALUE" | "NEVER_ZERO";
  expected_rows: number;
  observed_rows: number;
  status: "PASS";
}

export interface CanonicalRuntimeGate {
  municipality_code: string;
  route_path: string;
  department_code: string;
  expected_module_rows: number;
  observed_module_rows: number;
  expected_visible_modules: number;
  observed_visible_modules: number;
  expected_empty_state_modules: number;
  observed_empty_state_modules: number;
  route_path_mismatches: number;
  department_mismatches: number;
  status: "PASS";
}

export interface RadarContextKey {
  municipality_code: string;
  campaign_id: string | null;
  user_role: string;
  permissions: string[];
}

export interface ConsumerModule {
  id: CanonicalLayerId;
  layer_id: CanonicalLayerId;
  layer_order: number;
  ui_profile_id: MunicipalProfileModuleId;
  label: string;
  state: AvailabilityState;
  special_state: CanonicalSpecialState;
  vault: "data";
  source?: string;
  frontend_action: CanonicalFrontendAction;
  coverage_status: CanonicalCoverageStatus;
  render_rule: CanonicalRenderRule;
  natural_key: string;
  primary: { format: string; url: string };
  fallback: { format: "GOOGLE_SHEET"; url: string };
  preferred_mode: string;
  period: string;
  product_status: string;
  null_semantics: string;
  guardrail: string;
  traceability: {
    registry: CanonicalContractProducts["registry"];
    release_index: CanonicalContractProducts["releaseIndex"];
    route_modules: CanonicalContractProducts["routeModules"];
    natural_key_value: string;
  };
}

export interface RadarMunicipalConsumer {
  context: RadarContextKey;
  municipality: Municipality;
  navigation: CanonicalNavContract;
  runtime_gate: CanonicalRuntimeGate;
  modules: ConsumerModule[];
}

// Generated adapter for GT_RADAR_FRONTEND_RELEASE_INDEX_340_v1 (2026-08-13).
// Do not hand-edit contract values. The compact matrix reconstructs ROUTE_MODULES_5780 exactly.
import data from "./radarContract.generated.json";
import type {
  CanonicalContractProducts,
  CanonicalFrontendAction,
  CanonicalLayerDefinition,
  CanonicalNavContract,
  CanonicalRenderRule,
  CanonicalRuntimeGate,
} from "../types/radar";

export const CANONICAL_CONTRACT_PRODUCTS = data.products as CanonicalContractProducts;
export const CANONICAL_LAYER_DEFINITIONS = data.layers as CanonicalLayerDefinition[];
export const NAV_CONTRACT_340 = data.nav as Record<string, CanonicalNavContract>;
export const ROUTE_MODULE_STATES_5780 = data.route_states as Record<string, CanonicalFrontendAction[]>;
export const RENDER_STATE_RULES = data.render_rules as CanonicalRenderRule[];
export const RUNTIME_GATE_340 = data.runtime_gate as Record<string, CanonicalRuntimeGate>;
export const EMPTY_COVERAGE_BY_LAYER = data.empty_coverage_by_layer as Record<string, CanonicalRenderRule["coverage_status"]>;

import { supabase } from "../lib/supabase";
import { loadDemoBundle } from "./demoVault";
import type {
  AuthorizedRadarContext,
  AvailabilityState,
  CanonicalLayerId,
  CanonicalSpecialState,
  ConsumerModule,
  MunicipalProfileModuleId,
  RadarLayerRecord,
  RadarMunicipalConsumer,
} from "../types/radar";
import type { Municipality } from "../types/territory";

const LAYERS: ReadonlyArray<{
  layer_id: CanonicalLayerId;
  label: string;
  ui_profile_id: MunicipalProfileModuleId;
}> = [
  { layer_id: "ROUTES_340", label: "Ruta municipal", ui_profile_id: "fuentes" },
  { layer_id: "NUCLEO_ELECTORAL", label: "Núcleo electoral", ui_profile_id: "electoral" },
  { layer_id: "RGM_SERVICIOS", label: "Servicios municipales", ui_profile_id: "territorio" },
  { layer_id: "INAB_FORESTAL", label: "Cobertura forestal", ui_profile_id: "territorio" },
  { layer_id: "CONRED_INFORM", label: "Riesgo territorial", ui_profile_id: "territorio" },
  { layer_id: "CONAP_SIGAP", label: "Áreas protegidas", ui_profile_id: "territorio" },
  { layer_id: "INE_CENSO_B2_B6", label: "Censo y demografía", ui_profile_id: "demografia" },
  { layer_id: "SESAN_TALLA", label: "Nutrición", ui_profile_id: "salud" },
  { layer_id: "PDM_PDMOT", label: "Planificación municipal", ui_profile_id: "territorio" },
  { layer_id: "MSPAS_SALUD", label: "Salud pública", ui_profile_id: "salud" },
  { layer_id: "MINEDUC_ESCUELAS", label: "Educación", ui_profile_id: "educacion" },
  { layer_id: "MINFIN_HIST", label: "Finanzas históricas", ui_profile_id: "finanzas" },
  { layer_id: "MINFIN_YTD", label: "Finanzas del período", ui_profile_id: "finanzas" },
  { layer_id: "SNIP_2026", label: "Inversión pública 2026", ui_profile_id: "obras" },
  { layer_id: "GUATECOMPRAS", label: "Contratación pública", ui_profile_id: "obras" },
  { layer_id: "ACTIVOS_RESUMEN", label: "Activos municipales", ui_profile_id: "finanzas" },
  { layer_id: "TSE_CENTROS_GEO", label: "Centros electorales", ui_profile_id: "electoral" },
];

function availability(record?: RadarLayerRecord): AvailabilityState {
  if (!record) return "no_publicado";
  const status = record.source_status?.toUpperCase() ?? "AVAILABLE";
  if (status.includes("NOT_PUBLISHED")) return "no_publicado";
  if (status.includes("PARTIAL") || status.includes("NO_EXPLICIT") || status.includes("NO_RECORD")) return "parcial";
  if (status.includes("PENDING")) return "pendiente";
  return "disponible";
}

function specialState(record?: RadarLayerRecord): CanonicalSpecialState {
  const status = record?.source_status?.toUpperCase() ?? "";
  if (status.includes("NOT_PUBLISHED")) return "NOT_PUBLISHED";
  if (status.includes("NO_EXPLICIT_ASSOCIATION")) return "NO_EXPLICIT_ASSOCIATION";
  if (status.includes("NO_RECORD_IN_SOURCE")) return "NO_RECORD_IN_SOURCE";
  return null;
}

function assertContext(value: unknown): AuthorizedRadarContext {
  const row = value as Partial<AuthorizedRadarContext> | null;
  if (!row || !row.country_code || !row.municipality_id || !row.municipality_name || !row.campaign_id || !row.user_role) {
    throw new Error("No existe un contexto municipal autorizado para esta sesión.");
  }
  if (!Array.isArray(row.permissions)) throw new Error("El servidor no devolvió permisos válidos.");
  return row as AuthorizedRadarContext;
}

export async function loadRadarConsumer(routeKind: "municipality" | "demo", routeKey: string): Promise<RadarMunicipalConsumer> {
  if (!supabase) throw new Error("Supabase no está configurado.");

  const { data: contextRows, error: contextError } = await supabase.rpc("radar_authorized_context", {
    route_kind: routeKind,
    route_key: routeKey,
  });
  if (contextError) throw contextError;
  const context = assertContext(Array.isArray(contextRows) ? contextRows[0] : contextRows);

  const { data: layerRows, error: layersError } = await supabase.rpc("radar_authorized_layers", {
    route_kind: routeKind,
    route_key: routeKey,
  });
  if (layersError) throw layersError;
  const layers = (Array.isArray(layerRows) ? layerRows : []) as RadarLayerRecord[];
  const byLayer = new Map(layers.map((layer) => [layer.layer_id, layer]));

  const municipality: Municipality = {
    code: context.municipality_code,
    departmentCode: context.department_code,
    name: context.municipality_name,
    department: context.department_name,
  };
  const modules: ConsumerModule[] = LAYERS.map((definition, index) => {
    const record = byLayer.get(definition.layer_id);
    return {
      id: definition.layer_id,
      layer_id: definition.layer_id,
      layer_order: index + 1,
      ui_profile_id: definition.ui_profile_id,
      label: definition.label,
      state: availability(record),
      special_state: specialState(record),
      vault: "data",
      source: record?.source_label ?? record?.synthetic_notice ?? undefined,
    };
  });

  const demo = context.is_demo ? await loadDemoBundle(context.campaign_id) : undefined;

  return {
    context: {
      country_code: context.country_code,
      municipality_code: context.municipality_code,
      campaign_id: context.campaign_id,
      user_role: context.user_role,
      permissions: context.permissions,
    },
    municipality,
    modules,
    layers,
    is_demo: context.is_demo,
    campaign_name: context.campaign_name,
    demo,
  };
}

export function getLayer(consumer: RadarMunicipalConsumer, layerId: CanonicalLayerId) {
  return consumer.layers.find((layer) => layer.layer_id === layerId);
}

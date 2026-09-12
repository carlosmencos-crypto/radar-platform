export interface AuthorizedRadarContext {
  country_code: string;
  municipality_id: string;
  municipality_code: string;
  municipality_name: string;
  department_code: string;
  department_name: string;
  campaign_id: string | null;
  campaign_name: string | null;
  user_role: string;
  permissions: string[];
  is_demo: boolean;
}

export interface AuthorizedLayerRecord {
  layer_id: string;
  period: string | null;
  payload: Record<string, unknown> | null;
  source_status: string | null;
  source_label: string | null;
  synthetic_notice: string | null;
}

export interface GeoFeatureRecord {
  feature_type: string;
  source_key: string;
  feature_name: string | null;
  latitude: number | null;
  longitude: number | null;
  geometry_json: unknown;
  properties: Record<string, unknown>;
  source_id: string | null;
  source_label: string | null;
  period: string | null;
  updated_at: string;
}

export interface MunicipalityGeoIdentity {
  id: string;
  country_code: string;
  municipality_code: string;
  department_code: string;
  department_name: string;
  municipality_name: string;
  slug: string;
}

export interface GeoBoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface MunicipalityGeoSummary {
  municipality: MunicipalityGeoIdentity;
  feature_counts: Record<string, number>;
  feature_total: number;
  bbox: GeoBoundingBox | null;
  updated_at: string | null;
}

export interface MunicipalityGeoBundle {
  municipality: MunicipalityGeoIdentity;
  feature_counts: Record<string, number>;
  features: GeoFeatureRecord[];
}

export interface VoterRollAggregate {
  source_year: number;
  elector_count: number;
  community_count: number | null;
  average_age_base: number | null;
  age_missing_count: number | null;
  age_18_29: number | null;
  age_30_44: number | null;
  age_45_59: number | null;
  age_60_plus: number | null;
  reconciliation_delta: number | null;
  source_product_id: string | null;
  universe: "PADRON_DETALLADO_2023" | "NUCLEO_ELECTORAL_2026" | "OTRO_UNIVERSO_DECLARADO";
}

export interface AuthorizedVoterRollSummary {
  municipality_code: string;
  aggregates: VoterRollAggregate[];
  coverage: {
    detailed_2023: boolean;
    active_2026: boolean;
    community_detail_2023: boolean;
  };
}

export interface AuthorizedDemographicSummary {
  municipality_code: string;
  projection_year: number;
  reference_date: string;
  population_total: number;
  population_male: number;
  population_female: number;
  source_product_id: string;
  source_label: string;
}

export interface RadarRuntimeBundle {
  context: AuthorizedRadarContext;
  layers: AuthorizedLayerRecord[];
  geo: MunicipalityGeoSummary;
  voter_roll: AuthorizedVoterRollSummary;
  demographics: AuthorizedDemographicSummary | null;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const radarRuntimeConfigured = Boolean(supabaseUrl && publishableKey);

function assertMunicipalityCode(value: string) {
  if (!/^\d{4}$/.test(value)) throw new Error("Código municipal inválido.");
}

function assertAccessToken(accessToken: string) {
  if (!accessToken?.trim()) throw new Error("Sesión autenticada requerida.");
}

async function rpc<T>(functionName: string, body: Record<string, unknown>, accessToken: string): Promise<T> {
  assertAccessToken(accessToken);
  if (!supabaseUrl || !publishableKey) throw new Error("Runtime Supabase no configurado.");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`RADAR runtime rechazó la solicitud (${response.status}).`);
  }

  return response.json() as Promise<T>;
}

export async function loadAuthorizedRadarContext(municipalityCode: string, accessToken: string) {
  assertMunicipalityCode(municipalityCode);
  const rows = await rpc<AuthorizedRadarContext[]>("radar_authorized_context_v2", {
    route_kind: "municipality",
    route_key: municipalityCode,
  }, accessToken);

  const context = rows[0];
  if (!context || context.municipality_code !== municipalityCode || !Array.isArray(context.permissions)) {
    throw new Error("La sesión no tiene un contexto municipal autorizado.");
  }
  return context;
}

export async function loadAuthorizedRadarLayers(municipalityCode: string, accessToken: string) {
  assertMunicipalityCode(municipalityCode);
  return rpc<AuthorizedLayerRecord[]>("radar_authorized_layers_v2", {
    route_kind: "municipality",
    route_key: municipalityCode,
  }, accessToken);
}

export async function loadAuthorizedGeoSummary(
  municipalityCode: string,
  accessToken: string,
  featureTypes?: string[],
) {
  assertMunicipalityCode(municipalityCode);
  const summary = await rpc<MunicipalityGeoSummary | null>("radar_municipality_geo_summary", {
    p_municipality_code: municipalityCode,
    p_feature_types: featureTypes?.length ? featureTypes : null,
  }, accessToken);

  if (!summary || summary.municipality?.municipality_code !== municipalityCode) {
    throw new Error("La sesión no tiene geografía municipal autorizada.");
  }
  return summary;
}

export async function loadAuthorizedGeoBundle(
  municipalityCode: string,
  accessToken: string,
  featureTypes?: string[],
) {
  assertMunicipalityCode(municipalityCode);
  return rpc<MunicipalityGeoBundle>("radar_municipality_geo_bundle", {
    p_municipality_code: municipalityCode,
    p_feature_types: featureTypes?.length ? featureTypes : null,
  }, accessToken);
}

export async function loadRadarRuntimeBundle(municipalityCode: string, accessToken: string): Promise<RadarRuntimeBundle> {
  assertMunicipalityCode(municipalityCode);
  const bundle = await rpc<RadarRuntimeBundle | null>("radar_authorized_runtime_v6", {
    p_municipality_code: municipalityCode,
  }, accessToken);

  if (
    !bundle ||
    bundle.context?.municipality_code !== municipalityCode ||
    bundle.geo?.municipality?.municipality_code !== municipalityCode ||
    bundle.voter_roll?.municipality_code !== municipalityCode ||
    !Array.isArray(bundle.context.permissions) ||
    !Array.isArray(bundle.layers) ||
    !Array.isArray(bundle.voter_roll.aggregates) ||
    (bundle.demographics !== null && bundle.demographics?.municipality_code !== municipalityCode)
  ) {
    throw new Error("La sesión no tiene un runtime municipal autorizado.");
  }

  return bundle;
}

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

export interface MunicipalityGeoBundle {
  municipality: {
    id: string;
    country_code: string;
    municipality_code: string;
    department_code: string;
    department_name: string;
    municipality_name: string;
    slug: string;
  };
  feature_counts: Record<string, number>;
  features: GeoFeatureRecord[];
}

export interface RadarRuntimeBundle {
  context: AuthorizedRadarContext;
  layers: AuthorizedLayerRecord[];
  geo: MunicipalityGeoBundle;
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
  const [context, layers, geo] = await Promise.all([
    loadAuthorizedRadarContext(municipalityCode, accessToken),
    loadAuthorizedRadarLayers(municipalityCode, accessToken),
    loadAuthorizedGeoBundle(municipalityCode, accessToken),
  ]);

  return { context, layers, geo };
}

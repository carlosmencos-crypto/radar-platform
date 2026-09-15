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

export interface AuthorizedVoterCommunity {
  municipality_code: string;
  community_label: string;
  community_normalized: string;
  elector_count: number;
  average_age_base: number | null;
  age_18_29: number | null;
  age_30_44: number | null;
  age_45_59: number | null;
  age_60_plus: number | null;
  coverage_band: string | null;
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
  universe:
    | "PADRON_DETALLADO_2023"
    | "NUCLEO_ELECTORAL_2026"
    | "OTRO_UNIVERSO_DECLARADO";
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

export interface CampaignIdentityRecord {
  campaign_id?: string;
  candidate_name?: string | null;
  party_name?: string | null;
  party_logo_data_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignActivityRecord {
  id: string;
  campaign_id: string;
  title: string;
  activity_type: string | null;
  starts_at: string | null;
  community: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignCommitmentRecord {
  id: string;
  title: string;
  community: string | null;
  responsible: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  notes: string | null;
}

export interface CampaignBundle {
  identity: CampaignIdentityRecord;
  activities: CampaignActivityRecord[];
  commitments: CampaignCommitmentRecord[];
}

export interface AuthorizedVoterDirectoryRow {
  id: number;
  full_name: string;
  community: string | null;
  estimated_age_2026: number | null;
  masked_identification: string | null;
  contact_status: string;
  phone_primary: string | null;
  assigned_person_name: string | null;
  campaign_role: string | null;
  party_affiliation: string | null;
  total_count: number;
}

export interface VoterDirectoryFilters {
  query?: string;
  dpi?: string;
  community?: string;
  ageMin?: number;
  ageMax?: number;
  status?: string;
  affiliation?: string;
  role?: string;
  offset?: number;
  limit?: number;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const radarRuntimeConfigured = Boolean(supabaseUrl && publishableKey);

const electoralTerritoryLayerIds = new Set([
  "TREP_2023_CENTER_INDEX",
  "TREP_2023_CENTER_RESULTS_PRESIDENTE",
  "TREP_2023_CENTER_RESULTS_DIP_NAC",
  "TREP_2023_CENTER_RESULTS_DIP_DIST",
  "TREP_2023_CENTER_RESULTS_CORPORACION_MUNICIPAL",
  "TREP_2023_CENTER_RESULTS_DIP_PAR",
]);

function assertMunicipalityCode(value: string) {
  if (!/^\d{4}$/.test(value)) throw new Error("Código municipal inválido.");
}

function assertAccessToken(accessToken: string) {
  if (!accessToken?.trim()) throw new Error("Sesión autenticada requerida.");
}

async function rpc<T>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<T> {
  assertAccessToken(accessToken);
  if (!supabaseUrl || !publishableKey)
    throw new Error("Runtime Supabase no configurado.");

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

export async function loadAuthorizedRadarContext(
  municipalityCode: string,
  accessToken: string,
) {
  assertMunicipalityCode(municipalityCode);
  const rows = await rpc<AuthorizedRadarContext[]>(
    "radar_authorized_context_v2",
    {
      route_kind: "municipality",
      route_key: municipalityCode,
    },
    accessToken,
  );

  const context = rows[0];
  if (
    !context ||
    context.municipality_code !== municipalityCode ||
    !Array.isArray(context.permissions)
  ) {
    throw new Error("La sesión no tiene un contexto municipal autorizado.");
  }
  return context;
}

export async function loadAuthorizedRadarLayers(
  municipalityCode: string,
  accessToken: string,
) {
  assertMunicipalityCode(municipalityCode);
  return rpc<AuthorizedLayerRecord[]>(
    "radar_authorized_layers_v2",
    {
      route_kind: "municipality",
      route_key: municipalityCode,
    },
    accessToken,
  );
}

export async function loadAuthorizedElectoralTerritoryLayers(
  municipalityCode: string,
  accessToken: string,
) {
  const layers = await loadAuthorizedRadarLayers(municipalityCode, accessToken);
  const electoralTerritory = layers.filter((layer) =>
    electoralTerritoryLayerIds.has(layer.layer_id),
  );
  const layerIds = electoralTerritory.map((layer) => layer.layer_id);
  if (layerIds.length !== new Set(layerIds).size) {
    throw new Error(
      "El runtime electoral autorizado devolvió capas duplicadas.",
    );
  }
  return electoralTerritory;
}

export async function loadAuthorizedVoterCommunities(
  municipalityCode: string,
  accessToken: string,
) {
  assertMunicipalityCode(municipalityCode);
  const communities = await rpc<AuthorizedVoterCommunity[]>(
    "radar_authorized_voter_communities",
    {
      p_municipality_code: municipalityCode,
    },
    accessToken,
  );
  if (communities.some((item) => item.municipality_code !== municipalityCode)) {
    throw new Error(
      "El runtime comunitario devolvió registros fuera del municipio autorizado.",
    );
  }
  return communities;
}

export async function loadAuthorizedGeoSummary(
  municipalityCode: string,
  accessToken: string,
  featureTypes?: string[],
) {
  assertMunicipalityCode(municipalityCode);
  const summary = await rpc<MunicipalityGeoSummary | null>(
    "radar_municipality_geo_summary",
    {
      p_municipality_code: municipalityCode,
      p_feature_types: featureTypes?.length ? featureTypes : null,
    },
    accessToken,
  );

  if (
    !summary ||
    summary.municipality?.municipality_code !== municipalityCode
  ) {
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
  return rpc<MunicipalityGeoBundle>(
    "radar_municipality_geo_bundle",
    {
      p_municipality_code: municipalityCode,
      p_feature_types: featureTypes?.length ? featureTypes : null,
    },
    accessToken,
  );
}

export async function loadRadarRuntimeBundle(
  municipalityCode: string,
  accessToken: string,
): Promise<RadarRuntimeBundle> {
  assertMunicipalityCode(municipalityCode);
  const bundle = await rpc<RadarRuntimeBundle | null>(
    "radar_authorized_runtime_v6",
    {
      p_municipality_code: municipalityCode,
    },
    accessToken,
  );

  if (
    !bundle ||
    bundle.context?.municipality_code !== municipalityCode ||
    bundle.geo?.municipality?.municipality_code !== municipalityCode ||
    bundle.voter_roll?.municipality_code !== municipalityCode ||
    !Array.isArray(bundle.context.permissions) ||
    !Array.isArray(bundle.layers) ||
    !Array.isArray(bundle.voter_roll.aggregates) ||
    (bundle.demographics !== null &&
      bundle.demographics?.municipality_code !== municipalityCode)
  ) {
    throw new Error("La sesión no tiene un runtime municipal autorizado.");
  }
  return bundle;
}

export async function loadCampaignBundle(
  campaignId: string,
  accessToken: string,
) {
  if (!campaignId) throw new Error("Campaña autorizada requerida.");
  const bundle = await rpc<CampaignBundle | null>(
    "radar_campaign_bundle_v1",
    {
      p_campaign_id: campaignId,
    },
    accessToken,
  );
  if (
    !bundle ||
    !Array.isArray(bundle.activities) ||
    !Array.isArray(bundle.commitments)
  ) {
    throw new Error("La sesión no tiene acceso al Campaign Vault.");
  }
  return bundle;
}

export async function saveCampaignIdentity(
  campaignId: string,
  identity: CampaignIdentityRecord,
  accessToken: string,
) {
  if (!campaignId) throw new Error("Campaña autorizada requerida.");
  return rpc<CampaignIdentityRecord>(
    "radar_save_campaign_identity_v1",
    {
      p_campaign_id: campaignId,
      p_identity: identity,
    },
    accessToken,
  );
}

export async function saveCampaignActivity(
  campaignId: string,
  activity: Partial<CampaignActivityRecord>,
  accessToken: string,
  activityId: string | null = null,
) {
  if (!campaignId) throw new Error("Campaña autorizada requerida.");
  return rpc<CampaignActivityRecord>(
    "radar_save_activity_v1",
    {
      p_campaign_id: campaignId,
      p_activity_id: activityId,
      p_activity: activity,
    },
    accessToken,
  );
}

export async function loadAuthorizedVoterDirectory(
  municipalityCode: string,
  filters: VoterDirectoryFilters,
  accessToken: string,
) {
  assertMunicipalityCode(municipalityCode);
  const rows = await rpc<AuthorizedVoterDirectoryRow[]>(
    "radar_authorized_voter_directory_v1",
    {
      p_municipality_code: municipalityCode,
      p_query: filters.query?.trim() || null,
      p_dpi: filters.dpi?.trim() || null,
      p_community: filters.community || null,
      p_age_min: filters.ageMin ?? null,
      p_age_max: filters.ageMax ?? null,
      p_status: filters.status || null,
      p_affiliation: filters.affiliation || null,
      p_role: filters.role?.trim() || null,
      p_offset: Math.max(filters.offset ?? 0, 0),
      p_limit: Math.min(Math.max(filters.limit ?? 25, 1), 50),
    },
    accessToken,
  );
  return rows;
}

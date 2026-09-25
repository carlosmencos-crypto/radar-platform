import { ensureRadarAccessToken } from "../data/radarAuth";

export interface AdminMunicipalityState {
  municipality_code: string;
  municipality_name: string;
  department_code: string;
  department_name: string;
  canonical_layers_present: number;
  active_campaigns: number;
  campaign_members: number;
  protected_contracts: number;
  data_updated_at: string | null;
  operational_state: "CONTRACT_PROTECTED" | "CAMPAIGN_CONFIGURED" | "DATA_ONLY";
}

export interface AdminLayerState {
  layer_id: string;
  layer_order: number;
  label: string;
  domain: string;
  municipalities_present: number;
  rows_without_status: number;
  last_updated: string | null;
  status_counts: Record<string, number>;
}

export interface AdminSnapshot {
  generated_at: string;
  contract: { context_fields: string[]; country_code: string };
  national: {
    municipalities: number;
    departments: number;
    municipalities_with_17_layers: number;
    active_campaigns: number;
    protected_contracts: number;
    active_profiles: number;
    last_data_update: string | null;
  };
  municipalities: AdminMunicipalityState[];
  vertical_qa: AdminMunicipalityState[];
  layers: AdminLayerState[];
  sources: Array<Record<string, unknown>>;
  campaigns: Array<Record<string, unknown>>;
  contracts: Array<Record<string, unknown>>;
  campaign_health: Array<Record<string, unknown>>;
  publication_batches: Array<Record<string, unknown>>;
  publication_issues: Array<Record<string, unknown>>;
  pulse_measurements: Array<Record<string, unknown>>;
  publication_states: Record<string, number>;
  pulse_states: Record<string, number>;
  rtd: Array<Record<string, unknown>>;
  rtd_monitoring: Array<Record<string, unknown>>;
  qa_runs: Array<Record<string, unknown>>;
  deployments: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  support: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  campaign_members?: Array<Record<string, unknown>>;
  operator_context: {
    user_id: string;
    user_role: string;
    permissions: string[];
    scopes: Array<Record<string, unknown>>;
  };
}

interface AdminApiResponse<T> {
  data?: T;
  error?: string;
  request_id?: string;
}

function adminConfig() {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const configuredUrl = String(import.meta.env.VITE_RADAR_ADMIN_API_URL ?? "").trim().replace(/\/$/, "");
  const apiUrl = configuredUrl || (supabaseUrl ? `${supabaseUrl}/functions/v1/radar-admin-api` : "");
  return { apiUrl, publishableKey };
}

export function radarAdminConfigured() {
  const { apiUrl, publishableKey } = adminConfig();
  return Boolean(apiUrl && publishableKey);
}

async function adminRequest<T>(url: string, init?: RequestInit) {
  const { publishableKey } = adminConfig();
  const accessToken = await ensureRadarAccessToken();
  const requestId = crypto.randomUUID();
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "x-request-id": requestId,
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as AdminApiResponse<T>;
  if (!response.ok || payload.error) {
    const error = new Error(payload.error || `RADAR_ADMIN_${response.status}`);
    Object.assign(error, { status: response.status, requestId: payload.request_id ?? requestId });
    throw error;
  }
  if (payload.data === undefined) throw new Error("RADAR_ADMIN_EMPTY_RESPONSE");
  return payload.data;
}

export async function loadAdminSnapshot(secondMunicipalityCode = "1901") {
  const { apiUrl } = adminConfig();
  if (!radarAdminConfigured()) throw new Error("RADAR_ADMIN_NOT_CONFIGURED");
  const url = new URL(apiUrl);
  url.searchParams.set("action", "snapshot");
  url.searchParams.set("second_municipality_code", secondMunicipalityCode);
  return adminRequest<AdminSnapshot>(url.toString());
}

export async function runAdminAction<T>(action: string, input: Record<string, unknown>) {
  const { apiUrl } = adminConfig();
  if (!radarAdminConfigured()) throw new Error("RADAR_ADMIN_NOT_CONFIGURED");
  return adminRequest<T>(apiUrl, { method: "POST", body: JSON.stringify({ action, input }) });
}

export async function uploadPublicationPreview(file: File, input: Record<string, unknown>) {
  const { apiUrl } = adminConfig();
  if (!radarAdminConfigured()) throw new Error("RADAR_ADMIN_NOT_CONFIGURED");
  const form = new FormData();
  form.set("action", "upload_publication");
  form.set("input", JSON.stringify(input));
  form.set("file", file, file.name);
  return adminRequest<Record<string, unknown>>(apiUrl, { method: "POST", body: form });
}

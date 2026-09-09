import type { RadarContextKey, UserRole } from "../types/radar";

const SESSION_STORAGE_KEY = "radar-supabase-session-v1";
const EXPIRY_SKEW_MS = 60_000;

export interface SupabaseRuntimeSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type?: string;
}

interface SupabaseAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
}

export interface RadarRuntimeMembership {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  municipality_id: string;
  country_code: string;
  is_demo: boolean;
  status: string;
  member_role: string;
}

export interface RadarRuntimeIdentity {
  user_id: string;
  display_name: string | null;
  platform_role: string;
  organization_id: string | null;
  is_active: boolean;
  campaign_memberships: RadarRuntimeMembership[];
}

export interface RadarRuntimeMunicipality {
  id: string;
  country_code: string;
  municipality_code: string;
  department_code: string;
  department_name: string;
  municipality_name: string;
  slug: string;
}

export interface RadarRuntimeLayerRecord {
  layer_id: string;
  period: string | null;
  source_id: string | null;
  source_label: string | null;
  source_status: string | null;
  payload: Record<string, unknown>;
  generated_at: string | null;
  updated_at: string;
}

export interface RadarRuntimeCampaign {
  id: string;
  name: string;
  slug: string;
  is_demo: boolean;
  status: string;
}

export interface RadarMunicipalityBundle {
  municipality: RadarRuntimeMunicipality;
  campaigns: RadarRuntimeCampaign[];
  layers: RadarRuntimeLayerRecord[];
}

function runtimeConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "");
  return { url, publishableKey };
}

export function isSupabaseRuntimeConfigured() {
  const { url, publishableKey } = runtimeConfig();
  return Boolean(url && publishableKey);
}

function requireRuntimeConfig() {
  const config = runtimeConfig();
  if (!config.url || !config.publishableKey) {
    throw new Error("RADAR_RUNTIME_NOT_CONFIGURED");
  }
  return config;
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readRuntimeSession(): SupabaseRuntimeSession | null {
  if (!storageAvailable()) return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SupabaseRuntimeSession>;
    if (!parsed.access_token || !parsed.refresh_token || typeof parsed.expires_at !== "number") return null;
    return parsed as SupabaseRuntimeSession;
  } catch {
    return null;
  }
}

function persistRuntimeSession(auth: SupabaseAuthResponse) {
  const session: SupabaseRuntimeSession = {
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    token_type: auth.token_type,
    expires_at: Date.now() + Math.max(auth.expires_in, 1) * 1000,
  };
  if (storageAvailable()) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearRuntimeSession() {
  if (storageAvailable()) window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function authRequest(path: string, body: Record<string, string>) {
  const { url, publishableKey } = requireRuntimeConfig();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    clearRuntimeSession();
    throw new Error(`RADAR_AUTH_${response.status}`);
  }

  return persistRuntimeSession(await response.json() as SupabaseAuthResponse);
}

export function signInRadar(email: string, password: string) {
  return authRequest("token?grant_type=password", { email, password });
}

async function refreshRuntimeSession(refreshToken: string) {
  return authRequest("token?grant_type=refresh_token", { refresh_token: refreshToken });
}

export async function ensureRuntimeSession() {
  const session = readRuntimeSession();
  if (!session) throw new Error("RADAR_AUTH_REQUIRED");
  if (session.expires_at - EXPIRY_SKEW_MS > Date.now()) return session;
  return refreshRuntimeSession(session.refresh_token);
}

export async function signOutRadar() {
  const session = readRuntimeSession();
  const { url, publishableKey } = requireRuntimeConfig();

  try {
    if (session?.access_token) {
      await fetch(`${url}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    }
  } finally {
    clearRuntimeSession();
  }
}

async function rpc<T>(functionName: string, body: Record<string, unknown> = {}) {
  const session = await ensureRuntimeSession();
  const { url, publishableKey } = requireRuntimeConfig();
  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    clearRuntimeSession();
    throw new Error("RADAR_AUTH_REQUIRED");
  }
  if (!response.ok) throw new Error(`RADAR_RPC_${functionName}_${response.status}`);
  return await response.json() as T;
}

export function fetchRadarRuntimeIdentity() {
  return rpc<RadarRuntimeIdentity | null>("radar_runtime_identity");
}

export function fetchRadarMunicipalityBundle(municipalityCode: string) {
  if (!/^\d{4}$/.test(municipalityCode)) throw new Error("RADAR_INVALID_MUNICIPALITY_CODE");
  return rpc<RadarMunicipalityBundle | null>("radar_municipality_bundle", {
    p_municipality_code: municipalityCode,
  });
}

export function canonicalUserRole(identity: RadarRuntimeIdentity, membership?: RadarRuntimeMembership): UserRole {
  if (identity.platform_role === "platform_admin") return "national_admin";
  if (identity.platform_role === "organization_admin" || membership?.member_role === "campaign_admin") return "municipal_admin";
  if (membership) return "campaign_operator";
  return "public_viewer";
}

export function runtimeContextForMunicipality(
  identity: RadarRuntimeIdentity,
  bundle: RadarMunicipalityBundle,
): RadarContextKey {
  const municipalityId = bundle.municipality.id;
  const membership = identity.campaign_memberships.find((item) =>
    item.municipality_id === municipalityId && item.status === "active" && !item.is_demo,
  );
  const isPlatformAdmin = identity.platform_role === "platform_admin";

  if (!isPlatformAdmin && !membership) throw new Error("RADAR_MUNICIPALITY_FORBIDDEN");

  const userRole = canonicalUserRole(identity, membership);
  const permissions = isPlatformAdmin
    ? ["data_vault:read_all", "campaign_vault:read_authorized", "municipalities:navigate_all"]
    : ["data_vault:read_authorized", "campaign_vault:read_authorized"];

  return {
    municipality_code: bundle.municipality.municipality_code,
    campaign_id: membership?.campaign_id ?? "platform-admin",
    user_role: userRole,
    permissions,
  };
}

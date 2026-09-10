const SESSION_STORAGE_KEY = "radar-supabase-session-v1";
const EXPIRY_SKEW_MS = 60_000;

export interface RadarAuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type?: string;
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
}

function authConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const publishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  return { url, publishableKey };
}

export function radarAuthConfigured() {
  const { url, publishableKey } = authConfig();
  return Boolean(url && publishableKey);
}

function requireAuthConfig() {
  const config = authConfig();
  if (!config.url || !config.publishableKey) throw new Error("RADAR_AUTH_NOT_CONFIGURED");
  return config;
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readRadarSession(): RadarAuthSession | null {
  if (!storageAvailable()) return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<RadarAuthSession>;
    if (
      typeof parsed.access_token !== "string" || !parsed.access_token
      || typeof parsed.refresh_token !== "string" || !parsed.refresh_token
      || typeof parsed.expires_at !== "number"
    ) return null;
    return parsed as RadarAuthSession;
  } catch {
    return null;
  }
}

export function clearRadarSession() {
  if (storageAvailable()) window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function persistRadarSession(response: SupabaseTokenResponse) {
  const session: RadarAuthSession = {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    token_type: response.token_type,
    expires_at: Date.now() + Math.max(response.expires_in, 1) * 1000,
  };
  if (storageAvailable()) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function tokenRequest(grantType: "password" | "refresh_token", body: Record<string, string>) {
  const { url, publishableKey } = requireAuthConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    clearRadarSession();
    throw new Error(`RADAR_AUTH_${response.status}`);
  }

  return persistRadarSession(await response.json() as SupabaseTokenResponse);
}

export async function signInRadar(email: string, password: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) throw new Error("RADAR_AUTH_CREDENTIALS_REQUIRED");
  return tokenRequest("password", { email: normalizedEmail, password });
}

async function refreshRadarSession(refreshToken: string) {
  return tokenRequest("refresh_token", { refresh_token: refreshToken });
}

export async function ensureRadarAccessToken() {
  const session = readRadarSession();
  if (!session) throw new Error("RADAR_AUTH_REQUIRED");
  if (session.expires_at - EXPIRY_SKEW_MS > Date.now()) return session.access_token;

  try {
    const refreshed = await refreshRadarSession(session.refresh_token);
    return refreshed.access_token;
  } catch {
    clearRadarSession();
    throw new Error("RADAR_AUTH_REQUIRED");
  }
}

export async function signOutRadar() {
  const session = readRadarSession();
  const { url, publishableKey } = requireAuthConfig();
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
    clearRadarSession();
  }
}

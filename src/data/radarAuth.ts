const SESSION_STORAGE_KEY = "radar-supabase-session-v1";
const CALLBACK_STORAGE_KEY = "radar-supabase-callback-v1";
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

interface RadarAuthCallback {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  type: "invite" | "recovery";
}

interface SupabaseFactor {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string;
}

export interface RadarMfaChallenge {
  factorId: string;
  challengeId: string;
  friendlyName: string;
}

export interface RadarMfaEnrollment {
  qrCode: string;
  secret: string;
  uri: string;
}

export interface RadarAdminMfaStep {
  challenge: RadarMfaChallenge;
  enrollment: RadarMfaEnrollment | null;
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
      || typeof parsed.refresh_token !== "string"
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

function callbackStorageAvailable() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function storedRadarAuthCallback(): RadarAuthCallback | null {
  if (!callbackStorageAvailable()) return null;
  const raw = window.sessionStorage.getItem(CALLBACK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RadarAuthCallback>;
    if (
      typeof parsed.access_token !== "string" || !parsed.access_token
      || typeof parsed.refresh_token !== "string"
      || (parsed.type !== "invite" && parsed.type !== "recovery")
    ) return null;
    return parsed as RadarAuthCallback;
  } catch {
    return null;
  }
}

function clearRadarAuthCallback() {
  if (callbackStorageAvailable()) window.sessionStorage.removeItem(CALLBACK_STORAGE_KEY);
}

function readRadarAuthCallback(): RadarAuthCallback | null {
  if (typeof window === "undefined") return null;
  const values = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const rawType = values.get("type");
  const accessToken = values.get("access_token");
  const refreshToken = values.get("refresh_token") ?? "";
  if (!accessToken) return storedRadarAuthCallback();

  // Netlify's protected-site redirect can preserve only the access token while
  // omitting the refresh token and final callback type. The access token is
  // sufficient for the immediate password update and MFA enrollment; it is
  // never refreshed unless Supabase also supplied a refresh token.
  const type = rawType === "invite" || rawType === "recovery"
    ? rawType
    : window.location.pathname.endsWith("/acceso")
      ? "recovery"
      : null;
  if (!type) return null;
  const expiresIn = Number(values.get("expires_in"));
  const callback: RadarAuthCallback = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    token_type: values.get("token_type") || "bearer",
    type,
  };
  if (callbackStorageAvailable()) {
    window.sessionStorage.setItem(CALLBACK_STORAGE_KEY, JSON.stringify(callback));
  }
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return callback;
}

export function radarAuthCallbackType() {
  return readRadarAuthCallback()?.type ?? null;
}

export async function completeRadarPasswordSetup(password: string) {
  if (password.length < 12) throw new Error("RADAR_PASSWORD_TOO_SHORT");
  const callback = readRadarAuthCallback();
  if (!callback) throw new Error("RADAR_AUTH_CALLBACK_INVALID");
  const { url, publishableKey } = requireAuthConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${callback.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    clearRadarAuthCallback();
    throw new Error(`RADAR_PASSWORD_${response.status}`);
  }
  const session = persistRadarSession(callback);
  clearRadarAuthCallback();
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

async function authenticatedAuthRequest<T>(path: string, init?: RequestInit) {
  const { url, publishableKey } = requireAuthConfig();
  const accessToken = await ensureRadarAccessToken();
  const response = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`RADAR_MFA_${response.status}`);
  return response.json() as Promise<T>;
}

export async function beginRadarMfaChallenge(): Promise<RadarMfaChallenge> {
  const user = await authenticatedAuthRequest<{ factors?: SupabaseFactor[] }>("/user");
  const factor = user.factors?.find((candidate) => candidate.factor_type === "totp" && candidate.status === "verified");
  if (!factor) throw new Error("RADAR_MFA_NOT_ENROLLED");
  const challenge = await authenticatedAuthRequest<{ id: string }>(`/factors/${factor.id}/challenge`, {
    method: "POST",
    body: "{}",
  });
  return {
    factorId: factor.id,
    challengeId: challenge.id,
    friendlyName: factor.friendly_name || "Aplicación autenticadora",
  };
}

interface SupabaseMfaEnrollmentResponse {
  id: string;
  friendly_name?: string;
  totp?: {
    qr_code?: string;
    secret?: string;
    uri?: string;
  };
}

export async function prepareRadarAdminMfa(): Promise<RadarAdminMfaStep> {
  const user = await authenticatedAuthRequest<{ factors?: SupabaseFactor[] }>("/user");
  const verified = user.factors?.find((factor) => factor.factor_type === "totp" && factor.status === "verified");
  if (verified) {
    return { challenge: await beginRadarMfaChallenge(), enrollment: null };
  }

  for (const factor of user.factors ?? []) {
    if (factor.factor_type === "totp" && factor.status !== "verified") {
      await authenticatedAuthRequest(`/factors/${factor.id}`, { method: "DELETE" });
    }
  }

  const enrolled = await authenticatedAuthRequest<SupabaseMfaEnrollmentResponse>("/factors", {
    method: "POST",
    body: JSON.stringify({ factor_type: "totp", friendly_name: "RADAR Administrador" }),
  });
  if (!enrolled.id || !enrolled.totp?.secret) throw new Error("RADAR_MFA_ENROLL_FAILED");
  const challenge = await authenticatedAuthRequest<{ id: string }>(`/factors/${enrolled.id}/challenge`, {
    method: "POST",
    body: "{}",
  });
  return {
    challenge: {
      factorId: enrolled.id,
      challengeId: challenge.id,
      friendlyName: enrolled.friendly_name || "RADAR Administrador",
    },
    enrollment: {
      qrCode: enrolled.totp.qr_code || "",
      secret: enrolled.totp.secret,
      uri: enrolled.totp.uri || "",
    },
  };
}

export async function verifyRadarMfa(challenge: RadarMfaChallenge, code: string) {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) throw new Error("RADAR_MFA_CODE_REQUIRED");
  // MFA challenges expire quickly. Always create one immediately before
  // verification instead of reusing the challenge created when the screen
  // first rendered; users may need several minutes to configure their app.
  const freshChallenge = await authenticatedAuthRequest<{ id: string }>(`/factors/${challenge.factorId}/challenge`, {
    method: "POST",
    body: "{}",
  });
  if (!freshChallenge.id) throw new Error("RADAR_MFA_CHALLENGE_FAILED");
  const response = await authenticatedAuthRequest<SupabaseTokenResponse>(`/factors/${challenge.factorId}/verify`, {
    method: "POST",
    body: JSON.stringify({ challenge_id: freshChallenge.id, code: normalized }),
  });
  return persistRadarSession(response);
}

async function refreshRadarSession(refreshToken: string) {
  return tokenRequest("refresh_token", { refresh_token: refreshToken });
}

export async function ensureRadarAccessToken() {
  const session = readRadarSession();
  if (!session) throw new Error("RADAR_AUTH_REQUIRED");
  if (session.expires_at - EXPIRY_SKEW_MS > Date.now()) return session.access_token;

  if (!session.refresh_token) {
    clearRadarSession();
    throw new Error("RADAR_AUTH_REQUIRED");
  }

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

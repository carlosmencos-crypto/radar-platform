import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  allowedOrigin,
  bearerToken,
  json,
  normalizedCode,
  requireEnvironment,
  responseHeaders,
  safeMessage,
  serviceClient,
  sha256,
  userClient,
} from "../_shared/access.ts";

type ExchangeRequest = {
  access_token?: string;
  code?: string;
  device_id?: string;
};

Deno.serve(async (request: Request) => {
  const origin = allowedOrigin(request);
  if (request.headers.get("origin") && !origin) return json(403, { error: "origin_not_allowed" }, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  try {
    const jwt = bearerToken(request);
    if (!jwt) return json(401, { error: "anonymous_session_required" }, origin);
    const auth = userClient(request);
    const { data: authData, error: authError } = await auth.auth.getUser(jwt);
    if (authError || !authData.user || !authData.user.is_anonymous) {
      return json(401, { error: "anonymous_session_required" }, origin);
    }

    const body = await request.json() as ExchangeRequest;
    const token = String(body.access_token ?? "").trim();
    const code = normalizedCode(body.code);
    if ((!token && !code) || (token && code)) return json(400, { error: "one_credential_required" }, origin);
    if (code && code.length !== 8) return json(400, { error: "invalid_code_format" }, origin);
    if (token && (token.length < 40 || token.length > 96)) return json(400, { error: "invalid_token_format" }, origin);

    const pepper = requireEnvironment("RADAR_ACCESS_AUDIT_PEPPER");
    const network = (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
    const device = String(body.device_id ?? "").trim();
    const credentialKind = token ? "token" : "code";
    const credentialHash = await sha256(token ? `token:${token}` : `code:${code}`);
    const [networkHash, deviceHash] = await Promise.all([
      sha256(`network:${pepper}:${network}`),
      device ? sha256(`device:${pepper}:${device}`) : Promise.resolve(null),
    ]);

    const service = serviceClient();
    const { data, error } = await service.rpc("radar_exchange_fiscal_access_v1", {
      p_credential_hash: credentialHash,
      p_credential_kind: credentialKind,
      p_auth_user_id: authData.user.id,
      p_network_hash: networkHash,
      p_device_hash: deviceHash,
    });
    if (error) {
      console.error("day-d-access-exchange rpc", error.code);
      return json(500, { error: "exchange_failed" }, origin);
    }
    if (!data?.ok) {
      const reason = String(data?.reason ?? "invalid");
      const status = reason === "rate_limited" ? 429 : reason === "suspended" ? 423 : 401;
      return json(status, { error: reason }, origin);
    }
    return json(200, { scope: data }, origin);
  } catch (error) {
    console.error("day-d-access-exchange", safeMessage(error));
    return json(500, { error: "server_configuration_error" }, origin);
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  accessToken,
  allowedOrigin,
  alternateCode,
  bearerToken,
  json,
  requireEnvironment,
  responseHeaders,
  safeMessage,
  sha256,
  userClient,
} from "../_shared/access.ts";

type AdminRequest = {
  action?: "issue" | "regenerate" | "suspend" | "revoke";
  campaign_id?: string;
  assignment_id?: string;
  grant_id?: string;
  expires_in_hours?: number;
};

Deno.serve(async (request: Request) => {
  const origin = allowedOrigin(request);
  if (request.headers.get("origin") && !origin) return json(403, { error: "origin_not_allowed" }, null);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, origin);

  try {
    const jwt = bearerToken(request);
    if (!jwt) return json(401, { error: "authentication_required" }, origin);
    const supabase = userClient(request);
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData.user || authData.user.is_anonymous) {
      return json(401, { error: "permanent_authentication_required" }, origin);
    }

    const body = await request.json() as AdminRequest;
    if (!body.campaign_id || !body.action) return json(400, { error: "invalid_request" }, origin);

    if (body.action === "issue" || body.action === "regenerate") {
      if (!body.assignment_id) return json(400, { error: "assignment_required" }, origin);
      const hours = Math.min(168, Math.max(1, Math.trunc(body.expires_in_hours ?? 72)));
      const token = accessToken();
      const code = alternateCode();
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const [tokenHash, codeHash] = await Promise.all([
        sha256(`token:${token}`),
        sha256(`code:${code}`),
      ]);
      const { data, error } = await supabase.rpc("radar_issue_fiscal_access_v1", {
        p_campaign_id: body.campaign_id,
        p_assignment_id: body.assignment_id,
        p_token_hash: tokenHash,
        p_code_hash: codeHash,
        p_expires_at: expiresAt,
      });
      if (error) return json(error.code === "42501" ? 403 : 400, { error: "access_not_issued" }, origin);
      const portal = requireEnvironment("RADAR_PORTAL_FISCAL_URL").replace(/\/$/, "");
      return json(200, {
        grant: data,
        access: { code, link: `${portal}/?access=${encodeURIComponent(token)}` },
      }, origin);
    }

    if (!body.grant_id) return json(400, { error: "grant_required" }, origin);
    const status = body.action === "suspend" ? "suspended" : "revoked";
    const { data, error } = await supabase.rpc("radar_set_fiscal_access_status_v1", {
      p_campaign_id: body.campaign_id,
      p_grant_id: body.grant_id,
      p_status: status,
    });
    if (error) return json(error.code === "42501" ? 403 : 400, { error: "access_not_updated" }, origin);
    return json(200, { grant: data }, origin);
  } catch (error) {
    console.error("day-d-access-admin", safeMessage(error));
    return json(500, { error: "server_configuration_error" }, origin);
  }
});

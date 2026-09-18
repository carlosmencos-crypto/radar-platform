import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  json,
  requireEnvironment,
  safeMessage,
  serviceClient,
  sha256,
} from "../_shared/access.ts";

async function sameSecret(received: string, expected: string) {
  const [left, right] = await Promise.all([sha256(received), sha256(expected)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, null);
  try {
    const expected = requireEnvironment("RADAR_PORTAL_BRIDGE_SECRET");
    const received = request.headers.get("x-radar-portal-secret") ?? "";
    if (!received || !(await sameSecret(received, expected))) {
      return json(401, { error: "server_authentication_required" }, null);
    }
    const body = await request.json() as { session_id?: string; grant_id?: string };
    if (!body.session_id || !body.grant_id) return json(400, { error: "invalid_request" }, null);
    const service = serviceClient();
    const { data, error } = await service.rpc("radar_validate_fiscal_session_v1", {
      p_session_id: body.session_id,
      p_grant_id: body.grant_id,
    });
    if (error) {
      console.error("day-d-access-validate rpc", error.code);
      return json(500, { error: "validation_failed" }, null);
    }
    return json(200, { scope: data }, null);
  } catch (error) {
    console.error("day-d-access-validate", safeMessage(error));
    return json(500, { error: "server_configuration_error" }, null);
  }
});

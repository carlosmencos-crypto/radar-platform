// Temporary scoped ingestion. A valid, expiring import token AND a pre-registered
// payload hash are required. This endpoint never reads or returns elector data.
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = request.headers.get("x-radar-import-token");
  if (!token || token.length !== 64) return new Response("Unauthorized", { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 4_000_000) {
    return new Response("Batch too large", { status: 413 });
  }
  try {
    const text = await request.text();
    if (text.length > 4_000_000) return new Response("Batch too large", { status: 413 });
    const input = JSON.parse(text);
    if (typeof input.payload !== "string" || typeof input.source_id !== "string" ||
      !Number.isInteger(input.batch_number)) return new Response("Invalid batch", { status: 400 });
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const result = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/radar_ingest_private_register_batch_v1`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_source_id: input.source_id, p_token: token,
        p_batch_number: input.batch_number, p_payload: input.payload }),
    });
    if (!result.ok) {
      // Never relay database errors that could contain private source values.
      return new Response(JSON.stringify({ error: "Import batch rejected", status: result.status }), {
        status: 422, headers: { "content-type": "application/json" },
      });
    }
    return new Response(await result.text(), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response("Import unavailable", { status: 503 });
  }
});

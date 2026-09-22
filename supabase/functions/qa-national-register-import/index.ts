// Temporary scoped ingestion. A valid, expiring import token AND a pre-registered
// payload hash are required. This endpoint never reads or returns elector data.
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = request.headers.get("x-radar-import-token");
  if (!token || token.length !== 64) return new Response("Unauthorized", { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 10_000_000) {
    return new Response("Batch too large", { status: 413 });
  }
  try {
    let stream = request.body;
    if (!stream) return new Response("Empty batch", { status: 400 });
    const encoding = request.headers.get("content-encoding");
    if (encoding === "gzip") stream = stream.pipeThrough(new DecompressionStream("gzip"));
    else if (encoding) return new Response("Unsupported encoding", { status: 415 });
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 10_000_000) { await reader.cancel(); return new Response("Batch too large", { status: 413 }); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const input = JSON.parse(text);
    const batches = input.batches ?? [input];
    if (typeof input.source_id !== "string" || !Array.isArray(batches) || batches.length < 1 || batches.length > 3 ||
      batches.some((batch: { payload?: unknown; batch_number?: unknown }) => typeof batch.payload !== "string" ||
        !Number.isInteger(batch.batch_number))) return new Response("Invalid batch", { status: 400 });
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const receipts = [];
    // A small transport group avoids repeated upload round trips. Every batch
    // keeps its own registered hash, transaction and idempotent acknowledgement.
    for (const batch of batches) {
    const result = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/radar_ingest_private_register_batch_v1`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_source_id: input.source_id, p_token: token,
        p_batch_number: batch.batch_number, p_payload: batch.payload }),
    });
    if (!result.ok) {
      // Never relay database errors that could contain private source values.
      const failure = await result.json().catch(() => ({}));
      const code = typeof failure.code === "string" && /^[A-Z0-9]{5,12}$/.test(failure.code) ? failure.code : "UNKNOWN";
      return new Response(JSON.stringify({ error: "Import batch rejected", status: result.status, code }), {
        status: 422, headers: { "content-type": "application/json" },
      });
    }
    receipts.push(await result.json());
    }
    return new Response(JSON.stringify(input.batches ? { receipts } : receipts[0]), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response("Import unavailable", { status: 503 });
  }
});

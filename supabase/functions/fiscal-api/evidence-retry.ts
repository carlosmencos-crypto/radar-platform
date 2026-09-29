// Deterministic storage identity prevents retry amplification. The database's
// existing UNIQUE(object_path) arbitrates concurrent requests across instances.
export async function persistEvidenceOnce(ops: {
  find: () => Promise<Record<string, unknown> | null>;
  upload: () => PromiseLike<{ error: { statusCode?: string | number; code?: string; error?: string } | null }>;
  insert: () => PromiseLike<{ data: Record<string, unknown> | null; error: { code?: string } | null }>;
}) {
  const existing = await ops.find();
  if (existing) return { row: existing, duplicate: true };
  const uploaded = await ops.upload();
  if (uploaded.error && ![uploaded.error.statusCode, uploaded.error.code, uploaded.error.error].some(value => ["409", "Duplicate", "ResourceAlreadyExists"].includes(String(value)))) throw uploaded.error;
  const inserted = await ops.insert();
  if (!inserted.error && inserted.data) return { row: inserted.data, duplicate: false };
  if (inserted.error?.code === "23505") {
    const winner = await ops.find();
    if (winner) return { row: winner, duplicate: true };
  }
  // Do not delete the object here: another in-flight request may have committed
  // its reference. A retry uses the same path and repairs an interrupted insert.
  throw inserted.error ?? new Error("Evidence persistence failed");
}

export async function readBoundedForm(request: Request, maxBytes: number) {
  const declared = request.headers.get("content-length");
  const tooLarge = () => Object.assign(new Error("El envío supera el límite permitido."), { status: 413 });
  if (declared && Number(declared) > maxBytes) throw tooLarge();
  if (!request.body) throw Object.assign(new Error("Archivo requerido."), { status: 400 });
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw tooLarge(); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}

// Local logic simulation only. No HTTP, credentials, OCR or production writes.
import assert from 'node:assert/strict';
import { persistEvidenceOnce } from '../supabase/functions/fiscal-api/evidence-retry.ts';
const count = 24427 * 5;
const batch = 100;
let accepted = 0, duplicates = 0;
const begin = performance.now();
for (let offset = 0; offset < count; offset += batch) {
  await Promise.all(Array.from({ length: Math.min(batch, count - offset) }, async (_, i) => {
    let object = false, row = null;
    const ops = {
      find: async () => row,
      upload: async () => { if (object) return { error: { statusCode: 409 } }; object = true; return { error: null }; },
      insert: async () => { if (row) return { data: null, error: { code: '23505' } }; row = { id: String(offset + i) }; return { data: row, error: null }; },
    };
    const results = await Promise.all([persistEvidenceOnce(ops), persistEvidenceOnce(ops), persistEvidenceOnce(ops)]);
    assert.equal(new Set(results.map(r => r.row.id)).size, 1);
    for (const r of results) r.duplicate ? duplicates++ : accepted++;
  }));
}
assert.equal(accepted, count); assert.equal(duplicates, count * 2);
console.log(JSON.stringify({ scope: 'in-memory logic; NOT database/storage/network capacity', uniqueEvidence: count, attempts: count * 3, accepted, duplicates, durationMs: Math.round(performance.now() - begin) }, null, 2));

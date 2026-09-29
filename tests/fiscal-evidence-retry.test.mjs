import { test } from 'node:test';
import assert from 'node:assert/strict';
import { persistEvidenceOnce, readBoundedForm } from '../supabase/functions/fiscal-api/evidence-retry.ts';

function fakeStore() {
  let object = false, row = null, uploads = 0, inserts = 0;
  return {
    ops: {
      find: async () => row,
      upload: async () => { uploads++; if (object) return { error: { statusCode: '400', error: 'Duplicate' } }; object = true; return { error: null }; },
      insert: async () => { inserts++; if (row) return { data: null, error: { code: '23505' } }; row = { id: 'one', file_name: 'acta.pdf' }; return { data: row, error: null }; },
    },
    stats: () => ({ object, row, uploads, inserts }),
  };
}
test('100 concurrent retries resolve to one evidence record and object', async () => {
  const store = fakeStore();
  const results = await Promise.all(Array.from({ length: 100 }, () => persistEvidenceOnce(store.ops)));
  assert.equal(new Set(results.map(r => r.row.id)).size, 1);
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal(store.stats().object, true);
  await persistEvidenceOnce(store.ops);
  assert.equal(store.stats().uploads, 100); // the later retry never uploads
});
test('retry repairs interruption between object upload and row insert', async () => {
  const store = fakeStore(); let first = true;
  const ops = { ...store.ops, insert: async () => { if (first) { first = false; return { data: null, error: { code: 'NETWORK' } }; } return store.ops.insert(); } };
  await assert.rejects(persistEvidenceOnce(ops));
  assert.equal(store.stats().object, true);
  assert.equal((await persistEvidenceOnce(ops)).row.id, 'one');
});
test('permission failures are not interpreted as successful duplicate uploads', async () => {
  let inserted = false;
  await assert.rejects(persistEvidenceOnce({ find: async () => null, upload: async () => ({ error: { statusCode: 403 } }), insert: async () => { inserted = true; return { data: {}, error: null }; } }));
  assert.equal(inserted, false);
});
test('bounded multipart reader rejects oversized declared and streamed bodies', async () => {
  await assert.rejects(readBoundedForm(new Request('http://localhost', { method: 'POST', body: '12345', headers: { 'content-length': '5' } }), 4), e => e.status === 413);
  await assert.rejects(readBoundedForm(new Request('http://localhost', { method: 'POST', body: '12345' }), 4), e => e.status === 413);
});
test('bounded reader preserves valid multipart file bytes', async () => {
  const form = new FormData(); form.set('file', new Blob(['synthetic acta'], { type: 'application/pdf' }), 'acta.pdf');
  const parsed = await readBoundedForm(new Request('http://localhost', { method: 'POST', body: form }), 4096);
  assert.equal(await parsed.get('file').text(), 'synthetic acta');
});

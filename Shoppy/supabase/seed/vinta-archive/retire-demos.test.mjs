import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { retirementTargets, retireDemos, createRetirementDatabase } from './retire-demos.mjs';
const editorialManifest = JSON.parse(await readFile(new URL('../editorial-demo/manifest.json', import.meta.url), 'utf8'));
const projectUrl = 'https://evzlqwiipdjgtrqjlwba.supabase.co';
const copy = value => structuredClone(value);
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'vinta-retire-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const targets = retirementTargets(editorialManifest);
  const state = { rows: targets.map((target, index) => ({ id: target.id, slug: target.slug, name: target.name, metadata: target.demoBatch ? { demo: true, batch: target.demoBatch } : {}, published_at: `2026-10-15T10:${String(index).padStart(2, '0')}:00Z`, updated_at: 'before', stock: 1, availability: 'AVAILABLE', price_clp: 1000 })), writes: [], failAt: 0, conflictAt: 0 };
  const recordPath = join(dir, 'record.json');
  const database = {
    async products(ids) { return copy(state.rows.filter(row => ids.includes(row.id))); },
    async setPublication(previous, publishedAt) {
      const record = JSON.parse(await readFile(recordPath, 'utf8')); assert.equal(record.pending.id, previous.id);
      const call = state.writes.length + 1;
      state.writes.push({ id: previous.id, publishedAt });
      if (state.failAt === call) throw new Error('database interruption');
      const row = state.rows.find(candidate => candidate.id === previous.id);
      if (state.conflictAt === call) { row.updated_at = 'concurrent'; return null; }
      assert.equal(row.updated_at, previous.updated_at); assert.equal(row.published_at, previous.published_at);
      row.published_at = publishedAt; row.updated_at = `written-${call}`; return copy(row);
    },
  };
  const run = mode => retireDemos({ editorialManifest, projectUrl, recordPath, database, mode: mode ?? 'apply' });
  return { targets, state, dir, run, recordPath, database };
}
test('exact twenty historical seeds and eight manifest demos; dry-run is read-only', async t => {
  const { targets, state, run, recordPath } = await fixture(t);
  assert.equal(targets.length, 28); assert.equal(targets[0].slug, 'chaqueta-trucker-levis'); assert.equal(targets[19].slug, 'chaleco-tommy-hilfiger');
  assert.deepEqual(targets.slice(20).map(row => row.id), editorialManifest.products.map(row => row.id));
  state.rows.push({ id: 'real-product', slug: 'real', name: 'Real', published_at: 'today' });
  const result = await run('dry-run'); assert.equal(result.found, 28); assert.equal(result.published, 28); assert.equal(state.writes.length, 0);
  await assert.rejects(readFile(recordPath), { code: 'ENOENT' });
});
test('only published_at changes; repeat keeps the original snapshots', async t => {
  const { state, run, recordPath } = await fixture(t), original = copy(state.rows);
  const applied = await run(); assert.equal(applied.changed.length, 28);
  const first = JSON.parse(await readFile(recordPath, 'utf8'));
  const repeated = await run(); assert.equal(repeated.changed.length, 0); assert.equal(repeated.alreadyUnpublished.length, 28);
  const second = JSON.parse(await readFile(recordPath, 'utf8'));
  assert.deepEqual(first.previous, second.previous); assert.equal(state.writes.length, 28);
  for (const [index, row] of state.rows.entries()) {
    const { published_at, updated_at, ...rest } = row;
    const { published_at: oldPublication, updated_at: oldUpdated, ...before } = original[index];
    assert.equal(published_at, null); assert.ok(updated_at && oldPublication && oldUpdated); assert.deepEqual(rest, before);
  }
});
test('legacy ID reused for a different real product aborts before writes', async t => {
  const { state, run } = await fixture(t); state.rows[8].slug = 'real-new-item';
  await assert.rejects(run(), /Colisión/); assert.equal(state.writes.length, 0);
});
test('same ID and slug but changed legacy name also aborts', async t => {
  const { state, run } = await fixture(t); state.rows[3].name = 'Prenda real nueva';
  await assert.rejects(run(), /Colisión/); assert.equal(state.writes.length, 0);
});
test('editorial demos require both demo marker and correct batch', async t => {
  const { state, run } = await fixture(t); state.rows[25].metadata.batch = 'foreign';
  await assert.rejects(run(), /Colisión/); assert.equal(state.writes.length, 0);
});
test('timestamp conflict skips row without rewriting concurrent edits', async t => {
  const { state, run } = await fixture(t); state.conflictAt = 2;
  const originalPublication = state.rows[1].published_at;
  const result = await run(); assert.equal(result.changed.length, 27); assert.deepEqual(result.skipped, [state.rows[1].id]);
  assert.equal(state.rows[1].published_at, originalPublication);
  const repeated = await run(); assert.deepEqual(repeated.skipped, [state.rows[1].id]); assert.equal(state.writes.length, 28);
});
test('restoration returns original dates and leaves already unpublished seeds unchanged', async t => {
  const { state, run } = await fixture(t); state.rows[1].published_at = null;
  const original = state.rows.map(row => row.published_at);
  await run(); const restored = await run('restore'); assert.equal(restored.changed.length, 27);
  assert.deepEqual(state.rows.map(row => row.published_at), original);
  const again = await run('restore'); assert.equal(again.changed.length, 0);
});
test('restore skips later admin edits or renamed products', async t => {
  const { state, run } = await fixture(t); await run();
  state.rows[0].updated_at = 'admin-edit'; state.rows[0].price_clp = 9999;
  state.rows[1].slug = 'admin-slug'; state.rows[1].updated_at = 'admin-edit';
  const result = await run('restore'); assert.equal(result.changed.length, 26); assert.deepEqual(result.skipped, state.rows.slice(0, 2).map(row => row.id));
  assert.equal(state.rows[0].published_at, null); assert.equal(state.rows[0].price_clp, 9999);
  assert.equal(state.rows[1].slug, 'admin-slug'); assert.equal(state.rows[1].published_at, null);
});
test('database interruption resumes original record without repeating successful changes', async t => {
  const { state, run, recordPath } = await fixture(t); state.failAt = 3;
  const original = state.rows.map(row => row.published_at);
  await assert.rejects(run(), /interruption/);
  const partial = JSON.parse(await readFile(recordPath, 'utf8')); assert.equal(Object.keys(partial.written).length, 2);
  await run(); assert.equal(state.writes.length, 29); assert.ok(state.rows.every(row => row.published_at === null));
  assert.deepEqual(JSON.parse(await readFile(recordPath, 'utf8')).previous, partial.previous);
  await run('restore'); assert.deepEqual(state.rows.map(row => row.published_at), original);
});
test('restore without original record does not write', async t => {
  const { state, run } = await fixture(t); await assert.rejects(run('restore'), /Falta el registro/); assert.equal(state.writes.length, 0);
});
test('uncertain successful write without saved confirmation is never restored', async t => {
  const { state, run, recordPath } = await fixture(t); await run();
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  delete record.written[state.rows[0].id]; await writeFile(recordPath, JSON.stringify(record));
  const result = await run('restore'); assert.ok(result.uncertain.includes(state.rows[0].id)); assert.equal(state.rows[0].published_at, null);
});
test('wrong project is rejected before any transport call', async t => {
  const { recordPath } = await fixture(t);
  await assert.rejects(retireDemos({ editorialManifest, projectUrl: 'https://foreign.supabase.co', recordPath, database: { products() { throw new Error('must not call'); } } }), /Proyecto distinto/);
});
test('Supabase adapter sends only publication field and optimistic concurrency filters', async () => {
  const calls = [];
  const query = {
    update(value) { calls.push(['update', value]); return this; }, eq(...values) { calls.push(['eq', ...values]); return this; },
    is(...values) { calls.push(['is', ...values]); return this; }, select() { return Promise.resolve({ data: [], error: null }); },
  };
  const database = createRetirementDatabase({ from(table) { assert.equal(table, 'products'); return query; } });
  const result = await database.setPublication({ id: 'id', slug: 'slug', updated_at: 'version', published_at: null }, 'previous-date');
  assert.equal(result, null); assert.deepEqual(calls[0], ['update', { published_at: 'previous-date' }]);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === 'version'));
  assert.ok(calls.some(call => call[0] === 'is' && call[1] === 'published_at' && call[2] === null));
});

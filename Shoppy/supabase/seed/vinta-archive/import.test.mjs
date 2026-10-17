import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runImport } from './import.mjs';

const copy = value => structuredClone(value);
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'vinta-import-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let version = 0;
  const state = { sections: [{ id: 'old-hero', key: 'hero', title: 'Anterior', config: { title: 'Antes' }, is_active: true, sort_order: 10, updated_at: '0' }], objects: new Map(), products: [], uploads: 0, failUpload: 0, failDatabase: false };
  const manifest = { version: 1, projectRef: 'evzlqwiipdjgtrqjlwba', batch: 'vinta-archive-2026-10-16', items: [] };
  for (const [index, id] of ['CMS5wJ-hhYX', 'CDrmUrRhvDO'].entries()) {
    const bytes = Buffer.from(`fixture photograph ${index}`), file = `${id}.webp`;
    await writeFile(join(dir, file), bytes);
    manifest.items.push({ id, slug: `instagram-${id.toLowerCase()}`, title: `Archivo ${index}`, sourceUrl: `https://www.instagram.com/vinta.zhe/p/${id}/`, publishedAt: '2021-01-01T00:00:00.000Z', visible: true, images: [{ file, sha256: createHash('sha256').update(bytes).digest('hex'), storagePath: `vinta/archive/2026-10-16/${file}`, width: 800, height: 1000, originalWidth: 1600, originalHeight: 2000, alt: 'Fotografía de archivo' }] });
  }
  const database = {
    async sections() { return copy(state.sections); },
    async replaceSection(previous, next) {
      if (state.failDatabase) { state.failDatabase = false; throw new Error('simulated database failure'); }
      const current = state.sections.find(row => row.key === (next?.key ?? previous.key));
      assert.deepEqual(current ?? null, previous);
      if (!next) { state.sections = state.sections.filter(row => row.key !== previous.key); return null; }
      const written = { ...copy(next), id: previous?.id ?? `new-${next.key}`, updated_at: String(++version) };
      state.sections = state.sections.filter(row => row.key !== next.key).concat(written);
      return copy(written);
    },
    async productReferences(paths) { return state.products.filter(row => paths.includes(row.storage_path)); },
    async readObject(path) { return state.objects.get(path) ?? null; },
    async upload(path, bytes) {
      state.uploads++;
      if (state.failUpload === state.uploads) throw new Error('simulated upload failure');
      assert.equal(state.objects.has(path), false);
      const record = JSON.parse(await readFile(join(dir, 'record.json'), 'utf8'));
      assert.equal(record.pendingUpload, path, 'durable intent must exist before writing');
      state.objects.set(path, bytes);
    },
    async remove(path) { state.objects.delete(path); },
  };
  const run = (mode = 'apply') => runImport({ manifest, assetsDir: dir, recordPath: join(dir, 'record.json'), database, projectUrl: 'https://evzlqwiipdjgtrqjlwba.supabase.co', mode });
  return { state, manifest, database, run, dir };
}
test('dry run verifies assets without writes or record', async t => {
  const { run, state, dir } = await fixture(t);
  const result = await run('dry-run');
  assert.equal(result.images, 2); assert.equal(state.objects.size, 0);
  await assert.rejects(readFile(join(dir, 'record.json')), { code: 'ENOENT' });
});
test('apply, repeated import, and complete removal preserve unrelated data', async t => {
  const { run, state } = await fixture(t);
  const previous = copy(state.sections);
  state.sections.push({ id: 'other', key: 'other', config: { x: 1 }, updated_at: '0' });
  await run(); await run();
  assert.equal(state.uploads, 2); assert.equal(state.objects.size, 2);
  const archive = state.sections.find(row => row.key === 'vinta-archive');
  assert.equal(archive.config.items.length, 2);
  assert.deepEqual(Object.keys(archive.config.items[0].images[0]).sort(), ['alt', 'height', 'storagePath', 'width']);
  const result = await run('remove');
  assert.deepEqual(result.skippedPaths, []); assert.equal(state.objects.size, 0);
  assert.equal(state.sections.some(row => row.key === 'vinta-archive'), false);
  assert.deepEqual(state.sections.find(row => row.key === 'hero').config, previous[0].config);
  assert.ok(state.sections.some(row => row.key === 'other'));
});
test('partial upload failure resumes without uploading successful files again', async t => {
  const { state, run } = await fixture(t);
  state.failUpload = 2;
  await assert.rejects(run(), /upload failure/);
  assert.equal(state.objects.size, 1);
  await run(); assert.equal(state.objects.size, 2); assert.equal(state.uploads, 3);
});
test('database failure after uploads resumes without duplicate objects', async t => {
  const { state, run } = await fixture(t);
  state.failDatabase = true;
  await assert.rejects(run(), /database failure/);
  assert.equal(state.objects.size, 2); assert.equal(state.sections.length, 1);
  await run(); assert.equal(state.uploads, 2); assert.equal(state.sections.length, 2);
});
test('foreign archive batch aborts before writes', async t => {
  const { state, run } = await fixture(t);
  state.sections.push({ key: 'vinta-archive', config: { batch: 'foreign' } });
  await assert.rejects(run(), /otro lote/); assert.equal(state.uploads, 0);
});
test('existing foreign bytes abort before uploading any object', async t => {
  const { manifest, state, run } = await fixture(t);
  state.objects.set(manifest.items[1].images[0].storagePath, Buffer.from('foreign'));
  await assert.rejects(run(), /Archivo ajeno/); assert.equal(state.uploads, 0);
});
test('same-byte preexisting object is reused, never claimed or removed', async t => {
  const { manifest, state, run, dir } = await fixture(t);
  const image = manifest.items[0].images[0];
  state.objects.set(image.storagePath, await readFile(join(dir, image.file)));
  await run(); await run('remove');
  assert.equal(state.objects.size, 1); assert.ok(state.objects.has(image.storagePath));
});
test('later admin titles, visibility, and hero edits survive repeat and removal', async t => {
  const { state, run } = await fixture(t);
  await run();
  const archive = state.sections.find(row => row.key === 'vinta-archive');
  archive.config.items[0].title = 'Título editado'; archive.config.items[0].visible = false; archive.updated_at = 'admin-archive';
  const hero = state.sections.find(row => row.key === 'hero'); hero.config.title = 'Portada editada'; hero.updated_at = 'admin-hero';
  await run();
  assert.equal(archive.config.items[0].title, 'Título editado'); assert.equal(archive.config.items[0].visible, false);
  const result = await run('remove');
  assert.deepEqual(result.skippedSections, ['vinta-archive', 'hero']); assert.equal(result.skippedPaths.length, 2);
  assert.equal(state.sections.find(row => row.key === 'hero').config.title, 'Portada editada');
});
test('product and unrelated home-section references protect owned objects', async t => {
  const { state, manifest, run } = await fixture(t);
  await run();
  state.products.push({ storage_path: manifest.items[0].images[0].storagePath });
  state.sections.push({ key: 'unrelated', config: { nested: { image: manifest.items[1].images[0].storagePath } } });
  const result = await run('remove');
  assert.equal(result.skippedPaths.length, 2); assert.equal(state.objects.size, 2);
});
test('modified owned object is not deleted; missing record never removes data', async t => {
  const { state, manifest, run, dir } = await fixture(t);
  await run(); state.objects.set(manifest.items[0].images[0].storagePath, Buffer.from('later replacement'));
  const result = await run('remove'); assert.equal(result.skippedPaths.length, 1);
  await rm(join(dir, 'record.json'));
  await assert.rejects(run('remove'), /Falta el registro/); assert.equal(state.objects.size, 1);
});
test('corrupt local image fails before any remote mutation', async t => {
  const { manifest, state, run, dir } = await fixture(t);
  await writeFile(join(dir, manifest.items[0].images[0].file), 'bad');
  await assert.rejects(run(), /SHA incorrecto/); assert.equal(state.uploads, 0);
});

test('already completed removal is harmless on repetition', async t => {
  const { run, state } = await fixture(t);
  await run(); await run('remove');
  const before = copy(state.sections);
  const result = await run('remove');
  assert.equal(result.alreadyRemoved, true); assert.deepEqual(state.sections, before);
});
test('an upload with interrupted local confirmation is reused without claiming ownership', async t => {
  const { state, manifest, run, dir } = await fixture(t);
  await run();
  const path = manifest.items[0].images[0].storagePath;
  const recordPath = join(dir, 'record.json');
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  record.createdPaths = record.createdPaths.filter(p => p !== path); record.pendingUpload = path;
  await writeFile(recordPath, JSON.stringify(record));
  const result = await run(); assert.deepEqual(result.uncertainPaths, [path]);
  await run('remove'); assert.ok(state.objects.has(path));
});

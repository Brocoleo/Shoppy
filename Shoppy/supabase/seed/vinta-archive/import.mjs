/** Importación editorial reversible. Nunca crea productos ni precios. */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const PROJECT = 'evzlqwiipdjgtrqjlwba';
const ARCHIVE = 'vinta-archive';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
function checked(result) { if (result.error) throw new Error(result.error.message); return result.data; }
function payload(row) {
  return row ? { key: row.key, title: row.title, config: row.config, is_active: row.is_active, sort_order: row.sort_order } : null;
}
export function createSupabaseDatabase(client) {
  const storage = client.storage.from('product-images');
  return {
    async sections() { return checked(await client.from('home_sections').select('*')); },
    async replaceSection(previous, next) {
      let query;
      if (!previous) query = client.from('home_sections').insert(next);
      else {
        query = next ? client.from('home_sections').update(payload(next)) : client.from('home_sections').delete();
        query = query.eq('id', previous.id).eq('updated_at', previous.updated_at);
      }
      const rows = checked(await query.select('*'));
      assert.equal(rows.length, 1, 'La sección cambió durante la operación; no se sobrescribe.');
      return next ? rows[0] : null;
    },
    async productReferences(paths) {
      if (!paths.length) return [];
      return checked(await client.from('product_images').select('storage_path').in('storage_path', paths));
    },
    async readObject(path) {
      const result = await storage.download(path);
      if (result.error) {
        if (String(result.error.statusCode) === '404' || /object not found/i.test(result.error.message)) return null;
        throw new Error(result.error.message);
      }
      return Buffer.from(await result.data.arrayBuffer());
    },
    async upload(path, bytes) { checked(await storage.upload(path, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })); },
    async remove(path) { checked(await storage.remove([path])); },
  };
}
function referenced(config, path) {
  if (config === path || (typeof config === 'string' && config.endsWith(`/product-images/${path}`))) return true;
  if (Array.isArray(config)) return config.some(value => referenced(value, path));
  return Boolean(config && typeof config === 'object' && Object.values(config).some(value => referenced(value, path)));
}
function validateManifest(manifest) {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.projectRef, PROJECT, 'Proyecto no autorizado.');
  assert.equal(manifest.batch, 'vinta-archive-2026-10-16', 'Lote no autorizado.');
  assert.ok(Array.isArray(manifest.items) && manifest.items.length > 0, 'Archivo vacío.');
  const ids = new Set(), slugs = new Set(), paths = new Set();
  for (const item of manifest.items) {
    assert.match(item.id, /^[a-zA-Z0-9_-]+$/);
    assert.match(item.slug, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(item.id) && !slugs.has(item.slug), 'Publicación duplicada.'); ids.add(item.id); slugs.add(item.slug);
    assert.equal(item.sourceUrl, `https://www.instagram.com/vinta.zhe/p/${item.id}/`);
    assert.equal(typeof item.title, 'string');
    assert.ok(Array.isArray(item.images) && item.images.length > 0);
    for (const image of item.images) {
      assert.equal(basename(image.file), image.file, 'Nombre de archivo inválido.');
      assert.match(image.sha256, /^[a-f0-9]{64}$/);
      assert.match(image.storagePath, /^vinta\/archive\/2026-10-16\/[a-zA-Z0-9_-]+\.webp$/);
      assert.ok(!paths.has(image.storagePath), 'Ruta duplicada.'); paths.add(image.storagePath);
      assert.ok(Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0);
      assert.equal(typeof image.alt, 'string');
    }
  }
}
async function readRecord(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function saveRecord(path, record) {
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, JSON.stringify(record, null, 2), { mode: 0o600 });
  await rename(temp, path);
}
/** database is an injectable adapter; all tests use an in-memory transport. */
export async function runImport({ manifest, assetsDir, recordPath, mode = 'dry-run', database, projectUrl }) {
  assert.ok(['dry-run', 'apply', 'remove'].includes(mode));
  validateManifest(manifest);
  assert.equal(new URL(projectUrl).hostname, `${PROJECT}.supabase.co`, 'Proyecto distinto al autorizado.');
  const images = manifest.items.flatMap(item => item.images);
  const paths = images.map(image => image.storagePath);
  const sections = await database.sections();
  const archive = sections.find(row => row.key === ARCHIVE) ?? null;
  const hero = sections.find(row => row.key === 'hero') ?? null;
  assert.ok(!archive || archive.config?.batch === manifest.batch, 'La sección de archivo pertenece a otro lote.');
  let record = await readRecord(recordPath);
  if (record) {
    assert.equal(record.projectRef, PROJECT); assert.equal(record.batch, manifest.batch);
    assert.ok(same(record.paths, paths), 'El manifiesto cambió: utiliza otro lote.');
  }
  const buffers = new Map();
  if (mode !== 'remove') {
    for (const image of images) {
      const bytes = await readFile(resolve(assetsDir, image.file));
      assert.equal(hash(bytes), image.sha256, `SHA incorrecto: ${image.file}`);
      buffers.set(image.storagePath, bytes);
    }
  }
  const existingObjects = new Map();
  if (mode !== 'remove') {
    for (const image of images) {
      const bytes = await database.readObject(image.storagePath);
      if (bytes) assert.equal(hash(bytes), image.sha256, `Archivo ajeno en ${image.storagePath}; no se sobrescribe.`);
      existingObjects.set(image.storagePath, bytes);
    }
  }
  if (mode === 'dry-run') return { mode, batch: manifest.batch, publications: manifest.items.length, images: images.length, existingArchive: Boolean(archive) };
  if (mode === 'remove' && record?.removedAt) return { mode, alreadyRemoved: true, skippedSections: [], skippedPaths: [] };
  if (!record || record.removedAt) {
    assert.notEqual(mode, 'remove', 'Falta el registro de carga; no se retira nada.');
    assert.ok(!archive, 'Existe el lote pero falta su registro original: no se sobrescribe.');
    record = { version: 1, projectRef: PROJECT, batch: manifest.batch, paths, previous: { [ARCHIVE]: archive, hero }, written: {}, createdPaths: [], uploaded: [], removedPaths: [], startedAt: new Date().toISOString() };
    await saveRecord(recordPath, record); // Must succeed before the first remote write.
  }
  const persist = () => saveRecord(recordPath, record);
  const writeSection = async (previous, next) => {
    const key = next?.key ?? previous.key;
    record.pendingSection = { key, previous, next };
    await persist();
    const result = await database.replaceSection(previous, next);
    record.written[key] = result;
    delete record.pendingSection;
    await persist();
    return result;
  };
  if (mode === 'remove') {
    const skippedSections = [];
    for (const key of [ARCHIVE, 'hero']) {
      const current = (await database.sections()).find(row => row.key === key) ?? null;
      const written = record.written[key];
      if (written && same(current, written)) {
        await database.replaceSection(current, record.previous[key]);
        record.written[key] = null;
        await persist();
      } else if (current && written) skippedSections.push(key);
    }
    const skippedPaths = [...(record.uncertainPaths ?? [])];
    for (const path of record.createdPaths) {
      if (record.removedPaths.includes(path)) continue;
      const refs = await database.productReferences([path]);
      const current = await database.sections();
      if (refs.length || current.some(row => referenced(row.config, path))) { skippedPaths.push(path); continue; }
      const bytes = await database.readObject(path);
      const expected = images.find(image => image.storagePath === path);
      if (bytes && hash(bytes) !== expected.sha256) { skippedPaths.push(path); continue; }
      if (bytes) await database.remove(path);
      record.removedPaths.push(path); await persist();
    }
    record.lastRemoval = { skippedSections, skippedPaths, at: new Date().toISOString() };
    if (!skippedSections.length && !skippedPaths.length) record.removedAt = record.lastRemoval.at;
    await persist();
    return { mode, ...record.lastRemoval };
  }
  // If termination happened between upload and record-save, provenance is uncertain.
  // Reuse the bytes, but never delete an object whose successful creation was not recorded.
  if (record.pendingUpload && existingObjects.get(record.pendingUpload) && !record.createdPaths.includes(record.pendingUpload)) {
    record.uncertainPaths = [...new Set([...(record.uncertainPaths ?? []), record.pendingUpload])];
    await persist();
  }
  // Existing objects are immutable. Identical shared objects may be reused, never claimed.
  for (const image of images) {
    const bytes = existingObjects.get(image.storagePath);
    if (bytes) assert.equal(hash(bytes), image.sha256, `Archivo ajeno en ${image.storagePath}; no se sobrescribe.`);
    else {
      record.pendingUpload = image.storagePath; await persist();
      await database.upload(image.storagePath, buffers.get(image.storagePath));
      record.createdPaths.push(image.storagePath);
    }
    if (!record.uploaded.includes(image.storagePath)) record.uploaded.push(image.storagePath);
    delete record.pendingUpload; await persist();
  }
  const current = (await database.sections()).find(row => row.key === ARCHIVE) ?? null;
  assert.ok(!current || current.config?.batch === manifest.batch, 'Colisión con otro archivo.');
  const previousItems = new Map((current?.config.items ?? []).map(item => [item.id, item]));
  const config = { version: 1, batch: manifest.batch, items: manifest.items.map(item => {
    const previous = previousItems.get(item.id);
    return { id: item.id, slug: item.slug, title: previous?.title ?? item.title, sourceUrl: item.sourceUrl, publishedAt: item.publishedAt, visible: previous?.visible ?? item.visible, images: item.images.map(({ storagePath, width, height, alt }) => ({ storagePath, width, height, alt })) };
  }) };
  if (!current || !same(current.config, config)) await writeSection(current, { ...(current ?? { key: ARCHIVE, title: 'Archivo de Instagram', is_active: true, sort_order: 90 }), config });
  // Repeated imports keep all subsequent admin decisions, including hero framing.
  if (!record.heroInitialized) {
    const currentHero = (await database.sections()).find(row => row.key === 'hero') ?? null;
    if (!record.written.hero && !same(currentHero, record.previous.hero)) throw new Error('La portada cambió desde el inicio; no se sobrescribe.');
    const editorial = id => {
      const image = config.items.find(item => item.id === id)?.images[0];
      assert.ok(image, `Falta fotografía editorial: ${id}`); return { ...image, fit: 'contain', position: 'center' };
    };
    const heroConfig = { title: 'Prendas únicas,', secondLine: 'otras historias.', ctaLabel: 'Explorar prendas', ctaHref: '/catalogo', primary: editorial('CMS5wJ-hhYX'), secondary: editorial('CDrmUrRhvDO') };
    await writeSection(currentHero, { ...(currentHero ?? { key: 'hero', title: 'Portada', is_active: true, sort_order: 10 }), config: heroConfig });
    record.heroInitialized = true; await persist();
  }
  record.finishedAt = new Date().toISOString(); await persist();
  return { mode, batch: manifest.batch, publications: config.items.length, images: images.length, createdPaths: record.createdPaths.length, uncertainPaths: record.uncertainPaths ?? [] };
}
async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => ['--apply', '--remove'].includes(arg)) && args.length <= 1, 'Usa --apply o --remove, no ambos. Sin opción: dry-run.');
  const dir = dirname(fileURLToPath(import.meta.url));
  const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, 'Faltan SUPABASE_URL y SUPABASE_SECRET_KEY; usa un archivo de entorno seguro.');
  assert.equal(new URL(url).hostname, `${PROJECT}.supabase.co`, 'Proyecto distinto al autorizado.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await runImport({ manifest, assetsDir: resolve(dir, 'images'), recordPath: process.env.VINTA_IMPORT_LOG ?? resolve(dir, 'last-run.local.json'), mode: args[0] === '--apply' ? 'apply' : args[0] === '--remove' ? 'remove' : 'dry-run', database: createSupabaseDatabase(client), projectUrl: url });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

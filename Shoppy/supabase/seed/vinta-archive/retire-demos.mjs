/** Retira exclusivamente publicaciones ficticias conocidas; conserva productos e imágenes. */
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const PROJECT = 'evzlqwiipdjgtrqjlwba';
const BATCH = 'vinta-retire-demos-2026-10-16';
// Identidad contrastada con el seed SQL y con la lectura pública de la auditoría.
const LEGACY = [
  {
    "id": "d0000000-0000-4000-8000-000000000001",
    "slug": "chaqueta-trucker-levis",
    "name": "Chaqueta trucker Levi's"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000002",
    "slug": "polera-nike-dryfit",
    "name": "Polera Nike Dry-Fit"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000003",
    "slug": "jeans-wrangler-rectos",
    "name": "Jeans Wrangler rectos"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000004",
    "slug": "sweater-lana-vintage",
    "name": "Sweater de lana vintage"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000005",
    "slug": "poleron-adidas-capucha",
    "name": "Polerón Adidas con capucha"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000006",
    "slug": "vestido-zara-midi",
    "name": "Vestido Zara midi"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000007",
    "slug": "camisa-mango-lino",
    "name": "Camisa Mango de lino"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000008",
    "slug": "jeans-levis-501",
    "name": "Jeans Levi's 501"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000009",
    "slug": "cartera-cuero-genuino",
    "name": "Cartera de cuero genuino"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000010",
    "slug": "cinturon-cuero-trenzado",
    "name": "Cinturón de cuero trenzado"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000011",
    "slug": "vestido-hm-floral",
    "name": "Vestido H&M floral"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000012",
    "slug": "parka-gap-impermeable",
    "name": "Parka Gap impermeable"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000013",
    "slug": "blazer-zara-sastrero",
    "name": "Blazer Zara sastrero"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000014",
    "slug": "falda-denim-vintage",
    "name": "Falda de denim vintage"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000015",
    "slug": "panuelo-seda-estampado",
    "name": "Pañuelo de seda estampado"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000016",
    "slug": "polera-puma-esencial",
    "name": "Polera Puma esencial"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000017",
    "slug": "camisa-lacoste-oxford",
    "name": "Camisa Lacoste oxford"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000018",
    "slug": "chaqueta-cuero-vintage",
    "name": "Chaqueta de cuero vintage"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000019",
    "slug": "shorts-jean-levis",
    "name": "Shorts de jean Levi's"
  },
  {
    "id": "d0000000-0000-4000-8000-000000000020",
    "slug": "chaleco-tommy-hilfiger",
    "name": "Chaleco Tommy Hilfiger"
  }
];
const sameSnapshot = (a, b) => Boolean(a && b && a.id === b.id && a.slug === b.slug && a.published_at === b.published_at && a.updated_at === b.updated_at);
const snapshot = row => ({ id: row.id, slug: row.slug, published_at: row.published_at, updated_at: row.updated_at });
function checked(result) { if (result.error) throw new Error(result.error.message); return result.data; }
export function retirementTargets(editorialManifest) {
  assert.equal(editorialManifest.projectRef, PROJECT, 'Proyecto del catálogo demo distinto.');
  assert.equal(editorialManifest.batch, 'editorial-a-20261015', 'Lote demo distinto.');
  assert.equal(editorialManifest.products.length, 8, 'Se esperan exactamente ocho prendas demo.');
  const targets = [...LEGACY, ...editorialManifest.products.map(({ id, slug, name }) => ({ id, slug, name, demoBatch: editorialManifest.batch }))];
  assert.equal(new Set(targets.map(row => row.id)).size, 28, 'Identificador duplicado.');
  return targets;
}
export function createRetirementDatabase(client) {
  return {
    async products(ids) { return checked(await client.from('products').select('id,slug,name,metadata,published_at,updated_at').in('id', ids)); },
    async setPublication(previous, publishedAt) {
      let query = client.from('products').update({ published_at: publishedAt }).eq('id', previous.id).eq('slug', previous.slug).eq('updated_at', previous.updated_at);
      query = previous.published_at === null ? query.is('published_at', null) : query.eq('published_at', previous.published_at);
      const rows = checked(await query.select('id,slug,name,metadata,published_at,updated_at'));
      return rows[0] ?? null; // No affected row means concurrent edit; never retry without re-reading.
    },
  };
}
function owns(row, target) {
  return row.slug === target.slug && row.name === target.name && (!target.demoBatch || (row.metadata?.demo === true && row.metadata?.batch === target.demoBatch));
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
/** Injectable adapter keeps every unit test offline. */
export async function retireDemos({ editorialManifest, database, projectUrl, recordPath, mode = 'dry-run' }) {
  assert.ok(['dry-run', 'apply', 'restore'].includes(mode), 'Modo desconocido.');
  assert.equal(new URL(projectUrl).hostname, `${PROJECT}.supabase.co`, 'Proyecto distinto al autorizado.');
  const targets = retirementTargets(editorialManifest), ids = targets.map(row => row.id);
  const rows = await database.products(ids), byId = new Map(rows.map(row => [row.id, row]));
  assert.ok(rows.every(row => ids.includes(row.id)), 'El transporte devolvió productos ajenos.');
  if (mode !== 'restore') {
    for (const row of rows) assert.ok(owns(row, targets.find(target => target.id === row.id)), `Colisión con un producto real o modificado: ${row.id}. No se retira ninguno.`);
  }
  const missing = ids.filter(id => !byId.has(id));
  if (mode === 'dry-run') return { mode, projectRef: PROJECT, targets: ids, found: rows.length, published: rows.filter(row => row.published_at !== null).length, missing };
  let record = await readRecord(recordPath);
  if (record) {
    assert.equal(record.projectRef, PROJECT); assert.equal(record.batch, BATCH);
    assert.deepEqual(record.targetIds, ids, 'Cambió la selección del lote.');
    assert.ok(!record.restoredAt || mode === 'restore', 'Este lote ya fue restaurado. Conserva su registro y utiliza otro archivo para una nueva retirada.');
  } else {
    assert.notEqual(mode, 'restore', 'Falta el registro original. No se restaura ningún producto.');
    record = { version: 1, projectRef: PROJECT, batch: BATCH, targetIds: ids, previous: Object.fromEntries(rows.map(row => [row.id, snapshot(row)])), written: {}, restored: [], pending: null, startedAt: new Date().toISOString() };
    await saveRecord(recordPath, record); // Durable backup must succeed before touching Supabase.
  }
  const result = { mode, changed: [], alreadyUnpublished: [], skipped: [...missing], uncertain: [] };
  for (const target of targets) {
    const current = (await database.products([target.id]))[0];
    if (!current) continue;
    const previous = record.previous[target.id], written = record.written[target.id];
    if (!owns(current, target) || !previous) { result.skipped.push(target.id); continue; }
    if (mode === 'restore') {
      if (record.restored.includes(target.id)) continue;
      if (!written) {
        if (current.published_at === null && previous.published_at !== null) result.uncertain.push(target.id);
        continue;
      }
      if (current.published_at !== null || !sameSnapshot(current, written)) { result.skipped.push(target.id); continue; }
      record.pending = { mode, id: target.id, previous: snapshot(current), published_at: previous.published_at };
      await saveRecord(recordPath, record);
      const restored = await database.setPublication(current, previous.published_at);
      if (restored) { record.restored.push(target.id); result.changed.push(target.id); }
      else result.skipped.push(target.id);
    } else {
      if (written && !sameSnapshot(current, written)) { result.skipped.push(target.id); continue; }
      if (current.published_at === null) {
        result.alreadyUnpublished.push(target.id);
        if (!written && previous.published_at !== null) result.uncertain.push(target.id);
        continue;
      }
      if (!sameSnapshot(current, previous)) { result.skipped.push(target.id); continue; }
      record.pending = { mode, id: target.id, previous: snapshot(current), published_at: null };
      await saveRecord(recordPath, record);
      const retired = await database.setPublication(current, null);
      if (retired) { record.written[target.id] = snapshot(retired); result.changed.push(target.id); }
      else result.skipped.push(target.id);
    }
    record.pending = null;
    await saveRecord(recordPath, record);
  }
  record.lastResult = result;
  if (mode === 'restore' && !result.skipped.length && !result.uncertain.length) record.restoredAt = new Date().toISOString();
  record.finishedAt = new Date().toISOString(); await saveRecord(recordPath, record);
  return result;
}
async function main() {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1 && args.every(arg => ['--apply', '--restore'].includes(arg)), 'Usa --apply o --restore; sin opción: dry-run.');
  const dir = dirname(fileURLToPath(import.meta.url));
  const editorialManifest = JSON.parse(await readFile(resolve(dir, '../editorial-demo/manifest.json'), 'utf8'));
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && key, 'Faltan SUPABASE_URL y SUPABASE_SECRET_KEY.');
  assert.equal(new URL(url).hostname, `${PROJECT}.supabase.co`, 'Proyecto distinto al autorizado.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  console.log(JSON.stringify(await retireDemos({ editorialManifest, projectUrl: url, database: createRetirementDatabase(client), recordPath: process.env.VINTA_RETIRE_LOG ?? resolve(dir, 'retired-demos.local.json'), mode: args[0] === '--apply' ? 'apply' : args[0] === '--restore' ? 'restore' : 'dry-run' }), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

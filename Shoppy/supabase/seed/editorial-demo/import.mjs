/** Importación explícita e idempotente: node --env-file=<archivo seguro> import.mjs [--apply | --remove]. */
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
const dir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8'));
assert.equal(new Set(manifest.products.map(p => p.id)).size, 8);
assert.equal(new Set(manifest.products.map(p => p.storage_path)).size, 8);
const apply = process.argv.includes('--apply');
const remove = process.argv.includes('--remove');
assert.ok(!(apply && remove), 'Usa --apply o --remove, no ambos.');
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY; no se ha escrito ningún dato.');
assert.equal(new URL(url).hostname, `${manifest.projectRef}.supabase.co`, 'Proyecto distinto al autorizado.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
const ids = manifest.products.map(p => p.id);
const existing = check(await db.from('products').select('id,slug,metadata,stock,availability').in('id', ids));
for (const row of existing) assert.ok(row.metadata?.demo === true && row.metadata?.batch === manifest.batch, 'Colisión con un producto ajeno: se cancela la carga.');
const slugs = check(await db.from('products').select('id,slug').in('slug', manifest.products.map(p => p.slug)));
for (const row of slugs) assert.ok(ids.includes(row.id), 'Slug ocupado por un producto ajeno.');
const categories = check(await db.from('categories').select('id,slug'));
const categoryId = slug => categories.find(c => c.slug === slug)?.id ?? null;
const expectedPaths = manifest.products.map(p => p.storage_path);
const images = check(await db.from('product_images').select('id,product_id,storage_path').in('product_id', ids));
for (const row of images) assert.ok(expectedPaths.includes(row.storage_path) && manifest.products.some(p => p.imageId === row.id && p.id === row.product_id), 'Imagen ajena asociada: se cancela la operación.');
console.log(JSON.stringify({ project: manifest.projectRef, batch: manifest.batch, existing: existing.length, products: ids, paths: expectedPaths, mode: remove ? 'remove' : apply ? 'apply' : 'dry-run' }, null, 2));
if (!apply && !remove) process.exit(0);
const recordPath = process.env.SHOPY_IMPORT_LOG ?? resolve(dir, 'last-run.local.json');
const record = { project: manifest.projectRef, batch: manifest.batch, startedAt: new Date().toISOString(), mode: remove ? 'remove' : 'apply', products: ids, paths: expectedPaths, completed: [] };
await writeFile(recordPath, JSON.stringify(record, null, 2));
if (remove) {
  check(await db.from('product_images').delete().in('product_id', ids));
  check(await db.from('products').delete().in('id', ids).eq('metadata->>batch', manifest.batch));
  check(await db.storage.from('product-images').remove(expectedPaths));
  const cleanup = await db.from('image_cleanup').delete().in('storage_path', expectedPaths);
  // La cola solo existe en esquemas que incorporan la gestión beta de imágenes.
  if (cleanup.error && !['42P01', 'PGRST205'].includes(cleanup.error.code)) check(cleanup);
  record.completed = ids;
} else {
  // Verifica todos los archivos antes de comenzar la primera escritura remota.
  for (const p of manifest.products) {
    await access(resolve(dir, 'images', p.file));
    assert.ok(categoryId(p.category), `Categoría inexistente: ${p.category}`);
  }
  for (const [index, p] of manifest.products.entries()) {
    assert.ok(categoryId(p.category), `Categoría inexistente: ${p.category}`);
    const image = await readFile(resolve(dir, 'images', p.file));
    check(await db.storage.from('product-images').upload(p.storage_path, image, { contentType: 'image/webp', cacheControl: '31536000', upsert: true }));
    check(await db.from('products').upsert({ id: p.id, slug: p.slug, name: p.name, description: 'Producto de demostración · Imagen generada. Prenda ficticia para explorar el diseño; precio, talla y estado ilustrativos. No disponible para compra.', brand_id: null, category_id: categoryId(p.category), subcategory_id: categoryId(p.subcategory), segment: p.category, price_clp: p.price_clp, compare_at_price_clp: null, condition: 'bueno', size: p.size, color: p.color, stock: 0, availability: 'SOLD', published_at: new Date(Date.parse('2026-10-15T12:00:00.000Z') - index * 1000).toISOString(), tags: ['demostracion'], is_featured: false, metadata: { demo: true, generated_image: true, batch: manifest.batch } }, { onConflict: 'id' }));
    check(await db.from('product_images').upsert({ id: p.imageId, product_id: p.id, storage_path: p.storage_path, sort_order: 0, is_cover: true, is_defect_detail: false, alt_text: `${p.name}: imagen generada de demostración` }, { onConflict: 'id' }));
    record.completed.push(p.id);
    await writeFile(recordPath, JSON.stringify(record, null, 2));
  }
  const result = check(await db.from('products').select('id,stock,availability,metadata,product_images(storage_path)').in('id', ids));
  assert.equal(result.length, 8);
  assert.ok(result.every(p => p.stock === 0 && p.availability === 'SOLD' && p.metadata?.demo === true && p.product_images.length === 1));
}
record.finishedAt = new Date().toISOString();
await writeFile(recordPath, JSON.stringify(record, null, 2));
console.log(`Operación completada: ${record.completed.length} productos. Registro: ${recordPath}`);

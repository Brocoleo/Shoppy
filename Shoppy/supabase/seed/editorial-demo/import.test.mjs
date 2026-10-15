import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));

test('rollback deletes only its demo batch and supports a schema without the cleanup queue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shopy-demo-import-'));
  try {
    const loader = join(dir, 'mock.mjs');
    const callsFile = join(dir, 'calls.json');
    await writeFile(loader, `
      import { writeFileSync } from 'node:fs';
      const manifest = ${JSON.stringify(manifest)};
      const calls = [];
      globalThis.fetch = async (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url ?? input);
        const method = init.method ?? 'GET';
        calls.push({ path: url.pathname, search: url.search, method, body: init.body });
        writeFileSync(${JSON.stringify(callsFile)}, JSON.stringify(calls));
        let data = [];
        let status = 200;
        if (url.pathname.endsWith('/products') && method === 'GET') {
          data = manifest.products.map(p => ({ ...p, stock: 0, availability: 'SOLD', metadata: { demo: true, batch: manifest.batch } }));
        } else if (url.pathname.endsWith('/product_images') && method === 'GET') {
          data = manifest.products.map(p => ({ id: p.imageId, product_id: p.id, storage_path: p.storage_path }));
        } else if (url.pathname.endsWith('/image_cleanup')) {
          status = 404;
          data = { code: 'PGRST205', message: 'Table absent in base schema' };
        } else if (!url.pathname.endsWith('/categories') && method !== 'DELETE') {
          status = 500;
          data = { message: 'Unexpected mocked request' };
        }
        return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      };
    `);
    const result = spawnSync(process.execPath, ['--import', loader, fileURLToPath(new URL('./import.mjs', import.meta.url)), '--remove'], {
      env: { ...process.env, SUPABASE_URL: `https://${manifest.projectRef}.supabase.co`, SUPABASE_SECRET_KEY: 'test-only-not-a-real-key', SHOPY_IMPORT_LOG: join(dir, 'record.json') },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const calls = JSON.parse(await readFile(callsFile, 'utf8'));
    const deletes = calls.filter(c => c.method === 'DELETE');
    assert.equal(deletes.length, 4);
    const products = deletes.find(c => c.path.endsWith('/products'));
    const filters = new URLSearchParams(products.search);
    assert.equal(filters.get('metadata->>batch'), `eq.${manifest.batch}`);
    for (const p of manifest.products) assert.ok(filters.get('id').includes(p.id));
    const storage = deletes.find(c => c.path.startsWith('/storage/'));
    assert.deepEqual(JSON.parse(storage.body).prefixes, manifest.products.map(p => p.storage_path));
    assert.ok(deletes.every(c => c.path.startsWith('/rest/v1/') || c.path === '/storage/v1/object/product-images'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/* Preload ONLY for the isolated SSR retry browser test; never import in application code. */
const fs = require('node:fs');
const originalFetch = globalThis.fetch;
const product = {
  id: '55555555-5555-4555-8555-555555555555', slug: 'prenda-reintento-local',
  name: 'Prenda recuperada de prueba local', description: 'Contenido simulado para comprobar la recuperación SSR.',
  brand_id: null, category_id: null, subcategory_id: null, segment: null,
  price_clp: 12000, compare_at_price_clp: null, condition: 'bueno', size: 'M', color: 'Marfil',
  stock: 0, availability: 'AVAILABLE', published_at: '2026-01-01T00:00:00Z', tags: [],
  view_count: 0, favorite_count: 0, trending_score: 0, is_featured: false,
  metadata: {}, brand: null, product_images: [],
};
globalThis.fetch = async (input, init) => {
  const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(requestUrl);
  if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) return originalFetch(input, init);
  const method = (init?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
  let status = 200;
  let body = [];
  const table = url.pathname.split('/').at(-1);
  if (!url.hostname.endsWith('.supabase.co') || !url.pathname.startsWith('/rest/v1/') || method !== 'GET') {
    status = 403;
    body = { message: 'External transport blocked by local SSR fixture' };
  } else if (fs.existsSync(process.env.SSR_FIXTURE_FAILURE_FLAG) && ['products', 'collections', 'collection_products'].includes(table)) {
    status = 503;
    body = { message: 'Intentional temporary server read failure' };
  } else if (table === 'products') body = [product];
  else if (table === 'collections') body = [{ slug: 'coleccion-reintento-local', name: 'Colección recuperada de prueba local' }];
  else if (table === 'collection_products') body = [{ product_id: product.id, collections: { slug: 'coleccion-reintento-local' } }];
  if (process.env.SSR_FIXTURE_LOG) fs.appendFileSync(process.env.SSR_FIXTURE_LOG, `${JSON.stringify({ method, table, status })}\n`);
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } });
};

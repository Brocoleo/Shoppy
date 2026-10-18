/** Local-only HTTP adapter around the real checkout handler and existing test fixture.
 * Storage/RPC/provider are in-memory simulations, not PostgreSQL or MercadoPago.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fixture, product, rate } from '../../supabase/tests/helpers/checkout-fixture.mjs';

export function createLocalCheckout({ apiOrigin = 'http://127.0.0.1:4010', webOrigin = 'http://localhost:3020' } = {}) {
  for (const origin of [apiOrigin, webOrigin]) {
    const u = new URL(origin);
    if (u.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(u.hostname) || u.origin !== origin) throw Error('Only explicit loopback origins are allowed');
  }
  let state, offline = false, requests = 0;
  function reset() {
    state = fixture({ interactive: true, verdict: 'PENDING', paymentUrl: id => `${webOrigin}/local-backend/payment/${id}` });
    Object.assign(state.rows.products[0], { name: 'Prenda ficticia · Prueba local', slug: 'prenda-prueba-local', description: 'Inventario ficticio del simulador local. No se vende ni utiliza datos comerciales.', price_clp: 12990, stock: 5, size: 'M', color: 'Marfil', metadata: { local_fixture: true }, images: [], brand: null, tags: [], view_count: 0, favorite_count: 0, trending_score: 0, is_featured: false });
    Object.assign(state.rows.shipping_rates[0], { carrier: 'Despacho ficticio', price_clp: 2990, comuna: null, eta_days_min: 1, eta_days_max: 2 });
    state.rows.shipping_rates.push({ ...state.rows.shipping_rates[0], id: '20000000-0000-4000-8000-000000000002', region: 'Valparaíso', price_clp: 4990 });
    Object.assign(state.rows, { categories: [], collections: [], collection_products: [], home_sections: [], shipments: [] });
    offline = false;
  }
  reset();
  function expire(orderId) {
    for (const r of state.rows.product_reservations.filter(r => r.order_id === orderId && r.status === 'active')) {
      state.rows.products.find(p => p.id === r.product_id).stock += r.qty;
      r.status = 'expired';
    }
  }
  function snapshot() {
    return { simulation: true, offline, requests, orders: state.rows.orders.map(o => ({ id: o.id, status: o.status, total_clp: o.total_clp, region: o.shipping_address?.region })), payments: state.rows.payments.map(p => ({ status: p.status, incident: p.incident ?? null })), stock: state.rows.products[0].stock, creates: state.createCalls, stockDeductions: state.stockDeductions, paidTransitions: state.rows.order_status_history.filter(h => h.to_status === 'PAID').length };
  }
  function json(body, status = 200) { return Response.json(body, { status }); }
  function page(body) {
    return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pago simulado local</title><style>body{max-width:42rem;margin:3rem auto;padding:1rem;background:#f8f7f4;color:#222;font:18px system-ui}button,a{display:inline-block;margin:.5rem;padding:.8rem;border:1px solid;min-height:44px}button:focus-visible,a:focus-visible{outline:3px solid #1769aa;outline-offset:3px}</style><h1>Prueba local · Pago simulado</h1><p>No se conecta a Supabase ni a MercadoPago. Solo modifica memoria local.</p>${body}</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` } });
  }
  async function handle(req) {
    const u = new URL(req.url); requests++;
    if (req.headers.get('origin') && ![apiOrigin, webOrigin].includes(req.headers.get('origin'))) return json({ error: 'Origin rejected' }, 403);
    if (u.pathname === '/__local/state') return json(snapshot());
    if (u.pathname === '/__local/reset' && req.method === 'POST') { reset(); return json(snapshot()); }
    if (u.pathname === '/__local/network' && req.method === 'POST') { offline = (await req.json()).offline === true; return json({ offline }); }
    const match = u.pathname.match(/^\/payment\/([0-9a-f-]{36})$/);
    if (match) {
      const order = state.rows.orders.find(o => o.id === match[1]);
      if (!order) return page('<p>Pedido local no encontrado.</p>');
      if (req.method === 'POST') {
        const choice = (await req.formData()).get('outcome');
        if (!['approved', 'pending', 'rejected', 'cancelled', 'expired', 'network'].includes(choice)) return json({ error: 'Invalid outcome' }, 400);
        if (choice === 'expired') { expire(order.id); state.setVerdict('APPROVED'); }
        else if (choice === 'network') { state.setVerdict('APPROVED'); offline = true; }
        else state.setVerdict(choice === 'approved' ? 'APPROVED' : ['rejected', 'cancelled'].includes(choice) ? 'REJECTED' : 'PENDING');
        return Response.redirect(`${webOrigin}/checkout-return?state=${randomUUID()}`, 303);
      }
      return page(`<p>Total ficticio: $${order.total_clp.toLocaleString('es-CL')} CLP</p><form method="post"><p>Elige el resultado simulado:</p>${[['approved','Aprobar'],['pending','Pendiente'],['rejected','Rechazar'],['cancelled','Cancelar'],['expired','Reserva vencida'],['network','Corte de conexión']].map(([value,label])=>`<button name="outcome" value="${value}">${label}</button>`).join('')}</form><a href="${webOrigin}/checkout">Volver sin pagar</a>`);
    }
    if (u.pathname === '/functions/v1/checkout' && req.method === 'POST') {
      if (offline) return json({ error: { code: 'LOCAL_OFFLINE', message: 'Conexión interrumpida en el simulador local. Restablécela desde el panel de pruebas.' } }, 503);
      const response = await state.call(await req.json());
      return response;
    }
    if (u.pathname === '/rest/v1/rpc/get_guest_order' && req.method === 'POST') {
      const input = await req.json();
      const order = state.rows.orders.find(o => o.id === input.p_order_id && o.guest_token === input.p_token);
      return order ? json({ ...order, items: state.rows.order_items.filter(i => i.order_id === order.id) }) : json({ message: 'Not found' }, 404);
    }
    if (u.pathname.startsWith('/rest/v1/') && ['GET', 'HEAD'].includes(req.method)) {
      const table = u.pathname.split('/').at(-1);
      if (!Array.isArray(state.rows[table])) return json({ message: 'Unknown local fixture table' }, 404);
      let rows = state.rows[table].filter(row => [...u.searchParams].every(([key, filter]) => {
        if (['select','order','limit','offset','or'].includes(key)) return true;
        if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
        if (filter.startsWith('in.(')) return filter.slice(4,-1).split(',').includes(String(row[key]));
        if (filter === 'not.is.null') return row[key] != null;
        if (filter.startsWith('neq.')) return String(row[key]) !== filter.slice(4);
        return true;
      }));
      if (u.searchParams.has('limit')) rows = rows.slice(0, Number(u.searchParams.get('limit')));
      return json(req.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
    }
    return json({ error: 'Local simulator: route/method not supported' }, 404);
  }
  const server = createServer(async (req, res) => {
    if (req.headers.host !== new URL(apiOrigin).host) { res.writeHead(403); res.end(); return; }
    const origin = req.headers.origin;
    const headers = { 'Cache-Control': 'no-store', 'Vary': 'Origin', ...(origin === webOrigin || origin === apiOrigin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type,apikey,authorization,x-client-info', 'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS' } : {}) };
    if (req.method === 'OPTIONS') { res.writeHead(origin === webOrigin || origin === apiOrigin ? 204 : 403, headers); res.end(); return; }
    try {
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 100_000) throw Error('Too large'); chunks.push(c); }
      const request = new Request(`${apiOrigin}${req.url}`, { method: req.method, headers: req.headers, ...(['GET','HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
      const response = await handle(request);
      res.writeHead(response.status, { ...Object.fromEntries(response.headers), ...headers });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500, headers); res.end(JSON.stringify({ error: 'Local simulator failure' })); }
  });
  return { server, handle, snapshot, product, rate };
}

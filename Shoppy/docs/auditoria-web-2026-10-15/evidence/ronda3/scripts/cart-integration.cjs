const path = require('node:path');
const evidence = process.env.AUDIT_OUTPUT || path.join(__dirname, '../results');
require('node:fs').mkdirSync(evidence, { recursive: true });
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.env.AUDIT_URL || 'http://127.0.0.1:3113';
const G = '10000000-0000-4000-8000-000000000001', A = '20000000-0000-4000-8000-000000000002', B = '30000000-0000-4000-8000-000000000003';
const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const checks = [];
const check = (name, test) => { assert.ok(test, name); checks.push(name); console.log('PASS', name); };
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
    const context = await browser.newContext();
    await context.addInitScript(() => { window.__cartWrites = []; const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('shopy-cart-'))
        window.__cartWrites.push({ key, value }); return original.call(this, key, value); }; });
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && /hydrat|#418|#423/i.test(m.text()))
        errors.push(m.text()); });
    await context.route('**/auth/v1/**', async (route) => { const req = route.request(); const data = req.postDataJSON(); if (req.url().includes('/token')) {
        const id = data?.email === 'a@example.test' ? userA : userB;
        const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
        const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.audit';
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'audit-only', user: { id, email: data.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } }) });
    }
    else if (req.url().includes('/logout'))
        await route.fulfill({ status: 204, body: '' });
    else
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: userA, email: 'a@example.test' }) }); });
    await p.goto(root + '/login');
    await p.locator('[name=email]').waitFor();
    await p.evaluate(({ G, A, B, userA, userB }) => { localStorage.clear(); localStorage.setItem('shopy-cart-guest', JSON.stringify([{ productId: G, qty: 2 }])); localStorage.setItem('shopy-cart-' + userA, JSON.stringify([{ productId: A, qty: 1 }, { productId: G, qty: 1 }])); localStorage.setItem('shopy-cart-' + userB, JSON.stringify([{ productId: B, qty: 3 }])); }, { G, A, B, userA, userB });
    await p.reload();
    await p.getByRole('link', { name: 'Carrito, 2 prenda(s)' }).waitFor();
    check('Persisted guest cart hydrates without mismatch', errors.length === 0);
    const login = async (email) => { if (!p.url().includes('/login')) {
        await p.getByRole('button', { name: 'Abrir menú' }).count();
        await p.goto(root + '/login');
    } await p.locator('[name=email]').fill(email); await p.locator('[name=password]').fill('audit-password'); await p.getByRole('button', { name: 'Entrar', exact: true }).click(); await p.waitForURL(root + '/'); };
    const stored = async (id) => JSON.parse(await p.evaluate(id => localStorage.getItem('shopy-cart-' + id), id));
    await login('a@example.test');
    await p.getByRole('link', { name: 'Carrito, 3 prenda(s)' }).waitFor();
    check('Login merges guest with max quantity', JSON.stringify(await stored(userA)) === JSON.stringify([{ productId: A, qty: 1 }, { productId: G, qty: 2 }]));
    check('No transient empty or foreign writes to user A', await p.evaluate(id => window.__cartWrites.filter(x => x.key === 'shopy-cart-' + id).every(x => { const lines = JSON.parse(x.value); return lines.length === 2 && lines.some(l => l.productId === '10000000-0000-4000-8000-000000000001' && l.qty === 2); }), userA));
    check('Guest removed after saved merge', await p.evaluate(() => localStorage.getItem('shopy-cart-guest')) === null);
    await p.getByRole('button', { name: 'Salir', exact: true }).first().click();
    await p.getByRole('link', { name: 'Carrito vacío' }).waitFor();
    check('Logout isolates guest from user cart', (await stored(userA)).length === 2);
    await login('b@example.test');
    await p.getByRole('link', { name: 'Carrito, 3 prenda(s)' }).waitFor();
    check('Different user never inherits previous user items', JSON.stringify(await stored(userB)) === JSON.stringify([{ productId: B, qty: 3 }]));
    check('No transient foreign writes to user B', await p.evaluate(id => window.__cartWrites.filter(x => x.key === 'shopy-cart-' + id).every(x => JSON.parse(x.value).length === 1 && JSON.parse(x.value)[0].productId === '30000000-0000-4000-8000-000000000003'), userB));
    check('User A persisted cart not overwritten', (await stored(userA)).find(x => x.productId === G)?.qty === 2);
    await p.reload();
    await p.getByRole('link', { name: 'Carrito, 3 prenda(s)' }).waitFor();
    check('Authenticated cart restores on reload', JSON.stringify(await stored(userB)) === JSON.stringify([{ productId: B, qty: 3 }]));
    await p.getByRole('button', { name: 'Salir', exact: true }).first().click();
    await p.getByRole('link', { name: 'Carrito vacío' }).waitFor();
    await p.evaluate(() => localStorage.setItem('shopy-cart-guest', '{bad-json'));
    await p.reload();
    await p.getByRole('link', { name: 'Carrito vacío' }).waitFor();
    check('Corrupt storage recovers safely', JSON.stringify(await stored('guest')) === '[]');
    await p.evaluate(() => localStorage.setItem('shopy-cart-guest', JSON.stringify([{ productId: '', qty: 3 }, { productId: 'bad', qty: 1.5 }, { productId: 'valid', qty: 120 }])));
    await p.reload();
    await p.getByRole('link', { name: 'Carrito, 99 prenda(s)' }).waitFor();
    check('Persisted invalid data sanitized and quantity capped', JSON.stringify(await stored('guest')) === JSON.stringify([{ productId: 'valid', qty: 99 }]));
    await context.close();
    const blocked = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await blocked.addInitScript(() => { const get = Storage.prototype.getItem, set = Storage.prototype.setItem; Storage.prototype.getItem = function (key) { if (key.startsWith('shopy-cart-'))
        throw new DOMException('Blocked', 'SecurityError'); return get.call(this, key); }; Storage.prototype.setItem = function (key, val) { if (key.startsWith('shopy-cart-'))
        throw new DOMException('Blocked', 'QuotaExceededError'); return set.call(this, key, val); }; });
    const q = await blocked.newPage();
    await q.goto(root + '/producto/chaqueta-cuero-vintage');
    await q.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
    await q.getByRole('link', { name: 'Carrito, 1 prenda(s)' }).waitFor();
    await q.getByRole('link', { name: 'Carrito, 1 prenda(s)' }).click();
    await q.getByRole('heading', { name: 'Carrito', exact: true }).waitFor();
    check('Blocked storage preserves in-memory cart across navigation', (await q.locator('main').innerText()).includes('Chaqueta de cuero vintage'));
    await q.getByRole('button', { name: /Agregar una unidad/ }).click();
    await q.getByRole('link', { name: 'Carrito, 2 prenda(s)' }).waitFor();
    check('Blocked storage still allows cart updates', true);
    check('No hydration or uncaught browser errors', errors.length === 0);
    fs.writeFileSync(path.join(evidence, 'cart-integration.json'), JSON.stringify({ checks, errors, auth: 'All auth endpoints intercepted; no real accounts or sessions' }, null, 2));
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

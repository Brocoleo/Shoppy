/* Local-only checkout regression. All cross-origin browser traffic is intercepted. */
const { chromium } = require('/home/leandro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'evidence');
const BASE = process.env.CHECKOUT_TEST_URL || 'http://127.0.0.1:3015';
const BEFORE = process.env.CHECKOUT_BEFORE_URL;
const PRODUCT = '11111111-1111-4111-8111-111111111111';
const RM = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const rates = [
  { id: RM, region: 'Metropolitana', comuna: null, carrier: 'Starken · prueba local', price_clp: 3990, eta_days_min: 2, eta_days_max: 4 },
  { id: OTHER, region: 'OTRAS', comuna: null, carrier: 'Chilexpress · prueba local', price_clp: 5990, eta_days_min: 3, eta_days_max: 6 },
];
const report = { environment: { target: BASE, before: BEFORE || null, widths: [320, 390, 768, 1440], browser: 'Chromium', transport: 'mocked cross-origin; no orders or payments submitted' }, checks: [], axe: [], consoleErrors: [], pageErrors: [], mockedActions: [], blockedRequests: [], screenshots: [] };
function check(name, evidence) { report.checks.push({ name, status: 'pass', evidence }); }
async function scenario(browser, base, width, fn, options = {}) {
  const state = { rates: 'ok', quotes: [], addressReads: 0, ratesReads: 0, providers: options.providerFailure ? 'error' : 'ok' };
  let releaseAddress;
  const addressGate = new Promise((resolve) => { releaseAddress = resolve; });
  state.releaseAddress = releaseAddress;
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(({ product, authenticated }) => {
    localStorage.clear();
    localStorage.setItem('shopy-cart-guest', JSON.stringify([{ productId: product, qty: 1 }]));
    localStorage.setItem('vinta.consent.v1', JSON.stringify({ acknowledged: true }));
    if (authenticated) {
      const uid = '44444444-4444-4444-8444-444444444444';
      const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'persona@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
      const encode = (value) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: uid, aud: 'authenticated', role: 'authenticated', exp })}.local-test-signature`;
      localStorage.setItem('sb-evzlqwiipdjgtrqjlwba-auth-token', JSON.stringify({ access_token: token, refresh_token: 'local-test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }));
    }
  }, { product: PRODUCT, authenticated: Boolean(options.authenticated) });
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin === new URL(base).origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    const cors = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'Origin' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname.endsWith('/functions/v1/checkout')) {
      const body = req.postDataJSON();
      report.mockedActions.push({ action: body.action, region: body.region || null, width });
      if (body.action === 'providers') {
        if (state.providers === 'error') return route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Fallo simulado del proveedor' } }, headers: cors });
        return route.fulfill({ json: { providers: ['mock'], sandbox: true }, headers: cors });
      }
      if (body.action === 'quote') {
        state.quotes.push(body);
        const rate = rates.find((r) => r.id === body.shipping_rate_id);
        const shipping = rate?.price_clp || 0;
        return route.fulfill({ json: { lines: [{ product_id: PRODUCT, qty: 1, unit_price_clp: 12000, product_slug: 'prenda-prueba-local', product_name: 'Prenda de prueba local', brand_name: null, size: 'M', color: null, condition: 'GOOD', image_url: null }], subtotal_clp: 12000, discount_clp: 0, shipping_clp: shipping, total_clp: 12000 + shipping }, headers: cors });
      }
      report.blockedRequests.push({ method: req.method(), pathname: url.pathname, action: body.action });
      return route.fulfill({ status: 403, json: { error: { code: 'TEST_BLOCKED', message: 'No se permite crear ni pagar pedidos en esta prueba.' } }, headers: cors });
    }
    if (url.pathname.endsWith('/rest/v1/addresses')) {
      state.addressReads++;
      if (options.delayedAddress) await addressGate;
      return route.fulfill({ json: { full_name: 'Nombre guardado', email: 'guardado@example.test', phone: '+56912345678', street: 'Calle antigua', region: 'MetropolitanaMetropolitana', comuna: 'Santiago', zip_code: null, notes: null }, headers: cors });
    }
    if (url.pathname.endsWith('/rest/v1/orders')) return route.fulfill({ json: [], headers: cors });
    if (url.pathname.endsWith('/rest/v1/shipping_rates')) {
      state.ratesReads++;
      if (state.rates === 'error') return route.fulfill({ status: 503, json: { message: 'Simulated rates service failure' }, headers: cors });
      return route.fulfill({ json: state.rates === 'empty' ? [] : rates, headers: cors });
    }
    report.blockedRequests.push({ method: req.method(), pathname: url.pathname });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') report.consoleErrors.push({ width, text: msg.text().replace(/https?:\/\/[^\s)]+/g, '[URL]') }); });
  page.on('pageerror', (error) => report.pageErrors.push({ width, text: error.message }));
  try { await page.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).waitFor(); await fn(page, state); }
  catch (error) {
    await page.screenshot({ path: path.join(OUT, `failure-${width}.png`), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(OUT, `failure-${width}.html`), await page.content());
    throw error;
  }
  finally { await context.close(); }
}
async function chooseAddress(page, field, label) {
  const control = page.locator(`#address-${field}`);
  if (await control.evaluate((el) => el.tagName === 'SELECT')) return control.selectOption({ label });
  await control.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
async function addressValue(page, field) {
  return page.locator(`#address-${field}`).evaluate((el) => el.value);
}
async function fill(page, street = 'Providencia 1234') {
  await page.locator('#address-fullName').fill('Persona de Prueba');
  await page.locator('#address-email').fill('persona@example.test');
  await page.locator('#address-phone').fill('+56912345678');
  await page.locator('#address-street').fill(street);
  await chooseAddress(page, 'region', 'Metropolitana');
  await chooseAddress(page, 'comuna', 'Santiago');
}
async function capture(page, label, width) {
  const file = `${label}-${width}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  report.screenshots.push(file);
}
async function a11y(page, label, width) {
  await page.addScriptTag({ path: path.join(ROOT, 'node_modules/axe-core/axe.min.js') });
  const result = await page.evaluate(async () => {
    const { violations, passes, incomplete } = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
    return { violations: violations.map((v) => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })) })), passes: passes.length, incomplete: incomplete.length };
  });
  report.axe.push({ label, width, ...result });
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
  try {
    if (BEFORE) for (const width of [390, 1440]) {
      try { await scenario(browser, BEFORE, width, async (page) => { await fill(page); await capture(page, 'reference-existing-server-address', width); await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).click(); await page.getByRole('radio').first().waitFor(); await capture(page, 'reference-existing-server-shipping', width); }); }
      catch (error) { report.checks.push({ name: `Existing server reference ${width}`, status: 'unavailable', evidence: error.message }); }
    }
    for (const width of [320, 390, 768, 1440]) await scenario(browser, BASE, width, async (page, state) => {
      await fill(page, '5 de Abril');
      await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).click();
      await page.locator('#error-street').waitFor();
      assert.equal(await page.locator('#address-street').evaluate((el) => el === document.activeElement), true);
      check(`Invalid numeric street name and error focus ${width}`, '5 de Abril rejected; focus on street input');
      await page.locator('#address-street').fill('5 de Abril 1234');
      const region = page.locator('#address-region');
      await region.focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      assert.notEqual(await addressValue(page, 'region'), 'Metropolitana');
      assert.notEqual(await addressValue(page, 'region'), '');
      check(`Region keyboard ${width}`, `Selected via keyboard: ${await addressValue(page, 'region')}`);
      await chooseAddress(page, 'region', 'Metropolitana');
      await chooseAddress(page, 'comuna', 'Santiago');
      await page.locator('#address-comuna').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).evaluate((el) => el === document.activeElement), true);
      await capture(page, 'after-address', width);
      await a11y(page, 'address', width);
      await page.keyboard.press('Enter');
      await page.getByRole('radio', { name: /Starken/ }).check();
      await page.getByRole('button', { name: 'Revisar pedido', exact: true }).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => el.textContent === 'Revisar pedido' && !el.disabled));
      await capture(page, 'after-shipping', width);
      await a11y(page, 'shipping', width);
      await page.getByRole('button', { name: 'Revisar pedido', exact: true }).click();
      await page.getByText('Tu pedido', { exact: true }).waitFor();
      await capture(page, 'after-review', width);
      await a11y(page, 'review', width);
      check(`Address → shipping → review ${width}`, `${state.quotes.length} mocked quote; no create/confirm/payment action`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      check(`No horizontal overflow ${width}`, 'document.scrollWidth <= viewport width');
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
      await page.getByRole('button', { name: 'Atrás', exact: true }).click();
      await page.getByRole('button', { name: 'Atrás', exact: true }).click();
      await chooseAddress(page, 'region', 'Ñuble');
      assert.equal(await addressValue(page, 'comuna'), '');
      await chooseAddress(page, 'comuna', 'Chillán');
      await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).click();
      await page.getByRole('radio', { name: /Chilexpress/ }).waitFor();
      assert.equal(await page.getByRole('radio', { name: /Starken/ }).count(), 0);
      assert.equal(await page.getByRole('radio', { checked: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Revisar pedido', exact: true }).isDisabled(), true);
      const beforeQuote = state.quotes.length;
      await page.getByRole('radio', { name: /Chilexpress/ }).check();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => el.textContent === 'Revisar pedido' && !el.disabled));
      assert.equal(state.quotes.at(-1).region, 'Ñuble');
      assert.equal(state.quotes.at(-1).shipping_rate_id, OTHER);
      assert.ok(state.quotes.length > beforeQuote);
      check(`Region change resets commune/rate/quote ${width}`, 'Ñuble only uses OTRAS, no stale selected rate or review access');
      if (width === 390) {
        await page.getByRole('button', { name: 'Atrás', exact: true }).click();
        await chooseAddress(page, 'region', 'Los Ríos');
        await chooseAddress(page, 'comuna', 'Valdivia');
        state.rates = 'error';
        await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).click();
        await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor({ timeout: 30000 });
        assert.equal(await page.getByRole('button', { name: 'Revisar pedido', exact: true }).isDisabled(), true);
        await capture(page, 'after-rates-error', width);
        state.rates = 'ok';
        await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
        await page.getByRole('radio', { name: /Chilexpress/ }).waitFor();
        check('Rates failure, blocked advance and retry', '503 mock; retry restores rates without page reload');
        await page.getByRole('button', { name: 'Atrás', exact: true }).click();
        await chooseAddress(page, 'region', 'Aysén');
        await chooseAddress(page, 'comuna', 'Coihaique');
        state.rates = 'empty';
        await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).click();
        await page.getByText(/No hay tarifas disponibles/).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Revisar pedido', exact: true }).isDisabled(), true);
        await capture(page, 'after-rates-empty', width);
        check('Empty rates blocks advance', 'Explanation visible; review disabled');
      }
    });
    await scenario(browser, BASE, 390, async (page, state) => {
      await fill(page);
      await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).click();
      await page.getByRole('radio', { name: /Starken/ }).check();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => el.textContent === 'Revisar pedido' && !el.disabled));
      await page.getByRole('button', { name: 'Revisar pedido', exact: true }).click();
      await page.getByRole('button', { name: /No se pudieron cargar los medios/ }).waitFor();
      assert.equal(await page.getByRole('radio', { name: /Simulación local/ }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /^Pagar / }).isDisabled(), true);
      state.providers = 'ok';
      await page.getByRole('button', { name: /No se pudieron cargar los medios/ }).click();
      await page.getByRole('radio', { name: /Simulación local/ }).check();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => el.textContent.startsWith('Pagar ') && !el.disabled));
      check('Provider failure blocks payment without fabricated fallback; retry recovers', '503 providers mock, no mock option until successful retry');
      await capture(page, 'after-provider-retry', 390);
      await page.clock.install();
      const reads = state.ratesReads;
      state.rates = 'empty';
      await page.clock.fastForward(61000);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => el.textContent.startsWith('Pagar ') && el.disabled));
      assert.ok(state.ratesReads > reads);
      check('Background tariff refresh during review blocks stale payment', 'Reconnect after staleTime refetches empty rates; previous quote cannot enable Pagar');
      await capture(page, 'after-review-rates-invalidated', 390);
    }, { providerFailure: true });
    await scenario(browser, BASE, 390, async (page, state) => {
      await page.locator('#address-fullName').fill('Nombre editado mientras carga');
      state.releaseAddress();
      await page.getByText(/Revisa tu dirección guardada/).waitFor();
      assert.equal(await page.locator('#address-fullName').inputValue(), 'Nombre editado mientras carga');
      assert.equal(await page.locator('#address-street').inputValue(), 'Calle antigua');
      assert.equal(await addressValue(page, 'region'), 'MetropolitanaMetropolitana');
      await page.getByRole('button', { name: 'Continuar al despacho', exact: true }).click();
      await page.locator('#error-street').waitFor();
      assert.equal(await page.locator('#address-street').evaluate((el) => el === document.activeElement), true);
      await capture(page, 'after-saved-address-dirty-legacy', 390);
      check('Delayed saved address preserves dirty fields and exposes invalid legacy values', 'Edited name retained; legacy street/region remain visible and prevent progression');
      const reads = state.addressReads;
      const menu = page.getByRole('button', { name: 'Abrir menú', exact: true });
      await menu.click();
      await page.keyboard.press('Escape');
      assert.equal(await menu.evaluate((el) => el === document.activeElement), true);
      check('Mobile menu Escape returns focus', 'Opened menu and pressed Escape; focus restored to trigger');
      await menu.click();
      await page.getByRole('navigation', { name: 'Móvil', exact: true }).getByRole('link', { name: 'Mis pedidos', exact: true }).click();
      await page.waitForURL('**/pedidos');
      await page.goBack();
      await page.locator('#address-street').waitFor();
      await page.waitForFunction(() => document.querySelector('#address-street')?.value === 'Calle antigua');
      assert.equal(state.addressReads, reads);
      assert.equal(await addressValue(page, 'region'), 'MetropolitanaMetropolitana');
      check('Cached saved address repopulates remounted checkout', 'React Query cached address reapplied without another REST request');
      await capture(page, 'after-saved-address-cached-remount', 390);
    }, { authenticated: true, delayedAddress: true });
    assert.equal(report.mockedActions.some((x) => !['providers', 'quote'].includes(x.action)), false);
    check('No order or payment operations', 'Only providers and quote requests were allowed');
    assert.equal(report.pageErrors.length, 0);
    const violations = report.axe.flatMap((entry) => entry.violations);
    if (violations.length) {
      process.exitCode = 1;
      report.checks.push({ name: 'axe WCAG A/AA', status: 'fail', evidence: `${violations.length} violations across ${report.axe.length} scans; see axe records` });
    }
    else check('axe WCAG A/AA', `${report.axe.length} scans, zero violations`);
  } catch (error) { report.failure = error.stack; process.exitCode = 1; }
  finally { await browser.close(); fs.writeFileSync(path.join(OUT, 'browser-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ checks: report.checks, axeScans: report.axe.length, screenshots: report.screenshots.length, pageErrors: report.pageErrors, failure: report.failure || null }, null, 2)); }
})();

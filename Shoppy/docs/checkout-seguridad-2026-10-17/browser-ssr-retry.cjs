const { chromium } = require('/home/leandro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const OUT = path.join(__dirname, 'evidence');
const ISOLATED = process.env.CHECKOUT_ISOLATED_DIR || '/tmp/vintah-checkout-isolated';
const BASE = 'http://127.0.0.1:3016';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'vintah-ssr-retry-'));
const flag = path.join(temporary, 'failure');
const log = path.join(temporary, 'transport.jsonl');
const report = { target: BASE, checks: [], screenshots: [], pageErrors: [], browserBlocked: [], transport: [], limitation: 'Isolated SSR+browser transport fixtures; no Supabase or payment requests reach the network.' };
let output = '';
const server = spawn(process.execPath, ['--require', path.join(__dirname, 'ssr-fetch-fixture.cjs'), 'node_modules/next/dist/bin/next', 'start', 'apps/web', '-p', '3016'], {
  cwd: ISOLATED, env: { ...process.env, SSR_FIXTURE_FAILURE_FLAG: flag, SSR_FIXTURE_LOG: log }, stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-10000); });
server.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-10000); });
function check(name, evidence) { report.checks.push({ name, status: 'pass', evidence }); }
(async () => {
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Isolated server exited ${server.exitCode}: ${output}`);
      try { const response = await fetch(`${BASE}/robots.txt`); if (response.status < 500) { ready = true; break; } } catch { /* wait for isolated listener */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(ready, true, 'Isolated server must be ready');
    browser = await chromium.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
    for (const item of [
      { route: '/producto/prenda-reintento-local', title: 'Prenda recuperada de prueba local', label: 'product' },
      { route: '/coleccion/coleccion-reintento-local', title: 'Colección recuperada de prueba local', label: 'collection' },
    ]) {
      fs.writeFileSync(flag, 'fail');
      const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      await context.addInitScript(() => localStorage.setItem('vinta.consent.v1', JSON.stringify({ acknowledged: true })));
      await context.route('**/*', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin === BASE || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
        const cors = { 'access-control-allow-origin': BASE, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (req.method() === 'GET' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/')) return route.fulfill({ json: [], headers: cors });
        report.browserBlocked.push({ method: req.method(), pathname: url.pathname });
        return route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => report.pageErrors.push({ route: item.route, message: error.message }));
      await page.goto(`${BASE}${item.route}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Reintentar', exact: true }).waitFor();
      await page.getByRole('alert').filter({ hasText: 'No se pudo cargar' }).waitFor();
      const before = `after-ssr-${item.label}-failure-390.png`;
      await page.screenshot({ path: path.join(OUT, before), fullPage: true });
      report.screenshots.push(before);
      check(`${item.label}: failed SSR read presents retry`, '503 transport fixture produces error UI rather than empty/404');
      fs.unlinkSync(flag);
      await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
      await page.getByRole('heading', { name: item.title, exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Reintentar', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const after = `after-ssr-${item.label}-recovered-390.png`;
      await page.screenshot({ path: path.join(OUT, after), fullPage: true });
      report.screenshots.push(after);
      check(`${item.label}: browser retry refreshes server data`, 'Same URL recovers rendered heading after removing failure flag; no full browser reload');
      await context.close();
    }
    report.transport = fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.equal(report.transport.some((entry) => entry.method !== 'GET'), false);
    assert.equal(report.transport.some((entry) => entry.status === 403), false);
    assert.equal(report.pageErrors.length, 0);
    check('SSR transport remains read-only and isolated', `${report.transport.length} intercepted GETs; zero unexpected external operations`);
  } catch (error) { report.failure = error.stack; report.serverOutput = output; process.exitCode = 1; }
  finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => server.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    report.isolatedServerStopped = server.exitCode !== null || server.signalCode !== null;
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'ssr-retry-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
})();

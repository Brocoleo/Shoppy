const path = require('node:path');
const evidence = process.env.AUDIT_OUTPUT || path.join(__dirname, '../results');
require('node:fs').mkdirSync(evidence, { recursive: true });
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
    const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
    const root = process.env.AUDIT_URL || 'http://127.0.0.1:3113';
    const checks = [];
    const report = [];
    const nojs = await b.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await nojs.goto(root);
    const count = await nojs.locator('#novedades-titulo').locator('..').locator('..').locator('li a').count();
    assert.equal(count, 8);
    assert(await nojs.locator('section[aria-labelledby=hero-titulo] img').getAttribute('fetchpriority') === 'high' || await nojs.locator('link[rel=preload][as=image]').count() > 0);
    checks.push('No-JS HTML contains eight newcomers and priority hero image');
    await nojs.screenshot({ path: path.join(evidence, 'after-mobile-nojs.png'), fullPage: true });
    await nojs.close();
    for (const [width, height] of [[390, 844], [1440, 1000]]) {
        const p = await b.newPage({ viewport: { width, height } });
        let repeatedNewcomers = 0;
        p.on('request', r => { if (r.url().includes('/rest/v1/products?') && r.url().includes('published_at.desc'))
            repeatedNewcomers++; });
        for (const route of ['/', '/catalogo', '/producto/chaqueta-cuero-vintage', '/carrito', '/login']) {
            await p.goto(root + route);
            if (route === '/')
                await p.locator('#novedades-titulo').waitFor();
            if (route === '/catalogo')
                await p.getByRole('status').filter({ hasText: '20 prendas' }).waitFor();
            if (route.includes('/producto/'))
                await p.getByRole('button', { name: 'Agregar al carrito', exact: true }).waitFor();
            await p.waitForTimeout(500);
            await p.addScriptTag({ path: process.env.AXE_PATH || require.resolve('axe-core/axe.min.js') });
            const axe = await p.evaluate(async () => { const r = await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return r.violations.map(x => ({ id: x.id, impact: x.impact, nodes: x.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })); });
            report.push({ width, route, violations: axe });
            console.log('AXE', width, route, JSON.stringify(axe));
            if (route.includes('/producto/'))
                assert.equal((await p.title()).match(/Shopy/g).length, 1);
        }
        assert.equal(repeatedNewcomers, 0);
        checks.push('No duplicate newcomers browser fetch at ' + width);
        if (width === 390) {
            await p.goto(root + '/catalogo');
            await p.getByRole('status').filter({ hasText: '20 prendas' }).waitFor();
            await p.getByRole('button', { name: 'Filtros', exact: true }).click();
            await p.waitForTimeout(400);
            assert.equal(await p.locator('#panel-m-categoria').evaluate(x => getComputedStyle(x).visibility), 'visible');
            await p.setViewportSize({ width: 1440, height: 1000 });
            assert.equal(await p.locator('#panel-m-categoria').isVisible(), false);
            checks.push('Expanded mobile filters hidden after desktop resize');
            await p.setViewportSize({ width: 390, height: 844 });
            await p.locator('#panel-m-categoria').selectOption('mujer');
            await p.waitForURL(/categoria=mujer/);
            await p.getByRole('searchbox').fill('vestido');
            await p.getByRole('button', { name: 'Buscar', exact: true }).click();
            await p.getByRole('button', { name: 'Quitar Búsqueda: vestido' }).waitFor();
            await p.getByRole('button', { name: 'Quitar Búsqueda: vestido' }).focus();
            await p.keyboard.press('Enter');
            await p.waitForURL(url => !url.searchParams.has('q'));
            await p.waitForFunction(() => document.activeElement.id === 'buscar-prenda');
            checks.push('Removing search chip by keyboard focuses new input');
            await p.screenshot({ path: path.join(evidence, 'after-mobile-active-filters.png') });
            await p.getByRole('button', { name: 'Abrir menú' }).click();
            await p.waitForTimeout(400);
            await p.screenshot({ path: path.join(evidence, 'after-mobile-menu.png') });
            await p.addScriptTag({ path: process.env.AXE_PATH || require.resolve('axe-core/axe.min.js') });
            const menu = await p.evaluate(async () => { const r = await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return r.violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })); });
            report.push({ width, route: 'menu and filters expanded', violations: menu });
        }
        await p.close();
    }
    assert(report.every(r => r.violations.length === 0));
    fs.writeFileSync(path.join(evidence, 'quality.json'), JSON.stringify({ checks, axe: report }, null, 2));
    await b.close();
})().catch(e => { console.error(e); process.exit(1); });

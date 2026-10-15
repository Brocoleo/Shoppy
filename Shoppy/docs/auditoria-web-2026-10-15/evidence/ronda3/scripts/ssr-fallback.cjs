const path = require('node:path');
const evidence = process.env.AUDIT_OUTPUT || path.join(__dirname, '../results');
require('node:fs').mkdirSync(evidence, { recursive: true });
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => { const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', args: ['--no-sandbox'] }); const nojs = await b.newPage({ javaScriptEnabled: false }); await nojs.goto((process.env.AUDIT_FALLBACK_URL || 'http://127.0.0.1:3116')); assert(await nojs.getByRole('heading', { level: 1 }).isVisible()); assert.equal(await nojs.locator('main li a').count(), 0); await nojs.close(); const p = await b.newPage(); let recovery = 0; p.on('request', r => { if (r.url().includes('/rest/v1/products?') && r.url().includes('published_at.desc'))
    recovery++; }); await p.goto((process.env.AUDIT_FALLBACK_URL || 'http://127.0.0.1:3116')); await p.locator('#novedades-titulo').locator('..').locator('..').locator('li a').first().waitFor(); assert(recovery > 0); const result = { serverInitialRead: '503 simulated only in the server process', staticHeading: true, clientRecoveredProducts: true, recoveryRequests: recovery }; fs.writeFileSync(path.join(evidence, 'ssr-fallback.json'), JSON.stringify(result, null, 2)); console.log(result); await b.close(); })().catch(e => { console.error(e); process.exit(1); });

/** Creates an isolated copy with public loopback config; never reads .env files. */
import { cp, mkdir, readFile, writeFile, symlink, access, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createLocalCheckout } from './transport.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const building = process.argv.includes('--build');
const target = building ? '/tmp/vintah-checkout-local-build' : '/tmp/vintah-checkout-local';
const webOrigin = 'http://localhost:3020', apiOrigin = 'http://127.0.0.1:4010';
await mkdir(target, { recursive: true });
for (const folder of [target, join(target,'apps/web')]) {
  let entries;
  try { entries = await readdir(folder); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (entries.some(name => name.startsWith('.env'))) throw Error('La copia aislada contiene configuración .env previa. Usa una copia limpia antes de continuar.');
}
for (const name of ['apps/web','packages','package.json','package-lock.json','tsconfig.base.json','tsconfig.json']) {
  await cp(join(root,name),join(target,name), { recursive: true, force: true, filter: path => !['node_modules','.next','.git'].includes(basename(path)) && !basename(path).startsWith('.env') });
}
try { await access(join(target,'node_modules')); } catch { await symlink(join(root,'node_modules'),join(target,'node_modules')); }
// Overlay only in /tmp: production source and its .env remain untouched.
const layout = join(target,'apps/web/src/app/layout.tsx');
const source = await readFile(layout,'utf8');
if (!source.includes('<Header />')) throw Error('Layout changed: review local overlay');
await writeFile(layout, ('import Script from "next/script";\n'+source).replace('<Header />', `<div role="note" style={{padding:"12px 20px",background:"#fff1ba",color:"#242424",textAlign:"center"}}><strong>Prueba local · Pago simulado</strong>{" · "}<a href="/prueba-local.html" style={{textDecoration:"underline"}}>Panel de pruebas</a></div><Header /><Script src="/__local-tools.js" strategy="afterInteractive" />`));
const csp = `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${apiOrigin}; connect-src 'self' ${apiOrigin} ws://localhost:3020; font-src 'self'; frame-src 'none'; form-action 'self' ${apiOrigin}; base-uri 'self'; object-src 'none'`;
await writeFile(join(target,'apps/web/next.config.ts'), `import type { NextConfig } from 'next';\nconst config: NextConfig = { transpilePackages: ['@shopy/types','@shopy/shared','@shopy/validation'], async rewrites() { return [{source:'/local-backend/:path*',destination:'http://127.0.0.1:4010/:path*'}]; }, async headers() { return [{source:'/:path*',headers:[{key:'Content-Security-Policy',value:${JSON.stringify(csp)}},{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]; }};\nexport default config;\n`);
await writeFile(join(target,'apps/web/public/prueba-local.html'), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Panel de pruebas locales</title><style>body{max-width:42rem;margin:2rem auto;padding:1rem;font:18px system-ui;background:#f8f7f4;color:#222}button,a{display:inline-block;margin:.4rem;padding:.8rem;min-height:44px}button:focus-visible,a:focus-visible{outline:3px solid #1769aa;outline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Prueba local · Pago simulado</h1><p>Datos ficticios. Sin claves privadas, Supabase remoto ni MercadoPago. El inventario vive en memoria y se pierde al reiniciar.</p><button id="start">Iniciar nueva prueba</button><button id="offline">Simular corte de conexión</button><button id="online">Restablecer conexión</button><button id="state">Consultar estado</button><a href="/checkout">Continuar intento local</a><a href="/producto/prenda-prueba-local">Ver prenda ficticia</a><p role="status" id="status"></p><pre id="result"></pre><script>const api='/local-backend'; async function call(path,data){const r=await fetch(api+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});if(!r.ok)throw Error('No se pudo conectar al simulador');return r.json()}const status=document.getElementById('status');document.getElementById('start').onclick=async()=>{try{await call('/__local/reset',{});localStorage.removeItem('shopy-checkout-guest');localStorage.setItem('shopy-cart-guest',JSON.stringify([{productId:'10000000-0000-4000-8000-000000000001',qty:1}]));location.href='/checkout'}catch(e){status.textContent=e.message}};for(const [id,offline] of [['offline',true],['online',false]])document.getElementById(id).onclick=async()=>{await call('/__local/network',{offline});status.textContent=offline?'Conexión simulada interrumpida':'Conexión restablecida'};document.getElementById('state').onclick=async()=>{document.getElementById('result').textContent=JSON.stringify(await call('/__local/state'),null,2)};</script></html>`);
await cp(join(root,'scripts/local-checkout/browser-tools.js'),join(target,'apps/web/public/__local-tools.js'));
if (process.env.LOCAL_AXE_PATH) {
  await cp(process.env.LOCAL_AXE_PATH,join(target,'apps/web/public/__local-axe.js'));
  const content=await readFile(layout,'utf8');
  await writeFile(layout,content.replace('<Script src="/__local-tools.js" strategy="afterInteractive" />','<Script src="/__local-axe.js" strategy="afterInteractive" /><Script src="/__local-tools.js" strategy="afterInteractive" />'));
}
const safeNames = ['PATH','SHELL','TMPDIR','LANG','LC_ALL','TERM','USER','HOME','TZ'];
const env = Object.fromEntries(safeNames.filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(env,{NEXT_PUBLIC_SUPABASE_URL:webOrigin+'/local-backend',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-public-fixture',NEXT_PUBLIC_SITE_URL:webOrigin,NODE_OPTIONS:`--require=${JSON.stringify(join(root,'scripts/local-checkout/network-guard.cjs'))}`,NEXT_TELEMETRY_DISABLED:'1'});
const local = createLocalCheckout({apiOrigin,webOrigin});
if (!building) await new Promise((yes,no)=>{local.server.once('error',no);local.server.listen(4010,'127.0.0.1',yes)});
console.log(`Simulador local: ${apiOrigin}. Sin conexiones externas.`);
const args=building?['build','--webpack']:['dev','--webpack','--hostname','127.0.0.1','--port','3020'];
const next=spawn(process.execPath,[join(target,'node_modules/next/dist/bin/next'),...args],{cwd:join(target,'apps/web'),env,stdio:'inherit'});
function stop(){next.kill('SIGTERM');local.server.close();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
next.on('exit',code=>{local.server.close();process.exitCode=code??1});
console.log(`Vista aislada: ${webOrigin}/prueba-local.html`);

/* Verificación real por CDP: carrito (persistencia, datos inválidos) y teclado.
 * Uso: node /tmp/opencode/cdp-verify.mjs  [baseUrl]  [outDir]
 * No crea cuentas ni pedidos; solo lee localStorage y navega. */
const BASE = process.argv[2] ?? "http://localhost:3001";
const OUT = process.argv[3] ?? "/tmp/opencode/cdp-out";
const { mkdirSync } = await import("node:fs");
mkdirSync(OUT, { recursive: true });

const debuggerUrl = "http://127.0.0.1:9333";
const tabs = await (await fetch(`${debuggerUrl}/json/list`)).json();
const page = tabs.find((t) => t.type === "page") ?? tabs[0];
const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(msg.error.message));
    else res(msg.result);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const cur = ++id;
    pending.set(cur, { res, rej });
    ws.send(JSON.stringify({ id: cur, method, params }));
  });
const evalJs = async (expression, awaitPromise = false) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error("evaluate: " + JSON.stringify(r.exceptionDetails).slice(0, 200));
  return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => send("Page.captureScreenshot", { format: "png" }).then(async (r) => {
  await (await import("node:fs")).promises.writeFile(`${OUT}/${name}`, Buffer.from(r.data, "base64"));
});
const results = {};
const check = (name, ok, detail = "") => {
  results[name] = ok ? `PASS${detail ? ` (${detail})` : ""}` : `FAIL${detail ? ` (${detail})` : ""}`;
  console.log((ok ? "PASS " : "FAIL ") + name + (detail ? ` — ${detail}` : ""));
};

// 1. Carrito vacío inicial
await send("Page.navigate", { url: `${BASE}/carrito` });
await sleep(6000);
check("carrito-vacio", await evalJs(`document.body.innerText.includes("Tu carrito está vacío")`));

// 2. Siembra guest + recarga => badge con conteo (persistencia)
const REAL_ID = "d0000000-0000-4000-8000-000000000006";
await evalJs(`localStorage.setItem('shopy-cart-guest', JSON.stringify([{productId:'${REAL_ID}',qty:2}])); "ok"`);
await send("Page.reload", { ignoreCache: false });
await sleep(6000);
const badge = await evalJs(`document.querySelector('header a[href="/carrito"]')?.getAttribute('aria-label') ?? 'SIN_BADGE'`);
check("persistencia-recarga", badge.includes("2 prenda(s)"), String(badge));

// 3. Datos inválidos => vacío sin crash
await evalJs(`localStorage.setItem('shopy-cart-guest', '[[[corrupto'); "ok"`);
await send("Page.reload", { ignoreCache: false });
await sleep(6000);
check(
  "datos-invalidos",
  await evalJs(`document.body.innerText.includes("Tu carrito está vacío")`),
);
await shot("carrito-invalido.png");

// 4. Limpieza: deja guest vacío para no contaminar
await evalJs(`localStorage.removeItem('shopy-cart-guest'); "ok"`);

// 5. Teclado real: Tab desde inicio en home, registra foco
await send("Page.navigate", { url: `${BASE}/` });
await sleep(6000);
const order = [];
for (let i = 0; i < 10; i++) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(250);
  order.push(
    await evalJs(`(() => { const el = document.activeElement; if (!el || el === document.body) return 'BODY';
      const t = el.tagName.toLowerCase();
      const label = (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().slice(0, 28).replace(/\\n/g, ' ');
      return t + (el.getAttribute('href') ? '[' + el.getAttribute('href') + ']' : '') + ': ' + label; })()`),
  );
}
console.log("TAB ORDER:", JSON.stringify(order, null, 1));
check("tab-skip-primero", order[0]?.includes("#contenido") || order[0]?.includes("Saltar"), order[0]);
check("tab-llega-nav", order.some((o) => o.includes("/catalogo")), order.find((o) => o.includes("/catalogo")) ?? "no");
await shot("teclado-home.png");

await (await import("node:fs")).promises.writeFile(`${OUT}/results.json`, JSON.stringify({ base: BASE, results, tabOrder: order }, null, 2));
ws.close();
const failed = Object.values(results).filter((v) => String(v).startsWith("FAIL")).length;
console.log(failed === 0 ? "TODO_OK" : `${failed} FALLOS`);
process.exit(failed === 0 ? 0 : 1);

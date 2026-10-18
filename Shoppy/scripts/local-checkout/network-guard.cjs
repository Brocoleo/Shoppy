/* Applied only to the isolated Next process, never to normal web/admin services. */
const allowed = new Set(['localhost', '127.0.0.1', '[::1]']);
function check(input) {
  const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!allowed.has(u.hostname) || !['http:', 'https:'].includes(u.protocol)) throw new Error('LOCAL_CHECKOUT_EXTERNAL_NETWORK_BLOCKED');
}
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => { check(input); return originalFetch(input, options); };
for (const protocol of ['http', 'https']) {
  const mod = require('node:' + protocol);
  const request = mod.request;
  mod.request = function(input, ...rest) {
    if (typeof input === 'string' || input instanceof URL) check(input);
    else {
      const hostname = input.hostname ?? input.host ?? 'localhost';
      if (!allowed.has(hostname)) throw new Error('LOCAL_CHECKOUT_EXTERNAL_NETWORK_BLOCKED');
    }
    return request.call(this, input, ...rest);
  };
  mod.get = function(...args) { const req = mod.request(...args); req.end(); return req; };
}

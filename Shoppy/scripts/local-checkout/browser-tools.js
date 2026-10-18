/* Loaded only in the isolated copy. Results are visible DOM, not hidden browser state. */
(() => {
  function install() {
    if (document.getElementById('local-a11y-tools')) return;
    const box = document.createElement('section'); box.id = 'local-a11y-tools'; box.setAttribute('aria-label','Herramientas de pruebas locales');
    box.style.cssText = 'padding:16px;border-top:1px solid #555;background:#fff1ba;color:#222';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Auditar accesibilidad local'; button.style.cssText = 'padding:12px;border:1px solid #222';
    const result = document.createElement('pre'); result.id = 'local-a11y-result'; result.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
    button.onclick = async () => {
      if (!window.axe) { result.textContent='axe no disponible: configura LOCAL_AXE_PATH al iniciar el simulador.'; return; }
      button.disabled=true; result.textContent='Comprobando…';
      try { const report=await window.axe.run(document.querySelector('main') ?? document.body); result.textContent=JSON.stringify({url:location.pathname,violations:report.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>n.target)})),passes:report.passes.length,overflow:document.documentElement.scrollWidth>innerWidth},null,2); }
      catch { result.textContent='No se pudo ejecutar axe.'; }
      finally { button.disabled=false; }
    };
    box.append(button,result); document.body.append(box);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();

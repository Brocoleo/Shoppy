#!/usr/bin/env node
/**
 * Servidor de recepción de fotos para el E2E del admin.
 *
 * Desde el iPhone (misma WiFi) se abre http://<ip>:8080 y se eligen las
 * fotos. El servidor las guarda en apps/admin/tests/fixtures/ y convierte
 * los HEIC del iPhone a JPEG (ffmpeg), porque el navegador del admin no
 * puede decodificar HEIC.
 *
 * La interfaz da feedback real: barra de progreso total, barra por archivo y
 * estados (subiendo -> convirtiendo -> guardado / error). Para tener progreso
 * de subida, el cliente hace un POST por archivo con XMLHttpRequest (que
 * dispara `upload.onprogress`).
 *
 *   node scripts/photo-drop-server.mjs [puerto]
 */
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { networkInterfaces } from "node:os";

const execFileAsync = promisify(execFile);
const PORT = Number(process.argv[2] ?? 8080);
const DESTINO = resolve(
  process.cwd(),
  "apps/admin/tests/fixtures",
);
const MAX_BYTES = 40 * 1024 * 1024;

await mkdir(DESTINO, { recursive: true });

const html = (cuerpo) => `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Subir fotos · Shopy</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 17px/1.5 system-ui, -apple-system, sans-serif; margin: 0; padding: 24px 20px 48px;
         max-width: 640px; margin-inline: auto; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  p.sub { margin: 0 0 24px; opacity: .7; }
  label.boton { display: block; border: 2px dashed currentColor; border-radius: 16px;
                padding: 32px 20px; text-align: center; cursor: pointer; }
  label.boton strong { display: block; font-size: 1.15rem; margin-bottom: 4px; }
  input[type=file] { display: none; }
  .btn { font: inherit; font-weight: 600; border: 0; border-radius: 12px; padding: 14px 22px;
         background: #1a1a1a; color: #fff; width: 100%; margin-top: 16px; min-height: 48px; }
  .btn:disabled { opacity: .5; }
  .progreso-total { margin: 24px 0 8px; }
  .barra-wrap { background: rgba(128,128,128,.15); border-radius: 8px; height: 8px; overflow: hidden; }
  .barra { height: 100%; background: #1a1a1a; border-radius: 8px; transition: width .2s; width: 0%; }
  .barra-txt { font-size: .8rem; margin-top: 6px; text-align: right; opacity: .7; }
  .archivos { list-style: none; padding: 0; margin: 20px 0 0; }
  .archivo { border: 1px solid rgba(128,128,128,.25); border-radius: 12px; padding: 14px; margin-bottom: 10px;
             background: rgba(128,128,128,.03); }
  .archivo-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .archivo-nombre { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .archivo-estado { font-size: .78rem; opacity: .9; text-transform: capitalize; white-space: nowrap; }
  .barra-archivo { background: rgba(128,128,128,.12); border-radius: 6px; height: 6px; overflow: hidden; margin: 8px 0 4px; }
  .barra-archivo .barra { height: 100%; background: #1a1a1a; border-radius: 6px; transition: width .15s; width: 0%; }
  .estado-subiendo { color: #1a7fff; }
  .estado-convirtiendo { color: #d48800; }
  .estado-guardado { color: #157f3d; }
  .estado-error { color: #b42318; }
  .archivo-detalle { font-size: .75rem; opacity: .6; }
  .lista-final { list-style: none; padding: 0; margin: 28px 0 0; }
  .lista-final li { border: 1px solid rgba(128,128,128,.25); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
  .lista-final li b { display: block; }
  .lista-final li span { opacity: .65; font-size: .85rem; }
  .ok { color: #157f3d; } .err { color: #b42318; }
  .titulo-final { font-size: .95rem; font-weight: 600; margin: 28px 0 0; }
</style></head>
<body>
  <h1>Fotos para el E2E</h1>
  <p class="sub">Se guardan en <code>apps/admin/tests/fixtures/</code>. Los HEIC se convierten a JPEG.</p>
  <form method="post" enctype="multipart/form-data" id="form">
    <label class="boton">
      <strong>Elegir fotos</strong>
      <span>Puedes elegir varias</span>
      <input type="file" name="fotos" accept="image/*" multiple>
    </label>
    <button type="submit" class="btn" id="btnSubir">Subir</button>
  </form>

  <div class="progreso-total" id="progresoTotal" style="display:none">
    <div class="barra-wrap"><div class="barra" id="barraTotal"></div></div>
    <div class="barra-txt" id="txtTotal">0%</div>
  </div>

  <ul class="archivos" id="listaArchivos"></ul>
  <p class="titulo-final" id="tituloFinal" ${cuerpo ? "" : 'style="display:none"'}>En la carpeta de fixtures</p>
  <ul class="lista-final" id="listaFinal">${cuerpo}</ul>
</body>
<script>
const form = document.getElementById('form');
const btn = document.getElementById('btnSubir');
const lista = document.getElementById('listaArchivos');
const progresoTotal = document.getElementById('progresoTotal');
const barraTotal = document.getElementById('barraTotal');
const txtTotal = document.getElementById('txtTotal');
const listaFinal = document.getElementById('listaFinal');
const tituloFinal = document.getElementById('tituloFinal');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = form.querySelector('input[type=file]');
  const archivos = Array.from(input.files || []);
  if (!archivos.length) return;

  btn.disabled = true;
  btn.textContent = 'Subiendo…';
  lista.innerHTML = '';
  listaFinal.innerHTML = '';
  tituloFinal.style.display = 'none';
  progresoTotal.style.display = 'block';
  const total = archivos.length;
  let terminados = 0;

  for (let i = 0; i < archivos.length; i += 1) {
    const archivo = archivos[i];
    const item = document.createElement('li');
    item.className = 'archivo';
    item.innerHTML =
      '<div class="archivo-header">' +
        '<span class="archivo-nombre"></span>' +
        '<span class="archivo-estado estado-subiendo">Subiendo</span>' +
      '</div>' +
      '<div class="barra-archivo"><div class="barra"></div></div>' +
      '<div class="archivo-detalle">0 B / ' + tamano(archivo.size) + '</div>';
    item.querySelector('.archivo-nombre').textContent = archivo.name;
    lista.appendChild(item);

    const barra = item.querySelector('.barra');
    const detalle = item.querySelector('.archivo-detalle');
    const estado = item.querySelector('.archivo-estado');
    const datos = new FormData();
    datos.append('fotos', archivo);

    try {
      const respuesta = await new Promise((resolver, rechazar) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          barra.style.width = pct + '%';
          detalle.textContent = pct + '% — ' + tamano(e.loaded) + ' / ' + tamano(e.total);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolver(xhr.responseText);
          else rechazar(new Error('HTTP ' + xhr.status));
        });
        xhr.addEventListener('error', () => rechazar(new Error('Error de red')));
        xhr.open('POST', location.href);
        xhr.send(datos);
      });
      // El servidor ya terminó (conversion incluida): se refleja el resultado.
      estado.textContent = 'Guardado';
      estado.className = 'archivo-estado estado-guardado';
      barra.style.width = '100%';
      barra.style.background = '#157f3d';
      detalle.textContent = 'Guardado en la carpeta de fixtures';
    } catch (error) {
      estado.textContent = 'Error';
      estado.className = 'archivo-estado estado-error';
      barra.style.background = '#b42318';
      detalle.textContent = error.message;
    }

    terminados += 1;
    const pct = Math.round((terminados / total) * 100);
    barraTotal.style.width = pct + '%';
    txtTotal.textContent = pct + '% — ' + terminados + ' / ' + total + ' archivos';
  }

  // Lista final de lo que hay en la carpeta.
  const listado = await (await fetch(location.href)).text();
  const doc = new DOMParser().parseFromString(listado, 'text/html');
  const ul = doc.getElementById('listaFinal');
  if (ul && ul.innerHTML.trim()) {
    listaFinal.innerHTML = ul.innerHTML;
    tituloFinal.style.display = 'block';
  }
  // En la respuesta del POST el servidor ya trae la lista final: se usa.
  const propia = document.getElementById('listaFinal');
  btn.disabled = false;
  btn.textContent = 'Subir';
  input.value = '';
});

function tamano(bytes) {
  if (!bytes) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + unidades[i];
}
</script>
</body></html>`;

const listaHtml = async () => {
  const archivos = await readdir(DESTINO);
  const items = [];
  for (const nombre of archivos) {
    const info = await stat(join(DESTINO, nombre));
    if (!info.isFile() || nombre.startsWith(".")) continue;
    items.push(`<li class="ok"><b>${nombre}</b><span>${(info.size / 1024).toFixed(0)} KB</span></li>`);
  }
  return items.join("");
};

/** Convierte HEIC/HEIF a JPEG con ffmpeg (el navegador no abre HEIC). */
async function aJpeg(origen, destino) {
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", origen,
    "-frames:v", "1",
    "-vf", "scale='min(2400,iw)':-2:flags=lanczos",
    "-q:v", "2",
    destino,
  ]);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html(await listaHtml()));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end("Solo POST");
      return;
    }
    // El boundary viene de la cabecera Content-Type, no del cuerpo.
    const contentType = req.headers["content-type"] ?? "";
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[1]
      ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.[2];
    if (!boundary) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Falta boundary en Content-Type");
      return;
    }
    const trozos = [];
    let total = 0;
    for await (const trozo of req) {
      trozos.push(trozo);
      total += trozo.length;
      if (total > MAX_BYTES * 8) {
        res.writeHead(413).end("Demasiado grande");
        return;
      }
    }
    const cuerpo = Buffer.concat(trozos);
    // Partes separadas por "--boundary"; el cuerpo empieza con el preámbulo.
    const separador = Buffer.from(`--${boundary}`);
    const partes = [];
    let cursor = cuerpo.indexOf(separador);
    while (cursor !== -1) {
      const fin = cuerpo.indexOf(separador, cursor + separador.length);
      if (fin === -1) break;
      const parte = cuerpo.subarray(cursor + separador.length, fin);
      // Cada parte empieza con CRLF y termina con CRLF antes del separador.
      if (parte.length > 2) partes.push(parte.subarray(2, parte.length - 2));
      cursor = fin;
    }
    const guardados = [];
    const rechazados = [];
    let indice = 0;
    for (const parte of partes) {
      const finCabecera = parte.indexOf("\r\n\r\n");
      if (finCabecera === -1) continue;
      const cabeceras = parte.subarray(0, finCabecera).toString("latin1");
      const nombreOriginal = /filename="([^"]*)"/i.exec(cabeceras)?.[1] ?? "";
      if (!nombreOriginal) continue;
      const contenido = parte.subarray(finCabecera + 4);
      const extension = extname(nombreOriginal) || ".jpg";
      const clave = extension.replace(/^\./, "").toLowerCase();
      const base = nombreOriginal.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40) || `foto-${indice}`;
      indice += 1;
      if (!["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(clave)) {
        rechazados.push(`${nombreOriginal} (formato no soportado)`);
        continue;
      }
      if (contenido.length > MAX_BYTES) {
        rechazados.push(`${nombreOriginal} (supera 40 MB)`);
        continue;
      }
      const bruto = join(DESTINO, `.tmp-${Date.now()}-${indice}${extension}`);
      await writeFile(bruto, contenido);
      let final = join(DESTINO, `${base}${extension}`);
      const existe = async () => {
        try { await stat(final); return true; } catch { return false; }
      };
      let n = 1;
      while (await existe()) {
        final = join(DESTINO, `${base}-${n}${extension}`);
        n += 1;
      }
      if (clave === "heic" || clave === "heif") {
        const destino = final.replace(/\.(heic|heif)$/i, ".jpg");
        try {
          await aJpeg(bruto, destino);
          await unlink(bruto);
          final = destino;
        } catch {
          await unlink(bruto);
          rechazados.push(`${nombreOriginal} (no se pudo convertir a JPEG)`);
          continue;
        }
      } else {
        await execFileAsync("mv", [bruto, final]);
      }
      const info = await stat(final);
      guardados.push(`${final.split("/").pop()} (${(info.size / 1024).toFixed(0)} KB)`);
    }
    const cuerpoHtml = [
      ...guardados.map((g) => `<li class="ok"><b>Guardada</b><span>${g}</span></li>`),
      ...rechazados.map((r) => `<li class="err"><b>Rechazada</b><span>${r}</span></li>`),
    ].join("");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(cuerpoHtml + (await listaHtml())));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Error: ${error.message}`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log(`Fotos → ${DESTINO}`);
  console.log(`Desde el iPhone (misma WiFi):`);
  for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
  console.log(`Desde esta máquina: http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  for (const nombre of await readdir(DESTINO)) {
    if (nombre.startsWith(".tmp-")) await unlink(join(DESTINO, nombre));
  }
  server.close(() => process.exit(0));
});

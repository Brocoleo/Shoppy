/**
 * Utilidades compartidas para operar sobre el sandbox de Supabase.
 *
 * Reglas de esta casa:
 * - Las credenciales viven SOLO en archivos gitignored (`supabase/.env` y
 *   `apps/admin/.env.local`). Este módulo nunca las imprime.
 * - Nada de esto se ejecuta en producción: el script exige que el proyecto
 *   remoto sea el sandbox configurado y falla si no encuentra credenciales.
 * - Todo lo que se lee aquí se puede volver a leer; lo que se borra, se
 *   reporta antes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/**
 * Patrones de datos que crean los E2E del admin y las verificaciones sandbox
 * manuales (ver apps/admin/tests).
 */
export const PATRONES_PRODUCTO = [
  "prenda-e2e-%",
  "prenda-compra-e2e-%",
  "%prueba-sandbox%",
];
export const PATRONES_PERFIL = ["e2e-%"];

export function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadSandboxEnv() {
  return {
    ...parseEnvFile(path.join(REPO_ROOT, "supabase", ".env")),
    ...parseEnvFile(path.join(REPO_ROOT, "apps", "admin", ".env.local")),
  };
}

/** Cliente de service role del sandbox. No imprime la clave. */
export function sandboxClient() {
  const env = loadSandboxEnv();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY. Configúralos en " +
        "supabase/.env o apps/admin/.env.local (ambos gitignored).",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Detecta todo lo que los E2E o las verificaciones manuales dejaron en la BD.
 *
 * "Dato de prueba" es:
 * - pedido con `mode='test'` (todo lo creado en sandbox nace así),
 * - prenda con slug de E2E o de prueba sandbox,
 * - perfil/usuario con email `e2e-*`,
 * - y las filas hijas que quedan colgando de esos.
 *
 * Se lee la tabla completa y se filtra en memoria: el sandbox es pequeño y así
 * no se depende de la sintaxis esoteric de los filtros de PostgREST.
 */
export async function detectarDatosDePrueba(db) {
  const [pedidosRes, productosRes, perfilesRes, itemsRes, reservasRes, imagenesRes, colaRes, pagosRes, intentosRes] =
    await Promise.all([
      db.from("orders").select("id,order_number,status,mode,created_at"),
      db.from("products").select("id,slug,name,availability,stock,published_at"),
      db.from("profiles").select("id,email,role"),
      db.from("order_items").select("id,order_id,product_id"),
      db.from("product_reservations").select("id,order_id,product_id,status"),
      db.from("product_images").select("id,product_id,storage_path"),
      db.from("image_cleanup").select("storage_path,product_id"),
      db.from("payments").select("id,order_id,status,mode"),
      db.from("checkout_attempts").select("id,order_id,state"),
    ]);
  for (const [nombre, res] of Object.entries({
    pedidos: pedidosRes,
    productos: productosRes,
    perfiles: perfilesRes,
    items: itemsRes,
    reservas: reservasRes,
    imagenes: imagenesRes,
    cola: colaRes,
    pagos: pagosRes,
    intentos: intentosRes,
  })) {
    if (res.error) throw new Error(`${nombre}: ${res.error.message}`);
  }

  const pedidos = (pedidosRes.data ?? []).filter((p) => p.mode === "test");
  const idsPedidosTest = new Set(pedidos.map((p) => p.id));

  const productos = [];
  for (const patron of PATRONES_PRODUCTO) {
    const { data, error } = await db
      .from("products")
      .select("id,slug,name,availability,stock,published_at")
      .like("slug", patron);
    if (error) throw error;
    productos.push(...(data ?? []));
  }
  const idsProductosTest = new Set(productos.map((p) => p.id));

  const perfiles = [];
  for (const patron of PATRONES_PERFIL) {
    const { data, error } = await db
      .from("profiles")
      .select("id,email,role")
      .like("email", patron);
    if (error) throw error;
    perfiles.push(...(data ?? []));
  }

  // Ítems de pedidos que NO son de prueba: esos productos están protegidos.
  const idsProductosConPedidoReal = new Set();
  for (const item of itemsRes.data ?? []) {
    if (!idsPedidosTest.has(item.order_id)) idsProductosConPedidoReal.add(item.product_id);
  }
  const productosProtegidos = productos.filter((p) =>
    idsProductosConPedidoReal.has(p.id),
  );

  const items = (itemsRes.data ?? []).filter((i) => idsPedidosTest.has(i.order_id));
  const pagos = (pagosRes.data ?? []).filter((p) => idsPedidosTest.has(p.order_id));
  const intentos = (intentosRes.data ?? []).filter((i) =>
    idsPedidosTest.has(i.order_id),
  );
  const reservas = (reservasRes.data ?? []).filter(
    (r) =>
      idsPedidosTest.has(r.order_id) ||
      idsProductosTest.has(r.product_id) ||
      r.order_id === null,
  );
  const imagenes = (imagenesRes.data ?? []).filter((i) =>
    idsProductosTest.has(i.product_id),
  );
  const colaImagenes = (colaRes.data ?? []).filter((c) =>
    idsProductosTest.has(c.product_id),
  );

  return {
    pedidos,
    productos,
    productosProtegidos,
    perfiles,
    intentos,
    pagos,
    items,
    reservas,
    imagenes,
    colaImagenes,
  };
}

/** Totales por tabla, para el informe. */
export function resumir(datos) {
  return [
    ["pedidos (mode=test)", datos.pedidos.length],
    ["prendas de prueba", datos.productos.length],
    ["  de ellas, con pedido real", datos.productosProtegidos.length],
    ["perfiles de E2E", datos.perfiles.length],
    ["checkout_attempts", datos.intentos.length],
    ["pagos", datos.pagos.length],
    ["order_items", datos.items.length],
    ["reservas", datos.reservas.length],
    ["imágenes de esas prendas", datos.imagenes.length],
    ["imágenes en cola de limpieza", datos.colaImagenes.length],
  ];
}

/** ¿Queda algo que limpiar? */
export function hayResiduo(datos) {
  return resumir(datos).reduce((suma, [, n]) => suma + n, 0) > 0;
}

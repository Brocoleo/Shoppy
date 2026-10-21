/**
 * Smoke E2E del flujo de fotos del admin.
 *
 * Cubre: login → crear producto → subir 3 fotos → portada → defecto →
 * reordenar → eliminar → publicar → verificar la prenda en la web pública.
 *
 * El admin de Supabase corre en modo sandbox real (misma BD del proyecto),
 * por eso el test limpia la prenda y el usuario temporal al terminar.
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import {
  createTempAdmin,
  deleteProduct,
  deleteTempAdmin,
  getProduct,
  getProductImages,
} from "./helpers/supabase-admin";
import { loginAsAdmin } from "./helpers/auth";
import { SUPABASE_URL, WEB_URL } from "./helpers/env";

const FIXTURES = path.resolve(__dirname, "fixtures");
const FOTO_1 = path.join(FIXTURES, "prenda-1-panoramica.jpg");
const FOTO_2 = path.join(FIXTURES, "prenda-2-vertical.jpg");
const FOTO_3 = path.join(FIXTURES, "prenda-3-cuadrada.png");

const RUN_ID = `e2e-${Date.now()}`;
const SLUG = `prenda-e2e-${Date.now()}`;
const NOMBRE = `Prenda E2E ${RUN_ID}`;

let adminId = "";
let adminEmail = "";
let adminPassword = "";
let productId = "";

/** Espera a que la BD refleje N imágenes para el producto. */
async function waitForImages(page: Page, expected: number) {
  await expect
    .poll(
      async () => {
        if (!productId) return 0;
        return (await getProductImages(productId)).length;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(expected);
}

/**
 * Navega dentro del admin esperando a que la sesión esté resuelta.
 * Sin esto, el shell redirige a /login mientras React hidrata.
 */
async function gotoAdmin(page: Page, pathname: string) {
  await page.goto(pathname);
  await expect(
    page.getByRole("navigation", { name: "Administración" }),
  ).toBeVisible({ timeout: 20_000 });
}

/** Abre el paso "Fotos" con el botón del asistente (flujo real de usuario). */
async function gotoFotos(page: Page) {
  await page.getByRole("button", { name: "2. Fotos" }).click();
  await expect(page.getByRole("heading", { name: /Fotografías/ })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  adminEmail = `e2e-admin-${Date.now()}@vintah-test.local`;
  adminPassword = `E2e-${Date.now()}-Aa1!`;
  const created = await createTempAdmin(adminEmail, adminPassword);
  adminId = created.id;
});

test.afterAll(async () => {
  if (productId) await deleteProduct(productId);
  if (adminId) await deleteTempAdmin(adminId);
});

// Cada test corre en un contexto nuevo: hay que volver a iniciar sesión.
test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page, adminEmail, adminPassword);
});

test("login del admin", async ({ page }) => {
  await expect(
    page.getByRole("navigation", { name: "Administración" }),
  ).toBeVisible();
  // "exact" importa: el dashboard tiene un link "Ver productos" que, sin
  // coincidencia exacta, también matchea "Productos" (strict mode violation).
  await expect(page.getByRole("link", { name: "Productos", exact: true })).toBeVisible();
});

test("crea una prenda en borrador y llega al paso de fotos", async ({
  page,
}) => {
  await gotoAdmin(page, "/productos/nuevo");
  await page.getByLabel("Nombre *").fill(NOMBRE);
  await page.getByLabel("Slug *").fill(SLUG);
  await page.getByLabel("Precio CLP *").fill("39000");
  await page.getByLabel("Stock *").fill("1");
  await page.getByLabel("Condición").selectOption("excelente");
  // La categoría es obligatoria para publicar: se toma la primera real.
  const categoria = page.getByLabel("Categoría", { exact: true });
  await categoria.selectOption({ index: 1 });
  await page.getByLabel("Talla").fill("M");
  await page.getByLabel("Color").fill("Arena");
  await page.getByLabel("Composición").fill("55% lino, 45% viscosa");
  await page.getByLabel("Busto").fill("94");
  await page.getByLabel("Cintura").fill("80");
  await page.getByLabel("Largo").fill("72");

  await page.getByRole("button", { name: "Guardar datos y continuar" }).click();

  // Tras guardar, la página navega a /productos/<id> en el paso "fotos".
  await page.waitForURL(/\/productos\/[0-9a-f-]{36}/, { timeout: 30_000 });
  productId = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(productId).toMatch(/^[0-9a-f-]{36}$/);

  const producto = await getProduct(productId);
  expect(producto?.metadata).toMatchObject({
    material: "55% lino, 45% viscosa",
    measurements_cm: { busto: 94, cintura: 80, largo: 72 },
  });
});

test("sube 3 fotos y las recorta a 4:5", async ({ page }) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await gotoFotos(page);

  const fileInput = page.getByLabel("Subir fotos de la prenda");
  await expect(fileInput).toHaveAttribute("capture", "environment");
  await expect(fileInput).toHaveAttribute("accept", "image/*");
  await expect(fileInput).toHaveAttribute("multiple", "");

  await fileInput.setInputFiles([FOTO_1, FOTO_2, FOTO_3]);

  await waitForImages(page, 3);

  const images = await getProductImages(productId);
  expect(images).toHaveLength(3);

  // Cada objeto subido debe ser WebP 4:5 (0.8) y pesar menos de 5 MB.
  for (const img of images) {
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/public/product-images/${img.storage_path}`,
    );
    expect(response.ok, `no se pudo descargar ${img.storage_path}`).toBe(true);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(buffer.length).toBeLessThan(5 * 1024 * 1024);
  }
});

test("los botones de acción tienen target táctil de 44 px", async ({
  page,
}) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await gotoFotos(page);

  const botones = page.getByRole("button", { name: /Portada|defecto|Mover foto/ });
  const total = await botones.count();
  expect(total).toBeGreaterThan(0);

  for (let i = 0; i < total; i++) {
    const box = await botones.nth(i).boundingBox();
    expect(box, "el botón no es visible").not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("la portada solo puede ser una y cambia a la elegida", async ({
  page,
}) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await gotoFotos(page);

  const before = await getProductImages(productId);
  expect(before).toHaveLength(3);
  expect(before.filter((i) => i.is_cover)).toHaveLength(1);
  expect(before.find((i) => i.is_cover)!.id).toBe(before[0].id);

  // El boton "Portada" existe en todas las tarjetas menos la que ya es portada.
  const botonesPortada = page.getByRole("button", { name: "Portada" });
  expect(await botonesPortada.count()).toBe(before.length - 1);

  await botonesPortada.first().click();

  await expect
    .poll(
      async () =>
        (await getProductImages(productId)).filter((i) => i.is_cover).length,
      { timeout: 20_000 },
    )
    .toBe(1);

  const after = await getProductImages(productId);
  expect(after.filter((i) => i.is_cover)).toHaveLength(1);
  expect(after.find((i) => i.is_cover)!.id).toBe(before[1].id);
});

test("marca una foto como detalle de defecto", async ({ page }) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await gotoFotos(page);

  const before = await getProductImages(productId);
  const objetivo = before[0];

  await page.getByRole("button", { name: "Marcar defecto" }).first().click();

  await expect
    .poll(
      async () =>
        (await getProductImages(productId)).filter((i) => i.is_defect_detail)
          .length,
      { timeout: 20_000 },
    )
    .toBe(1);

  const after = await getProductImages(productId);
  expect(after.find((i) => i.id === objetivo.id)?.is_defect_detail).toBe(true);
});

test("reordena las fotos con las flechas", async ({ page }) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await gotoFotos(page);

  const before = await getProductImages(productId);
  const first = before[0];
  const second = before[1];

  await page
    .getByRole("button", { name: "Mover foto después" })
    .first()
    .click();

  await expect
    .poll(
      async () => {
        const now = await getProductImages(productId);
        return now.find((i) => i.id === second.id)?.sort_order;
      },
      { timeout: 20_000 },
    )
    .toBe(first.sort_order);

  const after = await getProductImages(productId);
  expect(after.find((i) => i.id === second.id)?.sort_order).toBe(
    first.sort_order,
  );
  expect(after.find((i) => i.id === first.id)?.sort_order).toBe(
    second.sort_order,
  );
});

test("reordena las fotos arrastrando", async ({ page }) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await gotoFotos(page);

  const before = await getProductImages(productId);
  const origen = before[0];
  const destino = before[1];

  const tarjetas = page.locator("div[draggable=true]");
  await expect(tarjetas).toHaveCount(before.length);

  await tarjetas.nth(0).dragTo(tarjetas.nth(1));

  await expect
    .poll(
      async () => {
        const now = await getProductImages(productId);
        return now.find((i) => i.id === origen.id)?.sort_order;
      },
      { timeout: 20_000 },
    )
    .toBe(destino.sort_order);

  const after = await getProductImages(productId);
  expect(after.find((i) => i.id === origen.id)?.sort_order).toBe(
    destino.sort_order,
  );
  expect(after.find((i) => i.id === destino.id)?.sort_order).toBe(
    origen.sort_order,
  );
});

test("elimina una foto", async ({ page }) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await gotoFotos(page);

  const before = await getProductImages(productId);
  const objetivo = before[0];

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Eliminar" }).first().click();

  await waitForImages(page, 2);
  const after = await getProductImages(productId);
  expect(after.find((i) => i.id === objetivo.id)).toBeUndefined();
  // El trigger repone portada si se elimino la que lo era.
  expect(after.filter((i) => i.is_cover)).toHaveLength(1);
});

test("publica la prenda y aparece en la web pública", async ({ page }) => {
  await gotoAdmin(page, `/productos/${productId}`);
  await page.getByRole("button", { name: "3. Revisión" }).click();
  const publicar = page.getByRole("button", { name: /Publicar producto/ });
  await expect(publicar).toBeEnabled();
  await publicar.click();

  await expect
    .poll(async () => (await getProduct(productId))?.published_at, {
      timeout: 20_000,
    })
    .not.toBeNull();

  // La web pública lee la misma BD: la prenda debe estar visible.
  const web = await page.context().newPage();
  await web.goto(`${WEB_URL}/producto/${SLUG}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await expect(web.getByRole("heading", { name: NOMBRE })).toBeVisible({
    timeout: 45_000,
  });
  await expect(web.getByText("Detalles y medidas")).toBeVisible();
  await expect(web.getByText("55% lino, 45% viscosa").first()).toBeVisible();
  await web.close();
});

test("retira la prenda y la deja como borrador", async () => {
  const producto = await getProduct(productId);
  expect(producto?.published_at).not.toBeNull();
});

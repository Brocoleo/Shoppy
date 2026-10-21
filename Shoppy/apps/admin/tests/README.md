# E2E del admin (Playwright)

Auditoría end-to-end del flujo de publicación de prendas: login → datos →
fotos → portada/defecto/orden → publicación → verificación en la web pública.
Incluye además la regresión de **aislamiento entre cuentas** en el sitio web.

## Qué cubre

`tests/photo-flow.spec.ts` (11 casos, seriales):

| # | Caso | Qué prueba |
|---|---|---|
| 1 | Login | Formulario real, verificación de rol `admin` en `profiles` |
| 2 | Crear prenda | Guarda datos + `metadata.measurements_cm` / `material` en BD |
| 3 | Subir 3 fotos | `capture="environment"`, recorte 4:5, WebP < 5 MB en Storage |
| 4 | Targets táctiles | Todos los botones de acción miden ≥ 44×44 px |
| 5 | Portada | Solo una portada y cambia a la foto elegida |
| 6 | Defecto | Marca/desmarca detalle de defecto |
| 7 | Reordenar (flechas) | Intercambia `sort_order` |
| 8 | Reordenar (arrastrar) | Drag & drop HTML5 |
| 9 | Eliminar | Borra la foto y repone portada (trigger `ensure_product_cover`) |
| 10 | Publicar | Habilita publicación y la prenda aparece en el sitio |
| 11 | Borrador | `published_at` quedó seteado |

`tests/web-account-isolation.spec.ts` (1 caso):

| # | Caso | Qué prueba |
|---|---|---|
| 1 | Aislamiento entre cuentas | Dos cuentas reales en el **mismo navegador**: la cuenta B **no** puede ver los pedidos de la cuenta A, y la cuenta A los sigue viendo al volver a entrar |

> **Importante para escribir E2E de caché:** el test de aislamiento navega
> **con clics en enlaces de Next.js**, no con `page.goto()`. Un `goto()` recarga
> el documento y borra la caché en memoria de React Query, con lo que una fuga
> entre cuentas no sería observable y el test daría verde siempre.

## Requisitos

- Node 20+ y el repo con dependencias instaladas.
- **No hace falta descargar navegadores**: la config reutiliza el Chromium de
  la caché de Playwright (`~/.cache/ms-playwright/chromium-*`). Si no existe,
  instala con `npx playwright install chromium`.
- Secretos (ya gitignored, nunca en el repo):
  - `apps/admin/.env.local` → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `supabase/.env` → `SUPABASE_SECRET_KEY` (service role, para crear el
    usuario temporal y verificar la BD)

## Ejecutar

```bash
cd apps/admin
npm run test:e2e          # headless
npm run test:e2e:headed   # con navegador visible
npm run test:e2e:ui       # modo interactivo
```

Playwright levanta solo dos servidores: admin en `:3001` y el sitio web en
`:3010` (ambos contra la BD real del proyecto).

### Apuntar a otros servidores

```bash
# Admin ya levantado (túnel, staging, etc.)
E2E_BASE_URL=https://tu-tunel.example npm run test:e2e

# Verificar contra el despliegue real en vez del web local
E2E_WEB_URL=https://shopy-web-six.vercel.app npm run test:e2e
```

## Limpieza

Cada corrida crea un usuario admin temporal (`e2e-admin-…@vintah-test.local`)
y una prenda de prueba, y los borra al terminar (`afterAll`). El test de
aislamiento crea además **dos usuarios cliente** (`e2e-aislamiento-…`) y **un
pedido** de prueba (`mode = 'test'`), y también los borra. Si la corrida se
corta a la mitad, se limpian a mano:

```bash
# desde la raíz del repo
set -a && . ./supabase/.env && . ./apps/web/.env.local && set +a
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/products?slug=like.prenda-e2e-*" \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?email=like.e2e-aislamiento-*" \
  -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY"
```

## Fixtures

`tests/fixtures/` trae tres imágenes generadas con formas distintas para
forzar el recorte 4:5:

- `prenda-1-panoramica.jpg` (3000×2000, 3:2)
- `prenda-2-vertical.jpg` (1500×2250, 2:3)
- `prenda-3-cuadrada.png` (2000×2000, 1:1)

## Notas

- El test corre contra la **BD real** (no hay base de datos de pruebas
  separada). Publica la prenda de prueba y la despublica al terminar.
- `mode: serial` + `workers: 1`: los casos comparten el mismo producto.

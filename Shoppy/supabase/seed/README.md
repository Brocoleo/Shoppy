# Seed de desarrollo (Fase 2)

20 productos ficticios realistas en CLP (chaqueta Levi's, polera Nike,
jeans Wrangler, sweater vintage, polerón Adidas…), mayoría stock 1 y uno con
stock 3 (pañuelo) para probar multi-stock. Sin imágenes protegidas ni URLs
externas: placeholders PNG locales generados sin dependencias.

## Regenerar placeholders

```bash
node supabase/seed/make-placeholders.mjs
# genera supabase/seed/placeholders/products/<slug>/0N.png (40 archivos)
```

El reparto de fotos por producto debe coincidir con
`supabase/migrations/20260928000002_seed.sql` (ver constante `shots` en el script).

## Subir al bucket `product-images`

Los `storage_path` del seed (`products/<slug>/0N.png`) deben existir en el bucket
público `product-images`. Con Supabase CLI vinculada (o script con service_role),
subir `placeholders/` conservando paths relativos. En producción se reemplazan por
fotos reales (jpg/webp); el path es opaco para la app.

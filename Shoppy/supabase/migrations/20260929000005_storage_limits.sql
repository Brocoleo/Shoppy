-- ============================================================================
-- SHOPY · 20260929000005_storage_limits
-- El bucket product-images aceptaba cualquier MIME sin tope de tamaño:
-- un admin comprometido (o service_role filtrado) podía subir ejecutables.
-- Se restringen tipos y tamaño a nivel de bucket (aplica antes que las
-- policies de storage.objects). UPDATE sin INSERT: si el bucket no existe,
-- no hace nada (0 filas) en vez de fallar.
-- ============================================================================

update storage.buckets
set file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'product-images';

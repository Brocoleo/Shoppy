-- ============================================================================
-- SHOPY · 20260928000002_seed
-- Datos de desarrollo: categorías, marcas, ~20 productos (CLP), colecciones,
-- tarifas de despacho, cupones y secciones del home.
--
-- Imágenes: solo se guarda `storage_path` dentro del bucket `product-images`
-- (ver docs/DATABASE.md). Los placeholders locales están en
-- supabase/seed/placeholders/ y se suben con el mismo path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Categorías (incluye subcategorías)
-- ----------------------------------------------------------------------------
insert into public.categories (id, slug, name, parent_id, sort_order) values
  ('a0000000-0000-4000-8000-000000000001', 'mujer',      'Mujer',      null, 10),
  ('a0000000-0000-4000-8000-000000000002', 'hombre',     'Hombre',     null, 20),
  ('a0000000-0000-4000-8000-000000000003', 'accesorios', 'Accesorios', null, 30),
  ('a0000000-0000-4000-8000-000000000004', 'ofertas',    'Ofertas',    null, 40),
  ('a0000000-0000-4000-8000-000000000005', 'novedades',  'Novedades',  null, 50),
  ('a0000000-0000-4000-8000-000000000011', 'vestidos',   'Vestidos',   'a0000000-0000-4000-8000-000000000001', 11),
  ('a0000000-0000-4000-8000-000000000012', 'chaquetas',  'Chaquetas',  'a0000000-0000-4000-8000-000000000001', 12),
  ('a0000000-0000-4000-8000-000000000013', 'poleras-mujer', 'Poleras', 'a0000000-0000-4000-8000-000000000001', 13),
  ('a0000000-0000-4000-8000-000000000014', 'jeans-mujer','Jeans',      'a0000000-0000-4000-8000-000000000001', 14),
  ('a0000000-0000-4000-8000-000000000021', 'polerones',  'Polerones',  'a0000000-0000-4000-8000-000000000002', 21),
  ('a0000000-0000-4000-8000-000000000022', 'camisas',    'Camisas',    'a0000000-0000-4000-8000-000000000002', 22),
  ('a0000000-0000-4000-8000-000000000023', 'jeans-hombre','Jeans',     'a0000000-0000-4000-8000-000000000002', 23),
  ('a0000000-0000-4000-8000-000000000024', 'poleras-hombre','Poleras', 'a0000000-0000-4000-8000-000000000002', 24),
  ('a0000000-0000-4000-8000-000000000031', 'carteras',   'Carteras',   'a0000000-0000-4000-8000-000000000003', 31),
  ('a0000000-0000-4000-8000-000000000032', 'cinturones', 'Cinturones', 'a0000000-0000-4000-8000-000000000003', 32),
  ('a0000000-0000-4000-8000-000000000033', 'panuelos',   'Pañuelos',   'a0000000-0000-4000-8000-000000000003', 33);

-- ----------------------------------------------------------------------------
-- Marcas
-- ----------------------------------------------------------------------------
insert into public.brands (id, slug, name) values
  ('c0000000-0000-4000-8000-000000000001', 'levis',   'Levi''s'),
  ('c0000000-0000-4000-8000-000000000002', 'nike',    'Nike'),
  ('c0000000-0000-4000-8000-000000000003', 'wrangler','Wrangler'),
  ('c0000000-0000-4000-8000-000000000004', 'adidas',  'Adidas'),
  ('c0000000-0000-4000-8000-000000000005', 'zara',    'Zara'),
  ('c0000000-0000-4000-8000-000000000006', 'hm',      'H&M'),
  ('c0000000-0000-4000-8000-000000000007', 'mango',   'Mango'),
  ('c0000000-0000-4000-8000-000000000008', 'lacoste', 'Lacoste'),
  ('c0000000-0000-4000-8000-000000000009', 'puma',    'Puma'),
  ('c0000000-0000-4000-8000-000000000010', 'tommy',   'Tommy Hilfiger'),
  ('c0000000-0000-4000-8000-000000000011', 'gap',     'Gap'),
  ('c0000000-0000-4000-8000-000000000012', 'vintage', 'Vintage / Sin marca');

-- ----------------------------------------------------------------------------
-- Productos (precios CLP, mayoría stock 1; #15 con stock 3 como prueba multi-stock)
-- ----------------------------------------------------------------------------
insert into public.products
  (id, slug, name, description, brand_id, category_id, subcategory_id, segment,
   price_clp, compare_at_price_clp, condition, size, color, sku, stock,
   published_at, tags, view_count, favorite_count, is_featured) values
  ('d0000000-0000-4000-8000-000000000001', 'chaqueta-trucker-levis',
   'Chaqueta trucker Levi''s', 'Chaqueta de denim clásica, sin desgastes. Cierre y botones originales.',
   'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000012', 'mujer',
   34990, 44990, 'como_nuevo', 'M', 'Azul denim', 'SHO-LEVIS-001', 1,
   now() - interval '20 days', array['denim','chaqueta','otoño'], 210, 34, true),
  ('d0000000-0000-4000-8000-000000000002', 'polera-nike-dryfit',
   'Polera Nike Dry-Fit', 'Polera deportiva con tecnología de secado rápido. Estampado intacto.',
   'c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000024', 'hombre',
   12990, null, 'excelente', 'L', 'Negro', 'SHO-NIKE-002', 1,
   now() - interval '18 days', array['deporte','polera'], 120, 12, false),
  ('d0000000-0000-4000-8000-000000000003', 'jeans-wrangler-rectos',
   'Jeans Wrangler rectos', 'Jeans corte recto tiro medio. Pretina y basta en buen estado.',
   'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000023', 'hombre',
   14990, null, 'bueno', '32', 'Azul oscuro', 'SHO-WRAN-003', 1,
   now() - interval '16 days', array['denim','jeans'], 88, 7, false),
  ('d0000000-0000-4000-8000-000000000004', 'sweater-lana-vintage',
   'Sweater de lana vintage', 'Sweater tejido a mano años 90. Pequeño zurcido visible en el puño (ver foto detalle).',
   'c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', null, 'mujer',
   9990, null, 'con_detalles', 'S', 'Mostaza', 'SHO-VINT-004', 1,
   now() - interval '15 days', array['vintage','lana','invierno'], 64, 9, false),
  ('d0000000-0000-4000-8000-000000000005', 'poleron-adidas-capucha',
   'Polerón Adidas con capucha', 'Polerón con chiporro interior, puños firmes y cordones originales.',
   'c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000021', 'hombre',
   19990, null, 'excelente', 'M', 'Gris', 'SHO-ADID-005', 1,
   now() - interval '14 days', array['poleron','invierno'], 175, 28, true),
  ('d0000000-0000-4000-8000-000000000006', 'vestido-zara-midi',
   'Vestido Zara midi', 'Vestido midi con abertura lateral. Usado una vez, como nuevo.',
   'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011', 'mujer',
   17990, 24990, 'como_nuevo', 'S', 'Negro', 'SHO-ZARA-006', 1,
   now() - interval '12 days', array['vestido','fiesta'], 190, 31, true),
  ('d0000000-0000-4000-8000-000000000007', 'camisa-mango-lino',
   'Camisa Mango de lino', 'Camisa oversize de lino, ideal para verano. Sin manchas.',
   'c0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', null, 'mujer',
   13990, null, 'excelente', 'M', 'Blanco', 'SHO-MANG-007', 1,
   now() - interval '11 days', array['lino','verano'], 72, 6, false),
  ('d0000000-0000-4000-8000-000000000008', 'jeans-levis-501',
   'Jeans Levi''s 501', 'El clásico 501 corte recto. Desgaste parejo propio del uso, sin roturas.',
   'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000014', 'mujer',
   18990, null, 'bueno', '28', 'Celeste', 'SHO-LEVIS-008', 1,
   now() - interval '10 days', array['denim','jeans','clasico'], 143, 19, false),
  ('d0000000-0000-4000-8000-000000000009', 'cartera-cuero-genuino',
   'Cartera de cuero genuino', 'Cartera bandolera de cuero, forro interior impecable y correa regulable.',
   'c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000031', 'unisex',
   24990, null, 'excelente', 'Única', 'Café', 'SHO-ACCE-009', 1,
   now() - interval '9 days', array['cuero','cartera'], 158, 25, true),
  ('d0000000-0000-4000-8000-000000000010', 'cinturon-cuero-trenzado',
   'Cinturón de cuero trenzado', 'Cinturón trenzado elástico con hebilla metálica.',
   'c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000032', 'unisex',
   6990, null, 'bueno', 'M', 'Negro', 'SHO-ACCE-010', 1,
   now() - interval '9 days', array['cuero','cinturon'], 41, 3, false),
  ('d0000000-0000-4000-8000-000000000011', 'vestido-hm-floral',
   'Vestido H&M floral', 'Vestido corto con estampado floral, espalda con elástico en buen estado.',
   'c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000011', 'mujer',
   8990, null, 'bueno', 'XS', 'Floreado', 'SHO-HM-011', 1,
   now() - interval '8 days', array['vestido','verano'], 55, 5, false),
  ('d0000000-0000-4000-8000-000000000012', 'parka-gap-impermeable',
   'Parka Gap impermeable', 'Parka con relleno térmico y capucha desmontable. Cierres perfectos.',
   'c0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000002', null, 'hombre',
   29990, 39990, 'excelente', 'L', 'Azul marino', 'SHO-GAP-012', 1,
   now() - interval '7 days', array['parka','invierno'], 132, 17, false),
  ('d0000000-0000-4000-8000-000000000013', 'blazer-zara-sastrero',
   'Blazer Zara sastrero', 'Blazer entallado con forro completo. Solapas y botones originales.',
   'c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000012', 'mujer',
   22990, null, 'como_nuevo', 'M', 'Beige', 'SHO-ZARA-013', 1,
   now() - interval '5 days', array['blazer','oficina'], 96, 14, false),
  ('d0000000-0000-4000-8000-000000000014', 'falda-denim-vintage',
   'Falda de denim vintage', 'Falda midi de denim rígido. Botones con pátina y ruedo con leve desgaste (ver foto).',
   'c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', null, 'mujer',
   7990, null, 'con_detalles', 'S', 'Azul medio', 'SHO-VINT-014', 1,
   now() - interval '5 days', array['vintage','denim','falda'], 48, 4, false),
  ('d0000000-0000-4000-8000-000000000015', 'panuelo-seda-estampado',
   'Pañuelo de seda estampado', 'Pañuelos de seda con estampado geométrico. Stock de 3 unidades iguales.',
   'c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000033', 'unisex',
   4990, null, 'excelente', 'Única', 'Multicolor', 'SHO-ACCE-015', 3,
   now() - interval '4 days', array['seda','panuelo'], 37, 2, false),
  ('d0000000-0000-4000-8000-000000000016', 'polera-puma-esencial',
   'Polera Puma esencial', 'Polera básica de algodón con logo bordado. Cuello firme.',
   'c0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000024', 'hombre',
   7990, null, 'bueno', 'XL', 'Blanco', 'SHO-PUMA-016', 1,
   now() - interval '4 days', array['polera','basico'], 44, 3, false),
  ('d0000000-0000-4000-8000-000000000017', 'camisa-lacoste-oxford',
   'Camisa Lacoste oxford', 'Camisa oxford con logo bordado, planchado impecable y puños firmes.',
   'c0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000022', 'hombre',
   21990, null, 'excelente', 'M', 'Celeste', 'SHO-LACO-017', 1,
   now() - interval '3 days', array['camisa','oficina'], 81, 11, false),
  ('d0000000-0000-4000-8000-000000000018', 'chaqueta-cuero-vintage',
   'Chaqueta de cuero vintage', 'Chaqueta de cuero genuino años 80. Forro con pequeña reparación (ver foto detalle).',
   'c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000012', 'mujer',
   39990, null, 'con_detalles', 'M', 'Negro', 'SHO-VINT-018', 1,
   now() - interval '2 days', array['cuero','vintage','chaqueta'], 167, 29, true),
  ('d0000000-0000-4000-8000-000000000019', 'shorts-jean-levis',
   'Shorts de jean Levi''s', 'Shorts tiro alto con basta desflecada de fábrica.',
   'c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000014', 'mujer',
   10990, null, 'bueno', 'S', 'Celeste', 'SHO-LEVIS-019', 1,
   now() - interval '1 day', array['denim','verano','shorts'], 59, 8, false),
  ('d0000000-0000-4000-8000-000000000020', 'chaleco-tommy-hilfiger',
   'Chaleco Tommy Hilfiger', 'Chaleco de punto con cuello en V. Sin motas, elástico firme.',
   'c0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000002', null, 'hombre',
   16990, 22990, 'como_nuevo', 'L', 'Burdeo', 'SHO-TOMM-020', 1,
   now() - interval '6 hours', array['chaleco','otono'], 73, 13, false);

-- ----------------------------------------------------------------------------
-- Imágenes (portada + detalle; foto 03 = defecto en productos con_detalles)
-- ----------------------------------------------------------------------------
insert into public.product_images (product_id, storage_path, sort_order, is_cover, is_defect_detail) values
  ('d0000000-0000-4000-8000-000000000001', 'products/chaqueta-trucker-levis/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000001', 'products/chaqueta-trucker-levis/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000002', 'products/polera-nike-dryfit/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000002', 'products/polera-nike-dryfit/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000003', 'products/jeans-wrangler-rectos/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000003', 'products/jeans-wrangler-rectos/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000004', 'products/sweater-lana-vintage/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000004', 'products/sweater-lana-vintage/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000004', 'products/sweater-lana-vintage/03.png', 2, false, true),
  ('d0000000-0000-4000-8000-000000000005', 'products/poleron-adidas-capucha/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000005', 'products/poleron-adidas-capucha/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000006', 'products/vestido-zara-midi/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000006', 'products/vestido-zara-midi/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000007', 'products/camisa-mango-lino/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000007', 'products/camisa-mango-lino/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000008', 'products/jeans-levis-501/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000008', 'products/jeans-levis-501/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000009', 'products/cartera-cuero-genuino/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000009', 'products/cartera-cuero-genuino/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000010', 'products/cinturon-cuero-trenzado/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000011', 'products/vestido-hm-floral/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000011', 'products/vestido-hm-floral/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000012', 'products/parka-gap-impermeable/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000012', 'products/parka-gap-impermeable/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000013', 'products/blazer-zara-sastrero/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000013', 'products/blazer-zara-sastrero/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000014', 'products/falda-denim-vintage/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000014', 'products/falda-denim-vintage/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000014', 'products/falda-denim-vintage/03.png', 2, false, true),
  ('d0000000-0000-4000-8000-000000000015', 'products/panuelo-seda-estampado/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000016', 'products/polera-puma-esencial/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000017', 'products/camisa-lacoste-oxford/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000017', 'products/camisa-lacoste-oxford/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000018', 'products/chaqueta-cuero-vintage/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000018', 'products/chaqueta-cuero-vintage/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000018', 'products/chaqueta-cuero-vintage/03.png', 2, false, true),
  ('d0000000-0000-4000-8000-000000000019', 'products/shorts-jean-levis/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000019', 'products/shorts-jean-levis/02.png', 1, false, false),
  ('d0000000-0000-4000-8000-000000000020', 'products/chaleco-tommy-hilfiger/01.png', 0, true, false),
  ('d0000000-0000-4000-8000-000000000020', 'products/chaleco-tommy-hilfiger/02.png', 1, false, false);

-- ----------------------------------------------------------------------------
-- Colecciones
-- ----------------------------------------------------------------------------
insert into public.collections (id, slug, name, description, sort_order) values
  ('e0000000-0000-4000-8000-000000000001', 'ofertas',   'Ofertas',   'Prendas con precio rebajado', 10),
  ('e0000000-0000-4000-8000-000000000002', 'novedades', 'Novedades', 'Lo último en llegar a Shopy', 20);

insert into public.collection_products (collection_id, product_id, sort_order) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 10),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006', 20),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000012', 30),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000020', 40),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000020', 10),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000019', 20),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000018', 30),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000017', 40);

-- ----------------------------------------------------------------------------
-- Tarifas de despacho administrables (MVP)
-- ----------------------------------------------------------------------------
insert into public.shipping_rates (id, region, comuna, carrier, price_clp, eta_days_min, eta_days_max) values
  ('f0000000-0000-4000-8000-000000000001', 'Metropolitana', null, 'Starken',     2990, 1, 2),
  ('f0000000-0000-4000-8000-000000000002', 'Metropolitana', null, 'Chilexpress', 3990, 1, 2),
  ('f0000000-0000-4000-8000-000000000003', 'Valparaíso',    null, 'Starken',     4490, 2, 3),
  ('f0000000-0000-4000-8000-000000000004', 'Valparaíso',    null, 'Chilexpress', 4990, 1, 2),
  ('f0000000-0000-4000-8000-000000000005', 'Biobío',        null, 'Starken',     5490, 2, 4),
  ('f0000000-0000-4000-8000-000000000006', 'Biobío',        null, 'Chilexpress', 5990, 2, 3),
  ('f0000000-0000-4000-8000-000000000007', 'Araucanía',     null, 'Starken',     5990, 3, 4),
  ('f0000000-0000-4000-8000-000000000008', 'Los Lagos',     null, 'Chilexpress', 6990, 3, 5),
  ('f0000000-0000-4000-8000-000000000009', 'OTRAS',         null, 'Starken',     7490, 3, 6),
  ('f0000000-0000-4000-8000-000000000010', 'OTRAS',         null, 'Chilexpress', 7990, 2, 5);

-- ----------------------------------------------------------------------------
-- Cupones
-- ----------------------------------------------------------------------------
insert into public.discounts (id, code, kind, value, min_subtotal_clp, usage_limit, starts_at) values
  ('b0000000-0000-4000-8000-000000000001', 'BIENVENIDA10', 'percent', 10,   19990, 500, now() - interval '1 day'),
  ('b0000000-0000-4000-8000-000000000002', 'VINTAGE5K',    'fixed',   5000, 29990, 100, now() - interval '1 day');

-- ----------------------------------------------------------------------------
-- Home (el admin decide destacados vía config / is_featured)
-- ----------------------------------------------------------------------------
insert into public.home_sections (id, key, title, config, sort_order) values
  ('b0000000-0000-4000-8000-000000000011', 'hero', 'Héroe principal',
   '{"title": "Segunda mano, primera opción", "subtitle": "Prendas únicas seleccionadas en Chile", "ctaLabel": "Ver novedades", "ctaHref": "/novedades"}', 10),
  ('b0000000-0000-4000-8000-000000000012', 'newcomers', 'Recién llegados', '{"limit": 8, "order": "novedades"}', 20),
  ('b0000000-0000-4000-8000-000000000013', 'trending', 'Tendencias', '{"limit": 8, "order": "tendencia"}', 30),
  ('b0000000-0000-4000-8000-000000000014', 'featured-brands', 'Marcas destacadas',
   '{"brands": ["levis", "nike", "adidas", "zara", "lacoste"]}', 40),
  ('b0000000-0000-4000-8000-000000000015', 'shopy-picks', 'Selección Shopy', '{"collection": "novedades", "limit": 4}', 50),
  ('b0000000-0000-4000-8000-000000000016', 'offers', 'Ofertas', '{"collection": "ofertas", "limit": 8}', 60);

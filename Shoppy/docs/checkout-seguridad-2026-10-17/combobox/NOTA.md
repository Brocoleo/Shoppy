# Corrección de apertura de región y comuna

El usuario informó que el menú se cerraba inmediatamente. Se observó cierre sin selección en el control nativo del checkout del servidor 3001 desde el navegador integrado. Las opciones sí existían y el DOM habilitaba correctamente la comuna tras seleccionar región. Un HTML mínimo sin React mantuvo el menú abierto; por tanto no se atribuye el fallo de forma concluyente al navegador entero ni a la carga de datos. El cierre era intermitente y las pruebas anteriores de selección programática no cubrían esta interacción.

Se sustituyen exclusivamente región y comuna por `AddressSelect`: un desplegable DOM controlado con roles combobox/listbox/option, selección con clic, flechas, Home/End, letras, Enter, Escape y Tab. Mantiene foco visible, relación con etiquetas/errores, selección previa y valores antiguos corregibles. Cambiar región limpia comuna; elegir la misma región no la borra. No hay dependencias nuevas.

Verificación directa mediante el navegador integrado:

- Clic abre región y el menú permanece abierto entre observaciones y captura.
- Seleccionar Metropolitana habilita las comunas; Santiago se conserva al repetir la misma región.
- Buscar Ñuble por teclado y confirmar limpia la comuna; su lista contiene Chillán.
- Escape cierra y conserva foco/valor. Tab cierra y avanza al botón de continuar.
- Datos ficticios de prueba permiten avanzar a despacho con Santiago, Metropolitana; no se crean pedidos ni pagos.
- Compilación final en copia aislada y verificación del menú abierto en `http://localhost:3015/checkout`.
- Ancho efectivo observado en la sesión integrada: 319 px, sin desbordamiento. Las peticiones de emular 390/1440 no cambiaron ese ancho efectivo; no se presentan como pruebas a esos tamaños.
- TypeScript web, ESLint, `git diff --check` y las 56 pruebas focalizadas pasan. Logs adjuntos. No se repitió axe sobre el nuevo control; los resultados anteriores no certifican este cambio.

Se actualiza el arnés `browser-check.cjs` para seleccionar opciones con clic y leer el nuevo control, manteniendo compatibilidad con el selector nativo histórico. No se afirma haber repetido la suite completa de navegador en esta ronda: se documentan las interacciones directas anteriores.

La vista aislada 3015 está actualizada. El servidor habitual 3001 no se reinició y sigue sirviendo su compilación anterior. Sin commits ni cambios remotos. La sesión del navegador contiene únicamente una prenda de prueba en carrito y datos de formulario ficticios; no se guardó dirección en Supabase.

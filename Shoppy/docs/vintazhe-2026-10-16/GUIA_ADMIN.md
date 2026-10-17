# Usar el admin de vinta.zhe

Vista local: [http://localhost:3002](http://localhost:3002). Tienda: [http://localhost:3001](http://localhost:3001).

Se entra con el email y la contraseña de una cuenta administradora existente. No se usan las claves API como contraseña. Esta intervención no creó cuentas ni cambió roles.

## Subir una prenda desde el celular

1. En **Productos**, pulsa **Nuevo producto**. Completa nombre y datos reales. La dirección de la ficha se genera a partir del nombre; puedes cambiarla si lo necesitas.
2. Confirma precio, stock, estado, talla y categoría. El precio anterior es opcional y debe ser mayor que el precio actual. No rellenes datos de venta a partir de una fotografía antigua sin verificarlos.
3. Pulsa **Guardar datos y continuar**. La prenda se guarda como borrador y pasa a **Fotos**.
4. Selecciona una o varias fotos de la galería del teléfono. Se muestran previsualizaciones y progreso. Se optimizan antes de subir; si una falla, **Reintentar** conserva las que ya se completaron.
5. Elige la portada, ajusta el orden y marca las fotos de detalles cuando corresponda. No puedes eliminar la última fotografía de una prenda publicada sin retirarla antes de la web.
6. En **Revisión**, confirma los datos guardados. **Publicar producto** requiere nombre, precio positivo, stock, disponibilidad AVAILABLE y una fotografía de portada. Los productos ficticios anteriores no se pueden republicar desde este flujo.
7. Para retirar una prenda sin eliminarla, usa **Retirar de la web y guardar como borrador**. Editar datos ordinarios conserva su fecha de publicación. Si otra sesión la modificó, el admin pide recargar antes de sobrescribir.

Las fotos de origen pueden tener hasta 30 MB; la copia optimizada debe quedar por debajo de 5 MB. Se usan las capacidades del navegador. Si no puede abrir HEIC u otro formato, el admin pide exportar la foto a JPG, PNG o WebP; no simula una conversión que no pudo hacer.

Si vas a incluir una prenda en **Ofertas**, el editor existente de **Colecciones** permite añadirla a esa colección por su dirección/slug. Un precio anterior, por sí solo, no modifica la pertenencia a una colección.

## Cambiar la portada

Abre **Home** en la navegación del admin:

- Edita las dos líneas del titular y el texto y destino del enlace.
- Elige las fotos del archivo o sube una desde tu teléfono.
- Usa **Foto completa** para conservar toda la imagen. **Llenar encuadre** permite recortar visualmente; elige centro, arriba o abajo.
- La fotografía secundaria se muestra solo en escritorio.
- Pulsa **Guardar portada** y recarga la tienda para ver el resultado.

Guardar varias veces conserva la versión actual. Un cambio simultáneo desde otra sesión produce un aviso y no sobrescribe silenciosamente su trabajo. Un evento de sesión del mismo usuario tampoco reinicia el borrador.

## Gestionar el archivo

En la misma pantalla puedes editar títulos y activar **Mostrar en catálogo** para cada publicación. **Guardar archivo** conserva las fotografías y su procedencia. No convierte ninguna entrada en una prenda disponible para compra.

Las entradas de archivo no tienen precio, talla, condición ni stock comercial. Para vender una prenda verificada, crea un producto con sus datos reales mediante el flujo anterior.

## Antes de vender

El diseño y el contenido nuevos están disponibles localmente. No se desplegó esta versión. Las escrituras de contenido en Supabase sí son remotas; la web publicada anterior puede reflejar la retirada de los demos antes de recibir el nuevo diseño.

Checkout sigue pendiente de corrección y verificación integrada. No se hicieron pedidos ni pagos reales y esta entrega no certifica una tienda operativa para cobrar.

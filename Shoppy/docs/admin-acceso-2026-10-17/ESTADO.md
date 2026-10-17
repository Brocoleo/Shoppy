# Admin publicado e invitación inicial — 17 de octubre de 2026

## Resultado actual

Admin independiente publicado: **https://vinta-admin-inky.vercel.app**.

El usuario autorizó expresamente crear/publicar `vinta-admin` en **Leandro Miranda's projects**, añadir el retorno HTTPS exacto a Supabase y completar la invitación. La tienda `shopy-web` no se desplegó ni se modificó. No hubo commits, pedidos ni pagos.

Supabase aceptó el envío de la invitación a **leomir2656@gmail.com**. Se verificaron por separado el usuario de Auth y su perfil: el ID y el correo coinciden y el rol es `admin`. En la comprobación final el correo todavía no estaba confirmado; el usuario debe abrir su invitación y definir la contraseña. No se abrió ni consumió su enlace y no se conoce ni registra su contraseña. No se ha comprobado entrega en bandeja, lectura del correo ni una sesión administradora real.

## Despliegue

- Proyecto: `vinta-admin`; equipo: `leandro-mirandas-projects`.
- Deploy final: `dpl_AiCQ4HWos1CtCv5x2MpLjfWx8MvV`, estado **READY**.
- Raíz Vercel: `Shoppy/apps/admin`; archivos compartidos fuera de la raíz habilitados.
- Instalación: `cd ../.. && npm ci`; build: `npm run build -- --webpack`; salida `.next`.
- Solo se configuraron `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, en producción y preview. No se subió una clave secreta de Supabase al admin.
- Snapshot aislado de 58 archivos: admin, paquetes compartidos y manifests/lockfile. Sin otros proyectos del usuario, `.env`, dependencias instaladas o enlace `.vercel` de la tienda. No hay integración Git automática.
- Login y `/acceso` responden HTTPS 200 sin requerir una sesión Vercel. Las rutas del panel redirigen al login sin sesión. La protección del panel depende del rol Supabase y RLS.
- `noindex, nofollow` está en los metadatos; `X-Robots-Tag: noindex, nofollow, noarchive` se comprobó en la respuesta publicada. El header se aplica desde Next.js del admin, porque la configuración Vercel anidada no lo propagó en el primer deploy funcional.

El conector MCP no tenía permiso para este equipo y devolvió 403. Se utilizó su fallback CLI con la identidad y el equipo correctos. El primer build remoto falló porque la raíz de monorepo no exponía el package.json del admin a la detección de Next.js; se corrigió únicamente el proyecto nuevo y se volvió a desplegar. El despliegue final compiló correctamente. La configuración reproducible está en `deploy/admin.vercel.json`.

## Cambio de Auth e invitación

Se añadió únicamente `https://vinta-admin-inky.vercel.app/acceso` a los retornos permitidos. Se conservaron el retorno `http://localhost:3000` y el Site URL existente. No se cambiaron plantillas, SMTP, políticas, esquema ni otras opciones de autenticación.

La plantilla existente utiliza `ConfirmationURL`. El script `supabase/seed/make-admin.mjs` verificó proyecto, destinatario y retorno exactos, pantalla publicada y ausencia de duplicado antes de enviar. No usa correo ni contraseña por defecto. El rol se asignó exclusivamente al ID/correo del perfil creado por la invitación y se releyó para verificarlo. La operación no se repitió para enviar otro correo.

La pantalla `/acceso` verifica la sesión con Supabase antes de actualizar la contraseña, exige rol admin, retira parámetros/fragmentos del historial y no acepta roles de la URL. Una contraseña de al menos 12 caracteres y su repetición deben coincidir. Enlaces vencidos, roles incorrectos y fallos del servicio tienen estados explícitos. La contraseña se envía directamente a Supabase y no se guarda en almacenamiento de la aplicación.

Si el correo no aparece, revisar spam antes de pedir otro envío. No utilizar contraseñas ni claves de API del proyecto para entrar al formulario.

## Verificación

- Seis pruebas nativas del proceso de invitación: simulación sin correo, URL HTTPS exacta, repetición sin duplicados, rechazo de cuentas confirmadas ajenas, identidad de perfil y recuperación de fallo parcial de rol.
- Diez comprobaciones de navegador con autenticación simulada: enlace inválido, rol customer, formulario admin, validación, error de servicio/reintento, guardado, ausencia de contraseña en almacenamiento y sesión vencida en servidor.
- Cuatro vistas locales a 320/390/768/1440 px: sin desbordamiento ni infracciones automáticas de axe.
- TypeScript admin y ESLint: correctos. Build final remoto: correcto.
- Navegador real contra el dominio publicado, a 390/1440 px: rutas privadas redirigen a login, acceso sin sesión no presenta formulario, sin errores JavaScript ni fallos de assets capturados. No se usó la invitación del usuario para probar.
- Verificación independiente de Auth y perfil: correo/ID coincidentes, invitado y rol admin. Confirmación del correo pendiente en el momento registrado.

[Evidencias](evidence/): configuración final sin valores de entorno, resultado de invitación sin tokens, cambio de retornos, logs de build/pruebas y capturas. No contienen contraseñas ni claves secretas.

## Límites pendientes

La entrega/aceptación del correo, definición de contraseña y primer acceso real requieren la acción del usuario. La tienda sigue sin certificación de checkout/pagos. La rotación de la clave secreta expuesta antes en el chat continúa pendiente; no se rotó automáticamente para no romper entornos que la utilicen.

Fuentes oficiales: [invitaciones](https://supabase.com/docs/guides/auth/users), [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [retornos permitidos](https://supabase.com/docs/guides/auth/redirect-urls) y [actualizar contraseña](https://supabase.com/docs/reference/javascript/auth-updateuser).

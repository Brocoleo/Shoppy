# Admin independiente de vinta.zhe

Publicado con autorización el 17 de octubre de 2026: **https://vinta-admin-inky.vercel.app**.

- Equipo: `leandro-mirandas-projects`.
- Proyecto: `vinta-admin`. No reutilizar ni modificar el enlace del proyecto `shopy-web`.
- Raíz Vercel: `Shoppy/apps/admin`; se incluyen paquetes compartidos fuera de la raíz.
- Instalar: `cd ../.. && npm ci` desde la raíz del proyecto Vercel.
- Construir: `npm run build -- --webpack`; salida `.next`.
- Variables: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Ninguna clave secreta del proyecto está en este hosting. Los puentes de pagos quedan fuera de esta puesta en marcha.
- Metadatos y `X-Robots-Tag` impiden indexación; la autorización sigue dependiendo de Supabase y RLS.

## Próximos despliegues

Usar una copia aislada con solo el admin, paquetes compartidos y manifests del monorepo. Ejecutar la CLI desde su raíz, que contiene `Shoppy/`, con:

```sh
vercel deploy --prod --yes --project vinta-admin --scope leandro-mirandas-projects --cwd /ruta/a/copia-aislada --local-config /ruta/a/copia-aislada/Shoppy/deploy/admin.vercel.json
```

Cada publicación requiere autorización. No copiar `.env`, claves, `.git`, dependencias instaladas ni otros proyectos. No usar la configuración `vercel.json` de la raíz del repositorio original: corresponde a la tienda. No conectar despliegues Git automáticos sin configurar por separado su raíz.

La copia temporal usada en esta ronda fue `/tmp/vinta-admin-release`; no se garantiza su conservación. Los fuentes siguen en `apps/admin`, y la configuración explícita en `deploy/admin.vercel.json`. `apps/admin/next.config.ts` define el header noindex.

El retorno exacto permitido en Supabase es `https://vinta-admin-inky.vercel.app/acceso`. Se conservaron el Site URL y los retornos anteriores. Una nueva URL requiere añadir explícitamente su retorno antes de invitar.

Para el acceso se envió la invitación autorizada y se verificó su perfil administrador. No compartir contraseñas en el chat ni usar las claves de API en el login. El estado y las limitaciones del primer acceso están en [el informe](../docs/admin-acceso-2026-10-17/ESTADO.md).

Fuentes: [opción local-config](https://vercel.com/docs/cli/global-options), [build](https://vercel.com/docs/builds/configure-a-build) y [monorepos](https://vercel.com/docs/monorepos).

# Autocompletar producto con IA (visión)

Fecha: 2026-10-18
Estado: desplegado (`producto-ia`). Falta la llave de Gemini (gratis) para activarlo.

## Qué hace

En **Administración → Productos → Nuevo producto** (o al editar uno) hay un panel
**“Completar con IA (opcional)”**. Subes la foto cruda de la prenda y el sistema:

1. Reduce la foto en el navegador (máximo 1400 px, sin recortar, WebP). No se
   sube nada al almacenamiento: solo se usa para el análisis.
2. La envía al edge function `producto-ia`, que exige sesión de **admin**.
3. Gemini (visión) devuelve un JSON con marca, tipo, categoría, color, estado,
   talla (si es legible), descripción y tags.
4. El formulario **rellena solo los campos vacíos**; avisa qué completó y qué no
   tocó. Tú revisas y corriges antes de guardar.

La IA **nunca** inventa lo que no ve: si no lee la marca o la talla, devuelve
`null`. Todo queda marcad como borrador editable.

## Activarlo (una sola vez, gratis)

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta Google.
2. **Create API key**. Copia la llave.
3. Guárdala como secreto del proyecto (nunca en el repo):

   ```bash
   supabase secrets set GEMINI_API_KEY="tu-llave" --project-ref evzlqwiipdjgtrqjlwba
   ```

Con eso queda operativo. Si la llave falta, el panel muestra
“Falta la llave GEMINI_API_KEY…”.

## Modelos y costo

- El function prueba modelos **Flash gratuitos** en orden:
  `gemini-3.8-flash`, `gemini-flash-latest`, `gemini-3.6-flash`,
  `gemini-3.5-flash-lite`, `gemini-2.5-flash`. El primero que responde se usa.
- Puedes fijar uno con otro secreto: `GEMINI_MODEL="gemini-3.8-flash"`.
- **Costo: $0** (capa gratuita de Flash; los modelos Pro son pagados y no se usan).
- Límite interno: 20 análisis por minuto por IP.

## Privacidad

La capa gratuita de Google puede usar el contenido enviado para mejorar sus
productos. **No subas fotos con datos sensibles** (documentos, rostros de
terceros, etc.). Son fotos de prendas; con eso basta.

## Verificación

- `POST` sin sesión o con JWT inválido → `401`.
- Sesión sin rol admin → `403`.
- Admin sin llave Gemini → `503 NOT_CONFIGURED` (comprobado con un admin
  temporal, eliminado tras la prueba).
- Admin con llave → `{ model, fields }` (pendiente: requiere la llave).

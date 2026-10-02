# AGENT_SKILLS — Set de skills de Shopy

> 6 skills, una por categoría, sin redundancia. Instaladas **vendorizadas
> verbatim** en `.opencode/skills/` (scope proyecto, sin instaladores de
> terceros, sin cambios globales, sin tocar toolchain). Verificadas:
> frontmatter válido (`name` == directorio, `description` ≤ 1024),
> 0 links internos rotos, 0 scripts/binarios, 0 `curl | bash`.
> OpenCode las detecta al (re)iniciar la sesión vía el tool `skill`.

## Tabla

| Categoría | Skill | Repositorio | Scope | Motivo de selección | Cuándo usarla | Estado |
|---|---|---|---|---|---|---|
| Supabase/Postgres/RLS | `supabase` | `supabase/agent-skills` (oficial, v0.1.2) | `.opencode/skills/supabase/` | Oficial; checklist RLS/SECURITY DEFINER inline; obliga a verificar contra docs y changelog | Cualquier tarea que toque migraciones, policies, funciones SQL, Storage, Auth o Edge Functions | ✅ |
| React Native/Expo | `expo-data-fetching` | `expo/skills` (oficial, MIT, v1.0.0) | `.opencode/skills/expo-data-fetching/` | Cubre exactamente el stack de datos de Shopy: TanStack Query, offline, AbortController, estados loading/error/empty, `EXPO_PUBLIC_` | Networking, hooks de query, offline, pantallas con 4 estados | ✅ |
| Next.js/React | `vercel-react-best-practices` | `vercel-labs/agent-skills` (oficial, MIT) | `.opencode/skills/vercel-react-best-practices/` | 70 reglas priorizadas por impacto (waterfalls, bundle, RSC); la guía `next-best-practices` ya no existe como skill (vive en docs de Next) | Escribir/revisar componentes, data fetching, bundle del admin | ✅ |
| Security | `api-security-review` | `OWASP/secure-agent-playbook` (OWASP, CC-BY-4.0) | `.opencode/skills/api-security-review/` (+ `plays/`) | OWASP API Top 10: BOLA/IDOR, auth, rate-limit, SSRF, replay — justo el perfil de `checkout`/`notify` + webhooks MP | Auditorías de Edge Functions, webhooks, roles admin, Storage | ✅ |
| Testing | `test-driven-development` | `obra/superpowers` (MIT) | `.opencode/skills/test-driven-development/` | Disciplina RED-GREEN-REFACTOR agnóstica al framework; vale para Deno + PG efímero sin imponer runner | Nuevas features, bugfixes, tests de regresión | ✅ |
| Architecture | `pr-review` | `weisser-dev/awesome-opencode` (MIT, `compatibility: opencode`) | `.opencode/skills/pr-review/` | Única candidata nativa OpenCode sin dependencias rotas; formato por severidad con `file:line` | Revisar diffs antes de validar, detectar duplicación entre apps | ✅ |

## Detalle por skill

### 1. `supabase`
- **Objetivo:** que el agente use Supabase como Supabase manda: docs antes que
  memoria, checklist de seguridad inline, verificación con query real.
- **Fortalezas:** trampas RLS documentadas (`TO authenticated` sin `USING` =
  IDOR; UPDATE necesita SELECT + `WITH CHECK`; `SECURITY DEFINER` en `public`
  es API pública; vistas con `security_invoker`; `service_role` jamás al
  frontend). Flujo de migraciones imperativas (`db pull`, advisors).
- **Invocar:** migraciones, policies, triggers, `profiles`/`orders`/
  `order_items`/`reservations`/`discount_codes`/`shipping_rates`/`shipments`/
  `order_notifications`/`notification_log`, bucket `product-images`, Auth.
- **NO invocar:** UI mobile/admin, lógica de pagos mock, docs de negocio.
- **Archivos Shopy:** `supabase/migrations/`, `supabase/tests/rls_tests.sql`,
  `supabase/functions/`, `supabase/config.toml`.
- **Limitaciones:** orientada a Supabase Cloud + MCP; en local usar PG efímero
  y `supabase db reset` como hasta ahora. No trae tests RLS: los nuestros
  (`rls_tests.sql`) siguen mandando.

### 2. `expo-data-fetching`
- **Objetivo:** networking correcto en RN: fetch con errores tipados,
  React Query con caché, offline-first, cancelación, 4 estados por pantalla.
- **Fortalezas:** regla "loading ≠ empty", `isLoading` vs `isFetching`,
  skeletons, `RefreshControl`, `SecureStore` para tokens, `EXPO_PUBLIC_`
  solo para valores públicos (alineado con nuestra regla de secretos).
- **Invocar:** `src/query/hooks.ts`, `src/lib/checkout.ts`, pantallas con
  `useQuery/useMutation`, estados offline/timeout, `EmptyState`/`Skeletons`.
- **NO invocar:** navegación (`expo-router` aún no instalado — candidato a
  ampliación futura), animaciones, builds EAS, listas virtuales en sí.
- **Archivos Shopy:** `apps/mobile/src/query/*`, `apps/mobile/src/lib/*`,
  `apps/mobile/src/components/EmptyState.tsx`, `Skeletons.tsx`.
- **Limitaciones:** prefiere `expo/fetch` sobre axios (no usamos ninguno:
  seguimos con `fetch` estándar). El comando `submit-expo-feedback` del
  final **no se ejecuta** sin pedirlo explícitamente.

### 3. `vercel-react-best-practices`
- **Objetivo:** React/Next performante con reglas priorizadas por impacto.
- **Fortalezas:** CRITICAL primero (waterfalls con `Promise.all`, barrel
  imports, `next/dynamic`); reglas server (`server-auth-actions`,
  `server-no-shared-module-state`) útiles para route handlers del admin.
- **Invocar:** componentes/páginas del admin, data fetching, revisión de
  bundle, RSC vs Client Component boundaries.
- **NO invocar:** mobile (es web; para RN está `expo-data-fetching`),
  SQL, Edge Functions Deno.
- **Archivos Shopy:** `apps/admin/`.
- **Limitaciones:** 70 reglas = contexto pesado; leer solo `SKILL.md` +
  la regla puntual (`rules/*.md`), no `AGENTS.md` completo (108 KB).
  Algunas reglas asumen despliegue Vercel; filtrar con criterio.

### 4. `api-security-review`
- **Objetivo:** auditoría contra OWASP API Top 10 con escenarios de ataque
  y roadmap de remediación. El play completo vive en `plays/`.
- **Fortalezas:** BOLA/IDOR, BFLA (admin), consumo de recursos (rate-limit),
  consumo inseguro (replay en webhooks = nuestro caso MP).
- **Invocar:** `checkout` (quote/create/confirm/webhook), `notify`,
  `verifyMercadoPagoSignature`, roles admin, policies de Storage,
  `order_notifications` (idempotencia), secretos en `.env.example`.
- **NO invocar:** como escáner automático contra producción (paso 4 propone
  ZAP/Burp: solo opt-in y contra local/staging, nunca prod sin aviso).
- **Archivos Shopy:** `supabase/functions/*`, `supabase/migrations/
  20260929000004_hardening.sql`, `docs/SECURITY.md`, `.env.example`.
- **Limitaciones:** complementa (no duplica) a `supabase`: la skill de
  Supabase cubre RLS/datos, esta cubre la capa HTTP/API. Requiere
  atribución CC-BY-4.0 (ver pie).

### 5. `test-driven-development`
- **Objetivo:** disciplina de test-first: failing test → mínimo código →
  refactor, con criterios de buenos tests (comportamiento real, no mocks).
- **Fortalezas:** agnóstica al runner (aplica a `deno test`, SQL efímero y
  `tsc`); "si no lo viste fallar, no prueba nada"; exige correr la suite
  completa, no solo el archivo tocado.
- **Invocar:** nuevas funciones de `checkout`/`notify`, regresiones,
  fixes de RLS (test en `rls_tests.sql` primero), providers.
- **NO invocar:** para reescribir suites estables existentes (23 SQL, 13
  Deno, smoke 11/11 se mantienen; solo se extienden). Prototipos
  desechables: preguntar antes.
- **Archivos Shopy:** `supabase/tests/`, `supabase/functions/*_test.ts`,
  `scripts/smoke_fase6.mjs`.
- **Limitaciones:** doctrina estricta ("borra el código sin test"); aplicar
  con juicio en refactors grandes: failing test primero, pero sin
  ceremonias que bloqueen.

### 6. `pr-review`
- **Objetivo:** revisión estructurada de diffs con checklist y severidades
  (Critical/Warning/Suggestion) + `file:line` + diff sugerido.
- **Fortalezas:** nativa OpenCode, cero dependencias, checklist
  calidad/seguridad/testing/performance/docs en una pasada.
- **Invocar:** antes de dar por terminado cualquier cambio (sustituto de
  "PR" en nuestro flujo sin commits), para cazar duplicación entre
  `apps/mobile`, `apps/admin`, `supabase/functions` y `docs`.
- **NO invocar:** como arquitecto de refactors (solo reporta; el diseño lo
  decides tú); no convertir todo en paquete shared (regla explícita del
  proyecto: boundaries sí, shared innecesario no).
- **Archivos Shopy:** diffs en `apps/`, `supabase/`, `packages/` si aparece.
- **Limitaciones:** genérica y PR-céntrica; el contexto Shopy
  (anon-key lectura, escrituras vía Edge Functions, CLP, es-CL) lo aporta
  este documento + `AGENTS.md`, no la skill.

## Candidatas descartadas (comparativa)

| Candidata | Por qué perdió |
|---|---|
| `supabase-postgres-best-practices` | Solo performance; el checklist de seguridad vive en `supabase`. Una skill, no dos. |
| `expo-overview` / `expo-router` | Router/gate hacia otras skills; con una sola skill instalada, `expo-data-fetching` da más valor directo al stack real (Query + offline). Ampliación futura si hace falta navegación. |
| `vercel-react-native-skills` | Reglas genéricas de terceros vs skill oficial Expo mantenida por el vendor. |
| `next-best-practices` | Ya no existe como skill (movida a docs bund
...[truncated 2085 chars]
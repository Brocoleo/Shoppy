#!/usr/bin/env bash
# setup-vercel-env.sh — sube las variables de un archivo .env a Vercel.
#
# Uso:
#   ./scripts/setup-vercel-env.sh [archivo] [entorno] [--dry-run]
#
#   archivo   Ruta al .env (default: .env.production)
#   entorno   production | preview | development (default: production)
#
# Requisitos:
#   - Vercel CLI (`npm i -g vercel` o `npx vercel`).
#   - Proyecto ya linkeado (.vercel/project.json) o pasar --scope/--cwd.
#
# NO imprime valores (evita filtrar secretos). Solo lista las claves.
set -euo pipefail

FILE="${1:-.env.production}"
TARGET="${2:-production}"
DRY_RUN="false"
for arg in "$@"; do [ "$arg" = "--dry-run" ] && DRY_RUN="true"; done

if [ ! -f "$FILE" ]; then
  echo "✗ No existe el archivo: $FILE" >&2
  echo "  Copia el template:  cp .env.production.example .env.production" >&2
  exit 1
fi

VC="vercel"
if ! command -v vercel >/dev/null 2>&1; then
  echo "· vercel no está en PATH; usando 'npx vercel'."
  VC="npx --yes vercel"
fi
if ! command -v vercel >/dev/null 2>&1 && ! command -v npx >/dev/null 2>&1; then
  echo "✗ Falta Vercel CLI y npx. Instala: npm i -g vercel" >&2
  exit 1
fi

# Verifica que el proyecto esté linkeado (salvo dry-run).
if [ "${VC}" = "vercel" ] && [ "$DRY_RUN" = "false" ] && [ ! -f .vercel/project.json ]; then
  echo "✗ El proyecto no está linkeado. Ejecuta 'vercel link' primero." >&2
  exit 1
fi

echo "→ Entorno Vercel: $TARGET"
echo "→ Archivo:        $FILE"
echo

count=0
while IFS= read -r raw || [ -n "$raw" ]; do
  # Ignora vacías y comentarios.
  line="${raw%$'\r'}"
  case "$line" in ''|'#'*) continue ;; esac
  case "$line" in *=*) ;; *) continue ;; esac

  key="${line%%=*}"
  value="${line#*=}"
  key="$(printf '%s' "$key" | tr -d '[:space:]')"

  # Ignora claves sin nombre o valores vacíos (no se suben "vacíos").
  [ -z "$key" ] && continue
  if [ -z "$value" ]; then
    echo "· omitida (vacía): $key"
    continue
  fi

  count=$((count + 1))
  printf '  [%02d] %-32s %s\n' "$count" "$key" "$TARGET"

  if [ "$DRY_RUN" = "true" ]; then
    continue
  fi

  # Sobrescribe sin prompt: el valor entra por stdin.
  printf '%s' "$value" | $VC env add "$key" "$TARGET" --force >/dev/null
done < "$FILE"

echo
if [ "$DRY_RUN" = "true" ]; then
  echo "✓ Dry-run: $count variable(s) se subirían a '$TARGET'. Nada se envió."
else
  echo "✓ Listo: $count variable(s) configuradas en Vercel ('$TARGET')."
  echo "  Redeploy para que apliquen en build:  vercel --prod"
fi

#!/usr/bin/env bash
# Invoca la función de medición `t2-medicion` N veces por caso y calcula p50, p95 y p99
# (puerta T2 de la fase 5). Sirve para la función desplegada y para `supabase functions serve`.
#
# Uso:
#   scripts/t2-invocar.sh <url-de-la-función> <clave-publicable> [N] [casos]
#   T2_URL=... T2_KEY=... scripts/t2-invocar.sh            # lo mismo, por variables de entorno
#
#   url    https://<ref>.supabase.co/functions/v1/t2-medicion
#   clave  la publicable (sb_publishable_...): va en la cabecera `apikey`
#   N      invocaciones por caso (por defecto 20)
#   casos  lista separada por comas (por defecto todos:
#          importar,codecs,subida,etapa,validar,validar-ruido,cruzada,cuerpo)
#
# Opcionales, solo por entorno:
#   T2_JWT     token de acceso de una usuaria (Authorization: Bearer)
#   T2_TOKEN   si a la función se le puso el secreto T2_TOKEN, su valor (cabecera x-t2-token)
#   T2_JSON    archivo donde guardar el resultado completo (por defecto, ninguno)
#   T2_DOCKER  contenedor del edge-runtime local para medir CPU por cgroup (solo en local),
#              p. ej. supabase_edge_runtime_loopitalab
#
# La clave y los tokens no se escriben en ningún archivo ni se imprimen. Requiere Node >= 22.18.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

url="${1:-${T2_URL:-}}"
key="${2:-${T2_KEY:-}}"
n="${3:-${T2_N:-20}}"
casos="${4:-${T2_CASOS:-importar,codecs,subida,etapa,validar,validar-ruido,cruzada,cuerpo}}"

if [[ -z "$url" ]]; then
  echo "Falta la URL de la función (primer argumento o T2_URL)." >&2
  exit 2
fi
if [[ -z "$key" && -z "${T2_JWT:-}" ]]; then
  echo "Falta la clave publicable (segundo argumento o T2_KEY) o un T2_JWT." >&2
  exit 2
fi

args=(--url "$url" --n "$n" --casos "$casos")
[[ -n "${T2_JSON:-}" ]] && args+=(--json "$T2_JSON")
[[ -n "${T2_DOCKER:-}" ]] && args+=(--docker-cpu "$T2_DOCKER")

# La clave viaja al proceso hijo por el entorno, no por la línea de comandos (no queda en `ps`).
T2_KEY="$key" exec node "$here/t2/medir.ts" "${args[@]}"

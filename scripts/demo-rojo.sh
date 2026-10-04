#!/usr/bin/env bash
# demo-rojo.sh — regla 15 del kit (kit v1.35.0): un gate se demuestra FALLANDO, con candado.
#
# Aplica UNA mutación deliberada a un archivo, corre el gate, exige que el gate falle, restaura el
# archivo desde una ÚNICA carpeta de respaldo y verifica con grep que la mutación ya no está.
# Origen: ds S5 (K-S5-8/10/11) — una demo «en rojo» que nunca se puso roja, un respaldo guardado en
# otra carpeta que dejó la mutación viva, y un server viejo que seguía sirviendo en el puerto.
#
# Uso:
#   scripts/demo-rojo.sh --archivo <ruta> --buscar '<texto exacto>' --reemplazar '<texto>' \
#       --gate '<comando que debe FALLAR>' [--puerto 3000] [--esperar-verde '<comando tras restaurar>']
#
# Salida: 0 si el gate falló con la mutación y volvió a pasar (o no se pidió) tras restaurar;
#         1 si el gate NO falló (la demo no es demo), si la restauración dejó rastro, o si el
#         puerto sigue ocupado por un proceso viejo.
set -u

archivo="" buscar="" reemplazar="" gate="" puerto="" verde=""
while [ $# -gt 0 ]; do
  case "$1" in
    --archivo) archivo="$2"; shift 2;;
    --buscar) buscar="$2"; shift 2;;
    --reemplazar) reemplazar="$2"; shift 2;;
    --gate) gate="$2"; shift 2;;
    --puerto) puerto="$2"; shift 2;;
    --esperar-verde) verde="$2"; shift 2;;
    *) echo "demo-rojo: argumento desconocido $1" >&2; exit 1;;
  esac
done
[ -n "$archivo" ] && [ -n "$buscar" ] && [ -n "$gate" ] || { echo "demo-rojo: faltan --archivo, --buscar o --gate" >&2; exit 1; }
[ -f "$archivo" ] || { echo "demo-rojo: no existe $archivo" >&2; exit 1; }
grep -qF -- "$buscar" "$archivo" || { echo "demo-rojo: '$buscar' no está en $archivo — la mutación no aplica a nada" >&2; exit 1; }

# UNA sola carpeta de respaldo, nombrada aquí y solo aquí (K-S5-10).
RESPALDO="${DEMO_ROJO_DIR:-.demo-rojo}"
mkdir -p "$RESPALDO"
copia="$RESPALDO/$(echo "$archivo" | tr '/' '_').orig"
cp "$archivo" "$copia"

restaurar() {
  cp "$copia" "$archivo"
  if [ -n "$reemplazar" ] && grep -qF -- "$reemplazar" "$archivo" && ! grep -qF -- "$reemplazar" "$copia"; then
    echo "demo-rojo: ✗ la restauración dejó la mutación en $archivo" >&2; return 1
  fi
  cmp -s "$copia" "$archivo" || { echo "demo-rojo: ✗ $archivo no quedó idéntico al respaldo" >&2; return 1; }
  rm -f "$copia"; rmdir "$RESPALDO" 2>/dev/null || true
  return 0
}

# Server viejo en el puerto: se mata POR PUERTO, no por nombre de proceso (K-S5-11).
if [ -n "$puerto" ]; then
  pids=$(lsof -ti ":$puerto" 2>/dev/null || true)
  if [ -n "$pids" ]; then echo "demo-rojo: matando proceso(s) en :$puerto → $pids"; kill $pids 2>/dev/null || true; sleep 1; fi
  if lsof -ti ":$puerto" >/dev/null 2>&1; then echo "demo-rojo: ✗ el puerto $puerto sigue ocupado (EADDRINUSE seguro)" >&2; restaurar; exit 1; fi
fi

# Mutación (reemplazo literal, sin regex) con Python para no pelear con sed en macOS/Linux.
python3 - "$archivo" "$buscar" "$reemplazar" <<'PY'
import sys, pathlib
p, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
s = pathlib.Path(p).read_text()
pathlib.Path(p).write_text(s.replace(a, b, 1))
PY

echo "demo-rojo: mutación aplicada en $archivo; corriendo el gate (debe FALLAR)…"
if bash -c "$gate"; then
  echo "demo-rojo: ✗ EL GATE PASÓ CON LA MUTACIÓN — no es una demo en rojo (regla 15, tercera pregunta: ¿puede fallar siquiera?)" >&2
  restaurar; exit 1
fi
echo "demo-rojo: ✓ el gate falló con la mutación"

restaurar || exit 1
echo "demo-rojo: ✓ restaurado y verificado (grep + cmp)"

if [ -n "$verde" ]; then
  echo "demo-rojo: corriendo el gate restaurado (debe PASAR)…"
  bash -c "$verde" || { echo "demo-rojo: ✗ el gate sigue en rojo tras restaurar" >&2; exit 1; }
  echo "demo-rojo: ✓ verde tras restaurar"
fi
echo "demo-rojo: registra en la bitácora: archivo, mutación, a quién nombró el fallo."

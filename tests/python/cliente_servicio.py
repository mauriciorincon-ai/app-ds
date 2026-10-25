"""Ayuda de test_publica.py: abre el servicio de una carpeta con el cliente de pruebas de FastAPI y le manda un CSV.

Uso: python cliente_servicio.py <carpeta del servicio> <csv> [por-partes]
Con «por-partes» manda el cuerpo sin declarar su tamaño (transfer-encoding: chunked), como un cliente que no sabe cuánto pesa.
Imprime la respuesta de /puntuar como JSON; si el servicio se niega a arrancar, sale con el código 1 (y su mensaje en stderr).
"""
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
carpeta, ruta_csv = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
sys.path.insert(0, str(carpeta))

import servicio  # noqa: E402 — se niega a arrancar con SystemExit(1) si algo no cuadra
from fastapi.testclient import TestClient  # noqa: E402

cliente = TestClient(servicio.app)
bytes_del_csv = ruta_csv.read_bytes()
if len(sys.argv) > 3 and sys.argv[3] == "por-partes":
    cuerpo = (bytes_del_csv[i : i + 65536] for i in range(0, len(bytes_del_csv), 65536))
else:
    cuerpo = bytes_del_csv
respuesta = cliente.post("/puntuar", content=cuerpo, headers={"content-type": "text/csv"})
print(json.dumps({"estado": respuesta.status_code, "cuerpo": respuesta.json()}))

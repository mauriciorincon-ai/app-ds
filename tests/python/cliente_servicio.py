"""Ayuda de test_publica.py: abre el servicio de una carpeta con el cliente de pruebas de FastAPI y le manda un CSV.

Uso: python cliente_servicio.py <carpeta del servicio> <csv>
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
respuesta = cliente.post(
    "/puntuar", content=ruta_csv.read_bytes(), headers={"content-type": "text/csv"}
)
print(json.dumps({"estado": respuesta.status_code, "cuerpo": respuesta.json()}))

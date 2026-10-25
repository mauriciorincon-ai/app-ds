"""Servicio de puntuación de un modelo de Probeta DS (FastAPI) · Scoring service for a Probeta DS model.

ES — Tú lo despliegas donde quieras: Probeta no despliega nada ni guarda credenciales.
  · GET  /salud    → el modelo cargado, su tarea y las columnas que espera.
  · POST /puntuar  → puntúa un CSV (Content-Type: text/csv) o filas JSON ({"filas": [{"columna": valor}, ...]}).
  No entrena, no guarda lo que le mandas y no registra valores. Al arrancar comprueba que el archivo del modelo es el que se
  exportó (SHA-256), que las versiones instaladas son las fijas de requirements.txt y que el modelo puntúa en esta máquina; si
  algo no cuadra, se niega a arrancar diciendo qué.

EN — You deploy it wherever you like: Probeta deploys nothing and stores no credentials.
  · GET  /salud    → the loaded model, its task and the columns it expects.
  · POST /puntuar  → scores a CSV (Content-Type: text/csv) or JSON rows ({"filas": [{"column": value}, ...]}).
  It does not train, does not keep what you send and logs no values. On start-up it checks that the model file is the one that was
  exported (SHA-256), that the installed versions are the pinned ones in requirements.txt and that the model scores on this
  machine; if anything is off it refuses to start and says what.

python servicio.py   (variables / variables: PORT, MODELO, MAX_BYTES, MAX_FILAS)
"""
import base64
import csv
import hashlib
import io
import json
import os
import sys
from importlib import metadata
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request

from puntuar import columns_of, load_model, score, tarea_de

AQUI = Path(__file__).resolve().parent
ARCHIVO = Path(os.environ.get("MODELO", AQUI / "modelo.probeta.json"))
MAX_BYTES = int(os.environ.get("MAX_BYTES", 5 * 1024 * 1024))
MAX_FILAS = int(os.environ.get("MAX_FILAS", 50_000))


def _fallar(es, en):
    sys.stderr.write(f"servicio: {es} / {en}\n")
    raise SystemExit(1)


def _versiones_fijas():
    """Cada `paquete==versión` de requirements.txt tiene que ser lo instalado: un pickle de otra versión puede
    cargar y puntuar distinto sin avisar."""
    distintas = []
    for linea in (AQUI / "requirements.txt").read_text(encoding="utf-8").splitlines():
        linea = linea.split("#", 1)[0].strip()
        if not linea or "==" not in linea:
            continue
        nombre, fija = (parte.strip() for parte in linea.split("==", 1))
        try:
            instalada = metadata.version(nombre)
        except metadata.PackageNotFoundError:
            instalada = "no instalado"
        if instalada != fija:
            distintas.append(f"{nombre} {instalada} (fija: {fija})")
    if distintas:
        _fallar(
            "versiones distintas de las fijas: " + "; ".join(distintas),
            "versions differ from the pinned ones: " + "; ".join(distintas),
        )


def _cargar():
    _versiones_fijas()
    archivo = json.loads(ARCHIVO.read_text(encoding="utf-8"))
    manifiesto = archivo.get("manifest") or {}
    if archivo.get("format_version") != 1 or manifiesto.get("payload_encoding") != "pickle+zlib+base64":
        _fallar("el archivo no es un modelo de Probeta DS de este formato", "the file is not a Probeta DS model of this format")
    payload = archivo.get("payload")
    if not isinstance(payload, str):
        _fallar("el archivo no trae el modelo", "the file carries no model")
    if hashlib.sha256(base64.b64decode(payload)).hexdigest() != manifiesto.get("payload_sha256"):
        _fallar(
            "el SHA-256 del modelo no coincide con el del manifiesto: el archivo cambió",
            "the model's SHA-256 does not match the manifest's: the file changed",
        )
    try:
        modelo = load_model(payload, manifiesto.get("schema"))
    except Exception as error:  # noqa: BLE001 — solo el tipo, nunca un valor
        _fallar(
            f"no se pudo abrir el modelo ({type(error).__name__})",
            f"the model could not be opened ({type(error).__name__})",
        )
    _autoprueba(modelo, manifiesto)
    return modelo, manifiesto


def _autoprueba(modelo, manifiesto):
    """Puntúa UNA fila armada con el perfil del propio modelo: si el pickle no puntúa en esta máquina (p. ej. un
    modelo de vecinos entrenado en el navegador), lo dice al arrancar y no con la primera petición."""
    perfil = modelo["training_profile"]
    esquema = modelo["schema"]
    fila = []
    for columna in esquema["numeric"]:
        limites = perfil["numeric"].get(columna) or {}
        valor = limites.get("min")
        fila.append("" if valor is None else repr(float(valor)))
    for columna in esquema["categorical"]:
        vistas = perfil["categorical"].get(columna) or []
        fila.append(str(vistas[0]) if vistas else "")
    try:
        score(modelo, columns_of(modelo), [fila])
    except Exception as error:  # noqa: BLE001
        nombre = manifiesto.get("model_name", "modelo")
        _fallar(
            f"el modelo no puntúa en esta máquina ({type(error).__name__}): "
            f"{nombre} se entrenó en el navegador y este tipo de modelo no es portable",
            f"the model does not score on this machine ({type(error).__name__}): "
            f"{nombre} was trained in the browser and this kind of model is not portable",
        )


MODELO, MANIFIESTO = _cargar()
COLUMNAS = columns_of(MODELO)
app = FastAPI(title="Servicio de puntuación (Probeta DS)", docs_url=None, redoc_url=None)


@app.get("/salud")
def salud():
    return {
        "ok": True,
        "modelo": MANIFIESTO.get("model_name"),
        "tarea": tarea_de(MODELO["schema"]),
        "columnas": COLUMNAS,
    }


def _filas_de_csv(texto):
    lector = csv.reader(io.StringIO(texto.lstrip("﻿")))
    filas = [fila for fila in lector if fila]
    if len(filas) < 2:
        raise HTTPException(400, "csv-vacio")
    return filas[0], filas[1:]


def _filas_de_json(cuerpo):
    try:
        filas = json.loads(cuerpo)["filas"]
        if not isinstance(filas, list) or not filas or not all(isinstance(f, dict) for f in filas):
            raise ValueError
    except (ValueError, KeyError, TypeError):
        raise HTTPException(400, "json-invalido") from None
    claves = set().union(*(f.keys() for f in filas))
    encabezados = [c for c in COLUMNAS if c in claves]
    return encabezados, [[None if f.get(c) is None else str(f.get(c)) for c in encabezados] for f in filas]


@app.post("/puntuar")
async def puntuar(request: Request):
    declarado = request.headers.get("content-length")
    if declarado is not None and declarado.isdigit() and int(declarado) > MAX_BYTES:
        raise HTTPException(413, "cuerpo-demasiado-grande")
    cuerpo = await request.body()
    if len(cuerpo) > MAX_BYTES:
        raise HTTPException(413, "cuerpo-demasiado-grande")
    tipo = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if tipo == "text/csv":
        encabezados, filas = _filas_de_csv(cuerpo.decode("utf-8", errors="replace"))
    elif tipo == "application/json":
        encabezados, filas = _filas_de_json(cuerpo)
    else:
        raise HTTPException(415, "tipo-no-soportado")
    if len(filas) > MAX_FILAS:
        raise HTTPException(413, "demasiadas-filas")
    faltan = [c for c in COLUMNAS if c not in encabezados]
    if faltan:
        raise HTTPException(400, "columnas-faltan:" + ",".join(faltan))
    try:
        return score(MODELO, encabezados, filas)
    except Exception as error:  # noqa: BLE001 — jamás un valor en el error
        raise HTTPException(422, f"no-puntua:{type(error).__name__}") from None


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))

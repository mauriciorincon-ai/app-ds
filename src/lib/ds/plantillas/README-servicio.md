# Servicio de puntuación · Scoring service (Probeta DS)

**Español** · [English](#english)

Esto es un servicio pequeño que puntúa filas nuevas con el modelo que entrenaste en Probeta DS. **Probeta no lo despliega ni guarda credenciales**: lo despliegas tú, donde quieras, y los datos que le mandes no pasan por Probeta.

## Qué trae

| Archivo | Para qué |
|---|---|
| `servicio.py` | El servicio (FastAPI): `GET /salud` y `POST /puntuar`. |
| `puntuar.py` | El motor que puntúa; es el mismo que usa el puntuador portátil. |
| `modelo.probeta.json` | Tu modelo (el mismo archivo que «Exportar»). |
| `requirements.txt` | Las versiones **fijas**. El servicio se niega a arrancar con otras. |

## Cómo correrlo (Python 3.14)

```
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python servicio.py            # escucha en el puerto 8080 (variable PORT)
```

Al arrancar comprueba el SHA-256 del modelo, las versiones instaladas y que el modelo puntúa en esta máquina; si algo no cuadra dice qué y sale.

## Cómo se usa

```
curl -s localhost:8080/salud
curl -s -X POST localhost:8080/puntuar -H 'Content-Type: text/csv' --data-binary @tus-filas.csv
curl -s -X POST localhost:8080/puntuar -H 'Content-Type: application/json' -d '{"filas":[{"columna":"valor"}]}'
```

Responde la etiqueta de cada fila, la probabilidad cuando el modelo la da, y un reporte de **novedad**: cuántos valores el modelo nunca vio al entrenar (sus puntajes son menos fiables).

## Costo predecible

- No guarda nada, no tiene base de datos y no llama a ningún otro servicio: cuesta lo que cuesta correr un proceso.
- Despliégalo donde **escale a cero** (sin tráfico, sin cobro) y pon **tope de instancias y de gasto** en tu proveedor. Nunca lo dejes encendido sin uso esperando tráfico que no llega.
- Límites propios: `MAX_BYTES` (5 MB) y `MAX_FILAS` (50 000) por petición, cambiables con variables de entorno.

## Qué lleva el modelo (léelo antes de compartirlo)

`modelo.probeta.json` lleva el modelo entrenado y su manifiesto: los **rangos y las categorías** que vio, el **nombre del archivo** de datos y las **métricas** de su prueba. El servicio abre el modelo con `pickle`: **solo ábrelo si conoces su origen**. Si añades una página web que llame al servicio, tendrás que permitir su origen (CORS) tú mismo.

---

## English

This is a small service that scores new rows with the model you trained in Probeta DS. **Probeta does not deploy it or store credentials**: you deploy it wherever you like, and the data you send never goes through Probeta.

### What is in the box

| File | What for |
|---|---|
| `servicio.py` | The service (FastAPI): `GET /salud` and `POST /puntuar`. |
| `puntuar.py` | The scoring engine; the same one the portable scorer uses. |
| `modelo.probeta.json` | Your model (the same file as «Export»). |
| `requirements.txt` | The **pinned** versions. The service refuses to start with others. |

### Running it (Python 3.14)

```
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python servicio.py            # listens on port 8080 (PORT variable)
```

On start-up it checks the model's SHA-256, the installed versions, and that the model scores on this machine; if anything is off it says what and exits.

### Using it

```
curl -s localhost:8080/salud
curl -s -X POST localhost:8080/puntuar -H 'Content-Type: text/csv' --data-binary @your-rows.csv
curl -s -X POST localhost:8080/puntuar -H 'Content-Type: application/json' -d '{"filas":[{"column":"value"}]}'
```

It answers with each row's label, the probability when the model gives one, and a **novelty** report: how many values the model never saw in training (their scores are less reliable).

### Predictable cost

- It stores nothing, has no database and calls no other service: it costs what running a process costs.
- Deploy it where it **scales to zero** (no traffic, no charge) and set an **instance cap and a spending cap** with your provider. Never leave it on, idle, waiting for traffic that does not come.
- Its own limits: `MAX_BYTES` (5 MB) and `MAX_FILAS` (50,000) per request, changeable with environment variables.

### What the model carries (read before sharing)

`modelo.probeta.json` carries the trained model and its manifest: the **ranges and categories** it saw, the **name of the data file** and the **metrics** of its test. The service opens the model with `pickle`: **only open it if you know where it came from**. If you add a web page that calls the service, you will have to allow its origin (CORS) yourself.

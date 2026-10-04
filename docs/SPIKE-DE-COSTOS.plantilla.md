# Spike de costos — molde (kit v1.38.0)

> Copia este archivo a `sprints/SPRINT_NNN-spike-<tema>.md` cuando una orden pida medir tiempos,
> pesos o cuotas para fijar un umbral en el STOP (método v1.37.0: «la orden no fija umbrales; los
> fija la medición»). Un spike que no registra la carga de la máquina no es una medición: es una
> anécdota *(ds S6, K-S6-3: 26,9 s contra 19,1 s por un build corriendo al lado)*.

## 0. Condiciones (se llenan ANTES de correr)

| Condición | Cómo se cumple | Registro |
|---|---|---|
| **Máquina quieta** | Sin builds, sin `next dev`, sin CI local, sin pruebas en paralelo, sin descargas; navegador con una sola pestaña del spike | `uptime` antes de arrancar: load average 1 min = `___` (umbral: ≤ número de núcleos / 2) |
| **Carga registrada** | `uptime` (o `top -l 1 | head -5` en macOS) antes y después de cada lote | antes `___` · después `___` |
| **Repetir si hubo carga** | Si el load average subió por encima del umbral durante un lote, ese lote se repite entero; no se promedia con el sucio | lotes repetidos: `___` |
| **Mismo runtime que el usuario** | Build de producción y el motor real (p. ej. Pyodide en el navegador, binario en `release`), no Node ni `debug` | comando: `___` |
| **Semilla y repeticiones** | Semilla fija; ≥ 3 corridas por celda; se reporta la mediana y el rango | semilla `___` · n = `___` |

## 1. Qué se mide

| Celda | Entrada (tamaño, forma) | Qué se mide | Unidad |
|---|---|---|---|
| | | | |

## 2. Resultados (la tabla que va al STOP)

| Celda | Mediana | Mín | Máx | n | Carga (antes → después) | Nota |
|---|---|---|---|---|---|---|
| | | | | | | |

## 3. Umbrales que esta tabla permite fijar

Para cada umbral: **propuesta → qué celda la sostiene → qué cambiaría si el usuario elige otra cosa.**
La constante resultante se exporta con nombre y el test que la vigila se nombra aquí.

| Umbral | Propuesta | Celda que la sostiene | Constante · test |
|---|---|---|---|
| | | | |

## 4. Lo que el spike NO midió (y se declara)

- …

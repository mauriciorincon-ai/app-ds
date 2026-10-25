// S18 (ADR 026): el código PROPONE el plan de limpieza; el usuario aprueba o rechaza cada paso (`limpieza-plan.ts` aplica lo
// aprobado). Puro y determinista: la misma tabla da el mismo plan. Cada umbral es una constante con su razón; un paso sin
// umbral cumplido no se propone.
//
// Ningún paso toca la tabla. Los estadísticos (la mediana que rellena, los cuantiles que sustituyen) se ajustan DENTRO del
// pipeline con las filas de entrenamiento (sanitize.ts, ADR-002 extendido): aprobar «rellenar» no ve la prueba.
import {
  columnValues,
  isNullToken,
  parseNumber,
  profileTable,
  type CsvTable,
} from "@/lib/ds/csv";
import { farOutShare } from "./eda";
import type { PasoLimpieza } from "./limpieza-plan";
import type { AvisoPersonal } from "./personales";

/** Atípico = fuera de Q1 − 3·IQR … Q3 + 3·IQR («muy lejos», no «un poco alto»). */
export const ATIPICO_IQR = 3;
export const ATIPICO_FILAS_MINIMAS = 20;
export const ATIPICO_CELDAS_MINIMAS = 3;
export const ATIPICO_CUOTA_MINIMA = 0.005;
/** Vacíos en una numérica: de 5 % a 60 % (con menos, la mediana basta; con más, casi no hay columna) y al menos 10 celdas. */
export const VACIO_NUMERICA_CUOTA_MINIMA = 0.05;
export const VACIO_NUMERICA_CUOTA_MAXIMA = 0.6;
export const VACIO_NUMERICA_CELDAS_MINIMAS = 10;
/** Vacíos en una categórica: desde 2 % y al menos 5 celdas. */
export const VACIO_CATEGORICA_CUOTA_MINIMA = 0.02;
export const VACIO_CATEGORICA_CELDAS_MINIMAS = 5;
/** Un código numérico: enteros con pocos valores distintos Y un nombre de columna que lo dice. */
export const CODIGO_DISTINTOS_MAXIMOS = 12;
export const MAXIMO_PASOS = 12;

const quitarTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const PALABRAS_DE_CODIGO = new Set([
  "codigo",
  "cod",
  "code",
  "tipo",
  "type",
  "categoria",
  "category",
  "zona",
  "zone",
  "region",
  "estado",
  "status",
  "nivel",
  "level",
  "clase",
  "class",
  "grupo",
  "group",
  "segmento",
  "segment",
  "sector",
  "canal",
  "channel",
  "plan",
  "id",
]);

function palabras(encabezado: string): string[] {
  return quitarTildes(encabezado)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const PRIORIDAD: Record<PasoLimpieza["tipo"], number> = {
  "quitar-columna": 0,
  "atipicos-cuantiles": 1,
  "vacio-indicador": 2,
  "vacio-categoria": 3,
  "tipo-categoria": 4,
};

export function proponerPlan(
  table: CsvTable,
  personales: readonly AvisoPersonal[] = [],
): PasoLimpieza[] {
  const pasos: PasoLimpieza[] = [];
  const personal = new Map(personales.map((a) => [a.column, a.tipo]));
  const perfiles = profileTable(table);

  perfiles.forEach((perfil, index) => {
    const columna = perfil.name;
    const tipoPersonal = personal.get(columna);
    if (tipoPersonal !== undefined) {
      pasos.push({
        id: `quitar-columna:${columna}`,
        tipo: "quitar-columna",
        columna,
        celdas: table.rows.length - perfil.nulls,
        de: table.rows.length,
        personal: tipoPersonal,
      });
      return; // una columna que se propone quitar no recibe más propuestas
    }
    if (perfil.looksLikeDate) return;
    const total = table.rows.length;
    const celdas = columnValues(table, index);

    if (perfil.kind === "numeric") {
      const valores = celdas
        .filter((c) => !isNullToken(c))
        .map((c) => parseNumber(c)!);
      if (valores.length === 0) return;

      // atípicos: por cuantiles, dentro del entrenamiento
      if (valores.length >= ATIPICO_FILAS_MINIMAS) {
        const cuota = farOutShare(valores, ATIPICO_IQR);
        const cuantos = Math.round(cuota * valores.length);
        if (
          cuantos >= ATIPICO_CELDAS_MINIMAS &&
          cuota >= ATIPICO_CUOTA_MINIMA
        ) {
          pasos.push({
            id: `atipicos-cuantiles:${columna}`,
            tipo: "atipicos-cuantiles",
            columna,
            celdas: cuantos,
            de: valores.length,
          });
        }
      }

      // vacíos: una marca de «estaba vacío»
      const vacias = perfil.nulls;
      const cuotaVacia = vacias / total;
      if (
        vacias >= VACIO_NUMERICA_CELDAS_MINIMAS &&
        cuotaVacia >= VACIO_NUMERICA_CUOTA_MINIMA &&
        cuotaVacia <= VACIO_NUMERICA_CUOTA_MAXIMA
      ) {
        pasos.push({
          id: `vacio-indicador:${columna}`,
          tipo: "vacio-indicador",
          columna,
          celdas: vacias,
          de: total,
        });
      }

      // un código escrito con números
      const distintos = new Set(valores);
      if (
        distintos.size >= 2 &&
        distintos.size <= CODIGO_DISTINTOS_MAXIMOS &&
        valores.every((v) => Number.isInteger(v)) &&
        palabras(columna).some((p) => PALABRAS_DE_CODIGO.has(p))
      ) {
        pasos.push({
          id: `tipo-categoria:${columna}`,
          tipo: "tipo-categoria",
          columna,
          celdas: distintos.size,
          de: valores.length,
        });
      }
    } else {
      const vacias = perfil.nulls;
      if (
        vacias >= VACIO_CATEGORICA_CELDAS_MINIMAS &&
        vacias / total >= VACIO_CATEGORICA_CUOTA_MINIMA &&
        vacias < total
      ) {
        pasos.push({
          id: `vacio-categoria:${columna}`,
          tipo: "vacio-categoria",
          columna,
          celdas: vacias,
          de: total,
        });
      }
    }
  });

  // los de más alcance primero, y los empates por el orden de las columnas (determinista)
  const posicion = new Map(table.headers.map((h, i) => [h, i]));
  return pasos
    .sort(
      (a, b) =>
        PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] ||
        b.celdas / b.de - a.celdas / a.de ||
        (posicion.get(a.columna) ?? 0) - (posicion.get(b.columna) ?? 0),
    )
    .slice(0, MAXIMO_PASOS);
}

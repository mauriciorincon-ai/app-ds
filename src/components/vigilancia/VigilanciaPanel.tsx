"use client";

// S19 (ADR 027): «Vigilar el desempeño» en el modo de puntuar. Si el archivo nuevo trae la columna del objetivo con lo que de verdad
// pasó, el worker puntúa esas filas, TS calcula la cifra de hoy con su margen del 95 % (el bootstrap del S18, semilla fija) y la
// pone junto a la de la prueba del modelo: `sigue`, `revisar` o `reentrenar` (las palabras del chequeo de deriva de la etapa 10, con la
// regla del veredicto). Símbolo + palabra (el color nunca solo). Las filas sin resultado o con una clase nunca vista se cuentan y se
// dejan fuera; con menos de 50 filas con resultado real no se decide: siempre «revisar». Los textos viajan con este chunk.
import { useEffect, useRef, useState, type RefObject } from "react";
import { Card } from "@/components/ui";
import { matchByTask } from "@/engine/despacho";
import { FILAS_PRUEBA_POCAS } from "@/engine/intervalo";
import {
  vigilar,
  type LecturaVigilancia,
  type ReferenciaVigilancia,
} from "@/engine/vigilancia";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import type { CsvTable } from "@/lib/ds/csv";
import { TEXTOS_VIGILANCIA } from "@/lib/narration/textos-vigilancia";
import { formatQuantity, quantityDecimals, thousands, withUnit } from "@/lib/quantity";
import { pedirEvaluacion } from "@/lib/simulador/pedir";
import type { VigilanciaSent } from "@/workers/contrato-vigilancia";
import type { EvaluateNewResult, SupervisedSchema } from "@/workers/protocol";

const SIMBOLO = { sigue: "✓", revisar: "⚠", reentrenar: "✕" } as const;
const SEMILLA = 42;

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "midiendo" }
  | {
      readonly tipo: "lista";
      readonly de: object;
      readonly lectura: LecturaVigilancia;
      readonly datos: EvaluateNewResult;
    }
  | { readonly tipo: "sin_filas"; readonly de: object }
  | { readonly tipo: "error"; readonly motivo: string };

export type VigilanciaPanelProps = {
  readonly schema: SupervisedSchema;
  readonly worker?: RefObject<Worker | null>;
  /** Las filas nuevas (con la columna del objetivo, si la traen). */
  readonly tabla: CsvTable;
  readonly referencia: ReferenciaVigilancia | null;
  /** La identidad de ESTE puntaje: otro archivo, otra lectura. */
  readonly modelo: object;
  readonly unidadObjetivo?: string | null;
};

export function VigilanciaPanel({
  schema,
  worker,
  tabla,
  referencia,
  modelo,
  unidadObjetivo = null,
}: VigilanciaPanelProps) {
  const t = useTextosEtapa(TEXTOS_VIGILANCIA);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const pedido = useRef<object | null>(null);
  const trae = tabla.headers.includes(schema.target);

  useEffect(() => {
    const w = worker?.current;
    if (!trae || !referencia || !w || pedido.current === modelo) return;
    pedido.current = modelo;
    setEstado({ tipo: "midiendo" });
    // solo viajan las columnas del modelo y el objetivo
    const columnas = [...schema.numeric, ...schema.categorical, schema.target];
    const posiciones = columnas.map((c) => tabla.headers.indexOf(c));
    const sent: VigilanciaSent = {
      task: matchByTask(schema, {
        binaria: () => "binaria" as const,
        multiclase: () => "multiclase" as const,
        numerica: () => "numerica" as const,
      }),
      rows: tabla.rows.length,
      n_classes: matchByTask(schema, {
        binaria: () => null,
        multiclase: (s) => s.classes.length,
        numerica: () => null,
      }),
    };
    pedirEvaluacion(
      w,
      {
        headers: columnas,
        rows: tabla.rows.map((fila) => posiciones.map((p) => fila[p] ?? "")),
      },
      sent,
    ).then(
      (datos) => {
        if (datos.n_used === 0) {
          setEstado({ tipo: "sin_filas", de: modelo });
          return;
        }
        // fuera del manejador del mensaje: que la pantalla pinte «calculando» antes de las 1 000 repeticiones
        setTimeout(() => {
          try {
            const lectura = vigilar(datos, referencia, {
              clases: sent.n_classes ?? undefined,
              semilla: SEMILLA,
            });
            setEstado({ tipo: "lista", de: modelo, lectura, datos });
          } catch {
            setEstado({ tipo: "error", motivo: "cifras" });
          }
        }, 0);
      },
      (e: unknown) =>
        setEstado({
          tipo: "error",
          motivo: e instanceof Error ? e.message : "worker",
        }),
    );
  }, [trae, referencia, worker, tabla, schema, modelo]);

  return (
    <section aria-labelledby="vigilancia-title" data-testid="vigilancia-panel">
      <Card className="p-5">
        <h2 id="vigilancia-title" className="text-sm font-semibold">
          {t("vigilancia.titulo")}
        </h2>
        {!trae ? (
          <p className="mt-1 text-sm text-ink-muted" data-testid="vigilancia-sin-objetivo">
            {t("vigilancia.sin_objetivo", { objetivo: schema.target })}
          </p>
        ) : !referencia ? (
          <p className="mt-1 text-sm text-ink-muted">{t("vigilancia.sin_referencia")}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-muted">{t("vigilancia.ayuda", { objetivo: schema.target })}</p>
            {estado.tipo === "midiendo" && (
              <p role="status" className="mt-1 text-sm text-ink-muted">
                {t("vigilancia.midiendo")}
              </p>
            )}
            {estado.tipo === "error" && (
              <p role="alert" className="mt-1 text-sm text-negative">
                <span aria-hidden="true" className="mr-1">
                  ✕
                </span>
                {t("vigilancia.error", { motivo: estado.motivo })}
              </p>
            )}
            {estado.tipo === "sin_filas" && estado.de === modelo && (
              <p role="status" className="mt-1 text-sm text-ink">
                <span aria-hidden="true" className="mr-1">
                  ⚠
                </span>
                {t("vigilancia.sin_filas")}
              </p>
            )}
            <div aria-live="polite" data-testid="vigilancia-vivo">
              {estado.tipo === "lista" && estado.de === modelo && (
                <Lectura
                  lectura={estado.lectura}
                  datos={estado.datos}
                  t={t}
                  unidad={unidadObjetivo}
                />
              )}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

function Lectura({
  lectura,
  datos,
  t,
  unidad,
}: {
  lectura: LecturaVigilancia;
  datos: EvaluateNewResult;
  t: (key: string, params?: Record<string, string | number>) => string;
  unidad: string | null;
}) {
  const { hoy, referencia } = lectura;
  const esMae = referencia.metric === "mae";
  const decimales = esMae
    ? quantityDecimals([hoy.valor, hoy.bajo, hoy.alto, referencia.valor])
    : 2;
  const f = (v: number) =>
    esMae ? withUnit(formatQuantity(v, decimales), { symbol: unidad }) : formatQuantity(v, decimales);
  const dejadas = datos.dropped.empty + datos.dropped.unknown;
  return (
    <div className="mt-2 flex flex-col gap-2" data-testid="vigilancia-lectura">
      <p
        className="text-sm font-medium"
        data-testid="vigilancia-veredicto"
        data-veredicto={lectura.veredicto}
      >
        <span aria-hidden="true" className="mr-1">
          {SIMBOLO[lectura.veredicto]}
        </span>
        {t(
          `vigilancia.veredicto.${
            lectura.veredicto === "revisar" && lectura.indefinida
              ? "revisar_indefinida"
              : lectura.veredicto === "revisar" && lectura.pocas
                ? "revisar_pocas"
                : lectura.veredicto
          }`,
        )}
      </p>
      <p className="text-sm tabular-nums" data-testid="vigilancia-cifras">
        {t("vigilancia.cifras", {
          metric: t(`results.metrics.${referencia.metric}`),
          hoy: f(hoy.valor),
          bajo: f(hoy.bajo),
          alto: f(hoy.alto),
          n: thousands(hoy.n),
          prueba: f(referencia.valor),
        })}
      </p>
      {lectura.indefinida && (
        <p className="text-sm text-caution">
          <span aria-hidden="true" className="mr-1">
            ⚠
          </span>
          {t("vigilancia.indefinida")}
        </p>
      )}
      {lectura.pocas && (
        <p className="text-sm text-caution">
          <span aria-hidden="true" className="mr-1">
            ⚠
          </span>
          {t("vigilancia.pocas", { n: formatQuantity(hoy.n, 0), minimo: FILAS_PRUEBA_POCAS })}
        </p>
      )}
      {dejadas > 0 && (
        <p className="text-sm text-ink-muted">
          {t("vigilancia.dejadas", {
            vacias: thousands(datos.dropped.empty),
            desconocidas: thousands(datos.dropped.unknown),
          })}
        </p>
      )}
      <p className="text-sm text-ink-muted">
        {t("vigilancia.empate", { empate: f(lectura.empate) })}
      </p>
      <p className="text-sm text-ink-muted">
        {t("vigilancia.detalle", {
          remuestreos: thousands(hoy.remuestreos),
          semilla: hoy.semilla,
        })}
      </p>
    </div>
  );
}

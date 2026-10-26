"use client";

// S19 (ADR 027): el panel «El modelo en reglas» de la pantalla de resultados de Probeta. Se pide, no se calcula solo: un árbol
// sustituto sobre las columnas originales que copia lo que el modelo decide, con su FIDELIDAD medida en filas que el árbol no vio. Con
// fidelidad suficiente se llama «el modelo en reglas»; debajo del umbral se da la cifra y se llama «un árbol que se parece al modelo»,
// nunca lo primero. Se descarga como texto (en el idioma de la pantalla) y como SQL. S20: con `tabla` (el archivo que el usuario ya
// cargó para puntuar) el árbol se arma con ESAS filas —sirve a un modelo importado, que no conserva las de su entrenamiento— y la
// verdad se mide solo si el archivo trae el objetivo. Símbolo + palabra (el color nunca solo); los textos viajan con este chunk.
import { useRef, useState, type RefObject } from "react";
import { Button, Card } from "@/components/ui";
import { matchByTask, matchTask } from "@/engine/despacho";
import { fidelidadSuficiente, FIDELIDAD_MIN_ACUERDO, FIDELIDAD_MIN_R2 } from "@/engine/reglas";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { useI18n } from "@/i18n/provider";
import type { CsvTable } from "@/lib/ds/csv";
import { datasetSlug, downloadTextFile } from "@/lib/files";
import { sqlDeReglas, textoReglas } from "@/lib/narration/reglas";
import { TEXTOS_REGLAS } from "@/lib/narration/textos-reglas";
import { pedirReglas } from "@/lib/simulador/pedir";
import { formatQuantity, quantityDecimals, withUnit } from "@/lib/quantity";
import type { ReglasSent } from "@/workers/contrato-reglas";
import type { RulesResult, ScoringSchema } from "@/workers/protocol";

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "calculando" }
  | { readonly tipo: "lista"; readonly de: object | undefined; readonly r: RulesResult }
  | { readonly tipo: "aviso"; readonly clave: "sin_filas" | "pocas_filas" }
  | { readonly tipo: "error"; readonly motivo: string };

export type ReglasPanelProps = {
  readonly schema: ScoringSchema;
  readonly worker?: RefObject<Worker | null>;
  /** La identidad del modelo activo: una lectura de otro modelo no se enseña. */
  readonly modelo: object;
  readonly datasetName: string | null;
  readonly ocupado?: boolean;
  /** Estimar una cantidad: la unidad del objetivo («kWh»). */
  readonly unidadObjetivo?: string | null;
  /** S20: las filas del archivo que el usuario cargó; con ellas el árbol se arma sobre lo que el modelo predice en ESAS filas. */
  readonly tabla?: CsvTable | null;
};

export function ReglasPanel({
  schema,
  worker,
  modelo,
  datasetName,
  ocupado = false,
  unidadObjetivo = null,
  tabla = null,
}: ReglasPanelProps) {
  const t = useTextosEtapa(TEXTOS_REGLAS);
  const { locale } = useI18n();
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const pedido = useRef(false);

  const sent: ReglasSent = {
    task: matchByTask(schema, {
      binaria: () => "binaria" as const,
      multiclase: () => "multiclase" as const,
      numerica: () => "numerica" as const,
      agrupar: () => "agrupar" as const,
    }),
    numeric: schema.numeric,
    categorical: schema.categorical,
    classes: matchByTask(schema, {
      binaria: (s) => s.classes,
      multiclase: (s) => s.classes,
      numerica: () => null,
      agrupar: () => null,
    }),
    ...(tabla ? { source: "uploaded" as const, truthAsked: true } : {}),
  };

  const pedir = async () => {
    const w = worker?.current;
    if (!w || pedido.current) return;
    pedido.current = true;
    setEstado({ tipo: "calculando" });
    try {
      const r = await pedirReglas(
        w,
        sent,
        tabla ? { headers: tabla.headers, rows: tabla.rows, truth: true } : undefined,
      );
      setEstado({ tipo: "lista", de: modelo, r });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "worker";
      setEstado(
        motivo === "no-rows"
          ? { tipo: "aviso", clave: "sin_filas" }
          : motivo === "too-few-rows"
            ? { tipo: "aviso", clave: "pocas_filas" }
            : { tipo: "error", motivo },
      );
    } finally {
      pedido.current = false;
    }
  };

  const lectura =
    estado.tipo === "lista" && estado.de === modelo ? estado.r : null;

  return (
    <section aria-labelledby="reglas-title" data-testid="reglas-panel">
      <Card className="p-5">
        <h2 id="reglas-title" className="text-sm font-semibold">
          {lectura && !fidelidadSuficiente(lectura)
            ? t("reglas.titulo_aprox")
            : t("reglas.titulo")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {t(tabla ? "reglas.ayuda_subidas" : "reglas.ayuda")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            icon="table"
            type="button"
            variant={lectura ? "secondary" : "primary"}
            onClick={pedir}
            disabled={ocupado || !worker || estado.tipo === "calculando"}
          >
            {t("reglas.boton")}
          </Button>
          {estado.tipo === "calculando" && (
            <span role="status" className="text-sm text-ink-muted">
              {t("reglas.calculando")}
            </span>
          )}
        </div>
        {estado.tipo === "aviso" && (
          <p role="status" className="mt-3 text-sm text-ink-muted" data-testid="reglas-aviso">
            <span aria-hidden="true" className="mr-1">
              ·
            </span>
            {t(`reglas.${estado.clave}`)}
          </p>
        )}
        {estado.tipo === "error" && (
          <p role="alert" className="mt-3 text-sm text-negative">
            <span aria-hidden="true" className="mr-1">
              ✕
            </span>
            {t("reglas.error", { motivo: estado.motivo })}
          </p>
        )}
        {lectura && (
          <LecturaReglas
            r={lectura}
            t={t}
            locale={locale}
            unidad={unidadObjetivo}
            datasetName={datasetName}
          />
        )}
      </Card>
    </section>
  );
}

/** La lectura del árbol: fidelidad, veredicto, verdad (si se midió), las reglas y sus dos descargas. La comparte la etapa 10. */
export function LecturaReglas({
  r,
  t,
  locale,
  unidad,
  datasetName,
}: {
  r: RulesResult;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: "es" | "en";
  unidad: string | null;
  datasetName: string | null;
}) {
  const suficiente = fidelidadSuficiente(r);
  const pct = (v: number) => formatQuantity(v * 100, 1);
  const umbral =
    r.fidelity.metric === "r2" ? FIDELIDAD_MIN_R2 : FIDELIDAD_MIN_ACUERDO;
  const fidelidad =
    r.fidelity.metric === "r2"
      ? t("reglas.fidelidad.r2", { pct: pct(r.fidelity.value), n: formatQuantity(r.fidelity.n, 0) })
      : t("reglas.fidelidad.acuerdo", { pct: pct(r.fidelity.value), n: formatQuantity(r.fidelity.n, 0) });
  const verdad = r.truth
    ? r.truth.metric === "accuracy"
      ? t("reglas.verdad.accuracy", { reglas: pct(r.truth.rules), modelo: pct(r.truth.model) })
      : (() => {
          const dec = quantityDecimals([r.truth.rules, r.truth.model]);
          const q = (v: number) => withUnit(formatQuantity(v, dec), { symbol: unidad });
          return t("reglas.verdad.mae", { reglas: q(r.truth.rules), modelo: q(r.truth.model) });
        })()
    : null;
  // agrupar no tiene verdad contra la cual medirse: ahí no se avisa que falta
  const tieneVerdad = matchTask(r.task, {
    binaria: () => true,
    multiclase: () => true,
    numerica: () => true,
    agrupar: () => false,
  });
  const texto = textoReglas(r, locale, { unidad, fidelidadSuficiente: suficiente });
  const sql = sqlDeReglas(r, locale);
  const base = `reglas-${datasetSlug(datasetName ?? "") || "modelo"}`;
  return (
    <div className="mt-4 flex flex-col gap-2" data-testid="reglas-lectura">
      <p className="text-sm font-medium" data-testid="reglas-fidelidad">
        {fidelidad}
      </p>
      <p
        className={`text-sm ${suficiente ? "text-ink" : "text-caution"}`}
        data-testid="reglas-veredicto"
      >
        <span aria-hidden="true" className="mr-1">
          {suficiente ? "✓" : "⚠"}
        </span>
        {t(suficiente ? "reglas.veredicto.si" : "reglas.veredicto.no", {
          umbral: formatQuantity(umbral * 100, 0),
        })}
      </p>
      {verdad && (
        <p className="text-sm text-ink-muted">
          {verdad}
          {r.source === "uploaded" && r.truth
            ? ` ${t("reglas.verdad.filas", { n: formatQuantity(r.truth.n, 0), count: r.truth.n })}`
            : ""}
        </p>
      )}
      {r.source === "uploaded" && !verdad && tieneVerdad && (
        <p className="text-sm text-ink-muted" data-testid="reglas-sin-verdad">
          {t("reglas.verdad.ausente")}
        </p>
      )}
      <p className="text-sm text-ink-muted">
        {t(r.source === "uploaded" ? "reglas.detalle_subidas" : "reglas.detalle", {
          hojas: r.leaves,
          profundidad: r.depth,
          filas: formatQuantity(r.n_fit, 0),
          count: r.leaves,
        })}
      </p>
      <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t("reglas.lista")}
      </h3>
      <pre
        className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-hairline bg-sunken p-3 text-xs [overflow-wrap:anywhere]"
        tabIndex={0}
        aria-label={t("reglas.lista")}
        data-testid="reglas-texto"
      >
        {texto}
      </pre>
      <div className="flex flex-wrap gap-3">
        <Button
          icon="download"
          variant="secondary"
          type="button"
          onClick={() =>
            downloadTextFile(`${base}.txt`, texto, "text/plain;charset=utf-8")
          }
        >
          {t("reglas.descargar_texto")}
        </Button>
        <Button
          icon="download"
          variant="secondary"
          type="button"
          onClick={() =>
            downloadTextFile(`${base}.sql`, sql + "\n", "application/sql;charset=utf-8")
          }
        >
          {t("reglas.descargar_sql")}
        </Button>
      </div>
    </div>
  );
}

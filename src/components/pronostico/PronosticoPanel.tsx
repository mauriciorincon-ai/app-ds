"use client";

// S20 (ADR 028): pronosticar una serie. Un flujo propio, no una tarea del encarrilador: se elige en el selector del objetivo (como
// agrupar), con una columna de fecha y una de números. El código propone el periodo y cómo juntar las filas; lo que no puede saber (el
// orden día/mes de una fecha ambigua, si se completan los huecos) se PREGUNTA. El cálculo —la liga con origen móvil, el pronóstico y
// sus bandas— lo hace el worker; aquí solo se dice el veredicto, se dibuja la serie y se descarga el CSV. Símbolo + palabra (el color
// nunca solo); los textos viajan con este chunk.
import { useId, useMemo, useRef, useState, type RefObject } from "react";
import { Button, Card } from "@/components/ui";
import {
  METODOS,
  csvDelPronostico,
  veredictoDe,
  type PronosticoViable,
} from "@/engine/pronostico";
import {
  HORIZONTE_DEFECTO,
  HORIZONTE_MAX,
  PERIODOS_MAX,
  TEMPORADA,
  armarSerie,
  completarLineal,
  etiquetasDe,
  periodosFuturos,
  proponerAgregado,
  proponerPeriodo,
  sePuedeCompletar,
  etiquetaDe,
  type Agregado,
  type Periodo,
  type Serie,
} from "@/engine/serie";
import {
  fechasPorFila,
  leerFechas,
  type OrdenFecha,
} from "@/engine/protocolo/fechas";
import { useI18n } from "@/i18n/provider";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { columnValues, parseNumber, profileTable, type CsvTable } from "@/lib/ds/csv";
import { datasetSlug, downloadTextFile } from "@/lib/files";
import { fraseVeredicto, SIMBOLO_CASO } from "@/lib/narration/pronostico";
import { TEXTOS_PRONOSTICO } from "@/lib/narration/textos-pronostico";
import { formatQuantity, quantityDecimals } from "@/lib/quantity";
import { pedirPronostico } from "@/lib/simulador/pedir";
import type { PronosticoSent } from "@/workers/contrato-pronostico";
import type { ForecastResult } from "@/workers/protocol";
import { GraficoPronostico } from "./GraficoPronostico";

type Orden = Exclude<OrdenFecha, "iso">;

type Listo = {
  readonly r: ForecastResult;
  readonly serie: Serie;
  readonly valores: readonly number[];
  readonly completado: readonly boolean[];
  readonly columna: string;
};

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "calculando" }
  | { readonly tipo: "lista"; readonly listo: Listo }
  | { readonly tipo: "error"; readonly motivo: string };

const OPCIONES_PERIODO: readonly Periodo[] = ["dia", "semana", "mes"];

export type PronosticoPanelProps = {
  /** La tabla tal como llegó el archivo: el saneamiento descarta la fecha por «identificador», y aquí hace falta. */
  readonly getTable: () => CsvTable | null;
  readonly worker?: RefObject<Worker | null>;
  readonly datasetName: string | null;
};

const selectClase =
  "min-h-11 rounded-md border border-hairline bg-surface px-3 text-sm";

export function PronosticoPanel({
  getTable,
  worker,
  datasetName,
}: PronosticoPanelProps) {
  const t = useTextosEtapa(TEXTOS_PRONOSTICO);
  const { locale } = useI18n();
  const id = useId();
  const tabla = getTable();
  const perfiles = useMemo(() => (tabla ? profileTable(tabla) : []), [tabla]);
  const columnasFecha = perfiles.filter((p) => p.looksLikeDate).map((p) => p.name);
  const columnasNumero = perfiles.filter((p) => p.kind === "numeric").map((p) => p.name);
  const [fechaCol, setFechaCol] = useState(columnasFecha[0] ?? "");
  const [valorCol, setValorCol] = useState(columnasNumero[0] ?? "");
  const [orden, setOrden] = useState<Orden | null>(null);
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [agregado, setAgregado] = useState<Agregado | null>(null);
  /** Lo que el usuario lleva escrito en el campo del horizonte, tal cual: se ajusta al rango al salir del campo o al pedir, no mientras teclea. */
  const [horizonteTexto, setHorizonteTexto] = useState<string | null>(null);
  const [completar, setCompletar] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const pedido = useRef(false);

  /** Cualquier cambio de entrada borra la lectura anterior: un resultado es de las entradas con que se pidió. */
  const cambia =
    <T,>(poner: (v: T) => void) =>
    (v: T) => {
      poner(v);
      setEstado({ tipo: "inactivo" });
    };

  const lectura = useMemo(() => {
    if (!tabla || fechaCol === "" || valorCol === "") return null;
    const i = tabla.headers.indexOf(fechaCol);
    const j = tabla.headers.indexOf(valorCol);
    if (i < 0 || j < 0) return null;
    const crudas = columnValues(tabla, i);
    const fechas = leerFechas(crudas, orden);
    const porFila =
      fechas.tipo === "leida" ? fechasPorFila(crudas, orden) : null;
    const numeros = columnValues(tabla, j).map((v) => parseNumber(v));
    return { fechas, porFila, numeros };
  }, [tabla, fechaCol, valorCol, orden]);

  if (columnasFecha.length === 0 || columnasNumero.length === 0)
    return (
      <PanelMarco t={t}>
        <p role="status" className="mt-3 text-sm text-ink-muted">
          {t("pronostico.sin_serie")}
        </p>
      </PanelMarco>
    );

  const propuesto = lectura?.porFila
    ? proponerPeriodo(lectura.porFila.fechas)
    : null;
  const periodoEf: Periodo = periodo ?? propuesto ?? "mes";
  const agregadoEf: Agregado = agregado ?? proponerAgregado(valorCol);
  const horizonteEscrito =
    horizonteTexto === null || horizonteTexto.trim() === ""
      ? HORIZONTE_DEFECTO[periodoEf]
      : Math.trunc(Number(horizonteTexto));
  const horizonteEf = Math.min(
    HORIZONTE_MAX,
    Math.max(
      1,
      Number.isFinite(horizonteEscrito)
        ? horizonteEscrito
        : HORIZONTE_DEFECTO[periodoEf],
    ),
  );
  const armada = lectura?.porFila
    ? armarSerie(lectura.porFila.fechas, lectura.numeros, periodoEf, agregadoEf)
    : null;
  const serie = armada?.ok ? armada.serie : null;
  const huecos = serie?.huecos.length ?? 0;
  const completable = serie ? sePuedeCompletar(serie) : false;
  const listoParaPedir =
    serie !== null && (huecos === 0 || (completable && completar)) && !!worker;

  const pedir = async () => {
    const w = worker?.current;
    if (!w || !serie || pedido.current) return;
    pedido.current = true;
    setEstado({ tipo: "calculando" });
    try {
      const { valores, completado } =
        huecos > 0
          ? completarLineal(serie.valores)
          : {
              valores: serie.valores as number[],
              completado: serie.valores.map(() => false),
            };
      const sent: PronosticoSent = {
        n: valores.length,
        season: TEMPORADA[periodoEf],
        horizon: horizonteEf,
        period: periodoEf,
      };
      const r = await pedirPronostico(
        w,
        {
          y: valores,
          season: sent.season,
          horizon: sent.horizon,
          period: sent.period,
        },
        sent,
      );
      setEstado({
        tipo: "lista",
        listo: { r, serie, valores, completado, columna: valorCol },
      });
    } catch (e) {
      setEstado({
        tipo: "error",
        motivo: e instanceof Error ? e.message : "worker",
      });
    } finally {
      pedido.current = false;
    }
  };

  return (
    <PanelMarco t={t}>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Campo etiqueta={t("pronostico.fecha")} id={`${id}-fecha`}>
          <select
            id={`${id}-fecha`}
            className={selectClase}
            value={fechaCol}
            onChange={(e) => {
              cambia(setFechaCol)(e.target.value);
              setOrden(null);
            }}
          >
            {columnasFecha.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={t("pronostico.valor")} id={`${id}-valor`}>
          <select
            id={`${id}-valor`}
            className={selectClase}
            value={valorCol}
            onChange={(e) => cambia(setValorCol)(e.target.value)}
          >
            {columnasNumero.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {lectura?.fechas.tipo === "ambigua" && (
        <fieldset
          className="mt-4 flex flex-col gap-2 text-sm"
          data-testid="pronostico-orden"
        >
          <legend className="font-medium">
            {t("pronostico.orden.pregunta", { columna: fechaCol })}
          </legend>
          {(["dia-mes", "mes-dia"] as const).map((o) => (
            <label key={o} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name={`${id}-orden`}
                checked={orden === o}
                onChange={() => cambia(setOrden)(o)}
              />
              {t(`pronostico.orden.${o === "dia-mes" ? "dia_mes" : "mes_dia"}`)}
            </label>
          ))}
        </fieldset>
      )}
      {(lectura?.fechas.tipo === "mezclada" ||
        lectura?.fechas.tipo === "ninguna") && (
        <p role="status" className="mt-4 text-sm text-caution">
          <span aria-hidden="true" className="mr-1">
            ⚠
          </span>
          {t(`pronostico.lectura.${lectura.fechas.tipo}`, {
            columna: fechaCol,
          })}
        </p>
      )}

      {lectura?.porFila && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Campo
            etiqueta={t("pronostico.periodo.etiqueta")}
            id={`${id}-periodo`}
          >
            <select
              id={`${id}-periodo`}
              className={selectClase}
              value={periodoEf}
              onChange={(e) => {
                cambia(setPeriodo)(e.target.value as Periodo);
                setHorizonteTexto(null);
              }}
            >
              {OPCIONES_PERIODO.map((p) => (
                <option key={p} value={p}>
                  {t(`pronostico.periodo.${p}`)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            etiqueta={t("pronostico.agregado.etiqueta")}
            id={`${id}-agregado`}
          >
            <select
              id={`${id}-agregado`}
              className={selectClase}
              value={agregadoEf}
              onChange={(e) => cambia(setAgregado)(e.target.value as Agregado)}
            >
              <option value="suma">{t("pronostico.agregado.suma")}</option>
              <option value="promedio">
                {t("pronostico.agregado.promedio")}
              </option>
            </select>
          </Campo>
          <Campo etiqueta={t("pronostico.horizonte")} id={`${id}-horizonte`}>
            <input
              id={`${id}-horizonte`}
              type="number"
              inputMode="numeric"
              min={1}
              max={HORIZONTE_MAX}
              className={selectClase}
              value={horizonteTexto ?? String(horizonteEf)}
              onChange={(e) => cambia(setHorizonteTexto)(e.target.value)}
              onBlur={() => setHorizonteTexto(String(horizonteEf))}
            />
          </Campo>
          <p className="text-xs text-ink-muted sm:col-span-3">
            {periodo === null
              ? propuesto
                ? t("pronostico.periodo.propuesto")
                : t("pronostico.periodo.sin_propuesta")
              : ""}{" "}
            {agregado === null ? t("pronostico.agregado.propuesto") : ""}
          </p>
        </div>
      )}

      {armada && !armada.ok && (
        <p role="status" className="mt-4 text-sm text-caution">
          <span aria-hidden="true" className="mr-1">
            ⚠
          </span>
          {t(
            `pronostico.${armada.motivo === "sin-filas" ? "sin_filas" : armada.motivo === "muy-larga" ? "muy_larga" : "una_sola"}`,
            {
              max: formatQuantity(PERIODOS_MAX, 0),
            },
          )}
        </p>
      )}

      {serie && (
        <div
          className="mt-4 flex flex-col gap-2 text-sm"
          data-testid="pronostico-serie"
        >
          <p>
            {t("pronostico.serie", {
              n: serie.valores.length,
              count: serie.valores.length,
              desde: etiquetaDe(serie.desde, serie.periodo),
              hasta: etiquetaDe(
                serie.desde + serie.valores.length - 1,
                serie.periodo,
              ),
              filas: formatQuantity(serie.filas.usadas, 0),
              sin_fecha: formatQuantity(serie.filas.sinFecha, 0),
              sin_valor: formatQuantity(serie.filas.sinValor, 0),
            })}
          </p>
          {serie.quitados.length > 0 && (
            <p className="text-ink-muted">
              {t("pronostico.quitados", { lista: serie.quitados.join(", ") })}
            </p>
          )}
          {huecos > 0 && (
            <div
              className="flex flex-col gap-2 rounded-md border border-hairline p-3"
              data-testid="pronostico-huecos"
            >
              <p>
                <span aria-hidden="true" className="mr-1 text-caution">
                  ⚠
                </span>
                {t("pronostico.huecos.titulo", {
                  count: huecos,
                  lista: serie.huecos.slice(0, 5).join(", "),
                  mas:
                    huecos > 5
                      ? t("pronostico.huecos.mas", { resto: huecos - 5 })
                      : "",
                })}
              </p>
              {completable ? (
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={completar}
                    onChange={(e) => cambia(setCompletar)(e.target.checked)}
                  />
                  {t("pronostico.huecos.completar")}
                </label>
              ) : (
                <p className="text-negative">
                  <span aria-hidden="true" className="mr-1">
                    ✕
                  </span>
                  {t("pronostico.huecos.demasiados", {
                    pct: formatQuantity(
                      (huecos / serie.valores.length) * 100,
                      0,
                    ),
                  })}
                </p>
              )}
              {completable && !completar && (
                <p className="text-ink-muted">
                  {t("pronostico.huecos.obligatorio")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          icon="play"
          type="button"
          onClick={pedir}
          disabled={!listoParaPedir || estado.tipo === "calculando"}
        >
          {t("pronostico.boton")}
        </Button>
        {estado.tipo === "calculando" && (
          <span role="status" className="text-sm text-ink-muted">
            {t("pronostico.calculando")}
          </span>
        )}
      </div>
      {estado.tipo === "error" && (
        <p role="alert" className="mt-3 text-sm text-negative">
          <span aria-hidden="true" className="mr-1">
            ✕
          </span>
          {t("pronostico.error", { motivo: estado.motivo })}
        </p>
      )}
      <div aria-live="polite" data-testid="pronostico-vivo">
        {estado.tipo === "lista" && (
          <Lectura
            listo={estado.listo}
            t={t}
            locale={locale}
            nombreArchivo={`pronostico-${datasetSlug(datasetName ?? "") || "serie"}.csv`}
          />
        )}
      </div>
    </PanelMarco>
  );
}

type T = (key: string, params?: Record<string, string | number>) => string;

function PanelMarco({ t, children }: { t: T; children: React.ReactNode }) {
  return (
    <section aria-labelledby="pronostico-title" data-testid="pronostico-panel">
      <Card className="p-5">
        <h2 id="pronostico-title" className="text-sm font-semibold">
          {t("pronostico.titulo")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("pronostico.ayuda")}</p>
        {children}
      </Card>
    </section>
  );
}

function Campo({
  etiqueta,
  id,
  children,
}: {
  etiqueta: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

function Lectura({
  listo,
  t,
  locale,
  nombreArchivo,
}: {
  listo: Listo;
  t: T;
  locale: "es" | "en";
  nombreArchivo: string;
}) {
  const { r, serie, valores, completado, columna } = listo;
  if (!r.viable)
    return (
      <p
        role="status"
        className="mt-4 text-sm text-caution"
        data-testid="pronostico-corta"
      >
        <span aria-hidden="true" className="mr-1">
          ⚠
        </span>
        {t("pronostico.corta", {
          horizonte: r.horizon,
          n: formatQuantity(r.n, 0),
          necesarios: formatQuantity(r.needed, 0),
        })}
      </p>
    );
  return (
    <Resultado
      r={r}
      serie={serie}
      valores={valores}
      completado={completado}
      columna={columna}
      t={t}
      locale={locale}
      nombreArchivo={nombreArchivo}
    />
  );
}

function Resultado({
  r,
  serie,
  valores,
  completado,
  columna,
  t,
  locale,
  nombreArchivo,
}: {
  r: PronosticoViable;
  serie: Serie;
  valores: readonly number[];
  completado: readonly boolean[];
  columna: string;
  t: T;
  locale: "es" | "en";
  nombreArchivo: string;
}) {
  const veredicto = useMemo(() => veredictoDe(r), [r]);
  const frase = fraseVeredicto(
    veredicto,
    { columna, horizonte: r.horizon, pliegues: r.origins.length },
    locale,
  );
  const maes = r.league.flatMap((f) => (f.cv ? [f.cv.mean] : []));
  const dec = quantityDecimals(maes);
  const titulo =
    veredicto.caso === "supera"
      ? "supera"
      : veredicto.caso === "empata"
        ? "empata"
        : "no_supera";
  const hayCompletados = completado.some(Boolean);
  const datos = useMemo(
    () => ({
      etiquetas: [...etiquetasDe(serie), ...periodosFuturos(serie, r.horizon)],
      historia: valores,
      completado,
      pronostico: r.forecast,
      lo80: r.lo80,
      hi80: r.hi80,
      lo95: r.lo95,
      hi95: r.hi95,
    }),
    [serie, valores, completado, r],
  );
  const futuras = datos.etiquetas.slice(valores.length);
  const descargar = () =>
    downloadTextFile(
      nombreArchivo,
      csvDelPronostico(serie, valores, completado, r, {
        periodo: t("pronostico.csv.periodo"),
        tipo: t("pronostico.csv.tipo"),
        valor: t("pronostico.csv.valor"),
        inferior80: t("pronostico.csv.inferior80"),
        superior80: t("pronostico.csv.superior80"),
        inferior95: t("pronostico.csv.inferior95"),
        superior95: t("pronostico.csv.superior95"),
        completado: t("pronostico.csv.completado"),
        historia: t("pronostico.csv.historia"),
        pronostico: t("pronostico.csv.pronostico"),
        si: t("pronostico.csv.si"),
        no: t("pronostico.csv.no"),
      }),
      "text/csv;charset=utf-8",
    );
  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="pronostico-lectura">
      <div className="flex flex-col gap-1" data-testid="pronostico-veredicto">
        <p
          className={`text-sm font-semibold ${veredicto.caso === "supera" ? "text-ink" : "text-caution"}`}
        >
          <span aria-hidden="true" className="mr-1">
            {SIMBOLO_CASO[veredicto.caso]}
          </span>
          {t(`pronostico.veredicto.titulo.${titulo}`)}
        </p>
        <p className="text-sm">{frase.texto}</p>
        {r.truncated && (
          <p className="text-xs text-ink-muted">
            {t("pronostico.truncada", {
              n_input: formatQuantity(r.n_input, 0),
              n: formatQuantity(r.n, 0),
            })}
          </p>
        )}
      </div>

      <GraficoPronostico
        datos={datos}
        textos={{
          titulo: t("pronostico.grafico.titulo"),
          etiqueta: t("pronostico.grafico.etiqueta", {
            n: valores.length,
            horizonte: r.horizon,
          }),
          historia: t("pronostico.grafico.historia"),
          pronostico: t("pronostico.grafico.pronostico"),
          banda80: t("pronostico.grafico.banda80"),
          banda95: t("pronostico.grafico.banda95"),
          nota: t("pronostico.grafico.bandas_nota", {
            pliegues: r.origins.length,
          }),
          completado: hayCompletados
            ? t("pronostico.grafico.completado")
            : null,
        }}
      />

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          {t("pronostico.grafico.tabla")}
        </summary>
        <div
          className="overflow-x-auto"
          role="region"
          tabIndex={0}
          aria-label={t("pronostico.grafico.tabla")}
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {[
                  "tabla_periodo",
                  "tabla_pronostico",
                  "tabla_80",
                  "tabla_95",
                ].map((k) => (
                  <th
                    key={k}
                    scope="col"
                    className="border-b border-hairline px-2 py-1 font-medium"
                  >
                    {t(`pronostico.grafico.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {futuras.map((p, i) => (
                <tr key={p}>
                  <th
                    scope="row"
                    className="border-b border-hairline px-2 py-1 font-normal"
                  >
                    {p}
                  </th>
                  <td className="border-b border-hairline px-2 py-1">
                    {formatQuantity(r.forecast[i]!, dec)}
                  </td>
                  <td className="border-b border-hairline px-2 py-1">
                    {formatQuantity(r.lo80[i]!, dec)} –{" "}
                    {formatQuantity(r.hi80[i]!, dec)}
                  </td>
                  <td className="border-b border-hairline px-2 py-1">
                    {formatQuantity(r.lo95[i]!, dec)} –{" "}
                    {formatQuantity(r.hi95[i]!, dec)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-col gap-2" data-testid="pronostico-liga">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("pronostico.liga.titulo")}
        </h3>
        <p className="text-xs text-ink-muted">
          {t("pronostico.liga.detalle", {
            pliegues: r.origins.length,
            horizonte: r.horizon,
            columna,
          })}
        </p>
        <div
          className="overflow-x-auto"
          role="region"
          tabIndex={0}
          aria-label={t("pronostico.liga.titulo")}
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {["metodo", "error", "mase", "marca"].map((k) => (
                  <th
                    key={k}
                    scope="col"
                    className="border-b border-hairline px-2 py-1 font-medium"
                  >
                    {t(`pronostico.liga.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METODOS.map((m) => {
                const fila = r.league.find((f) => f.name === m)!;
                const gana = m === r.winner;
                const simple = m === r.best_simple;
                return (
                  <tr key={m} className={gana ? "bg-accent/5" : ""}>
                    <th
                      scope="row"
                      className="border-b border-hairline px-2 py-1 font-normal"
                    >
                      {t(`pronostico.metodo.${m}`)}
                    </th>
                    <td className="border-b border-hairline px-2 py-1 font-mono tabular-nums">
                      {fila.cv ? formatQuantity(fila.cv.mean, dec) : "—"}
                    </td>
                    <td className="border-b border-hairline px-2 py-1 font-mono tabular-nums">
                      {fila.mase !== null ? formatQuantity(fila.mase, 2) : "—"}
                    </td>
                    <td className="border-b border-hairline px-2 py-1">
                      {fila.status === "skipped"
                        ? `${t("pronostico.liga.no_compite")}: ${t(`pronostico.liga.razon.${fila.reason}`)}`
                        : gana && simple
                          ? t("pronostico.liga.ganador_simple")
                          : gana
                            ? t("pronostico.liga.ganador")
                            : simple
                              ? t("pronostico.liga.simple")
                              : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-muted">
          {t("pronostico.liga.mase_ayuda")}
        </p>
        {!r.seasonal_ok && (
          <p
            className="text-xs text-ink-muted"
            data-testid="pronostico-sin-temporada"
          >
            {t("pronostico.temporada.sin_dos", { temporada: r.season })}
          </p>
        )}
        {r.seasonal_ok && (
          <p className="text-xs text-ink-muted">
            {t("pronostico.temporada.con", { temporada: r.season })}
          </p>
        )}
      </div>

      <div>
        <Button
          icon="download"
          variant="secondary"
          type="button"
          onClick={descargar}
          data-testid="pronostico-descargar"
        >
          {t("pronostico.descargar")}
        </Button>
      </div>
    </div>
  );
}

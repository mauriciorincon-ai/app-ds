"use client";

// Protocolo DS (S13), etapa 8 — la pantalla. Lo que se abre (la prueba sellada, el ganador, las columnas) y el
// aviso de que se abre una vez; «Abrir la prueba» con su progreso y cancelar; y con la prueba abierta, la
// medida (el ganador, la línea base y tu regla, con su intervalo, y el optimismo de la selección), el error por
// segmento con su soporte, la calibración y los peores casos. Los peores casos son filas de TUS datos y se
// pintan solo aquí: no se registran, no se exportan y no salen del navegador. Hasta el clic en «Abrir la
// prueba» ninguna fila de la prueba sale del hilo principal. Se carga diferida (formularios.tsx).
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { byTask } from "@/engine/despacho";
import { REMUESTREOS } from "@/engine/protocolo/bootstrap";
import { SOPORTE_TRAMO } from "@/engine/protocolo/calibracion";
import { decisionGanador } from "@/engine/protocolo/comparacion";
import { por100, resumenEtapa5 } from "@/engine/protocolo/etapa5";
import {
  ETAPA_8,
  PATRON_MAX,
  claveApertura,
  datosEtapa8,
  peoresCasos,
  plan8,
  tramosDe,
  type Plan8,
} from "@/engine/protocolo/etapa8";
import type { Segmento } from "@/engine/protocolo/segmentos";
import {
  SOPORTE_CASOS,
  SOPORTE_FILAS,
  conSoporte,
} from "@/engine/protocolo/segmentos";
import { mapa, numero, texto } from "@/engine/protocolo/valores";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { cifra, huellaCorta, proporcion } from "@/lib/protocolo/formato";
import { envio8 } from "@/lib/protocolo/prueba8";
import { usePrueba } from "@/lib/protocolo/usePrueba";
import { formatQuantity, thousands } from "@/lib/quantity";
import type { TestResult } from "@/workers/protocol";
import { CampoArea } from "./campos";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";
import { segmentoTexto } from "./segmento-texto";
import { TEXTOS_ETAPA_8 } from "./textos/etapa8";

type Traduce = ReturnType<typeof useTextosEtapa>;

const Seccion = ({
  titulo,
  testid,
  children,
}: {
  titulo: string;
  testid: string;
  children: React.ReactNode;
}) => (
  <section
    className="flex flex-col gap-2 rounded-md border border-hairline p-3 text-sm"
    data-testid={testid}
  >
    <h3 className="font-medium">{titulo}</h3>
    {children}
  </section>
);

const Th = ({
  children,
  derecha = false,
}: {
  children: React.ReactNode;
  derecha?: boolean;
}) => (
  <th
    scope="col"
    className={`py-1 pr-3 font-medium ${derecha ? "text-right" : ""}`}
  >
    {children}
  </th>
);

const n100 = (x: number | null) => (x === null ? "—" : cifra(por100(x)));
const pct = (x: number) => formatQuantity(x * 100, 0);

/** El nombre de un segmento, con el rango de su tramo cuando es numérico. */
function nombreDe(t: Traduce, s: Segmento): string {
  const nombre = segmentoTexto(t, s.id);
  if (s.tipo !== "tramo") return nombre;
  const rango =
    s.desde === null
      ? t("protocol.stage.8.segments.range-open-low", {
          hasta: cifra(s.hasta!),
        })
      : s.hasta === null
        ? t("protocol.stage.8.segments.range-open-high", {
            desde: cifra(s.desde),
          })
        : t("protocol.stage.8.segments.range", {
            desde: cifra(s.desde),
            hasta: cifra(s.hasta),
          });
  return `${nombre} (${rango})`;
}

/** Lo que dijo el modelo en una fila de la prueba, dicho como se decide. */
function dichoDe(t: Traduce, plan: Plan8, r: TestResult, i: number): string {
  const costos = plan.plan7.costos;
  if (!costos) return "—";
  const d = decisionGanador(costos, r)(i);
  if (typeof d === "boolean")
    return t(
      d ? "protocol.stage.5.summary.act" : "protocol.stage.5.summary.no-act",
    );
  return typeof d === "number" ? cifra(d) : d;
}

export function Etapa8Form({
  datos,
  anterior,
  previas,
  aperturas = 0,
  onApertura,
  onRegistrar,
}: PropsFormulario) {
  const t = useTextosEtapa(TEXTOS_ETAPA_8);
  const tabla = datos?.tabla ?? null;
  const huella = datos?.carga.sha256 ?? null;
  const [patron, setPatron] = useState(
    () => texto(anterior?.respuestas ?? {}, "patron") ?? "",
  );
  const plan = useMemo(
    () => (tabla ? plan8(tabla, previas, huella) : null),
    [tabla, previas, huella],
  );
  const envio = useMemo(
    () => (tabla && plan ? envio8(tabla, plan, huella) : null),
    [tabla, plan, huella],
  );
  const { estado, abrir, cancelar } = usePrueba();
  const corrida = estado.tipo === "lista" ? estado.corrida : null;
  const contadas = aperturas > 0 ? aperturas : null;
  const registro = useMemo(
    () =>
      tabla
        ? datosEtapa8(tabla, previas, huella, corrida, { patron }, contadas)
        : null,
    [tabla, previas, huella, corrida, patron, contadas],
  );
  const peores = useMemo(
    () => (plan && corrida ? peoresCasos(plan, corrida) : []),
    [plan, corrida],
  );

  if (!tabla || !plan || !registro)
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.8.need-data")}
      </p>
    );

  const p7 = plan.plan7;
  const c = registro.chequeos;
  const modelo = (id: string) => t(`results.candidates.short.${id}`);
  const columnas = [...p7.numericas, ...p7.categoricas];
  const ocupado = estado.tipo === "cargando" || estado.tipo === "midiendo";
  const r5 = previas[5] ? resumenEtapa5(previas[5]) : null;
  const nombreBase = (id: string) =>
    t(`protocol.stage.5.ref.${id}`, {
      clase: r5?.claseMayoritaria ?? "",
      opcion: r5?.opcionBarata ?? "",
    });

  const estadoTexto =
    estado.tipo === "cargando"
      ? t("protocol.stage.8.open.loading")
      : estado.tipo === "midiendo"
        ? t("protocol.stage.8.open.measuring")
        : estado.tipo === "cancelada"
          ? t("protocol.stage.8.open.cancelled")
          : estado.tipo === "error"
            ? t("protocol.stage.8.open.error", { motivo: estado.motivo })
            : "";

  const al = () => {
    const clave = huella ? claveApertura(huella, plan) : null;
    if (clave) onApertura?.(clave);
  };

  const ganador = texto(c, "ganador");
  const metrica = texto(c, "metrica");
  const [seleccion, enPrueba, optimismo] = [
    numero(c, "seleccion"),
    numero(c, "prueba_metrica"),
    numero(c, "optimismo"),
  ];
  const segN = mapa(c, "seg_n") ?? {};
  const segCasos = mapa(c, "seg_casos");
  const segCosto = mapa(c, "seg_costo") ?? {};
  const peor = texto(c, "peor_segmento");
  const soportados = numero(c, "seg_con_soporte");
  const tramos = tramosDe(c);
  const lectura = numero(c, "cal_lectura");
  const filaLectura =
    lectura !== null && tramos ? (tramos[lectura - 1] ?? null) : null;
  const k = tramos?.length ?? 0;
  const objetivo = p7.objetivo;
  const verdad = (f: number) =>
    p7.diseno.clases
      ? (p7.diseno.clases[f] ?? "—")
      : cifra(p7.diseno.valores?.[f] ?? 0);
  const indices = columnas.map((col) => tabla.headers.indexOf(col));

  return (
    <div className="flex flex-col gap-4">
      <Seccion
        titulo={t("protocol.stage.8.opens.title")}
        testid="protocolo-abre8"
      >
        <ul className="flex flex-col gap-1 text-ink-muted [overflow-wrap:anywhere]">
          <li>
            {t("protocol.stage.8.opens.test", {
              n: thousands(p7.particion.prueba.length),
              sello: huellaCorta(p7.sello6),
            })}
          </li>
          {plan.ganador && (
            <li>
              {t("protocol.stage.8.opens.train", {
                ganador: modelo(plan.ganador),
                n: thousands(p7.particion.entrenamiento.length),
              })}
            </li>
          )}
          <li>
            {t("protocol.stage.8.opens.columns", {
              n: columnas.length,
              lista: columnas.join(", "),
            })}
          </li>
        </ul>
        <p className="font-medium">{t("protocol.stage.8.opens.once")}</p>
        {aperturas > 0 && (
          <p data-testid="protocolo-aperturas">
            {t("protocol.stage.8.opens.count", { count: aperturas })}
          </p>
        )}
        {!plan.selloOk ? (
          <p className="text-caution">
            <span aria-hidden="true">⚠ </span>
            {t("protocol.stage.8.opens.seal-bad")}
          </p>
        ) : (
          envio === null && (
            <p className="text-caution">
              <span aria-hidden="true">⚠ </span>
              {t("protocol.stage.8.opens.cannot")}
            </p>
          )
        )}
      </Seccion>

      <div className="flex flex-col gap-2" data-testid="protocolo-abrir">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={corrida || aperturas > 0 ? "retry" : "eye"}
            disabled={envio === null || ocupado}
            onClick={() => envio && abrir(envio, al)}
          >
            {corrida || aperturas > 0
              ? t("protocol.stage.8.open.again")
              : t("protocol.stage.8.open.button")}
          </Button>
          {ocupado && (
            <Button icon="stop" variant="secondary" onClick={cancelar}>
              {t("protocol.stage.8.open.cancel")}
            </Button>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${estado.tipo === "error" ? "text-caution" : "text-ink-muted"}`}
          data-testid="protocolo-progreso8"
        >
          {estadoTexto}
        </p>
        <p className="text-xs text-ink-muted">
          {t("protocol.stage.8.open.note")}
        </p>
      </div>

      {corrida && ganador && (
        <>
          <Seccion
            titulo={t("protocol.stage.8.measure.title")}
            testid="protocolo-medida8"
          >
            <table className="w-full text-left">
              <thead className="text-ink-muted">
                <tr>
                  <Th>{t("protocol.stage.8.measure.col-who")}</Th>
                  <Th derecha>{t("protocol.stage.8.measure.col-cost")}</Th>
                  <Th derecha>{t("protocol.stage.8.measure.col-interval")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {(
                  [
                    [
                      t("protocol.stage.8.measure.winner", {
                        ganador: modelo(ganador),
                      }),
                      "ganador",
                    ],
                    ...(texto(c, "base_id")
                      ? [
                          [
                            t("protocol.stage.8.measure.base", {
                              base: nombreBase(texto(c, "base_id")!),
                            }),
                            "base",
                          ],
                        ]
                      : []),
                    ...(numero(c, "regla_costo") !== null
                      ? [[t("protocol.stage.8.measure.rule"), "regla"]]
                      : []),
                  ] as [string, string][]
                ).map(([quien, id]) => (
                  <tr key={id} data-testid={`protocolo-medida8-${id}`}>
                    <td className="py-1 pr-3 [overflow-wrap:anywhere]">
                      {quien}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {n100(numero(c, `${id}_costo`))}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {t("protocol.stage.8.measure.interval", {
                        bajo: n100(numero(c, `${id}_bajo`)),
                        alto: n100(numero(c, `${id}_alto`)),
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {numero(c, "regla_costo") === null && (
              <p className="text-ink-muted">
                {t("protocol.stage.8.measure.no-rule")}
              </p>
            )}
            <p className="text-ink-muted">
              {t("protocol.stage.8.measure.how", {
                conglomerado: t(
                  `protocol.stage.8.measure.cluster.${plan.conglomerado}`,
                ),
                b: thousands(REMUESTREOS),
              })}
            </p>
            {seleccion !== null && enPrueba !== null && metrica && (
              <p data-testid="protocolo-optimismo">
                {t("protocol.stage.8.measure.optimism", {
                  seleccion: cifra(seleccion),
                  metrica: t(`results.metrics.${metrica}`),
                  prueba: cifra(enPrueba),
                })}{" "}
                {optimismo !== null && optimismo > 0
                  ? t("protocol.stage.8.measure.optimism-gap", {
                      optimismo: cifra(optimismo),
                    })
                  : t("protocol.stage.8.measure.optimism-none")}
              </p>
            )}
          </Seccion>

          <Seccion
            titulo={t("protocol.stage.8.segments.title")}
            testid="protocolo-segmentos"
          >
            <p>
              {t("protocol.stage.8.segments.global", {
                costo: n100(numero(c, "ganador_costo")),
              })}
            </p>
            {plan.segmentos.length === 0 ? (
              <p className="text-ink-muted">
                {t("protocol.stage.8.segments.empty")}
              </p>
            ) : (
              <div
                className="overflow-x-auto"
                role="region"
                tabIndex={0}
                aria-label={t("protocol.stage.8.segments.title")}
              >
                <table className="w-full text-left">
                  <thead className="text-ink-muted">
                    <tr>
                      <Th>{t("protocol.stage.8.segments.col-segment")}</Th>
                      <Th derecha>{t("protocol.stage.8.segments.col-rows")}</Th>
                      {segCasos && plan.claseRara !== null && (
                        <Th derecha>
                          {t("protocol.stage.8.segments.col-cases", {
                            clase: plan.claseRara,
                          })}
                        </Th>
                      )}
                      <Th derecha>{t("protocol.stage.8.segments.col-cost")}</Th>
                      <Th>{t("protocol.stage.8.segments.col-read")}</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {plan.segmentos.map((s) => {
                      const filas = segN[s.id] ?? s.filas.length;
                      const casos =
                        segCasos && Object.hasOwn(segCasos, s.id)
                          ? segCasos[s.id]!
                          : null;
                      const soporta = conSoporte(
                        filas,
                        segCasos ? (casos ?? 0) : null,
                      );
                      const esPeor = peor === s.id;
                      return (
                        <tr
                          key={s.id}
                          data-testid="protocolo-segmento"
                          data-peor={esPeor || undefined}
                          className={esPeor ? "text-caution" : undefined}
                        >
                          <td className="py-1 pr-3 [overflow-wrap:anywhere]">
                            {nombreDe(t, s)}
                          </td>
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {thousands(filas)}
                          </td>
                          {segCasos && plan.claseRara !== null && (
                            <td className="py-1 pr-3 text-right tabular-nums">
                              {casos === null ? "—" : thousands(casos)}
                            </td>
                          )}
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {n100(
                              Object.hasOwn(segCosto, s.id)
                                ? segCosto[s.id]!
                                : null,
                            )}
                          </td>
                          <td className="py-1">
                            {esPeor ? (
                              <span className="font-medium">
                                <span aria-hidden="true">▲ </span>
                                {t("protocol.stage.8.segments.worst")}
                              </span>
                            ) : soporta ? (
                              t("protocol.stage.8.segments.supported")
                            ) : (
                              <span className="text-ink-muted">
                                {t("protocol.stage.8.segments.unsupported")}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {peor === "ninguno" && plan.segmentos.length > 0 && (
              <p className="text-caution">
                <span aria-hidden="true">⚠ </span>
                {t(
                  soportados === 0
                    ? "protocol.stage.8.segments.none"
                    : "protocol.stage.8.segments.none-worse",
                )}
              </p>
            )}
            <p className="text-xs text-ink-muted">
              {plan.claseRara !== null
                ? t("protocol.stage.8.segments.rule-cases", {
                    filas: SOPORTE_FILAS,
                    casos: SOPORTE_CASOS,
                  })
                : t("protocol.stage.8.segments.rule", {
                    filas: SOPORTE_FILAS,
                  })}
            </p>
          </Seccion>

          <Seccion
            titulo={t("protocol.stage.8.calibration.title")}
            testid="protocolo-calibracion"
          >
            {c.calibracion === "medida" && tramos ? (
              <>
                <p className="text-ink-muted">
                  {t(
                    byTask(p7.forma, {
                      binaria: "protocol.stage.8.calibration.what-binaria",
                      multiclase:
                        "protocol.stage.8.calibration.what-multiclase",
                      numerica: "protocol.stage.8.calibration.what-binaria",
                    }),
                  )}
                </p>
                <table className="w-full text-left">
                  <thead className="text-ink-muted">
                    <tr>
                      <Th>{t("protocol.stage.8.calibration.col-range")}</Th>
                      <Th derecha>{t("protocol.stage.8.calibration.col-n")}</Th>
                      <Th derecha>
                        {t("protocol.stage.8.calibration.col-said")}
                      </Th>
                      <Th derecha>
                        {t("protocol.stage.8.calibration.col-happened")}
                      </Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {tramos.map((tr, i) => (
                      <tr
                        key={i}
                        data-testid="protocolo-tramo"
                        className={tr.n === 0 ? "text-ink-muted" : undefined}
                      >
                        <td className="py-1 pr-3">
                          {t("protocol.stage.8.calibration.range", {
                            desde: pct(i / k),
                            hasta: pct((i + 1) / k),
                          })}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {thousands(tr.n)}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {tr.n === 0
                            ? "—"
                            : t("protocol.stage.8.calibration.pct", {
                                n: pct(tr.predicho),
                              })}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {tr.n === 0
                            ? "—"
                            : t("protocol.stage.8.calibration.pct", {
                                n: pct(tr.observado),
                              })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p data-testid="protocolo-brier">
                  {t("protocol.stage.8.calibration.brier", {
                    brier: proporcion(numero(c, "brier") ?? 0),
                    base: proporcion(numero(c, "brier_base") ?? 0),
                  })}
                </p>
                <p>
                  {filaLectura && lectura !== null
                    ? t("protocol.stage.8.calibration.reading", {
                        desde: pct((lectura - 1) / k),
                        hasta: pct(lectura / k),
                        observado: pct(filaLectura.observado),
                        n: thousands(filaLectura.n),
                      })
                    : t("protocol.stage.8.calibration.reading-none", {
                        n: SOPORTE_TRAMO,
                      })}
                </p>
              </>
            ) : (
              <p>
                {t(
                  c.calibracion === "no-aplica"
                    ? "protocol.stage.8.calibration.no-aplica"
                    : "protocol.stage.8.calibration.sin-probabilidades",
                )}
              </p>
            )}
            <p className="text-xs text-ink-muted">
              {t("protocol.stage.8.calibration.measures")}
            </p>
          </Seccion>

          <Seccion
            titulo={t("protocol.stage.8.worst.title")}
            testid="protocolo-peores"
          >
            {peores.length === 0 ? (
              <p>{t("protocol.stage.8.worst.empty")}</p>
            ) : (
              <>
                <p className="text-ink-muted">
                  {t("protocol.stage.8.worst.note", { n: peores.length })}
                </p>
                <div
                  className="overflow-x-auto"
                  role="region"
                  tabIndex={0}
                  aria-label={t("protocol.stage.8.worst.region")}
                >
                  <table className="w-full text-left">
                    <thead className="text-ink-muted">
                      <tr>
                        <Th>{t("protocol.stage.8.worst.col-row")}</Th>
                        <Th>
                          {t("protocol.stage.8.worst.col-truth")} ({objetivo})
                        </Th>
                        <Th>{t("protocol.stage.8.worst.col-said")}</Th>
                        {corrida.resultado.proba && (
                          <Th derecha>
                            {t("protocol.stage.8.worst.col-proba")}
                          </Th>
                        )}
                        <Th derecha>{t("protocol.stage.8.worst.col-cost")}</Th>
                        {columnas.map((col) => (
                          <Th key={col}>{col}</Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {peores.map((x) => (
                        <tr key={x.fila} data-testid="protocolo-peor">
                          <td className="py-1 pr-3 tabular-nums">
                            {thousands(x.fila + 1)}
                          </td>
                          <td className="py-1 pr-3">{verdad(x.fila)}</td>
                          <td className="py-1 pr-3">
                            {dichoDe(t, plan, corrida.resultado, x.posicion)}
                          </td>
                          {corrida.resultado.proba && (
                            <td className="py-1 pr-3 text-right tabular-nums">
                              {proporcion(
                                corrida.resultado.proba[x.posicion] ?? 0,
                              )}
                            </td>
                          )}
                          <td className="py-1 pr-3 text-right tabular-nums">
                            {cifra(x.costo)}
                          </td>
                          {indices.map((j, m) => (
                            <td
                              key={columnas[m]}
                              className="py-1 pr-3 whitespace-nowrap"
                            >
                              {tabla.rows[x.fila]?.[j] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Seccion>
        </>
      )}

      <div data-testid="protocolo-patron">
        <CampoArea
          etiqueta={t("protocol.stage.8.pattern.label")}
          ayuda={t("protocol.stage.8.pattern.help", { max: PATRON_MAX })}
          valor={patron}
          onCambio={setPatron}
          maximo={PATRON_MAX}
        />
      </div>

      <Trampas etapa={8} trampas={ETAPA_8.trampas(registro, previas)} />
      <Registrar
        etapa={8}
        deshabilitado={corrida === null}
        onClick={() => onRegistrar(registro)}
      />
    </div>
  );
}

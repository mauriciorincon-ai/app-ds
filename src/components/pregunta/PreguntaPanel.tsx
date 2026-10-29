"use client";

// S21 (ADR 030): «Pregúntale a tus datos», junto a la exploración. El lector es código determinista (nada de un modelo de lenguaje):
// la pregunta se lee en este navegador contra los nombres de las columnas y los valores de las categóricas, la consulta se MUESTRA en
// palabras y en SQL con lo que se comprobó (símbolo + palabra: el color nunca solo) y SOLO corre cuando el usuario pulsa «Correr la
// consulta». Lo ambiguo se pregunta con opciones; lo que no se leyó se dice. Ni la pregunta ni un valor de la tabla salen de aquí: no
// hay worker, ni petición, ni registro. La tabla es la que llegó (sin el saneamiento, que quitaría duplicados y cambiaría las sumas).
import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import {
  armarCatalogo,
  correr,
  csvDeResultado,
  nombreDeMedida,
  sePuedeCorrer,
  sqlDe,
  validar,
  type Agregacion,
  type Catalogo,
  type PeriodoConsulta,
  type QueryPlan,
  type Resultado,
} from "@/engine/consulta";
import { ejemplosDe, leerPregunta, type Lectura } from "@/engine/pregunta";
import {
  AGREGACIONES,
  PERIODOS as PERIODOS_LEXICO,
  PREGUNTA_MAX,
} from "@/engine/pregunta-lexico";
import { useI18n } from "@/i18n/provider";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import type { CsvTable } from "@/lib/ds/csv";
import { datasetSlug, downloadTextFile } from "@/lib/files";
import { decimalesDe, enPalabras, fraseResultado } from "@/lib/narration/consulta";
import { TEXTOS_PREGUNTA } from "@/lib/narration/textos-pregunta";
import { formatQuantity } from "@/lib/quantity";
import { GraficoConsulta } from "./GraficoConsulta";

export type PreguntaPanelProps = {
  /** La tabla tal como llegó. */
  readonly getTable: () => CsvTable | null;
  /** Los nombres que el aviso de datos personales marcó; `null` mientras el aviso todavía se está armando. */
  readonly personales: readonly string[] | null;
  readonly datasetName: string | null;
};

const SIMBOLO = { ok: "✓", aviso: "⚠", error: "✕" } as const;
const GRUPOS_EN_GRAFICO = 30;
// las listas salen del léxico, no de una copia a mano (auditoría A-18)
const AGREGACIONES_DE_NUMEROS = Object.keys(AGREGACIONES) as Agregacion[];
const PERIODOS = Object.keys(PERIODOS_LEXICO) as PeriodoConsulta[];

type Corrido = { readonly clave: string; readonly resultado: Resultado };

export function PreguntaPanel({
  getTable,
  personales,
  datasetName,
}: PreguntaPanelProps) {
  const t = useTextosEtapa(TEXTOS_PREGUNTA);
  const { locale } = useI18n();
  const tabla = getTable();
  const [texto, setTexto] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [ordenes, setOrdenes] = useState<Record<string, "dia-mes" | "mes-dia">>(
    {},
  );
  const [corrido, setCorrido] = useState<Corrido | null>(null);
  const [leido, setLeido] = useState<Catalogo | null>(null);

  const clavePersonales =
    personales === null ? null : personales.join("\u0000");
  // la tabla se lee en el siguiente turno, para que el panel pinte primero (con miles de filas son unas décimas de segundo)
  useEffect(() => {
    if (!tabla || clavePersonales === null) return;
    const id = setTimeout(
      () =>
        setLeido(
          armarCatalogo(tabla, {
            personales:
              clavePersonales === "" ? [] : clavePersonales.split("\u0000"),
            ordenes,
          }),
        ),
      0,
    );
    return () => clearTimeout(id);
  }, [tabla, clavePersonales, ordenes]);
  const catalogo = tabla && clavePersonales !== null ? leido : null;

  const lectura: Lectura | null = useMemo(
    () =>
      enviado !== null && catalogo
        ? leerPregunta(enviado, catalogo, respuestas)
        : null,
    [enviado, catalogo, respuestas],
  );
  const consulta = lectura && lectura.tipo === "consulta" ? lectura : null;
  const validaciones = useMemo(
    () => (consulta && catalogo ? validar(consulta.plan, catalogo) : []),
    [consulta, catalogo],
  );
  const sql = useMemo(
    () => (consulta && catalogo ? sqlDe(consulta.plan, catalogo) : ""),
    [consulta, catalogo],
  );
  const clavePlan = consulta ? JSON.stringify(consulta.plan) : null;
  const resultado =
    corrido && corrido.clave === clavePlan ? corrido.resultado : null;

  const ejemplos = useMemo(
    () => (catalogo ? ejemplosDe(catalogo, locale === "es" ? "es" : "en") : []),
    [catalogo, locale],
  );
  const fechasAmbiguas = (catalogo?.columnas ?? []).filter(
    (c) => c.tipo === "fecha" && c.ambigua,
  );
  const listoParaLeer = catalogo !== null && personales !== null;

  const entender = (pregunta: string) => {
    setEnviado(pregunta);
    setRespuestas({});
    setCorrido(null);
  };
  const cambiarTexto = (v: string) => {
    setTexto(v);
    setEnviado(null);
    setCorrido(null);
  };
  const responder = (id: string, valor: string) => {
    setRespuestas((r) => ({ ...r, [id]: valor }));
    setCorrido(null);
  };
  const ejecutar = () => {
    if (!consulta || !catalogo || !sePuedeCorrer(validaciones)) return;
    setCorrido({
      clave: JSON.stringify(consulta.plan),
      resultado: correr(consulta.plan, catalogo),
    });
  };

  const slug = datasetSlug(datasetName ?? "") || "datos";
  const descargar = () => {
    if (!consulta || !resultado) return;
    const csv = csvDeResultado(consulta.plan, resultado, {
      grupo: consulta.plan.agrupar?.columna ?? "",
      valor: nombreDeMedida(consulta.plan.medida),
      filas: t("pregunta.resultado.csv_filas"),
    });
    downloadTextFile(`consulta-${slug}.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <section aria-labelledby="pregunta-title" data-testid="pregunta-panel">
      <Card className="p-5">
        <h2 id="pregunta-title" className="text-sm font-semibold">
          {t("pregunta.titulo")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("pregunta.ayuda")}</p>

        {personales === null && (
          <p
            role="status"
            className="mt-3 text-sm text-ink-muted"
            data-testid="pregunta-revisando"
          >
            {t("pregunta.revisando")}
          </p>
        )}

        {fechasAmbiguas.map((c) => (
          <fieldset
            key={c.nombre}
            className="mt-3 flex flex-col gap-1 text-sm"
            data-testid="pregunta-orden"
          >
            <legend className="mb-1">
              {t("pregunta.orden.pregunta", { columna: c.nombre })}
            </legend>
            {(["dia-mes", "mes-dia"] as const).map((o) => (
              <label key={o} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`pregunta-orden-${c.nombre}`}
                  checked={ordenes[c.nombre] === o}
                  onChange={() => {
                    setOrdenes((x) => ({ ...x, [c.nombre]: o }));
                    setCorrido(null);
                  }}
                />
                {t(
                  o === "dia-mes"
                    ? "pregunta.orden.dia_mes"
                    : "pregunta.orden.mes_dia",
                )}
              </label>
            ))}
          </fieldset>
        ))}

        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (listoParaLeer) entender(texto);
          }}
        >
          <label htmlFor="pregunta-input" className="text-sm font-medium">
            {t("pregunta.etiqueta")}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="pregunta-input"
              data-testid="pregunta-input"
              type="text"
              maxLength={PREGUNTA_MAX}
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-hairline bg-surface px-3 text-sm"
              placeholder={t("pregunta.placeholder")}
              value={texto}
              onChange={(e) => cambiarTexto(e.target.value)}
            />
            <Button
              icon="sparkle"
              type="submit"
              disabled={!listoParaLeer || texto.trim() === ""}
              data-testid="pregunta-entender"
            >
              {t("pregunta.entender")}
            </Button>
          </div>
          {ejemplos.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2 text-sm"
              data-testid="pregunta-ejemplos"
            >
              <span className="text-ink-muted">{t("pregunta.ejemplos")}</span>
              {ejemplos.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="min-h-11 rounded-md border border-hairline px-3 hover:bg-sunken"
                  onClick={() => {
                    setTexto(e);
                    entender(e);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </form>

        <div aria-live="polite" data-testid="pregunta-lectura">
          {lectura && lectura.tipo === "no-entendi" && (
            <div className="mt-4 text-sm">
              <p role="status" className="text-caution">
                <span aria-hidden="true" className="mr-1">
                  ⚠
                </span>
                {t(`pregunta.no_entendi.${lectura.motivo.replace("-", "_")}`, {
                  max: PREGUNTA_MAX,
                })}
              </p>
              {lectura.noLeidas.length > 0 && (
                <p
                  className="mt-1 text-ink-muted"
                  data-testid="pregunta-sin-leer"
                >
                  {t("pregunta.sin_leer", {
                    lista: lectura.noLeidas.map((p) => `«${p}»`).join(", "),
                  })}
                </p>
              )}
            </div>
          )}

          {lectura && lectura.tipo === "pregunta" && (
            <div
              className="mt-4 flex flex-col gap-3 text-sm"
              data-testid="pregunta-abiertas"
            >
              <p className="font-medium">{t("pregunta.abierta.titulo")}</p>
              {lectura.abiertas.map((a) => (
                <fieldset
                  key={a.id}
                  className="flex flex-col gap-1"
                  data-testid={`pregunta-abierta-${a.tipo}`}
                >
                  <legend className="mb-1">
                    {t(`pregunta.abierta.${a.tipo}`, {
                      ...a.params,
                      ...(a.tipo === "anio"
                        ? { mes: t(`pregunta.meses.${a.params["mes"]}`) }
                        : {}),
                    })}
                  </legend>
                  {a.opciones.map((o) => (
                    <label
                      key={o.valor}
                      className="flex min-h-11 items-center gap-2"
                    >
                      <input
                        type="radio"
                        name={`pregunta-${a.id}`}
                        checked={respuestas[a.id] === o.valor}
                        onChange={() => responder(a.id, o.valor)}
                      />
                      <span className="font-mono">{o.etiqueta}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}

          {consulta && catalogo && (
            <div
              className="mt-4 flex flex-col gap-3 text-sm"
              data-testid="pregunta-entendida"
            >
              <h3 className="font-medium">{t("pregunta.entendida.titulo")}</h3>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  {t("pregunta.entendida.en_palabras")}
                </p>
                <p data-testid="pregunta-palabras">
                  {enPalabras(consulta.plan, locale)}
                </p>
              </div>

              {consulta.propuestos.length > 0 && (
                <div
                  className="flex flex-wrap items-end gap-4"
                  data-testid="pregunta-propuestos"
                >
                  {consulta.propuestos.includes("agregacion") && (
                    <label className="flex flex-col gap-1">
                      <span>
                        {t("pregunta.entendida.calcular")}{" "}
                        <span
                          className="rounded-full border border-caution/40 px-2 py-0.5 text-xs text-caution"
                          title={t("pregunta.entendida.propuesto_ayuda")}
                        >
                          {t(
                            respuestas["agregacion"] !== undefined
                              ? "pregunta.entendida.cambiado"
                              : "pregunta.entendida.propuesto",
                          )}
                        </span>
                      </span>
                      <select
                        className="min-h-11 rounded-md border border-hairline bg-surface px-3"
                        value={consulta.plan.medida.agregacion}
                        onChange={(e) =>
                          responder("agregacion", e.target.value)
                        }
                      >
                        {opcionesDeAgregacion(consulta.plan, catalogo).map(
                          (a) => (
                            <option key={a} value={a}>
                              {t(`pregunta.agregacion.${a}`)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  )}
                  {consulta.propuestos.includes("periodo") &&
                    consulta.plan.agrupar?.tipo === "tiempo" && (
                      <label className="flex flex-col gap-1">
                        <span>
                          {t("pregunta.entendida.periodo")}{" "}
                          <span
                            className="rounded-full border border-caution/40 px-2 py-0.5 text-xs text-caution"
                            title={t("pregunta.entendida.propuesto_ayuda")}
                          >
                            {t(
                              respuestas["periodo"] !== undefined
                                ? "pregunta.entendida.cambiado"
                                : "pregunta.entendida.propuesto",
                            )}
                          </span>
                        </span>
                        <select
                          className="min-h-11 rounded-md border border-hairline bg-surface px-3"
                          value={consulta.plan.agrupar.periodo}
                          onChange={(e) => responder("periodo", e.target.value)}
                        >
                          {PERIODOS.map((p) => (
                            <option key={p} value={p}>
                              {t(`pregunta.periodo.${p}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                </div>
              )}

              {consulta.noLeidas.length > 0 && (
                <p
                  role="status"
                  className="text-caution"
                  data-testid="pregunta-sin-leer"
                >
                  <span aria-hidden="true" className="mr-1">
                    ⚠
                  </span>
                  {t("pregunta.sin_leer", {
                    lista: consulta.noLeidas.map((p) => `«${p}»`).join(", "),
                  })}
                </p>
              )}
              {consulta.avisos.length > 0 && (
                <ul
                  className="flex flex-col gap-1"
                  data-testid="pregunta-avisos"
                >
                  {consulta.avisos.map((a, i) => (
                    <li key={`${a.clave}-${i}`} className="text-caution">
                      <span aria-hidden="true" className="mr-1">
                        ⚠
                      </span>
                      {t(`pregunta.aviso.${a.clave}`, a.params)}
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <p className="text-xs uppercase tracking-wide text-ink-muted">
                  {t("pregunta.validacion.titulo")}
                </p>
                <ul
                  className="mt-1 flex flex-col gap-1"
                  data-testid="pregunta-validacion"
                >
                  {validaciones.map((v, i) => (
                    <li
                      key={`${v.clave}-${i}`}
                      className={
                        v.nivel === "error"
                          ? "text-negative"
                          : v.nivel === "aviso"
                            ? "text-caution"
                            : ""
                      }
                    >
                      <span aria-hidden="true" className="mr-1">
                        {SIMBOLO[v.nivel]}
                      </span>
                      <span className="font-medium">
                        {t(`pregunta.validacion.nivel.${v.nivel}`)}
                      </span>
                      {" · "}
                      {t(`pregunta.validacion.${v.clave}`, {
                        ...v.params,
                        hasta: String(v.params["hasta"] ?? ""),
                      })}
                    </li>
                  ))}
                </ul>
              </div>

              <details open>
                <summary className="min-h-11 cursor-pointer py-2 font-medium">
                  {t("pregunta.entendida.sql")}
                </summary>
                <pre
                  tabIndex={0}
                  aria-label={t("pregunta.entendida.sql")}
                  className="overflow-x-auto rounded-md bg-sunken p-3 font-mono text-xs"
                  data-testid="pregunta-sql"
                >
                  {sql}
                </pre>
                <p className="mt-1 text-xs text-ink-muted">
                  {t("pregunta.entendida.sql_nota")}
                </p>
              </details>

              <div>
                <Button
                  icon="play"
                  type="button"
                  onClick={ejecutar}
                  disabled={!sePuedeCorrer(validaciones)}
                  data-testid="pregunta-correr"
                >
                  {t("pregunta.correr")}
                </Button>
              </div>
            </div>
          )}

          {consulta && catalogo && resultado && (
            <ResultadoConsulta
              plan={consulta.plan}
              resultado={resultado}
              catalogo={catalogo}
              onDescargar={descargar}
            />
          )}
        </div>
      </Card>
    </section>
  );
}

/** El cálculo se puede cambiar a lo que la columna admite: con números, los seis; con una categoría o contando filas, solo contar. */
function opcionesDeAgregacion(
  plan: QueryPlan,
  cat: Catalogo,
): readonly Agregacion[] {
  const col =
    plan.medida.columna === null
      ? null
      : cat.columnas.find((c) => c.nombre === plan.medida.columna);
  return col && col.tipo === "numero" ? AGREGACIONES_DE_NUMEROS : ["conteo"];
}

function ResultadoConsulta({
  plan,
  resultado,
  catalogo,
  onDescargar,
}: {
  plan: QueryPlan;
  resultado: Resultado;
  catalogo: Catalogo;
  onDescargar: () => void;
}) {
  const t = useTextosEtapa(TEXTOS_PREGUNTA);
  const { locale } = useI18n();
  const frase = fraseResultado(plan, catalogo, resultado, locale);
  const grupos = resultado.grupos;
  const decimales = decimalesDe(plan, grupos.map((g) => g.valor));
  const enTiempo =
    plan.agrupar?.tipo === "tiempo" && plan.top === null && grupos.length >= 3;
  const paraGrafico = enTiempo ? grupos : grupos.slice(0, GRUPOS_EN_GRAFICO);
  const medida =
    plan.medida.columna ??
    t("pregunta.frase.medida.conteo_filas", { columna: "" });
  return (
    <div
      className="mt-6 flex flex-col gap-2 text-sm"
      data-testid="pregunta-resultado"
    >
      <h3 className="font-medium">{t("pregunta.resultado.titulo")}</h3>
      {grupos.length === 0 ? (
        <p role="status" className="text-caution">
          <span aria-hidden="true" className="mr-1">
            ⚠
          </span>
          {t("pregunta.resultado.nada")}
        </p>
      ) : (
        <>
          <p
            data-testid="pregunta-frase"
            data-verificada={frase.verificada ? "si" : "no"}
          >
            {frase.texto}
          </p>
          <p className="text-xs text-ink-muted">
            {t("pregunta.resultado.filas_usadas", {
              n: formatQuantity(resultado.filasUsadas, 0),
              total: formatQuantity(catalogo.filas, 0),
            })}
            {resultado.gruposTotales > grupos.length
              ? ` ${t("pregunta.resultado.cortado", {
                  n: formatQuantity(grupos.length, 0),
                  total: formatQuantity(resultado.gruposTotales, 0),
                })}`
              : ""}
          </p>
          {plan.agrupar && (
            <GraficoConsulta
              grupos={paraGrafico}
              decimales={decimales}
              modo={enTiempo ? "linea" : "barras"}
              textos={{
                etiqueta: t(
                  enTiempo
                    ? "pregunta.grafico.linea"
                    : "pregunta.grafico.barras",
                  {
                    medida,
                    n: formatQuantity(paraGrafico.length, 0),
                  },
                ),
                leyenda: t(
                  enTiempo
                    ? "pregunta.grafico.leyenda_linea"
                    : "pregunta.grafico.leyenda_barras",
                ),
                minimo: t("pregunta.grafico.minimo"),
                maximo: t("pregunta.grafico.maximo"),
              }}
            />
          )}
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-medium">
              {t("pregunta.resultado.tabla")}
            </summary>
            <div
              role="region"
              tabIndex={0}
              aria-label={t("pregunta.resultado.tabla")}
              className="overflow-x-auto"
            >
              <table className="w-full text-left" data-testid="pregunta-tabla">
                <thead>
                  <tr>
                    {plan.agrupar && (
                      <th scope="col" className="py-1 pr-4">
                        {plan.agrupar.columna}
                      </th>
                    )}
                    <th scope="col" className="py-1 pr-4">
                      {t("pregunta.resultado.valor")}
                    </th>
                    <th scope="col" className="py-1">
                      {t("pregunta.resultado.filas")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => (
                    <tr key={g.etiqueta} className="border-t border-hairline">
                      {plan.agrupar ? (
                        <th scope="row" className="py-1 pr-4 font-normal">
                          {g.etiqueta}
                        </th>
                      ) : null}
                      <td className="py-1 pr-4 font-mono tabular-nums">
                        {formatQuantity(g.valor, decimales)}
                      </td>
                      <td className="py-1 font-mono tabular-nums">
                        {formatQuantity(g.filas, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div>
            <Button
              icon="download"
              variant="secondary"
              type="button"
              onClick={onDescargar}
              data-testid="pregunta-descargar"
            >
              {t("pregunta.resultado.descargar")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

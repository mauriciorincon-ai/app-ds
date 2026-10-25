"use client";

// S19 (ADR 027): el panel «¿Qué pasaría si?». Es el mismo en Probeta (resultados y modo «score») y en la etapa 9 del Protocolo: quien
// lo monta le da las filas, las columnas del modelo y cómo pedirle al worker que puntúe (`simular`). Elegir columna y cambio
// (±x %, un valor fijo u otra categoría que exista), para todas las filas o un segmento (la gramática de la regla de hoy), y
// ver cuántas decisiones cambian y qué significa en dinero con los costos escritos. Los costos de Probeta usan los campos y la
// lectura de números de la etapa 1 (`campos.tsx`), no copias. Texto con símbolo + palabra (el color nunca solo); sin
// diccionario en la página: los textos viajan con este chunk.
import { useMemo, useState } from "react";
import {
  CampoSelect,
  CampoTexto,
  leerNumero,
} from "@/components/protocolo/campos";
import { Button, Card } from "@/components/ui";
import {
  categoriasDe,
  compararSimulacion,
  prepararSimulacion,
  type Alcance,
  type Cambio,
  type Comparacion,
  type CostosSimulador,
  type TipoColumna,
} from "@/engine/simulador";
import { matchByTask, matchTask } from "@/engine/despacho";
import {
  CONDICIONES_MAX,
  numeroCanonico,
  operadoresDe,
  problemaDeCondicion,
  type Condicion,
} from "@/engine/protocolo/regla";
import { vistaColumna } from "@/engine/protocolo/tabla";
import { costoValido } from "@/engine/protocolo/valores";
import type { TrainTask } from "@/engine/tarea";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { useI18n } from "@/i18n/provider";
import type { Locale } from "@/i18n/config";
import type { CsvTable } from "@/lib/ds/csv";
import { formatQuantity } from "@/lib/quantity";
import {
  resumenVerificado,
  type UnidadDinero,
} from "@/lib/narration/simulador";
import { TEXTOS_SIMULADOR } from "@/lib/narration/textos-simulador";
import type { PedirSimulacion } from "@/lib/simulador/pedir";

/** Costos que ya están escritos en otro lugar (la etapa 1 del Protocolo): el panel no los vuelve a pedir. */
export type CostosEscritos = {
  readonly costos: CostosSimulador | null;
  readonly unidad: UnidadDinero;
};

export type SimuladorProps = {
  /** Las filas que se pueden mover. En la etapa 9 son SOLO las de entrenamiento: la prueba no se vuelve a abrir. */
  readonly tabla: CsvTable;
  readonly tarea: TrainTask;
  /** Las columnas del modelo, en el orden de su esquema. */
  readonly numericas: readonly string[];
  readonly categoricas: readonly string[];
  /** Las clases del modelo (dos o varias) y, en dos clases, la positiva. */
  readonly clases: readonly string[] | null;
  readonly positiva: string | null;
  readonly semilla: number;
  readonly simular: PedirSimulacion;
  /** Si viene, el panel no pide costos y usa estos (etapa 9). */
  readonly costosEscritos?: CostosEscritos | null;
  /** La unidad del objetivo al estimar una cantidad («kWh»). */
  readonly unidadObjetivo?: string | null;
  /** Etapa 9: dice que las filas son las de entrenamiento y que lo simulado no entra al cuaderno. */
  readonly notaEntrenamiento?: boolean;
  /** El ganador se está reajustando (etapa 9): se dice en pantalla. */
  readonly ajustando?: boolean;
  /** El worker está ocupado con otra cosa. */
  readonly ocupado?: boolean;
  /** La identidad del modelo activo: una lectura de otro modelo (se eligió otro de la liga) no se enseña. */
  readonly modelo?: object;
};

type LecturaDe = {
  /** El modelo con que se simuló. */
  readonly de: object | undefined;
  readonly comparacion: Comparacion;
  readonly unidad: UnidadDinero;
  readonly tocadas: number;
  readonly usadas: number;
  readonly total: number;
  readonly muestreada: boolean;
};

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "midiendo" }
  | { readonly tipo: "lista"; readonly lectura: LecturaDe }
  | { readonly tipo: "rechazo"; readonly motivo: string }
  | { readonly tipo: "error"; readonly motivo: string };

type ModoNumerico = "porcentaje" | "fijo";
type CondicionTexto = {
  columna: string;
  operador: string;
  valor: string;
};

const VACIA: CondicionTexto = { columna: "", operador: "=", valor: "" };

export function SimuladorPanel(props: SimuladorProps) {
  const {
    tabla,
    tarea,
    numericas,
    categoricas,
    clases,
    positiva,
    semilla,
    simular,
    costosEscritos = null,
    unidadObjetivo = null,
    notaEntrenamiento = false,
    ajustando = false,
    ocupado = false,
    modelo,
  } = props;
  const t = useTextosEtapa(TEXTOS_SIMULADOR);
  const { locale } = useI18n();
  const columnas = useMemo(
    () => [...numericas, ...categoricas],
    [numericas, categoricas],
  );
  const [columna, setColumna] = useState(columnas[0] ?? "");
  const tipo: TipoColumna = numericas.includes(columna) ? "numero" : "categoria";
  const [modo, setModo] = useState<ModoNumerico>("porcentaje");
  const [valorTexto, setValorTexto] = useState("10");
  const categorias = useMemo(
    () => (tipo === "categoria" ? categoriasDe(tabla, columna) : []),
    [tabla, columna, tipo],
  );
  const [categoria, setCategoria] = useState("");
  const categoriaElegida = categorias.includes(categoria)
    ? categoria
    : (categorias[0] ?? "");
  const [segmento, setSegmento] = useState(false);
  const [cond, setCond] = useState<CondicionTexto[]>([{ ...VACIA }]);
  const [union, setUnion] = useState("y");
  const [fp, setFp] = useState("");
  const [fn, setFn] = useState("");
  const [porClase, setPorClase] = useState<Record<string, string>>({});
  const [unidadTexto, setUnidadTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });

  const tipoCondicion = (nombre: string) =>
    nombre === ""
      ? "texto"
      : vistaColumna(
            nombre,
            tabla.rows.map((fila) => fila[tabla.headers.indexOf(nombre)] ?? ""),
          ).tipo === "numero"
        ? "numero"
        : "texto";

  const costosPedidos = (): CostosSimulador | null =>
    matchTask(tarea, {
      binaria: (): CostosSimulador | null => {
        const [a, b] = [leerNumero(fp), leerNumero(fn)];
        return costoValido(a) && costoValido(b)
          ? { task: "binaria", fp: a, fn: b }
          : null;
      },
      multiclase: (): CostosSimulador | null => {
        const costoClase = new Map<string, number>();
        for (const k of clases ?? []) {
          const v = leerNumero(porClase[k] ?? "");
          if (!costoValido(v)) return null;
          costoClase.set(k, v);
        }
        return costoClase.size > 0 ? { task: "multiclase", costoClase } : null;
      },
      numerica: () => null,
      agrupar: () => null,
    });

  const alSimular = async () => {
    const cambio: Cambio | null =
      tipo === "categoria"
        ? { tipo: "categoria", categoria: categoriaElegida }
        : (() => {
            const v = leerNumero(valorTexto);
            if (v === null) return null;
            return modo === "porcentaje"
              ? { tipo: "porcentaje" as const, porcentaje: v }
              : { tipo: "fijo" as const, valor: v };
          })();
    if (!cambio) {
      setEstado({ tipo: "rechazo", motivo: "valor" });
      return;
    }
    let alcance: Alcance = { tipo: "todas" };
    if (segmento) {
      const condiciones: Condicion[] = [];
      for (const c of cond) {
        const tipoC = tipoCondicion(c.columna);
        const valor =
          tipoC === "numero" ? numeroCanonico(c.valor) : c.valor.trim();
        if (
          c.columna === "" ||
          valor === null ||
          problemaDeCondicion(tipoC, c.operador, valor) !== null
        ) {
          setEstado({ tipo: "rechazo", motivo: "segmento" });
          return;
        }
        condiciones.push({ columna: c.columna, operador: c.operador, valor });
      }
      alcance = {
        tipo: "segmento",
        condiciones,
        union: condiciones.length === 1 ? "" : union,
      };
    }
    const preparada = prepararSimulacion({
      tabla,
      columnas,
      columna,
      tipo,
      cambio,
      alcance,
      semilla,
    });
    if (!preparada.ok) {
      setEstado({ tipo: "rechazo", motivo: preparada.motivo });
      return;
    }
    const s = preparada.simulacion;
    setEstado({ tipo: "midiendo" });
    try {
      const r = await simular(
        {
          headers: s.headers,
          rows: s.filas,
          column: s.columna,
          values: s.valores,
        },
        {
          task: tarea,
          n: s.usadas,
          column: s.columna,
          classes: clases,
          positive: positiva,
        },
      );
      const escritos = costosEscritos ?? {
        costos: costosPedidos(),
        unidad: unidadTexto.trim() === "" ? null : unidadTexto.trim(),
      };
      const comparacion = compararSimulacion(r, escritos.costos);
      setEstado({
        tipo: "lista",
        lectura: {
          de: modelo,
          comparacion,
          unidad: matchByTask(comparacion, {
            binaria: () => escritos.unidad,
            multiclase: () => escritos.unidad,
            numerica: () => unidadObjetivo,
            agrupar: () => escritos.unidad,
          }),
          tocadas: s.tocadas,
          usadas: s.usadas,
          total: s.total,
          muestreada: s.muestreada,
        },
      });
    } catch (e) {
      setEstado({
        tipo: "error",
        motivo: e instanceof Error ? e.message : "worker",
      });
    }
  };

  // los costos se piden en dos y varias clases; al estimar o agrupar no hay dinero que calcular
  const conCostos = matchTask(tarea, {
    binaria: () => true,
    multiclase: () => true,
    numerica: () => false,
    agrupar: () => false,
  });
  const esBinaria = matchTask(tarea, {
    binaria: () => true,
    multiclase: () => false,
    numerica: () => false,
    agrupar: () => false,
  });
  const costosCampos = costosEscritos === null && conCostos;

  return (
    <section
      aria-labelledby="simulador-title"
      data-testid="simulador-panel"
      className="min-w-0 [overflow-wrap:anywhere]"
    >
      <Card className="p-5">
        <h2 id="simulador-title" className="text-sm font-semibold">
          {t("simulador.titulo")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("simulador.ayuda")}</p>
        {notaEntrenamiento && (
          <p className="mt-1 text-sm text-ink-muted">
            <span aria-hidden="true">· </span>
            {t("simulador.nota_entrenamiento")}
          </p>
        )}
        {columnas.length === 0 ? (
          <p className="mt-3 text-sm">{t("simulador.sin_columnas")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <CampoSelect
              etiqueta={t("simulador.columna")}
              valor={columna}
              opciones={columnas.map((c) => ({ valor: c, texto: c }))}
              onCambio={(v) => {
                setColumna(v);
                setEstado({ tipo: "inactivo" });
              }}
            />
            {tipo === "numero" ? (
              <div className="flex flex-col gap-3">
                <CampoSelect
                  etiqueta={t("simulador.cambio.titulo")}
                  valor={modo}
                  opciones={[
                    {
                      valor: "porcentaje",
                      texto: t("simulador.cambio.porcentaje"),
                    },
                    { valor: "fijo", texto: t("simulador.cambio.fijo") },
                  ]}
                  onCambio={(v) =>
                    setModo(v === "fijo" ? "fijo" : "porcentaje")
                  }
                />
                <CampoTexto
                  etiqueta={t(
                    modo === "porcentaje"
                      ? "simulador.cambio.porcentaje_valor"
                      : "simulador.cambio.fijo_valor",
                  )}
                  valor={valorTexto}
                  onCambio={setValorTexto}
                  numerico
                  maximo={20}
                />
              </div>
            ) : (
              <CampoSelect
                etiqueta={t("simulador.cambio.categoria")}
                valor={categoriaElegida}
                opciones={categorias.map((c) => ({ valor: c, texto: c }))}
                onCambio={setCategoria}
              />
            )}
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-sm font-medium">
                {t("simulador.alcance.titulo")}
              </legend>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="simulador-alcance"
                  checked={!segmento}
                  onChange={() => setSegmento(false)}
                />
                {t("simulador.alcance.todas")}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="simulador-alcance"
                  checked={segmento}
                  onChange={() => setSegmento(true)}
                />
                {t("simulador.alcance.segmento")}
              </label>
              {segmento && (
                <div className="flex flex-col gap-3 rounded-md border border-hairline p-3">
                  {cond.map((c, i) => {
                    const tipoC = tipoCondicion(c.columna);
                    const mala =
                      c.valor.trim() !== "" &&
                      tipoC === "numero" &&
                      numeroCanonico(c.valor) === null;
                    return (
                      <div key={i} className="flex flex-col gap-2">
                        <CampoSelect
                          etiqueta={t("simulador.alcance.columna")}
                          valor={c.columna}
                          opciones={[
                            { valor: "", texto: "—" },
                            ...tabla.headers.map((h) => ({
                              valor: h,
                              texto: h,
                            })),
                          ]}
                          onCambio={(v) =>
                            setCond((lista) =>
                              lista.map((x, j) =>
                                j === i
                                  ? { columna: v, operador: "=", valor: "" }
                                  : x,
                              ),
                            )
                          }
                        />
                        <CampoSelect
                          etiqueta={t("simulador.alcance.operador")}
                          valor={c.operador}
                          opciones={operadoresDe(tipoC).map((o) => ({
                            valor: o,
                            texto: o,
                          }))}
                          onCambio={(v) =>
                            setCond((lista) =>
                              lista.map((x, j) =>
                                j === i ? { ...x, operador: v } : x,
                              ),
                            )
                          }
                        />
                        <CampoTexto
                          etiqueta={t("simulador.alcance.valor")}
                          valor={c.valor}
                          onCambio={(v) =>
                            setCond((lista) =>
                              lista.map((x, j) =>
                                j === i ? { ...x, valor: v } : x,
                              ),
                            )
                          }
                          maximo={100}
                        />
                        {mala && (
                          <p className="text-xs text-ink">
                            <span aria-hidden="true">⚠ </span>
                            {t("simulador.alcance.valor_invalido")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {cond.length < CONDICIONES_MAX ? (
                    <Button
                      variant="secondary"
                      icon="plus"
                      type="button"
                      onClick={() =>
                        setCond((lista) => [...lista, { ...VACIA }])
                      }
                    >
                      {t("simulador.alcance.otra")}
                    </Button>
                  ) : (
                    <>
                      <CampoSelect
                        etiqueta={t("simulador.alcance.union")}
                        valor={union}
                        opciones={[
                          { valor: "y", texto: t("simulador.alcance.y") },
                          { valor: "o", texto: t("simulador.alcance.o") },
                        ]}
                        onCambio={setUnion}
                      />
                      <Button
                        variant="ghost"
                        icon="x"
                        type="button"
                        onClick={() => setCond((lista) => lista.slice(0, 1))}
                      >
                        {t("simulador.alcance.quitar")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </fieldset>
            {costosEscritos !== null && costosEscritos.costos !== null && (
              <p className="text-sm text-ink-muted">
                <span aria-hidden="true">· </span>
                {t("simulador.costos.ayuda_etapa1")}
              </p>
            )}
            {costosCampos && (
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="text-sm font-medium">
                  {t("simulador.costos.titulo")}
                </legend>
                <p className="text-sm text-ink-muted">
                  {t("simulador.costos.ayuda")}
                </p>
                {esBinaria && positiva !== null && (
                  <p className="text-sm text-ink-muted">
                    {t("simulador.costos.actuar", { positiva })}
                  </p>
                )}
                {esBinaria ? (
                  <>
                    <CampoTexto
                      etiqueta={t("simulador.costos.fp")}
                      valor={fp}
                      onCambio={setFp}
                      numerico
                      maximo={20}
                    />
                    <CampoTexto
                      etiqueta={t("simulador.costos.fn")}
                      valor={fn}
                      onCambio={setFn}
                      numerico
                      maximo={20}
                    />
                  </>
                ) : (
                  (clases ?? []).map((k) => (
                    <CampoTexto
                      key={k}
                      etiqueta={t("simulador.costos.clase", { clase: k })}
                      valor={porClase[k] ?? ""}
                      onCambio={(v) => setPorClase((m) => ({ ...m, [k]: v }))}
                      numerico
                      maximo={20}
                    />
                  ))
                )}
                <CampoTexto
                  etiqueta={t("simulador.costos.unidad")}
                  valor={unidadTexto}
                  onCambio={setUnidadTexto}
                  maximo={12}
                />
              </fieldset>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon="play"
                type="button"
                onClick={alSimular}
                disabled={ocupado || estado.tipo === "midiendo"}
              >
                {t("simulador.simular")}
              </Button>
              {ajustando && (
                <span role="status" className="text-sm text-ink-muted">
                  {t("simulador.ajustando")}
                </span>
              )}
              {estado.tipo === "midiendo" && !ajustando && (
                <span role="status" className="text-sm text-ink-muted">
                  {t("simulador.simulando")}
                </span>
              )}
            </div>
          </div>
        )}
        {estado.tipo === "rechazo" && (
          <p role="alert" className="mt-3 text-sm text-negative">
            <span aria-hidden="true" className="mr-1">
              ✕
            </span>
            {t(`simulador.rechazo.${estado.motivo}`)}
          </p>
        )}
        {estado.tipo === "error" && (
          <p role="alert" className="mt-3 text-sm text-negative">
            <span aria-hidden="true" className="mr-1">
              ✕
            </span>
            {t("simulador.error", { motivo: estado.motivo })}
          </p>
        )}
        {estado.tipo === "lista" && estado.lectura.de === modelo && (
          <LecturaSimulacion lectura={estado.lectura} t={t} locale={locale} />
        )}
      </Card>
    </section>
  );
}

/** La lectura del resultado: la frase verificada, las notas y, con varias opciones o grupos, cuántas filas hay en cada uno. */
function LecturaSimulacion({
  lectura,
  t,
  locale,
}: {
  lectura: LecturaDe;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: Locale;
}) {
  const c = lectura.comparacion;
  const resumen = resumenVerificado(c, locale, lectura.unidad);
  const fila = (nombre: string, antes: number, despues: number) => (
    <tr key={nombre}>
      <th scope="row" className="py-1 pr-4 text-left font-normal">
        {nombre}
      </th>
      <td className="py-1 pr-4 tabular-nums">{formatQuantity(antes, 0)}</td>
      <td className="py-1 tabular-nums">{formatQuantity(despues, 0)}</td>
    </tr>
  );
  const tabla = matchByTask(c, {
    binaria: () => null,
    multiclase: (m) => ({
      titulo: t("simulador.tabla.opciones"),
      primera: t("simulador.tabla.opcion"),
      filas: m.porOpcion.map((o) => fila(o.opcion, o.antes, o.despues)),
    }),
    numerica: () => null,
    agrupar: (g) => ({
      titulo: t("simulador.tabla.grupos"),
      primera: t("simulador.tabla.grupo"),
      filas: g.porGrupo.map((x) => fila(String(x.grupo), x.antes, x.despues)),
    }),
  });
  return (
    <div className="mt-4 flex flex-col gap-2" data-testid="simulador-lectura">
      <p className="text-sm font-medium" data-testid="simulador-resumen">
        {resumen.texto}
      </p>
      {resumen.verificado ? (
        <p
          className="text-xs text-ink-muted"
          title={t("simulador.ayuda_verificada")}
          data-testid="simulador-verificada"
        >
          <span aria-hidden="true">✓ </span>
          {t("simulador.verificada")}
        </p>
      ) : (
        <p className="text-xs text-ink-muted">
          <span aria-hidden="true">· </span>
          {t("simulador.no_cuadro")}
        </p>
      )}
      {lectura.tocadas === 0 ? (
        <p className="text-sm text-ink">
          <span aria-hidden="true">⚠ </span>
          {t("simulador.no_toco")}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          {t("simulador.toco", {
            tocadas: formatQuantity(lectura.tocadas, 0),
            count: lectura.tocadas,
          })}
        </p>
      )}
      {lectura.muestreada && (
        <p className="text-sm text-ink-muted">
          {t("simulador.muestra", {
            usadas: formatQuantity(lectura.usadas, 0),
            total: formatQuantity(lectura.total, 0),
          })}
        </p>
      )}
      {c.fuera.despues > c.fuera.antes && (
        <p className="text-sm text-caution">
          <span aria-hidden="true">⚠ </span>
          {t("simulador.fuera", {
            antes: formatQuantity(c.fuera.antes, 0),
            despues: formatQuantity(c.fuera.despues, 0),
            count: c.fuera.despues,
          })}
        </p>
      )}
      {tabla && (
        <table className="mt-2 text-sm">
          <caption className="pb-1 text-left text-xs text-ink-muted">
            {tabla.titulo}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="pr-4 text-left font-medium">
                {tabla.primera}
              </th>
              <th scope="col" className="pr-4 text-left font-medium">
                {t("simulador.tabla.antes")}
              </th>
              <th scope="col" className="text-left font-medium">
                {t("simulador.tabla.despues")}
              </th>
            </tr>
          </thead>
          <tbody>{tabla.filas}</tbody>
        </table>
      )}
    </div>
  );
}

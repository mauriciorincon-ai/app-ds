"use client";

// Protocolo DS (S10), etapa 5: lo que ya se logra sin modelo y la regla de hoy. La tabla de
// referencias sale de TUS filas con los costos de la etapa 1; la regla (hasta dos condiciones) se
// escribe aquí y se mide en vivo en las mismas filas. Todo es una REFERENCIA sobre todas tus filas:
// la etapa 8 la vuelve a medir sobre la prueba. Solo se ofrecen las columnas que la etapa 4 dejó
// en «usar». La compuerta decide al registrar; este formulario solo propone.
import { useEffect, useMemo, useRef, useState } from "react";
import { byTask, matchTask } from "@/engine/despacho";
import { formaDe } from "@/engine/protocolo/etapa1";
import { columnasParaEntrenar } from "@/engine/protocolo/etapa4";
import {
  ACTUAR,
  NO_ACTUAR,
  ENTRADA_5_VACIA,
  ETAPA_5,
  datosEtapa5,
  entradaDesdeRespuestas,
  por100,
  referencias5,
  valoresDeColumna,
  vistaDe,
  type EntradaEtapa5,
  type Referencia5,
} from "@/engine/protocolo/etapa5";
import {
  CONDICIONES_MAX,
  VALORES_ELEGIBLES_MAX,
  operadoresDe,
} from "@/engine/protocolo/regla";
import { lista, numero, textoLleno } from "@/engine/protocolo/valores";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { TEXTOS_ETAPA_5 } from "./textos/etapa5";
import { cifra } from "@/lib/protocolo/formato";
import { formatQuantity, thousands } from "@/lib/quantity";
import { Button } from "@/components/ui";
import { CampoOpciones, CampoSelect, CampoTexto, leerNumero } from "./campos";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";
import { operadorTexto } from "./regla-texto";

type Cond = { columna: string; operador: string; valor: string };
const SIN_CONDICION: Cond = { columna: "", operador: "", valor: "" };

/** Lo que el usuario escribió como número, en su forma canónica; lo que no se lee queda como está. */
function canonico(texto: string): string {
  const n = leerNumero(texto);
  return n === null ? texto.trim() : String(n);
}

export function Etapa5Form({
  datos,
  anterior,
  previas,
  onRegistrar,
}: PropsFormulario) {
  const t = useTextosEtapa(TEXTOS_ETAPA_5);
  const tabla = datos?.tabla ?? null;
  const e1 = previas[1];
  const forma = e1 ? formaDe(e1.respuestas) : null;
  const salidaNumerica =
    forma !== null &&
    byTask(forma, { binaria: false, multiclase: false, numerica: true });
  const previo = useMemo(
    () => entradaDesdeRespuestas(anterior?.respuestas ?? {}),
    [anterior],
  );

  // Las únicas columnas que una regla de hoy puede mirar: las que la etapa 4 dejó en «usar» (y que
  // este archivo tiene: si se cargó otra versión, lo elegido antes puede no existir ya).
  const usables = useMemo(
    () =>
      previas[4] && tabla
        ? columnasParaEntrenar(previas[4]).filter((c) =>
            tabla.headers.includes(c),
          )
        : [],
    [previas, tabla],
  );

  const [regla, setRegla] = useState<"" | "hay" | "ninguna">(
    previo.regla === "hay" || previo.regla === "ninguna" ? previo.regla : "",
  );
  const [conds, setConds] = useState<Cond[]>(() => {
    const previas_ = previo.columnas.map((columna, i) => ({
      columna,
      operador: previo.operadores[i] ?? "",
      valor: previo.valores[i] ?? "",
    }));
    return previas_.length > 0 ? previas_ : [SIN_CONDICION];
  });
  const [union, setUnion] = useState<"y" | "o">(
    previo.union === "o" ? "o" : "y",
  );
  const [si, setSi] = useState(previo.si === ACTUAR ? "" : previo.si);
  const [no, setNo] = useState(previo.no === NO_ACTUAR ? "" : previo.no);

  // Las condiciones que apuntan a una columna que ya no se puede usar vuelven a «Elige…».
  const conCol = conds.map((c) =>
    usables.includes(c.columna) ? c : { ...c, columna: "" },
  );

  const entrada: EntradaEtapa5 = useMemo(
    () =>
      regla === "hay"
        ? {
            regla,
            columnas: conCol.map((c) => c.columna),
            operadores: conCol.map((c) => c.operador),
            valores: conCol.map((c) =>
              vistaDe(tabla!, c.columna)?.tipo === "numero"
                ? canonico(c.valor)
                : c.valor,
            ),
            union: conCol.length >= 2 ? union : "",
            // lo que el campo numérico acepta («1,5») se guarda en su forma canónica («1.5»)
            si: salidaNumerica ? canonico(si) : si,
            no: salidaNumerica ? canonico(no) : no,
          }
        : { ...ENTRADA_5_VACIA, regla },
    // `conCol` se rearma en cada render; sus partes son las que importan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [regla, conds, usables, union, si, no, tabla, salidaNumerica],
  );

  const base = useMemo(
    () => (tabla ? referencias5(tabla, previas) : null),
    [tabla, previas],
  );
  const calculo = useMemo(
    () => (tabla && base ? datosEtapa5(tabla, entrada, previas) : null),
    [tabla, base, entrada, previas],
  );

  // El foco sigue a la acción: la condición recién añadida, o el botón de añadir tras quitarla.
  const contenedor = useRef<HTMLDivElement>(null);
  const foco = useRef<"nueva" | "anadir" | null>(null);
  useEffect(() => {
    if (foco.current === null) return;
    const destino =
      foco.current === "nueva"
        ? contenedor.current?.querySelector<HTMLElement>(
            '[data-condicion="1"] select',
          )
        : contenedor.current?.querySelector<HTMLElement>(
            '[data-boton="anadir"]',
          );
    foco.current = null;
    destino?.focus();
  });

  if (!tabla || !e1 || !forma) {
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.5.need-data")}
      </p>
    );
  }
  if (!base || !calculo) {
    return (
      <p className="text-sm text-caution" role="status">
        {t("protocol.stage.5.no-base")}
      </p>
    );
  }

  const unidad = textoLleno(e1.respuestas, "unidad") ?? "";
  const hoy = textoLleno(e1.respuestas, "hoy");
  const opciones = lista(e1.respuestas, "opciones") ?? [];
  const c = calculo.chequeos;
  const reglaMedida =
    regla === "hay" && numero(c, "regla_costo") !== null
      ? {
          costo: numero(c, "regla_costo")!,
          metrica: numero(c, "regla_metrica")!,
          aciertos: numero(c, "regla_aciertos"),
        }
      : null;
  const esClasificacion = base.medirClases !== null;

  const poner = (i: number, parche: Partial<Cond>) =>
    setConds((actual) =>
      actual.map((x, k) => (k === i ? { ...x, ...parche } : x)),
    );
  const cambiarColumna = (i: number, columna: string) => {
    const tipo = vistaDe(tabla, columna)?.tipo;
    const antes = vistaDe(tabla, conCol[i]!.columna)?.tipo;
    poner(i, {
      columna,
      operador: tipo === undefined ? "" : tipo === "numero" ? "<" : "=",
      // el valor de una columna de texto no sirve en una numérica, ni al revés
      ...(tipo !== antes ? { valor: "" } : {}),
    });
  };

  const nombreReferencia = (r: Referencia5) =>
    t(`protocol.stage.5.ref.${r.id}`, {
      clase: base.claseMayoritaria ?? "",
      opcion: base.opcionBarata ?? "",
    });
  const costo100 = (costo: number) => cifra(por100(costo));
  const aciertos100 = (a: number | null) =>
    a === null ? "—" : formatQuantity(a * 100, 1);

  const filaMedida = (
    clave: string,
    nombre: string,
    m: { costo: number; metrica: number; aciertos: number | null },
    nota?: string,
    destacada = false,
  ) => (
    <tr key={clave} className={destacada ? "bg-sunken font-medium" : undefined}>
      <th
        scope="row"
        className="px-3 py-2 text-left font-normal [overflow-wrap:anywhere]"
      >
        <span className={destacada ? "font-medium" : undefined}>{nombre}</span>
        {nota && <span className="block text-xs text-ink-muted">{nota}</span>}
        {/* En pantalla angosta las métricas bajan debajo del nombre: la tabla no se desplaza de lado. */}
        <span className="mt-1 block text-xs text-ink-muted sm:hidden">
          {t(
            esClasificacion
              ? "protocol.stage.5.table.col-balanced"
              : "protocol.stage.5.table.col-error",
          )}
          : {cifra(m.metrica)}
          {esClasificacion &&
            ` · ${t("protocol.stage.5.table.col-hits")}: ${aciertos100(m.aciertos)}`}
        </span>
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{costo100(m.costo)}</td>
      <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
        {cifra(m.metrica)}
      </td>
      {esClasificacion && (
        <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
          {aciertos100(m.aciertos)}
        </td>
      )}
    </tr>
  );

  const tablaId = "etapa5-tabla";
  const salidas = matchTask(forma, {
    binaria: () => (
      <p className="text-sm" data-testid="protocolo-regla-binaria">
        {t("protocol.stage.5.rule.binary")}
      </p>
    ),
    multiclase: () => (
      <>
        <CampoSelect
          etiqueta={t("protocol.stage.5.rule.then")}
          valor={si}
          opciones={[
            { valor: "", texto: t("protocol.stage.5.pick") },
            ...opciones.map((o) => ({ valor: o, texto: o })),
          ]}
          onCambio={setSi}
        />
        <CampoSelect
          etiqueta={t("protocol.stage.5.rule.otherwise")}
          valor={no}
          opciones={[
            { valor: "", texto: t("protocol.stage.5.pick") },
            ...opciones.map((o) => ({ valor: o, texto: o })),
          ]}
          onCambio={setNo}
        />
      </>
    ),
    numerica: () => (
      <>
        <CampoTexto
          etiqueta={t("protocol.stage.5.rule.then-num")}
          valor={si}
          onCambio={setSi}
          numerico
        />
        <CampoTexto
          etiqueta={t("protocol.stage.5.rule.otherwise-num")}
          valor={no}
          onCambio={setNo}
          numerico
        />
      </>
    ),
  });

  return (
    <div className="flex flex-col gap-4" ref={contenedor}>
      {hoy && (
        <p className="text-sm" data-testid="protocolo-hoy">
          <span className="font-medium">{t("protocol.stage.5.today")}:</span>{" "}
          <span className="text-ink-muted [overflow-wrap:anywhere]">{hoy}</span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div
          role="region"
          aria-labelledby={tablaId}
          tabIndex={0}
          className="overflow-x-auto rounded-md border border-hairline"
        >
          <table className="w-full border-collapse text-sm">
            <caption id={tablaId} className="px-3 py-2 text-left font-medium">
              {t("protocol.stage.5.table.caption")}
            </caption>
            <thead>
              <tr className="border-y border-hairline text-xs text-ink-muted">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {t("protocol.stage.5.table.col-ref")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {t("protocol.stage.5.table.col-cost", { unit: unidad })}
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-2 text-right font-medium sm:table-cell"
                >
                  {t(
                    esClasificacion
                      ? "protocol.stage.5.table.col-balanced"
                      : "protocol.stage.5.table.col-error",
                  )}
                </th>
                {esClasificacion && (
                  <th
                    scope="col"
                    className="hidden px-3 py-2 text-right font-medium sm:table-cell"
                  >
                    {t("protocol.stage.5.table.col-hits")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {base.referencias.map((r) =>
                filaMedida(
                  r.id,
                  nombreReferencia(r),
                  r,
                  r.id === base.mayoritaria
                    ? t("protocol.stage.5.table.majority")
                    : undefined,
                ),
              )}
              {reglaMedida &&
                filaMedida(
                  "regla",
                  t("protocol.stage.5.table.rule"),
                  reglaMedida,
                  undefined,
                  true,
                )}
            </tbody>
          </table>
        </div>
        <p
          className="text-xs text-ink-muted"
          data-testid="protocolo-referencia"
        >
          {t("protocol.stage.5.table.note", {
            rows: thousands(base.filas.length),
          })}
        </p>
        {base.nSinAnterior !== null && base.nSinAnterior > 0 && (
          <p className="text-xs text-ink-muted">
            {t("protocol.stage.5.no-previous", {
              n: thousands(base.nSinAnterior),
              count: base.nSinAnterior,
            })}
          </p>
        )}
      </div>

      <CampoOpciones
        leyenda={t("protocol.stage.5.rule.legend")}
        ayuda={t("protocol.stage.5.rule.help")}
        valor={regla === "" ? null : regla}
        opciones={[
          { valor: "hay" as const, texto: t("protocol.stage.5.rule.hay") },
          {
            valor: "ninguna" as const,
            texto: t("protocol.stage.5.rule.ninguna"),
          },
        ]}
        onCambio={setRegla}
      />

      {regla === "hay" && usables.length === 0 && (
        <p className="text-sm text-caution" role="status">
          {t("protocol.stage.5.rule.no-usable")}
        </p>
      )}

      {regla === "hay" && usables.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-muted">
            {t("protocol.stage.5.rule.only-use")}
          </p>
          {conCol.map((cond, i) => {
            const vista = cond.columna ? vistaDe(tabla, cond.columna) : null;
            const tipo = vista?.tipo ?? null;
            const elegibles =
              tipo === "texto" ? valoresDeColumna(tabla, cond.columna) : null;
            return (
              <fieldset
                key={i}
                data-condicion={i}
                className="flex flex-col gap-3 rounded-md border border-hairline p-3"
              >
                <legend className="px-1 text-sm font-medium">
                  {t("protocol.stage.5.rule.condition", { n: i + 1 })}
                </legend>
                <CampoSelect
                  etiqueta={t("protocol.stage.5.rule.column")}
                  valor={cond.columna}
                  opciones={[
                    { valor: "", texto: t("protocol.stage.5.pick") },
                    ...usables.map((u) => ({ valor: u, texto: u })),
                  ]}
                  onCambio={(v) => cambiarColumna(i, v)}
                />
                {tipo && (
                  <>
                    <CampoSelect
                      etiqueta={t("protocol.stage.5.rule.operator")}
                      valor={cond.operador}
                      opciones={operadoresDe(tipo).map((op) => ({
                        valor: op,
                        texto: operadorTexto(t, op, tipo),
                      }))}
                      onCambio={(v) => poner(i, { operador: v })}
                    />
                    {tipo === "numero" ? (
                      <CampoTexto
                        etiqueta={t("protocol.stage.5.rule.value")}
                        valor={cond.valor}
                        onCambio={(v) => poner(i, { valor: v })}
                        numerico
                      />
                    ) : elegibles &&
                      elegibles.distintos <= VALORES_ELEGIBLES_MAX ? (
                      <CampoSelect
                        etiqueta={t("protocol.stage.5.rule.value")}
                        valor={cond.valor}
                        opciones={[
                          { valor: "", texto: t("protocol.stage.5.pick") },
                          ...elegibles.valores.map((v) => ({
                            valor: v,
                            texto: v,
                          })),
                        ]}
                        onCambio={(v) => poner(i, { valor: v })}
                      />
                    ) : (
                      <CampoTexto
                        etiqueta={t("protocol.stage.5.rule.value")}
                        ayuda={t("protocol.stage.5.rule.many-values", {
                          n: thousands(elegibles?.distintos ?? 0),
                        })}
                        valor={cond.valor}
                        onCambio={(v) => poner(i, { valor: v })}
                      />
                    )}
                  </>
                )}
              </fieldset>
            );
          })}

          {conCol.length < CONDICIONES_MAX ? (
            <div>
              <Button
                variant="secondary"
                icon="plus"
                data-boton="anadir"
                onClick={() => {
                  foco.current = "nueva";
                  setConds((actual) => [...actual, SIN_CONDICION]);
                }}
              >
                {t("protocol.stage.5.rule.add")}
              </Button>
            </div>
          ) : (
            <>
              <CampoOpciones
                leyenda={t("protocol.stage.5.rule.union")}
                valor={union}
                opciones={[
                  {
                    valor: "y" as const,
                    texto: t("protocol.stage.5.rule.union-y"),
                  },
                  {
                    valor: "o" as const,
                    texto: t("protocol.stage.5.rule.union-o"),
                  },
                ]}
                onCambio={setUnion}
              />
              <div>
                <Button
                  variant="ghost"
                  icon="x"
                  onClick={() => {
                    foco.current = "anadir";
                    setConds((actual) => actual.slice(0, 1));
                  }}
                >
                  {t("protocol.stage.5.rule.remove")}
                </Button>
              </div>
            </>
          )}

          {salidas}

          <p className="text-sm" data-testid="protocolo-regla-medida">
            {numero(c, "regla_cumple") === null
              ? t("protocol.stage.5.rule.incomplete")
              : t("protocol.stage.5.rule.measure", {
                  cumple: thousands(numero(c, "regla_cumple")!),
                  filas: thousands(base.filas.length),
                  count: base.filas.length,
                })}{" "}
            {numero(c, "regla_cumple") !== null &&
              (numero(c, "regla_vacios") ?? 0) > 0 && (
                <span className="text-ink-muted">
                  {t("protocol.stage.5.rule.empties", {
                    vacios: thousands(numero(c, "regla_vacios")!),
                    count: numero(c, "regla_vacios")!,
                  })}
                </span>
              )}
            {numero(c, "regla_cumple") !== null && reglaMedida === null && (
              <span className="text-ink-muted">
                {" "}
                {t("protocol.stage.5.rule.outputs-missing")}
              </span>
            )}
          </p>
        </div>
      )}

      <Trampas etapa={5} trampas={ETAPA_5.trampas(calculo, previas)} />

      <Registrar
        etapa={5}
        deshabilitado={regla === ""}
        onClick={() => onRegistrar(calculo)}
      />
    </div>
  );
}

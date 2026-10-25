"use client";

// Protocolo DS (S14), etapa 9 — la pantalla. No abre la prueba ni habla con el worker: lee lo que la etapa 8
// dejó en el cuaderno (la medida en la prueba y, con dos clases, la tabla agregada de umbrales) y tus costos de
// la etapa 1. Con dos clases: el umbral de tus costos (moverlo pide tu razón y queda rotulado), las cifras con
// ese umbral frente a no hacer nada, actuar con todos y tu regla de hoy, lo que tu equipo alcanza y la curva de
// decisión. Con varias clases o un número: el costo del modelo frente a lo de hoy. Y tu decisión, con «no
// usarlo» como un resultado más. Se carga diferida (formularios.tsx).
import { useMemo, useState } from "react";
import {
  UMBRAL_CLASE,
  UMBRAL_E1,
  claveUmbral,
} from "@/engine/protocolo/etapa8";
import { por100, resumenEtapa5 } from "@/engine/protocolo/etapa5";
import {
  DECISIONES_9,
  ENTRADA_9_VACIA,
  ETAPA_9,
  RAZON_MAX,
  base9,
  beneficioNeto,
  curvaDecision,
  costosBinarios,
  costosNumericos,
  datosEtapa9,
  esBinaria,
  opcionesUmbral,
  puntoEn,
  type Decision9,
  type EntradaEtapa9,
  type PuntoCurva,
} from "@/engine/protocolo/etapa9";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { numero, texto } from "@/engine/protocolo/valores";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { cifra, proporcion } from "@/lib/protocolo/formato";
import { CampoArea, CampoOpciones, CampoSelect, CampoTexto } from "./campos";
import { Etapa9Simulador } from "./Etapa9Simulador";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";
import { TEXTOS_ETAPA_9 } from "./textos/etapa9";

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

const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="py-1 pr-3 text-right tabular-nums">{children}</td>
);

const n100 = (x: number | null) => (x === null ? "—" : cifra(por100(x)));
const tal = (x: number | null) => (x === null ? "—" : cifra(x));

/** Lo que se registró la última vez, para corregirlo. */
function desdeAnterior(anterior: DatosEtapa | null): EntradaEtapa9 {
  if (!anterior) return ENTRADA_9_VACIA;
  const r = anterior.respuestas;
  const capacidad = numero(r, "capacidad");
  return {
    umbral: texto(r, "umbral") ?? UMBRAL_E1,
    razonUmbral: texto(r, "razon_umbral") ?? "",
    capacidad: capacidad === null ? "" : String(capacidad),
    decision: texto(r, "decision") ?? "",
    razon: texto(r, "razon") ?? "",
  };
}

/** La curva en una gráfica: el modelo, actuar con todos y tu regla, con el 0 de no hacer nada. */
function Curva({
  puntos,
  e1,
  elegido,
  etiqueta,
}: {
  puntos: readonly PuntoCurva[];
  e1: number;
  elegido: number | null;
  etiqueta: string;
}) {
  const [ancho, alto, m] = [320, 160, 8];
  // el beneficio neto nunca pasa de la tasa de positivos; por abajo se recorta a la mitad de eso
  const tope = Math.max(
    1,
    ...puntos.map((p) => Math.max(p.modelo, p.todos, p.regla ?? 0) * 100),
  );
  const piso = -tope / 2;
  const x = (u: number) => m + u * (ancho - 2 * m);
  const y = (v: number) =>
    m +
    ((tope - Math.max(piso, Math.min(tope, v * 100))) / (tope - piso)) *
      (alto - 2 * m);
  const linea = (valor: (p: PuntoCurva) => number | null) =>
    puntos
      .filter((p) => valor(p) !== null)
      .map((p) => `${x(p.u).toFixed(1)},${y(valor(p)!).toFixed(1)}`)
      .join(" ");
  const conRegla = puntos.some((p) => p.regla !== null);
  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      role="img"
      aria-label={etiqueta}
      className="h-auto w-full max-w-md text-ink"
    >
      <line
        x1={m}
        x2={ancho - m}
        y1={y(0)}
        y2={y(0)}
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.35}
      />
      <line
        x1={x(e1)}
        x2={x(e1)}
        y1={m}
        y2={alto - m}
        stroke="currentColor"
        strokeWidth={1}
        strokeDasharray="2 2"
        opacity={0.5}
      />
      {elegido !== null && (
        <line
          x1={x(elegido)}
          x2={x(elegido)}
          y1={m}
          y2={alto - m}
          className="text-caution"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      )}
      <polyline
        points={linea((p) => p.todos)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        opacity={0.7}
      />
      {conRegla && (
        <polyline
          points={linea((p) => p.regla)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="1 3"
        />
      )}
      <polyline
        points={linea((p) => p.modelo)}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}

export function Etapa9Form({
  datos,
  anterior,
  previas,
  onRegistrar,
}: PropsFormulario) {
  const t = useTextosEtapa(TEXTOS_ETAPA_9);
  const [entrada, setEntrada] = useState<EntradaEtapa9>(() =>
    desdeAnterior(anterior),
  );
  const poner = (cambio: Partial<EntradaEtapa9>) =>
    setEntrada((e) => ({ ...e, ...cambio }));
  const b = useMemo(() => base9(previas), [previas]);
  const registro = useMemo(
    () => datosEtapa9(previas, entrada),
    [previas, entrada],
  );
  const curva = useMemo(() => (b ? curvaDecision(b) : []), [b]);

  if (!datos || !b)
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.9.need-data")}
      </p>
    );

  // S19: «¿qué pasaría si?» con las filas de entrenamiento y los costos de la etapa 1; no registra nada.
  const simulador = <Etapa9Simulador datos={datos} previas={previas} />;
  const c = registro.chequeos;
  const c8 = b.c8;
  const costos = costosBinarios(b.costos);
  const r5 = previas[5] ? resumenEtapa5(previas[5]) : null;
  const nombreBase = (id: string) =>
    t(`protocol.stage.5.ref.${id}`, {
      clase: r5?.claseMayoritaria ?? "",
      opcion: r5?.opcionBarata ?? "",
    });
  const hoyId = texto(c, "hoy_id");
  const hoy =
    hoyId === "regla"
      ? t("protocol.stage.9.summary.today-rule")
      : hoyId
        ? nombreBase(hoyId)
        : "—";
  const [ahorro, modelo] = [numero(c, "ahorro"), numero(c, "costo_modelo")];
  const [bajo, alto] = [numero(c, "modelo_bajo"), numero(c, "modelo_alto")];
  const conIntervalo = bajo !== null && alto !== null;
  const frase =
    ahorro === null
      ? null
      : t(
          ahorro > 0
            ? "protocol.stage.9.numbers.saves"
            : ahorro < 0
              ? "protocol.stage.9.numbers.costs-more"
              : "protocol.stage.9.numbers.same",
          { hoy, ahorro: cifra(Math.abs(por100(ahorro))) },
        );
  const marcaHoy = (id: string) =>
    hoyId === id ? ` · ${t("protocol.stage.9.numbers.today")}` : "";

  const decision = (
    <Seccion
      titulo={t("protocol.stage.9.decision.title")}
      testid="protocolo-decision9"
    >
      <CampoOpciones<Decision9>
        leyenda={t("protocol.stage.9.decision.legend")}
        ayuda={t("protocol.stage.9.decision.help")}
        valor={
          (DECISIONES_9 as readonly string[]).includes(entrada.decision)
            ? (entrada.decision as Decision9)
            : null
        }
        opciones={DECISIONES_9.map((d) => ({
          valor: d,
          texto: t(`protocol.stage.9.decision.${d}`),
        }))}
        onCambio={(d) => poner({ decision: d })}
      />
      <CampoArea
        etiqueta={t("protocol.stage.9.decision.reason-label")}
        ayuda={t("protocol.stage.9.decision.reason-help", { max: RAZON_MAX })}
        valor={entrada.razon}
        onCambio={(razon) => poner({ razon })}
        maximo={RAZON_MAX}
      />
    </Seccion>
  );
  const cierre = (
    <>
      <Trampas etapa={9} trampas={ETAPA_9.trampas(registro, previas)} />
      <Registrar etapa={9} onClick={() => onRegistrar(registro)} />
    </>
  );
  const lee = (
    <Seccion titulo={t("protocol.stage.9.reads.title")} testid="protocolo-lee9">
      <p className="text-ink-muted">{t("protocol.stage.9.reads.body")}</p>
      {esBinaria(b.forma) && !b.tabla && (
        <p className="text-caution" data-testid="protocolo-sin-tabla9">
          <span aria-hidden="true">⚠ </span>
          {t("protocol.stage.9.reads.no-table")}
        </p>
      )}
    </Seccion>
  );

  // --- varias clases y estimar un número: el costo frente a lo de hoy ---------------------------
  if (!costos) {
    const num = costosNumericos(b.costos);
    const [base, regla] = [numero(c, "costo_base"), numero(c, "costo_regla")];
    const baseId = texto(c, "base_id");
    const cuantil = numero(c, "cuantil");
    return (
      <div className="flex flex-col gap-4">
        {lee}
        <Seccion
          titulo={t("protocol.stage.9.numbers.title-cost")}
          testid="protocolo-cifras9"
        >
          <div
            className="overflow-x-auto"
            role="region"
            aria-label={t("protocol.stage.9.numbers.region")}
            tabIndex={0}
          >
            <table className="w-full text-left">
              <thead className="text-ink-muted">
                <tr>
                  <Th>{t("protocol.stage.9.numbers.who")}</Th>
                  <Th derecha>{t("protocol.stage.9.numbers.cost")}</Th>
                </tr>
              </thead>
              <tbody>
                <tr data-testid="protocolo-cifras9-modelo">
                  <td className="py-1 pr-3">
                    {t("protocol.stage.9.numbers.model")}
                  </td>
                  <Td>
                    {n100(modelo)}
                    {conIntervalo &&
                      ` (${t("protocol.stage.9.numbers.interval", {
                        bajo: n100(bajo),
                        alto: n100(alto),
                      })})`}
                  </Td>
                </tr>
                {baseId && (
                  <tr>
                    <td className="py-1 pr-3">
                      {t("protocol.stage.9.numbers.base", {
                        base: nombreBase(baseId),
                      })}
                      {marcaHoy(baseId)}
                    </td>
                    <Td>{n100(base)}</Td>
                  </tr>
                )}
                {regla !== null && (
                  <tr>
                    <td className="py-1 pr-3">
                      {t("protocol.stage.9.numbers.rule")}
                      {marcaHoy("regla")}
                    </td>
                    <Td>{n100(regla)}</Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {frase && <p data-testid="protocolo-ahorro9">{frase}</p>}
          {num && cuantil !== null && (
            <p className="text-ink-muted">
              {t("protocol.stage.9.numbers.quantile", {
                sub: cifra(num.sub),
                sobre: cifra(num.sobre),
                cuantil: proporcion(cuantil),
              })}
            </p>
          )}
        </Seccion>
        {simulador}
        {decision}
        {cierre}
      </div>
    );
  }

  // --- dos clases --------------------------------------------------------------------------------
  if (!b.tabla || b.n === null || b.pos === null || b.n === 0)
    return (
      <div className="flex flex-col gap-4">
        {lee}
        {cierre}
      </div>
    );

  const [tabla, n, pos] = [b.tabla, b.n, b.pos];
  const opciones = opcionesUmbral(tabla);
  const porClase = opciones[0] === UMBRAL_CLASE;
  const movido =
    entrada.umbral !== UMBRAL_E1 && entrada.umbral !== UMBRAL_CLASE;
  const usado = numero(c, "umbral_usado");
  const [rvp, rfp] = [numero(c8, "regla_vp"), numero(c8, "regla_fp")];
  const capacidad = numero(registro.respuestas, "capacidad");
  const alertas = numero(c, "alertas100");
  const [capU, capCosto, capAlertas] = [
    numero(c, "cap_umbral"),
    numero(c, "cap_costo"),
    numero(c, "cap_alertas100"),
  ];
  const filas: {
    id: string;
    nombre: string;
    alertas: number | null;
    falsas: number | null;
    costo: number | null;
    beneficio: number | null;
    testid?: string;
  }[] = [
    {
      id: "modelo",
      nombre: t("protocol.stage.9.numbers.model"),
      alertas,
      falsas: numero(c, "falsas100"),
      costo: modelo,
      beneficio: numero(c, "beneficio"),
      testid: "protocolo-cifras9-modelo",
    },
    {
      id: "nunca-actuar",
      nombre: t("protocol.stage.9.numbers.nothing"),
      alertas: 0,
      falsas: null,
      costo: numero(c, "costo_nada"),
      beneficio: 0,
    },
    {
      id: "siempre-actuar",
      nombre: t("protocol.stage.9.numbers.all"),
      alertas: 100,
      falsas: ((n - pos) / n) * 100,
      costo: numero(c, "costo_todos"),
      beneficio: numero(c, "beneficio_todos"),
    },
    ...(rvp !== null && rfp !== null
      ? [
          {
            id: "regla",
            nombre: t("protocol.stage.9.numbers.rule"),
            alertas: ((rvp + rfp) / n) * 100,
            falsas: rvp + rfp === 0 ? null : (rfp / (rvp + rfp)) * 100,
            costo: numero(c, "costo_regla"),
            beneficio: numero(c, "beneficio_regla"),
          },
        ]
      : []),
  ];

  // la curva en cifras: cada 0.05, más el umbral de tus costos y el elegido
  const e1 = costos.umbral;
  const peso = (u: number) => u / (1 - u);
  const puntoE1 = puntoEn(tabla, UMBRAL_E1);
  const filasCurva = [
    ...curva.filter(
      (p) => Math.round(p.u * 100) % 5 === 0 || (movido && p.u === usado),
    ),
    ...(puntoE1
      ? [
          {
            u: e1,
            modelo: beneficioNeto(n, puntoE1, peso(e1)),
            todos: beneficioNeto(n, { vp: pos, fp: n - pos }, peso(e1)),
            regla:
              rvp !== null && rfp !== null
                ? beneficioNeto(n, { vp: rvp, fp: rfp }, peso(e1))
                : null,
            esE1: true,
          },
        ]
      : []),
  ].sort((a, b2) => a.u - b2.u);

  return (
    <div className="flex flex-col gap-4">
      {lee}
      <Seccion
        titulo={t("protocol.stage.9.threshold.title")}
        testid="protocolo-umbral9"
      >
        <p className="text-ink-muted">
          {t("protocol.stage.9.threshold.costs", {
            umbral: proporcion(e1),
            fp: cifra(costos.fp),
            fn: cifra(costos.fn),
          })}
        </p>
        {porClase ? (
          <p className="text-caution">
            <span aria-hidden="true">⚠ </span>
            {t("protocol.stage.9.threshold.class")}
          </p>
        ) : (
          <>
            <CampoSelect
              etiqueta={t("protocol.stage.9.threshold.label")}
              ayuda={t("protocol.stage.9.threshold.help")}
              valor={entrada.umbral}
              opciones={opciones.map((k) => ({
                valor: k,
                texto:
                  k === UMBRAL_E1
                    ? t("protocol.stage.9.threshold.option-e1", {
                        umbral: proporcion(e1),
                      })
                    : k,
              }))}
              onCambio={(umbral) => poner({ umbral })}
            />
            {movido && (
              <>
                <p className="text-caution" data-testid="protocolo-movido9">
                  <span aria-hidden="true">⚠ </span>
                  {t("protocol.stage.9.threshold.moved")}
                </p>
                <CampoArea
                  etiqueta={t("protocol.stage.9.threshold.reason-label")}
                  ayuda={t("protocol.stage.9.threshold.reason-help", {
                    max: RAZON_MAX,
                  })}
                  valor={entrada.razonUmbral}
                  onCambio={(razonUmbral) => poner({ razonUmbral })}
                  maximo={RAZON_MAX}
                />
              </>
            )}
          </>
        )}
      </Seccion>

      <Seccion
        titulo={t("protocol.stage.9.numbers.title")}
        testid="protocolo-cifras9"
      >
        <div
          className="overflow-x-auto"
          role="region"
          aria-label={t("protocol.stage.9.numbers.region")}
          tabIndex={0}
        >
          <table className="w-full text-left">
            <thead className="text-ink-muted">
              <tr>
                <Th>{t("protocol.stage.9.numbers.who")}</Th>
                <Th derecha>{t("protocol.stage.9.numbers.alerts")}</Th>
                <Th derecha>{t("protocol.stage.9.numbers.false")}</Th>
                <Th derecha>{t("protocol.stage.9.numbers.cost")}</Th>
                <Th derecha>{t("protocol.stage.9.numbers.benefit")}</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} data-testid={f.testid}>
                  <td className="py-1 pr-3">
                    {f.nombre}
                    {marcaHoy(f.id)}
                  </td>
                  <Td>{tal(f.alertas)}</Td>
                  <Td>{tal(f.falsas)}</Td>
                  <Td>
                    {n100(f.costo)}
                    {f.id === "modelo" &&
                      conIntervalo &&
                      ` (${t("protocol.stage.9.numbers.interval", {
                        bajo: n100(bajo),
                        alto: n100(alto),
                      })})`}
                  </Td>
                  <Td>{n100(f.beneficio)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {conIntervalo && (
          <p className="text-xs text-ink-muted">
            {t("protocol.stage.9.numbers.interval-note")}
          </p>
        )}
        {frase && <p data-testid="protocolo-ahorro9">{frase}</p>}
      </Seccion>

      <Seccion
        titulo={t("protocol.stage.9.capacity.title")}
        testid="protocolo-capacidad9"
      >
        <CampoTexto
          etiqueta={t("protocol.stage.9.capacity.label")}
          ayuda={t("protocol.stage.9.capacity.help")}
          valor={entrada.capacidad}
          onCambio={(capacidad) => poner({ capacidad })}
          numerico
        />
        {capacidad !== null && alertas !== null && (
          <p
            className={alertas > capacidad ? "text-caution" : undefined}
            data-testid="protocolo-capacidad9-lectura"
          >
            {alertas > capacidad ? (
              <>
                <span aria-hidden="true">⚠ </span>
                {t("protocol.stage.9.capacity.exceeds", {
                  alertas: cifra(alertas),
                  capacidad,
                })}{" "}
                {capU !== null && capCosto !== null && capAlertas !== null
                  ? t("protocol.stage.9.capacity.threshold", {
                      umbral: proporcion(capU),
                      capAlertas: cifra(capAlertas),
                      costo: n100(capCosto),
                    })
                  : t("protocol.stage.9.capacity.none")}
              </>
            ) : (
              t("protocol.stage.9.capacity.fits", { alertas: cifra(alertas) })
            )}
          </p>
        )}
      </Seccion>

      {!porClase && curva.length > 0 && (
        <Seccion
          titulo={t("protocol.stage.9.curve.title")}
          testid="protocolo-curva9"
        >
          <p className="text-ink-muted">{t("protocol.stage.9.curve.intro")}</p>
          <Curva
            puntos={curva}
            e1={e1}
            elegido={movido ? usado : null}
            etiqueta={t("protocol.stage.9.curve.image")}
          />
          <ul className="flex flex-col gap-0.5 text-xs text-ink-muted">
            <li>{t("protocol.stage.9.curve.legend-model")}</li>
            <li>{t("protocol.stage.9.curve.legend-all")}</li>
            {rvp !== null && <li>{t("protocol.stage.9.curve.legend-rule")}</li>}
            <li>{t("protocol.stage.9.curve.legend-nothing")}</li>
          </ul>
          <div
            className="max-h-64 overflow-auto"
            role="region"
            aria-label={t("protocol.stage.9.curve.region")}
            tabIndex={0}
          >
            <table className="w-full text-left">
              <thead className="text-ink-muted">
                <tr>
                  <Th>{t("protocol.stage.9.curve.u")}</Th>
                  <Th derecha>{t("protocol.stage.9.curve.model")}</Th>
                  <Th derecha>{t("protocol.stage.9.curve.all")}</Th>
                  {rvp !== null && (
                    <Th derecha>{t("protocol.stage.9.curve.rule")}</Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filasCurva.map((p) => {
                  const esE1 = "esE1" in p;
                  const esElegido = movido && !esE1 && p.u === usado;
                  return (
                    <tr
                      key={esE1 ? UMBRAL_E1 : claveUmbral(p.u)}
                      data-testid="protocolo-curva9-fila"
                      className={esElegido ? "text-caution" : undefined}
                    >
                      <td className="py-1 pr-3 whitespace-nowrap">
                        {proporcion(p.u)}
                        {esE1 && ` ${t("protocol.stage.9.curve.costs-mark")}`}
                        {esElegido &&
                          ` ${t("protocol.stage.9.curve.chosen-mark")}`}
                      </td>
                      <Td>{n100(p.modelo)}</Td>
                      <Td>{n100(p.todos)}</Td>
                      {rvp !== null && <Td>{n100(p.regla)}</Td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}

      {simulador}
      {decision}
      {cierre}
    </div>
  );
}

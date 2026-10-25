"use client";

// Protocolo DS (S11), etapa 6: la partición según tu caso, con la prueba sellada. La app sugiere el
// esquema por reglas desde tu etapa 2 y dice por qué; con fecha y unidad que se repite, pregunta si
// el modelo se usará con unidades nuevas o con las que ya conoces. Elegir otro esquema pide escribir
// por qué. La tabla muestra conteos y rangos por lado, NUNCA filas de la prueba; la verificación
// dice lo que se contó en tu tabla, y el sello, de dónde sale y qué no promete. La compuerta decide
// al registrar (registrar es sellar); este formulario solo propone.
import { useMemo, useState } from "react";
import { byTask } from "@/engine/despacho";
import { formaDe } from "@/engine/protocolo/etapa1";
import {
  ENTRADA_6_VACIA,
  ETAPA_6,
  RAZON_MAX,
  datosEtapa6,
  entradaDesdeRespuestas,
  sellosDistintos,
  type EntradaEtapa6,
} from "@/engine/protocolo/etapa6";
import {
  TAMANO_MAX,
  TAMANO_MIN,
  TAMANO_SUGERIDO,
  disenoDe,
  disponibles,
  esPorGrupo,
  esTemporal,
  preguntaUnidades,
  sugerido,
  type Esquema,
  type UnidadHorizonte,
} from "@/engine/protocolo/particion";
import { mapa, numero, texto, textoLleno } from "@/engine/protocolo/valores";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { TEXTOS_ETAPA_6 } from "./textos/etapa6";
import { huellaCorta } from "@/lib/protocolo/formato";
import { formatQuantity, thousands } from "@/lib/quantity";
import { Icon } from "@/components/ui";
import {
  CampoArea,
  CampoOpciones,
  CampoSelect,
  CampoTexto,
  leerNumero,
} from "./campos";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";

const SIN_HISTORIA: readonly never[] = [];

/** Una línea de la verificación: símbolo, texto y color (nunca el color solo). */
function Verificado({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li
      className={`flex items-start gap-2 ${ok ? "text-ink" : "text-caution"}`}
    >
      {ok ? (
        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
      ) : (
        <span aria-hidden="true" className="shrink-0">
          ⚠
        </span>
      )}
      <span className="[overflow-wrap:anywhere]">{children}</span>
    </li>
  );
}

export function Etapa6Form({
  datos,
  anterior,
  previas,
  historia = SIN_HISTORIA,
  onRegistrar,
}: PropsFormulario) {
  const t = useTextosEtapa(TEXTOS_ETAPA_6);
  const tabla = datos?.tabla ?? null;
  const huella = datos?.carga.sha256 ?? null;
  const e1 = previas[1];
  const r2 = previas[2]?.respuestas ?? null;
  const forma = e1 ? formaDe(e1.respuestas) : null;
  const previo = useMemo(
    () =>
      anterior ? entradaDesdeRespuestas(anterior.respuestas) : ENTRADA_6_VACIA,
    [anterior],
  );

  const [unidades, setUnidades] = useState(previo.unidades);
  // el esquema que TÚ elegiste; sin elegir, se usa el sugerido. Al corregir, lo registrado solo se
  // precarga como elegido si era OTRO que el sugerido de entonces; si era el sugerido, sigue al de hoy (S12).
  const [elegido, setElegido] = useState<"" | Esquema>(
    previo.esquema === anterior?.chequeos.sugerido ? "" : previo.esquema,
  );
  const [razon, setRazon] = useState(previo.razon);
  const [tamanoTexto, setTamanoTexto] = useState(
    String(previo.tamano ?? TAMANO_SUGERIDO),
  );
  const [horizonteTexto, setHorizonteTexto] = useState(
    previo.horizonte === null ? "" : String(previo.horizonte),
  );
  const [unidadH, setUnidadH] = useState<"" | UnidadHorizonte>(
    previo.horizonteUnidad,
  );

  const diseno = useMemo(
    () => (tabla && forma && r2 ? disenoDe(tabla, forma, r2) : null),
    [tabla, forma, r2],
  );
  const pregunta = diseno !== null && preguntaUnidades(diseno);
  const sug = diseno ? sugerido(diseno, unidades) : null;
  const esquema: "" | Esquema = elegido !== "" ? elegido : (sug ?? "");
  const temporal = esquema !== "" && esTemporal(esquema);

  const entrada: EntradaEtapa6 = useMemo(
    () => ({
      unidades: pregunta ? unidades : "",
      esquema,
      razon,
      tamano: leerNumero(tamanoTexto),
      horizonte: temporal ? leerNumero(horizonteTexto) : null,
      horizonteUnidad: temporal ? unidadH : "",
    }),
    [
      pregunta,
      unidades,
      esquema,
      razon,
      tamanoTexto,
      temporal,
      horizonteTexto,
      unidadH,
    ],
  );
  const calculo = useMemo(
    () => (tabla ? datosEtapa6(tabla, entrada, previas, huella) : null),
    [tabla, entrada, previas, huella],
  );

  if (!tabla || !forma || !r2) {
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.6.need-data")}
      </p>
    );
  }
  if (!diseno || !calculo) {
    return (
      <p className="text-sm text-caution" role="status">
        {t("protocol.stage.6.no-design")}
      </p>
    );
  }

  const c = calculo.chequeos;
  const nombre = (e: Esquema) => t(`protocol.stage.6.scheme.${e}`);
  const unidadCol = textoLleno(r2, "unidad_columna") ?? "";
  const fechaCol = textoLleno(r2, "momento_columna") ?? "";
  const clasificacion = byTask(forma, {
    binaria: true,
    multiclase: true,
    numerica: false,
  });
  const conUnidades = diseno.unidades !== null;
  const conFechas = diseno.fechas !== null;
  const partida = numero(c, "n_prueba") !== null;
  const sello = texto(c, "sello");
  const sellosAntes = sellosDistintos(historia);

  // --- la sugerencia y su porqué
  const porque =
    sug === null
      ? null
      : sug === "estratificada"
        ? t("protocol.stage.6.suggest.why-estratificada")
        : sug === "grupo"
          ? t("protocol.stage.6.suggest.why-grupo", { unidad: unidadCol })
          : sug === "tiempo-grupo"
            ? t("protocol.stage.6.suggest.why-tiempo-grupo")
            : pregunta
              ? t("protocol.stage.6.suggest.why-tiempo-conocidas")
              : t("protocol.stage.6.suggest.why-tiempo", { fecha: fechaCol });

  // --- la tabla por lado
  const rango = (desde: string | null, hasta: string | null) =>
    desde && hasta
      ? desde === hasta
        ? desde
        : t("protocol.stage.6.table.range", { desde, hasta })
      : "—";
  const clases = (clave: string) => {
    const m = mapa(c, clave);
    return m
      ? Object.entries(m)
          .map(([k, n]) => `${k}: ${thousands(n)}`)
          .join(" · ")
      : "—";
  };
  const fuera = [
    ["fuera_sin_objetivo", "out-sin-objetivo"],
    ["fuera_sin_fecha", "out-sin-fecha"],
    ["fuera_sin_unidad", "out-sin-unidad"],
    ["fuera_unidades_prueba", "out-unidades-prueba"],
  ] as const;
  const nFuera = fuera.reduce((s, [k]) => s + (numero(c, k) ?? 0), 0);
  const detalleFuera = fuera
    .filter(([k]) => (numero(c, k) ?? 0) > 0)
    .map(([k, clave]) =>
      t(`protocol.stage.6.table.${clave}`, { n: thousands(numero(c, k)!) }),
    )
    .join(" · ");
  type Fila = {
    id: "entrenamiento" | "hueco" | "prueba" | "fuera";
    filas: number;
    unidades: string;
    fechas: string;
    clases: string;
    nota?: string;
  };
  const filas: Fila[] = partida
    ? [
        {
          id: "entrenamiento",
          filas: numero(c, "n_entrenamiento")!,
          unidades:
            numero(c, "unidades_entrenamiento") === null
              ? "—"
              : thousands(numero(c, "unidades_entrenamiento")!),
          fechas: rango(
            texto(c, "fecha_min_entrenamiento"),
            texto(c, "fecha_max_entrenamiento"),
          ),
          clases: clases("clases_entrenamiento"),
        },
        ...(temporal
          ? [
              {
                id: "hueco" as const,
                filas: numero(c, "n_hueco")!,
                unidades: "—",
                fechas: "—",
                clases: "—",
              },
            ]
          : []),
        {
          id: "prueba",
          filas: numero(c, "n_prueba")!,
          unidades:
            numero(c, "unidades_prueba") === null
              ? "—"
              : thousands(numero(c, "unidades_prueba")!),
          fechas: rango(
            texto(c, "fecha_min_prueba"),
            texto(c, "fecha_max_prueba"),
          ),
          clases: clases("clases_prueba"),
        },
        ...(nFuera > 0
          ? [
              {
                id: "fuera" as const,
                filas: nFuera,
                unidades: "—",
                fechas: "—",
                clases: "—",
                nota: detalleFuera,
              },
            ]
          : []),
      ]
    : [];
  const conObjetivo = numero(c, "filas_objetivo") ?? 0;
  const tablaId = "etapa6-tabla";

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-md border border-hairline bg-sunken p-3 text-sm"
        data-testid="protocolo-sugerencia"
      >
        <p className="font-medium">{t("protocol.stage.6.suggest.title")}</p>
        {sug === null ? (
          <p className="mt-1 text-ink-muted">
            {t("protocol.stage.6.suggest.pending")}
          </p>
        ) : (
          <>
            <p className="mt-1">{t(`protocol.stage.6.suggest.${sug}`)}</p>
            <p className="mt-1 text-ink-muted [overflow-wrap:anywhere]">
              {porque}
            </p>
          </>
        )}
      </div>

      {pregunta && (
        <CampoOpciones
          leyenda={t("protocol.stage.6.form.units")}
          ayuda={t("protocol.stage.6.form.units-help")}
          valor={unidades === "" ? null : unidades}
          opciones={[
            {
              valor: "nuevas" as const,
              texto: t("protocol.stage.6.form.units-nuevas"),
            },
            {
              valor: "conocidas" as const,
              texto: t("protocol.stage.6.form.units-conocidas"),
            },
          ]}
          onCambio={setUnidades}
        />
      )}

      <CampoOpciones
        leyenda={t("protocol.stage.6.form.scheme")}
        valor={esquema === "" ? null : esquema}
        opciones={disponibles(diseno).map((e) => ({
          valor: e,
          texto:
            e === sug
              ? `${nombre(e)} · ${t("protocol.stage.6.form.suggested")}`
              : nombre(e),
        }))}
        onCambio={(e) => setElegido(e === sug ? "" : e)}
      />

      {esquema !== "" && sug !== null && esquema !== sug && (
        <CampoArea
          etiqueta={t("protocol.stage.6.form.reason")}
          ayuda={t("protocol.stage.6.form.reason-help")}
          valor={razon}
          onCambio={setRazon}
          maximo={RAZON_MAX}
        />
      )}

      <CampoTexto
        etiqueta={t("protocol.stage.6.form.size")}
        ayuda={t("protocol.stage.6.form.size-help", {
          min: TAMANO_MIN,
          max: TAMANO_MAX,
          sugerido: TAMANO_SUGERIDO,
        })}
        valor={tamanoTexto}
        onCambio={setTamanoTexto}
        numerico
      />

      {temporal && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="sm:flex-1">
            <CampoTexto
              etiqueta={t("protocol.stage.6.form.horizon")}
              ayuda={t("protocol.stage.6.form.horizon-help")}
              valor={horizonteTexto}
              onCambio={setHorizonteTexto}
              numerico
            />
          </div>
          <div className="sm:w-44">
            <CampoSelect
              etiqueta={t("protocol.stage.6.form.horizon-unit")}
              valor={unidadH}
              opciones={[
                { valor: "", texto: t("protocol.stage.6.pick") },
                { valor: "dias", texto: t("protocol.stage.6.form.dias") },
                { valor: "meses", texto: t("protocol.stage.6.form.meses") },
              ]}
              onCambio={(v) =>
                setUnidadH(v === "dias" || v === "meses" ? v : "")
              }
            />
          </div>
        </div>
      )}

      {partida && (
        <div className="flex flex-col gap-2">
          <div
            role="region"
            aria-labelledby={tablaId}
            tabIndex={0}
            className="overflow-x-auto rounded-md border border-hairline"
            data-testid="protocolo-particion"
          >
            <table className="w-full border-collapse text-sm">
              <caption id={tablaId} className="px-3 py-2 text-left font-medium">
                {t("protocol.stage.6.table.caption")}
              </caption>
              <thead>
                <tr className="border-y border-hairline text-xs text-ink-muted">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    {t("protocol.stage.6.table.col-side")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {t("protocol.stage.6.table.col-rows")}
                  </th>
                  {conUnidades && (
                    <th
                      scope="col"
                      className="hidden px-3 py-2 text-right font-medium sm:table-cell"
                    >
                      {t("protocol.stage.6.table.col-units")}
                    </th>
                  )}
                  {conFechas && (
                    <th
                      scope="col"
                      className="hidden px-3 py-2 text-left font-medium sm:table-cell"
                    >
                      {t("protocol.stage.6.table.col-dates")}
                    </th>
                  )}
                  {clasificacion && (
                    <th
                      scope="col"
                      className="hidden px-3 py-2 text-left font-medium sm:table-cell"
                    >
                      {t("protocol.stage.6.table.col-classes")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {filas.map((f) => {
                  const secundarias = [
                    conUnidades && f.unidades !== "—"
                      ? `${t("protocol.stage.6.table.col-units")}: ${f.unidades}`
                      : null,
                    conFechas && f.fechas !== "—"
                      ? `${t("protocol.stage.6.table.col-dates")}: ${f.fechas}`
                      : null,
                    clasificacion && f.clases !== "—"
                      ? `${t("protocol.stage.6.table.col-classes")}: ${f.clases}`
                      : null,
                  ].filter((x): x is string => x !== null);
                  return (
                    <tr
                      key={f.id}
                      data-lado={f.id}
                      className={f.id === "prueba" ? "bg-sunken" : undefined}
                    >
                      <th
                        scope="row"
                        className="px-3 py-2 text-left font-normal [overflow-wrap:anywhere]"
                      >
                        <span
                          className={
                            f.id === "prueba" ? "font-medium" : undefined
                          }
                        >
                          {t(`protocol.stage.6.table.${f.id}`)}
                        </span>
                        {f.nota && (
                          <span className="block text-xs text-ink-muted">
                            {f.nota}
                          </span>
                        )}
                        {/* En pantalla angosta, lo secundario baja debajo del nombre. */}
                        {secundarias.length > 0 && (
                          <span className="mt-1 block text-xs text-ink-muted sm:hidden">
                            {secundarias.join(" · ")}
                          </span>
                        )}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {thousands(f.filas)}
                      </td>
                      {conUnidades && (
                        <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">
                          {f.unidades}
                        </td>
                      )}
                      {conFechas && (
                        <td className="hidden px-3 py-2 tabular-nums sm:table-cell">
                          {f.fechas}
                        </td>
                      )}
                      {clasificacion && (
                        <td className="hidden px-3 py-2 sm:table-cell [overflow-wrap:anywhere]">
                          {f.clases}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-muted">
            {t("protocol.stage.6.table.note")}
          </p>
          <p className="text-sm" data-testid="protocolo-tamano-real">
            {t("protocol.stage.6.table.real-size", {
              n: thousands(numero(c, "n_prueba")!),
              total: thousands(conObjetivo),
              pct: formatQuantity(
                conObjetivo > 0
                  ? (100 * numero(c, "n_prueba")!) / conObjetivo
                  : 0,
                1,
              ),
            })}
            {temporal && texto(c, "corte") && (
              <>
                {" "}
                {t("protocol.stage.6.table.cut", { corte: texto(c, "corte")! })}
              </>
            )}
          </p>

          <div
            className="rounded-md border border-hairline p-3 text-sm"
            data-testid="protocolo-verificacion"
          >
            <p className="font-medium">{t("protocol.stage.6.verify.title")}</p>
            <ul className="mt-1 flex flex-col gap-1">
              <Verificado ok={numero(c, "solape_filas") === 0}>
                {numero(c, "solape_filas") === 0
                  ? t("protocol.stage.6.verify.rows")
                  : t("protocol.stage.6.verify.rows-bad", {
                      n: thousands(numero(c, "solape_filas") ?? 0),
                    })}
              </Verificado>
              {esquema !== "" && esPorGrupo(esquema) && (
                <Verificado ok={numero(c, "solape_unidades") === 0}>
                  {numero(c, "solape_unidades") === 0
                    ? t("protocol.stage.6.verify.units")
                    : t("protocol.stage.6.verify.units-bad", {
                        n: thousands(numero(c, "solape_unidades") ?? 0),
                      })}
                </Verificado>
              )}
              {temporal && (
                <Verificado ok={numero(c, "solape_tiempo") === 0}>
                  {numero(c, "solape_tiempo") === 0
                    ? t("protocol.stage.6.verify.time")
                    : // S16 (S11): el camino malo existía en los textos y nunca se pintaba
                      t("protocol.stage.6.verify.time-bad", {
                        n: thousands(numero(c, "solape_tiempo") ?? 0),
                      })}
                </Verificado>
              )}
            </ul>
          </div>
        </div>
      )}

      <div
        className="rounded-md border border-hairline p-3 text-sm"
        data-testid="protocolo-sello"
      >
        <p className="font-medium">{t("protocol.stage.6.seal.title")}</p>
        <p className="mt-1 font-mono text-xs [overflow-wrap:anywhere]">
          {sello
            ? t("protocol.stage.6.seal.value", { sello: huellaCorta(sello) })
            : t("protocol.stage.6.seal.pending")}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {t("protocol.stage.6.seal.note")}
        </p>
        <p className="mt-1 text-xs" data-testid="protocolo-sellos">
          {sellosAntes === 0
            ? t("protocol.stage.6.seal.none")
            : t("protocol.stage.6.seal.count", { n: sellosAntes })}
        </p>
      </div>

      <Trampas
        etapa={6}
        trampas={ETAPA_6.trampas(calculo, previas, historia)}
      />

      <Registrar etapa={6} onClick={() => onRegistrar(calculo)} />
    </div>
  );
}

"use client";

// Protocolo DS (S12), etapa 7 — la pantalla. Lo que hereda de las etapas 1 a 6, los pliegues (dentro del
// entrenamiento) con su verificación, «Correr la liga» con su progreso y cancelar, la liga con la medida de
// selección, por qué ganó, la comparación con la línea base pliegue a pliegue y la permutación. Ningún
// valor de una fila llega a la pantalla: solo conteos, nombres de columna, de modelo y de clase, y cifras
// agregadas. Se carga diferida (formularios.tsx): ni ella ni el worker pesan en la página inicial.
import { useMemo } from "react";
import { Button, Icon } from "@/components/ui";
import { por100 } from "@/engine/protocolo/etapa5";
import { ETAPA_7, datosEtapa7, plan7 } from "@/engine/protocolo/etapa7";
import { esPorGrupo, esTemporal } from "@/engine/protocolo/particion";
import { resolucion } from "@/engine/protocolo/permutacion";
import { lista, mapa, numero, texto } from "@/engine/protocolo/valores";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { TEXTOS_ETAPA_7 } from "./textos/etapa7";
import { cifra, proporcion } from "@/lib/protocolo/formato";
import { envio7 } from "@/lib/protocolo/liga7";
import { useValidacion } from "@/lib/protocolo/useValidacion";
import { thousands } from "@/lib/quantity";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";

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

export function Etapa7Form({ datos, previas, onRegistrar }: PropsFormulario) {
  const t = useTextosEtapa(TEXTOS_ETAPA_7);
  const tabla = datos?.tabla ?? null;
  const huella = datos?.carga.sha256 ?? null;
  const plan = useMemo(
    () => (tabla ? plan7(tabla, previas, huella) : null),
    [tabla, previas, huella],
  );
  const envio = useMemo(
    () => (tabla && plan ? envio7(tabla, plan) : null),
    [tabla, plan],
  );
  const { estado, correr, cancelar } = useValidacion();
  const corrida = estado.tipo === "lista" ? estado.corrida : null;
  const registro = useMemo(
    () => (tabla ? datosEtapa7(tabla, previas, huella, corrida) : null),
    [tabla, previas, huella, corrida],
  );

  if (!tabla || !plan || !registro)
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.7.need-data")}
      </p>
    );

  const c = registro.chequeos;
  const modelo = (id: string) => t(`results.candidates.short.${id}`);
  const esquema = plan.parametros.esquema;
  const k = plan.pliegues.ok ? plan.pliegues.k : null;
  const columnas = [...plan.numericas, ...plan.categoricas];
  const ocupado = estado.tipo === "cargando" || estado.tipo === "corriendo";
  const v = plan.verificacion;

  const estadoTexto =
    estado.tipo === "cargando"
      ? t("protocol.stage.7.run.loading")
      : estado.tipo === "corriendo"
        ? estado.fase === "cv"
          ? t("protocol.stage.7.run.cv", {
              i: estado.i,
              n: estado.n,
              modelo: modelo(estado.modelo),
            })
          : t("protocol.stage.7.run.perm", { i: estado.i, n: estado.n })
        : estado.tipo === "cancelada"
          ? t("protocol.stage.7.run.cancelled")
          : estado.tipo === "error"
            ? t("protocol.stage.7.run.error", { motivo: estado.motivo })
            : "";

  const baseIds = lista(c, "base_ids");
  const baseCosto = mapa(c, "base_costo");
  const ganadorCosto = mapa(c, "ganador_costo");
  const [media, bajo, alto] = [
    numero(c, "diferencia_media"),
    numero(c, "ic_bajo"),
    numero(c, "ic_alto"),
  ];
  const veredicto = texto(c, "veredicto");
  const ganador = texto(c, "ganador");
  const mejor = texto(c, "mejor");
  const ee = numero(c, "ee");
  const [permN, permFallidas, permMejores, permP] = [
    numero(c, "perm_n"),
    numero(c, "perm_fallidas"),
    numero(c, "perm_mejores"),
    numero(c, "perm_p"),
  ];
  const nEfectivas =
    permN !== null && permFallidas !== null ? permN - permFallidas : null;
  const liga = corrida?.resultado.league ?? [];
  const puntaje = (id: string) => {
    const fila = liga.find((x) => x.name === id);
    return fila?.cv ? cifra(fila.cv.mean) : "—";
  };
  const por100Txt = (x: number) => cifra(por100(x));

  return (
    <div className="flex flex-col gap-4">
      <Seccion
        titulo={t("protocol.stage.7.inherit.title")}
        testid="protocolo-hereda"
      >
        <ul className="flex flex-col gap-1 text-ink-muted [overflow-wrap:anywhere]">
          <li>
            {columnas.length > 0
              ? t("protocol.stage.7.inherit.columns", {
                  n: columnas.length,
                  lista: columnas.join(", "),
                })
              : t("protocol.stage.7.inherit.no-columns")}
          </li>
          <li>
            {t("protocol.stage.7.inherit.scheme", {
              esquema: t(`protocol.stage.6.scheme.${esquema}`),
              n: thousands(plan.particion.entrenamiento.length),
            })}
          </li>
          <li>{t("protocol.stage.7.inherit.baseline")}</li>
        </ul>
      </Seccion>

      <Seccion
        titulo={t("protocol.stage.7.folds.title")}
        testid="protocolo-pliegues"
      >
        {!plan.pliegues.ok ? (
          <p className="text-caution">
            {t("protocol.stage.7.folds.none", {
              razon: t(`protocol.stage.7.folds.reason.${plan.pliegues.razon}`),
            })}
          </p>
        ) : (
          <>
            <p>
              {t("protocol.stage.7.folds.k", { k: plan.pliegues.k })}
              {plan.pliegues.razon !== "pedido" &&
                ` ${t("protocol.stage.7.folds.reduced", {
                  pedido: plan.pliegues.kPedido,
                  k: plan.pliegues.k,
                  razon: t(
                    `protocol.stage.7.folds.reason.${plan.pliegues.razon}`,
                  ),
                })}`}
            </p>
            <table className="w-full text-left">
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("protocol.stage.7.folds.col-fold")}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {t("protocol.stage.7.folds.col-train")}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {t("protocol.stage.7.folds.col-val")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {plan.pliegues.pliegues.map((p, j) => (
                  <tr key={j} data-pliegue={j + 1}>
                    <th scope="row" className="py-1 pr-3 font-normal">
                      {j + 1}
                    </th>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {thousands(p.entrenamiento.length)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {thousands(p.validacion.length)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {esTemporal(esquema) && (
              <p className="text-ink-muted">
                {t("protocol.stage.7.folds.time-note")}
              </p>
            )}
            {v && (
              <div data-testid="protocolo-verificacion7">
                <p className="font-medium">
                  {t("protocol.stage.7.verify.title")}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  <Verificado ok={v.solapeFilas === 0}>
                    {v.solapeFilas === 0
                      ? t("protocol.stage.7.verify.rows")
                      : t("protocol.stage.7.verify.rows-bad", {
                          n: thousands(v.solapeFilas),
                        })}
                  </Verificado>
                  {esPorGrupo(esquema) && (
                    <Verificado ok={v.solapeUnidades === 0}>
                      {v.solapeUnidades === 0
                        ? t("protocol.stage.7.verify.units")
                        : t("protocol.stage.7.verify.units-bad", {
                            n: thousands(v.solapeUnidades),
                          })}
                    </Verificado>
                  )}
                  {esTemporal(esquema) && (
                    <Verificado ok={v.validacionAntes === 0}>
                      {v.validacionAntes === 0
                        ? t("protocol.stage.7.verify.time")
                        : t("protocol.stage.7.verify.time-bad", {
                            n: thousands(v.validacionAntes),
                          })}
                    </Verificado>
                  )}
                  <Verificado ok={v.fueraDelEntrenamiento === 0}>
                    {v.fueraDelEntrenamiento === 0
                      ? t("protocol.stage.7.verify.test")
                      : t("protocol.stage.7.verify.test-bad", {
                          n: thousands(v.fueraDelEntrenamiento),
                        })}
                  </Verificado>
                </ul>
              </div>
            )}
          </>
        )}
      </Seccion>

      <div className="flex flex-col gap-2" data-testid="protocolo-correr">
        <div className="flex flex-wrap gap-2">
          <Button
            icon={corrida ? "retry" : "play"}
            disabled={envio === null || ocupado}
            onClick={() => envio && correr(envio)}
          >
            {corrida
              ? t("protocol.stage.7.run.again")
              : t("protocol.stage.7.run.button")}
          </Button>
          {ocupado && (
            <Button icon="stop" variant="secondary" onClick={cancelar}>
              {t("protocol.stage.7.run.cancel")}
            </Button>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          className={`text-sm ${estado.tipo === "error" ? "text-caution" : "text-ink-muted"}`}
          data-testid="protocolo-progreso"
        >
          {estadoTexto}
        </p>
        <p className="text-xs text-ink-muted">
          {t("protocol.stage.7.run.note")}
        </p>
      </div>

      {corrida && ganador && (
        <>
          <Seccion
            titulo={t("protocol.stage.7.league.title")}
            testid="protocolo-liga"
          >
            <table className="w-full text-left">
              <caption className="pb-1 text-left text-ink-muted">
                {t("protocol.stage.7.league.caption", {
                  metrica: t(`results.metrics.${corrida.metrica}`),
                })}
              </caption>
              <thead className="text-ink-muted">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("protocol.stage.7.league.col-model")}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {t("protocol.stage.7.league.col-score")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {liga.map((fila) => (
                  <tr
                    key={fila.name}
                    data-modelo={fila.name}
                    className={fila.name === ganador ? "bg-sunken" : undefined}
                  >
                    <th
                      scope="row"
                      className="py-1 pr-3 font-normal [overflow-wrap:anywhere]"
                    >
                      <span
                        className={
                          fila.name === ganador ? "font-medium" : undefined
                        }
                      >
                        {modelo(fila.name)}
                      </span>
                      {fila.name === ganador && (
                        <span className="ml-2 text-xs">
                          <Icon
                            name="check"
                            className="inline h-3 w-3 text-positive"
                          />{" "}
                          {t("protocol.stage.7.league.winner")}
                        </span>
                      )}
                      {fila.name === mejor && fila.name !== ganador && (
                        <span className="ml-2 text-xs text-ink-muted">
                          {t("protocol.stage.7.league.best")}
                        </span>
                      )}
                      {fila.status !== "ok" && (
                        <span className="ml-2 text-xs text-caution">
                          {t(`protocol.stage.7.league.${fila.status}`)}
                        </span>
                      )}
                    </th>
                    <td className="py-1 text-right tabular-nums">
                      {fila.cv
                        ? `${cifra(fila.cv.mean)} ± ${cifra(fila.cv.std)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-ink-muted">
              {t("protocol.stage.7.league.note")}
            </p>
          </Seccion>

          <Seccion
            titulo={t("protocol.stage.7.why.title")}
            testid="protocolo-porque-gano"
          >
            <p className="[overflow-wrap:anywhere]">
              {mejor === ganador
                ? t("protocol.stage.7.why.same", {
                    ganador: modelo(ganador),
                    puntaje: puntaje(ganador),
                    ee: ee === null ? "—" : cifra(ee),
                  })
                : t("protocol.stage.7.why.simpler", {
                    mejor: modelo(mejor ?? ""),
                    puntaje: puntaje(mejor ?? ""),
                    ganador: modelo(ganador),
                    ee: ee === null ? "—" : cifra(ee),
                  })}
            </p>
          </Seccion>

          <Seccion
            titulo={t("protocol.stage.7.compare.title")}
            testid="protocolo-comparacion"
          >
            {baseIds && baseCosto && ganadorCosto && k !== null && (
              <table className="w-full text-left">
                <caption className="pb-1 text-left text-ink-muted">
                  {t("protocol.stage.7.compare.caption")}
                </caption>
                <thead className="text-ink-muted">
                  <tr>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("protocol.stage.7.compare.col-fold")}
                    </th>
                    <th
                      scope="col"
                      className="hidden py-1 pr-3 font-medium sm:table-cell"
                    >
                      {t("protocol.stage.7.compare.col-base")}
                    </th>
                    <th
                      scope="col"
                      className="py-1 pr-3 text-right font-medium"
                    >
                      {t("protocol.stage.7.compare.col-base-cost")}
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      {t("protocol.stage.7.compare.col-winner-cost")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {Array.from({ length: k }, (_, j) => {
                    const ref = t(`protocol.stage.7.ref.${baseIds[j]}`);
                    return (
                      <tr key={j} data-pliegue={j + 1}>
                        <th scope="row" className="py-1 pr-3 font-normal">
                          {j + 1}
                          {/* En pantalla angosta, la línea base baja debajo del número. */}
                          <span className="block text-xs text-ink-muted sm:hidden">
                            {ref}
                          </span>
                        </th>
                        <td className="hidden py-1 pr-3 sm:table-cell [overflow-wrap:anywhere]">
                          {ref}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {por100Txt(baseCosto[String(j + 1)]!)}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {por100Txt(ganadorCosto[String(j + 1)]!)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {media !== null && bajo !== null && alto !== null && (
              <p className="[overflow-wrap:anywhere]">
                {t("protocol.stage.7.compare.diff", {
                  media: por100Txt(media),
                  bajo: por100Txt(bajo),
                  alto: por100Txt(alto),
                })}
              </p>
            )}
            {veredicto && (
              <ul data-testid="protocolo-veredicto7">
                <Verificado ok={veredicto === "supera"}>
                  {t(`protocol.stage.7.compare.${veredicto}`)}
                </Verificado>
              </ul>
            )}
            <p className="text-ink-muted">
              {t("protocol.stage.7.compare.note")}
            </p>
          </Seccion>

          <Seccion
            titulo={t("protocol.stage.7.perm.title")}
            testid="protocolo-permutacion"
          >
            {permP !== null && nEfectivas !== null && permMejores !== null ? (
              <>
                <p>
                  {t("protocol.stage.7.perm.result", {
                    n: thousands(nEfectivas),
                    m: thousands(permMejores),
                    p: proporcion(permP),
                  })}
                </p>
                <p className="text-ink-muted">
                  {t("protocol.stage.7.perm.resolution", {
                    n: thousands(nEfectivas),
                    res: proporcion(resolucion(nEfectivas)),
                  })}
                </p>
                <ul>
                  <Verificado ok={c.senal === "senal"}>
                    {t(
                      `protocol.stage.7.perm.${c.senal === "senal" ? "senal" : "sin-senal"}`,
                    )}
                  </Verificado>
                </ul>
              </>
            ) : null}
            {permFallidas !== null && permFallidas > 0 && (
              <p className="text-caution">
                {t("protocol.stage.7.perm.failed", {
                  n: thousands(permFallidas),
                })}
              </p>
            )}
          </Seccion>
        </>
      )}

      <Trampas etapa={7} trampas={ETAPA_7.trampas(registro, previas)} />
      <Registrar
        etapa={7}
        deshabilitado={corrida === null}
        onClick={() => onRegistrar(registro)}
      />
    </div>
  );
}

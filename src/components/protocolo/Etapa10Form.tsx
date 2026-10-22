"use client";

// Protocolo DS (S15), etapa 10 — la pantalla. No habla con el worker ni abre la prueba: la ficha del modelo sale
// de lo que el cuaderno ya registró en las etapas 1 a 9, y aquí solo pones a quien responde y, según tu decisión
// de la 9, el plan de vigilancia (con «usar»: cada cuánto se reentrena) o qué tendría que cambiar (con «no usar»
// o «iterar»). Lo derivado no se edita; lo que escribes va rotulado como tuyo. La referencia de deriva (solo
// agregados) se calcula una vez sobre las filas del entrenamiento sellado, no en cada tecla. Se carga diferida
// (formularios.tsx), con sus textos y la vista de la ficha.
import { useMemo, useState } from "react";
import {
  DERIVA_CATEGORIAS,
  PSI_ALERTA,
  PSI_MODERADA,
} from "@/engine/protocolo/deriva";
import {
  CADENCIA_MAX,
  DUENO_MAX,
  ENTRADA_10_VACIA,
  ETAPA_10,
  cadenciaDe,
  cadenciaSugerida,
  calcular10,
  columnasDeTexto,
  decisionDe,
  respuestasDe,
  type EntradaEtapa10,
} from "@/engine/protocolo/etapa10";
import { RAZON_MAX } from "@/engine/protocolo/etapa9";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import {
  armarFicha,
  cargaDe,
  evidenciasCumplidas,
} from "@/engine/protocolo/ficha";
import { REF_SOPORTE_MIN } from "@/engine/protocolo/referencia-deriva";
import { lista, numero, texto, textoLleno } from "@/engine/protocolo/valores";
import { useI18n } from "@/i18n/provider";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { fichaVista, nombresDe } from "@/lib/protocolo/ficha-texto";
import { cifra, proporcion } from "@/lib/protocolo/formato";
import { Button } from "@/components/ui";
import { CampoArea, CampoCasillas, CampoTexto } from "./campos";
import { FichaVista } from "./FichaVista";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";
import { TEXTOS_ETAPA_10 } from "./textos/etapa10";

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

/** Lo que se registró la última vez, para corregirlo; la primera vez, la cadencia que respalda la prueba. */
function desdeAnterior(
  anterior: DatosEtapa | null,
  sugerida: number | null,
): EntradaEtapa10 {
  if (!anterior)
    return {
      ...ENTRADA_10_VACIA,
      cadencia: sugerida === null ? "" : String(sugerida),
    };
  const r = anterior.respuestas;
  const cadencia = numero(r, "cadencia");
  return {
    dueno: texto(r, "dueno") ?? "",
    noUsarPara: texto(r, "no_usar_para") ?? "",
    cadencia: cadencia === null ? "" : String(cadencia),
    razonCadencia: texto(r, "razon_cadencia") ?? "",
    cambiar: texto(r, "cambiar") ?? "",
    vigilarTexto: lista(r, "vigilar_texto") ?? [],
  };
}

export function Etapa10Form({
  datos,
  anterior,
  previas,
  evaluadas,
  cuaderno,
  onRegistrar,
}: PropsFormulario) {
  const t = useTextosEtapa(TEXTOS_ETAPA_10);
  const { locale } = useI18n();
  const decision = decisionDe(previas);
  const { sugerida } = cadenciaSugerida(previas);
  const [entrada, setEntrada] = useState<EntradaEtapa10>(() =>
    desdeAnterior(anterior, sugerida),
  );
  const poner = (cambio: Partial<EntradaEtapa10>) =>
    setEntrada((e) => ({ ...e, ...cambio }));

  // lo que sale de la tabla (la referencia de deriva) se calcula al cambiar las marcas, no en cada tecla
  const tabla = datos?.tabla ?? null;
  const huella = datos?.carga.sha256 ?? null;
  // las columnas de texto del modelo: sus nombres de categoría solo se guardan si las marcas (en el orden de la tabla)
  const candidatas = useMemo(
    () => columnasDeTexto(previas, tabla, huella),
    [previas, tabla, huella],
  );
  const marcadas = useMemo(
    () => candidatas.filter((c) => entrada.vigilarTexto.includes(c)),
    [candidatas, entrada.vigilarTexto],
  );
  const calculado = useMemo(
    () => calcular10(previas, tabla, huella, marcadas),
    [previas, tabla, huella, marcadas],
  );
  const registro = useMemo<DatosEtapa>(
    () => ({
      respuestas: respuestasDe({ ...entrada, vigilarTexto: marcadas }, decision),
      chequeos: calculado,
    }),
    [entrada, marcadas, decision, calculado],
  );
  const ficha = useMemo(
    () =>
      evaluadas
        ? armarFicha({
            evidencias: {
              ...evidenciasCumplidas(evaluadas),
              10: { datos: registro, fecha: null, huella: null },
            },
            carga: cuaderno ? cargaDe(cuaderno, huella) : null,
          })
        : null,
    [evaluadas, cuaderno, huella, registro],
  );
  const secciones = useMemo(
    () =>
      ficha
        ? fichaVista(
            ficha,
            t,
            locale,
            nombresDe(evidenciasCumplidas(evaluadas ?? [])),
          )
        : [],
    [ficha, t, locale, evaluadas],
  );

  if (!datos || !decision)
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.10.need-data")}
      </p>
    );

  const usar = decision === "usar";
  const decisor = previas[1]
    ? textoLleno(previas[1].respuestas, "decisor")
    : null;
  const cadencia = cadenciaDe(entrada.cadencia);
  const alargada =
    sugerida !== null && cadencia !== null && cadencia > sugerida;
  const columnas = lista(calculado, "vig_columnas");
  const nReferencia = numero(calculado, "n_referencia");
  const corte = previas[6] ? texto(previas[6].chequeos, "corte") : null;
  const fin = previas[2] ? texto(previas[2].chequeos, "fecha_max") : null;

  return (
    <div className="flex flex-col gap-4">
      <Seccion
        titulo={t("protocol.stage.10.reads.title")}
        testid="protocolo-lee10"
      >
        <p className="text-ink-muted">{t("protocol.stage.10.reads.body")}</p>
        <p data-testid="protocolo-decision10">
          <span className="font-medium">
            {t("protocol.stage.10.decision.title")}:{" "}
          </span>
          {t(`protocol.stage.10.decision.${decision}`)}
        </p>
      </Seccion>

      <Seccion
        titulo={t("protocol.stage.10.owner.title")}
        testid="protocolo-dueno10"
      >
        <CampoTexto
          etiqueta={t("protocol.stage.10.owner.label")}
          ayuda={t("protocol.stage.10.owner.help", { max: DUENO_MAX })}
          valor={entrada.dueno}
          onCambio={(dueno) => poner({ dueno })}
          maximo={DUENO_MAX}
        />
        {decisor && entrada.dueno.trim() !== decisor && (
          <div>
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => poner({ dueno: decisor.slice(0, DUENO_MAX) })}
            >
              {t("protocol.stage.10.owner.suggest", { decisor })}
            </Button>
          </div>
        )}
        <CampoArea
          etiqueta={t("protocol.stage.10.not-use.label")}
          ayuda={t("protocol.stage.10.not-use.help", { max: RAZON_MAX })}
          valor={entrada.noUsarPara}
          onCambio={(noUsarPara) => poner({ noUsarPara })}
          maximo={RAZON_MAX}
        />
      </Seccion>

      {usar ? (
        <>
          <Seccion
            titulo={t("protocol.stage.10.cadence.title")}
            testid="protocolo-cadencia10"
          >
            <CampoTexto
              etiqueta={t("protocol.stage.10.cadence.label")}
              ayuda={
                sugerida === null
                  ? t("protocol.stage.10.cadence.help-no-time", {
                      max: CADENCIA_MAX,
                    })
                  : t("protocol.stage.10.cadence.help-time", {
                      sugerida,
                      corte: corte ?? "—",
                      fin: fin ?? "—",
                    })
              }
              valor={entrada.cadencia}
              onCambio={(c) => poner({ cadencia: c })}
              numerico
              maximo={2}
            />
            {alargada && (
              <CampoArea
                etiqueta={t("protocol.stage.10.cadence.reason-label")}
                ayuda={t("protocol.stage.10.cadence.reason-help", {
                  sugerida,
                  max: RAZON_MAX,
                })}
                valor={entrada.razonCadencia}
                onCambio={(razonCadencia) => poner({ razonCadencia })}
                maximo={RAZON_MAX}
              />
            )}
          </Seccion>
          {candidatas.length > 0 && (
            <Seccion
              titulo={t("protocol.stage.10.text.title")}
              testid="protocolo-texto10"
            >
              <CampoCasillas
                leyenda={t("protocol.stage.10.text.legend")}
                ayuda={t("protocol.stage.10.text.help", {
                  min: REF_SOPORTE_MIN,
                  max: DERIVA_CATEGORIAS,
                })}
                opciones={candidatas}
                marcadas={marcadas}
                onCambio={(columna, marcada) =>
                  poner({
                    vigilarTexto: marcada
                      ? [...entrada.vigilarTexto, columna]
                      : entrada.vigilarTexto.filter((c) => c !== columna),
                  })
                }
              />
              <p
                role="status"
                className="text-ink-muted"
                data-testid="protocolo-texto10-estado"
              >
                {t("protocol.stage.10.text.status", {
                  n: marcadas.length,
                  total: candidatas.length,
                })}
              </p>
            </Seccion>
          )}
          <Seccion
            titulo={t("protocol.stage.10.plan.title")}
            testid="protocolo-plan10"
          >
            {columnas && nReferencia !== null ? (
              <>
                <p>
                  {t("protocol.stage.10.plan.body", {
                    columnas: cifra(columnas.length),
                    n: cifra(nReferencia),
                  })}
                </p>
                <p className="text-ink-muted">
                  {t("protocol.stage.10.plan.thresholds", {
                    moderada: proporcion(PSI_MODERADA),
                    alerta: proporcion(PSI_ALERTA),
                  })}
                </p>
                <p className="text-ink-muted">
                  {t("protocol.stage.10.plan.inputs")}
                </p>
              </>
            ) : (
              <p
                className="text-caution"
                data-testid="protocolo-plan10-sin-referencia"
              >
                <span aria-hidden="true">⚠ </span>
                {t("protocol.stage.10.plan.none")}
              </p>
            )}
          </Seccion>
        </>
      ) : (
        <Seccion
          titulo={t("protocol.stage.10.change.title")}
          testid="protocolo-cambiar10"
        >
          <CampoArea
            etiqueta={t(`protocol.stage.10.change.label-${decision}`)}
            ayuda={t(`protocol.stage.10.change.help-${decision}`, {
              max: RAZON_MAX,
            })}
            valor={entrada.cambiar}
            onCambio={(cambiar) => poner({ cambiar })}
            maximo={RAZON_MAX}
          />
        </Seccion>
      )}

      {ficha && (
        <details
          className="rounded-md border border-hairline p-3 text-sm"
          data-testid="protocolo-preview10"
        >
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">
            {t("protocol.stage.10.preview.summary")}
          </summary>
          <p className="mt-1 text-ink-muted">
            {t("protocol.stage.10.preview.note")}
          </p>
          <div className="mt-2">
            <FichaVista
              secciones={secciones}
              testid="protocolo-preview10-secciones"
            />
          </div>
        </details>
      )}

      <Trampas etapa={10} trampas={ETAPA_10.trampas(registro, previas)} />
      <Registrar etapa={10} onClick={() => onRegistrar(registro)} />
    </div>
  );
}

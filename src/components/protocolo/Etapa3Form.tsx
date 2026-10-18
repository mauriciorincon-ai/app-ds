"use client";

// Protocolo DS (S8), etapa 3: ¿predecir o explicar? y el diseño. «Explicar una causa» detiene el
// Protocolo con su porqué; «predecir» pide la ficha de diseño y muestra, con tus filas y tus
// variables, cuántas filas hacen falta (criterios de Riley). Si no alcanzan, la compuerta pide un
// aviso escrito por ti: no te lo impide ni te lo esconde.
import { useMemo, useState } from "react";
import { matchTask } from "@/engine/despacho";
import { formaDe } from "@/engine/protocolo/etapa1";
import {
  ETAPA_3,
  PROPOSITOS,
  chequeos3,
  type Proposito,
} from "@/engine/protocolo/etapa3";
import type { DatosEtapa, Valor } from "@/engine/protocolo/etapas";
import { contarParametros } from "@/engine/protocolo/tabla";
import { texto } from "@/engine/protocolo/valores";
import { useI18n } from "@/i18n/provider";
import { formatQuantity, thousands } from "@/lib/quantity";
import {
  CampoArea,
  CampoOpciones,
  CampoTexto,
  leerNumero,
  numeroATexto,
} from "./campos";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";

export function Etapa3Form({
  datos,
  anterior,
  previas,
  onRegistrar,
}: PropsFormulario) {
  const { t } = useI18n();
  const etapa1 = previas[1];
  const etapa2 = previas[2];
  const forma = etapa1 ? formaDe(etapa1.respuestas) : null;
  const previa = anterior?.respuestas;
  const tabla = datos?.tabla ?? null;

  // Los parámetros candidatos: se cuentan en los datos, sin el objetivo, la unidad ni la fecha.
  const contados = useMemo(() => {
    if (!tabla || !etapa2) return null;
    const excluir = ["objetivo", "unidad_columna", "momento_columna"]
      .map((clave) => texto(etapa2.respuestas, clave))
      .filter((v): v is string => v !== null && v !== "");
    return contarParametros(tabla, excluir);
  }, [tabla, etapa2]);

  const [proposito, setProposito] = useState<Proposito | null>(
    PROPOSITOS.find((p) => p === previa?.proposito) ?? null,
  );
  const [poblacion, setPoblacion] = useState(
    texto(previa ?? {}, "poblacion") ?? "",
  );
  const [exclusiones, setExclusiones] = useState(
    texto(previa ?? {}, "exclusiones") ?? "",
  );
  const [periodoTexto, setPeriodoTexto] = useState(
    texto(previa ?? {}, "periodo_texto") ?? "",
  );
  const [parametros, setParametros] = useState(
    numeroATexto(previa?.parametros) ||
      (contados === null ? "" : String(contados)),
  );
  const [r2, setR2] = useState(numeroATexto(previa?.r2));
  const [aviso, setAviso] = useState(texto(previa ?? {}, "aviso") ?? "");

  const conFecha = etapa2?.respuestas.momento === "columna";
  const pideR2 = forma
    ? matchTask(forma, {
        binaria: () => false,
        multiclase: () => false,
        numerica: () => true,
      })
    : false;

  const respuestas = useMemo((): Record<string, Valor> | null => {
    if (!proposito) return null;
    const p = leerNumero(parametros);
    return {
      proposito,
      poblacion,
      exclusiones,
      periodo_texto: conFecha ? "" : periodoTexto,
      parametros: p !== null && Number.isInteger(p) ? p : null,
      r2: pideR2 ? leerNumero(r2) : null,
      aviso,
    };
  }, [
    proposito,
    poblacion,
    exclusiones,
    periodoTexto,
    parametros,
    r2,
    aviso,
    conFecha,
    pideR2,
  ]);

  const calculo =
    respuestas && proposito !== "explicar"
      ? chequeos3(respuestas, previas)
      : null;
  const vista: DatosEtapa | null =
    respuestas && (proposito === "explicar" || calculo)
      ? { respuestas, chequeos: (calculo ?? {}) as DatosEtapa["chequeos"] }
      : null;
  const trampas = vista ? ETAPA_3.trampas(vista, previas) : [];
  const suficiente = calculo?.suficiente === true;
  const predice = proposito !== null && proposito !== "explicar";

  if (!tabla || !etapa1 || !etapa2) {
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.3.need-data")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CampoOpciones
        leyenda={t("protocol.stage.3.field.proposito")}
        ayuda={t("protocol.stage.3.help.proposito")}
        valor={proposito}
        opciones={PROPOSITOS.map((p) => ({
          valor: p,
          texto: t(`protocol.stage.3.proposito.${p}`),
        }))}
        onCambio={setProposito}
      />

      {predice && (
        <>
          <CampoArea
            etiqueta={t("protocol.stage.3.field.poblacion")}
            ayuda={t("protocol.stage.3.help.poblacion")}
            valor={poblacion}
            onCambio={setPoblacion}
            filas={2}
          />
          {conFecha ? (
            <p className="text-sm" data-testid="protocolo-periodo">
              {t("protocol.stage.3.period-from-data", {
                min: texto(etapa2.chequeos, "fecha_min") ?? "",
                max: texto(etapa2.chequeos, "fecha_max") ?? "",
              })}
            </p>
          ) : (
            <CampoTexto
              etiqueta={t("protocol.stage.3.field.periodo_texto")}
              ayuda={t("protocol.stage.3.help.periodo_texto")}
              valor={periodoTexto}
              onCambio={setPeriodoTexto}
            />
          )}
          <CampoArea
            etiqueta={t("protocol.stage.3.field.exclusiones")}
            ayuda={t("protocol.stage.3.help.exclusiones")}
            valor={exclusiones}
            onCambio={setExclusiones}
            filas={2}
          />
          <CampoTexto
            numerico
            etiqueta={t("protocol.stage.3.field.parametros")}
            ayuda={t("protocol.stage.3.help.parametros", {
              n: contados === null ? 0 : thousands(contados),
            })}
            valor={parametros}
            onCambio={setParametros}
          />
          {pideR2 && (
            <CampoTexto
              numerico
              etiqueta={t("protocol.stage.3.field.r2")}
              ayuda={t("protocol.stage.3.help.r2")}
              valor={r2}
              onCambio={setR2}
            />
          )}

          {calculo && (
            <div
              className="rounded-md border border-hairline p-3 text-sm"
              data-testid="protocolo-muestra"
            >
              <p className="font-medium">
                {t("protocol.stage.3.size.title", {
                  required: thousands(Number(calculo.n_requerido)),
                  available: thousands(Number(calculo.n_disponible)),
                })}
              </p>
              <p className={suficiente ? "text-ink-muted" : "text-caution"}>
                <span aria-hidden="true">{suficiente ? "✓" : "⚠"} </span>
                {t(
                  suficiente
                    ? "protocol.stage.3.size.enough"
                    : "protocol.stage.3.size.short",
                )}
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">
                {[
                  "contraccion",
                  "optimismo",
                  "riesgo_medio",
                  "varianza",
                  "media",
                ].map((id) =>
                  typeof calculo[id] === "number" ? (
                    <li key={id}>
                      {t(`protocol.stage.3.check.${id}`)}:{" "}
                      {thousands(Number(calculo[id]))}
                    </li>
                  ) : null,
                )}
              </ul>
              {typeof calculo.eventos === "number" && (
                <p className="mt-1 text-xs text-ink-muted">
                  {t("protocol.stage.3.size.events", {
                    events: formatQuantity(Number(calculo.eventos), 1),
                    epp: formatQuantity(Number(calculo.epp), 1),
                  })}
                </p>
              )}
            </div>
          )}

          {calculo && !suficiente && (
            <CampoArea
              etiqueta={t("protocol.stage.3.field.aviso")}
              ayuda={t("protocol.stage.3.help.aviso")}
              valor={aviso}
              onCambio={setAviso}
              filas={2}
            />
          )}
          <Trampas etapa={3} trampas={trampas} />
        </>
      )}
      {proposito === "explicar" && <Trampas etapa={3} trampas={trampas} />}

      <Registrar
        etapa={3}
        deshabilitado={respuestas === null}
        onClick={() =>
          respuestas
            ? onRegistrar({
                respuestas,
                chequeos:
                  proposito === "explicar"
                    ? {}
                    : ({
                        ...(calculo ?? {}),
                        ...(contados === null
                          ? {}
                          : { parametros_contados: contados }),
                      } as DatosEtapa["chequeos"]),
              })
            : null
        }
      />
    </div>
  );
}

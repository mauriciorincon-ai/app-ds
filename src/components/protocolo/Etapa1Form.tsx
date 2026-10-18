"use client";

// Protocolo DS (S8), etapa 1: el formulario de la decisión y sus costos. Mientras escribes,
// muestra lo que salen de tus costos (el umbral o el cuantil) y la trampa que evita; la compuerta
// decide al registrar.
import { useMemo, useState } from "react";
import { matchTask } from "@/engine/despacho";
import {
  FORMAS,
  ETAPA_1,
  chequeos1,
  formaDe,
  opcionesDeTexto,
} from "@/engine/protocolo/etapa1";
import type { DatosEtapa, Valor } from "@/engine/protocolo/etapas";
import type { SupervisedTask } from "@/engine/tarea";
import { useI18n } from "@/i18n/provider";
import { proporcion } from "@/lib/protocolo/formato";
import { lista, mapa, numero, texto } from "@/engine/protocolo/valores";
import {
  CampoArea,
  CampoOpciones,
  CampoTexto,
  leerNumero,
  numeroATexto,
} from "./campos";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";

export function Etapa1Form({ anterior, onRegistrar }: PropsFormulario) {
  const { t } = useI18n();
  const previa = anterior?.respuestas;
  const [decision, setDecision] = useState(
    texto(previa ?? {}, "decision") ?? "",
  );
  const [decisor, setDecisor] = useState(texto(previa ?? {}, "decisor") ?? "");
  const [cuando, setCuando] = useState(texto(previa ?? {}, "cuando") ?? "");
  const [hoy, setHoy] = useState(texto(previa ?? {}, "hoy") ?? "");
  const [unidad, setUnidad] = useState(texto(previa ?? {}, "unidad") ?? "");
  const [forma, setForma] = useState<SupervisedTask | null>(
    previa ? formaDe(previa) : null,
  );
  const [cFp, setCFp] = useState(numeroATexto(previa?.c_fp));
  const [cFn, setCFn] = useState(numeroATexto(previa?.c_fn));
  const [cSub, setCSub] = useState(numeroATexto(previa?.c_sub));
  const [cSobre, setCSobre] = useState(numeroATexto(previa?.c_sobre));
  const [opcionesTexto, setOpcionesTexto] = useState(
    (previa ? (lista(previa, "opciones") ?? []) : []).join("\n"),
  );
  const [costos, setCostos] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(previa ? (mapa(previa, "costos") ?? {}) : {}).map(
        ([clave, valor]) => [clave, numeroATexto(valor)],
      ),
    ),
  );
  const opciones = useMemo(
    () => opcionesDeTexto(opcionesTexto),
    [opcionesTexto],
  );

  const respuestas = useMemo((): Record<string, Valor> | null => {
    if (!forma) return null;
    const comunes = { decision, decisor, cuando, hoy, forma, unidad };
    const propias = matchTask(forma, {
      binaria: () => ({
        c_fp: leerNumero(cFp) ?? 0,
        c_fn: leerNumero(cFn) ?? 0,
      }),
      multiclase: () => ({
        opciones,
        costos: Object.fromEntries(
          opciones.map((o) => [o, leerNumero(costos[o] ?? "") ?? 0]),
        ),
      }),
      numerica: () => ({
        c_sub: leerNumero(cSub) ?? 0,
        c_sobre: leerNumero(cSobre) ?? 0,
      }),
    });
    return { ...comunes, ...propias };
  }, [
    forma,
    decision,
    decisor,
    cuando,
    hoy,
    unidad,
    cFp,
    cFn,
    cSub,
    cSobre,
    opciones,
    costos,
  ]);

  const calculo = respuestas ? chequeos1(respuestas) : null;
  const vista: DatosEtapa | null =
    respuestas && calculo ? { respuestas, chequeos: calculo } : null;
  const trampas = vista ? ETAPA_1.trampas(vista, {}) : [];

  return (
    <div className="flex flex-col gap-4">
      <CampoArea
        etiqueta={t("protocol.stage.1.field.decision")}
        ayuda={t("protocol.stage.1.help.decision")}
        valor={decision}
        onCambio={setDecision}
      />
      <CampoTexto
        etiqueta={t("protocol.stage.1.field.decisor")}
        valor={decisor}
        onCambio={setDecisor}
      />
      <CampoTexto
        etiqueta={t("protocol.stage.1.field.cuando")}
        ayuda={t("protocol.stage.1.help.cuando")}
        valor={cuando}
        onCambio={setCuando}
      />
      <CampoArea
        etiqueta={t("protocol.stage.1.field.hoy")}
        ayuda={t("protocol.stage.1.help.hoy")}
        valor={hoy}
        onCambio={setHoy}
        filas={2}
      />
      <CampoOpciones
        leyenda={t("protocol.stage.1.field.forma")}
        ayuda={t("protocol.stage.1.help.forma")}
        valor={forma}
        opciones={FORMAS.map((f) => ({
          valor: f,
          texto: t(`protocol.stage.1.forma.${f}`),
        }))}
        onCambio={setForma}
      />
      <CampoTexto
        etiqueta={t("protocol.stage.1.field.unidad")}
        ayuda={t("protocol.stage.1.help.unidad")}
        valor={unidad}
        onCambio={setUnidad}
      />

      {forma &&
        matchTask(forma, {
          binaria: () => (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                numerico
                etiqueta={t("protocol.stage.1.field.c_fp")}
                ayuda={t("protocol.stage.1.help.c_fp")}
                valor={cFp}
                onCambio={setCFp}
              />
              <CampoTexto
                numerico
                etiqueta={t("protocol.stage.1.field.c_fn")}
                ayuda={t("protocol.stage.1.help.c_fn")}
                valor={cFn}
                onCambio={setCFn}
              />
            </div>
          ),
          multiclase: () => (
            <div className="flex flex-col gap-4">
              <CampoArea
                etiqueta={t("protocol.stage.1.field.opciones")}
                ayuda={t("protocol.stage.1.help.opciones")}
                valor={opcionesTexto}
                onCambio={setOpcionesTexto}
                filas={4}
              />
              {opciones.map((opcion) => (
                <CampoTexto
                  key={opcion}
                  numerico
                  etiqueta={t("protocol.stage.1.field.costo_de", {
                    clase: opcion,
                  })}
                  valor={costos[opcion] ?? ""}
                  onCambio={(valor) =>
                    setCostos((previo) => ({ ...previo, [opcion]: valor }))
                  }
                />
              ))}
            </div>
          ),
          numerica: () => (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                numerico
                etiqueta={t("protocol.stage.1.field.c_sub")}
                ayuda={t("protocol.stage.1.help.c_sub")}
                valor={cSub}
                onCambio={setCSub}
              />
              <CampoTexto
                numerico
                etiqueta={t("protocol.stage.1.field.c_sobre")}
                ayuda={t("protocol.stage.1.help.c_sobre")}
                valor={cSobre}
                onCambio={setCSobre}
              />
            </div>
          ),
        })}

      {vista && numero(vista.chequeos, "umbral") !== null && (
        <p className="font-mono text-sm" data-testid="protocolo-umbral">
          {t("protocol.stage.1.check.umbral")}:{" "}
          {proporcion(numero(vista.chequeos, "umbral")!)}
        </p>
      )}
      {vista && numero(vista.chequeos, "cuantil") !== null && (
        <p className="font-mono text-sm" data-testid="protocolo-cuantil">
          {t("protocol.stage.1.check.cuantil")}:{" "}
          {proporcion(numero(vista.chequeos, "cuantil")!)}
        </p>
      )}
      <Trampas etapa={1} trampas={trampas} />

      <Registrar
        etapa={1}
        deshabilitado={respuestas === null}
        onClick={() =>
          respuestas
            ? onRegistrar({ respuestas, chequeos: calculo ?? {} })
            : null
        }
      />
    </div>
  );
}

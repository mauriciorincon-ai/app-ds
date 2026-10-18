"use client";

// Protocolo DS (S8, ADR 020): las diez etapas en orden, cada una con su estado (símbolo +
// texto + color: nada comunica solo con color) y su criterio. Solo la etapa abierta (o por
// verificar, o detenida) muestra su formulario; una cumplida se puede corregir. No hay control
// para saltar: la única forma de avanzar es que la compuerta acepte lo registrado.
import { useEffect, useRef, useState } from "react";
import { CONTENIDO_ETAPAS } from "@/content/protocolo";
import type { EstadoEtapa, EtapaEvaluada } from "@/engine/protocolo/compuerta";
import type { DatosEtapa, EtapaId, Previas } from "@/engine/protocolo/etapas";
import { useI18n } from "@/i18n/provider";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import type { RechazoRegistro } from "@/engine/protocolo/compuerta";
import { Badge, Button, Icon, type IconName } from "@/components/ui";
import Link from "next/link";
import { FORMULARIOS } from "./formularios";
import { Trampas } from "./formulario-base";
import { TerminoLink } from "./Glosario";

const MARCA: Record<
  EstadoEtapa["tipo"],
  { icon: IconName; tone: "neutral" | "caution" | "positive" }
> = {
  cumplida: { icon: "check", tone: "positive" },
  abierta: { icon: "route", tone: "neutral" },
  "por-verificar": { icon: "retry", tone: "caution" },
  detenida: { icon: "stop", tone: "caution" },
  cerrada: { icon: "lock", tone: "neutral" },
  "no-construida": { icon: "lock", tone: "neutral" },
};

export function EstadoBadge({ estado }: { estado: EstadoEtapa["tipo"] }) {
  const { t } = useI18n();
  const marca = MARCA[estado];
  return (
    <Badge tone={marca.tone}>
      <Icon name={marca.icon} className="h-3.5 w-3.5" />
      {t(`protocol.status.${estado}`)}
    </Badge>
  );
}

function previasDe(
  evaluadas: readonly EtapaEvaluada[],
  hasta: EtapaId,
): Previas {
  const previas: Partial<Record<EtapaId, DatosEtapa>> = {};
  for (const { etapa, estado } of evaluadas) {
    if (etapa.id >= hasta) break;
    if (estado.tipo === "cumplida") previas[etapa.id] = estado.evidencia.datos;
  }
  return previas;
}

function evidenciaDe(estado: EstadoEtapa): DatosEtapa | null {
  return "evidencia" in estado && estado.evidencia
    ? estado.evidencia.datos
    : null;
}

function Tarjeta({
  evaluada,
  evaluadas,
  datos,
  listo,
  onRegistrar,
}: {
  evaluada: EtapaEvaluada;
  evaluadas: readonly EtapaEvaluada[];
  datos: DatosCargados | null;
  listo: boolean;
  onRegistrar: (etapa: EtapaId, datos: DatosEtapa) => RechazoRegistro | null;
}) {
  const { locale, t } = useI18n();
  const { etapa, estado } = evaluada;
  const contenido = CONTENIDO_ETAPAS[etapa.id];
  const [corrigiendo, setCorrigiendo] = useState(false);
  // Al registrar, el formulario desaparece: el foco no puede quedarse en el aire (lo oye quien
  // usa lector de pantalla) y pasa al título de la tarjeta, que ya dice «cumplida».
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const enfocarTitulo = useRef(false);
  useEffect(() => {
    if (enfocarTitulo.current) {
      enfocarTitulo.current = false;
      tituloRef.current?.focus();
    }
  });
  const Formulario = FORMULARIOS[etapa.id];
  const trabajable =
    estado.tipo === "abierta" ||
    estado.tipo === "por-verificar" ||
    estado.tipo === "detenida" ||
    (estado.tipo === "cumplida" && corrigiendo);
  const tituloId = `etapa-${etapa.id}-titulo`;

  return (
    <li
      id={`etapa-${etapa.id}`}
      aria-labelledby={tituloId}
      className={`rounded-lg border p-4 ${
        estado.tipo === "cerrada" || estado.tipo === "no-construida"
          ? "border-hairline bg-sunken"
          : "border-hairline bg-surface shadow-sm"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          id={tituloId}
          ref={tituloRef}
          tabIndex={-1}
          className="font-semibold"
        >
          <span className="font-mono text-ink-muted">
            {t("protocol.stage.label", { n: etapa.id })}
          </span>{" "}
          · {contenido.titulo[locale]}
        </h3>
        <EstadoBadge estado={estado.tipo} />
      </div>

      <p className="mt-2 text-sm">
        <span className="font-medium">{t("protocol.stage.criterion")}:</span>{" "}
        <span className="text-ink-muted">{contenido.criterio[locale]}</span>
      </p>

      {estado.tipo === "cerrada" && (
        <p className="mt-2 text-sm text-ink-muted">
          {t("protocol.stage.closed-by", { n: estado.bloquea })}
        </p>
      )}
      {estado.tipo === "no-construida" && (
        <p className="mt-2 text-sm text-ink-muted">
          {t("protocol.stage.not-built")}
        </p>
      )}
      {estado.tipo === "por-verificar" && (
        <p role="status" className="mt-2 text-sm text-caution">
          {t(`protocol.stage.reverify.${estado.motivo}`)}
        </p>
      )}
      {estado.tipo === "detenida" && (
        <div
          role="status"
          className="mt-2 flex flex-col gap-2 text-sm text-caution"
        >
          <p>{t(`protocol.stage.${etapa.id}.stop.${estado.razon}`)}</p>
          {estado.razon === "sin-objetivo" && (
            <Link
              href="/"
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-2 self-start text-ink underline underline-offset-2"
            >
              {t("protocol.stage.2.stop-link")}
            </Link>
          )}
        </div>
      )}

      {etapa.construida && estado.tipo !== "cerrada" && (
        <div className="mt-3 flex flex-col gap-3">
          {contenido.tarea && (
            <p className="text-sm">
              <span className="font-medium">{t("protocol.stage.task")}:</span>{" "}
              {contenido.tarea[locale]}
            </p>
          )}
          {contenido.porque && trabajable && (
            <div className="rounded-md bg-sunken p-3 text-sm">
              <p className="font-medium">{t("protocol.stage.why")}</p>
              <p className="mt-1 whitespace-pre-line text-ink-muted">
                {contenido.porque[locale]}
              </p>
            </div>
          )}
          {etapa.terminos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{t("protocol.stage.terms")}:</span>
              {etapa.terminos.map((id) => (
                <TerminoLink key={id} id={id} />
              ))}
            </div>
          )}

          {"evidencia" in estado &&
            estado.evidencia &&
            !(trabajable && listo && Formulario) && (
              <Trampas
                etapa={etapa.id}
                trampas={etapa.trampas(
                  estado.evidencia.datos,
                  previasDe(evaluadas, etapa.id),
                )}
              />
            )}

          {estado.tipo === "cumplida" && !corrigiendo && (
            <div>
              <Button
                variant="secondary"
                icon="retry"
                onClick={() => setCorrigiendo(true)}
              >
                {t("protocol.stage.edit")}
              </Button>
            </div>
          )}
          {estado.tipo === "cumplida" && corrigiendo && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-caution">
                {t("protocol.stage.edit-warning")}
              </p>
              <div>
                <Button
                  variant="ghost"
                  icon="x"
                  onClick={() => setCorrigiendo(false)}
                >
                  {t("protocol.stage.cancel-edit")}
                </Button>
              </div>
            </div>
          )}

          {trabajable &&
            listo &&
            (Formulario ? (
              <Formulario
                datos={datos}
                anterior={evidenciaDe(estado)}
                previas={previasDe(evaluadas, etapa.id)}
                onRegistrar={(d) => {
                  const rechazo = onRegistrar(etapa.id, d);
                  if (!rechazo) {
                    enfocarTitulo.current = true;
                    setCorrigiendo(false);
                  }
                  return rechazo;
                }}
              />
            ) : (
              <p className="text-sm text-ink-muted">
                {t("protocol.stage.no-form")}
              </p>
            ))}
        </div>
      )}
    </li>
  );
}

export function Etapas({
  evaluadas,
  datos,
  listo,
  onRegistrar,
}: {
  evaluadas: readonly EtapaEvaluada[];
  datos: DatosCargados | null;
  listo: boolean;
  onRegistrar: (etapa: EtapaId, datos: DatosEtapa) => RechazoRegistro | null;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="etapas-titulo" className="flex flex-col gap-3">
      <h2 id="etapas-titulo" className="text-xl font-semibold tracking-tight">
        {t("protocol.stages.title")}
      </h2>
      <ol className="flex flex-col gap-3">
        {evaluadas.map((evaluada) => (
          <Tarjeta
            key={evaluada.etapa.id}
            evaluada={evaluada}
            evaluadas={evaluadas}
            datos={datos}
            listo={listo}
            onRegistrar={onRegistrar}
          />
        ))}
      </ol>
    </section>
  );
}

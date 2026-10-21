"use client";

// Protocolo DS (S8, ADR 020): las diez etapas en orden, cada una con su estado (símbolo +
// texto + color: nada comunica solo con color) y su criterio. Solo la etapa abierta (o por
// verificar, o detenida) muestra su formulario; una cumplida se puede corregir. No hay control
// para saltar: la única forma de avanzar es que la compuerta acepte lo registrado.
import { useEffect, useRef, useState } from "react";
import { CONTENIDO_ETAPAS } from "@/content/protocolo";
import type { EstadoEtapa, EtapaEvaluada } from "@/engine/protocolo/compuerta";
import { aperturasDistintas, type Cuaderno } from "@/engine/protocolo/cuaderno";
import type { DatosEtapa, EtapaId, Previas } from "@/engine/protocolo/etapas";
import { useI18n } from "@/i18n/provider";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import type { RechazoRegistro } from "@/engine/protocolo/compuerta";
import { Badge, Button, Icon, type IconName } from "@/components/ui";
import Link from "next/link";
import { CONSTANCIAS, FORMULARIOS } from "./formularios";
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

/** Lo que una etapa registró antes en el cuaderno: todo, o lo anterior a la evidencia `hasta`. */
function historiaDe(
  cuaderno: Cuaderno | undefined,
  etapa: EtapaId,
  hasta?: number,
): DatosEtapa[] {
  return (cuaderno?.evidencias ?? [])
    .filter((e) => e.etapa === etapa && (hasta === undefined || e.seq < hasta))
    .map((e) => e.datos);
}

function Tarjeta({
  evaluada,
  evaluadas,
  cuaderno,
  datos,
  listo,
  onRegistrar,
  onApertura,
}: {
  evaluada: EtapaEvaluada;
  evaluadas: readonly EtapaEvaluada[];
  cuaderno?: Cuaderno;
  datos: DatosCargados | null;
  listo: boolean;
  onRegistrar: (etapa: EtapaId, datos: DatosEtapa) => RechazoRegistro | null;
  onApertura?: (clave: string) => void;
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
  const Constancia = CONSTANCIAS[etapa.id];
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
                  historiaDe(cuaderno, etapa.id, estado.evidencia.seq),
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

          {estado.tipo === "cumplida" &&
            !corrigiendo &&
            listo &&
            Constancia && (
              <Constancia evaluadas={evaluadas} cuaderno={cuaderno} />
            )}

          {trabajable &&
            listo &&
            (Formulario ? (
              <Formulario
                datos={datos}
                anterior={evidenciaDe(estado)}
                previas={previasDe(evaluadas, etapa.id)}
                historia={historiaDe(cuaderno, etapa.id)}
                aperturas={cuaderno ? aperturasDistintas(cuaderno) : 0}
                onApertura={onApertura}
                evaluadas={evaluadas}
                cuaderno={cuaderno}
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
  cuaderno,
  datos,
  listo,
  onRegistrar,
  onApertura,
}: {
  evaluadas: readonly EtapaEvaluada[];
  /** Para la historia de cada etapa (la 6 cuenta sus sellos) y las aperturas de la prueba (la 8). */
  cuaderno?: Cuaderno;
  datos: DatosCargados | null;
  listo: boolean;
  onRegistrar: (etapa: EtapaId, datos: DatosEtapa) => RechazoRegistro | null;
  onApertura?: (clave: string) => void;
}) {
  const { t } = useI18n();
  // S15: las diez etapas cumplidas, con la compuerta de cada una vigente (si algo se vuelve a verificar, deja de estarlo)
  const completo = evaluadas.every(({ estado }) => estado.tipo === "cumplida");
  return (
    <section aria-labelledby="etapas-titulo" className="flex flex-col gap-3">
      <h2 id="etapas-titulo" className="text-xl font-semibold tracking-tight">
        {t("protocol.stages.title")}
      </h2>
      {completo && (
        <div
          role="status"
          data-testid="protocolo-completo"
          className="rounded-md border border-hairline bg-sunken p-3 text-sm"
        >
          <p className="font-medium">
            <span aria-hidden="true">✓ </span>
            {t("protocol.stages.complete.title")}
          </p>
          <p className="mt-1 text-ink-muted">
            {t("protocol.stages.complete.body", { count: evaluadas.length })}
          </p>
        </div>
      )}
      <ol className="flex flex-col gap-3">
        {evaluadas.map((evaluada) => (
          <Tarjeta
            key={evaluada.etapa.id}
            evaluada={evaluada}
            evaluadas={evaluadas}
            cuaderno={cuaderno}
            datos={datos}
            listo={listo}
            onRegistrar={onRegistrar}
            onApertura={onApertura}
          />
        ))}
      </ol>
    </section>
  );
}

"use client";

// Lo que se mira de un archivo recién cargado (S18): de qué hoja del Excel salió la tabla, los posibles datos personales y el
// plan de limpieza que el código propone y que el usuario aprueba o rechaza paso a paso. Nada de esto bloquea: lo que no se
// decide no se aplica. El aviso de datos personales nombra la columna y el tipo, jamás un valor.
import type { Ingesta } from "@/engine/ingesta";
import type { Decision, PasoLimpieza } from "@/engine/limpieza-plan";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import type { OrigenArchivo } from "@/lib/ds/archivo";
import { formatQuantity } from "@/lib/quantity";
import { Button, Card, Icon } from "@/components/ui";
import { TEXTOS_LIMPIEZA } from "./textos";

const ESTADOS = {
  "sin-decidir": { simbolo: "○", clase: "border-caution/50 bg-caution/10" },
  aprobado: { simbolo: "✓", clase: "border-positive/60 bg-positive/15" },
  rechazado: { simbolo: "✕", clase: "border-hairline bg-sunken" },
} as const;

export function LimpiezaPanel({
  ingesta,
  origen,
  onDecidir,
}: {
  ingesta: Ingesta | null;
  origen: OrigenArchivo | null;
  onDecidir: (id: string, decision: Decision | null) => void;
}) {
  const t = useTextosEtapa(TEXTOS_LIMPIEZA);
  // R9 del design system: punto decimal y miles con coma en los dos idiomas (no los de `Intl` del idioma)
  const porcentaje = (paso: PasoLimpieza) => {
    const pct = Math.round((1000 * paso.celdas) / Math.max(paso.de, 1)) / 10;
    return formatQuantity(pct, Number.isInteger(pct) ? 0 : 1);
  };

  const personales = ingesta?.personales ?? [];
  const plan = ingesta?.plan ?? [];
  if (!origen && personales.length === 0 && plan.length === 0) return null;
  const decisiones = ingesta?.decisiones ?? {};
  const cuenta = (d: Decision) =>
    plan.filter((p) => decisiones[p.id] === d).length;

  return (
    <div className="flex flex-col gap-4" data-testid="limpieza-panel">
      {origen && (
        <p
          className="flex items-center gap-2 rounded-md border border-hairline bg-surface p-3 text-sm"
          role="status"
        >
          <Icon name="table" />
          {origen.hojasIgnoradas > 0
            ? t("limpieza.origen_otras", {
                hoja: origen.hoja,
                count: origen.hojasIgnoradas,
              })
            : t("limpieza.origen", { hoja: origen.hoja })}
        </p>
      )}

      {personales.length > 0 && (
        <Card className="p-4" role="status">
          <p className="mb-2 text-sm font-semibold">
            <span aria-hidden className="mr-1 text-caution">
              ⚠
            </span>
            {t("limpieza.personales.titulo")}
          </p>
          <ul className="ml-5 list-disc text-sm text-ink-muted">
            {personales.map((aviso) => (
              <li key={aviso.column}>
                {t("limpieza.personales.item", {
                  column: aviso.column,
                  tipo: t(`limpieza.personales.tipo.${aviso.tipo}`),
                  via: t(`limpieza.personales.via.${aviso.via}`),
                })}
                {aviso.fuera ? ` ${t("limpieza.personales.fuera")}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-ink-muted">
            {t("limpieza.personales.nota")}
          </p>
        </Card>
      )}

      {plan.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">
            <span aria-hidden className="mr-1 text-accent">
              ⚙
            </span>
            {t("limpieza.plan.titulo")}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t("limpieza.plan.intro")}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {plan.map((paso) => {
              const decision = decisiones[paso.id];
              const estado = decision ?? "sin-decidir";
              const frase = t(`limpieza.plan.paso.${paso.tipo}`, {
                column: paso.columna,
                count: paso.celdas,
                cuenta: formatQuantity(paso.celdas, 0),
                pct: porcentaje(paso),
                tipo: paso.personal
                  ? t(`limpieza.personales.tipo.${paso.personal}`)
                  : "",
              });
              return (
                <li
                  key={paso.id}
                  className="flex flex-col gap-2 rounded-md border border-hairline p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-sm">{frase}</p>
                    <span
                      className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ESTADOS[estado].clase}`}
                    >
                      <span aria-hidden>{ESTADOS[estado].simbolo}</span>
                      {t(`limpieza.plan.estado.${estado}`)}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant={decision === "aprobado" ? "primary" : "secondary"}
                      icon="check"
                      aria-pressed={decision === "aprobado"}
                      aria-label={`${t("limpieza.plan.aprobar")} · ${paso.columna}`}
                      onClick={() =>
                        onDecidir(
                          paso.id,
                          decision === "aprobado" ? null : "aprobado",
                        )
                      }
                    >
                      {t("limpieza.plan.aprobar")}
                    </Button>
                    <Button
                      type="button"
                      variant={decision === "rechazado" ? "primary" : "secondary"}
                      icon="x"
                      aria-pressed={decision === "rechazado"}
                      aria-label={`${t("limpieza.plan.rechazar")} · ${paso.columna}`}
                      onClick={() =>
                        onDecidir(
                          paso.id,
                          decision === "rechazado" ? null : "rechazado",
                        )
                      }
                    >
                      {t("limpieza.plan.rechazar")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-ink-muted" role="status">
            {t("limpieza.plan.resumen", {
              aprobados: cuenta("aprobado"),
              rechazados: cuenta("rechazado"),
              pendientes: plan.length - cuenta("aprobado") - cuenta("rechazado"),
            })}
          </p>
          <p className="text-xs text-ink-muted">{t("limpieza.plan.volver")}</p>
        </Card>
      )}
    </div>
  );
}

"use client";

// S20 (ADR 029): el gemelo sintético, junto a la exploración. Se pide, no se calcula solo: una tabla nueva con la forma de la del
// usuario (cópula gaussiana con semilla fija, en el worker) y su informe. Lo marcado como dato personal (S18), el texto libre, los
// identificadores y las fechas NO viajan, y la pantalla los nombra con su motivo. El veredicto —«se puede compartir · revisar · no
// compartir»— sale de `engine/gemelo.ts` contra lo que se parecen dos mitades reales entre sí. Símbolo + palabra (el color nunca solo);
// los textos viajan con este chunk. Los datos no salen del navegador: el CSV se arma y se descarga aquí.
import { useMemo, useRef, useState, type RefObject } from "react";
import { Button, Card } from "@/components/ui";
import {
  GEMELO_FILAS_MAX,
  GEMELO_FILAS_MIN,
  GEMELO_SALIDA_MIN,
  CERCANIA_RAZON_BIEN,
  csvDelGemelo,
  envioGemelo,
  leerRelaciones,
  planGemelo,
  veredictoGemelo,
  type InformeGemelo,
  type Nivel,
  type PlanGemelo,
} from "@/engine/gemelo";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import type { CsvTable } from "@/lib/ds/csv";
import { datasetSlug, downloadTextFile } from "@/lib/files";
import { TEXTOS_GEMELO } from "@/lib/narration/textos-gemelo";
import { formatQuantity } from "@/lib/quantity";
import { pedirGemelo } from "@/lib/simulador/pedir";
import type { SynthesizeResult } from "@/workers/protocol";

type Listo = {
  readonly plan: PlanGemelo;
  readonly r: SynthesizeResult;
  readonly informe: InformeGemelo;
};

type Estado =
  | { readonly tipo: "inactivo" }
  | { readonly tipo: "calculando"; readonly fase: "gemelo" | "relaciones" }
  | { readonly tipo: "lista"; readonly listo: Listo }
  | { readonly tipo: "error"; readonly motivo: string };

export type GemeloPanelProps = {
  /** La tabla saneada del archivo (se lee al generar). */
  readonly getTable: () => CsvTable | null;
  /** Los nombres de las columnas que el aviso de datos personales marcó; `null` mientras el aviso todavía se está armando. */
  readonly personales: readonly string[] | null;
  readonly worker?: RefObject<Worker | null>;
  readonly datasetName: string | null;
};

const SIMBOLO: Record<Nivel, string> = { bien: "✓", revisar: "⚠", mal: "✕" };
const SIMBOLO_VEREDICTO = { compartir: "✓", revisar: "⚠", no_compartir: "✕" } as const;

export function GemeloPanel({ getTable, personales, worker, datasetName }: GemeloPanelProps) {
  const t = useTextosEtapa(TEXTOS_GEMELO);
  const tabla = getTable();
  const plan = useMemo(() => (tabla && personales ? planGemelo(tabla, personales) : null), [tabla, personales]);
  /** Lo que el usuario lleva escrito en el campo de filas, tal cual: se ajusta al rango al salir del campo o al pedir, no mientras teclea. */
  const [texto, setTexto] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const pedido = useRef(false);

  const reales = tabla?.rows.length ?? 0;
  const porDefecto = Math.min(reales, GEMELO_FILAS_MAX);
  const escritas = texto === null || texto.trim() === "" ? porDefecto : Math.trunc(Number(texto));
  const filasEf = Math.min(GEMELO_FILAS_MAX, Math.max(GEMELO_SALIDA_MIN, Number.isFinite(escritas) ? escritas : porDefecto));
  const pocas = reales > 0 && reales < GEMELO_FILAS_MIN;
  const sinColumnas = plan !== null && plan.incluidas.length === 0;
  const listoParaPedir = plan !== null && !sinColumnas && !pocas && !!worker && estado.tipo !== "calculando";

  const generar = async () => {
    const w = worker?.current;
    if (!w || !tabla || !plan || pedido.current) return;
    pedido.current = true;
    setEstado({ tipo: "calculando", fase: "gemelo" });
    try {
      const payload = envioGemelo(tabla, plan, filasEf);
      const r = await pedirGemelo(w, payload);
      setEstado({ tipo: "calculando", fase: "relaciones" });
      // la comparación de relaciones corre en el hilo principal: se cede el turno para que la pantalla diga qué está haciendo
      await new Promise((ok) => setTimeout(ok, 0));
      const real: CsvTable = { headers: payload.headers, rows: payload.rows };
      const sintetico: CsvTable = { headers: r.headers, rows: r.rows };
      const informe = veredictoGemelo(r, leerRelaciones(real, sintetico));
      setEstado({ tipo: "lista", listo: { plan, r, informe } });
    } catch (e) {
      setEstado({ tipo: "error", motivo: e instanceof Error ? e.message : "worker" });
    } finally {
      pedido.current = false;
    }
  };

  return (
    <section aria-labelledby="gemelo-title" data-testid="gemelo-panel">
      <Card className="p-5">
        <h2 id="gemelo-title" className="text-sm font-semibold">
          {t("gemelo.titulo")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("gemelo.ayuda")}</p>

        {personales === null && (
          <p role="status" className="mt-3 text-sm text-ink-muted" data-testid="gemelo-revisando">
            {t("gemelo.revisando")}
          </p>
        )}
        {pocas && (
          <p role="status" className="mt-3 text-sm text-caution">
            <span aria-hidden="true" className="mr-1">
              ⚠
            </span>
            {t("gemelo.pocas", { min: GEMELO_FILAS_MIN })}
          </p>
        )}
        {plan && (
          <div className="mt-3 flex flex-col gap-2 text-sm" data-testid="gemelo-plan">
            {sinColumnas ? (
              <p role="status" className="text-caution">
                <span aria-hidden="true" className="mr-1">
                  ⚠
                </span>
                {t("gemelo.sin_columnas")}
              </p>
            ) : (
              <p>
                {t("gemelo.viajan", {
                  count: plan.incluidas.length,
                  lista: plan.incluidas.map((c) => c.name).join(", "),
                })}
              </p>
            )}
            {plan.fuera.length > 0 && (
              <div data-testid="gemelo-fuera">
                <p className="font-medium">{t("gemelo.fuera.titulo")}</p>
                <ul className="mt-1 flex flex-col gap-0.5 text-ink-muted">
                  {plan.fuera.map((f) => (
                    <li key={f.name}>
                      <span aria-hidden="true" className="mr-1">
                        ✕
                      </span>
                      «{f.name}»: {t(`gemelo.fuera.${f.motivo}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="gemelo-filas" className="text-sm font-medium">
              {t("gemelo.filas")}
            </label>
            <input
              id="gemelo-filas"
              type="number"
              inputMode="numeric"
              min={GEMELO_SALIDA_MIN}
              max={GEMELO_FILAS_MAX}
              className="min-h-11 w-40 rounded-md border border-hairline bg-surface px-3 text-sm"
              value={texto ?? String(filasEf)}
              onChange={(e) => {
                setTexto(e.target.value);
                setEstado({ tipo: "inactivo" });
              }}
              onBlur={() => setTexto(String(filasEf))}
            />
            <span className="text-xs text-ink-muted">
              {t("gemelo.filas_ayuda", { max: formatQuantity(GEMELO_FILAS_MAX, 0) })}
            </span>
          </div>
          <Button icon="sparkle" type="button" onClick={generar} disabled={!listoParaPedir}>
            {t("gemelo.boton")}
          </Button>
          {estado.tipo === "calculando" && (
            <span role="status" className="text-sm text-ink-muted">
              {t(estado.fase === "gemelo" ? "gemelo.calculando" : "gemelo.relaciones_calculando")}
            </span>
          )}
        </div>
        {estado.tipo === "error" && (
          <p role="alert" className="mt-3 text-sm text-negative">
            <span aria-hidden="true" className="mr-1">
              ✕
            </span>
            {t("gemelo.error", { motivo: estado.motivo })}
          </p>
        )}
        <div aria-live="polite" data-testid="gemelo-vivo">
          {estado.tipo === "lista" && (
            <Informe listo={estado.listo} t={t} nombre={`gemelo-${datasetSlug(datasetName ?? "") || "datos"}.csv`} />
          )}
        </div>
      </Card>
    </section>
  );
}

type T = (key: string, params?: Record<string, string | number>) => string;

const NIVEL_TEXTO = (t: T, n: Nivel) => `${SIMBOLO[n]} ${t(`gemelo.nivel.${n}`)}`;

function Informe({ listo, t, nombre }: { listo: Listo; t: T; nombre: string }) {
  const { r, informe } = listo;
  const dec = (v: number) => formatQuantity(v, 3);
  const razones = informe.razones.map((x) => t(`gemelo.razon.${x}`)).join("; ");
  const raras = r.rare_merged;
  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="gemelo-lectura">
      <div className="flex flex-col gap-1" data-testid="gemelo-veredicto">
        <p className={`text-sm font-semibold ${informe.veredicto === "compartir" ? "text-ink" : "text-caution"}`}>
          <span aria-hidden="true" className="mr-1">
            {SIMBOLO_VEREDICTO[informe.veredicto]}
          </span>
          {t(`gemelo.veredicto.${informe.veredicto}`)}
        </p>
        <p className="text-sm">{t(`gemelo.explica.${informe.veredicto}`, { razones })}</p>
        <p className="text-xs text-ink-muted">
          {t("gemelo.semilla", {
            semilla: r.seed,
            n: formatQuantity(r.n_rows, 0),
            real: formatQuantity(r.n_real, 0),
          })}
        </p>
      </div>

      <div className="flex flex-col gap-3" data-testid="gemelo-informe">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("gemelo.informe.titulo")}</h3>

        <div data-testid="gemelo-columnas">
          <p className="text-sm font-medium">
            {t("gemelo.informe.columnas")} · {NIVEL_TEXTO(t, informe.columnas.nivel)}
          </p>
          <p className="text-sm text-ink-muted">
            {t("gemelo.informe.columnas_detalle", {
              valor: dec(informe.columnas.media),
              piso: dec(informe.columnas.piso),
              columna: informe.columnas.peorColumna,
              maxima: dec(informe.columnas.maxima),
            })}
          </p>
        </div>

        <div data-testid="gemelo-relaciones">
          <p className="text-sm font-medium">
            {t("gemelo.informe.relaciones")} · {NIVEL_TEXTO(t, informe.relaciones.nivel)}
          </p>
          {informe.relaciones.pearson && (
            <p className="text-sm text-ink-muted">
              {t("gemelo.informe.relaciones_pearson", {
                pares: informe.relaciones.pares.pearson,
                count: informe.relaciones.pares.pearson,
                valor: dec(informe.relaciones.pearson.delta),
                piso: dec(informe.relaciones.pearson.piso),
              })}
            </p>
          )}
          {informe.relaciones.cramer && (
            <p className="text-sm text-ink-muted">
              {t("gemelo.informe.relaciones_cramer", {
                pares: informe.relaciones.pares.cramer,
                count: informe.relaciones.pares.cramer,
                valor: dec(informe.relaciones.cramer.delta),
                piso: dec(informe.relaciones.cramer.piso),
              })}
            </p>
          )}
          {!informe.relaciones.pearson && !informe.relaciones.cramer && (
            <p className="text-sm text-ink-muted">{t("gemelo.informe.relaciones_ninguna")}</p>
          )}
        </div>

        <div data-testid="gemelo-cercania">
          <p className="text-sm font-medium">
            {t("gemelo.informe.cercania")} · {NIVEL_TEXTO(t, informe.cercania.nivel)}
          </p>
          <p className="text-sm text-ink-muted">
            {t("gemelo.informe.cercania_detalle", {
              razon: formatQuantity(informe.cercania.razon, 2),
              minimo: formatQuantity(CERCANIA_RAZON_BIEN, 1),
              bajo: formatQuantity(informe.cercania.bajoP5 * 100, 0),
            })}
          </p>
        </div>

        <div data-testid="gemelo-copias">
          <p className="text-sm font-medium">
            {t("gemelo.informe.copias")} · {informe.copias === 0 ? NIVEL_TEXTO(t, "bien") : NIVEL_TEXTO(t, "mal")}
          </p>
          <p className="text-sm text-ink-muted">
            {informe.copias === 0
              ? t("gemelo.informe.copias_cero", {
                  extra: r.resampled > 0 ? t("gemelo.informe.copias_cero_extra", { n: formatQuantity(r.resampled, 0) }) : "",
                })
              : t("gemelo.informe.copias_n", { n: formatQuantity(informe.copias, 0), count: informe.copias })}
          </p>
        </div>

        {raras.length > 0 && (
          <p className="text-sm text-ink-muted" data-testid="gemelo-raras">
            {t("gemelo.raras", { count: raras.length, lista: raras.map((x) => x.column).join(", ") })}
          </p>
        )}
      </div>

      <div>
        <Button
          icon="download"
          variant="secondary"
          type="button"
          onClick={() => downloadTextFile(nombre, csvDelGemelo(r), "text/csv;charset=utf-8")}
          data-testid="gemelo-descargar"
        >
          {t("gemelo.descargar")}
        </Button>
      </div>
    </div>
  );
}

"use client";

// La exploración de la tabla cargada (S18): cómo se reparte cada columna, qué columnas se mueven juntas y un resumen escrito
// que se comprueba contra los números. Bajo demanda y todo en el navegador; no cambia ni elige nada. Las barras llevan su
// cifra escrita y las celdas de la matriz su signo: el color nunca es lo único que dice algo.
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import {
  explorar,
  COLUMNAS_MATRIZ_MAX,
  type Distribucion,
  type Exploracion,
} from "@/engine/exploracion";
import { useI18n } from "@/i18n/provider";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import type { CsvTable } from "@/lib/ds/csv";
import { resumenVerificado } from "@/lib/narration/exploracion";
import { TEXTOS_EXPLORACION } from "@/lib/narration/textos-exploracion";
import { formatQuantity, quantityDecimals, thousands } from "@/lib/quantity";

type Estado =
  | { readonly tipo: "cerrada" }
  | { readonly tipo: "calculando" }
  | { readonly tipo: "lista"; readonly e: Exploracion; readonly tabla: CsvTable };

const firmado = (r: number) => `${r < 0 ? "−" : "+"}${Math.abs(r).toFixed(2)}`;

export function ExploracionPanel({
  getTable,
}: {
  /** La tabla saneada con que se entrena: se lee al pulsar, no antes. */
  getTable: () => CsvTable | null;
}) {
  const t = useTextosEtapa(TEXTOS_EXPLORACION);
  const { locale } = useI18n();
  const [estado, setEstado] = useState<Estado>({ tipo: "cerrada" });

  const abrir = () => {
    setEstado({ tipo: "calculando" });
    // fuera de este turno: que la pantalla pinte «explorando» antes de las cuentas
    setTimeout(() => {
      const tabla = getTable();
      setEstado(tabla ? { tipo: "lista", e: explorar(tabla), tabla } : { tipo: "cerrada" });
    }, 0);
  };

  const resumen = useMemo(
    () => (estado.tipo === "lista" ? resumenVerificado(estado.e, estado.tabla, locale) : null),
    [estado, locale],
  );

  return (
    <section aria-labelledby="exploracion-title" data-testid="exploracion-panel">
      <Card className="p-5">
        <h2 id="exploracion-title" className="text-sm font-semibold">
          {t("exploracion.titulo")}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{t("exploracion.desc")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {estado.tipo === "lista" ? (
            <Button
              variant="secondary"
              icon="x"
              aria-expanded
              onClick={() => setEstado({ tipo: "cerrada" })}
            >
              {t("exploracion.ocultar")}
            </Button>
          ) : (
            <Button
              icon="eye"
              aria-expanded={false}
              onClick={abrir}
              disabled={estado.tipo === "calculando"}
            >
              {t("exploracion.boton")}
            </Button>
          )}
          {estado.tipo === "calculando" && (
            <span role="status" className="text-sm text-ink-muted">
              {t("exploracion.calculando")}
            </span>
          )}
        </div>

        {estado.tipo === "lista" && resumen && (
          <div className="mt-4 flex flex-col gap-5">
            {resumen.verificado && resumen.texto ? (
              <div>
                <Badge tone="positive">
                  <span aria-hidden>✓</span> {t("exploracion.verificado")}
                </Badge>
                <p className="mt-2 text-sm leading-relaxed" data-testid="exploracion-resumen">
                  {resumen.texto}
                </p>
                <p className="mt-1 text-xs text-ink-muted">{t("exploracion.ayuda")}</p>
              </div>
            ) : (
              <p className="text-sm text-caution" role="status">
                <span aria-hidden className="mr-1">
                  ⚠
                </span>
                {t("exploracion.no_cuadro")}
              </p>
            )}
            <Distribuciones e={estado.e} />
            <Matriz e={estado.e} />
            <AsociacionesCategoricas e={estado.e} />
          </div>
        )}
      </Card>
    </section>
  );
}

function Distribuciones({ e }: { e: Exploracion }) {
  const t = useTextosEtapa(TEXTOS_EXPLORACION);
  return (
    <div>
      <h3 className="text-sm font-semibold">{t("exploracion.distribuciones.titulo")}</h3>
      <ul className="mt-2 flex flex-col gap-1">
        {e.distribuciones.map((d) => (
          <li key={d.column}>
            <details className="rounded-md border border-hairline px-3 py-2">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{d.column}</span>{" "}
                <span className="text-ink-muted">{resumenDe(d, t)}</span>
              </summary>
              <Barras d={d} />
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function resumenDe(
  d: Distribucion,
  t: (clave: string, params?: Record<string, string | number>) => string,
): string {
  const vacios = d.nulos > 0 ? ` · ${t("exploracion.distribuciones.vacios", { count: d.nulos })}` : "";
  if (d.kind === "categorical")
    return `${t("exploracion.distribuciones.categorica", { distintas: d.distintas })}${vacios}`;
  const decimales = quantityDecimals([d.mediana, d.media, d.max - d.min].filter((v) => v !== 0));
  const q = (v: number) => formatQuantity(v, decimales);
  return `${t("exploracion.distribuciones.numerica", {
    min: q(d.min),
    mediana: q(d.mediana),
    media: q(d.media),
    max: q(d.max),
  })}${vacios}`;
}

function Barras({ d }: { d: Distribucion }) {
  const t = useTextosEtapa(TEXTOS_EXPLORACION);
  const filas =
    d.kind === "numeric"
      ? (() => {
          const decimales = quantityDecimals([(d.max - d.min) / d.casillas.length].filter((v) => v !== 0));
          return d.casillas.map((c) => ({
            etiqueta:
              c.desde === c.hasta
                ? formatQuantity(c.desde, decimales)
                : t("exploracion.distribuciones.casilla", {
                    desde: formatQuantity(c.desde, decimales),
                    hasta: formatQuantity(c.hasta, decimales),
                  }),
            cuenta: c.cuenta,
          }));
        })()
      : [
          ...d.mas.map((m) => ({ etiqueta: m.valor, cuenta: m.cuenta })),
          ...(d.otras > 0 ? [{ etiqueta: t("exploracion.distribuciones.otras"), cuenta: d.otras }] : []),
        ];
  const mayor = Math.max(...filas.map((f) => f.cuenta), 1);
  return (
    <ul className="mt-2 flex flex-col gap-1" aria-label={d.column}>
      {filas.map((f, i) => (
        <li key={i} className="grid grid-cols-[minmax(6rem,1fr)_2fr_auto] items-center gap-2 text-xs">
          <span className="truncate" title={f.etiqueta}>
            {f.etiqueta}
          </span>
          <span className="h-3 rounded-sm bg-sunken" aria-hidden>
            <span
              className="block h-3 rounded-sm bg-accent"
              style={{ width: `${(100 * f.cuenta) / mayor}%` }}
            />
          </span>
          <span className="tabular-nums">{thousands(f.cuenta)}</span>
        </li>
      ))}
    </ul>
  );
}

function Matriz({ e }: { e: Exploracion }) {
  const t = useTextosEtapa(TEXTOS_EXPLORACION);
  return (
    <div>
      <h3 className="text-sm font-semibold">{t("exploracion.matriz.titulo")}</h3>
      {e.numericas.length < 2 ? (
        <p className="mt-1 text-sm text-ink-muted">{t("exploracion.matriz.sin")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-ink-muted">{t("exploracion.matriz.ayuda")}</p>
          {e.totalNumericas > COLUMNAS_MATRIZ_MAX && (
            <p className="mt-1 text-xs text-ink-muted">
              {t("exploracion.matriz.recortada", {
                max: COLUMNAS_MATRIZ_MAX,
                total: e.totalNumericas,
              })}
            </p>
          )}
          <div
            className="mt-2 overflow-auto"
            role="region"
            tabIndex={0}
            aria-label={t("exploracion.matriz.titulo")}
          >
            <table className="border-collapse text-xs tabular-nums">
              <thead>
                <tr>
                  <td />
                  {e.numericas.map((nombre) => (
                    <th key={nombre} scope="col" className="px-2 py-1 text-left font-medium">
                      {nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.matriz.map((fila, i) => (
                  <tr key={e.numericas[i]}>
                    <th scope="row" className="px-2 py-1 text-left font-medium">
                      {e.numericas[i]}
                    </th>
                    {fila.map((r, j) => (
                      <td
                        key={e.numericas[j]}
                        className="border border-hairline px-2 py-1 text-right"
                        style={
                          r === null || i === j
                            ? undefined
                            : {
                                backgroundColor: `color-mix(in srgb, var(${
                                  r < 0 ? "--caution" : "--accent"
                                }) ${Math.round(Math.abs(r) * 30)}%, transparent)`,
                              }
                        }
                      >
                        {r === null ? "–" : i === j ? "1.00" : firmado(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AsociacionesCategoricas({ e }: { e: Exploracion }) {
  const t = useTextosEtapa(TEXTOS_EXPLORACION);
  return (
    <div>
      <h3 className="text-sm font-semibold">{t("exploracion.cramer.titulo")}</h3>
      {e.cramer.length === 0 ? (
        <p className="mt-1 text-sm text-ink-muted">{t("exploracion.cramer.sin")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {e.cramer.map((p) => (
            <li key={`${p.a}|${p.b}`} className="flex justify-between gap-3">
              <span>
                {t("exploracion.resumen.par_cramer", { a: p.a, b: p.b })}
              </span>
              <span className="tabular-nums">{p.v.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

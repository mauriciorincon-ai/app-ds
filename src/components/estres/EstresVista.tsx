"use client";

// La prueba de estrés (S17, ADR 023), VISTA: lo que dicen las cifras que midió Python, en una frase y tres tablas.
// La usan el panel de Probeta y la lectura de la etapa 8. Pura de datos: recibe el resultado ya validado y el
// rival sin modelo; no pide nada al worker. El color nunca va solo: cada cambio lleva su símbolo y su palabra, y
// el ✓ / ⚠ del criterio, su frase.
import type { ReactNode } from "react";
import {
  SEAL_NOISE_LEVEL,
  noiseAt,
  robustness,
  trendOf,
} from "@/engine/estres";
import { thousands } from "@/lib/quantity";
import type { StressResult, TargetUnit } from "@/workers/protocol";
import { enFrase, formatoDe } from "./formato";

type Traduce = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/** Cuántas columnas del barajado se listan: las que más duelen; el resto se cuenta. */
export const COLUMNAS_VISIBLES = 5;

const pct = (level: number) => Math.round(level * 1000) / 10;

export function EstresVista({
  result,
  rival,
  unit,
  t,
  heading = "h3",
}: {
  result: StressResult;
  rival: number;
  unit: TargetUnit | null;
  t: Traduce;
  heading?: "h3" | "h4";
}) {
  const H = heading;
  const fmt = formatoDe(result, rival, unit);
  const label = t(`results.metrics.${result.metric.name}`);
  const noise10 = noiseAt(result, SEAL_NOISE_LEVEL);
  const seal = robustness(result, rival);
  const changeOf = (value: number) => {
    const trend = trendOf(result, value);
    return (
      <span className={trend === "worse" ? "text-caution" : undefined}>
        {t(`stress.change.${trend}`)}
      </span>
    );
  };
  const columns = result.shuffle.slice(0, COLUMNAS_VISIBLES);
  const hidden = result.shuffle.length - columns.length;
  const shiftColumns = result.shift[0]?.columns ?? [];

  const headline = noise10
    ? t(
        trendOf(result, noise10.value) === "worse"
          ? `stress.line.worse.${result.metric.direction}`
          : `stress.line.${trendOf(result, noise10.value)}`,
        {
          pct: pct(SEAL_NOISE_LEVEL),
          metric: enFrase(label),
          from: fmt(result.base),
          to: fmt(noise10.value),
        },
      )
    : t("stress.no-numeric");

  const sealText =
    seal.kind === "holds"
      ? t("stress.seal.holds", {
          pct: pct(seal.level),
          value: fmt(seal.value),
          rival: fmt(seal.rival),
        })
      : seal.kind === "drops" && seal.alreadyLost
        ? t("stress.seal.already-lost", {
            base: fmt(seal.base),
            rival: fmt(seal.rival),
          })
        : seal.kind === "drops"
          ? t("stress.seal.drops", {
              pct: pct(seal.level),
              value: fmt(seal.value),
              rival: fmt(seal.rival),
            })
          : t("stress.seal.no-noise");

  return (
    <div className="flex flex-col gap-4" data-testid="estres-lectura">
      <div className="flex flex-col gap-1">
        <p className="font-medium" data-testid="estres-frase">
          {headline}
        </p>
        <p
          className={seal.kind === "drops" ? "text-sm text-caution" : "text-sm"}
          data-testid="estres-sello"
        >
          {sealText}
        </p>
        <p className="text-xs text-ink-muted">
          {t("stress.base", {
            metric: label,
            value: fmt(result.base),
            n: thousands(result.n_test),
          })}
        </p>
      </div>

      {result.noise.length > 0 && (
        <Tabla
          t={t}
          heading={H}
          title={t("stress.noise.title")}
          desc={t("stress.noise.desc")}
          rows={result.noise.map((n) => ({
            key: `n${n.level}`,
            what: t("stress.noise.row", { pct: pct(n.level) }),
            value: fmt(n.value),
            change: changeOf(n.value),
          }))}
        />
      )}

      <Tabla
        t={t}
        heading={H}
        title={t("stress.shuffle.title")}
        desc={t("stress.shuffle.desc", { count: columns.length })}
        rows={columns.map((c) => ({
          key: `c${c.column}`,
          what: c.column,
          value: fmt(c.value),
          change: changeOf(c.value),
        }))}
        footnote={
          hidden > 0 ? t("stress.shuffle.more", { count: hidden }) : undefined
        }
      />

      {result.shift.length > 0 && (
        <Tabla
          t={t}
          heading={H}
          title={t("stress.shift.title")}
          desc={t("stress.shift.desc", { columns: shiftColumns.join(", ") })}
          rows={result.shift.map((s) => ({
            key: `s${s.level}`,
            what: t("stress.shift.row", { level: s.level, count: s.level }),
            value: fmt(s.value),
            change: changeOf(s.value),
          }))}
        />
      )}

      <p className="max-w-prose text-xs text-ink-muted">
        {t("stress.seal.caveat", { seed: result.seed })}
      </p>
    </div>
  );
}

function Tabla({
  t,
  heading: H,
  title,
  desc,
  rows,
  footnote,
}: {
  t: Traduce;
  heading: "h3" | "h4";
  title: string;
  desc: string;
  rows: {
    key: string;
    what: string;
    value: string;
    change: ReactNode;
  }[];
  footnote?: string;
}) {
  return (
    <section className="flex flex-col gap-1">
      <H className="text-sm font-semibold">{title}</H>
      <p className="max-w-prose text-xs text-ink-muted">{desc}</p>
      <table className="w-full text-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="text-left text-xs text-ink-muted">
            <th scope="col" className="py-1 pr-3 font-medium">
              {t("stress.col.what")}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              {t("stress.col.value")}
            </th>
            <th scope="col" className="py-1 font-medium">
              {t("stress.col.change")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-hairline">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {row.what}
              </th>
              <td className="py-1.5 pr-3 font-mono tabular-nums">
                {row.value}
              </td>
              <td className="py-1.5">{row.change}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {footnote && <p className="text-xs text-ink-muted">{footnote}</p>}
    </section>
  );
}

"use client";

import { useT } from "@/i18n/use-translation";
import { formatQuantity, quantityDecimals, withUnit } from "@/lib/quantity";
import {
  insideBandShare,
  niceTicks,
  scatterDomain,
  tickStep,
} from "@/lib/scatter";
import type { PredVsReal, TargetUnit } from "@/workers/protocol";

// S6 (P6): estimado frente a real, en el conjunto de prueba. SVG sin librería
// (R15: no suma al budget de la landing; vive en Resultados). Nada comunica solo
// con color (regla 5): la diagonal es una línea continua, la franja ±MAE lleva
// bordes punteados, y los puntos cambian de FORMA — disco relleno dentro de la
// franja, anillo fuera. La descripción textual equivalente (cuantiles del error
// sobre TODO el test) la pone RegressionDetail debajo del gráfico.

const SIZE = { width: 340, height: 300 };
const MARGIN = { top: 10, right: 12, bottom: 44, left: 58 };
const PLOT = {
  width: SIZE.width - MARGIN.left - MARGIN.right,
  height: SIZE.height - MARGIN.top - MARGIN.bottom,
};

export function PredichoVsReal({
  points,
  mae,
  unit,
  column,
}: {
  points: PredVsReal;
  mae: number;
  unit: TargetUnit;
  /** El objetivo (para los ejes cuando su unidad no se reconoce). */
  column: string;
}) {
  const t = useT();
  const [lo, hi] = scatterDomain(points);
  const ticks = niceTicks(lo, hi, 5);
  const tickDecimals = quantityDecimals([tickStep(ticks)], 1);
  const maeText = withUnit(formatQuantity(mae, quantityDecimals([mae])), unit);
  const x = (v: number) => MARGIN.left + ((v - lo) / (hi - lo)) * PLOT.width;
  const y = (v: number) =>
    MARGIN.top + PLOT.height - ((v - lo) / (hi - lo)) * PLOT.height;
  const axisUnit = unit.symbol ?? column;
  const shown = points.real.length;
  const inside = Math.round(insideBandShare(points, mae) * 100);

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-semibold">
        {t("results.regression.chart.title")}
      </figcaption>
      <svg
        viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
        className="h-auto w-full max-w-md"
        role="img"
        aria-label={t("results.regression.chart.label", {
          shown,
          inside,
          mae: maeText,
        })}
      >
        <defs>
          <clipPath id="pvr-plot">
            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={PLOT.width}
              height={PLOT.height}
            />
          </clipPath>
        </defs>

        {/* Rejilla y marcas: los dos ejes comparten rango (y = x es la diagonal). */}
        {ticks.map((tick) => (
          <g key={tick} className="text-ink-muted">
            <line
              x1={x(tick)}
              x2={x(tick)}
              y1={MARGIN.top}
              y2={MARGIN.top + PLOT.height}
              className="stroke-hairline"
            />
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + PLOT.width}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-hairline"
            />
            <text
              x={x(tick)}
              y={MARGIN.top + PLOT.height + 14}
              textAnchor="middle"
              className="fill-current font-mono text-[10px]"
            >
              {formatQuantity(tick, tickDecimals)}
            </text>
            <text
              x={MARGIN.left - 6}
              y={y(tick) + 3}
              textAnchor="end"
              className="fill-current font-mono text-[10px]"
            >
              {formatQuantity(tick, tickDecimals)}
            </text>
          </g>
        ))}

        <g clipPath="url(#pvr-plot)">
          {/* La franja ±MAE alrededor de la diagonal, con bordes punteados. */}
          <polygon
            points={[
              [lo, lo - mae],
              [hi, hi - mae],
              [hi, hi + mae],
              [lo, lo + mae],
            ]
              .map(([px, py]) => `${x(px)},${y(py)}`)
              .join(" ")}
            className="fill-accent/10"
          />
          {[-mae, mae].map((offset) => (
            <line
              key={offset}
              x1={x(lo)}
              y1={y(lo + offset)}
              x2={x(hi)}
              y2={y(hi + offset)}
              strokeDasharray="4 3"
              className="stroke-accent"
            />
          ))}
          <line
            x1={x(lo)}
            y1={y(lo)}
            x2={x(hi)}
            y2={y(hi)}
            strokeWidth={1.5}
            className="stroke-ink"
          />

          {points.real.map((real, i) => {
            const predicted = points.predicted[i];
            const within = Math.abs(predicted - real) <= mae;
            return within ? (
              <circle
                key={i}
                cx={x(real)}
                cy={y(predicted)}
                r={2.6}
                className="fill-accent"
              />
            ) : (
              <circle
                key={i}
                cx={x(real)}
                cy={y(predicted)}
                r={3}
                strokeWidth={1.4}
                className="fill-surface stroke-caution"
              />
            );
          })}
        </g>

        <text
          x={MARGIN.left + PLOT.width / 2}
          y={SIZE.height - 6}
          textAnchor="middle"
          className="fill-current text-[11px] text-ink-muted"
        >
          {t("results.regression.chart.axisReal")} ({axisUnit})
        </text>
        <text
          transform={`translate(13 ${MARGIN.top + PLOT.height / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-current text-[11px] text-ink-muted"
        >
          {t("results.regression.chart.axisPredicted")} ({axisUnit})
        </text>
      </svg>

      {/* Leyenda con muestras de FORMA, no solo de color. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-muted">
        <li className="inline-flex items-center gap-1.5">
          <svg aria-hidden viewBox="0 0 20 10" className="h-2.5 w-5">
            <line
              x1="0"
              y1="5"
              x2="20"
              y2="5"
              strokeWidth="1.5"
              className="stroke-ink"
            />
          </svg>
          {t("results.regression.chart.diagonal")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg aria-hidden viewBox="0 0 20 10" className="h-2.5 w-5">
            <rect
              x="0"
              y="1"
              width="20"
              height="8"
              className="fill-accent/10"
            />
            <line
              x1="0"
              y1="1"
              x2="20"
              y2="1"
              strokeDasharray="3 2"
              className="stroke-accent"
            />
            <line
              x1="0"
              y1="9"
              x2="20"
              y2="9"
              strokeDasharray="3 2"
              className="stroke-accent"
            />
          </svg>
          {t("results.regression.chart.band", { mae: maeText })}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg aria-hidden viewBox="0 0 10 10" className="h-2.5 w-2.5">
            <circle cx="5" cy="5" r="3.2" className="fill-accent" />
          </svg>
          {t("results.regression.chart.inside")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <svg aria-hidden viewBox="0 0 10 10" className="h-2.5 w-2.5">
            <circle
              cx="5"
              cy="5"
              r="3.2"
              strokeWidth="1.4"
              className="fill-surface stroke-caution"
            />
          </svg>
          {t("results.regression.chart.outside")}
        </li>
      </ul>

      {shown < points.n_total && (
        <p className="text-xs text-ink-muted">
          {t("results.regression.chart.sample", {
            shown,
            total: points.n_total,
          })}
        </p>
      )}
    </figure>
  );
}

"use client";

// S20 (ADR 028): la serie y su pronóstico. SVG sin librería (el gráfico vive en el chunk del panel). Nada comunica solo con color
// (regla 5): la historia es una línea continua y el pronóstico una discontinua, las dos bandas se distinguen por la tinta (oscura
// la del 80 %, clara la del 95 %) y por el borde punteado de la del 95 %, un periodo completado es un círculo hueco, y la leyenda
// dice cada trazo con palabras. El equivalente accesible es la tabla del pronóstico, debajo.
import { niceTicks, tickStep, leftMargin } from "@/lib/scatter";
import { formatQuantity, quantityDecimals } from "@/lib/quantity";

const SIZE = { width: 640, height: 300 };
const MARGIN = { top: 12, right: 16, bottom: 36 };

export type DatosGrafico = {
  /** Las etiquetas de los periodos de la historia y del pronóstico, en orden. */
  readonly etiquetas: readonly string[];
  readonly historia: readonly number[];
  readonly completado: readonly boolean[];
  readonly pronostico: readonly number[];
  readonly lo80: readonly number[];
  readonly hi80: readonly number[];
  readonly lo95: readonly number[];
  readonly hi95: readonly number[];
};

export type TextosGrafico = {
  readonly titulo: string;
  readonly etiqueta: string;
  readonly historia: string;
  readonly pronostico: string;
  readonly banda80: string;
  readonly banda95: string;
  readonly nota: string;
  readonly completado: string | null;
};

export function GraficoPronostico({
  datos,
  textos,
}: {
  datos: DatosGrafico;
  textos: TextosGrafico;
}) {
  const n = datos.historia.length;
  const h = datos.pronostico.length;
  const todos = [...datos.historia, ...datos.lo95, ...datos.hi95];
  let lo = Math.min(...todos);
  let hi = Math.max(...todos);
  if (hi === lo) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.05;
  [lo, hi] = [lo - pad, hi + pad];
  const ticks = niceTicks(lo, hi, 5);
  const decimales = quantityDecimals([tickStep(ticks)], 1);
  const rotulos = ticks.map((t) => formatQuantity(t, decimales));
  const left = leftMargin(rotulos) - 16;
  const plot = {
    width: SIZE.width - left - MARGIN.right,
    height: SIZE.height - MARGIN.top - MARGIN.bottom,
  };
  const total = n + h;
  const x = (i: number) =>
    left + (total <= 1 ? 0 : (i / (total - 1)) * plot.width);
  const y = (v: number) =>
    MARGIN.top + plot.height - ((v - lo) / (hi - lo)) * plot.height;
  const linea = (valores: readonly number[], desde: number) =>
    valores.map((v, i) => `${x(desde + i)},${y(v)}`).join(" ");

  // la banda arranca en el último punto de la historia (ancho cero) y se abre
  const ultimo = datos.historia[n - 1]!;
  const banda = (inferior: readonly number[], superior: readonly number[]) =>
    [
      `${x(n - 1)},${y(ultimo)}`,
      ...superior.map((v, i) => `${x(n + i)},${y(v)}`),
      ...[...inferior].map((v, i) => `${x(n + i)},${y(v)}`).reverse(),
    ].join(" ");

  // unas cinco etiquetas del eje horizontal, repartidas
  const marcas = Array.from(
    new Set([0, Math.round((n - 1) / 2), n - 1, n + h - 1]),
  ).filter((i) => i >= 0 && i < total);

  return (
    <figure className="flex flex-col gap-3" data-testid="pronostico-grafico">
      <figcaption className="text-sm font-semibold">{textos.titulo}</figcaption>
      <svg
        viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
        className="h-auto w-full max-w-2xl"
        role="img"
        aria-label={textos.etiqueta}
      >
        {ticks.map((tick, i) => (
          <g key={tick} className="text-ink-muted">
            <line
              x1={left}
              x2={left + plot.width}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-hairline"
            />
            <text
              x={left - 6}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-current font-mono text-[12px]"
            >
              {rotulos[i]}
            </text>
          </g>
        ))}
        {marcas.map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={MARGIN.top + plot.height + 16}
            textAnchor={
              k === 0 ? "start" : k === marcas.length - 1 ? "end" : "middle"
            }
            className="fill-current font-mono text-[11px] text-ink-muted"
          >
            {datos.etiquetas[i]}
          </text>
        ))}
        {/* el origen del pronóstico */}
        <line
          x1={x(n - 1)}
          x2={x(n - 1)}
          y1={MARGIN.top}
          y2={MARGIN.top + plot.height}
          className="stroke-hairline"
          strokeDasharray="1 3"
        />
        <polygon
          points={banda(datos.lo95, datos.hi95)}
          className="fill-accent/10 stroke-accent"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
        <polygon
          points={banda(datos.lo80, datos.hi80)}
          className="fill-accent/25"
        />
        <polyline
          points={linea(datos.historia, 0)}
          fill="none"
          strokeWidth={1.5}
          className="stroke-ink"
        />
        <polyline
          points={`${x(n - 1)},${y(ultimo)} ${linea(datos.pronostico, n)}`}
          fill="none"
          strokeWidth={2}
          strokeDasharray="6 4"
          className="stroke-accent"
        />
        {datos.completado.map((c, i) =>
          c ? (
            <circle
              key={i}
              cx={x(i)}
              cy={y(datos.historia[i]!)}
              r={3.5}
              fill="none"
              strokeWidth={1.5}
              className="stroke-ink"
            />
          ) : null,
        )}
      </svg>
      <ul className="flex flex-col gap-1 text-xs text-ink-muted">
        <li>
          <span aria-hidden="true" className="mr-1 font-mono">
            ──
          </span>
          {textos.historia}
        </li>
        <li>
          <span aria-hidden="true" className="mr-1 font-mono">
            ─ ─
          </span>
          {textos.pronostico}
        </li>
        <li>
          <span aria-hidden="true" className="mr-1">
            ▓
          </span>
          {textos.banda80}
        </li>
        <li>
          <span aria-hidden="true" className="mr-1">
            ░
          </span>
          {textos.banda95}
        </li>
        {textos.completado && (
          <li>
            <span aria-hidden="true" className="mr-1">
              ○
            </span>
            {textos.completado}
          </li>
        )}
      </ul>
      <p className="text-xs text-ink-muted">{textos.nota}</p>
    </figure>
  );
}

"use client";

// S21 (ADR 030): el gráfico del resultado de «Pregúntale a tus datos», sin librería. Barras (HTML) para las categorías y para «los N»;
// línea (SVG) para los periodos en orden. Siempre con la cifra ESCRITA junto a cada barra o punto y con la tabla como equivalente
// accesible: el color nunca es lo único que dice algo (un valor negativo lleva el signo «−» y una barra de otro tono).
import type { FilaResultado } from "@/engine/consulta";
import { formatQuantity } from "@/lib/quantity";
import { niceTicks } from "@/lib/scatter";

export type TextosGraficoConsulta = {
  readonly etiqueta: string;
  readonly leyenda: string;
  readonly minimo: string;
  readonly maximo: string;
};

type Props = {
  readonly grupos: readonly FilaResultado[];
  readonly modo: "barras" | "linea";
  readonly textos: TextosGraficoConsulta;
  /** Los decimales de las cifras: los decide `decimalesDe` (un conteo no lleva ninguno). */
  readonly decimales: number;
};

const firmado = (v: number, decimales: number): string =>
  v < 0 ? `−${formatQuantity(-v, decimales)}` : formatQuantity(v, decimales);

export function GraficoConsulta({ grupos, modo, textos, decimales }: Props) {
  return (
    <figure data-testid="pregunta-grafico" data-modo={modo} className="mt-3">
      {modo === "barras" ? (
        <Barras grupos={grupos} decimales={decimales} etiqueta={textos.etiqueta} />
      ) : (
        <Linea grupos={grupos} decimales={decimales} textos={textos} />
      )}
      <figcaption className="mt-2 text-xs text-ink-muted">{textos.leyenda}</figcaption>
    </figure>
  );
}

function Barras({
  grupos,
  decimales,
  etiqueta,
}: {
  grupos: readonly FilaResultado[];
  decimales: number;
  etiqueta: string;
}) {
  const max = Math.max(...grupos.map((g) => Math.abs(g.valor)), Number.MIN_VALUE);
  return (
    <ul aria-label={etiqueta} className="flex flex-col gap-1.5">
      {grupos.map((g) => (
        <li
          key={g.etiqueta}
          className="grid grid-cols-[minmax(5rem,1fr)_2fr_auto] items-center gap-2 text-sm"
        >
          <span className="truncate" title={g.etiqueta}>
            {g.etiqueta}
          </span>
          <span className="h-4 rounded-sm bg-sunken" aria-hidden="true">
            <span
              className={`block h-4 rounded-sm ${g.valor < 0 ? "bg-caution" : "bg-accent"}`}
              style={{ width: `${Math.max(1, (Math.abs(g.valor) / max) * 100)}%` }}
            />
          </span>
          <span className="font-mono tabular-nums">{firmado(g.valor, decimales)}</span>
        </li>
      ))}
    </ul>
  );
}

const ANCHO = 640;
const ALTO = 220;
const MARGEN = { izq: 56, der: 16, arriba: 14, abajo: 28 };

function Linea({
  grupos,
  decimales,
  textos,
}: {
  grupos: readonly FilaResultado[];
  decimales: number;
  textos: TextosGraficoConsulta;
}) {
  const valores = grupos.map((g) => g.valor);
  const ticks = niceTicks(Math.min(...valores), Math.max(...valores), 4);
  // las marcas empiezan en la primera «redonda» sobre el mínimo: el eje abarca también los extremos de verdad
  const bajo = Math.min(...valores, ticks[0]!);
  const alto = Math.max(...valores, ticks[ticks.length - 1]!);
  const rango = alto - bajo || 1;
  const x = (i: number) =>
    MARGEN.izq + (grupos.length === 1 ? 0.5 : i / (grupos.length - 1)) * (ANCHO - MARGEN.izq - MARGEN.der);
  const y = (v: number) => MARGEN.arriba + (1 - (v - bajo) / rango) * (ALTO - MARGEN.arriba - MARGEN.abajo);
  const imin = valores.indexOf(Math.min(...valores));
  const imax = valores.indexOf(Math.max(...valores));
  const camino = grupos.map((g, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(g.valor).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      role="img"
      aria-label={textos.etiqueta}
      className="h-auto w-full"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={MARGEN.izq}
            x2={ANCHO - MARGEN.der}
            y1={y(t)}
            y2={y(t)}
            className="stroke-hairline"
            strokeWidth={1}
          />
          <text x={MARGEN.izq - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-muted font-mono text-[10px]">
            {firmado(t, decimales)}
          </text>
        </g>
      ))}
      <path d={camino} fill="none" className="stroke-accent" strokeWidth={2} />
      {grupos.map((g, i) => (
        <circle key={g.etiqueta} cx={x(i)} cy={y(g.valor)} r={grupos.length > 40 ? 1.5 : 3} className="fill-accent" />
      ))}
      <text x={x(0)} y={ALTO - 8} textAnchor="start" className="fill-ink-muted font-mono text-[10px]">
        {grupos[0]!.etiqueta}
      </text>
      <text x={x(grupos.length - 1)} y={ALTO - 8} textAnchor="end" className="fill-ink-muted font-mono text-[10px]">
        {grupos[grupos.length - 1]!.etiqueta}
      </text>
      {imax !== imin && (
        <>
          <text x={x(imax)} y={y(valores[imax]!) - 6} textAnchor="middle" className="fill-ink font-mono text-[10px]">
            {textos.maximo} {firmado(valores[imax]!, decimales)}
          </text>
          <text x={x(imin)} y={y(valores[imin]!) + 14} textAnchor="middle" className="fill-ink font-mono text-[10px]">
            {textos.minimo} {firmado(valores[imin]!, decimales)}
          </text>
        </>
      )}
    </svg>
  );
}

"use client";

// Protocolo DS (S8): los campos de los formularios de las etapas, con los tokens de la app
// (design-system.md) y sin dependencias nuevas. Cada campo lleva su etiqueta enlazada, su ayuda
// descrita por `aria-describedby` y 44 px de alto táctil.
import { useId, type ReactNode } from "react";
import { useI18n } from "@/i18n/provider";

const BASE =
  "min-h-11 w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink";

export function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: (props: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const ayudaId = ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      {children({ id, describedBy: ayudaId })}
      {ayuda && (
        <p id={ayudaId} className="text-xs text-ink-muted">
          {ayuda}
        </p>
      )}
    </div>
  );
}

export function CampoTexto({
  etiqueta,
  ayuda,
  valor,
  onCambio,
  numerico = false,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: string;
  onCambio: (valor: string) => void;
  numerico?: boolean;
}) {
  const { t } = useI18n();
  // Un número que no se lee (p. ej. «1,500», que no se sabe si es uno y medio o mil quinientos)
  // se dice en el campo: callar lo contaría como cero y la compuerta lo rechazaría sin razón.
  const ilegible =
    numerico && valor.trim() !== "" && leerNumero(valor) === null;
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      {({ id, describedBy }) => (
        <>
          <input
            id={id}
            type="text"
            inputMode={numerico ? "decimal" : undefined}
            autoComplete="off"
            aria-describedby={
              [describedBy, ilegible ? `${id}-ilegible` : undefined]
                .filter(Boolean)
                .join(" ") || undefined
            }
            aria-invalid={ilegible || undefined}
            value={valor}
            onChange={(event) => onCambio(event.target.value)}
            className={BASE}
          />
          {ilegible && (
            <p id={`${id}-ilegible`} className="text-xs text-ink">
              <span aria-hidden="true">⚠ </span>
              {t("protocol.form.number-unreadable")}
            </p>
          )}
        </>
      )}
    </Campo>
  );
}

export function CampoArea({
  etiqueta,
  ayuda,
  valor,
  onCambio,
  filas = 3,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: string;
  onCambio: (valor: string) => void;
  filas?: number;
}) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          rows={filas}
          aria-describedby={describedBy}
          value={valor}
          onChange={(event) => onCambio(event.target.value)}
          className={`${BASE} resize-y`}
        />
      )}
    </Campo>
  );
}

export type OpcionSelect = { valor: string; texto: string };

export function CampoSelect({
  etiqueta,
  ayuda,
  valor,
  opciones,
  onCambio,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: string;
  opciones: readonly OpcionSelect[];
  onCambio: (valor: string) => void;
}) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          value={valor}
          onChange={(event) => onCambio(event.target.value)}
          className={BASE}
        >
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </option>
          ))}
        </select>
      )}
    </Campo>
  );
}

/** Un grupo de opciones excluyentes (radio) con la etiqueta como leyenda. */
export function CampoOpciones<T extends string>({
  leyenda,
  ayuda,
  valor,
  opciones,
  onCambio,
}: {
  leyenda: string;
  ayuda?: string;
  valor: T | null;
  opciones: readonly { valor: T; texto: string }[];
  onCambio: (valor: T) => void;
}) {
  const nombre = useId();
  const ayudaId = ayuda ? `${nombre}-ayuda` : undefined;
  return (
    <fieldset className="flex flex-col gap-1" aria-describedby={ayudaId}>
      <legend className="text-sm font-medium">{leyenda}</legend>
      {ayuda && (
        <p id={ayudaId} className="text-xs text-ink-muted">
          {ayuda}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {opciones.map((opcion) => (
          <label
            key={opcion.valor}
            className="flex min-h-11 items-center gap-2 rounded-md border border-hairline bg-surface px-3 text-sm"
          >
            <input
              type="radio"
              name={nombre}
              checked={valor === opcion.valor}
              onChange={() => onCambio(opcion.valor)}
            />
            {opcion.texto}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Un grupo de casillas (varias a la vez) con la etiqueta como leyenda. Con muchas opciones (un
 * archivo de 80 columnas) la lista se desplaza dentro de su caja: las casillas son enfocables, así
 * que el teclado la recorre completa.
 */
export function CampoCasillas({
  leyenda,
  ayuda,
  opciones,
  marcadas,
  onCambio,
}: {
  leyenda: string;
  ayuda?: string;
  opciones: readonly string[];
  marcadas: readonly string[];
  onCambio: (opcion: string, marcada: boolean) => void;
}) {
  const id = useId();
  const ayudaId = ayuda ? `${id}-ayuda` : undefined;
  const marcadasSet = new Set(marcadas);
  return (
    <fieldset className="flex flex-col gap-1" aria-describedby={ayudaId}>
      <legend className="text-sm font-medium">{leyenda}</legend>
      {ayuda && (
        <p id={ayudaId} className="text-xs text-ink-muted">
          {ayuda}
        </p>
      )}
      <div className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
        {opciones.map((opcion) => (
          <label
            key={opcion}
            className="flex min-h-11 items-center gap-2 rounded-md border border-hairline bg-surface px-3 text-sm [overflow-wrap:anywhere]"
          >
            <input
              type="checkbox"
              checked={marcadasSet.has(opcion)}
              onChange={(event) => onCambio(opcion, event.target.checked)}
            />
            {opcion}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** «1,500» o «1.500»: ¿uno y medio o mil quinientos? No se adivina (un cero a la izquierda,
 *  «0,500», sí es un decimal: un grupo de miles no empieza en cero). */
const MILES_AMBIGUO = /^[+-]?[1-9]\d{0,2}([.,]\d{3})+$/;

/** Lo que el usuario escribe como número: coma o punto decimal, sin separador de miles. */
export function leerNumero(texto: string): number | null {
  const crudo = texto.trim();
  if (MILES_AMBIGUO.test(crudo)) return null;
  const limpio = crudo.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

export function numeroATexto(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "";
}

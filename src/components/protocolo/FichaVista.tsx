"use client";

// Protocolo DS (S15, etapa 10): la ficha del modelo en pantalla, sección por sección y plegable. Cada línea
// dice de qué etapa, fecha y huella viene; lo que escribió el dueño lleva su marca (símbolo + texto, nunca
// solo color). La usan la vista previa del formulario y la constancia de la etapa cumplida.
import type { SeccionVista } from "@/lib/protocolo/ficha-texto";

export function FichaVista({
  secciones,
  testid,
}: {
  secciones: readonly SeccionVista[];
  testid: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      {secciones.map((seccion) => (
        <details
          key={seccion.id}
          open
          data-testid={`ficha-seccion-${seccion.id}`}
          className="rounded-md border border-hairline p-3 text-sm"
        >
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">
            {seccion.titulo}
          </summary>
          <ul className="mt-1 flex flex-col gap-2">
            {seccion.lineas.map((linea, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                <p>{linea.texto}</p>
                <p className="text-xs text-ink-muted">
                  {linea.deDueno && <span aria-hidden="true">✎ </span>}
                  {linea.fuente}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

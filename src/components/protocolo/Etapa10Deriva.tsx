"use client";

// Protocolo DS (S15, etapa 10, G-Plan 2a): el chequeo de deriva con un CSV nuevo. Compara las columnas del
// modelo del archivo nuevo con la referencia que guardó la etapa (solo agregados) y dice, por columna, si está
// estable, cambió algo o dio alerta, y el veredicto del plan: sigue, revisa o reentrena. Mide las ENTRADAS, no
// el desempeño, y lo dice. El archivo nuevo no se guarda, no sale del navegador y de él no queda nada más
// que el resultado en esta pantalla (regla dura 2). Carga diferida con la constancia de la etapa 10.
import { useMemo, useRef, useState } from "react";
import {
  chequearDeriva,
  type EstadoChequeo,
  type ResultadoChequeo,
} from "@/engine/protocolo/chequeo-deriva";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import {
  leerReferencia,
  type RefColumna,
} from "@/engine/protocolo/referencia-deriva";
import { lista } from "@/engine/protocolo/valores";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { MAX_BYTES, parseCsvWithLimits } from "@/lib/ds/csv";
import { cifra, proporcion } from "@/lib/protocolo/formato";
import { CSV_ERROR } from "@/lib/protocolo/useProtocolo";
import { csvLimitParams } from "@/lib/quantity";
import { Button } from "@/components/ui";
import { TEXTOS_ETAPA_10 } from "./textos/etapa10";

/** El símbolo de cada estado: el color nunca va solo. */
const SIMBOLO: Record<EstadoChequeo, string> = {
  estable: "✓",
  moderada: "⚠",
  alerta: "✕",
  "pocas-filas": "…",
  "otro-tipo": "⚠",
};
const VEREDICTO_SIMBOLO = {
  sigue: "✓",
  revisar: "⚠",
  reentrenar: "✕",
} as const;

type Estado =
  | { readonly tipo: "nada" }
  | { readonly tipo: "error"; readonly clave: string }
  | { readonly tipo: "medido"; readonly resultado: ResultadoChequeo };

/** Las referencias que guardó la etapa; `null` si alguna no se puede leer (no se mide con media referencia). */
function referenciasDe(datos: DatosEtapa): RefColumna[] | null {
  const guardadas = lista(datos.chequeos, "vig_referencia");
  if (!guardadas || guardadas.length === 0) return null;
  const leidas = guardadas.map(leerReferencia);
  return leidas.every((r): r is RefColumna => r !== null) ? leidas : null;
}

export function Etapa10Deriva({ evidencia }: { evidencia: DatosEtapa }) {
  const t = useTextosEtapa(TEXTOS_ETAPA_10);
  const referencias = useMemo(() => referenciasDe(evidencia), [evidencia]);
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const inputRef = useRef<HTMLInputElement>(null);

  async function cargar(file: File) {
    if (!referencias) return;
    if (file.size > MAX_BYTES) {
      setEstado({ tipo: "error", clave: "errors.csv-too-large" });
      return;
    }
    const texto = new TextDecoder().decode(
      new Uint8Array(await file.arrayBuffer()),
    );
    const leido = parseCsvWithLimits(texto);
    if (!leido.ok) {
      setEstado({
        tipo: "error",
        clave: CSV_ERROR[leido.error.kind] ?? "errors.csv-empty",
      });
      return;
    }
    setEstado({
      tipo: "medido",
      resultado: chequearDeriva(referencias, leido.table),
    });
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-hairline p-3 text-sm"
      data-testid="protocolo-deriva10"
    >
      <h3 className="font-medium">{t("protocol.stage.10.drift.title")}</h3>
      <p className="text-ink-muted">{t("protocol.stage.10.drift.intro")}</p>
      {!referencias ? (
        <p
          className="text-caution"
          data-testid="protocolo-deriva10-sin-referencia"
        >
          <span aria-hidden="true">⚠ </span>
          {t("protocol.stage.10.drift.no-reference")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button icon="upload" onClick={() => inputRef.current?.click()}>
            {t("protocol.stage.10.drift.button")}
          </Button>
          {estado.tipo !== "nada" && (
            <Button
              variant="ghost"
              icon="x"
              onClick={() => setEstado({ tipo: "nada" })}
            >
              {t("protocol.stage.10.drift.clear")}
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            tabIndex={-1}
            aria-hidden
            accept=".csv,text/csv"
            className="sr-only"
            data-testid="protocolo-deriva10-csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void cargar(file);
            }}
          />
        </div>
      )}

      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {estado.tipo === "error" && (
          <p className="text-caution">
            <span aria-hidden="true">⚠ </span>
            {t(estado.clave, csvLimitParams())}
          </p>
        )}
        {estado.tipo === "medido" &&
          (estado.resultado.tipo === "faltan-columnas" ? (
            <p className="text-caution" data-testid="protocolo-deriva10-faltan">
              <span aria-hidden="true">⚠ </span>
              {t("protocol.stage.10.drift.missing", {
                columnas: estado.resultado.faltan.join(", "),
              })}
            </p>
          ) : (
            <>
              <p className="text-ink-muted">
                {t("protocol.stage.10.drift.rows", {
                  filas: cifra(estado.resultado.filas),
                })}
              </p>
              <p
                className={`font-medium ${estado.resultado.veredicto === "sigue" ? "" : "text-caution"}`}
                data-testid="protocolo-deriva10-veredicto"
              >
                <span aria-hidden="true">
                  {VEREDICTO_SIMBOLO[estado.resultado.veredicto]}{" "}
                </span>
                {t(
                  `protocol.stage.10.drift.verdict.${estado.resultado.veredicto}`,
                )}
              </p>
              <div
                className="overflow-x-auto"
                role="region"
                aria-label={t("protocol.stage.10.drift.region")}
                tabIndex={0}
              >
                <table
                  className="w-full text-left"
                  data-testid="protocolo-deriva10-tabla"
                >
                  <thead className="text-ink-muted">
                    <tr>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t("protocol.stage.10.drift.col")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t("protocol.stage.10.drift.estado")}
                      </th>
                      <th
                        scope="col"
                        className="py-1 pr-3 text-right font-medium"
                      >
                        {t("protocol.stage.10.drift.psi")}
                      </th>
                      <th
                        scope="col"
                        className="py-1 pr-3 text-right font-medium"
                      >
                        {t("protocol.stage.10.drift.filled")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.resultado.columnas.map((c) => (
                      <tr key={c.columna} data-estado={c.estado}>
                        <td className="py-1 pr-3 [overflow-wrap:anywhere]">
                          {c.columna}
                        </td>
                        <td
                          className={`py-1 pr-3 ${c.estado === "estable" ? "" : "text-caution"}`}
                        >
                          <span aria-hidden="true">{SIMBOLO[c.estado]} </span>
                          {t(`protocol.stage.10.drift.state.${c.estado}`)}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {c.psi === null ? "—" : proporcion(c.psi)}
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {cifra(c.filas)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-ink-muted">
                {t("protocol.stage.10.drift.reminder")}
              </p>
            </>
          ))}
      </div>
    </section>
  );
}

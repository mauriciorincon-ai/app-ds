"use client";

// Protocolo DS (S15, etapa 10): lo que la tarjeta muestra cuando la etapa está cumplida. La ficha del modelo,
// armada solo con lo que el cuaderno registró (sin recalcular nada ni volver a abrir la prueba), su descarga en
// Markdown (el generador se importa al tocar «Descargar») y, con «usar», el chequeo de deriva con un CSV
// nuevo. No necesita los datos cargados: todo sale del cuaderno. Carga diferida (formularios.tsx).
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  armarFicha,
  cargaDe,
  evidenciasCumplidas,
} from "@/engine/protocolo/ficha";
import { useI18n } from "@/i18n/provider";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { downloadTextFile } from "@/lib/files";
import { fichaVista, nombresDe } from "@/lib/protocolo/ficha-texto";
import { useGanador } from "@/lib/protocolo/useGanador";
import { Button } from "@/components/ui";
import { Etapa10Deriva } from "./Etapa10Deriva";
import { Etapa10Modelo } from "./Etapa10Modelo";
import { FichaVista } from "./FichaVista";
import type { PropsConstancia } from "./formulario-base";
import { TEXTOS_ETAPA_10 } from "./textos/etapa10";

// S20: las reglas del ganador con filas que el usuario sube. El árbol, su lectura y sus textos llegan SOLO al pintar esta sección.
const Etapa10Reglas = dynamic(
  () => import("./Etapa10Reglas").then((m) => m.Etapa10Reglas),
  { ssr: false },
);

export function Etapa10Constancia({
  evaluadas,
  cuaderno,
  datos = null,
}: PropsConstancia) {
  const t = useTextosEtapa(TEXTOS_ETAPA_10);
  const { locale } = useI18n();
  const [descargado, setDescargado] = useState<string | null>(null);
  // S21 (lote 20-16): UN solo worker del ganador para el archivo del modelo y para las reglas
  const ganador = useGanador();
  const evidencias = useMemo(() => evidenciasCumplidas(evaluadas), [evaluadas]);
  const carga = useMemo(
    () => (cuaderno ? cargaDe(cuaderno, evidencias[10]?.huella ?? null) : null),
    [cuaderno, evidencias],
  );
  const ficha = useMemo(
    () => armarFicha({ evidencias, carga }),
    [evidencias, carga],
  );
  const nombres = useMemo(() => nombresDe(evidencias), [evidencias]);
  const secciones = useMemo(
    () => (ficha ? fichaVista(ficha, t, locale, nombres) : []),
    [ficha, t, locale, nombres],
  );

  if (!ficha)
    return (
      <p className="text-sm text-caution" role="status">
        <span aria-hidden="true">⚠ </span>
        {t("protocol.stage.10.constancia.fail")}
      </p>
    );

  async function descargar() {
    if (!ficha) return;
    const { fichaMarkdown, nombreFichaMarkdown } =
      await import("@/lib/protocolo/ficha-markdown");
    const nombre = nombreFichaMarkdown(carga);
    downloadTextFile(
      nombre,
      fichaMarkdown(ficha, t, locale, nombres),
      "text/markdown;charset=utf-8",
    );
    setDescargado(nombre);
  }

  return (
    <div className="flex flex-col gap-3" data-testid="protocolo-constancia10">
      <section className="flex flex-col gap-2 rounded-md border border-hairline p-3 text-sm">
        <h3 className="font-medium">
          {t("protocol.stage.10.constancia.title")}
        </h3>
        <p className="font-medium" data-testid="ficha-titular">
          {t(`protocol.stage.10.sheet.headline.${ficha.decision}`)}
        </p>
        <p className="text-ink-muted">
          {t("protocol.stage.10.constancia.body")}
        </p>
        <FichaVista secciones={secciones} testid="ficha-secciones" />
        <div className="flex flex-wrap items-center gap-2">
          <Button icon="download" onClick={() => void descargar()}>
            {t("protocol.stage.10.constancia.download")}
          </Button>
          <span
            role="status"
            aria-live="polite"
            className="text-xs text-ink-muted"
          >
            {descargado
              ? t("protocol.stage.10.constancia.downloaded", {
                  nombre: descargado,
                })
              : ""}
          </span>
        </div>
      </section>
      {/* S19: el ganador como archivo, para puntuar y vigilar su desempeño en Probeta. */}
      {ficha.decision === "usar" && (
        <Etapa10Modelo evidencias={evidencias} datos={datos} ganador={ganador} />
      )}
      {/* S20: las reglas del ganador, armadas con las filas que subes (la verdad no se mide: la prueba ya se abrió). */}
      {ficha.decision === "usar" && (
        <Etapa10Reglas evidencias={evidencias} datos={datos} ganador={ganador} />
      )}
      {ficha.decision === "usar" && evidencias[10] && (
        <Etapa10Deriva evidencia={evidencias[10].datos} />
      )}
    </div>
  );
}

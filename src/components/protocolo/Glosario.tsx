"use client";

// Protocolo DS (S8): el glosario se consulta entero (esta sección) y cada término de una
// compuerta enlaza a su entrada (`TerminoLink`). Definiciones propias; «leer más» al
// glosario de Google donde existe la entrada, con su atribución (CC BY 4.0).
import { GLOSARIO, GOOGLE_GLOSARIO } from "@/content/glosario";
import { TERMINO_IDS, type TerminoId } from "@/engine/protocolo/ids";
import { useI18n } from "@/i18n/provider";

export function anclaTermino(id: TerminoId): string {
  return `termino-${id}`;
}

export function TerminoLink({ id }: { id: TerminoId }) {
  const { locale } = useI18n();
  return (
    <a
      href={`#${anclaTermino(id)}`}
      className="inline-flex min-h-11 items-center rounded-full border border-hairline px-3 text-xs text-ink underline-offset-2 hover:underline"
    >
      {GLOSARIO[id].termino[locale]}
    </a>
  );
}

export function Glosario() {
  const { locale, t } = useI18n();
  return (
    <section aria-labelledby="glosario-titulo" className="flex flex-col gap-3">
      <h2 id="glosario-titulo" className="text-xl font-semibold tracking-tight">
        {t("protocol.glossary.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("protocol.glossary.desc")}</p>
      <dl className="flex flex-col gap-3">
        {TERMINO_IDS.map((id) => {
          const entrada = GLOSARIO[id];
          return (
            <div
              key={id}
              id={anclaTermino(id)}
              className="scroll-mt-6 rounded-md border border-hairline bg-surface p-3"
            >
              <dt className="font-medium">{entrada.termino[locale]}</dt>
              <dd className="mt-1 text-sm text-ink-muted">
                {entrada.definicion[locale]}
                {entrada.google && (
                  <>
                    {" "}
                    <a
                      href={`${GOOGLE_GLOSARIO[locale]}#${entrada.google}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink underline underline-offset-2"
                    >
                      {t("protocol.glossary.more")}
                    </a>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="text-xs text-ink-muted">
        {t("protocol.glossary.attribution")}
      </p>
    </section>
  );
}

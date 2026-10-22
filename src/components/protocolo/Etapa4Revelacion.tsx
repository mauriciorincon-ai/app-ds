"use client";

// Protocolo DS (S9), etapa 4, paso 2: lo que encontró el código en tus datos, y tu apuesta contra
// eso. Cada hallazgo dice qué es, en qué columna y por qué importa; «no encontró» nunca se dice
// como «no hay»: la app mira una columna a la vez y no ve lo que filtra solo en combinación.
// Símbolo + texto + color: el ámbar nunca va solo.
import type { ReactNode, RefObject } from "react";
import { byCodePoint } from "@/engine/tarea";
import { PSI_ALERTA, PSI_MODERADA } from "@/engine/protocolo/deriva";
import type { Hallazgos4 } from "@/engine/protocolo/etapa4";
import { lista, type Registro } from "@/engine/protocolo/valores";
import { useTextosEtapa } from "@/i18n/textos-etapa";
import { TEXTOS_ETAPA_4 } from "./textos/etapa4";
import { cifra, psiTexto } from "@/lib/protocolo/formato";
import { formatQuantity, thousands } from "@/lib/quantity";

const k = (clave: string) => `protocol.stage.4.${clave}`;

const porPuntaje = (m: Readonly<Record<string, number>>) =>
  Object.entries(m).sort(([ca, a], [cb, b]) => b - a || byCodePoint(ca, cb));

function Hallazgo({
  titulo,
  porque,
  testId,
  children,
}: {
  titulo: string;
  porque?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-md border border-hairline p-3 text-sm"
      data-testid={testId}
    >
      <h5 className="font-medium">{titulo}</h5>
      <div className="mt-1 flex flex-col gap-1">{children}</div>
      {porque && <p className="mt-2 text-xs text-ink-muted">{porque}</p>}
    </div>
  );
}

function Alerta({ children }: { children: ReactNode }) {
  return (
    <li className="text-caution [overflow-wrap:anywhere]">
      <span aria-hidden="true">⚠ </span>
      <span className="text-ink">{children}</span>
    </li>
  );
}

export function Revelacion({
  h,
  chequeos,
  tituloRef,
  idTitulo,
}: {
  h: Hallazgos4;
  chequeos: Registro;
  tituloRef: RefObject<HTMLHeadingElement | null>;
  idTitulo: string;
}) {
  const t = useTextosEtapa(TEXTOS_ETAPA_4);
  const fuga = porPuntaje(h.fuga);
  const vacios = porPuntaje(h.fugaVacios);
  const identificadores = porPuntaje(h.identificador);
  const derivas = porPuntaje(h.derivaPsi).filter(
    ([, psi]) => psi >= PSI_MODERADA,
  );
  const [aciertos, sorpresas, falsas] = [
    lista(chequeos, "aciertos") ?? [],
    lista(chequeos, "sorpresas") ?? [],
    lista(chequeos, "falsas_alarmas") ?? [],
  ];
  const nada =
    fuga.length + vacios.length + identificadores.length === 0 &&
    h.duplicadosFila === 0 &&
    (h.duplicadosUnidadMomento ?? 0) === 0;

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <h4 id={idTitulo} ref={tituloRef} tabIndex={-1} className="font-semibold">
        {t(k("step.reveal.title"))}
      </h4>
      <p className="text-sm text-ink-muted">{t(k("reveal.intro"))}</p>

      {fuga.length > 0 && (
        <Hallazgo
          testId="protocolo-hallazgo-fuga"
          titulo={t(k("find.leak.title"))}
          porque={t(k("find.leak.why"))}
        >
          <ul className="flex flex-col gap-1">
            {fuga.map(([columna, puntaje]) => (
              <Alerta key={columna}>
                {t(k("find.leak.item"), { columna, score: cifra(puntaje) })}
              </Alerta>
            ))}
          </ul>
        </Hallazgo>
      )}

      {vacios.length > 0 && (
        <Hallazgo
          testId="protocolo-hallazgo-vacios"
          titulo={t(k("find.blank.title"))}
          porque={t(k("find.blank.why"))}
        >
          <ul className="flex flex-col gap-1">
            {vacios.map(([columna, puntaje]) => (
              <Alerta key={columna}>
                {t(k("find.blank.item"), { columna, score: cifra(puntaje) })}
              </Alerta>
            ))}
          </ul>
        </Hallazgo>
      )}

      {identificadores.length > 0 && (
        <Hallazgo
          testId="protocolo-hallazgo-identificador"
          titulo={t(k("find.id.title"))}
          porque={t(k("find.id.why"))}
        >
          <ul className="flex flex-col gap-1">
            {identificadores.map(([columna, razon]) => (
              <Alerta key={columna}>
                {t(k("find.id.item"), {
                  columna,
                  pct: formatQuantity(razon * 100, 1),
                })}
              </Alerta>
            ))}
          </ul>
        </Hallazgo>
      )}

      {(h.duplicadosFila > 0 || (h.duplicadosUnidadMomento ?? 0) > 0) && (
        <Hallazgo
          testId="protocolo-hallazgo-duplicados"
          titulo={t(k("find.dup.title"))}
          porque={t(k("find.dup.why"))}
        >
          <ul className="flex flex-col gap-1">
            {h.duplicadosFila > 0 && (
              <Alerta>
                {t(k("find.dup.rows"), {
                  n: thousands(h.duplicadosFila),
                  filas: thousands(h.filas),
                })}
              </Alerta>
            )}
            {(h.duplicadosUnidadMomento ?? 0) > 0 && (
              <Alerta>
                {t(k("find.dup.unit"), {
                  n: thousands(h.duplicadosUnidadMomento ?? 0),
                })}
              </Alerta>
            )}
          </ul>
        </Hallazgo>
      )}

      <Hallazgo
        testId="protocolo-hallazgo-deriva"
        titulo={t(k("find.drift.title"))}
        porque={
          h.derivaEstado === "medida" ? t(k("find.drift.why")) : undefined
        }
      >
        {h.derivaEstado === "medida" ? (
          <>
            <p>
              {t(k("find.drift.measured"), {
                corte: h.derivaCorte ?? "",
                reciente: thousands(h.derivaReciente ?? 0),
                historico: thousands(h.derivaHistorico ?? 0),
              })}
            </p>
            {derivas.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {derivas.map(([columna, psi]) => {
                  const ks = Object.hasOwn(h.derivaKs, columna)
                    ? h.derivaKs[columna]!
                    : null;
                  const nivel = psi >= PSI_ALERTA ? "alert" : "moderate";
                  const frase = t(k(`find.drift.item.${nivel}`), {
                    columna,
                    psi: psiTexto(psi, [PSI_MODERADA, PSI_ALERTA]),
                  });
                  const completa =
                    ks === null
                      ? frase
                      : `${frase} ${t(k("find.drift.ks"), { ks: cifra(ks) })}`;
                  return nivel === "alert" ? (
                    <Alerta key={columna}>{completa}</Alerta>
                  ) : (
                    <li key={columna} className="[overflow-wrap:anywhere]">
                      {completa}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>{t(k("find.drift.none"))}</p>
            )}
            {h.derivaSinMedir.length > 0 && (
              <p className="text-xs text-ink-muted [overflow-wrap:anywhere]">
                {t(k("find.drift.skipped"), {
                  list: h.derivaSinMedir.join(", "),
                })}
              </p>
            )}
          </>
        ) : (
          <p>{t(k(`find.drift.state.${h.derivaEstado}`))}</p>
        )}
      </Hallazgo>

      {nada && fuga.length + vacios.length === 0 && (
        <p className="text-sm" data-testid="protocolo-nada-encontrado">
          {t(k("find.none"))}
        </p>
      )}

      <Hallazgo
        testId="protocolo-hallazgo-comparacion"
        titulo={t(k("compare.title"))}
        porque={t(k("compare.note"))}
      >
        {aciertos.length + sorpresas.length + falsas.length === 0 ? (
          <p>{t(k("compare.empty"))}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {aciertos.length > 0 && (
              <li className="[overflow-wrap:anywhere]">
                <span aria-hidden="true">✓ </span>
                {t(k("compare.hits"), { list: aciertos.join(", ") })}
              </li>
            )}
            {sorpresas.length > 0 && (
              <li className="[overflow-wrap:anywhere]">
                <span aria-hidden="true">⚠ </span>
                {t(k("compare.surprises"), { list: sorpresas.join(", ") })}
              </li>
            )}
            {falsas.length > 0 && (
              <li className="[overflow-wrap:anywhere]">
                <span aria-hidden="true">· </span>
                {t(k("compare.false"), { list: falsas.join(", ") })}
              </li>
            )}
          </ul>
        )}
      </Hallazgo>
    </section>
  );
}

"use client";

// Protocolo DS (S8, ADR 020): el cuaderno que se escribe solo. Cada evidencia dice qué etapa,
// cuándo, con qué datos y qué respondió y calculó; las corregidas quedan, marcadas. Se exporta
// como `.protocolo.json` (el respaldo, y la salida de la ventana privada) y se importa.
import { useRef, useState } from "react";
import { CONTENIDO_ETAPAS } from "@/content/protocolo";
import {
  ultimaEvidencia,
  type Cuaderno,
  type Evidencia,
} from "@/engine/protocolo/cuaderno";
import { resumenEtapa4 } from "@/engine/protocolo/etapa4";
import { ACTUAR, NO_ACTUAR, resumenEtapa5 } from "@/engine/protocolo/etapa5";
import { resumenEtapa6, sellosDistintos } from "@/engine/protocolo/etapa6";
import type { DatosEtapa, Valor } from "@/engine/protocolo/etapas";
import { useI18n } from "@/i18n/provider";
import { cifra, fecha, huellaCorta, valorTexto } from "@/lib/protocolo/formato";
import { formatQuantity, thousands } from "@/lib/quantity";
import { Button } from "@/components/ui";
import { Confirmacion } from "./Confirmacion";
import { reglaTexto } from "./regla-texto";

/**
 * La etapa 4 registra listas largas (una entrada por columna): el cuaderno muestra lo que
 * importa de ellas —tu apuesta contra los hallazgos, cuántas columnas usas, la declaración en
 * bloque— y el archivo exportado trae el detalle completo.
 */
function ResumenEtapa4({ datos }: { datos: DatosEtapa }) {
  const { t } = useI18n();
  const r = resumenEtapa4(datos);
  const lista = (nombres: readonly string[]) =>
    nombres.length > 0
      ? nombres.join(", ")
      : t("protocol.stage.4.summary.none");
  return (
    <ul
      className="mt-2 flex flex-col gap-1 text-sm [overflow-wrap:anywhere]"
      data-testid="cuaderno-resumen4"
    >
      <li>
        {r.ninguna
          ? t("protocol.stage.4.summary.bet-none")
          : t("protocol.stage.4.summary.bet", { list: lista(r.apuesta) })}
      </li>
      <li>
        {t("protocol.stage.4.summary.compare", {
          hits: lista(r.aciertos),
          surprises: lista(r.sorpresas),
          false: lista(r.falsas),
        })}
      </li>
      <li>
        {t("protocol.stage.4.summary.counts", {
          usar: r.usar,
          excluir: r.excluir,
          nose: r.nose,
        })}
      </li>
      <li>{t("protocol.stage.4.summary.alerts", { n: r.alertas })}</li>
      {r.enBloque > 0 && (
        <li>{t("protocol.stage.4.summary.bulk", { count: r.enBloque })}</li>
      )}
      <li>
        {t("protocol.stage.4.summary.drift", {
          estado: t(`protocol.stage.4.summary.drift-state.${r.derivaEstado}`),
        })}
      </li>
    </ul>
  );
}

/**
 * La etapa 5 registra mapas y listas por referencia: el cuaderno muestra lo que importa —lo que
 * se logra sin modelo, en la moneda de la decisión, y la regla de hoy con su medida— y recuerda
 * que es una referencia. El archivo exportado trae el detalle completo.
 */
function ResumenEtapa5({ datos }: { datos: DatosEtapa }) {
  const { t } = useI18n();
  const r = resumenEtapa5(datos);
  const nombre = (id: string) =>
    t(`protocol.stage.5.ref.${id}`, {
      clase: r.claseMayoritaria ?? "",
      opcion: r.opcionBarata ?? "",
    });
  const salida = (valor: string) =>
    valor === ACTUAR
      ? t("protocol.stage.5.summary.act")
      : valor === NO_ACTUAR
        ? t("protocol.stage.5.summary.no-act")
        : valor;
  // La métrica estándar al lado del costo (clasificación: exactitud balanceada; un número: error
  // medio) y los aciertos por cada 100, con los mismos rótulos de la tabla de la etapa.
  const metrica = t(
    r.clasificacion
      ? "protocol.stage.5.table.col-balanced"
      : "protocol.stage.5.table.col-error",
  );
  const aciertos100 = (a: number) => formatQuantity(a * 100, 1);
  return (
    <ul
      className="mt-2 flex flex-col gap-1 text-sm [overflow-wrap:anywhere]"
      data-testid="cuaderno-resumen5"
    >
      <li>
        {t("protocol.stage.5.summary.reference", { filas: thousands(r.filas) })}
      </li>
      <li>
        {t("protocol.stage.5.summary.refs", {
          list: r.referencias
            .map((x) => `${nombre(x.id)}: ${cifra(x.costo100)}`)
            .join(" · "),
        })}
      </li>
      {r.referencias.some((x) => x.metrica !== null) && (
        <li>
          {t("protocol.stage.5.summary.metrics", {
            metrica,
            list: r.referencias
              .filter((x) => x.metrica !== null)
              .map((x) => `${nombre(x.id)}: ${cifra(x.metrica!)}`)
              .join(" · "),
          })}
        </li>
      )}
      {r.clasificacion && (
        <li>
          {t("protocol.stage.5.summary.hits", {
            list: r.referencias
              .filter((x) => x.aciertos !== null)
              .map((x) => `${nombre(x.id)}: ${aciertos100(x.aciertos!)}`)
              .join(" · "),
          })}
        </li>
      )}
      {r.sinAnterior !== null && r.sinAnterior > 0 && (
        <li>
          {t("protocol.stage.5.summary.no-previous", {
            n: thousands(r.sinAnterior),
          })}
        </li>
      )}
      {r.regla === "hay" && r.reglaCosto100 !== null && (
        <>
          <li>
            {t("protocol.stage.5.summary.rule", {
              regla: reglaTexto(t, r.condiciones, r.tipos, r.union),
              cumple: thousands(r.cumple ?? 0),
              filas: thousands(r.filas),
              costo: cifra(r.reglaCosto100),
            })}
          </li>
          <li>
            {t("protocol.stage.5.summary.rule-then", {
              si: salida(r.si),
              no: salida(r.no),
            })}
          </li>
          {r.reglaMetrica !== null && (
            <li>
              {t("protocol.stage.5.summary.rule-metric", {
                metrica,
                valor: cifra(r.reglaMetrica),
              })}
              {r.reglaAciertos !== null &&
                ` ${t("protocol.stage.5.summary.rule-hits", {
                  valor: aciertos100(r.reglaAciertos),
                })}`}
            </li>
          )}
          {r.reglaVacios !== null && r.reglaVacios > 0 && (
            <li>
              {t("protocol.stage.5.summary.rule-empty", {
                vacios: thousands(r.reglaVacios),
                filas: thousands(r.filas),
              })}
            </li>
          )}
        </>
      )}
      {r.regla === "ninguna" && (
        <li>{t("protocol.stage.5.summary.rule-none")}</li>
      )}
    </ul>
  );
}

/** La etapa 6: el esquema (y el sugerido con tu razón, si elegiste otro), los lados, el sello. */
function ResumenEtapa6({
  datos,
  sellos,
}: {
  datos: DatosEtapa;
  /** Pruebas distintas selladas en el cuaderno hasta esta evidencia, incluida. */
  sellos: number;
}) {
  const { t } = useI18n();
  const r = resumenEtapa6(datos);
  const nombre = (e: string) => t(`protocol.stage.6.scheme.${e}`);
  const n = (x: number | null) => thousands(x ?? 0);
  return (
    <ul
      className="mt-2 flex flex-col gap-1 text-sm [overflow-wrap:anywhere]"
      data-testid="cuaderno-resumen6"
    >
      <li>
        {r.sugerido !== "" && r.esquema !== r.sugerido
          ? t("protocol.stage.6.summary.scheme-changed", {
              esquema: nombre(r.esquema),
              sugerido: nombre(r.sugerido),
              razon: r.razon,
            })
          : t("protocol.stage.6.summary.scheme", {
              esquema: nombre(r.esquema),
            })}
      </li>
      {(r.unidades === "nuevas" || r.unidades === "conocidas") && (
        <li>{t(`protocol.stage.6.summary.units-${r.unidades}`)}</li>
      )}
      <li>
        {t("protocol.stage.6.summary.sizes", {
          entrenamiento: n(r.entrenamiento),
          prueba: n(r.prueba),
          hueco: n(r.hueco),
          fuera: n(r.fuera),
        })}
      </li>
      {r.corte !== null && r.horizonte !== null && (
        <li>
          {t("protocol.stage.6.summary.cut", {
            corte: r.corte,
            h: r.horizonte,
            unidad:
              r.horizonteUnidad === "dias" || r.horizonteUnidad === "meses"
                ? t(`protocol.stage.6.form.${r.horizonteUnidad}`)
                : "",
          })}
        </li>
      )}
      {r.sello !== null && (
        <li className="font-mono text-xs">
          {t("protocol.stage.6.summary.seal", { sello: huellaCorta(r.sello) })}
        </li>
      )}
      <li>{t("protocol.stage.6.summary.seals", { n: sellos })}</li>
    </ul>
  );
}

function Entrada({
  evidencia,
  cuaderno,
}: {
  evidencia: Evidencia;
  cuaderno: Cuaderno;
}) {
  const { locale, t } = useI18n();
  const vigente =
    ultimaEvidencia(cuaderno, evidencia.etapa)?.seq === evidencia.seq;
  const carga = cuaderno.cargas.find((c) => c.sha256 === evidencia.huella);
  const palabras = {
    si: t("protocol.notebook.yes"),
    no: t("protocol.notebook.no"),
  };
  // Un valor del cuaderno como texto: los nombres cerrados de la app (la forma de la decisión,
  // el orden de las fechas…) en el idioma de la interfaz; lo que escribió el usuario, tal cual.
  const leerValor = (valor: Valor): string => {
    if (typeof valor === "string") {
      const traducido = t(`protocol.value.${valor}`);
      return traducido === `protocol.value.${valor}` ? valor : traducido;
    }
    return valorTexto(valor, palabras);
  };
  const vacio = (valor: Valor) =>
    valor === null ||
    valor === "" ||
    (Array.isArray(valor) && valor.length === 0);
  const filas = [
    ...Object.entries(evidencia.datos.respuestas).map(
      ([id, v]) =>
        [`protocol.stage.${evidencia.etapa}.field.${id}`, v] as const,
    ),
    ...Object.entries(evidencia.datos.chequeos).map(
      ([id, v]) =>
        [`protocol.stage.${evidencia.etapa}.check.${id}`, v] as const,
    ),
  ].filter(([, valor]) => !vacio(valor));
  return (
    <li
      className={`rounded-md border border-hairline p-3 ${vigente ? "bg-surface" : "bg-sunken"}`}
    >
      <p className="text-sm font-medium">
        {t("protocol.notebook.entry", {
          n: evidencia.etapa,
          title: CONTENIDO_ETAPAS[evidencia.etapa].titulo[locale],
        })}
      </p>
      <p className="text-xs text-ink-muted">
        {fecha(evidencia.fecha, locale)}
        {carga &&
          ` · ${t("protocol.notebook.with-data", { name: carga.nombre })}`}
        {!vigente && ` · ${t("protocol.notebook.superseded")}`}
      </p>
      {evidencia.etapa === 4 && <ResumenEtapa4 datos={evidencia.datos} />}
      {evidencia.etapa === 5 && <ResumenEtapa5 datos={evidencia.datos} />}
      {evidencia.etapa === 6 && (
        <ResumenEtapa6
          datos={evidencia.datos}
          sellos={sellosDistintos(
            cuaderno.evidencias
              .filter((e) => e.etapa === 6 && e.seq <= evidencia.seq)
              .map((e) => e.datos),
          )}
        />
      )}
      {evidencia.etapa !== 4 &&
        evidencia.etapa !== 5 &&
        evidencia.etapa !== 6 &&
        filas.length > 0 && (
          <dl className="mt-2 grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            {filas.map(([clave, valor]) => (
              <div key={clave} className="contents">
                <dt className="min-w-0 text-ink-muted [overflow-wrap:anywhere]">
                  {t(clave)}
                </dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">
                  {leerValor(valor)}
                </dd>
              </div>
            ))}
          </dl>
        )}
    </li>
  );
}

export function CuadernoPanel({
  cuaderno,
  guardado,
  importePendiente,
  onExportar,
  onImportar,
  onConfirmarImporte,
  onDescartarImporte,
  onNuevo,
}: {
  cuaderno: Cuaderno;
  /** `null`: este navegador no guarda (memoria); `false`: escribiendo; `true`: guardado. */
  guardado: boolean | null;
  /** Un cuaderno válido importado que espera confirmación para reemplazar el actual. */
  importePendiente: Cuaderno | null;
  onExportar: () => { nombre: string; contenido: string };
  onImportar: (file: File) => void;
  onConfirmarImporte: () => void;
  onDescartarImporte: () => void;
  onNuevo: () => void;
}) {
  const { locale, t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmando, setConfirmando] = useState(false);
  // Los botones que abren un diálogo a donde vuelve el foco al cerrarlo.
  const boton = (id: string) => () =>
    document.querySelector<HTMLElement>(`[data-boton="${id}"]`);

  function exportar() {
    const { nombre, contenido } = onExportar();
    const url = URL.createObjectURL(
      new Blob([contenido], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-labelledby="cuaderno-titulo" className="flex flex-col gap-3">
      <h2 id="cuaderno-titulo" className="text-xl font-semibold tracking-tight">
        {t("protocol.notebook.title")}
      </h2>
      <p className="text-sm text-ink-muted">{t("protocol.notebook.desc")}</p>
      {guardado !== null && (
        <p
          role="status"
          className="text-xs text-ink-muted"
          data-testid="cuaderno-guardado"
        >
          <span aria-hidden="true">{guardado ? "✓ " : "… "}</span>
          {t(guardado ? "protocol.notebook.saved" : "protocol.notebook.saving")}
        </p>
      )}

      {cuaderno.evidencias.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("protocol.notebook.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2" data-testid="cuaderno-evidencias">
          {cuaderno.evidencias.map((evidencia) => (
            <Entrada
              key={evidencia.seq}
              evidencia={evidencia}
              cuaderno={cuaderno}
            />
          ))}
        </ol>
      )}

      {cuaderno.cargas.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">{t("protocol.notebook.loads")}</p>
          <ul className="mt-1 flex flex-col gap-1 font-mono text-xs text-ink-muted">
            {cuaderno.cargas.map((carga) => (
              <li key={`${carga.sha256}-${carga.fecha}`}>
                {t("protocol.notebook.load", {
                  date: fecha(carga.fecha, locale),
                  name: carga.nombre,
                  rows: thousands(carga.filas),
                  hash: huellaCorta(carga.sha256),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button icon="download" onClick={exportar}>
          {t("protocol.notebook.export")}
        </Button>
        <Button
          variant="secondary"
          icon="import"
          data-boton="importar"
          onClick={() => inputRef.current?.click()}
        >
          {t("protocol.notebook.import")}
        </Button>
        <Button
          variant="ghost"
          icon="plus"
          data-boton="nuevo"
          onClick={() => setConfirmando(true)}
        >
          {t("protocol.notebook.new")}
        </Button>
        <input
          ref={inputRef}
          type="file"
          tabIndex={-1}
          aria-hidden
          accept=".json,application/json"
          className="sr-only"
          data-testid="protocolo-importar"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImportar(file);
          }}
        />
      </div>

      {confirmando && (
        <Confirmacion
          testId="protocolo-dialogo-nuevo"
          titulo={t("protocol.notebook.new")}
          cuerpo={<p>{t("protocol.notebook.new-confirm")}</p>}
          onCancelar={() => setConfirmando(false)}
          devolverA={boton("nuevo")}
          acciones={
            <>
              <Button
                icon="check"
                onClick={() => {
                  setConfirmando(false);
                  onNuevo();
                }}
              >
                {t("protocol.notebook.new-yes")}
              </Button>
              <Button
                variant="ghost"
                icon="x"
                data-autofocus
                onClick={() => setConfirmando(false)}
              >
                {t("protocol.notebook.new-no")}
              </Button>
            </>
          }
        />
      )}

      {importePendiente && (
        <Confirmacion
          testId="protocolo-dialogo-importar"
          titulo={t("protocol.notebook.import-confirm.title")}
          cuerpo={
            <p>
              {t("protocol.notebook.import-confirm.body", {
                now: cuaderno.evidencias.length,
                incoming: importePendiente.evidencias.length,
              })}
            </p>
          }
          onCancelar={onDescartarImporte}
          devolverA={boton("importar")}
          acciones={
            <>
              <Button variant="secondary" icon="download" onClick={exportar}>
                {t("protocol.notebook.import-confirm.export-first")}
              </Button>
              <Button icon="import" onClick={onConfirmarImporte}>
                {t("protocol.notebook.import-confirm.yes")}
              </Button>
              <Button
                variant="ghost"
                icon="x"
                data-autofocus
                onClick={onDescartarImporte}
              >
                {t("protocol.notebook.import-confirm.cancel")}
              </Button>
            </>
          }
        />
      )}
    </section>
  );
}

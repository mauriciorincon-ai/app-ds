"use client";

// Protocolo DS (S8, VISION v2.0.0 § 8, ADR 020): el modo lento. Ruta propia (/protocolo),
// fuera del chunk de la portada; sin worker, sin Pyodide y sin IA (regla dura 5).
import Link from "next/link";
import { ETAPA_IDS, ETAPAS_ABIERTAS } from "@/engine/protocolo/ids";
import { useI18n } from "@/i18n/provider";
import { useProtocolo } from "@/lib/protocolo/useProtocolo";
import { Icon } from "@/components/ui";
import { CargaDatos } from "./CargaDatos";
import { CuadernoPanel } from "./CuadernoPanel";
import { Etapas } from "./Etapas";
import { Glosario } from "./Glosario";

export function ProtocoloApp() {
  const { t } = useI18n();
  const p = useProtocolo();

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("protocol.title")}
        </h1>
        <p className="max-w-prose text-ink-muted">
          {t("protocol.subtitle", {
            count: ETAPA_IDS.length,
            ...ETAPAS_ABIERTAS,
          })}
        </p>
        <p className="max-w-prose text-sm text-ink-muted">
          {t("protocol.privacy")}
        </p>
        <Link
          href="/"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-ink underline-offset-2 hover:underline"
        >
          <Icon name="back" />
          {t("protocol.back")}
        </Link>
      </header>

      {!p.listo && (
        <p role="status" className="text-sm text-ink-muted">
          {t("protocol.loading")}
        </p>
      )}
      {p.listo && p.almacen === "memoria" && (
        <p
          role="status"
          className="rounded-md border border-caution/40 p-3 text-sm text-caution"
        >
          {t("protocol.storage.memory")}
        </p>
      )}
      {p.error && (
        <p
          role="alert"
          className="rounded-md border border-caution/40 p-3 text-sm text-caution"
        >
          {t(p.error.clave, p.error.params)}
        </p>
      )}
      {p.aviso && (
        <p role="status" className="text-sm text-ink-muted">
          {t(p.aviso.clave, p.aviso.params)}
        </p>
      )}

      <CargaDatos
        datos={p.datos}
        pendiente={p.pendiente}
        cuaderno={p.cuaderno}
        onArchivo={(file) => void p.cargarArchivo(file)}
        onVersion={p.confirmarVersion}
        onOtro={p.empezarOtro}
        onDescartar={p.descartarPendiente}
      />
      <Etapas
        evaluadas={p.evaluadas}
        cuaderno={p.cuaderno}
        datos={p.datos}
        listo={p.listo}
        onRegistrar={p.registrarEtapa}
      />
      <CuadernoPanel
        cuaderno={p.cuaderno}
        guardado={p.almacen === "indexeddb" ? p.guardando === 0 : null}
        importePendiente={p.importePendiente}
        onExportar={p.exportar}
        onImportar={(file) => void p.importar(file)}
        onConfirmarImporte={p.confirmarImporte}
        onDescartarImporte={p.descartarImporte}
        onNuevo={p.nuevoCuaderno}
      />
      <Glosario />
    </div>
  );
}

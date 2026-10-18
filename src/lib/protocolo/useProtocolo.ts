"use client";

// Protocolo DS (S8, ADR 020): el estado del modo en el navegador. Abre el almacén (IndexedDB
// o memoria), lee el cuaderno guardado con el mismo lector que un archivo importado, carga el
// CSV del usuario (huella SHA-256 de sus bytes; el archivo NO se guarda) y registra etapas
// SOLO a través de la compuerta. No usa `useExperiment`: aquí no hay worker ni Pyodide.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  evaluar,
  registrar,
  type EtapaEvaluada,
  type RechazoRegistro,
} from "@/engine/protocolo/compuerta";
import {
  agregarCarga,
  compararCarga,
  cuadernoVacio,
  tieneEvidenciasConDatos,
  type Carga,
  type Cuaderno,
} from "@/engine/protocolo/cuaderno";
import type { DatosEtapa, EtapaId } from "@/engine/protocolo/etapas";
import { PROTOCOLO_DS } from "@/engine/protocolo/protocolo-ds";
import { MAX_BYTES, parseCsvWithLimits, type CsvTable } from "@/lib/ds/csv";
import {
  recordProtocolStep,
  reportProtocolError,
  type ProtocolOutcome,
} from "@/lib/observability";
import {
  abrirAlmacen,
  type Almacen,
  type TipoAlmacen,
} from "@/lib/protocolo/almacen";
import {
  MAX_PROTOCOL_FILE_BYTES,
  PROTOCOL_FILE_EXTENSION,
  empaquetar,
  leerArchivo,
  leerCuaderno,
  type RechazoArchivo,
} from "@/lib/protocolo/archivo";
import { olvidarApuesta } from "@/lib/protocolo/apuesta";
import { csvLimitParams } from "@/lib/quantity";
import { sha256Hex } from "@/lib/sha256";

export type DatosCargados = { readonly tabla: CsvTable; readonly carga: Carga };

/** Un mensaje para el usuario: clave de i18n + parámetros. */
export type Aviso = {
  readonly clave: string;
  readonly params?: Readonly<Record<string, string | number>>;
};

export type EstadoProtocolo = {
  /** El almacén ya se abrió y el cuaderno guardado ya se leyó. */
  readonly listo: boolean;
  readonly almacen: TipoAlmacen | null;
  readonly cuaderno: Cuaderno;
  readonly datos: DatosCargados | null;
  /** Un archivo distinto del del cuaderno, que espera «es otra versión» o «es otro proyecto». */
  readonly pendiente: DatosCargados | null;
  /** Un cuaderno importado y válido que espera el sí del usuario para reemplazar el actual. */
  readonly importePendiente: Cuaderno | null;
  readonly aviso: Aviso | null;
  readonly error: Aviso | null;
  /** Escrituras al navegador que todavía no terminaron (el «Guardado» solo se dice sin pendientes). */
  readonly guardando: number;
};

const CSV_ERROR: Record<string, string> = {
  empty: "errors.csv-empty",
  "too-large": "errors.csv-too-large",
  "too-many-rows": "errors.csv-too-many-rows",
  ragged: "errors.csv-ragged",
  "semicolon-delimiter": "errors.csv-semicolon",
  "tab-delimiter": "errors.csv-tab",
};

const OUTCOME: Record<RechazoRegistro["tipo"], ProtocolOutcome> = {
  "etapa-desconocida": "unknown-stage",
  "no-construida": "not-built",
  "etapa-cerrada": "closed",
  "sin-datos": "no-data",
  "datos-invalidos": "invalid",
  "criterio-no-cumplido": "criterion-unmet",
};

export function avisoDeRechazoArchivo(rechazo: RechazoArchivo): Aviso {
  switch (rechazo.tipo) {
    case "file-too-large":
      return {
        clave: "protocol.notebook.import-error.too-large",
        params: { mb: MAX_PROTOCOL_FILE_BYTES / (1024 * 1024) },
      };
    case "invalid-json":
      return { clave: "protocol.notebook.import-error.invalid-json" };
    case "invalid-format":
      return {
        clave: "protocol.notebook.import-error.invalid-format",
        params: { field: rechazo.campo },
      };
    case "unsupported-version":
      return {
        clave: "protocol.notebook.import-error.unsupported-version",
        params: { version: rechazo.version },
      };
  }
}

export type AccionesProtocolo = {
  cargarArchivo(file: File): Promise<void>;
  /** El archivo distinto es otra versión de los mismos datos: lo que depende de ellos se re-verifica. */
  confirmarVersion(): void;
  /** El archivo distinto es otro proyecto: cuaderno nuevo (el anterior se reemplaza). */
  empezarOtro(): void;
  descartarPendiente(): void;
  registrarEtapa(etapa: EtapaId, datos: DatosEtapa): RechazoRegistro | null;
  exportar(): { nombre: string; contenido: string };
  /** Lee el archivo; con un cuaderno con entradas, espera `confirmarImporte` antes de reemplazarlo. */
  importar(file: File): Promise<void>;
  confirmarImporte(): void;
  descartarImporte(): void;
  nuevoCuaderno(): void;
};

export function useProtocolo(
  reloj: () => Date = () => new Date(),
): EstadoProtocolo & {
  evaluadas: readonly EtapaEvaluada[];
} & AccionesProtocolo {
  const almacenRef = useRef<Almacen | null>(null);
  const [estado, setEstado] = useState<EstadoProtocolo>(() => ({
    listo: false,
    almacen: null,
    cuaderno: cuadernoVacio(reloj()),
    datos: null,
    pendiente: null,
    importePendiente: null,
    aviso: null,
    error: null,
    guardando: 0,
  }));

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const almacen = await abrirAlmacen();
      almacenRef.current = almacen;
      let guardado: unknown = null;
      try {
        guardado = await almacen.leer();
      } catch {
        guardado = null;
      }
      const lectura =
        guardado === null ? null : leerCuaderno(guardado, PROTOCOLO_DS);
      if (lectura && !lectura.ok) reportProtocolError("storage-unreadable");
      if (!vivo) return;
      setEstado((previo) => ({
        ...previo,
        listo: true,
        almacen: almacen.tipo,
        cuaderno: lectura?.ok ? lectura.cuaderno : previo.cuaderno,
        aviso:
          lectura && !lectura.ok
            ? { clave: "protocol.notebook.unreadable" }
            : previo.aviso,
      }));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /** Cambia el cuaderno y lo guarda (si el navegador no deja, lo dice y sigue en memoria). */
  const guardar = useCallback((cuaderno: Cuaderno) => {
    const almacen = almacenRef.current;
    if (!almacen) return;
    setEstado((previo) => ({ ...previo, guardando: previo.guardando + 1 }));
    const terminar = (fallo: boolean) =>
      setEstado((previo) => ({
        ...previo,
        guardando: Math.max(0, previo.guardando - 1),
        error: fallo
          ? { clave: "protocol.storage.write-failed" }
          : previo.error,
      }));
    almacen.guardar(cuaderno).then(
      () => terminar(false),
      () => {
        reportProtocolError("storage-write");
        terminar(true);
      },
    );
  }, []);

  const aplicarCarga = useCallback(
    (cuaderno: Cuaderno, datos: DatosCargados): Cuaderno => {
      const nuevo = agregarCarga(cuaderno, datos.carga);
      if (nuevo !== cuaderno) guardar(nuevo);
      return nuevo;
    },
    [guardar],
  );

  const cargarArchivo = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        setEstado((p) => ({
          ...p,
          error: { clave: "errors.csv-too-large", params: csvLimitParams() },
        }));
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [huella, texto] = [
        await sha256Hex(bytes),
        new TextDecoder().decode(bytes),
      ];
      const parsed = parseCsvWithLimits(texto);
      if (!parsed.ok) {
        setEstado((p) => ({
          ...p,
          error: {
            clave: CSV_ERROR[parsed.error.kind] ?? "errors.csv-empty",
            params: csvLimitParams(),
          },
        }));
        return;
      }
      const datos: DatosCargados = {
        tabla: parsed.table,
        carga: {
          fecha: reloj().toISOString(),
          sha256: huella,
          nombre: file.name.slice(0, 260),
          filas: parsed.table.rows.length,
          columnas: parsed.table.headers.length,
        },
      };
      setEstado((p) => {
        const comparacion = compararCarga(p.cuaderno, huella);
        if (comparacion === "distinta" && tieneEvidenciasConDatos(p.cuaderno))
          return { ...p, pendiente: datos, error: null };
        return {
          ...p,
          cuaderno: aplicarCarga(p.cuaderno, datos),
          datos,
          pendiente: null,
          error: null,
          aviso:
            comparacion === "misma" ? { clave: "protocol.data.same" } : p.aviso,
        };
      });
    },
    [aplicarCarga, reloj],
  );

  const confirmarVersion = useCallback(() => {
    setEstado((p) =>
      p.pendiente
        ? {
            ...p,
            cuaderno: aplicarCarga(p.cuaderno, p.pendiente),
            datos: p.pendiente,
            pendiente: null,
            aviso: { clave: "protocol.data.new-version" },
          }
        : p,
    );
  }, [aplicarCarga]);

  const empezarOtro = useCallback(() => {
    setEstado((p) => {
      if (!p.pendiente) return p;
      const cuaderno = agregarCarga(cuadernoVacio(reloj()), p.pendiente.carga);
      olvidarApuesta();
      guardar(cuaderno);
      return {
        ...p,
        cuaderno,
        datos: p.pendiente,
        pendiente: null,
        aviso: { clave: "protocol.notebook.started" },
      };
    });
  }, [guardar, reloj]);

  const descartarPendiente = useCallback(() => {
    setEstado((p) => ({ ...p, pendiente: null }));
  }, []);

  // El registro se decide contra el estado vigente (no dentro de un updater): la respuesta
  // —aceptado o el rechazo nombrado— vuelve a quien llamó en el mismo turno.
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  const registrarEtapa = useCallback(
    (etapa: EtapaId, datos: DatosEtapa): RechazoRegistro | null => {
      const actual = estadoRef.current;
      const resultado = registrar(PROTOCOLO_DS, actual.cuaderno, etapa, datos, {
        huella: actual.datos?.carga.sha256 ?? null,
        tabla: actual.datos?.tabla ?? null,
        ahora: reloj(),
      });
      if (!resultado.ok) {
        recordProtocolStep(etapa, OUTCOME[resultado.rechazo.tipo]);
        return resultado.rechazo;
      }
      recordProtocolStep(etapa, "recorded");
      guardar(resultado.cuaderno);
      // Una actualización funcional: `guardar` acaba de sumar su escritura pendiente y un estado
      // armado desde la foto de `actual` la borraría (el «Guardado» saldría antes de tiempo).
      estadoRef.current = {
        ...actual,
        cuaderno: resultado.cuaderno,
        aviso: null,
      };
      setEstado((previo) => ({
        ...previo,
        cuaderno: resultado.cuaderno,
        aviso: null,
      }));
      return null;
    },
    [guardar, reloj],
  );

  const exportar = useCallback(() => {
    const ahora = reloj();
    return {
      nombre: `cuaderno-${ahora.toISOString().slice(0, 10)}${PROTOCOL_FILE_EXTENSION}`,
      contenido: empaquetar(estadoRef.current.cuaderno, ahora),
    };
  }, [reloj]);

  const importar = useCallback(
    async (file: File) => {
      if (file.size > MAX_PROTOCOL_FILE_BYTES) {
        setEstado((p) => ({
          ...p,
          error: avisoDeRechazoArchivo({
            tipo: "file-too-large",
            bytes: file.size,
          }),
        }));
        return;
      }
      const lectura = leerArchivo(await file.text(), PROTOCOLO_DS, file.size);
      if (!lectura.ok) {
        reportProtocolError("import-rejected");
        setEstado((p) => ({
          ...p,
          error: avisoDeRechazoArchivo(lectura.rechazo),
        }));
        return;
      }
      // Un cuaderno con entradas no se reemplaza en silencio (M3 del S8): espera el sí.
      if (estadoRef.current.cuaderno.evidencias.length > 0) {
        setEstado((p) => ({
          ...p,
          importePendiente: lectura.cuaderno,
          error: null,
        }));
        return;
      }
      olvidarApuesta();
      guardar(lectura.cuaderno);
      setEstado((p) => ({
        ...p,
        cuaderno: lectura.cuaderno,
        importePendiente: null,
        error: null,
        aviso: { clave: "protocol.notebook.imported" },
      }));
    },
    [guardar],
  );

  const confirmarImporte = useCallback(() => {
    const entrante = estadoRef.current.importePendiente;
    if (!entrante) return;
    olvidarApuesta();
    guardar(entrante);
    setEstado((p) => ({
      ...p,
      cuaderno: entrante,
      importePendiente: null,
      error: null,
      aviso: { clave: "protocol.notebook.imported" },
    }));
  }, [guardar]);

  const descartarImporte = useCallback(() => {
    setEstado((p) => ({ ...p, importePendiente: null }));
  }, []);

  const nuevoCuaderno = useCallback(() => {
    setEstado((p) => {
      const base = cuadernoVacio(reloj());
      const cuaderno = p.datos ? agregarCarga(base, p.datos.carga) : base;
      olvidarApuesta();
      guardar(cuaderno);
      return { ...p, cuaderno, aviso: { clave: "protocol.notebook.started" } };
    });
  }, [guardar, reloj]);

  const evaluadas = useMemo(
    () =>
      evaluar(
        PROTOCOLO_DS,
        estado.cuaderno,
        estado.datos?.carga.sha256 ?? null,
        estado.datos?.tabla ?? null,
      ),
    [estado.cuaderno, estado.datos],
  );

  return {
    ...estado,
    evaluadas,
    cargarArchivo,
    confirmarVersion,
    empezarOtro,
    descartarPendiente,
    registrarEtapa,
    exportar,
    importar,
    confirmarImporte,
    descartarImporte,
    nuevoCuaderno,
  };
}

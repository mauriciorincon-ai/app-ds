// Protocolo DS (S8, G-Plan 1a, ADR 020): dónde vive el cuaderno entre visitas. En IndexedDB
// del navegador (una base `probeta-protocolo`, un cuaderno «actual»), que sobrevive a cerrar
// la pestaña; si el navegador no la deja abrir (ventana privada, almacenamiento bloqueado),
// en memoria, y la UI avisa «exporta tu cuaderno»: al cerrar la pestaña se pierde.
//
// Regla dura 2: lo guardado vive solo en este navegador y nunca viaja a observabilidad. El
// archivo CSV no se guarda: el usuario lo vuelve a cargar y la huella dice si es el mismo.
// Lo que se lee de vuelta pasa por el mismo lector que un archivo importado (`leerCuaderno`).
import type { Cuaderno } from "@/engine/protocolo/cuaderno";

export type TipoAlmacen = "indexeddb" | "memoria";

export type Almacen = {
  readonly tipo: TipoAlmacen;
  /** Lo guardado, sin validar (quien lee lo pasa por `leerCuaderno`). */
  leer(): Promise<unknown>;
  guardar(cuaderno: Cuaderno): Promise<void>;
  borrar(): Promise<void>;
};

export const DB_NOMBRE = "probeta-protocolo";
const DB_VERSION = 1;
const STORE = "cuadernos";
const CLAVE = "actual";

export function almacenEnMemoria(): Almacen {
  let guardado: Cuaderno | null = null;
  return {
    tipo: "memoria",
    leer: async () => guardado,
    guardar: async (cuaderno) => {
      guardado = cuaderno;
    },
    borrar: async () => {
      guardado = null;
    },
  };
}

function pedir<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function abrirBase(fabrica: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = fabrica.open(DB_NOMBRE, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("indexeddb-blocked"));
  });
}

function almacenIndexedDb(base: IDBDatabase): Almacen {
  const store = (modo: IDBTransactionMode) =>
    base.transaction(STORE, modo).objectStore(STORE);
  return {
    tipo: "indexeddb",
    leer: async () => (await pedir(store("readonly").get(CLAVE))) ?? null,
    guardar: async (cuaderno) => {
      await pedir(store("readwrite").put(cuaderno, CLAVE));
    },
    borrar: async () => {
      await pedir(store("readwrite").delete(CLAVE));
    },
  };
}

/** IndexedDB si el navegador la deja abrir; si no, memoria (y la UI lo dice). */
export async function abrirAlmacen(
  fabrica: IDBFactory | undefined = globalThis.indexedDB,
): Promise<Almacen> {
  if (!fabrica) return almacenEnMemoria();
  try {
    return almacenIndexedDb(await abrirBase(fabrica));
  } catch {
    return almacenEnMemoria();
  }
}

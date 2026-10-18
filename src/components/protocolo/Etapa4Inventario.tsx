"use client";

// Protocolo DS (S9), etapa 4, paso 3: el inventario columna por columna. Por cada una: quién o qué
// la produce (procedencia), cuándo se llena frente al momento de decidir, y si la usas. Las reglas
// salen de una sola fuente (`estadosPermitidos`, en el motor): «usar» solo si existe antes; lo que
// se llena después solo se excluye; lo que no sabes no entrena. Las columnas CON alerta (fuga,
// identificador, cambio fuerte, unidad y fecha, y las que apostaste) se responden una por una; las
// que no tienen ninguna pueden marcarse en bloque, declarándolo, y la declaración queda en el cuaderno.
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ETAPA_4,
  MOMENTOS,
  PROCEDENCIA_MAX,
  datosEtapa4,
  entradaDesdeAnterior,
  estadosPermitidos,
  motivosDeAlerta,
  ordenPorRiesgo,
  type EntradaEtapa4,
  type Hallazgos4,
  type MotivoAlerta,
  type Momento,
} from "@/engine/protocolo/etapa4";
import type { DatosEtapa, Previas } from "@/engine/protocolo/etapas";
import { lista, type Registro } from "@/engine/protocolo/valores";
import { useI18n } from "@/i18n/provider";
import type { ApuestaFija } from "@/lib/protocolo/apuesta";
import type { CsvTable } from "@/lib/ds/csv";
import { Badge, Button, Icon } from "@/components/ui";
import { CampoArea, CampoOpciones, CampoSelect } from "./campos";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";

const k = (clave: string) => `protocol.stage.4.${clave}`;

/** Lo que la pantalla le dice al `role="status"` de la etapa (nada cambia en silencio). */
export type AvisoVivo = {
  readonly clave: string;
  readonly params?: Readonly<Record<string, string | number>>;
};

type Estado4 = {
  procedencia: string[];
  momento: string[];
  estado: string[];
  enBloque: string[];
  /** Lo que había antes de la última acción en bloque, para «Deshacer». */
  previo: null | {
    indices: number[];
    momento: string[];
    estado: string[];
    enBloque: string[];
  };
};

type Accion =
  | { tipo: "procedencia"; i: number; valor: string }
  | {
      tipo: "fila";
      i: number;
      nombre: string;
      momento?: string;
      estado?: string;
    }
  | { tipo: "bloque"; indices: number[]; nombres: string[] }
  | { tipo: "deshacer" };

function inicial(entrada: EntradaEtapa4): Estado4 {
  return {
    procedencia: [...entrada.procedencia],
    momento: [...entrada.momento],
    estado: [...entrada.estado],
    enBloque: [...entrada.enBloque],
    previo: null,
  };
}

function reducir(estado: Estado4, accion: Accion): Estado4 {
  switch (accion.tipo) {
    case "procedencia": {
      const procedencia = [...estado.procedencia];
      procedencia[accion.i] = accion.valor;
      return { ...estado, procedencia };
    }
    case "fila": {
      const momento = [...estado.momento];
      const e = [...estado.estado];
      if (accion.momento !== undefined) momento[accion.i] = accion.momento;
      if (accion.estado !== undefined) e[accion.i] = accion.estado;
      // Responder a mano una columna la saca de lo marcado en bloque.
      return {
        ...estado,
        momento,
        estado: e,
        enBloque: estado.enBloque.filter((c) => c !== accion.nombre),
        previo: null,
      };
    }
    case "bloque": {
      const momento = [...estado.momento];
      const e = [...estado.estado];
      const previo = {
        indices: accion.indices,
        momento: accion.indices.map((i) => estado.momento[i] ?? ""),
        estado: accion.indices.map((i) => estado.estado[i] ?? ""),
        enBloque: estado.enBloque,
      };
      for (const i of accion.indices) {
        momento[i] = "antes";
        e[i] = "usar";
      }
      return {
        ...estado,
        momento,
        estado: e,
        enBloque: [...new Set([...estado.enBloque, ...accion.nombres])],
        previo,
      };
    }
    case "deshacer": {
      if (!estado.previo) return estado;
      const momento = [...estado.momento];
      const e = [...estado.estado];
      estado.previo.indices.forEach((i, n) => {
        momento[i] = estado.previo!.momento[n]!;
        e[i] = estado.previo!.estado[n]!;
      });
      return {
        ...estado,
        momento,
        estado: e,
        enBloque: estado.previo.enBloque,
        previo: null,
      };
    }
  }
}

const GRAVES: ReadonlySet<MotivoAlerta> = new Set([
  "fuga",
  "fuga-vacios",
  "identificador",
  "deriva-alta",
]);

type PropsFila = {
  indice: number;
  nombre: string;
  motivos: readonly MotivoAlerta[];
  alerta: boolean;
  procedencia: string;
  momento: string;
  estado: string;
  onProcedencia: (i: number, valor: string) => void;
  onMomento: (i: number, valor: string) => void;
  onEstado: (i: number, valor: string) => void;
};

const FilaColumna = memo(function FilaColumna({
  indice,
  nombre,
  motivos,
  alerta,
  procedencia,
  momento,
  estado,
  onProcedencia,
  onMomento,
  onEstado,
}: PropsFila) {
  const { t } = useI18n();
  const obligatoria = alerta && estado === "usar" && procedencia.trim() === "";
  const ayudaEstado =
    momento === "antes"
      ? undefined
      : t(
          k(
            momento === "despues"
              ? "row.estado.help.despues"
              : momento === "nose"
                ? "row.estado.help.nose"
                : "row.estado.help.blank",
          ),
        );
  return (
    // El borde va en un contenedor y el nombre en la leyenda: un nombre larguísimo se parte en
    // líneas sin que el borde del fieldset lo atraviese.
    <div className="rounded-md border border-hairline p-3">
      <fieldset
        className="flex min-w-0 flex-col gap-3"
        data-testid="protocolo-columna"
        data-columna={nombre}
      >
        <legend className="mb-3 text-sm font-medium [overflow-wrap:anywhere]">
          {nombre}
        </legend>
        {motivos.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label={t(k("row.alerts"))}>
            {motivos.map((motivo) => (
              <li key={motivo}>
                <Badge tone={GRAVES.has(motivo) ? "caution" : "neutral"}>
                  {GRAVES.has(motivo) ? (
                    <span aria-hidden="true">⚠</span>
                  ) : (
                    <Icon name="info" className="h-3 w-3" />
                  )}
                  {t(k(`alert.${motivo}`))}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <CampoArea
          etiqueta={t(k("row.procedencia.label"))}
          ayuda={t(
            k(
              obligatoria
                ? "row.procedencia.required"
                : alerta
                  ? "row.procedencia.help-alert"
                  : "row.procedencia.help",
            ),
          )}
          filas={2}
          valor={procedencia}
          onCambio={(valor) =>
            onProcedencia(indice, valor.slice(0, PROCEDENCIA_MAX))
          }
        />
        <CampoOpciones<Momento>
          leyenda={t(k("row.momento"))}
          valor={MOMENTOS.find((m) => m === momento) ?? null}
          opciones={MOMENTOS.map((m) => ({
            valor: m,
            texto: t(k(`momento.${m}`)),
          }))}
          onCambio={(valor) => onMomento(indice, valor)}
        />
        <CampoSelect
          etiqueta={t(k("row.estado.label"))}
          ayuda={ayudaEstado}
          valor={estado}
          opciones={[
            { valor: "", texto: t(k("estado.pick")) },
            ...estadosPermitidos(momento).map((e) => ({
              valor: e,
              texto: t(k(`estado.${e}`)),
            })),
          ]}
          onCambio={(valor) => onEstado(indice, valor)}
        />
      </fieldset>
    </div>
  );
});

/** La acción en bloque (G-Plan 2a): solo columnas sin alerta, y con la declaración escrita. */
function PanelBloque({
  nombres,
  hechas,
  puedeDeshacer,
  onAplicar,
  onDeshacer,
}: {
  nombres: readonly string[];
  hechas: number;
  puedeDeshacer: boolean;
  onAplicar: () => void;
  onDeshacer: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [declarado, setDeclarado] = useState(false);
  if (nombres.length === 0 && hechas === 0) return null;
  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-sunken p-3 text-sm"
      data-testid="protocolo-bloque"
    >
      <h5 id={`${id}-titulo`} className="font-medium">
        {t(k("bulk.title"))}
      </h5>
      {nombres.length > 0 && (
        <>
          <p className="text-ink-muted">
            {t(k("bulk.desc"), { count: nombres.length })}
          </p>
          <details>
            <summary className="cursor-pointer py-3">
              {t(k("bulk.names"), { count: nombres.length })}
            </summary>
            <p className="[overflow-wrap:anywhere]">{nombres.join(", ")}</p>
          </details>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={declarado}
              onChange={(event) => setDeclarado(event.target.checked)}
              data-testid="protocolo-bloque-declaro"
            />
            {t(k("bulk.declare"), { count: nombres.length })}
          </label>
          <div>
            <Button
              icon="check"
              disabled={!declarado}
              data-testid="protocolo-bloque-aplicar"
              onClick={() => {
                setDeclarado(false);
                onAplicar();
              }}
            >
              {t(k("bulk.apply"), { count: nombres.length })}
            </Button>
          </div>
        </>
      )}
      {hechas > 0 && (
        <p data-testid="protocolo-bloque-hecho">
          {t(k("bulk.done"), { count: hechas })}
        </p>
      )}
      {puedeDeshacer && (
        <div>
          <Button
            variant="ghost"
            icon="retry"
            data-testid="protocolo-bloque-deshacer"
            onClick={() => {
              setDeclarado(false);
              onDeshacer();
            }}
          >
            {t(k("bulk.undo"))}
          </Button>
        </div>
      )}
    </section>
  );
}

export function Inventario({
  tabla,
  h,
  chequeos,
  apuesta,
  previas,
  anterior,
  onAviso,
  onRegistrar,
}: {
  tabla: CsvTable;
  h: Hallazgos4;
  chequeos: Registro;
  apuesta: ApuestaFija;
  previas: Previas;
  anterior: DatosEtapa | null;
  onAviso: (aviso: AvisoVivo | null) => void;
  onRegistrar: PropsFormulario["onRegistrar"];
}) {
  const { t } = useI18n();
  const id = useId();
  const columnas = h.columnas;
  const alertas = useMemo(
    () => new Set(lista(chequeos, "alertas") ?? []),
    [chequeos],
  );
  const [state, dispatch] = useReducer(reducir, undefined, () =>
    inicial(entradaDesdeAnterior(anterior, columnas, [...alertas])),
  );
  const ultimo = useRef(state);
  useEffect(() => {
    ultimo.current = state;
  });
  const [abierto, setAbierto] = useState(false);

  // El orden por riesgo se calcula UNA vez: responder no reordena la lista bajo tus manos.
  const orden = useMemo(() => {
    const cola = new Map<string, number[]>();
    columnas.forEach((c, i) => cola.set(c, [...(cola.get(c) ?? []), i]));
    return ordenPorRiesgo(chequeos).map((c) => cola.get(c)!.shift()!);
  }, [columnas, chequeos]);
  const motivos = useMemo(
    () => columnas.map((c) => motivosDeAlerta(chequeos, apuesta.apuesta, c)),
    [columnas, chequeos, apuesta],
  );

  const onProcedencia = useCallback(
    (i: number, valor: string) => dispatch({ tipo: "procedencia", i, valor }),
    [],
  );
  const onMomento = useCallback(
    (i: number, momento: string) => {
      const actual = ultimo.current.estado[i] ?? "";
      const permitido =
        actual === "" || estadosPermitidos(momento).some((e) => e === actual);
      // «Después» solo admite «excluir» (G-Plan 1a); «no sé» no admite «usar». Se dice en voz alta.
      const estado =
        momento === "despues" ? "excluir" : permitido ? actual : "nose";
      const cambio = estado !== actual;
      dispatch({ tipo: "fila", i, nombre: columnas[i]!, momento, estado });
      onAviso(
        cambio
          ? {
              clave: momento === "despues" ? "auto.despues" : "auto.nose",
              params: { columna: columnas[i]! },
            }
          : null,
      );
    },
    [columnas, onAviso],
  );
  const onEstado = useCallback(
    (i: number, estado: string) => {
      dispatch({ tipo: "fila", i, nombre: columnas[i]!, estado });
      onAviso(null);
    },
    [columnas, onAviso],
  );

  const pendientes = useMemo(
    () =>
      columnas
        .map((_, i) => i)
        .filter(
          (i) =>
            !alertas.has(columnas[i]!) &&
            state.momento[i] === "" &&
            state.estado[i] === "",
        ),
    [columnas, alertas, state.momento, state.estado],
  );

  const entrada: EntradaEtapa4 = useMemo(
    () => ({
      apuesta: apuesta.apuesta,
      ninguna: apuesta.ninguna,
      procedencia: state.procedencia,
      momento: state.momento,
      estado: state.estado,
      // Solo lo que sigue siendo «sin alerta, antes y usar»: lo respondido a mano ya salió.
      enBloque: state.enBloque.filter((c) => {
        const i = columnas.indexOf(c);
        return (
          i >= 0 &&
          !alertas.has(c) &&
          state.momento[i] === "antes" &&
          state.estado[i] === "usar"
        );
      }),
    }),
    [apuesta, state, columnas, alertas],
  );
  const registrado = useMemo(
    () => datosEtapa4(tabla, entrada, previas),
    [tabla, entrada, previas],
  );
  const trampas = useMemo(
    () => ETAPA_4.trampas(registrado, previas),
    [registrado, previas],
  );

  const conAlerta = orden.filter((i) => alertas.has(columnas[i]!));
  const sinAlerta = orden.filter((i) => !alertas.has(columnas[i]!));
  const sinEstado = state.estado.filter((e) => e === "").length;
  const cuenta = (e: string) => state.estado.filter((x) => x === e).length;

  const fila = (i: number) => (
    <FilaColumna
      key={i}
      indice={i}
      nombre={columnas[i]!}
      motivos={motivos[i]!}
      alerta={alertas.has(columnas[i]!)}
      procedencia={state.procedencia[i] ?? ""}
      momento={state.momento[i] ?? ""}
      estado={state.estado[i] ?? ""}
      onProcedencia={onProcedencia}
      onMomento={onMomento}
      onEstado={onEstado}
    />
  );

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3">
      <h4 id={`${id}-titulo`} className="font-semibold">
        {t(k("step.inventory.title"))}
      </h4>
      <p className="text-sm text-ink-muted">{t(k("inv.intro"))}</p>

      <PanelBloque
        nombres={pendientes.map((i) => columnas[i]!)}
        hechas={entrada.enBloque.length}
        puedeDeshacer={state.previo !== null}
        onAplicar={() => {
          dispatch({
            tipo: "bloque",
            indices: pendientes,
            nombres: pendientes.map((i) => columnas[i]!),
          });
          onAviso({
            clave: "bulk.applied",
            params: { count: pendientes.length },
          });
        }}
        onDeshacer={() => {
          dispatch({ tipo: "deshacer" });
          onAviso({ clave: "bulk.undone" });
        }}
      />

      {conAlerta.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium" data-testid="protocolo-con-alerta">
            {t(k("inv.alerts"), { count: conAlerta.length })}
          </p>
          {conAlerta.map(fila)}
        </div>
      )}

      {sinAlerta.length > 0 && (
        <details
          open={abierto}
          onToggle={(event) => setAbierto(event.currentTarget.open)}
          data-testid="protocolo-sin-alerta"
        >
          <summary className="cursor-pointer py-3 text-sm font-medium">
            {t(k("inv.details"), { n: sinAlerta.length })}
          </summary>
          {abierto && (
            <div className="mt-2 flex flex-col gap-3">
              {sinAlerta.map(fila)}
            </div>
          )}
        </details>
      )}

      <p className="text-sm" data-testid="protocolo-progreso">
        {sinEstado > 0
          ? t(k("inv.progress.missing"), {
              count: sinEstado,
              total: columnas.length,
            })
          : t(k("inv.progress.done"), {
              usar: cuenta("usar"),
              excluir: cuenta("excluir"),
              nose: cuenta("nose"),
            })}
      </p>
      <Trampas etapa={4} trampas={trampas} />
      <Registrar etapa={4} onClick={() => onRegistrar(registrado)} />
    </section>
  );
}

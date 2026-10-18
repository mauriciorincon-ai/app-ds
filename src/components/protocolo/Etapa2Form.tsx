"use client";

// Protocolo DS (S8), etapa 2: el objetivo, la unidad y el momento. Mira TUS columnas: la app
// propone con E1 qué tarea es la columna elegida, cuenta las filas por unidad y lee las fechas,
// y pregunta lo que no puede saber (qué valor es «hay que actuar», cuál es la unidad, cuándo se
// conoce el objetivo). Las trampas se calculan en tus datos antes de registrar.
import { useMemo, useState } from "react";
import { matchTask } from "@/engine/despacho";
import { profileColumn } from "@/lib/ds/csv";
import {
  ETAPA_2,
  compatible,
  datosEtapa2,
  type EntradaEtapa2,
} from "@/engine/protocolo/etapa2";
import { formaDe } from "@/engine/protocolo/etapa1";
import { leerFechas } from "@/engine/protocolo/fechas";
import { indiceDe, perfilObjetivo, valoresDe } from "@/engine/protocolo/tabla";
import { texto } from "@/engine/protocolo/valores";
import { useI18n } from "@/i18n/provider";
import { thousands } from "@/lib/quantity";
import {
  CampoOpciones,
  CampoSelect,
  CampoTexto,
  type OpcionSelect,
} from "./campos";
import { Registrar, Trampas, type PropsFormulario } from "./formulario-base";

const SIN_ELEGIR = "";
const NINGUNO = "__ninguno__";

export function Etapa2Form({
  datos,
  anterior,
  previas,
  onRegistrar,
}: PropsFormulario) {
  const { t } = useI18n();
  const etapa1 = previas[1];
  const forma = etapa1 ? formaDe(etapa1.respuestas) : null;
  const previa = anterior?.respuestas;

  const [objetivoCrudo, setObjetivo] = useState<string>(() => {
    if (!previa) return SIN_ELEGIR;
    return previa.objetivo === null
      ? NINGUNO
      : (texto(previa, "objetivo") ?? SIN_ELEGIR);
  });
  const [positivo, setPositivo] = useState(
    texto(previa ?? {}, "positivo") ?? "",
  );
  const [unidadTipo, setUnidadTipo] = useState<"fila" | "columna">(
    previa?.unidad === "columna" ? "columna" : "fila",
  );
  const [unidadColumnaCruda, setUnidadColumna] = useState(
    texto(previa ?? {}, "unidad_columna") ?? "",
  );
  const [momentoTipo, setMomentoTipo] = useState<"columna" | "texto">(
    previa?.momento === "texto" ? "texto" : "columna",
  );
  const [momentoColumnaCruda, setMomentoColumna] = useState(
    texto(previa ?? {}, "momento_columna") ?? "",
  );
  const [momentoTexto, setMomentoTexto] = useState(
    texto(previa ?? {}, "momento_texto") ?? "",
  );
  const [orden, setOrden] = useState<"dia-mes" | "mes-dia" | null>(
    previa?.orden_fecha === "dia-mes" || previa?.orden_fecha === "mes-dia"
      ? previa.orden_fecha
      : null,
  );

  const tabla = datos?.tabla ?? null;
  // Si se cargó otra versión de los datos, lo elegido antes puede apuntar a una columna que este
  // archivo no tiene: esa elección no cuenta (y el select vuelve a «Elige…»).
  const existe = (nombre: string) => tabla?.headers.includes(nombre) ?? false;
  const objetivo =
    objetivoCrudo === NINGUNO || existe(objetivoCrudo)
      ? objetivoCrudo
      : SIN_ELEGIR;
  const unidadColumna = existe(unidadColumnaCruda) ? unidadColumnaCruda : "";
  const momentoColumna = existe(momentoColumnaCruda) ? momentoColumnaCruda : "";
  const columnas = useMemo(
    () =>
      tabla
        ? tabla.headers.map((nombre, i) => ({
            nombre,
            perfil: profileColumn(
              nombre,
              tabla.rows.map((fila) => fila[i]!),
            ),
          }))
        : [],
    [tabla],
  );
  // Las que parecen fecha, primero.
  const columnasFecha = useMemo(
    () =>
      [...columnas].sort(
        (a, b) =>
          Number(b.perfil.looksLikeDate) - Number(a.perfil.looksLikeDate),
      ),
    [columnas],
  );

  const elegida =
    objetivo !== SIN_ELEGIR && objetivo !== NINGUNO ? objetivo : null;
  const perfil = tabla && elegida ? perfilObjetivo(tabla, elegida) : null;
  const clasesDelDato = perfil?.clases ? Object.keys(perfil.clases) : [];
  const lecturaFechas =
    tabla &&
    momentoTipo === "columna" &&
    momentoColumna !== "" &&
    indiceDe(tabla, momentoColumna) >= 0
      ? leerFechas(valoresDe(tabla, momentoColumna), orden)
      : null;

  const entrada: EntradaEtapa2 | null =
    objetivo === SIN_ELEGIR
      ? null
      : {
          objetivo: objetivo === NINGUNO ? null : objetivo,
          positivo,
          unidadColumna:
            unidadTipo === "columna" && unidadColumna !== ""
              ? unidadColumna
              : null,
          momentoColumna:
            momentoTipo === "columna" && momentoColumna !== ""
              ? momentoColumna
              : null,
          momentoTexto,
          ordenFecha: orden,
        };

  const calculo = useMemo(
    () =>
      tabla && etapa1 && entrada ? datosEtapa2(tabla, entrada, etapa1) : null,
    // `entrada` se rearma en cada render; sus partes son las que importan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      tabla,
      etapa1,
      objetivo,
      positivo,
      unidadTipo,
      unidadColumna,
      momentoTipo,
      momentoColumna,
      momentoTexto,
      orden,
    ],
  );
  const trampas =
    calculo && entrada?.objetivo ? ETAPA_2.trampas(calculo, previas) : [];

  if (!tabla || !etapa1) {
    return (
      <p className="text-sm text-ink-muted">
        {t("protocol.stage.2.need-data")}
      </p>
    );
  }

  const opcionesColumna = (vacia: string): OpcionSelect[] => [
    { valor: "", texto: vacia },
    ...columnas.map((c) => ({ valor: c.nombre, texto: c.nombre })),
  ];
  const incompatible =
    perfil && forma ? !compatible(forma, perfil.deteccion.task) : false;
  const opcionesOrden = [
    { valor: "dia-mes" as const, texto: t("protocol.stage.2.orden.dia-mes") },
    { valor: "mes-dia" as const, texto: t("protocol.stage.2.orden.mes-dia") },
  ];
  const pideActuar = forma
    ? matchTask(forma, {
        binaria: () => true,
        multiclase: () => false,
        numerica: () => false,
      })
    : false;

  return (
    <div className="flex flex-col gap-4">
      <CampoSelect
        etiqueta={t("protocol.stage.2.field.objetivo")}
        ayuda={t("protocol.stage.2.help.objetivo")}
        valor={objetivo}
        opciones={[
          { valor: SIN_ELEGIR, texto: t("protocol.stage.2.pick") },
          ...columnas.map((c) => ({ valor: c.nombre, texto: c.nombre })),
          { valor: NINGUNO, texto: t("protocol.stage.2.no-target") },
        ]}
        onCambio={setObjetivo}
      />

      {perfil && (
        <p className="text-sm" data-testid="protocolo-deteccion">
          {t(`protocol.stage.2.detected.${perfil.deteccion.reason}`, {
            n: perfil.deteccion.distinct,
          })}{" "}
          {incompatible && forma && (
            <span className="text-caution">
              {t("protocol.stage.2.mismatch", {
                forma: t(`protocol.stage.1.forma.${forma}`),
              })}
            </span>
          )}
        </p>
      )}

      {elegida && forma && perfil && !incompatible && (
        <>
          {pideActuar && clasesDelDato.length === 2 && (
            <CampoSelect
              etiqueta={t("protocol.stage.2.field.positivo")}
              ayuda={t("protocol.stage.2.help.positivo")}
              valor={positivo}
              opciones={[
                { valor: "", texto: t("protocol.stage.2.pick") },
                ...clasesDelDato.map((c) => ({ valor: c, texto: c })),
              ]}
              onCambio={setPositivo}
            />
          )}

          <CampoOpciones
            leyenda={t("protocol.stage.2.field.unidad")}
            ayuda={t("protocol.stage.2.help.unidad")}
            valor={unidadTipo}
            opciones={[
              { valor: "fila", texto: t("protocol.stage.2.unidad.fila") },
              { valor: "columna", texto: t("protocol.stage.2.unidad.columna") },
            ]}
            onCambio={setUnidadTipo}
          />
          {unidadTipo === "columna" && (
            <CampoSelect
              etiqueta={t("protocol.stage.2.field.unidad_columna")}
              valor={unidadColumna}
              opciones={opcionesColumna(t("protocol.stage.2.pick"))}
              onCambio={setUnidadColumna}
            />
          )}

          <CampoOpciones
            leyenda={t("protocol.stage.2.field.momento")}
            ayuda={t("protocol.stage.2.help.momento")}
            valor={momentoTipo}
            opciones={[
              {
                valor: "columna",
                texto: t("protocol.stage.2.momento.columna"),
              },
              { valor: "texto", texto: t("protocol.stage.2.momento.texto") },
            ]}
            onCambio={setMomentoTipo}
          />
          {momentoTipo === "columna" ? (
            <>
              <CampoSelect
                etiqueta={t("protocol.stage.2.field.momento_columna")}
                valor={momentoColumna}
                opciones={[
                  { valor: "", texto: t("protocol.stage.2.pick") },
                  ...columnasFecha.map((c) => ({
                    valor: c.nombre,
                    texto: c.perfil.looksLikeDate
                      ? `${c.nombre} · ${t("protocol.stage.2.looks-date")}`
                      : c.nombre,
                  })),
                ]}
                onCambio={setMomentoColumna}
              />
              {lecturaFechas?.tipo === "ambigua" && (
                <CampoOpciones
                  leyenda={t("protocol.stage.2.field.orden_fecha")}
                  ayuda={t("protocol.stage.2.help.orden_fecha")}
                  valor={orden}
                  opciones={opcionesOrden}
                  onCambio={setOrden}
                />
              )}
              {lecturaFechas && (
                <p className="text-sm" data-testid="protocolo-fechas">
                  {lecturaFechas.tipo === "leida"
                    ? t("protocol.stage.2.dates.read", {
                        n: thousands(lecturaFechas.leidas),
                        min: lecturaFechas.minimo,
                        max: lecturaFechas.maximo,
                        bad: thousands(lecturaFechas.sinLeer),
                        empty: thousands(lecturaFechas.vacias),
                      })
                    : t(`protocol.stage.2.dates.${lecturaFechas.tipo}`)}
                </p>
              )}
            </>
          ) : (
            <CampoTexto
              etiqueta={t("protocol.stage.2.field.momento_texto")}
              ayuda={t("protocol.stage.2.help.momento_texto")}
              valor={momentoTexto}
              onCambio={setMomentoTexto}
            />
          )}

          {calculo && (
            <p
              className="text-sm text-ink-muted"
              data-testid="protocolo-resumen2"
            >
              {t("protocol.stage.2.summary", {
                rows: thousands(Number(calculo.chequeos.filas_utiles ?? 0)),
                empty: thousands(Number(calculo.chequeos.objetivo_vacios ?? 0)),
              })}
            </p>
          )}
          <Trampas etapa={2} trampas={trampas} />
        </>
      )}

      <Registrar
        etapa={2}
        deshabilitado={entrada === null}
        onClick={() => (calculo ? onRegistrar(calculo) : null)}
      />
    </div>
  );
}

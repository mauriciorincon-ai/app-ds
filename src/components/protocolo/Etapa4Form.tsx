"use client";

// Protocolo DS (S9), etapa 4 — ¿existe al decidir?, en tres pasos que no se saltan:
//  1. TU APUESTA: marcas las columnas que crees que filtran el resultado, o «ninguna». Mientras
//     no la fijes, NADA que dependa de lo que encontró el código se monta (ni se calcula): ni los
//     hallazgos, ni el orden por riesgo, ni las insignias. Sin apuesta no hay revelación.
//  2. LO QUE ENCONTRÓ LA APP, con la comparación contra tu apuesta. La apuesta queda fija (y se
//     recuerda mientras dure la pestaña: recargar o cancelar «Corregir» no deja apostar de nuevo).
//  3. EL INVENTARIO: por columna, quién la produce, cuándo se llena frente al momento de decidir
//     y si la usas. Lo que se llena después solo puede excluirse; lo que no sabes no entrena.
// Un solo `role="status"` siempre montado anuncia lo que la pantalla cambia por su cuenta.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  chequeos4,
  hallazgos4,
  type Hallazgos4,
} from "@/engine/protocolo/etapa4";
import type { DatosEtapa } from "@/engine/protocolo/etapas";
import { booleano, lista, texto } from "@/engine/protocolo/valores";
import { useI18n } from "@/i18n/provider";
import {
  claveApuesta,
  fijarApuesta,
  leerApuestaFija,
  type ApuestaFija,
} from "@/lib/protocolo/apuesta";
import type { DatosCargados } from "@/lib/protocolo/useProtocolo";
import { Button, Icon } from "@/components/ui";
import { CampoCasillas, CampoOpciones } from "./campos";
import { type PropsFormulario } from "./formulario-base";
import { Inventario, type AvisoVivo } from "./Etapa4Inventario";
import { Revelacion } from "./Etapa4Revelacion";

type Fase = "apuesta" | "calculando" | "revelada";
type Modo = "algunas" | "ninguna";

const k = (clave: string) => `protocol.stage.4.${clave}`;

/** Corre `fn` DESPUÉS de que el navegador pintó (el cálculo de un archivo grande bloquea el hilo). */
function despuesDePintar(fn: () => void): () => void {
  if (typeof requestAnimationFrame !== "function") {
    const timer = setTimeout(fn, 0);
    return () => clearTimeout(timer);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(fn, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (timer !== undefined) clearTimeout(timer);
  };
}

/** La apuesta con la que se abre: la ya registrada (corregir) o la que quedó fija en esta pestaña. */
function apuestaInicial(
  anterior: DatosEtapa | null,
  clave: string,
  columnas: readonly string[],
): ApuestaFija | null {
  if (anterior) {
    const apuesta = lista(anterior.respuestas, "apuesta");
    const ninguna = booleano(anterior.respuestas, "apuesta_ninguna");
    if (apuesta && ninguna !== null) {
      const validas = apuesta.filter((c) => columnas.includes(c));
      if (ninguna === (validas.length === 0))
        return { apuesta: validas, ninguna };
    }
  }
  return leerApuestaFija(clave);
}

export function Etapa4Form(props: PropsFormulario) {
  const { t } = useI18n();
  const { datos, previas } = props;
  if (!datos || !previas[1] || !previas[2] || !previas[3]) {
    return <p className="text-sm text-ink-muted">{t(k("need-data"))}</p>;
  }
  // Otro archivo, u otras respuestas de las etapas 1–3, son otra situación: la pantalla vuelve a empezar.
  const clave = claveApuesta(datos.carga.sha256, previas);
  return <Etapa4Contenido key={clave} {...props} datos={datos} clave={clave} />;
}

function Etapa4Contenido({
  datos,
  anterior,
  previas,
  onRegistrar,
  clave,
}: PropsFormulario & { datos: DatosCargados; clave: string }) {
  const { t } = useI18n();
  const id = useId();
  const tabla = datos.tabla;
  const objetivo = texto(previas[2]?.respuestas ?? {}, "objetivo");
  const columnas = useMemo(
    () => tabla.headers.filter((c) => c !== objetivo),
    [tabla, objetivo],
  );

  const [fija, setFija] = useState<ApuestaFija | null>(() =>
    apuestaInicial(anterior, clave, columnas),
  );
  const [fase, setFase] = useState<Fase>(fija ? "calculando" : "apuesta");
  const [modo, setModo] = useState<Modo | null>(null);
  const [marcadas, setMarcadas] = useState<readonly string[]>([]);
  const [h, setH] = useState<Hallazgos4 | null>(null);
  const [aviso, setAviso] = useState<AvisoVivo | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const enfocar = useRef(false);
  // Las respuestas de las etapas 1–3 no cambian durante la vida de esta pantalla (la `key`
  // las incluye): se toma la foto del primer render para no reiniciar el cálculo en cada render.
  const [previasFijas] = useState(previas);

  useEffect(() => {
    if (fase !== "calculando") return;
    return despuesDePintar(() => {
      setH(hallazgos4(tabla, previasFijas));
      setFase("revelada");
    });
  }, [fase, tabla, previasFijas]);

  useEffect(() => {
    if (fase === "revelada" && enfocar.current) {
      enfocar.current = false;
      tituloRef.current?.focus();
    }
  }, [fase]);

  const chequeos = useMemo(
    () => (h && fija ? chequeos4(h, fija.apuesta) : null),
    [h, fija],
  );

  const motivoApagado =
    modo === null
      ? "bet.why-off.mode"
      : modo === "algunas" && marcadas.length === 0
        ? "bet.why-off.some"
        : null;

  function revelar() {
    if (motivoApagado !== null || modo === null) return;
    const apuesta: ApuestaFija = {
      apuesta:
        modo === "algunas" ? columnas.filter((c) => marcadas.includes(c)) : [],
      ninguna: modo === "ninguna",
    };
    fijarApuesta(clave, apuesta);
    enfocar.current = true;
    setFija(apuesta);
    setFase("calculando");
  }

  const estadoVivo =
    fase === "calculando"
      ? t(k("computing"))
      : aviso
        ? t(k(aviso.clave), aviso.params)
        : "";

  return (
    <div className="flex flex-col gap-4">
      <p
        role="status"
        data-testid="protocolo-estado4"
        className="min-h-5 text-sm text-ink-muted"
      >
        {estadoVivo}
      </p>

      {fase === "apuesta" && (
        <section
          aria-labelledby={`${id}-apuesta`}
          className="flex flex-col gap-3"
        >
          <h4 id={`${id}-apuesta`} className="font-semibold">
            {t(k("step.bet.title"))}
          </h4>
          <p className="text-sm text-ink-muted">{t(k("bet.intro"))}</p>
          <CampoOpciones<Modo>
            leyenda={t(k("bet.mode.legend"))}
            valor={modo}
            opciones={[
              { valor: "algunas", texto: t(k("bet.mode.some")) },
              { valor: "ninguna", texto: t(k("bet.mode.none")) },
            ]}
            onCambio={setModo}
          />
          {modo === "algunas" && (
            <CampoCasillas
              leyenda={t(k("bet.pick.legend"))}
              ayuda={t(k("bet.pick.help"), { count: marcadas.length })}
              opciones={columnas}
              marcadas={marcadas}
              onCambio={(columna, marcada) =>
                setMarcadas((previas_) =>
                  marcada
                    ? [...previas_, columna]
                    : previas_.filter((c) => c !== columna),
                )
              }
            />
          )}
          {motivoApagado !== null && (
            <p id={`${id}-por-que`} className="text-xs text-ink-muted">
              {t(k(motivoApagado))}
            </p>
          )}
          <div>
            <Button
              icon="eye"
              disabled={motivoApagado !== null}
              aria-describedby={
                motivoApagado !== null ? `${id}-por-que` : undefined
              }
              data-testid="protocolo-revelar"
              onClick={revelar}
            >
              {t(k("bet.reveal"))}
            </Button>
          </div>
        </section>
      )}

      {fase !== "apuesta" && fija && (
        <p
          className="flex items-start gap-2 text-sm"
          data-testid="protocolo-apuesta-fija"
        >
          <Icon name="lock" className="mt-0.5" />
          <span className="[overflow-wrap:anywhere]">
            {fija.ninguna
              ? t(k("bet.locked-none"))
              : t(k("bet.locked"), { list: fija.apuesta.join(", ") })}
          </span>
        </p>
      )}

      {fase === "revelada" && fija && (
        <>
          {h && chequeos ? (
            <>
              <Revelacion
                h={h}
                chequeos={chequeos}
                tituloRef={tituloRef}
                idTitulo={`${id}-revelacion`}
              />
              <Inventario
                tabla={tabla}
                h={h}
                chequeos={chequeos}
                apuesta={fija}
                previas={previasFijas}
                anterior={anterior}
                onAviso={setAviso}
                onRegistrar={onRegistrar}
              />
            </>
          ) : (
            <p
              className="text-sm text-caution"
              data-testid="protocolo-sin-hallazgos"
            >
              {t(k("no-findings"))}
            </p>
          )}
        </>
      )}
    </div>
  );
}

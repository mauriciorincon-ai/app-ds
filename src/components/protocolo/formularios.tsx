"use client";

// Protocolo DS (S8, ADR 020): el registro de formularios de las etapas construidas. Sumar una
// etapa es sumar su definición en src/engine/protocolo/protocolo-ds.ts y su formulario aquí; las
// que no están en este mapa no abren (la tarjeta lo dice).
import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import type { EtapaId } from "@/engine/protocolo/ids";
import { Etapa1Form } from "./Etapa1Form";
import { Etapa2Form } from "./Etapa2Form";
import { Etapa3Form } from "./Etapa3Form";
import type { PropsFormulario } from "./formulario-base";

// S10 (la CI mide el peso de /protocolo sin .env.local: 311.009 B frente a 307.200 de presupuesto):
// los formularios de las etapas 4 y 5 son grandes y no se ven hasta abrir su etapa. Se cargan al
// abrirla, así la página inicial queda dentro de su presupuesto.
const Etapa4Form = dynamic(() =>
  import("./Etapa4Form").then((m) => m.Etapa4Form),
);
const Etapa5Form = dynamic(() =>
  import("./Etapa5Form").then((m) => m.Etapa5Form),
);
// S11: la etapa 6, igual que la 4 y la 5.
const Etapa6Form = dynamic(() =>
  import("./Etapa6Form").then((m) => m.Etapa6Form),
);
// S12: la etapa 7, con su worker de Pyodide y el armado del envío (encarrilador, ancho estimado).
const Etapa7Form = dynamic(() =>
  import("./Etapa7Form").then((m) => m.Etapa7Form),
);
// S13: la etapa 8, con el worker que abre la prueba y el envío que la lleva.
const Etapa8Form = dynamic(() =>
  import("./Etapa8Form").then((m) => m.Etapa8Form),
);

export const FORMULARIOS: Readonly<
  Partial<Record<EtapaId, ComponentType<PropsFormulario>>>
> = {
  1: Etapa1Form,
  2: Etapa2Form,
  3: Etapa3Form,
  4: Etapa4Form,
  5: Etapa5Form,
  6: Etapa6Form,
  7: Etapa7Form,
  8: Etapa8Form,
};

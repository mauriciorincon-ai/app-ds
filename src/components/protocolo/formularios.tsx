"use client";

// Protocolo DS (S8, ADR 020): el registro de formularios de las etapas construidas. Sumar una
// etapa es sumar su definición en src/engine/protocolo/protocolo-ds.ts y su formulario aquí; las
// que no están en este mapa no abren (la tarjeta lo dice).
import type { ComponentType } from "react";
import type { EtapaId } from "@/engine/protocolo/ids";
import { Etapa1Form } from "./Etapa1Form";
import { Etapa2Form } from "./Etapa2Form";
import { Etapa3Form } from "./Etapa3Form";
import { Etapa4Form } from "./Etapa4Form";
import { Etapa5Form } from "./Etapa5Form";
import type { PropsFormulario } from "./formulario-base";

export const FORMULARIOS: Readonly<
  Partial<Record<EtapaId, ComponentType<PropsFormulario>>>
> = {
  1: Etapa1Form,
  2: Etapa2Form,
  3: Etapa3Form,
  4: Etapa4Form,
  5: Etapa5Form,
};

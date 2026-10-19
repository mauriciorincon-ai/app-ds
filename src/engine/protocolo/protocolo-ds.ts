// Protocolo DS (S8, ADR 020): las diez etapas del modo, en orden. Las construidas (1–3 en el S8, 4 en el S9, 5 en el S10, 6 en el S11)
// reemplazan a su entrada de ETAPAS_BASE; las demás se ven con su criterio y no abren.
import { ETAPA_1 } from "./etapa1";
import { ETAPA_2 } from "./etapa2";
import { ETAPA_3 } from "./etapa3";
import { ETAPA_4 } from "./etapa4";
import { ETAPA_5 } from "./etapa5";
import { ETAPA_6 } from "./etapa6";
import { ETAPA_7 } from "./etapa7";
import {
  ETAPA_IDS,
  ETAPAS_BASE,
  type DefinicionEtapa,
  type DefinicionProtocolo,
  type EtapaId,
} from "./etapas";

const CONSTRUIDAS: Readonly<Partial<Record<EtapaId, DefinicionEtapa>>> = {
  1: ETAPA_1,
  2: ETAPA_2,
  3: ETAPA_3,
  4: ETAPA_4,
  5: ETAPA_5,
  6: ETAPA_6,
  7: ETAPA_7,
};

export const PROTOCOLO_DS: DefinicionProtocolo = ETAPA_IDS.map(
  (id) => CONSTRUIDAS[id] ?? ETAPAS_BASE[id],
);

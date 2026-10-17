// Protocolo DS (S8, ADR 020): las diez etapas del modo, en orden. Las construidas
// reemplazan a su entrada de ETAPAS_BASE; las demás se ven con su criterio y no abren.
import { ETAPA_IDS, ETAPAS_BASE, type DefinicionProtocolo } from "./etapas";

export const PROTOCOLO_DS: DefinicionProtocolo = ETAPA_IDS.map(
  (id) => ETAPAS_BASE[id],
);

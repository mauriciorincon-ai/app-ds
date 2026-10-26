// Los textos del pronóstico (S20): viajan con el chunk del panel, no con el diccionario de la página. Los dos idiomas.
import type { TextosEtapa } from "@/i18n/textos-etapa";
import en from "../../../messages/pronostico.en.json";
import es from "../../../messages/pronostico.es.json";

export const TEXTOS_PRONOSTICO: TextosEtapa = { es, en };

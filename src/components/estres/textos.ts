// Los textos de la prueba de estrés (S17): viajan con el chunk del panel y de la lectura de la etapa 8, no con el
// diccionario de la página (el peso inicial de `/` y de `/protocolo` no crece). Los dos idiomas, como las fichas.
import type { TextosEtapa } from "@/i18n/textos-etapa";
import en from "../../../messages/estres.en.json";
import es from "../../../messages/estres.es.json";

export const TEXTOS_ESTRES: TextosEtapa = { es, en };

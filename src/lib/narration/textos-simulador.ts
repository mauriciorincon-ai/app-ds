// Los textos del simulador «¿qué pasaría si?» (S19): viajan con el chunk del panel, no con el diccionario de la página (el peso
// inicial de `/` y de `/protocolo` no crece). Los dos idiomas.
import type { TextosEtapa } from "@/i18n/textos-etapa";
import en from "../../../messages/simulador.en.json";
import es from "../../../messages/simulador.es.json";

export const TEXTOS_SIMULADOR: TextosEtapa = { es, en };

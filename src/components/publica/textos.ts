// Los textos de «Llévatelo» (S17): viajan con el chunk del panel, no con el diccionario de la página (el peso inicial de `/`
// no crece). Los dos idiomas, como las fichas.
import type { TextosEtapa } from "@/i18n/textos-etapa";
import en from "../../../messages/publica.en.json";
import es from "../../../messages/publica.es.json";

export const TEXTOS_PUBLICA: TextosEtapa = { es, en };

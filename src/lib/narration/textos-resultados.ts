// Los textos del margen de error y de la explicación verificada (S18): viajan con el chunk de la pantalla de resultados, no con el
// diccionario de la página (el peso inicial de `/` y de `/protocolo` no crece). Los dos idiomas.
import type { TextosEtapa } from "@/i18n/textos-etapa";
import en from "../../../messages/resultados.en.json";
import es from "../../../messages/resultados.es.json";

export const TEXTOS_RESULTADOS: TextosEtapa = { es, en };

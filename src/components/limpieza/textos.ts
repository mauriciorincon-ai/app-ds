// Los textos del plan de limpieza, del aviso de datos personales y de la hoja leída (S18): viajan con el chunk del panel, no
// con el diccionario de la página (el peso inicial de `/` y de `/protocolo` no crece). Los dos idiomas.
import type { TextosEtapa } from "@/i18n/textos-etapa";
import en from "../../../messages/limpieza.en.json";
import es from "../../../messages/limpieza.es.json";

export const TEXTOS_LIMPIEZA: TextosEtapa = { es, en };

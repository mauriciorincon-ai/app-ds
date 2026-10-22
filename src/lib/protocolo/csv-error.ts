// Protocolo DS: de qué tipo de error de lectura del CSV sale cada texto de error (S16, S15 B2: antes vivía dentro de
// `useProtocolo` y la pantalla del chequeo de deriva traía el hook entero solo por esta tabla).
export const CSV_ERROR: Record<string, string> = {
  empty: "errors.csv-empty",
  "too-large": "errors.csv-too-large",
  "too-many-rows": "errors.csv-too-many-rows",
  ragged: "errors.csv-ragged",
  "semicolon-delimiter": "errors.csv-semicolon",
  "tab-delimiter": "errors.csv-tab",
};

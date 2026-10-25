// S19: un único asignador de ids para los paneles que hablan con el worker de Probeta (margen de error, «Llévatelo», simulador,
// reglas, vigilancia). Los ids son NEGATIVOS: la máquina de estados del hook de Probeta (ids ≥ 0) no los toma por suyos. Antes
// cada módulo llevaba su contador desde −1 000 000 y el primer pedido de dos paneles era el mismo id: la respuesta de uno podía
// ser leída por el otro. El estrés (`EstresPanel`) cuenta aparte con ids −1, −2, … y no choca con esta serie.
let ultimo = -1_000_000;

/** El siguiente id del panel: único en toda la sesión de la página. */
export const siguienteIdDePanel = (): number => --ultimo;

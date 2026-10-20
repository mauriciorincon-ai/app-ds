// S14 (B3 del S13): cómo LHCI casa un `path` de perf-budget.json con una URL medida, copiado de
// @lhci/utils (budgets-converter.js): "/" o vacío casa TODO; el resto se escapa, `*` pasa a `.*`, y la expresión NO se
// ancla al final (`/protocolo` casa también `/protocolo/x`). `$` no se escapa: `/$` casa solo la raíz.
// LHCI aplica TODOS los presupuestos que casan con una URL (no el primero): dos que se cruzan en una ruta le exigen
// ambos límites. Por eso cada URL medida debe casar con exactamente uno.
export const patronDeRuta = (path) => {
  if (!path || path === "/") return /.*/;
  const escapado = path
    .split("*")
    .map((parte) => parte.replace(/([-[\]{}()*+?.,\\^|#\s])/g, "\\$1"))
    .join(".*");
  return new RegExp(`https?://[^/]+${escapado}`);
};

export const coincide = (path, ruta) =>
  patronDeRuta(path).test(`http://localhost${ruta}`);

/** Los problemas de los presupuestos frente a las URL medidas: sin presupuesto, o con más de uno. */
export function revisarPresupuestos(budgets, urls) {
  const problemas = [];
  for (const url of urls) {
    const paths = budgets
      .filter((b) => coincide(b.path, url))
      .map((b) => b.path);
    if (paths.length === 0)
      problemas.push({ url, tipo: "sin-presupuesto", paths });
    else if (paths.length > 1) problemas.push({ url, tipo: "varios", paths });
  }
  return problemas;
}

---
sprint: 008
app: ds
hito: H-2
opened: 2026-10-17
closed:
branch: sprint-008/protocolo-esqueleto
pr:
---

# Sprint 008 — cierre ejecutivo (BORRADOR: se completa al cierre)

## PUNTO DE REANUDACIÓN (borrar al cerrar) — F3 a medio camino, tras `[F3]` parcial

**Hecho y verificado en F3:** motor de las etapas 1–3 (`src/engine/protocolo/etapa{1,2,3}.ts`, `muestra.ts`,
`fechas.ts`, `tabla.ts`, `valores.ts`), formularios (`src/components/protocolo/Etapa{1,2,3}Form.tsx`), textos
`{es, en}`, kit (`renovaciones-mensuales.csv`), e2e `tests/e2e/protocolo.spec.ts` (12/12 ×3 pasadas), pasada de
capturas `scripts/capturas-s8.mjs`, manual, guía v5 (bloque J), README del kit.
**Falta, en este orden:** (1) `pnpm build` + `pnpm test:e2e` COMPLETO (CI=1, hay un server viejo en :3000: matarlo);
(2) `/audita-sprint` de UNA pasada con un subagente Sonnet · high (4 casillas; críticos y altos se pagan aquí;
medios y bajos van al cierre con `archivo:línea`); (3) casilla de frases caducadas en manual/README/guía/brochure
(buscar «todavía no», «aún no», «por ahora», «próximamente»…); (4) `/deploy-check` (≤ 10 casillas);
(5) `node scripts/horas-sprint.mjs` y pegar su salida; (6) completar este cierre (≤ 40 líneas, sin esta sección);
(7) `git push -u origin sprint-008/protocolo-esqueleto`, `gh pr list --state open`, `gh pr create` (NORMAL, no
borrador), `gh pr checks` AL FINAL (5 checks con conclusión propia, `un-pr-vivo` incluido); (8) decir al usuario el
«Para mergear» con el comando de la ruleset (en el plan) y la lista de PRs abiertos (debe ser uno).
**Reglas vivas:** Sonnet 5.5 requerido en F3 (relevo: 2 intentos o 20 min); Co-Authored-By de quien corra el commit;
cero enlaces tras el último `git add`; evidencia DESPUÉS del hecho (regla 27); nada de worktrees.

## Evidencia (anotada en cuanto se produce)

- F1 `f1396c0`: `cmp` núcleo = planeadora, centinela presente; `pnpm test` 769/769 (64 archivos), líneas 94.49 %.
- F2 `eae8099`: demo en rojo de la compuerta (`scripts/demo-rojo.sh`, exit 0): `compuerta.ts` `if (bloquea !== null)` →
  `if (bloquea !== null && false)` → 4 de 14 en rojo, nombró «la etapa 2 no abre sin la 1»; restaurado, verde 14/14.
  `.protocolo.json`: «[contrato .protocolo.json] detectó 20 de 20».
- F3, tamaño de muestra: `protocolo-muestra.test.ts` 21/21 contra el ejemplo de Chagas de Riley (parte II, § 5.1:
  622.31 · 667.41 · 220.85) y los vectores del paquete `pmsampsize` 1.1.3 (binaria 4.2–4.4; una cantidad 2.1–2.6).
  El artículo redondea a mano y da 668; con las cifras exactas el criterio (ii) da 662, que es lo que da el paquete.
  La investigación citaba el arXiv 2207.12892 como Riley (BMJ 2020): es Pate et al. (2023); el BMJ no se pudo abrir (403).
- F3, carnadas de campo de las etapas: «[contrato 1 · 8 campos] detectó 8 de 8» y las demás (5/5, 4/4, 21/21, 9/9).
- F3, `pnpm test` (con cobertura): 72 archivos, 912/912; `src/engine/protocolo` 94.47 % de líneas, ramas 88.27 %
  (el umbral de `src/engine/**` cayó a 79.74 % de ramas con las etapas sin probar: lo atrapó el gate y se pagó con
  carnadas por campo y por rama).
- F3, e2e `protocolo.spec.ts`: 36 de 36 (6 pruebas × 2 dispositivos × 3 repeticiones) sobre el build de producción.
  Hallazgos del e2e/capturas, todos pagados: columna inexistente al cargar otra versión de los datos (rompía el
  render), «Guardado» dicho antes de que IndexedDB terminara (un estado armado desde una foto borraba el contador de
  escrituras), nombre de columna de 110 caracteres que desbordaba el cuaderno a 360 px, umbral de ~1e-20 escrito
  «0.00» y razón de 1e20 en quince ceros (ahora notación científica), un dato duplicado con otros decimales.
- F3, pasada de capturas (`scripts/capturas-s8.mjs`, 360 y 1280 px, claro y oscuro, español): 56 encuadres,
  40 interacciones activadas, 0 fallas (scrollWidth ≤ clientWidth en todos). LEÍDOS COMO IMAGEN: 11 de los 56
  (360 claro: portada, etapas 1, 2 y 3, cuaderno, detenida, glosario, inglés, extremos de la etapa 1 y 2; 360 oscuro:
  etapa 3 y extremo de la etapa 2; 1280 claro: etapa 2). Los 45 restantes se midieron, no se leyeron.

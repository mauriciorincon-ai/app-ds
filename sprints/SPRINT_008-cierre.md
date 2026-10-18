---
sprint: 008
app: ds
hito: H-2
opened: 2026-10-17
closed: 2026-10-17
branch: sprint-008/protocolo-esqueleto
pr: 23
---
# Sprint 008 «El esqueleto del Protocolo» — cierre ejecutivo
**Objetivo:** adoptar el núcleo v2.3.0 y construir el contrato del Protocolo DS (compuerta sin salto, cuaderno atado a la huella SHA-256, persistencia, porqué y glosario `{es, en}`) con las etapas 1–3 funcionando y la 4–10 visibles y cerradas. **Resultado:** cumplido · **Estado:** listo para merge.
**Tiempo:** estimado 8 h · real = salida del script (abajo) · diferencia −5 h: el script no cuenta lo previo al primer commit y son 6 commits; ninguna fase pasó del +50 %.
### Horas del sprint (`scripts/horas-sprint.mjs`, rango `origin/main..HEAD`, heurística git-hours: huecos ≤ 2 h + 0,5 h por sesión)
| Commits | Sesiones | Horas activas | Span (primer → último commit) |
|---:|---:|---:|---|
| 7 | 1 | 3,2 h | 2026-10-17 17:34 → 2026-10-17 20:13 (2,7 h) |
| Fase | Commits | Horas activas |
|---|---:|---:|
| F1 | 1 | 0,5 h |
| F2 | 1 | 0,5 h |
| F3 | 5 | 2,1 h |
**Fases (estimado → real):** F1 kit v2.3.0 1,5 → 0,5 h ✔ · F2 esqueleto (compuerta, cuaderno, archivo, ruta) 3 → 0,5 h ✔ · F3 etapas 1–3 + cierre 3,5 → 2,1 h ✔.
**Entregables:** `CLAUDE.md` núcleo + kit (anexo, horas, cero-enlaces, `un-pr-vivo`, comandos) · `src/engine/protocolo/` (compuerta, cuaderno, etapas 1–3, Riley, fechas) · `/protocolo` · `.protocolo.json` · glosario 23 términos · CSV `renovaciones-mensuales` · ADR 020 · manual · guía v5 (bloque J).
**No completado:** etapas 4–10 (por diseño: visibles y cerradas). FORMA y TEXTO «maquetadas, no vistas» → gate humano del hito (de 56 capturas, 11 leídas como imagen; el resto medido).
**Desviaciones:** Lighthouse sigue en 3 corridas + mediana (núcleo: 1) · del `ci.yml` del kit solo el paso «Cero enlaces» · se copió `deploy-check.md` · 1 línea del export (`decisiones_registradas` 19→20) · etapa 1 pregunta la forma de la decisión · sin demo en rojo de `un-pr-vivo` (violaría la regla 18) · la puerta usa `Link prefetch={false}`, no `<a>` · `cero-enlaces.test.ts` lleva `@vitest-environment node` · ⭐⭐ Acto 2 del S7 sin recorrer · la investigación citaba mal a Riley (fórmulas de PMC6519266 y del paquete `pmsampsize`).
**Decisiones:** ADR 020 · `zod/mini` en el cliente: el zod completo pesa 93 KB gz y `/protocolo` salía a 326 KB de script contra 307 KB de presupuesto; ahora 252 KB, LCP 2,9 s (3,5 s), categorías 0,95/1/1/1.
**Pruebas (después del hecho):** unitarias 951/951 (74 archivos; motor del Protocolo 95,16 % líneas, 89,77 % ramas) · integración 101 (1 omitido: modo `EMIT` de fixtures, ya estaba) · e2e 84/84 con 0 flaky · Lighthouse de la CI en local verde · demo en rojo de la compuerta (`protocolo-compuerta`, 4 de 14 en rojo) y del recálculo (`protocolo-forjado`, nombró «una cifra cambiada…», verde 8/8). `un-pr-vivo` y «Cero enlaces» corren por primera vez en este PR: no hay histórico.
**Auditoría (Sonnet · high, una pasada, independiente):** alcance completo salvo 2 desviaciones no declaradas (ya arriba) · **A1** `leerNumero` leía «1,500» como 1.5 — pagado · f11cc6e · **A2** un `.protocolo.json` editado a mano pasaba la etapa 2 — la compuerta recalcula contra la tabla — pagado · f11cc6e · seguridad/privacidad sin críticos ni altos · frases caducadas: 6 halladas, 4 pagadas (portada «diez etapas», README `sprints/`, manual ×2) y 2 al hito (`docs/BLUEPRINT.html:68`; brochure y export sin el Protocolo).
**Deuda al lote del hito (M/B, `archivo:línea`):** M1 `muestra.ts:29`, `Etapa3Form.tsx:193` (R² supuesto y «una contra el resto» sin decirse en pantalla) · M2 `CargaDatos.tsx:84`, `CuadernoPanel.tsx:206` (`alertdialog` sin nombre ni foco; axe serio) · M3 `useProtocolo.ts:332,267` (importar y «otro proyecto» reemplazan el cuaderno sin confirmar) · M4 `almacen.ts:74` (dos pestañas: última escritura gana; sin reproducir) · M6 `etapa3.ts:227` (P declarado menor que el contado, sin aviso) · B1 `tabla.ts:52` (clase llamada `constructor`) · B2 `etapa1.ts:89,105` (suma de 1e308) · B3 `archivo.ts:101` (campo sin truncar) · B4 `etapa1.ts:42`, `etapa3.ts:72` (texto largo rechazado con mensaje equivocado) · B5 campos sin lector (`etapas.ts:60`, `muestra.ts:48`, `cuaderno.ts`) · B6 cardinalidad cableada (`archivo.ts:28`, `messages/es.json:1047`, `etapa1.ts:35`) · B7 `useProtocolo.ts:153-268` (`guardar` dentro de un updater) · B8 `Glosario.tsx:19` (32 px) · B9 `Etapa3Form.tsx:69,90` (el aviso sobrevive a «suficiente») · B10 `un-pr-vivo.yml` (el principal falla si se abre un complementario) · B11 `design-system.md` sin los patrones del Protocolo · B13 guía J6 y manual dicen «no trae tu CSV» pero el archivo lleva derivados (clases, medias, fechas).
**Aprendizajes:** correr el Lighthouse de la CI en local antes del PR (el job estrena ruta) atrapó los 326 KB · un criterio que lee chequeos de la tabla se recalcula contra la tabla · `hover:opacity-90` + puntero dejado por un clic = flaky que el reintento de la CI esconde.
**Recomendación y esfuerzo-beneficio:** S9 = etapa 4 (fuga) sobre este contrato, pagando antes M2 y M3 · esfuerzo-beneficio alto: el contrato ya se probó con tres etapas.
**Modelo por fase:** F1 Sonnet 5.5 · F2 Opus 5.5 · F3 Sonnet 5.5 (los tres como se requería, sin desvío) · auditor Sonnet 5.5 · Haiku no se usó. **Relevos:** ninguno.
**Para mergear:** squash y borrar la rama; después `/cierre-sprint ds`. Una vez, para exigir el nuevo check: `gh api repos/mauriciorincon-ai/app-ds/rulesets/18694785 | jq '{name,target,enforcement,conditions,bypass_actors,rules:(.rules|map(if .type=="required_status_checks" then .parameters.required_status_checks += [{"context":"un-pr-vivo"}] else . end))}' | gh api -X PUT repos/mauriciorincon-ai/app-ds/rulesets/18694785 --input -`

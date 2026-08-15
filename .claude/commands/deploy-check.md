---
description: Checklist pre-merge a main. Verifica que todo lo necesario está listo antes de mergear un PR.
---

# /deploy-check

Checklist exhaustivo antes de mergear a `main` (que dispara deploy a producción en Vercel).

## Pasos

> **Regla dura (kit v1.15.0): cada casilla se verifica con EL comando del `ci.yml`, no con uno
> parecido.** `pnpm test` ≠ `vitest run` (el script lleva `--coverage`, y ahí viven los
> umbrales); `pnpm typecheck` ≠ `tsc --noEmit` (falta `next typegen`). Y **lee lo que viene
> DESPUÉS del resumen**: el verde de las pruebas no es el verde del job. *(Origen: Velo S2 —
> 502 pruebas verdes con `vitest run`, CI rojo por el umbral de `src/lib/**`.)*

Corre cada verificación en orden y reporta estado:

### 1. Tests
- [ ] `pnpm test` verde (el comando exacto — con su `--coverage`).
- [ ] `pnpm test:e2e` verde **y con CERO flaky**: un spec que pasó en su 2º intento se reporta
      con nombre y se investiga antes del PR. Un gate que necesita sus reintentos está avisando.
- [ ] Cobertura del app afectada >=70% — **y sin errores de glob ni umbrales por debajo** en las
      líneas posteriores al resumen.

### 2. Type safety
- [ ] `pnpm typecheck` sin errores.
- [ ] Sin `@ts-ignore` nuevos sin justificación en comentario.

### 3. Lint y formato
- [ ] `pnpm lint` sin warnings nuevos.
- [ ] `prefers-reduced-motion` respetado si hay animaciones nuevas.

### 4. Build
- [ ] `pnpm build` exitoso.
- [ ] Bundle size no creció >10% vs main (medir con `next build` output).

### 5. Security
- [ ] `pnpm audit --audit-level high` limpio. **Si sale rojo sin que tú tocaras dependencias, no
      busques el error en el diff: la CI se pone roja por el CALENDARIO** (avisos nuevos sobre un
      árbol que no cambió — kit v1.16.0, origen ds S4: 3 corridas rojas seguidas, 8 paquetes
      transitivos escalados a `high`). Resuélvelo de menor a mayor intrusión: (1) el parche que el
      propio aviso pide · (2) `pnpm update`, dentro de los rangos ya declarados · (3) overrides
      solo para lo clavado en profundidad, **acotando el selector al RANGO VULNERABLE**
      (`postcss@<8.5.18`) y con `^` en el reemplazo, **que no cruza de major** — nada de arrastrar
      una ruptura de API por un parche de seguridad.
- [ ] **Los overrides viven en `pnpm-workspace.yaml`, NO en `package.json`** (kit v1.16.0):
      **pnpm 11 ya no lee `pnpm.overrides` de `package.json` — lo ignora con un WARN y sigue.**
      Si este repo los tiene en el sitio viejo, su protección es **ficticia** y nada lo delata.
      Míralo aunque no hayas tocado dependencias este sprint.
- [ ] **Ninguna versión que viaje dentro de un artefacto exportado se movió sin decisión.**
      Rangos (`^`) para lo que solo se ejecuta; **pin exacto para lo que se DECLARA en un archivo
      que sobrevive a la sesión** (origen ds S4: `pnpm update` movió Pyodide 314.0.2 → .3, y esa
      versión viaja dentro de cada modelo exportado y gobierna los avisos de compatibilidad al
      importar — moverla habría invalidado los archivos del usuario).
- [ ] Sin secrets en el diff.
- [ ] Variables de entorno nuevas agregadas a `.env.example` y a Vercel env.

### 6. Observabilidad
- [ ] Endpoints nuevos loggean request/duration.
- [ ] Errores nuevos capturados por Sentry (no hay path a `throw` sin try/catch).

### 7. Accesibilidad y diseño
- [ ] Axe scan sin violaciones en rutas nuevas (e2e test con `@axe-core/playwright`).
- [ ] Navegación por teclado probada en rutas nuevas.
- [ ] **Checklist de revisión de diseño del skill `diseno-ui` corrido sobre la preview** (fidelidad a design-system.md, jerarquía, 5 estados, cero anti-patrones) + aprobación visual del usuario.

### 8. Performance
- [ ] Lighthouse score >=90 en Performance, Best Practices, Accessibility, SEO (móvil).
      **Desde kit v1.12.0 esta casilla SÍ tiene gate mecánico:** el job `lighthouse` corre
      `lhci assert --config=./lighthouse-categorias.json` sobre las URLs de
      `lighthouse-urls.json` — antes solo se medía `perf-budget.json` (tiempos y pesos, que es
      otra cosa) y la casilla se marcaba sin que nadie la hubiera verificado nunca.
      **Si lo corres a mano: `npx @lhci/cli`** — `npx lhci` A SECAS resuelve a un paquete
      impostor del registry (imprime "Hello, this is AnupamAS01!"); el CI del kit ya usa el
      correcto (K-habla S2).
- [ ] No hay queries N+1.
- [ ] Imágenes usan `next/image`.

### 9. Documentación
- [ ] **¿Qué frases caducaron?** (v1.15.0) — este sprint volvió FALSAS afirmaciones viejas:
      revisa portada/landing, `docs/MANUAL-DE-USO.md`, `README.md`, `docs/GUIA-DE-PRUEBA.html`,
      copy de estados vacíos y brochure. **Busca por PROMESA APLAZADA, no por la palabra de la
      feature** (v1.15.2): `todavía no` · `aún no` · `por ahora` · `de momento` · `mientras
      tanto` · `próximamente` · `llega después` · `en esta versión` · `más adelante` · `no (se)
      puede` + los futuros (`podrás`, `permitirá`). *El texto más leído de la app no puede
      describir el sprint pasado.*
- [ ] README actualizado si cambió el setup.
- [ ] **`docs/MANUAL-DE-USO.md` actualizado con las features de este sprint** (qué hace, cómo se usa, limitaciones — en lenguaje de usuario final). Feature sin manual = sprint no cierra.
- [ ] CHANGELOG entry (si el proyecto lo usa).
- [ ] Si hay decisión arquitectónica: ADR en `decisions/` de este repo.

### 10. Cierre del sprint (las dos casas)
- [ ] Bitácora `sprints/SPRINT_NNN-implementation-log.md` al día en este repo.
- [ ] Si este merge cierra el sprint: `sprints/SPRINT_NNN-summary.md` generado (plantilla en CLAUDE.md) — es lo que la planeadora lee para la retrospectiva.
- [ ] (Si aplicó IA embebida) checklist del skill `ia-embebida` completo.

### 11. Los checks del PR — ¿EJECUTARON, o solo no están en rojo? (kit v1.16.0)

> **Regla dura: un job requerido que nunca EJECUTÓ no es un gate.** `skipped` **no es verde.** Un
> job con `needs:` sobre otro que falló queda saltado, GitHub lo lista junto a los checks
> requeridos **sin alarma ninguna**, y una columna sin rojo se lee como aprobación. *(Origen: ds
> S4 — el job `lighthouse` estuvo `skipped` las **12 corridas** de la rama porque `quality`
> llevaba en rojo; el gate de performance no corrió **ni una vez en todo un ciclo de 4 sprints**
> mientras el DoD lo daba por cumplido apoyándose en corridas locales. Cuando por fin corrió,
> salió rojo.)*

- [ ] **Cada check requerido tiene conclusión propia `success`.** Verifícalo con el comando, no
      con la vista del PR:
      ```
      gh pr checks <N>
      gh pr view <N> --json statusCheckRollup \
        -q '.statusCheckRollup[] | "\(.name // .context): \(.conclusion // .state)"'
      ```
      **`skipped`, `cancelled`, `neutral` y ausente NO cuentan como verde.** Si alguno sale así,
      repórtalo **nombrando de qué `needs:` colgaba** y no cierres hasta que ejecute.
- [ ] **Si un job corrió por PRIMERA VEZ en este PR, dilo en el summary** — no hay histórico con
      el que comparar, así que **no puede afirmarse ni regresión ni no-regresión**, y eso se
      escribe tal cual en vez de darlo por bueno.

> Hermana de la **regla 15** del CLAUDE.md ("un gate se demuestra FALLANDO"). Las dos cubren la
> misma ilusión por lados opuestos: aquella pregunta *¿lo has visto **fallar** cuando debía?* —
> esta pregunta *¿lo has visto **correr**, alguna vez?*. Verde sin haber fallado nunca es una
> promesa; verde sin haber corrido nunca ni siquiera es eso.

## Output esperado

```
### ✅ Pasa (N/11)
- ...

### ❌ Falla (N/11) — bloquea merge
- tipo: descripción
- fix: ...

### ⚠️ Warnings (no bloquean, pero revisar)
- ...

### Decisión: MERGE OK | NO MERGE
```

Si NO MERGE, termina ahí. Si MERGE OK, el usuario procede manualmente (no mergees automáticamente).

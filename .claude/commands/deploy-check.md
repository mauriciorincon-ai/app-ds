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
> **Y la inversa (kit v1.28.0): todo comando que aparezca en una casilla VIVE en un job del
> `ci.yml`, o la casilla dice `manual` y por qué.** Un comando que solo existe en el checklist
> es un gate que depende de que alguien lo recuerde *(Angel Ghost S1: `clippy` vivió en el
> checklist sin job y estaba en rojo mientras la CI daba verde)*.

Corre cada verificación en orden y reporta estado:

### 1. Tests
- [ ] `pnpm test` verde (el comando exacto — con su `--coverage`).
- [ ] `pnpm test:e2e` verde **y con CERO flaky**: un spec que pasó en su 2º intento se reporta
      con nombre y se investiga antes del PR. Un gate que necesita sus reintentos está avisando.
- [ ] Cobertura del app afectada >=70% — **y sin errores de glob ni umbrales por debajo** en las
      líneas posteriores al resumen.

### 2. Type safety
- [ ] **(perfil `--python`, kit v1.30.0)** desde `agents/`: `ruff check .` · `ruff format --check .` · `pytest` verdes
      con EL comando del CI (cobertura ≥ umbral del `pyproject.toml`); `pip-audit --skip-editable` limpio.
- [ ] `pnpm typecheck` sin errores.
- [ ] Sin `@ts-ignore` nuevos sin justificación en comentario.

### 3. Lint y formato
- [ ] `pnpm lint` sin warnings nuevos.
- [ ] **La pasada de capturas mide el ÁREA DE DESPLAZAMIENTO (kit v1.31.0):** por cada encuadre,
      `scrollHeight`/`scrollWidth` contra el alto/ancho visible del contenedor (test o script de
      fidelidad); un desborde es un rojo aunque la comparación por píxel pase *(Angel Ghost: 15 px
      de desborde sobrevivieron a 60 encuadres comparados al 0,15 %)*.
- [ ] **La pasada de capturas incluye una pasada de INTERACCIÓN (kit v1.32.0, regla 22):** por cada
      control dibujado (botón, panel, ficha, conmutador de tema/idioma, siguiente paso) el arnés lo
      activa y comprueba que algo cambió (DOM o captura); el gate `controladores-maqueta` está en verde
      *(Big-D: la ficha del nivel 2 sin script sobrevivió a cuatro miradas con capturas de un panel cerrado)*.
- [ ] `prefers-reduced-motion` respetado si hay animaciones nuevas — **y la FORMA del árbol no
      depende de `useReducedMotion()`** (kit v1.26.0): test unitario «mismo HTML con `null` /
      `true` / `false`» sobre cada componente de motion nuevo o tocado + axe bajo emulación de
      reduced-motion. Un árbol que ramifica por el hook rompe la hidratación (React #418) para
      exactamente los usuarios que el cinturón cuida.
- [ ] **Tokens de tinta VETADOS como texto (kit v1.26.0):** el barrido de clases prohibidas
      declaradas en `design-system.md` (p. ej. `ink-3`) pasa en `pnpm lint`/`pnpm test` — no se
      espera a que axe lo cace al final.

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
      **UNA corrida NO es una medición (kit v1.26.0):** performance = **mediana de ≥3 corridas**
      por URL (`--numberOfRuns=3` + `--aggregationMethod=median-run`, como el `ci.yml`). Un
      servidor recién levantado dio un falso rojo reproducible en hoja-de-vida S7 y casi se pagó
      con optimización a ciegas; y al revés, una corrida buena tampoco prueba nada.
- [ ] No hay queries N+1.
- [ ] Imágenes usan `next/image`.

### 9. Documentación
- [ ] **CERO ENLACES publicados** (kit v1.19.0, regla 17 — regla dura F0 #8): barre que NINGÚN
      archivo del repo ni campo de GitHub contenga la URL de producción o de previews:
      ```
      git grep -nE "vercel[.]app|workers[.]dev|pages[.]dev" -- ':!pnpm-lock.yaml'   # TODOS los archivos versionados — jamás include-list (kit v1.23.0: wrangler.jsonc pasó un gate con lista); suma el host real del stack si difiere
      gh repo view --json homepageUrl -q .homepageUrl   # el campo About/website APUNTA AL PROPIO REPO (kit v1.32.1); si está vacío, Vercel lo reescribe
      # REPARA, no solo verifica (kit v1.35.0 — habla: Vercel lo reescribió tres veces tras el deploy y se limpió a mano):
      [ "$(gh repo view --json homepageUrl -q .homepageUrl)" = "$(gh repo view --json url -q .url)" ] || gh repo edit --homepage "$(gh repo view --json url -q .url)"
      ```
      README, BLUEPRINT ("qué ve quién" sin la URL), manual, guía (su campo de URL se llena EN
      USO), CTAs. *La producción se muestra (brochure), jamás se entrega (link).* Si este sprint
      es anterior a la regla y encuentras enlaces heredados: se limpian en este mismo PR.
      **El barrido corre sobre el árbol que se va a subir — DESPUÉS del último `git add`, y
      cubre código y comentarios de tests (kit v1.26.0):** correrlo antes deja ciega la ventana
      hasta el push (así entraron los artefactos de `.lighthouseci/` al PR del S5 de
      hoja-de-vida), y un comentario de spec que cita el dominio de preview es una fuga igual.
- [ ] (post-MVP) **Si este sprint cambió features y la app tiene brochure: el brochure se ajustó
      EN ESTE SPRINT** (regla 13 — el sello MVP no lo congela; un brochure que describe el sprint
      pasado es una frase caducada de página entera).
- [ ] **¿Qué frases caducaron?** (v1.15.0) — este sprint volvió FALSAS afirmaciones viejas:
      revisa portada/landing, `docs/MANUAL-DE-USO.md`, `README.md`, `docs/GUIA-DE-PRUEBA.html`,
      copy de estados vacíos y brochure. **Busca por PROMESA APLAZADA, no por la palabra de la
      feature** (v1.15.2): `todavía no` · `aún no` · `por ahora` · `de momento` · `mientras
      tanto` · `próximamente` · `llega después` · `en esta versión` · `más adelante` · `no (se)
      puede` + los futuros (`podrás`, `permitirá`). *El texto más leído de la app no puede
      describir el sprint pasado.*
- [ ] README actualizado si cambió el setup.
- [ ] **`docs/MANUAL-DE-USO.md` actualizado con las features de este sprint** (qué hace, cómo se usa, limitaciones — en lenguaje de usuario final). Feature sin manual = sprint no cierra.
- [ ] **IA de construcción por suscripción (7-S, kit v1.33.0 — regla 21):** si la app tiene una skill que
      corre con la suscripción de la persona, **antes de cada release** se releen los términos vigentes y la
      fecha y lo leído quedan en su ADR de cumplimiento. Sin relectura fechada, el release no sale. *(Big-D
      S1, M-4: el ADR remitía a esta casilla y no existía.)*
- [ ] **Matriz de envejecimiento (kit v1.33.0 — regla 23):** si la app tiene datos con fecha de cambio de
      estado, el gate que construye la página en cada una de esas fechas está en verde (y nació en rojo).
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

### 12. El disco en runtime — lo que la app PRODUCE al correr (kit v1.21.0)

> Las 11 secciones anteriores auditan el REPO; esta mira la MÁQUINA. Origen: dash S2 — el
> índice nacía world-readable (dir 755 / archivo 644) con texto real de prompts, y todas las
> casillas habrían dado verde porque ninguna miraba el estado en disco.

- [ ] **Inventario de derivados:** ¿qué archivos/directorios crea la app al correr (índices,
      caches, configs, reportes, logs)? Cada uno listado con su ubicación real.
- [ ] **Un derivado JAMÁS nace menos privado que su fuente:** si la fuente es privada del
      usuario, el derivado nace con permisos restrictivos (700/600 o equivalente) — verificado
      con test que nace en rojo, y reparación al abrir si el derivado ya existía mal.
- [ ] **El modo real de arranque CORRIÓ EN VIVO** (tercer filo de la regla «un gate se
      demuestra fallando»): el modo/perfil con el que el usuario usará la app (p. ej.
      `start:seguro`) arrancó de verdad al menos una vez en este sprint si el sprint lo
      introdujo o lo tocó — pasar sus tests no cuenta como haber corrido.
- [ ] **Arneses con candado:** todo script del repo que pueda tocar fuentes (capturas,
      fixtures, seeds) demuestra al arrancar contra qué árbol corre y aborta ante datos
      reales sin confirmación explícita.

*(En apps cloud, esta sección aplica a lo que el runtime escribe donde corre — storage,
tmp, logs con datos — con la misma pregunta: ¿con qué permisos/alcance nace?)*

## Output esperado

```
### ✅ Pasa (N/12)
- ...

### ❌ Falla (N/12) — bloquea merge
- tipo: descripción
- fix: ...

### ⚠️ Warnings (no bloquean, pero revisar)
- ...

### Decisión: MERGE OK | NO MERGE
```

Si NO MERGE, termina ahí. Si MERGE OK, el usuario procede manualmente (no mergees automáticamente).

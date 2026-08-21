---
entrega: export + cero enlaces
app: ds
status: en revisión (PR abierto)
opened: 2026-08-20
branch: entrega/export-y-cero-enlaces
pr: <pendiente>
---

# Entrega puntual — ds adopta `brochure-export.json` v1.0.0 + barrido CERO ENLACES

PR chico y sin pieza visual nueva: **cero cambios al producto y cero cambios al `BROCHURE.html`**
(probado con `git diff --stat` sobre `src/`, `messages/`, `scripts/`, `next.config.ts`,
`package.json` y el propio brochure: vacío).

## 1 · El barrido — el inventario real era de **13**, no de 9

La orden inventarió 9 ubicaciones. Las 9 existían tal cual, pero el grep de verificación encontró
**4 más**. Como la acceptance #1 es «grep VACÍO», se limpiaron las 13: el inventario es una ayuda,
el criterio es el comando.

| Ubicación | ¿Estaba en la orden? | Qué se hizo |
| --- | --- | --- |
| `docs/GUIA-DE-PRUEBA.html` — cabecera (2 links) | ✅ | La lista «Dónde probar» pierde los enlaces absolutos y gana un **campo EN USO** donde el usuario pega la URL al momento de probar |
| `docs/GUIA-DE-PRUEBA.html` — 5 campos «Dónde» | ✅ | Queda solo la ruta **dentro de la app** («la pantalla de inicio», «resultados → Usar el modelo»); el sufijo de enlaces se eliminó |
| `sprints/ENTREGA-brochure-summary.md:164` | ✅ | «(URL — registro privado en la planeadora)» |
| Campo homepage del repo | ✅ | `gh repo edit --homepage ""` |
| **`sprints/ENTREGA-brochure-summary.md:117`** | ❌ | URL de producción en el relato del bloqueo de la acceptance #10 |
| **`sprints/ENTREGA-brochure-summary.md:123`** | ❌ | El dominio homónimo, en el aviso de no confundirse |
| **`docs/GUIA-DE-PRUEBA.html:113`** | ❌ | El mismo homónimo, en la nota de la cabecera |
| **`docs/BLUEPRINT.html:162`** | ❌ | URL de producción + homónimo, **escritos por esta misma sesión** cinco días antes |
| **`docs/BLUEPRINT.html:153`** | ❌ | Un comodín del subdominio de Vercel — no es una URL, pero el grep lo atrapa |

**Lo que vale decirle a la planeadora:** una de las cuatro ausencias la escribí yo. Al documentar
la protección de deployment en el BLUEPRINT (entrega del brochure, 2026-08-15) puse la URL exacta,
que es justo lo que la regla 17 prohíbe. La regla nació **después** de esa entrega, así que no fue
desobediencia — pero explica por qué un inventario hecho desde fuera puede quedarse corto: el repo
se movió entre el barrido y la orden. **La verificación es el grep, no la lista.**

Los avisos honestos **no se perdieron** al quitar las URLs: el BLUEPRINT sigue diciendo que existe
un dominio ajeno de nombre parecido y que hay que usar el registro de la planeadora, solo que ahora
sin escribir ninguno de los dos dominios.

**Verificación (acceptance #1):**

```
$ grep -rn "vercel\.app\|workers\.dev" --include="*.md" --include="*.html" --include="*.json" .
(sin salida)
$ gh repo view --json homepageUrl
{"homepageUrl":""}
```

**La guía sigue 100 % usable** (acceptance #4): 5 campos «Dónde» intactos, las marcas del gate ⭐
intactas, cero enlaces rotos, cero pruebas tocadas. El diff completo son 16 inserciones y 8
supresiones. Renderizada y revisada como imagen.

## 2 · El export — `docs/brochure-export.json`

Conforme al contrato v1.0.0: bloque `_schema` copiado **tal cual**, `estado: "inicial"`,
`sellado_en: null`, `enlaces.produccion: null` con razón de **lista de espera**.

**Conteo cuadrado (acceptance #3): 33 = 33 = 33.** El pie del `BROCHURE.html` declara 33, el MANUAL
sostiene 33, y los `grupos[]` del export suman 33. Como el brochure coloca dos funcionalidades en su
capa 3 y no en tarjeta, el export lleva **5 grupos**: las 4 tarjetas (10 + 7 + 5 + 9 = 31) + un
grupo `Transversales` con bilingüe ES/EN y diccionario (2). `descartadas: []` — en H1 no se retiró
ninguna funcionalidad.

**Las 11 métricas, todas medidas hoy y todas con `fuente`:**

| clave | valor | fuente |
| --- | --- | --- |
| funcionalidades | 33 | medido |
| pantallas | 5 | medido |
| pruebas_unitarias | 267 | medido |
| pruebas_e2e | 24 | medido |
| cobertura_lineas | 90.69 % | medido |
| dependencias_runtime | 8 | medido |
| filas_del_usuario_en_la_red | 0 | medido |
| gpu_requerida | 0 | declarado |
| costo_operacion_mensual | 0 USD | calculada |
| peso_brochure | 61 572 B | medido |
| decisiones_registradas | 8 | medido |

### Tres puntos donde copiar el ejemplo canónico habría sido mentir

1. **`privacidad.local_only: false`.** Probeta NO es una app local: se sirve desde la web y tiene una
   ruta serverless. Lo local es el **cómputo y los datos**. Poner `true` habría sobrevendido; el
   `detalle` carga la garantía real (Pyodide en el navegador, solo agregados salen y solo a
   petición, 652 B medidos). Por lo mismo `red_saliente: true` y `usa_ia: true`, ambos con su
   matiz de opt-in. Una app cuya regla dura es exigir procedencia a cada cifra de su pantalla no
   puede maquillar su propia ficha.
2. **`razon_repositorio`** no dice «repositorio privado» (el de ds es **público**): dice que ningún
   enlace de acceso viaja en el export, que es la razón verdadera.
3. **`gpu_requerida: 0`** va marcada `declarado`, no `medido`: es una regla de producto, no la
   salida de un comando.

## 3 · El gate del export — visto FALLAR tres veces

`tests/unit/brochure-export.test.ts` (7 pruebas) hace permanente la acceptance #3, que de otro modo
se verifica una vez y se desincroniza en silencio la primera vez que alguien toque una feature sin
acordarse del JSON. Por la regla 11 de este repo, nace con su demo:

| Sabotaje deliberado | Resultado |
| --- | --- |
| `total: 33 → 32` | 🔴 2 pruebas en rojo: la del pie del brochure y la de la suma de grupos |
| Borrar `fuente` de una métrica | 🔴 1 en rojo, nombrando la métrica culpable |
| `enlaces.produccion` con una URL real | 🔴 1 en rojo: cero enlaces |
| Revertir | 🟢 7/7 verdes, archivo idéntico byte a byte al generado |

## 4 · Reglas 12 y 13 en el `CLAUDE.md`

Entran con la numeración local (que llega hasta 11) y cada una declara de qué regla del kit viene,
igual que se hizo con la 15 → 11: **12** = brochure vivo, sus dos estados y su export; **13** = cero
enlaces, con los dos comandos de verificación escritos dentro de la regla.

## 5 · Verificación

| Gate | Resultado |
| --- | --- |
| Barrido (grep + homepage) | ✅ vacío / `""` |
| `pnpm typecheck` · `pnpm lint` | ✅ limpios |
| `pnpm test` | ✅ 239 pruebas · 29 archivos · líneas 90.69 % |
| `pnpm test:integration` | ✅ 28 pruebas · 5 archivos |
| `pnpm test:e2e` | ✅ 24 pruebas, cero flaky |
| Acceptance #6 (cero cambios de producto) | ✅ `git diff --stat` vacío en `src/`, `docs/BROCHURE.html`, `messages/`, `scripts/`, `next.config.ts`, `package.json` |

> **Nota, porque viene al caso:** la primera versión de este summary **rompió el barrido**.
> Al documentar la ubicación 13 escribí el comodín literal y el grep se puso rojo sobre el
> archivo que narra la limpieza. Corregido describiéndolo en palabras. Es la prueba más barata
> de que el criterio tiene que ser el comando y no la buena intención de quien lo escribe.

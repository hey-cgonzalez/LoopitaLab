# QA de la fase 2 (T14)

- **Autor**: `qa-tester`, 2026-11-08.
- **Código revisado**: `main` en `8e5eb8f` (merge del PR #7), exportado con `git archive` a una carpeta aparte para no mezclarlo con los cambios en curso de otros agentes. Las pruebas nuevas de este informe se corrieron, además, sobre el árbol de trabajo de `fase-2/cierre`.
- **Entorno**: macOS (Apple Silicon), Node 24.16.0, pnpm 10.28.0, PostgreSQL 14.4 (Postgres.app), Chromium 156 completo (Playwright 1.64.1).

## Veredicto

**La fase 2 cumple sus criterios de salida en todo lo que depende del código.** Quedan abiertos cuatro pendientes que no se resuelven con código:

1. CA-P6, la medición en el equipo de referencia.
2. Las pruebas E2E con sesión, que necesitan Supabase de pruebas.
3. ~~La prueba con un lector de pantalla real (parte de CA-A3).~~ Hecha por la usuaria con VoiceOver y NVDA el 2026-11-09.
4. T1b, la validación con tejedoras.

Faltan también las aprobaciones finales de `experto-tejido` (T16) y `revisor-seguridad`.

No apareció ninguna falla en `main`. Las observaciones de abajo no bloquean el cierre.

## Comandos y resultados (sobre `main`)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK. El lockfile está al día; 88 paquetes |
| `node --test "test/**/*.test.ts"` en `pattern-core` | 332/332 (sin las pruebas nuevas) |
| … `pattern-render` | 69/69 |
| … `stitch-render` | 64/64 |
| … `yarn-catalog` | 17/17 |
| … `ai-router` | 36/36 |
| Los 5 paquetes con `SEED=7` y con `SEED=99999` | Mismos números, 0 fallas |
| `pnpm exec tsc -p tsconfig.json` | OK |
| `pnpm --filter @loopitalab/web typecheck` | OK |
| `… typecheck:test` | OK |
| `… typecheck:e2e` | OK |
| `… test` (Vitest) | 34 archivos y 558 pruebas, todas pasan |
| `… build` | OK. Se usaron las variables de ejemplo de la CI |
| Postgres local: stubs, las 12 migraciones y `supabase/checks/10_rls_check.sql` | OK. 49 verificaciones `ok` y "RLS: todas las verificaciones pasaron" |
| `pnpm --filter @loopitalab/web e2e` (`E2E_PORT=3177`, CPU ×1) | 26/26 en 2,3 min |
| Latencia con `E2E_CPU_RATE=4` (`--project latencia --no-deps`, `E2E_SKIP_BUILD=1`) | 4/4 |

**Con las pruebas nuevas** (árbol de trabajo, semilla por defecto, 7 y 99999), sin fallas en ninguna semilla:

| Paquete | Pruebas |
|---|---|
| `pattern-core` | 367/367 |
| `pattern-render` | 70/70 |
| `stitch-render` | 68/68 |
| `yarn-catalog` | 17/17 |
| `ai-router` | 36/36 |

`tsc -p tsconfig.json` pasa.

### Latencia E2E (p95 en ms; umbral de 100 ms)

| Escenario | Pintar ×1 | Repeticiones ×1 | Pintar ×4 | Repeticiones ×4 | Validaciones en la ventana de edición |
|---|---|---|---|---|---|
| Plano | 16,0 | 34,2 | 18,6 | 84,3 | 0 |
| Tubo | 17,2 | 38,9 | 20,9 | 89,2 | 0 |
| Círculo de rombos (40.000 puntos) | 33,6 | 31,6 | 71,0 | 82,8 | 0 |
| Copa | 18,0 | 22,1 | 22,8 | 33,8 | 0 |

- **Pico aislado**: con CPU ×4, en el plano, el máximo de repeticiones llegó a 108,1 ms. Es un máximo, no el p95.
- **Margen**: el peor p95 con CPU ×4 es 89,2 ms (tubo, repeticiones), así que el margen bajo el umbral es de unos 11 ms. Coincide con lo medido en T10 (ADR 0004, E7).

### CA-P5 (`layoutGeometry` de 40.000 puntos en Node)

| Forma | Mediana | Referencia | Tope (3 × referencia) |
|---|---|---|---|
| Plano | 2,58 ms | 2 ms | 6 ms |
| Tubo | 6,90 ms | 3,5 ms | 10,5 ms |
| Círculo | 2,52 ms | 4,5 ms | 13,5 ms |

El tubo se midió mientras corría en paralelo la E2E con CPU ×4, así que la cifra tiene ruido. Igual queda bajo el tope.

## CA-F11: casos de dominio → pruebas

`packages/pattern-core/test/casos-dominio.test.ts` (nuevo) fija esta tabla. Verifica cuatro cosas:

1. El documento tiene exactamente los casos 1 a 27.
2. Cada caso tiene al menos una prueba activa (no `skip` ni `todo`) cuyo título dice "caso N".
3. Los casos que el documento marca "validar con tejedora" (11 y 26) llevan el comentario `// validar con tejedora` dentro de su prueba.
4. Ese conjunto de casos marcados coincide con el del documento.

La prueba no repite la lógica de ningún caso. Los 27 pasan.

| Caso | Archivo: prueba (línea del título) |
|---|---|
| 1 | `pattern-core/test/derived.test.ts:71` |
| 2 | `pattern-core/test/derived.test.ts:76` |
| 3 | `pattern-core/test/derived.test.ts:83`. El espejo en la numeración del SVG va en el caso 25. La web toma el espejo de `mirror_knitting`, no de `dominant_hand` (`apps/web/src/app/disenos/[id]/page.tsx:93`) |
| 4 | `pattern-core/test/property-colorwork.test.ts:152` (propiedad) |
| 5 | `pattern-core/test/derived.test.ts:97`; `stitch-render/test/layout.test.ts:134` |
| 6 | `pattern-core/test/derived.test.ts:126` |
| 7 (CA-F3) | `pattern-core/test/derived.test.ts:143`; `stitch-render/test/layout.test.ts:217` (sin huecos radiales) |
| 8 | `pattern-core/test/derived.test.ts:164`; `pattern-core/test/validate-colorwork.test.ts:105` (mensaje exacto y propiedad del "si y solo si") |
| 9 | `pattern-core/test/validate-colorwork.test.ts:186` |
| 10 | `pattern-core/test/validate-colorwork.test.ts:201` (con propiedad: depende del total y no de `R`) |
| 11 | `pattern-core/test/validate-colorwork.test.ts:232`. **Validar con tejedora**: comentario presente |
| 12 | `pattern-core/test/validate-colorwork.test.ts:252` |
| 13 | `pattern-core/test/validate-colorwork.test.ts:263` |
| 14 | `pattern-core/test/validate-colorwork.test.ts:279` |
| 15 | `pattern-core/test/validate-colorwork.test.ts:298`; `pattern-core/test/qa-bordes-colorwork.test.ts:276` |
| 16 | `pattern-core/test/validate-colorwork.test.ts:311`; `pattern-core/test/qa-bordes-colorwork.test.ts:283` |
| 17 | `pattern-core/test/validate-colorwork.test.ts:335` (con propiedad) |
| 18 | `pattern-core/test/validate-colorwork.test.ts:365` |
| 19 | `yarn-catalog/test/catalog.test.ts:23` y `:38`. Se agregó el comentario "validar con tejedora" por la proporción 1,35, que es una nota de la tabla de muestra y no del caso |
| 20 | `pattern-core/test/derived.test.ts:198`; `pattern-core/test/validate-colorwork.test.ts:710`; `pattern-core/test/qa-bordes-colorwork.test.ts:309` |
| 21 | `pattern-core/test/validate-colorwork.test.ts:390`; `pattern-core/test/qa-bordes-colorwork.test.ts:288` |
| 22 | `pattern-core/test/validate-colorwork.test.ts:397`; `pattern-core/test/qa-bordes-colorwork.test.ts:294` |
| 23 | `pattern-core/test/validate-colorwork.test.ts:406`; `pattern-core/test/qa-bordes-colorwork.test.ts:303` |
| 24 | `pattern-core/test/derived.test.ts:208`; `pattern-core/test/property-colorwork.test.ts:169` (propiedad, CA-F5) |
| 25 | `pattern-render/test/chart-svg.test.ts:156`; `pattern-render/test/property.test.ts:100` |
| 26 | `stitch-render/test/layout.test.ts:240`. **Validar con tejedora**: se agregó el comentario, porque antes la marca estaba solo en el título |
| 27 | `stitch-render/test/layout.test.ts:185` (propiedad) |

Todas las rutas son relativas a `packages/`.

## Matriz de criterios

### Rendimiento

| ID | Estado | Evidencia y lo que falta |
|---|---|---|
| CA-P1 | CUMPLE | E2E `latencia.spec.ts`. Peor p95 al pintar con CPU ×4: 71,0 ms (círculo) |
| CA-P2 | CUMPLE (medición manual) | Medido en T10 (ADR 0004, E7). Peor caso: círculo con CPU ×4, máximo de 81,8 ms y 36,9 fps. **No hay guardia automática** del trazo continuo en la E2E |
| CA-P3 | CUMPLE | E2E. Peor p95 con CPU ×4: 89,2 ms (tubo) |
| CA-P4 | CUMPLE (medición manual) | T10: al menos 46,5 fps con CPU ×4. Sin guardia automática |
| CA-P5 | CUMPLE | `stitch-render/test/perf.test.ts` corre en el job "Núcleo" de la CI |
| CA-P6 | **PENDIENTE** (no es código) | Falta medir en el equipo de referencia y adjuntarlo al PR de cierre |
| CA-P7 | CUMPLE | E2E: 0 validaciones dentro de la ventana de edición en las 8 corridas. `ValidationList` ya corre dentro de `paintGate.run` (`StudioSidebar.tsx:367`); eso resuelve lo que la E7 dejaba pendiente |

### Funcionales

| ID | Estado | Evidencia y lo que falta |
|---|---|---|
| CA-F1 | CUMPLE | E2E `editor.spec.ts:31` y `apps/web/test/studio-editor.test.ts` |
| CA-F2 | CUMPLE (revisión) | Busqué conteos en `apps/web/src`: los totales, los puntos por vuelta, la forma y las medidas salen de `stitchTotal`, `rowStitchCounts`, `shaping` y `dimensionsCm` (`lib/studio/measures.ts`). Ver la observación O1 |
| CA-F3 | CUMPLE | Casos 7 y 27; `stitch-render/test/layout.test.ts:217`; `apps/web/test/render-bench.test.ts` |
| CA-F4 | CUMPLE | E2E `lanas-muestra.spec.ts:49`; `studio-store.test.ts` y `studio-panels.test.ts` (el documento queda sin `gauge`) |
| CA-F5 | CUMPLE | Propiedad `property-colorwork.test.ts:169` |
| CA-F6 | CUMPLE (unitaria) | `studio-autosave.test.ts:53` (2 s o menos), `studio-autosave-qa.test.ts` (conflicto, sin sobrescribir) y `disenos.test.ts:198` (`expectedUpdatedAt` en el servidor). **Falta** la E2E real con dos pestañas, que necesita sesión |
| CA-F7 | CUMPLE (con alcance) | `disenos.test.ts:108`, `:158`, `:170` y `:179`, `disenos-qa.test.ts:247` (rechazo de los errores estructurales; los errores de tejido se guardan como borrador); `shared-pattern.test.ts:146` (un borrador no se entrega a otras usuarias). Hoy no existen "Tejer este diseño" (fase 3) ni la exportación del patrón (fase 7). Publicar está cerrado en la base: no hay permiso sobre la columna `visibility` (`20261106153415_publicar_y_cuotas.sql`). Esa parte del criterio se vuelve a verificar cuando existan esas acciones |
| CA-F8 | CUMPLE | `disenos.test.ts:269` (crea una versión) y `:295` (el autoguardado nunca crea versiones); RLS de `pattern_versions` en `10_rls_check.sql`. **Falta** la E2E con sesión |
| CA-F9 | CUMPLE | `studio-store.test.ts:116` recorre las 14 acciones con deshacer y rehacer; E2E `editor.spec.ts:6` |
| CA-F10 | CUMPLE | E2E `avisos-a11y.spec.ts:6` y `movil.spec.ts:55` |
| CA-F11 | CUMPLE | Tabla de arriba y `casos-dominio.test.ts` |
| CA-F12 | CUMPLE | Casos 17 y 18. La web pasa `assumedGauge` y `weightCat` al validador (`lib/studio/measures.ts:86-92`) |
| CA-F13 | CUMPLE | E2E `formas.spec.ts:22`; `studio-panels.test.ts` |

### Accesibilidad

| ID | Estado | Evidencia y lo que falta |
|---|---|---|
| CA-A1 | CUMPLE | E2E `teclado.spec.ts` (3 pruebas) y `movil.spec.ts:26` |
| CA-A2 | CUMPLE (parcial automatizado) | La letra se lee a 4,5:1 o más sobre cada color de la paleta (`studio-a11y.test.ts:44`); bordes con contraste (`:47`). **No hay** una auditoría automática de contraste de toda la interfaz (axe o similar): el contraste global sale de la revisión de T11 |
| CA-A3 | CUMPLE | E2E `avisos-a11y.spec.ts:48` (anuncio de la casilla); `studio-a11y.test.ts`; `describeChart` en `ChartEditor.tsx` y `PreviewPane.tsx`. Probado por la usuaria con VoiceOver y NVDA el 2026-11-09: funciona bien. |

### Criterios de salida de la fase 2

| Criterio | Estado |
|---|---|
| CA-P1 a CA-P7, CA-F1 a CA-F10 y CA-A1 a CA-A3, con la evidencia en el PR | Todos cumplen salvo CA-P6 (la prueba con lector de pantalla real de CA-A3 se hizo el 2026-11-09). Las capturas de las tres formas no se revisaron en este informe: van en el PR |
| `pnpm test` y `pnpm typecheck` en verde (incluido `ai-router`), y la CI corriendo de verdad | En verde en local. No se revisaron las corridas de GitHub Actions; según el ADR 0004 y `e2e/README.md`, la CI ya corrió el 2026-11-06 |
| T1b cerrada | **PENDIENTE** (no es código). Hay un `docs/validacion-tejedoras.md` sin commit en el árbol, de otro agente |
| Aprueban `experto-tejido`, `qa-tester` y `revisor-seguridad` | `qa-tester`: aprueba lo que depende del código. Los otros dos: pendiente (T16 depende de T1b) |
| ADR 0003 a 0006 en "aceptada" o enmendados | CUMPLE: los cuatro están "aceptado", y 0003, 0004 y 0006 tienen enmiendas. El 0005 deja lo de "validar con tejedora" para antes del cierre (T1b) |

## Pruebas de propiedades (CLAUDE.md)

Las tres copias de `test/support/property.ts` (`pattern-core`, `pattern-render` y `stitch-render`) leen `SEED` y fallan si no es un entero.

**Propiedades agregadas en T14**, todas con semilla:

| Archivo | Funciones |
|---|---|
| `pattern-core/test/qa-propiedades-fase2.test.ts` | `cellIndex`, `floatLengthCm`, `yarnLetter`, `newChartPattern`, `validateYarn` |
| `stitch-render/test/qa-propiedades-vista.test.ts` | `panBy`, `fitView` (con `layoutToScreen` y `screenToLayout`), `normalizeHex`, `layoutShape` |
| `pattern-render/test/qa-propiedades.test.ts` | `isNumberedRow` |

**Funciones públicas que siguen sin propiedad propia.** Se buscó por nombre dentro de los bloques `forAll` (el detalle está en el informe). Algunas se ejercitan de forma indirecta: `setRepeat` y `addYarn` entran en los generadores de operaciones de `property-colorwork.test.ts`.

| Paquete | Funciones |
|---|---|
| `pattern-core`, colorwork de la fase 2 | Ninguna |
| `pattern-core`, amigurumi de la fase 1 | `concreteRounds`, `expandRound`, `parsePart`, `summarizePart` (solo pruebas de ejemplo); `lookupStitch`, `lookupLoop`, `loopAbbrev`, `stitchAbbrev`, `normalizeTerm`, `startAvailable` (sin prueba directa) |
| `pattern-render` | `escapeXml`, `drawChart`, `formatDecimal` y `safeHex` (internas, con pruebas de ejemplo). Las de la API pública (`chartToSvg`, `describeChart`) tienen propiedades |
| `stitch-render` | `createCanvasRenderer`, `createRenderer`, `queryGridRects`, `yarnLook` y `neutralLook` (pruebas de ejemplo o con lienzo simulado) |
| `yarn-catalog` | Ningún `forAll`: `deltaE2000`, `hexToLab`, `nearestPaletteColor`, `suggestedGauge` y `weightLabel` tienen pruebas de ejemplo; `weightInfo` no tiene prueba directa |
| `ai-router` | Ningún `forAll` (`selectModel`, `ladderAt`, `estimateCostUSD`). La regla de CLAUDE.md es para el motor y para `follow`, así que esto no bloquea |

## Fallas y observaciones

No hay fallas en `main`.

- **O1. Tamaño de la cuadrícula duplicado (menor, no es un conteo de puntos)**: `apps/web/src/lib/studio/editor-grid.ts:23-24` calcula `chart.width * chart.repeat.x` en vez de usar `fullSize` de `pattern-core`. Es el tamaño de la cuadrícula, no un conteo, así que no viola CA-F2. Sugerencia: usar `fullSize`.
- **O2. Sin guardia automática de CA-P2 y CA-P4**: el trazo continuo y los fps de zoom solo se midieron a mano en T10. Una regresión no la detecta la CI.
- **O3. El margen de latencia sigue corto**: con CPU ×4, 82,8 a 89,2 ms al cambiar repeticiones. CA-P6 en el equipo de referencia es decisivo.
- **O4. Sin auditoría automática de contraste de toda la interfaz (CA-A2)**.
- **O5. Fuera de `main`: falla una verificación RLS sin commit.** En el árbol de trabajo hay una migración nueva sin commit (`20261107010000_cuotas_proyectos_lanas.sql`) y 148 líneas nuevas en `10_rls_check.sql`, de otro agente. Con ellas, la verificación falla:
  - **Pasos**: stubs, todas las migraciones del árbol y después `10_rls_check.sql`.
  - **Esperado**: "RLS: todas las verificaciones pasaron".
  - **Obtenido**: `ERROR: insert or update on table "projects" violates foreign key constraint "projects_owner_id_fkey"`, porque la clave `22222222-…` (Bea) no está en `users`. El error sale de `10_rls_check.sql:1273`.
  - **Archivo sospechoso**: el bloque nuevo de topes de `supabase/checks/10_rls_check.sql`. Inserta un proyecto de Bea después de `delete from auth.users where id = '22222222-…'` (línea 980).
  - No afecta a `main`. Hay que corregirlo antes de mergear ese trabajo.

- **O6. Fuera de `main`: el aviso de prototipo (CA-F10) desaparece con los cambios visuales en curso.** La E2E sobre una copia del árbol de trabajo (`E2E_PORT=3178`) dio 21 pruebas aprobadas y 1 fallida. Las 4 de latencia no corrieron, porque dependen del proyecto "escritorio".
  - **Pasos**: abrir `/dev/estudio`, desplazar la página hasta la mitad y comprobar que el aviso se ve (`apps/web/e2e/avisos-a11y.spec.ts:6`).
  - **Esperado**: el aviso queda visible arriba, al medio y al final.
  - **Obtenido**: `toBeInViewport` falla en "middle", con una proporción visible de 0.
  - **Archivo sospechoso**: `apps/web/src/components/studio/StudioNotices.tsx`, cambio sin commit de `frontend-editor`. `data-zone="prototype-notice"` pasó del contenedor `sticky` a un `<p>` interior, y el estudio se rediseña a pantalla completa (junto con `globals.css` y `StudioShell.tsx`).
  - Con la misma prueba, `main` pasa. Lo tiene que resolver `frontend-editor` antes del merge: o el aviso deja de verse al desplazar (una regresión de CA-F10), o hay que ajustar la prueba al nuevo diseño en que la página ya no desplaza.

## Archivos de prueba tocados en T14

**Nuevos:**

- `packages/pattern-core/test/casos-dominio.test.ts`
- `packages/pattern-core/test/qa-propiedades-fase2.test.ts`
- `packages/pattern-render/test/qa-propiedades.test.ts`
- `packages/stitch-render/test/qa-propiedades-vista.test.ts`

**Editados** (solo se agregó el comentario `// validar con tejedora`):

- `packages/stitch-render/test/layout.test.ts` (caso 26)
- `packages/yarn-catalog/test/catalog.test.ts` (caso 19)

No se tocó código de producción, `apps/web/src` ni `apps/web/e2e`.

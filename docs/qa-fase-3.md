# QA de la fase 3 (T16) y latencia extendida (T15)

- **Autor**: `qa-tester`, 2026-11-13.
- **Código revisado**: rama `fase-3/grupo-d` en `bf19aa1`, más las pruebas de este informe (sin commit). Las correcciones de `revisor-seguridad` (T17) y `experto-tejido` (T18) llegaron después, en `6c23a65`. Según la nota de BUG-QA3-1 y 2, sus pruebas y la corrida E2E con sesión se hicieron con esas correcciones. Sobre `6c23a65` se repitieron tipos (raíz y web), 845 pruebas web, build y `follow` con semillas 7 y 99999 (68/68): todo pasa.
- **Entorno**: macOS 15.6.1 (Apple M1, 8 núcleos), Node 24.16.0, pnpm 10.28.0, Playwright 1.64.1 con Chromium completo, Supabase CLI 2.122.1 (Docker), 15 migraciones.
- **Ruido del equipo**: durante la sesión hubo procesos ajenos ocupando CPU y disco (`biome` al 99 % de un núcleo, `fileproviderd`, `mds`, purga de caché; load average entre 4 y 78). Afecta a las E2E y a la latencia; se indica en cada medición.

## Veredicto

**Apto para PR con una advertencia de latencia.** BUG-QA3-1 y BUG-QA3-2 están corregidos. CA3-P2 no queda aprobado de forma estable con CPU ×4. Lo demás que depende del código cumple:

1. **BUG-QA3-1 y BUG-QA3-2 (media), corregidos**: el interruptor "Pantalla encendida" apagado no se respetaba en dos situaciones (`KnitScreen.tsx`). Se corrigieron en la ronda de cierre (T17/T18) y CA3-T10 pasa a **CUMPLE**.
2. **Latencia con CPU ×4 en el círculo de 40.000 puntos**: 1 de 5 corridas pasó el umbral al cambiar repeticiones (105,0 ms). Sin limitar la CPU hay margen amplio (33 ms). CA3-P2 queda **en el límite**; decide CA-P6.
3. Pendientes que no son código: T1b (tejedoras), CA-P6 (equipo de referencia), lector de pantalla real en "Tejiendo", capturas de las cuatro formas con fibras para el PR.

Todo lo demás que depende del código cumple. No se modificó código de producción.

## Comandos y resultados

Con las pruebas nuevas incluidas (corrida final).

| Suite | Comando | Resultado |
|---|---|---|
| `pattern-core` | `node --test "test/**/*.test.ts"` (sin semilla, `SEED=7`, `SEED=99999`) | 432/432 en las tres |
| `yarn-catalog` | ídem | 36/36 en las tres |
| `ai-router` | ídem | 36/36 en las tres |
| `stitch-render` | ídem | 87/87 en las tres |
| `pattern-render` | ídem | 70/70 en las tres |
| `follow` | ídem | 64/64 en las tres |
| Tipos de los paquetes | `pnpm exec tsc -p tsconfig.json` | OK |
| Web | `typecheck`, `typecheck:test`, `typecheck:e2e` | OK los tres |
| Web (Vitest) | `pnpm --filter @loopitalab/web test` | 48 archivos, 825/825 |
| Web (build) | `pnpm --filter @loopitalab/web build` con las variables de ejemplo de la CI | OK (antes de agregar pruebas; no cambió código de producción) |
| E2E sin sesión | `pnpm --filter @loopitalab/web e2e --workers=1` | **43/43 en 1 de 4 corridas completas**; ver "E2E sin sesión bajo carga" |
| E2E con sesión | `E2E_SUPABASE=1 … e2e --project=sesion --workers=1` | 47/47 (las 2 pruebas de BUG-QA3-1 y 2 ya pasan sin marca `test.fail`) |
| RLS | `10_rls_check.sql` contra la Supabase local (15 migraciones) | 66 `ok`, "todas las verificaciones pasaron" |
| RLS con stubs (job `base-de-datos` de la CI) | — | **No ejecutado** (sin `psql` ni Postgres 16 local). El bloque agregado al check es SQL estándar |

## Latencia (T15)

p95 en ms; umbral de 100 ms. Validaciones dentro de una ventana de edición y ediciones descartadas: **0 en todas las corridas**.

**Sin limitar la CPU** (una corrida, load ~5):

| Escenario | Pintar | Repeticiones | Hover (CA3-P1) | Fila (CA3-P3) |
|---|---|---|---|---|
| Plano | 17,1 | 19,5 | 10,8 | 16,0 |
| Tubo | 17,8 | 22,5 | 14,5 | 15,8 |
| Círculo de rombos (40.000 puntos) | 28,4 | 33,2 | 24,7 | 22,2 |
| Copa | 18,5 | 19,4 | 15,7 | 18,7 |

**CPU ×4** (`E2E_CPU_RATE=4`, tres corridas, load 6 a 11):

| Escenario | Pintar | Repeticiones | Hover | Fila |
|---|---|---|---|---|
| Plano | 29,8 / 23,8 / 32,9 | 60,3 / 48,1 / 46,8 | 26,7 / 19,8 / 22,2 | 15,2 / 15,5 / 13,9 |
| Tubo | 30,3 / 34,3 / 34,6 | 56,0 / 66,7 / 60,4 | 22,4 / 27,5 / 23,7 | 13,7 / 15,7 / 14,8 |
| Círculo de rombos | 95,8 / 73,0 / 85,1 | 98,2 / 86,5 / **105,0** | 76,1 / 75,2 / 76,1 | 41,5 / 39,9 / 41,3 |
| Copa | 22,5 / 21,9 / 22,7 | 42,2 / 40,2 / 50,8 | 28,7 / 32,1 / 27,0 | 26,3 / 27,7 / 26,0 |

- La tercera corrida falló en el círculo de rombos: repeticiones 105,0 ms (CA-P3 con fibras, es decir CA3-P2).
- **A/B con y sin aspecto por fibra** (solo círculo de rombos, CPU ×4, intercalado; `E2E_FLAT_COLORS=1`, variable nueva de `latencia.spec.ts`): con fibras 80,3 / 91,5 al pintar y 88,9 / 97,9 en repeticiones; con colores planos 90,0 / 83,4 y 86,8 / 89,2. La variación entre corridas (±10 ms) es mayor que el costo de las fibras: con dos pares no se puede atribuir la falla a las fibras.
- En la fase 2 el mismo escenario medía 82,8 a 86,7 ms. El margen que entonces era de unos 11 ms ahora es nulo en este equipo con ruido.
- Hover y fila tienen margen en todos los escenarios (peor caso 76,1 y 41,5 ms).

**`row-to-paint` en la pantalla "Tejiendo" real** (prueba nueva, 50 avances, plantilla "Banda en tubo", 768 puntos): 17,8 ms sin limitar; 17,9 / 16,7 / 16,9 ms con CPU ×4. Es un diseño chico; el caso pesado de CA3-P3 lo mide el banco de `latencia.spec.ts`.

### Cobertura en la CI

- **CA3-P1, CA3-P2 y CA3-P3** están cubiertos por el job "E2E (estudio)": corre el proyecto `latencia` (pintar, repeticiones, hover y fila en las cuatro formas, con fibras) con `E2E_LATENCY_BUDGET_MS=160`.
- **CA3-P6** corre en el job "Núcleo" (`follow`).
- **CA3-P3 en la pantalla real** corre en el job "E2E con sesión", que **no define** `E2E_LATENCY_BUDGET_MS`: usa 100 ms en un runner más lento. Propuesta (no aplicada; es de `devops`): agregar `E2E_LATENCY_BUDGET_MS: "160"` al `env` de ese job, igual que en el otro.
- Propuesta: mover "hover-to-paint con el selector real" (`selector-lanas.spec.ts`) al proyecto `latencia`, que corre solo. Hoy corre en `escritorio` junto a las demás y fue la prueba más sensible a la carga.
- No se editó `ci.yml`.

### Guía para medir CA-P6 y los escenarios nuevos en el equipo de referencia

1. Prepara el equipo: enchufado, sin ahorro de energía, sin otras aplicaciones pesadas. Anota modelo, procesador, memoria, sistema y versión de Chromium (`pnpm --filter @loopitalab/web exec playwright --version`).
2. Una vez: `nvm use && pnpm install && pnpm --filter @loopitalab/web exec playwright install chromium`.
3. Estudio, tres corridas: `pnpm --filter @loopitalab/web e2e --project=latencia --no-deps` (la primera construye; las siguientes pueden llevar `E2E_SKIP_BUILD=1`).
4. Opcional, condiciones del ADR 0004: lo mismo con `E2E_CPU_RATE=4`.
5. Opcional, costo de las fibras: lo mismo con `E2E_FLAT_COLORS=1` y compara.
6. "Tejiendo" (necesita Docker; pasos de `apps/web/e2e/README.md`, sección "Con sesión"): `E2E_SUPABASE=1 pnpm --filter @loopitalab/web e2e --project=sesion -g "row-to-paint en la pantalla real"`.
7. Copia al PR las líneas `[latencia] {...}` de la salida (una por escenario y corrida).
8. Criterio: en las tres corridas sin limitar, p95 bajo 100 ms en `pintar`, `repeticiones`, `hover` y `fila` de los cuatro escenarios y en "Tejiendo"; `validaciones` y `descartadas` en 0. Si el círculo de rombos queda sobre 90 ms, avisa a `render-puntos` antes de cerrar la fase.

## Diagnósticos

### Falla intermitente de `follow` (F3-13)

- No se reprodujo: 30 corridas en reposo y 30 con 16 bucles ocupados sobre 8 núcleos, 0 fallas, antes y después del cambio (120 corridas).
- La guardia original medía el promedio de 500 llamadas sin calentamiento; el peor valor bajo carga fue 0,17 ms (umbral 1 ms). Una sola pausa larga del planificador podía decidir el resultado.
- Ahora: calentamiento de 300 llamadas y **mediana de 9 tandas** de 200; la comparación de `planChart` usa el mínimo de 5 mediciones. El criterio (menos de 1 ms por `stepAt`) no cambió. Con el cambio: 0,010 a 0,027 ms en reposo y hasta 0,058 ms con carga.

### E2E sin sesión bajo carga

- Cuatro corridas completas: 3 fallaron (4, 4 y 1 pruebas) y 1 pasó 43/43. Todas las fallas fueron en `selector-lanas.spec.ts`, en pruebas distintas cada vez.
- Los errores son de infraestructura del navegador, no aserciones del producto: "Test timeout while setting up context", "Tearing down context exceeded the test timeout", y `hover()` colgado 60 s en "hover-to-paint con el selector real".
- Las corridas fallidas duraron 6,1 a 6,5 min (4,5 min la buena) con load average de 20 a 78. La prueba más repetida, aislada, pasó 6/6 en 3,4 s.
- Conclusión: carga del equipo, no un defecto reproducible. No se descarta del todo: conviene mirar la primera corrida de la CI de este PR. El repositorio está en `~/Documents` (sincronizado); cada `next build` reescribe unos 900 MB y despierta a `fileproviderd` y Spotlight.

## Revisión cruzada de las piezas de complejidad alta

| Pieza | Casos límite agregados | Resultado |
|---|---|---|
| T4 `follow` | `packages/follow/test/qa-bordes.test.ts` (21 pruebas): gráfico 1 × 1; 1 × 1 con 500 × 500 repeticiones en ida y vuelta; todo `NO_STITCH` salvo una casilla; 32 lanas; `top_down` + filas + espejo; puntero al final; diseño que se acorta (más corto, justo hasta la fila en curso, menos repeticiones, plan dañado, casilla que pasa a `NO_STITCH`) | Pasan. Una observación (O-F3-2) |
| T7 migración y funciones | Vía `10_rls_check.sql`: 9 bloques "T7" en verde. Agregado: las cotas exactas del puntero se aceptan (100001 y 100000) y los mínimos se rechazan | Pasa |
| T8 render | `packages/stitch-render/test/qa-bordes-fase3.test.ts` (8 pruebas): 1 × 1 en las tres formas y dos direcciones; 250.000 puntos con baldosas; una sola casilla con punto; 32 lanas y 32 aspectos con fibras; menos aspectos que lanas; vista previa de una lana inexistente; fila resaltada en el último valor, fuera de rango y con valores dañados; misma fila en `bottom_up` y `top_down` | Pasan |
| T15 latencia | Tres corridas ×4, A/B de fibras y medición en la pantalla real | Ver arriba |

## Casos de dominio F3-1 a F3-42 → pruebas

`packages/pattern-core/test/casos-dominio-fase3.test.ts` (nuevo) fija esta tabla: el documento tiene exactamente los casos F3-1 a F3-42, cada uno tiene una prueba activa con "F3-N" en el título (o en el del grupo que la contiene) y los seis marcados "validar con tejedora" (F3-4, 6, 21, 30, 32 y 35) llevan el comentario `// validar con tejedora`. A F3-32 y F3-35 les faltaba el comentario y se agregó. Rutas relativas a `packages/`, o a `apps/web/` las que empiezan con `web/`.

| Caso | Prueba (archivo: nombre) | Estado |
|---|---|---|
| F3-1 | `follow/test/casos-dominio.test.ts`: «caso F3-1: motivo 4 × 2, R = 3, en redondo» | CUMPLE |
| F3-2 | `follow/test/casos-dominio.test.ts`: «caso F3-2: con espejo, los tramos de la fila 0 se invierten y nada más cambia» | CUMPLE |
| F3-3 | `follow/test/casos-dominio.test.ts`: «caso F3-3: ida y vuelta, lado y sentido; colores por el derecho en la fila por el revés» | CUMPLE |
| F3-4 | `follow/test/casos-dominio.test.ts`: «caso F3-4: top_down no cambia los pasos (P7)» | CUMPLE (valor actual; **validar con tejedora**, T1b) |
| F3-5 | `follow/test/casos-dominio.test.ts`: «caso F3-5: círculo top_down de 8 a 16 puntos con R = 8» | CUMPLE |
| F3-6 | `follow/test/casos-dominio.test.ts`: «caso F3-6: cuña de R = 8 que baja de 80 a 72; stitchesDone cuenta casillas» | CUMPLE (valor actual; **validar con tejedora**, T1b) |
| F3-7 | `follow/test/casos-dominio.test.ts`: «caso F3-7: tres veces nextRow termina el gráfico; una cuarta no cambia nada»; `web/test/tejiendo-ui.test.ts`: ««Gráfico terminado» (F3-7): falta rematar; en bottom_up menciona los N puntos que quedan» | CUMPLE |
| F3-8 | `follow/test/casos-dominio.test.ts`: «caso F3-8: R = 4, fila de 16 puntos; nextRepeat y repetición resaltada» | CUMPLE |
| F3-9 | `follow/test/casos-dominio.test.ts`: «caso F3-9: el plan entrega workedIn para decir vuelta o fila»; `web/test/a11y-tejiendo-textos.test.ts`: «vuelta y fila según workedIn (F3-9) › rowCountText: singular y plural»; `web/test/tejiendo-ui.test.ts`: «textos: vuelta o fila según workedIn (F3-9) › contador, resumen y anuncio» | CUMPLE |
| F3-10 | `follow/test/casos-dominio.test.ts`: «caso F3-10: fila por el revés; follow entrega side y technique, no el tipo de punto»; `web/test/tejiendo-ui.test.ts`: «lado y sentido (F3-10): nunca «se invierten» ni «punto revés»» | CUMPLE |
| F3-11 | `follow/test/casos-dominio.test.ts`: «caso F3-11: punteros dañados» | CUMPLE |
| F3-12 | `follow/test/casos-dominio.test.ts`: «caso F3-12: la fila 12 cambia de contenido entre dos versiones»; `web/test/tejiendo-ui.test.ts`: «F3-12: avisa si la fila cambió, si se acotó o si no hay nada que pasar»; `web/e2e/sesion/tejer.spec.ts`: «pasar a la versión actual tras editar el diseño: avisa qué cambia antes de confirmar (F3-12)» | CUMPLE |
| F3-13 | `follow/test/casos-dominio.test.ts`: «caso F3-13: stepAt en 200 de ancho en menos de 1 ms; planChart no recorre las filas» | CUMPLE |
| F3-14 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-14: en redondo, fila de 12 puntos A B + 10 A» | CUMPLE |
| F3-15 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-15: la misma fila en ida y vuelta (no se cuenta de orillo a orillo)» | CUMPLE |
| F3-16 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-16: ida y vuelta, fila B AAAAA B» | CUMPLE |
| F3-17 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-17: una fila de una sola lana no suma flotantes, aunque la otra aparezca en otras filas» | CUMPLE |
| F3-18 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-18: tres lanas en redondo, A B C + 9 A» | CUMPLE |
| F3-19 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-19: duplicar repeat.y duplica; repeat.x duplica en redondo y en ida y vuelta cuenta el hueco» | CUMPLE |
| F3-20 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-20: la suma de stitches es yarnTotals y stitchTotal» | CUMPLE |
| F3-21 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-21 (conteo): gorro de 112 × 60 en damero A B en redondo da 3.360 puntos y 3.360 flotantes por …»; `yarn-catalog/test/lanas.test.ts`: «caso F3-21: gorro de 2 lanas en damero, cat 4 con muestra supuesta»; `web/test/studio-yarn-picker.test.ts`: «F3-21: damero de dos lanas con muestra supuesta de la categoría 4» | CUMPLE (valor actual; **validar con tejedora**, T1b) |
| F3-22 | `pattern-core/test/yarn-usage.test.ts`: «caso F3-22 (conteo): bandas de vuelta completa, sin flotantes»; `yarn-catalog/test/lanas.test.ts`: «caso F3-22: bandas sin flotantes»; `web/test/studio-yarn-picker.test.ts`: «F3-22: bandas completas no tienen flotantes (sin su supuesto) y gastan menos» | CUMPLE |
| F3-23 | `yarn-catalog/test/lanas.test.ts`: «caso F3-23: muestra del documento de 22 puntos»; `web/test/studio-yarn-picker.test.ts`: «F3-23: con la muestra del documento no hay 'muestra supuesta' y los metros bajan con más puntos en 10 cm» | CUMPLE |
| F3-24 | `yarn-catalog/test/lanas.test.ts`: «caso F3-24: categoría 7 marca baja confianza»; `web/test/studio-yarn-picker.test.ts`: «F3-24: la categoría 7 marca baja confianza» | CUMPLE |
| F3-25 | `yarn-catalog/test/lanas.test.ts`: «caso F3-25: crochet no tiene estimación»; `web/test/studio-yarn-picker.test.ts`: «F3-25: en crochet no hay estimación (no se inventa) pero sí los puntos del motor» | CUMPLE |
| F3-26 | `yarn-catalog/test/lanas.test.ts`: «caso F3-26: propiedades»; `web/test/studio-yarn-picker.test.ts`: «metraje por lana (F3-21 a F3-27) › F3-21: damero de dos lanas con muestra supuesta de la categoría 4» | CUMPLE |
| F3-27 | `web/test/studio-yarn-picker.test.ts`: «F3-27: el rótulo, los supuestos, el alcance y la sugerencia de tejer la muestra con las lanas» | CUMPLE |
| F3-28 | `yarn-catalog/test/lanas.test.ts`: «caso F3-28: aran es la categoría 4 por nombre en inglés»; `web/test/lanas-form.test.ts`: «búsqueda de grosor (F3-28 a F3-33) › «aran» da la categoría 4 y «DK» la 3 primero»; `web/test/studio-yarn-picker.test.ts`: «grosor: búsqueda y lista (T1-8, F3-28 a F3-33) › sin búsqueda están las 8 categorías; con búsqueda, la…» | CUMPLE |
| F3-29 | `yarn-catalog/test/lanas.test.ts`: «caso F3-29: primer resultado de DK, fingering, sport, chunky, lace»; `web/test/lanas-form.test.ts`: «búsqueda de grosor (F3-28 a F3-33) › «aran» da la categoría 4 y «DK» la 3 primero»; `web/test/studio-yarn-picker.test.ts`: «grosor: búsqueda y lista (T1-8, F3-28 a F3-33) › sin búsqueda están las 8 categorías; con búsqueda, la…» | CUMPLE |
| F3-30 | `yarn-catalog/test/lanas.test.ts`: «caso F3-30: light da la 2 (alias aproximado) y la 3»; `web/test/lanas-form.test.ts`: «búsqueda de grosor (F3-28 a F3-33) › «aran» da la categoría 4 y «DK» la 3 primero»; `web/test/studio-yarn-picker.test.ts`: «grosor: búsqueda y lista (T1-8, F3-28 a F3-33) › sin búsqueda están las 8 categorías; con búsqueda, la…» | CUMPLE (valor actual; **validar con tejedora**, T1b) |
| F3-31 | `yarn-catalog/test/lanas.test.ts`: «caso F3-31: mediano y grueso son alias aproximados»; `web/test/lanas-form.test.ts`: «búsqueda de grosor (F3-28 a F3-33) › «aran» da la categoría 4 y «DK» la 3 primero»; `web/test/studio-yarn-picker.test.ts`: «grosor: búsqueda y lista (T1-8, F3-28 a F3-33) › sin búsqueda están las 8 categorías; con búsqueda, la…» | CUMPLE |
| F3-32 | `yarn-catalog/test/lanas.test.ts`: «caso F3-32: ply da vacío con ayuda»; `web/test/lanas-form.test.ts`: «búsqueda de grosor (F3-28 a F3-33) › «aran» da la categoría 4 y «DK» la 3 primero»; `web/test/studio-yarn-picker.test.ts`: «grosor: búsqueda y lista (T1-8, F3-28 a F3-33) › sin búsqueda están las 8 categorías; con búsqueda, la…» | CUMPLE (valor actual; **validar con tejedora**, T1b) |
| F3-33 | `yarn-catalog/test/lanas.test.ts`: «caso F3-33: un carácter da vacío con too_short»; `web/test/lanas-form.test.ts`: «búsqueda de grosor (F3-28 a F3-33) › «aran» da la categoría 4 y «DK» la 3 primero»; `web/test/studio-yarn-picker.test.ts`: «grosor: búsqueda y lista (T1-8, F3-28 a F3-33) › sin búsqueda están las 8 categorías; con búsqueda, la…» | CUMPLE |
| F3-34 | `yarn-catalog/test/lanas.test.ts`: «caso F3-34: los JSON no contienen nombres de marcas conocidas» | CUMPLE |
| F3-35 | `stitch-render/test/look-fibras.test.ts`: «F3-35: 100 % mohair tiene halo alto y definición baja; 100 % algodón, definición alta y halo bajo»; `web/test/studio-preview-fibras.test.ts`: «F3-35: cambiar 70/30 a 30/70 lana/mohair vuelve a pasar los aspectos; cambiar solo el grosor no redibuja» | CUMPLE (valor actual; **validar con tejedora**, T1b) |
| F3-36 | `yarn-catalog/test/lanas.test.ts`: «caso F3-36: un color de la paleta está a 0 de sí mismo y los demás están más lejos»; `web/test/studio-yarn-picker.test.ts`: «F3-36: 'prácticamente igual' solo bajo el umbral; un color de la paleta es exacto»; `web/test/lanas-form.test.ts`: «color (F3-36) › un hex exacto de la paleta lleva su paletteId; uno que no, nunca» | CUMPLE |
| F3-37 | `web/test/qa-fase3-proyectos.test.ts`: «F3-37: diseño valid con CHART_FLOAT_LONG › la pantalla previa muestra la advertencia con el máximo y l…»; `web/test/tejiendo-ui.test.ts`: «render estático: pantalla previa (F3-37, F3-39, F3-40) › muestra supuesta rotulada, forma de trabajo, …» | CUMPLE |
| F3-38 | `web/e2e/sesion/tejer.spec.ts`: «un diseño con un error de tejido no se puede tejer: explica qué lo impide y enlaza al estudio (F3-38)»; `web/test/qa-fase3-proyectos.test.ts`: «F3-38: diseño con un error de tejido › getKnitPreview y startProjectFromDesign responden NOT_KNITTABLE…» | CUMPLE |
| F3-39 | `web/test/qa-fase3-proyectos.test.ts`: «F3-39: pantalla previa al empezar › muestra supuesta rotulada, forma de trabajo (top_down, ida y vuelt…»; `web/test/tejiendo-ui.test.ts`: «render estático: pantalla previa (F3-37, F3-39, F3-40) › muestra supuesta rotulada, forma de trabajo, …» | CUMPLE |
| F3-40 | `web/test/qa-fase3-proyectos.test.ts`: «F3-40: tubo o círculo con rows › plano de ida y vuelta y tubo en redondo no lo dicen»; `web/test/tejiendo-ui.test.ts`: «render estático: pantalla previa (F3-37, F3-39, F3-40) › muestra supuesta rotulada, forma de trabajo, …» | CUMPLE |
| F3-41 | `web/e2e/sesion/tejer.spec.ts`: «conflicto entre dos dispositivos: pregunta con las dos posiciones y nunca pisa en silencio (F3-41)»; `web/test/qa-fase3-proyectos.test.ts`: «F3-41: conflicto de avance entre dispositivos › ida y vuelta: «fila» en las dos posiciones, con la hor…»; `web/test/tejiendo-cola.test.ts`: «cola del avance: conflicto entre dispositivos (F3-41) › si el servidor ya tiene el mismo puntero, adop…» (y 1 archivo más) | CUMPLE |
| F3-42 | `web/test/qa-fase3-proyectos.test.ts`: «F3-42: versión fijada que una regla nueva ya no valida › valid falso: loadProject la muestra con aviso…» | CUMPLE |

## Matriz de criterios

Estados: CUMPLE, NO CUMPLE, PENDIENTE (no depende del código).

### Rendimiento

| ID | Estado | Prueba y evidencia |
|---|---|---|
| CA3-P1 | CUMPLE | `web/e2e/latencia.spec.ts`: «latencia <escenario>: pintar, repeticiones, hover y fila…». Peor p95 de hover con CPU ×4: 76,1 ms |
| CA3-P2 | **CUMPLE sin limitar la CPU; NO CUMPLE de forma estable con CPU ×4** | Misma prueba. Sin limitar: peor p95 33,2 ms. Con CPU ×4, círculo de rombos en repeticiones: 98,2 / 86,5 / 105,0 / 88,9 / 97,9 ms (1 de 5 sobre el umbral). CA-P2 y CA-P4 siguen sin guardia automática (medición manual de la fase 2) |
| CA3-P3 | CUMPLE | `latencia.spec.ts` (banco, peor p95 con CPU ×4: 41,5 ms) y `web/e2e/sesion/qa-fase3-tejer.spec.ts`: «row-to-paint en la pantalla real: 50 avances de fila…» (17,9 ms con CPU ×4) |
| CA3-P4 | CUMPLE | `web/test/studio-preview-fibras.test.ts` y `web/test/qa-fase3-grupo-c.test.ts`: «intercalada con ediciones reales, por el motor y por previewControls…»; `web/e2e/selector-lanas.spec.ts`: «color: pasar el cursor previsualiza sin tocar el documento…» |
| CA3-P5 | CUMPLE | `latencia.spec.ts`: 0 validaciones dentro de las ventanas en todas las corridas; `web/e2e/selector-lanas.spec.ts`: «pintar una celda recalcula el metraje después del frame…» |
| CA3-P6 | CUMPLE | `follow/test/casos-dominio.test.ts`: «caso F3-13: stepAt en 200 de ancho en menos de 1 ms…» (0,010 ms; guardia robustecida). Corre en el job "Núcleo" |
| CA-P6 (fase 2) | **PENDIENTE** | Medición en el equipo de referencia; guía arriba. Ahora es decisiva por CA3-P2 |

### Lanas

| ID | Estado | Prueba y evidencia |
|---|---|---|
| CA3-L1 | CUMPLE | Casos F3-28 a F3-33 (`yarn-catalog/test/lanas.test.ts`); `web/e2e/selector-lanas.spec.ts`: «grosor: la búsqueda filtra por nombre y alias, 'ply' explica…» |
| CA3-L2 | CUMPLE | Acción: `web/test/lanas-actions.test.ts`: «rechaza %s con INVALID_YARN y sin escribir» (no suma 100, porcentaje 0, más de 10 fibras). Base: `10_rls_check.sql` ('la composición debe sumar 100'). Interfaz: `selector-lanas.spec.ts`: «composición: avisos por fibra, suma a 100 y solo se guarda lo válido» |
| CA3-L3 | CUMPLE | `web/test/studio-yarn-picker.test.ts`: «paleta: una muestra por color con nombre accesible, foco itinerante y estado que no depende del color»; `web/e2e/qa-grupo-c.spec.ts`: «abrir, pestañas, grosor, paleta y elegir solo con teclado…» |
| CA3-L4 | CUMPLE | Caso F3-36; `selector-lanas.spec.ts`: «color personalizado: 'prácticamente igual'… y botón para usarlo»; `lanas-actions.test.ts`: «un paletteId inexistente o que no corresponde al hex se rechaza…» |
| CA3-L5 | CUMPLE | `selector-lanas.spec.ts`: «color: pasar el cursor previsualiza… elegir escribe un paso, Esc quita y cierra»; `web/e2e/qa-grupo-c.spec.ts` (teclado y táctil) |
| CA3-L6 | CUMPLE en código; **PENDIENTE** las capturas | Caso F3-35 (`stitch-render/test/look-fibras.test.ts`, 11 pruebas). Las capturas de las cuatro formas van en el PR; no se revisaron aquí |
| CA3-L7 | CUMPLE | `selector-lanas.spec.ts`: «grosor: … elegir cambia la muestra supuesta y el metraje» y «con la muestra de la usuaria desaparece 'muestra supuesta'…»; `web/e2e/lanas-muestra.spec.ts` |
| CA3-L8 | CUMPLE | `web/e2e/sesion/lanas.spec.ts`, `lanas-estudio.spec.ts` (3 pruebas) y `sesion/qa-grupo-c.spec.ts`: «tope de 500 lanas…» |
| CA3-L9 | CUMPLE | Caso F3-27; `selector-lanas.spec.ts`: «cada cifra se rotula como estimación, con supuestos, alcance…»; `web/test/qa-fase3-proyectos.test.ts`: «nada se calcula en apps/web: puntos y metros son los de yarnUsage + estimateYarnLength» |
| CA3-L10 | CUMPLE | `pattern-core/test/yarn-usage.test.ts` («yarnUsage: propiedades», 9) y `yarn-catalog/test/lanas.test.ts` (F3-26), con las tres semillas |
| CA3-L11 | CUMPLE | Caso F3-34: «los JSON no contienen nombres de marcas conocidas» |

### Tejer

| ID | Estado | Prueba y evidencia |
|---|---|---|
| CA3-T1 | CUMPLE | `web/e2e/sesion/tejer.spec.ts` (desde el estudio, desde Mis diseños y F3-38); `web/test/proyectos-tejer.test.ts`: «la validación es obligatoria: … NOT_KNITTABLE…» y «si el diseño cambia entre leer y fijar… CONFLICT (pattern)» |
| CA3-T2 | CUMPLE | `proyectos-tejer.test.ts`: «reutiliza la versión idéntica y crea otra si el diseño cambió»; check: 'T7: start_chart_project … reutiliza la versión idéntica' |
| CA3-T3 | CUMPLE (E2E solo en tubo) | Una sola fuente (`step.row` de `follow` va al gráfico y a la vista previa). `tejer.spec.ts` comprueba `data-highlight-row`; `follow` P4, P5, P7 y P15; `stitch-render/test/qa-bordes-fase3.test.ts`: «la fila resaltada es la misma fila del gráfico en bottom_up y top_down…»; `web/test/tejiendo-ui.test.ts` (espejo). **Sin E2E de "Tejiendo"** en plano, círculo ni `top_down` (O-F3-3) |
| CA3-T4 | CUMPLE | `tejer.spec.ts`: «pantalla previa, crear el proyecto, avanzar con botones y teclado…»; `tejiendo-ui.test.ts`: «flechas, Espacio, Enter y Av Pág avanzan…» |
| CA3-T5 | CUMPLE | `tejer.spec.ts` (recarga) y `qa-fase3-tejer.spec.ts`: «al volver a la pantalla se relee el avance: adopta el del otro dispositivo…» (dos contextos) |
| CA3-T6 | CUMPLE | `tejer.spec.ts`: «conflicto entre dos dispositivos… (F3-41)»; `web/test/tejiendo-cola.test.ts` (punteros iguales, sin aviso); `qa-fase3-tejer.spec.ts`: «VERSION_CHANGED: si otro contexto pasa el proyecto a la versión nueva, este avisa, no escribe y recarga» |
| CA3-T7 | CUMPLE | `qa-fase3-tejer.spec.ts`: «con la red cortada se sigue avanzando, el estado lo dice, nada se pierde y al volver la red llega a la base»; `tejiendo-cola.test.ts`: «descarta y borra lo de otra cuenta, otra versión, caducado…»; `web/e2e/sesion/cuenta.spec.ts` (cerrar sesión borra `loopitalab:*:avance:*`, ampliada). Al eliminar la cuenta: llamada en `YourData.tsx:106`, sin E2E |
| CA3-T8 | CUMPLE | `tejer.spec.ts`: «pasar a la versión actual tras editar el diseño: avisa qué cambia antes de confirmar (F3-12)» |
| CA3-T9 | CUMPLE | `tejer.spec.ts`: «empezar desde Mis diseños, borrar el proyecto… y recién entonces el diseño»; check: 'T7: … un diseño con proyectos no se borra' y 'T7: eliminar la cuenta con proyectos y versiones fijadas borra todo' |
| CA3-T10 | **CUMPLE** | Pasa: `qa-fase3-tejer.spec.ts`: «se pide al entrar, se vuelve a pedir al volver de segundo plano, y se suelta al apagar el interruptor y al salir» y «si el navegador rechaza el bloqueo, se avisa…». BUG-QA3-1 y BUG-QA3-2 corregidos; sus pruebas pasan |
| CA3-T11 | CUMPLE | `web/e2e/sesion/tejer-a11y.spec.ts`: «a 390 px la barra cabe, los controles miden ≥ 56 px y quedan en el 40 % inferior» e «interruptor de mano…» |
| CA3-T12 | CUMPLE | `follow/test/property.test.ts`: P1 a P16, con las tres semillas |
| CA3-T13 | CUMPLE (revisión) | En `components/knit` y `lib/projects` solo hay `+ 1` de presentación (fila, repetición y casilla en base 1). `web/test/qa-fase3-lista-proyectos.test.ts`: «el total de filas es el de follow…» |
| CA3-T14 | CUMPLE | Check: 'T7: pattern_version eliminada…' y 'T7: el cliente no fija versiones; escribe solo su puntero con updated_at…' |
| CA3-T15 | CUMPLE | Casos F3-37, F3-39 y F3-40; `tejer.spec.ts` (pantalla previa) |
| CA3-T16 | CUMPLE | Casos F3-7, F3-9 y F3-10; `web/test/a11y-tejiendo-textos.test.ts`; `tejiendo-ui.test.ts`: «fila con disminuciones: «casilla N de M»…» |

### Accesibilidad

| ID | Estado | Prueba y evidencia |
|---|---|---|
| CA3-A1 | CUMPLE en automático; **PENDIENTE** lector de pantalla real | `tejer-a11y.spec.ts`: «la región viva no anuncia al cargar y anuncia una vez, completo, al avanzar», «el conflicto abre un <dialog> modal…», «el gráfico en texto marca la fila actual…» |
| CA3-A2 | CUMPLE | `web/e2e/qa-grupo-c.spec.ts` (selector solo con teclado); `sesion/lanas.spec.ts`; `studio-yarn-picker.test.ts` (nombre accesible y letra) |
| CA3-A3 | **PENDIENTE** (verificación manual) | Hay código para movimiento reducido (`globals.css:78`, `KnitChart.tsx:89`) y pruebas a 320 px y 568 px de alto. **No hay prueba automática** de texto al 200 % ni de contraste de la fila resaltada; depende de la revisión de T13, que este informe no verificó |

### Criterios de salida de la fase 3

| Criterio | Estado |
|---|---|
| CA3-* cumplidos con la evidencia en el PR | Cumplen salvo CA3-P2 con CPU ×4 (en el límite) y los pendientes no-código (CA3-A1 lector real, CA3-A3, capturas de CA3-L6) |
| Pruebas y tipos en verde | Sí en local. E2E sin sesión: sensible a la carga del equipo (ver diagnóstico) |
| T1b cerrada | **PENDIENTE** (no es código) |
| CA-P6 | **PENDIENTE** (no es código) |
| Aprobaciones | `qa-tester`: apto para PR con observaciones (BUG-QA3-1 y 2 corregidos). `revisor-seguridad` (T17): revisión hecha el 2026-11-12, sin hallazgos críticos ni altos ([docs/seguridad.md](seguridad.md)). `experto-tejido` (T18): correcciones aplicadas en `6c23a65`; aprobación final pendiente de T1b |

## Fallas y observaciones

### BUG-QA3-1 (media): con "Pantalla encendida" apagada, volver a la pestaña vuelve a bloquear la pantalla

- **Pasos**: abrir `/proyectos/<id>/tejer`; apagar "Pantalla encendida"; pasar la pestaña a segundo plano y volver.
- **Esperado**: no se pide el bloqueo; ningún bloqueo activo.
- **Obtenido**: `navigator.wakeLock.request("screen")` se llama otra vez y el bloqueo queda activo con el interruptor en "apagado" (3 pedidos y 1 activo en vez de 2 y 0).
- **Archivo sospechoso**: `apps/web/src/components/knit/KnitScreen.tsx`. `onVisibility` (línea 150) llama a `reacquire` (línea 155) dentro de un efecto cuyas dependencias no lo incluyen (`eslint-disable` en la línea 178): usa el `reacquire` del primer render, con `wakeOn = true`.
- **Prueba**: `apps/web/e2e/sesion/qa-fase3-tejer.spec.ts`, «BUG-QA3-1: …», antes marcada `test.fail`; hoy pasa.

### BUG-QA3-2 (media): con la preferencia guardada en "apagada", entrar a "Tejiendo" deja la pantalla bloqueada

- **Pasos**: con `localStorage["loopitalab:tejiendo:pantalla"] = "0"`, abrir `/proyectos/<id>/tejer`.
- **Esperado**: interruptor apagado y ningún bloqueo activo.
- **Obtenido**: interruptor apagado y 1 bloqueo activo hasta salir de la pantalla.
- **Archivo sospechoso**: el mismo. `wakeOn` empieza en `true` (línea 85) y el primer efecto pide el bloqueo (línea 239) antes de leer la preferencia (línea 214). Al pasar a `false` el pedido sigue en vuelo, no hay nada que soltar, y `reacquire` guarda el centinela al resolverse (línea 130) sin volver a mirar `wakeOn`.
- **Prueba**: mismo archivo, «BUG-QA3-2: …», antes marcada `test.fail`; hoy pasa.

**Estado**: corregidos (`wakeRef` lee la preferencia antes del primer pedido y `reacquire` ya no usa estado de React viejo). Se quitó la marca `test.fail` y las dos pruebas pasan.

### Observaciones

- **O-F3-1. Latencia sin margen en el círculo de 40.000 puntos con CPU ×4** (ver "Latencia"). Para `render-puntos`; riesgo R3-1 del roadmap.
- **O-F3-2. `remapPointer`: diseño acortado justo hasta la fila en curso** (baja). Con el avance en la fila 11 de 12 y una versión nueva de 10 filas, el resultado es "terminado" con `rowChanged: true` y `clamped: false` (`packages/follow/src/chart.ts:375`, `q.rowsDone > to.totalRows`). La ficha dice "La vuelta en la que vas se teje distinto…" en vez de "La versión nueva es más corta…" (`ProjectSheet.tsx:214`). El puntero queda bien; solo el mensaje. Estado: corregido en el código después de este informe (`clamped` pasa a `true` en ese caso; ADR 0007, enmienda E-1). El texto de la ficha queda por validar con tejedora.
- **O-F3-3. "Tejiendo" solo tiene E2E con "Banda en tubo"** (en redondo, tubo, `bottom_up`). Plano en ida y vuelta, círculo, `top_down` y espejo se cubren con unitarias y con render estático. Sugerencia: una E2E con un diseño plano en espejo.
- **O-F3-4. E2E sin sesión sensibles a la carga** (ver diagnóstico) y propuesta de mover la medición de hover del selector al proyecto `latencia`.
- **O-F3-5. Tras `VERSION_CHANGED`**, los toques hechos antes de recargar se pierden (se vuelve al avance del servidor). Es lo que define el ADR 0009; la pantalla lo avisa y deja de aceptar teclado.
- **O-F3-6. Sin prueba automática**: CA3-A3 (200 %, contraste de la fila resaltada), CA-P2 y CA-P4 (trazo continuo y fps, heredado de la fase 2), y el borrado del avance local al eliminar la cuenta.
- **O-F3-7. `apps/web/e2e/README.md`** no menciona `qa-fase3-tejer.spec.ts`, `E2E_FLAT_COLORS` ni el conteo actual de pruebas con sesión (dice 27; son 45). Para `documentador`.

## Archivos de prueba tocados

**Nuevos:**

- `packages/follow/test/qa-bordes.test.ts` (21 pruebas)
- `packages/stitch-render/test/qa-bordes-fase3.test.ts` (8)
- `packages/pattern-core/test/casos-dominio-fase3.test.ts` (44, trazabilidad F3)
- `apps/web/test/qa-fase3-lista-proyectos.test.ts` (16, `lib/projects/list.ts`)
- `apps/web/e2e/sesion/qa-fase3-tejer.spec.ts` (9: sin conexión, `VERSION_CHANGED`, relectura, envío al ocultarse, Wake Lock ×4, latencia en "Tejiendo")

**Editados:**

- `packages/follow/test/casos-dominio.test.ts`: guardia F3-13 con calentamiento y mediana
- `packages/yarn-catalog/test/lanas.test.ts` y `packages/stitch-render/test/look-fibras.test.ts`: comentario `// validar con tejedora` (F3-32 y F3-35)
- `apps/web/e2e/latencia.spec.ts`: variable opcional `E2E_FLAT_COLORS=1`
- `apps/web/e2e/sesion/cuenta.spec.ts`: cerrar sesión borra también el avance local
- `supabase/checks/10_rls_check.sql`: cotas exactas y mínimos del puntero

No se tocó `apps/web/src`, ningún `packages/*/src`, las migraciones ni `ci.yml`.

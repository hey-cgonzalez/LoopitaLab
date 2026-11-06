# Pruebas E2E del estudio (Playwright)

Tarea T13 de la fase 2. Las pruebas corren contra **`/dev/estudio`**, la página interna del estudio con un documento sintético: sin sesión, sin guardado y sin Supabase (`src/lib/dev-pages.ts`). En producción esa página responde 404, salvo que el servidor se levante con `LOOPITA_DEV_PAGES=1`. Si además el entorno es el de producción (`LOOPITA_ENV=production` o `VERCEL_ENV=production`), `assertDevPagesSafe` hace fallar el build y el arranque.

**Pendiente:** E2E con sesión (crear, autoguardar y reabrir un diseño, conflicto entre pestañas). Necesita un proyecto Supabase de pruebas o Supabase local con Docker. Nunca se usa el proyecto real ni datos de producción.

## Cómo correrlas en local

```
nvm use
pnpm install
pnpm --filter @loopitalab/web exec playwright install chromium   # solo la primera vez (o al cambiar de versión)
pnpm --filter @loopitalab/web e2e
```

`playwright install chromium` descarga Chromium a la caché de Playwright (`~/Library/Caches/ms-playwright` en macOS, `~/.cache/ms-playwright` en Linux). No usa el Chrome del sistema. También sirve `npx playwright install chromium` desde `apps/web`.

`e2e` hace `next build` y `next start` en `http://127.0.0.1:3100` con `LOOPITA_DEV_PAGES=1` y las variables públicas de ejemplo de la CI (`https://ejemplo.supabase.co`, `sb_publishable_ci`). Esas variables reemplazan a las de `apps/web/.env.local`, y `SUPABASE_SECRET_KEY` se pasa vacía: las pruebas nunca llegan al proyecto real. El build de las pruebas usa la misma carpeta `.next` que `pnpm build`. Si ya hay un servidor en el puerto 3100, Playwright lo reutiliza (solo en local).

| Para | Comando (desde la raíz) |
|---|---|
| Todo (escritorio, móvil y latencia) | `pnpm --filter @loopitalab/web e2e` |
| Modo interactivo (elegir pruebas, ver paso a paso) | `pnpm --filter @loopitalab/web e2e:ui` |
| Un solo proyecto | `pnpm --filter @loopitalab/web e2e --project=escritorio` |
| Una prueba por nombre | `pnpm --filter @loopitalab/web e2e -g "Saltar al editor"` |
| Latencia sin las demás | `pnpm --filter @loopitalab/web e2e --project=latencia --no-deps` |
| Ver el último reporte HTML | `pnpm --filter @loopitalab/web e2e:report` |
| Ver una traza de una prueba que falló | `pnpm --filter @loopitalab/web exec playwright show-trace test-results/<carpeta>/trace.zip` |
| Tipos de las pruebas E2E | `pnpm --filter @loopitalab/web typecheck:e2e` |

Variables opcionales:

| Variable | Por defecto | Uso |
|---|---|---|
| `E2E_PORT` | `3100` | Puerto del servidor de pruebas |
| `E2E_SKIP_BUILD` | — | `1`: no vuelve a hacer `next build` (usa el `.next` existente; tiene que haberse construido con las variables de ejemplo) |
| `E2E_LATENCY_BUDGET_MS` | `100` | Umbral del p95 de latencia (CA-P1 y CA-P3) |
| `E2E_CPU_RATE` | `1` | CPU limitada por CDP. `4` reproduce las condiciones del ADR 0004 |

Si una prueba falla con `browserType.launch: Timeout`, es el arranque de Chromium y no el estudio. Pasó una vez en macOS, en la primera corrida después de descargar Chromium. Vuelve a correr las pruebas.

Los resultados quedan en `apps/web/test-results/` (trazas y capturas, solo de lo que falló) y `apps/web/playwright-report/`. Las dos carpetas están en `.gitignore`.

## Qué cubren

Proyectos de `playwright.config.ts`, todos en Chromium (`channel: "chromium"`, el modo sin interfaz nuevo):

- **escritorio** (1440 × 900): todo menos lo marcado `@movil`.
- **movil** (390 × 844, táctil): solo lo marcado `@movil`.
- **latencia** (1440 × 900): corre al final y solo, cuando terminaron los otros dos (`dependencies`). Si falla una prueba de escritorio o de móvil, la latencia no corre.

Todas las pruebas fallan si en la página hubo un `console.error` o una excepción no capturada (`support/estudio.ts`). Única excepción: el 404 de `/favicon.ico`, porque la web todavía no tiene ícono (**pendiente** de `frontend-editor`; no lo provoca el estudio).

| Archivo | Pruebas | Criterios |
|---|---|---|
| `editor.spec.ts` | Un trazo de lápiz se deshace de una vez y Rehacer lo vuelve a aplicar. Pintar en una repetición pinta las nueve. Cambiar las repeticiones cambia la vista previa y el total de puntos (3.600, 7.200 y 2.400) | CA-F1, HU-09 |
| `teclado.spec.ts` | Flechas, L/R/C/S, 1 a 9, Enter, Mayús+flechas (un solo paso del historial), Ctrl+Z, Ctrl+Mayús+Z, Cmd+Z, Ctrl+Y, Ctrl+Z dentro de un campo. "Saltar al editor" es lo primero con Tab. Tab recorre la página sin trampas | CA-A1 |
| `lanas-muestra.spec.ts` | Quitar la lana B: el foco va a la lista de reemplazo, Esc cancela, "Quitar lana B" es el nombre accesible, las casillas pasan a la lana elegida, las letras se corren y Deshacer lo revierte. Sin muestra, el panel, las medidas y la vista previa dicen "supuesta" | CA-F4 |
| `formas.spec.ts` | Círculo: la casilla sin punto de una disminución anuncia "se pierde un punto". Plano y tubo: un "sin punto" muestra el aviso de huecos y desaparece al deshacer. Las columnas se numeran desde la derecha y, con `?espejo=1`, desde la izquierda. Cambiar la forma redibuja la vista | CA-F13, E18 |
| `avisos-a11y.spec.ts` | El aviso de prototipo se ve arriba, al medio y al final, sin botón para cerrarlo. El editor tiene rol `application` con nombre y tamaño, hay regiones vivas y todos los botones tienen nombre. Con 500 × 500 repeticiones aparece el aviso de vista demasiado grande, la interfaz sigue respondiendo y la vista vuelve al bajar | CA-F10, CA-A1 |
| `movil.spec.ts` | 390 px: cada pestaña muestra solo su panel, sin desplazamiento horizontal (también con el editor de lana y la confirmación de quitar abiertos). Las flechas mueven entre pestañas. "Saltar al editor" vuelve a la cuadrícula desde otra pestaña | CA-A1 |
| `latencia.spec.ts` | Plano, tubo, círculo de rombos (40.000 puntos) y copa: 50 entradas de pintar (clic y teclado) y 20 cambios de repeticiones de 5 a 10. Exige p95 bajo el umbral, ninguna edición sin pintar y **ninguna validación dentro de una ventana de edición** | CA-P1, CA-P3, CA-P7 |

### Latencia

Usa el recolector del estudio (`/dev/estudio?perf=1`, `window.__loopitaPerf`, `src/lib/studio/perf.ts`): mide desde el evento de entrada hasta el frame pintado del editor y de la vista previa (ADR 0004, "Cómo se mide"). Pintar una casilla con la lana que ya tenía no es una edición y no se mide: de las 50 entradas se miden entre 34 y 45.

Los números de cada escenario salen en la consola (`[latencia] {...}`) y como adjunto `latencia-<escenario>.json` en el reporte HTML.

Medido el 2026-11-06 en un Mac (Chromium 156 completo, Playwright 1.64.1), p95 en ms. Sin limitar la CPU: dos corridas completas seguidas. Con CPU ×4: una corrida.

| Escenario | Pintar | Repeticiones | Pintar, CPU ×4 | Repeticiones, CPU ×4 |
|---|---|---|---|---|
| Plano 200 × 200 | 17,4 a 17,7 | 34,5 a 37,5 | 19,0 | 79,9 |
| Tubo 200 × 200 | 15,7 a 18,0 | 27,8 a 34,1 | 22,3 | 89,8 |
| Círculo de rombos (40.000 puntos) | 26,1 a 27,6 | 32,8 a 32,9 | 63,5 | 86,7 |
| Copa | 16,1 a 17,4 | 18,1 a 19,8 | 20,8 | 31,3 |

Validaciones dentro de una ventana de edición: 0 en todos los casos.

**Umbral en la CI.** Los runners de GitHub tienen 4 vCPU compartidas y no tienen GPU. La CI usa `E2E_LATENCY_BUDGET_MS=200` (el doble), como guardia contra regresiones grandes. El criterio de 100 ms se exige en local y en la medición del equipo de referencia (CA-P6, pendiente). CA-P7 no depende de la máquina y se exige siempre. Si la CI muestra números estables muy por debajo de 200, conviene bajar el umbral.

**Chromium completo, no el shell.** Por defecto Playwright usa `chromium-headless-shell`, que dibuja el canvas mucho más lento: con CPU ×4, el círculo de rombos daba p95 de 177 ms al pintar y 202 ms en repeticiones, contra 63,5 ms y 86,7 ms con Chromium completo. Por eso la configuración usa `channel: "chromium"`.

## En GitHub

El job **"E2E (estudio)"** de `.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`:

1. Instala con `pnpm install --frozen-lockfile`.
2. Restaura la caché de navegadores (`~/.cache/ms-playwright`, con la versión de Playwright en la clave).
3. Corre `playwright install --with-deps chromium`. Con la caché solo instala las dependencias del sistema.
4. Corre `pnpm --filter @loopitalab/web e2e` con un trabajador y un reintento.

Para ver el resultado, abre el pull request y entra a **Checks > CI > E2E (estudio)**. Las fallas aparecen también como anotaciones en los archivos. Los números de latencia están en el paso "Pruebas E2E del estudio" (busca `[latencia]`).

Si el job falla, sube el artefacto `playwright-<intento>` con `playwright-report/` y `test-results/` (se guarda 14 días). Para revisarlo:

1. Descárgalo desde la página del run (sección **Artifacts**) y descomprímelo.
2. Abre el reporte con `pnpm --filter @loopitalab/web exec playwright show-report <carpeta>/playwright-report`.
3. Abre una traza con `pnpm --filter @loopitalab/web exec playwright show-trace <carpeta>/test-results/<prueba>/trace.zip`. También se puede arrastrar a https://trace.playwright.dev (se abre en el navegador; no se sube a ningún servidor).

## Por qué se agrega la dependencia

`@playwright/test` (versión fija 1.64.1) es una dependencia de desarrollo de `apps/web`. Solo agrega `playwright` y `playwright-core`, sin otras dependencias de terceros. CLAUDE.md ya la prevé para el E2E, y la usuaria aprobó agregarla para T13. Razones:

- CA-P1 a CA-P4 y CA-P7 se miden en un navegador real (ADR 0004). Vitest corre en Node y no pinta frames.
- CA-A1 (todo con teclado), CA-F1 y CA-F10 necesitan foco, eventos de teclado y de puntero, y un layout real.
- Los scripts de QA anteriores (CDP a mano sobre el Chrome del sistema) no tenían reintentos, trazas, reportes ni una CI reproducible.

Se eligió 1.64.1, publicada el 2026-10-14, y no 1.65.0, publicada el 2026-11-05: el día antes de esta tarea. Para actualizar, cambia la versión exacta en `apps/web/package.json`, corre `pnpm install` y vuelve a correr `playwright install chromium`. La clave de la caché de la CI cambia sola.

Vitest no recoge estos archivos: su `include` es `test/**/*.test.ts`, y las E2E son `e2e/**/*.spec.ts`. Las E2E tienen su propio `tsconfig` (`e2e/tsconfig.json`, script `typecheck:e2e`).

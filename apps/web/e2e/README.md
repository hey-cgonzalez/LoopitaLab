# Pruebas E2E del estudio (Playwright)

Tarea T13 de la fase 2 (sin sesión) y T2 de la fase 3 (con sesión, ver [Con sesión](#con-sesión-supabase-local)). Las pruebas sin sesión corren contra **`/dev/estudio`**, la página interna del estudio con un documento sintético: sin sesión, sin guardado y sin Supabase (`src/lib/dev-pages.ts`). En producción esa página responde 404, salvo que el servidor se levante con `LOOPITA_DEV_PAGES=1`. Si además el entorno es el de producción (`LOOPITA_ENV=production` o `VERCEL_ENV=production`), `assertDevPagesSafe` hace fallar el build y el arranque.

Las pruebas con sesión (proyecto `sesion`) corren contra una **Supabase local** con Docker. Nunca se usa el proyecto real ni datos de producción.

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
| `E2E_VIEWER_BUDGET_MS` | `100` | Presupuesto de latencia del visor 3D (fase 4). La CI lo fija en `400` (provisional: WebGL por software, sin medir todavía). Lo leen las pruebas del visor cuando existan (T3b y siguientes) |
| `E2E_CPU_RATE` | `1` | CPU limitada por CDP. `4` reproduce las condiciones del ADR 0004 |
| `E2E_FLAT_COLORS` | — | `1`: `latencia.spec.ts` mide con "Colores planos" (sin aspecto por fibra), para comparar A/B cuánto cuesta el aspecto |

Si una prueba falla con `browserType.launch: Timeout`, es el arranque de Chromium y no el estudio. Pasó una vez en macOS, en la primera corrida después de descargar Chromium. Vuelve a correr las pruebas.

Los resultados quedan en `apps/web/test-results/` (trazas y capturas, solo de lo que falló) y `apps/web/playwright-report/`. Las dos carpetas están en `.gitignore`.

## WebGL por software (fase 4, T3)

El proyecto `webgl` corre `e2e/webgl.spec.ts` contra `/dev/webgl` (una página sin three que dibuja un triángulo y publica en `data-*` el contexto y el `UNMASKED_RENDERER_WEBGL`). Lanza Chromium con `webglLaunch` (`playwright.config.ts`): `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, según "Using Chromium with SwiftShader" de la documentación de Chromium. En la CI (`CI=1`) la prueba exige que el renderer contenga "SwiftShader". Los proyectos del visor 3D deben usar `launchOptions: webglLaunch`. Los proyectos del estudio (canvas 2D) no lo usan, para no alterar sus mediciones de latencia. Además de `/dev/webgl` y `/dev/visor-3d`, `webgl.spec.ts` abre el estudio amigurumi (`/dev/amigurumi`, T14 de la fase 4): editar el texto de una parte rearma solo su malla, «Colores planos» y la vista previa de una lana no arman escena, y sobre el límite recomendado el editor responde mientras el 3D se rearma diferido.

## Qué cubren

Proyectos de `playwright.config.ts`, todos en Chromium (`channel: "chromium"`, el modo sin interfaz nuevo):

- **escritorio** (1440 × 900): todo menos lo marcado `@movil`.
- **movil** (390 × 844, táctil): solo lo marcado `@movil`.
- **latencia** (1440 × 900): corre al final y solo, cuando terminaron los otros dos (`dependencies`). Si falla una prueba de escritorio o de móvil, la latencia no corre.

Todas las pruebas fallan si en la página hubo un `console.error` o una excepción no capturada (`support/estudio.ts`), sin excepciones: la web declara su ícono (`src/app/icon.svg`), así el navegador ya no pide `/favicon.ico`.

| Archivo | Pruebas | Criterios |
|---|---|---|
| `editor.spec.ts` | Un trazo de lápiz se deshace de una vez y Rehacer lo vuelve a aplicar. Pintar en una repetición pinta las nueve. Cambiar las repeticiones cambia la vista previa y el total de puntos (3.600, 7.200 y 2.400) | CA-F1, HU-09 |
| `teclado.spec.ts` | Flechas, L/R/C/S, 1 a 9, Enter, Mayús+flechas (un solo paso del historial), Ctrl+Z, Ctrl+Mayús+Z, Cmd+Z, Ctrl+Y, Ctrl+Z dentro de un campo. "Saltar al editor" es lo primero con Tab. Tab recorre la página sin trampas | CA-A1 |
| `lanas-muestra.spec.ts` | Quitar la lana B: el foco va a la lista de reemplazo, Esc cancela, "Quitar lana B" es el nombre accesible, las casillas pasan a la lana elegida, las letras se corren y Deshacer lo revierte. Sin muestra, el panel, las medidas y la vista previa dicen "supuesta" | CA-F4 |
| `formas.spec.ts` | Círculo: la casilla sin punto de una disminución anuncia "se pierde un punto". Plano y tubo: un "sin punto" muestra el aviso de huecos y desaparece al deshacer. Las columnas se numeran desde la derecha y, con `?espejo=1`, desde la izquierda. Cambiar la forma redibuja la vista | CA-F13, E18 |
| `avisos-a11y.spec.ts` | El aviso de prototipo se ve arriba, al medio y al final, sin botón para cerrarlo. El editor tiene rol `application` con nombre y tamaño, hay regiones vivas y todos los botones tienen nombre. Con 500 × 500 repeticiones aparece el aviso de vista demasiado grande, la interfaz sigue respondiendo y la vista vuelve al bajar | CA-F10, CA-A1 |
| `movil.spec.ts` | 390 px: cada pestaña muestra solo su panel, sin desplazamiento horizontal (también con el editor de lana y la confirmación de quitar abiertos). Las flechas mueven entre pestañas. "Saltar al editor" vuelve a la cuadrícula desde otra pestaña | CA-A1 |
| `selector-lanas.spec.ts` | Selector de lanas del estudio: paleta, vista previa al pasar el cursor, grosor con equivalencia en inglés, composición con avisos por fibra, panel de metraje y muestra supuesta (13 pruebas) | T9, F3-23 a F3-27 |
| `qa-grupo-c.spec.ts` | Selector de lanas entero con el teclado (pestañas, paleta con foco itinerante, Esc, un paso de deshacer por elección), táctil sin vista previa y Colores planos que sobrevive a recargar (3 pruebas) | T8, T9 |
| `amigurumi.spec.ts` | Estudio amigurumi en `/dev/amigurumi` (T14 de la fase 4): límites recomendados visibles desde el inicio y diálogo «Seguir igual» o «Cancelar»; lectura en cada cambio, error en su línea, forma canónica solo al salir de la línea; aviso de `#`; dialecto UK; partes (agregar, renombrar, cantidad, ordenar, borrar); quitar una lana usada actualiza los `@`; el 3D sigue al documento; Bloques y Posicionar desactivados; siluetas sin WebGL (10 pruebas) | CA4-E1, CA4-E2, CA4-E5, CA4-E7, CA4-E8, CA4-E10, CA4-E12 |
| `latencia.spec.ts` | Plano, tubo, círculo de rombos (40.000 puntos) y copa, con el aspecto por fibra activado: 50 entradas de pintar (clic y teclado), 20 cambios de repeticiones de 5 a 10, 50 colores al pasar el cursor (`hover-to-paint`) y 50 avances de la fila resaltada (`row-to-paint`), estos dos con el banco de medición de la vista previa (`?perf=1`). Exige p95 bajo el umbral, ninguna edición sin pintar y **ninguna validación dentro de una ventana de edición** | CA-P1, CA-P3, CA-P7, CA3-P1 a CA3-P3, CA3-P5 |

### Latencia

Usa el recolector del estudio (`/dev/estudio?perf=1`, `window.__loopitaPerf`, `src/lib/studio/perf.ts`): mide desde el evento de entrada hasta el frame pintado del editor y de la vista previa (ADR 0004, "Cómo se mide"). Pintar una casilla con la lana que ya tenía no es una edición y no se mide: de las 50 entradas se miden entre 34 y 45.

Los números de cada escenario salen en la consola (`[latencia] {...}`) y como adjunto `latencia-<escenario>.json` en el reporte HTML.

`hover-to-paint` (fase 3, T8) empieza en el `pointerout` o `pointerover` del movimiento (React sintetiza `onPointerEnter` desde el `pointerout` del elemento anterior) o en el `focusin`; esas entradas son "débiles" (`perf.ts`): no tapan una tecla o un clic de menos de 50 ms, solo originan vistas previas y caducan a los 50 ms de vistas. `row-to-paint` empieza en el clic de "Fila siguiente" y mide solo la vista previa: el resaltado de la fila en la cuadrícula del editor llega con el modo tejiendo (T12).

Medido el 2026-11-06 en un Mac (Chromium 156 completo, Playwright 1.64.1), p95 en ms. Sin limitar la CPU: dos corridas completas seguidas. Con CPU ×4: una corrida.

| Escenario | Pintar | Repeticiones | Pintar, CPU ×4 | Repeticiones, CPU ×4 |
|---|---|---|---|---|
| Plano 200 × 200 | 17,4 a 17,7 | 34,5 a 37,5 | 19,0 | 79,9 |
| Tubo 200 × 200 | 15,7 a 18,0 | 27,8 a 34,1 | 22,3 | 89,8 |
| Círculo de rombos (40.000 puntos) | 26,1 a 27,6 | 32,8 a 32,9 | 63,5 | 86,7 |
| Copa | 16,1 a 17,4 | 18,1 a 19,8 | 20,8 | 31,3 |

Validaciones dentro de una ventana de edición: 0 en todos los casos.

**Umbral en la CI.** Los runners de GitHub tienen 4 vCPU compartidas y no tienen GPU. La CI usa `E2E_LATENCY_BUDGET_MS=160`, como guardia contra regresiones. Se fijó con la primera corrida en GitHub (2026-11-06): el peor p95 fue 102,2 ms (círculo de 40.000 puntos al cambiar repeticiones; al pintar, 88,6 ms), y el umbral es ese valor por 1,5. Plano, tubo y copa quedaron entre 25 y 87 ms; 0 validaciones dentro de una edición en todos. El criterio de 100 ms se exige en local y en la medición del equipo de referencia (CA-P6, pendiente). CA-P7 no depende de la máquina y se exige siempre. Si la CI se mantiene estable bajo 100 ms, conviene bajar el umbral.

| CI de GitHub (2026-11-06), p95 en ms | Pintar | Repeticiones |
|---|---|---|
| Plano | 41,3 | 87,1 |
| Tubo | 25,5 | 83,6 |
| Círculo de rombos (40.000 puntos) | 88,6 | 102,2 |
| Copa | 31,2 | 50,4 |

**Chromium completo, no el shell.** Por defecto Playwright usa `chromium-headless-shell`, que dibuja el canvas mucho más lento: con CPU ×4, el círculo de rombos daba p95 de 177 ms al pintar y 202 ms en repeticiones, contra 63,5 ms y 86,7 ms con Chromium completo. Por eso la configuración usa `channel: "chromium"`.

## En GitHub

El job **"E2E (estudio)"** de `.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`:

1. Instala con `pnpm install --frozen-lockfile`.
2. Restaura la caché de navegadores (`~/.cache/ms-playwright`, con la versión de Playwright en la clave).
3. Si la caché no tenía Chromium, corre `playwright install chromium` (hasta tres intentos). No usa `--with-deps`: la imagen `ubuntu-26.04` del runner ya trae todas las bibliotecas que Chromium necesita, y ese modo corría `apt-get` contra los espejos de Ubuntu en cada corrida (una caída de esos espejos el 2026-11-11 tumbó la CI con Chromium ya en caché). Si una imagen futura dejara de traer alguna biblioteca, Playwright lo avisa al lanzar el navegador ("Host system is missing dependencies"); entonces se agrega un paso `playwright install-deps chromium`.
4. Corre `pnpm --filter @loopitalab/web e2e` con un trabajador y un reintento.

Para ver el resultado, abre el pull request y entra a **Checks > CI > E2E (estudio)**. Las fallas aparecen también como anotaciones en los archivos. Los números de latencia están en el paso "Pruebas E2E del estudio" (busca `[latencia]`).

Si el job falla, sube el artefacto `playwright-<intento>` con `playwright-report/` y `test-results/` (se guarda 14 días). Para revisarlo:

1. Descárgalo desde la página del run (sección **Artifacts**) y descomprímelo.
2. Abre el reporte con `pnpm --filter @loopitalab/web exec playwright show-report <carpeta>/playwright-report`.
3. Abre una traza con `pnpm --filter @loopitalab/web exec playwright show-trace <carpeta>/test-results/<prueba>/trace.zip`. También se puede arrastrar a https://trace.playwright.dev (se abre en el navegador; no se sube a ningún servidor).

## Con sesión (Supabase local)

Proyecto `sesion`, archivos en `e2e/sesion/`. Corren contra la Supabase local de la CLI (Docker), con todas las migraciones de `supabase/migrations/` y la configuración de `supabase/config.toml`. Las claves son las de desarrollo que imprime `supabase status` (las mismas en cualquier equipo; solo sirven contra `127.0.0.1`). `playwright.config.ts` falla si la URL de Supabase no es local.

Sin `E2E_SUPABASE=1`, las 45 pruebas del proyecto `sesion` se saltan y la consola avisa por qué. Los proyectos `escritorio`, `movil` y `latencia` no cambian y no necesitan Docker.

### Cómo correrlas en local

Requisitos: Docker Desktop abierto y Node 24 (`nvm use`). Desde la raíz del repositorio:

```
export SUPABASE_AUTH_SITE_URL=http://localhost:3200 SUPABASE_AUTH_ADDITIONAL_REDIRECT_URLS=http://localhost:3200/auth/callback SUPABASE_AUTH_EXTERNAL_GOOGLE_ENABLED=false
npx supabase@2.122.1 start -x studio,imgproxy,edge-runtime,logflare,vector,postgres-meta,supavisor,realtime
E2E_SUPABASE=1 pnpm --filter @loopitalab/web e2e --project=sesion
npx supabase@2.122.1 stop --no-backup
```

- La primera vez, `supabase start` descarga las imágenes (unos minutos). Después tarda menos de un minuto.
- Las tres variables de `export` ajustan Auth **solo en esta Supabase local**: la CLI lee `SUPABASE_<SECCIÓN>_<CLAVE>` por encima de `config.toml`. Fijan el sitio y la vuelta de los correos en el puerto de las pruebas y apagan Google (no hay cliente OAuth de prueba). `config.toml` no se toca: es también la configuración del proyecto real. Sin ellas, `supabase start` igual funciona, pero el registro y el cierre de sesión fallan.
- `playwright.config.ts` le pide la URL y las claves a `npx supabase@2.122.1 status`. También se pueden pasar con `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_SUPABASE_SECRET_KEY` y `E2E_MAILPIT_URL` (así lo hace la CI), o cambiar el comando de la CLI con `SUPABASE_CLI` (por ejemplo `SUPABASE_CLI=supabase`).
- El servidor de pruebas es `next build` + `next start` en `http://localhost:3200`. Construye en `.next-e2e-sesion/` (`LOOPITA_NEXT_DIST_DIR`), así no pisa el `.next` de `pnpm build` ni el de las E2E sin sesión. Recibe solo la URL y las claves locales: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, la clave publicable local y `SUPABASE_SECRET_KEY` con la clave secreta local (solo este servidor, que la necesita para `/cuenta`). Reemplazan a las de `.env.local`. Nunca reutiliza un servidor que ya esté en el puerto. `E2E_SKIP_BUILD=1` sirve aquí igual que sin sesión.
- Es `localhost` y no `127.0.0.1` porque Next normaliza `127.0.0.1` a `localhost` en `request.nextUrl`: las redirecciones de `/auth/callback` y `/auth/salir` llevarían a otro origen, sin las cookies ni el `localStorage` de la prueba.
- El check de RLS también corre contra esta base: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/checks/10_rls_check.sql`. Sin `psql` instalado: `docker exec -i supabase_db_loopitalab psql -U postgres -v ON_ERROR_STOP=1 -f - < supabase/checks/10_rls_check.sql`.
- Studio y el visor del correo local: Mailpit queda en http://127.0.0.1:54324. Studio no se levanta con el `-x` de arriba (quítalo de la lista si lo quieres).

### Cuentas de prueba

`sesion-preparar` (`preparar.setup.ts`) corre antes de las pruebas. Crea seis cuentas confirmadas con la API admin local (`auth.admin.createUser`, correo `<nombre>-<corrida>@e2e.loopitalab.test`, contraseña al azar), entra con cada una por el formulario de `/ingresar` y guarda su sesión en `apps/web/playwright/.auth/` (ignorada por git):

- **ana**: diseños, autoguardado, versiones, conflicto, duplicar y borrar;
- **bea**: aislamiento y preferencias de la cuenta;
- **cata**: cerrar sesión. Es aparte porque cerrar sesión revoca todas las sesiones de la cuenta;
- **dani**: lanas guardadas usadas desde el estudio (`lanas-estudio.spec.ts`). Es aparte porque `lanas.spec.ts` espera que la lista de ana empiece vacía. También el estudio amigurumi (`sesion/amigurumi.spec.ts`), que cambia `profiles.pattern_dialect` a `uk` durante una prueba y lo devuelve a `es` al terminar;
- **eva**: QA del grupo C (`sesion/qa-grupo-c.spec.ts`): tope de 500 lanas, nota de más de 200 caracteres, Colores planos y autoguardado repetido;
- **fer**: "Tejer este diseño" y la pantalla "Tejiendo" (`sesion/tejer.spec.ts`, `sesion/tejer-a11y.spec.ts` y `sesion/qa-fase3-tejer.spec.ts`). Es aparte porque sus proyectos impiden borrar los diseños que tejen.

`sesion-limpiar` (`limpiar.teardown.ts`) corre al final, aunque fallen pruebas. Borra todas las cuentas `@e2e.loopitalab.test`, también las de una corrida cortada y la del registro. Sus diseños y versiones se borran en cascada.

### Qué cubren

| Archivo | Pruebas | Criterios |
|---|---|---|
| `acceso.spec.ts` | Registro con correo: el correo de confirmación llega a Mailpit (confirmación real, `enable_confirmations = true`) y su enlace abre la sesión por `/auth/callback` (PKCE). Ingreso: `/disenos` sin sesión lleva a `/ingresar?next=/disenos` y vuelve ahí al entrar | — |
| `disenos.spec.ts` | Crear desde la plantilla «Banda en tubo» en `/disenos/nuevo` abre el estudio. Pintar una casilla envía el autoguardado en ≤ 2 s, la base tiene el cambio y recargar lo conserva. «Guardar versión» crea exactamente una versión (contada en `pattern_versions`), con el cambio recién hecho; crear y autoguardar no crean ninguna. Una vuelta entera «sin punto» se guarda como borrador. Duplicar («Copia de …», mismo dibujo) y borrar con confirmación en `/disenos` | CA-F6, CA-F8, E10 |
| `conflicto.spec.ts` | Dos pestañas del mismo diseño: la segunda que guarda recibe el aviso de conflicto sin escribir nada. «Sobrescribir con mi versión» deja la suya. Después, la otra pestaña choca y «Recargar la versión guardada» trae la del servidor y descarta su cambio | ADR 0006 |
| `aislamiento.spec.ts` | bea recibe 404 al abrir el diseño de ana, y no lo ve en su lista (RLS real, no stubs) | — |
| `cuenta.spec.ts` | «Tejer en espejo» se guarda en `profiles`, sobrevive a recargar y el estudio muestra la lectura en espejo. «Cerrar sesión» borra los respaldos `loopitalab:*:diseno:*` (de cualquier cuenta y del formato viejo) y conserva las demás claves; después, `/disenos` pide ingresar | T8 |
| `lanas.spec.ts` | Mis lanas (ana): crear, editar y borrar una lana guardada, búsqueda de grosor por nombre y sugerencia de palillos y crochet, y aislamiento con bea | T10, ADR 0008 |
| `lanas-estudio.spec.ts` | Usar una lana guardada desde el selector del estudio (dani): reemplazar la de un diseño, agregarla como lana nueva y la nota privada solo si se marca copiarla | T9, ADR 0008 |
| `qa-grupo-c.spec.ts` | Tope de 500 lanas guardadas, nota de más de 200 caracteres, Colores planos fuera del documento y autoguardado repetido 5 veces (eva) | T8 a T11 |
| `tejer.spec.ts` | "Tejer este diseño" desde el estudio con la pantalla previa, avanzar con botones, teclado y teclas de pasapáginas, el avance sobrevive a recargar, 390 px sin desplazamiento horizontal y `row-to-paint`; conflicto entre dos contextos con las dos salidas; "Pasar a la versión actual" tras editar el diseño; borrar el proyecto y después el diseño; `NOT_KNITTABLE` desde Mis diseños; pantalla encendida recordada; recálculo si el diseño cambia con la pantalla previa abierta; diseño con error de tejido no se puede tejer (fer; 7 pruebas) | T12, F3-7, F3-12, F3-38, F3-39, F3-41, ADR 0009 |
| `tejer-a11y.spec.ts` | Accesibilidad y una mano en "Tejiendo": el conflicto abre un `<dialog>` modal (Esc no lo cierra, el foco vuelve a «Siguiente»), interruptor de mano con DOM y orden visual coincidentes, 390 px con controles ≥ 56 px en el 40 % inferior, 320 px sin desplazamiento horizontal, poca altura (568 px), región viva, gráfico en texto con la fila actual, interruptor de pantalla encendida y foco al borrar un proyecto (fer; 9 pruebas) | T13, CA3-T11 |
| `escritos.spec.ts` | Crear un amigurumi desde `/disenos/nuevo`, borrador con una vuelta que no cuadra, recargar y ver que no se puede tejer (ana) | T13, CA4-M4, CA4-V7 |
| `amigurumi.spec.ts` | Estudio amigurumi (dani; 3 pruebas): crear, escribir vueltas, ver y corregir el error en su línea, ver que el 3D cambia, notas y cierre de varias líneas, guardar y recargar; líneas sin leer en el respaldo local, recuperadas al recargar y nunca en la base; dialecto UK del perfil (escribe `R1: 6 dc`, lee `es-uk`, no guarda el modo) | T14, CA4-E1, CA4-E2, CA4-E4, CA4-E7, CA4-E9 |
| `qa-fase3-tejer.spec.ts` | QA final de "Tejiendo" (fer; 9 pruebas): corte de red con la cola local y envío al volver (CA3-T7), `VERSION_CHANGED` desde otro contexto y relectura al volver a la pantalla, envío inmediato al ocultarse (CA3-T6), Wake Lock simulado (CA3-T10, incluidas las regresiones de BUG-QA3-1 y BUG-QA3-2, ya corregidos, y el rechazo del navegador) y latencia `row-to-paint` en la pantalla real (CA3-P3) | T16, CA3-T6, CA3-T7, CA3-T10, CA3-P3 |

Total: 49 pruebas con sesión (cuenta 2, acceso 2, aislamiento 1, conflicto 1, diseños 4, lanas 3, lanas-estudio 3, qa-grupo-c 4, tejer 7, tejer-a11y 9, qa-fase3-tejer 9, escritos 1, amigurumi 3), más `sesion-preparar` (preparación) y `sesion-limpiar` (limpieza).

Las comprobaciones en la base usan la clave secreta local (`support.ts`, `adminClient`), que solo acepta una URL local. La guardia de `console.error` es la misma que sin sesión. La única excepción declarada es el 404 de `aislamiento.spec.ts`.

### En GitHub

El job **"E2E con sesión (Supabase local)"** de `.github/workflows/ci.yml`: instala, instala la CLI con `supabase/setup-cli` (fijada por SHA, CLI 2.122.1), corre `supabase start` con las mismas variables de Auth, exporta la URL y las claves locales desde `supabase status -o json` y corre `10_rls_check.sql` contra la base local. Después instala Chromium, corre `pnpm --filter @loopitalab/web e2e --project=sesion` (un trabajador, un reintento), sube `playwright-sesion-<intento>` si falla y siempre termina con `supabase stop`. Duración estimada: 10 a 14 minutos (la mayor parte, descargar las imágenes de Supabase y `next build`).

**Por qué CLI 2.122.1 y no 3.0.0.** La 3.0.0 es una versión mayor publicada el 2026-11-02. La 2.122.1, publicada ese mismo día, es el último parche de la línea 2, que es la que se probó con este `config.toml`. Para actualizar, cambia la versión en `playwright.config.ts` (`SUPABASE_CLI_VERSION`), en `ci.yml` y en este README.

## Por qué se agrega la dependencia

`@playwright/test` (versión fija 1.64.1) es una dependencia de desarrollo de `apps/web`. Solo agrega `playwright` y `playwright-core`, sin otras dependencias de terceros. CLAUDE.md ya la prevé para el E2E, y la usuaria aprobó agregarla para T13. Razones:

- CA-P1 a CA-P4 y CA-P7 se miden en un navegador real (ADR 0004). Vitest corre en Node y no pinta frames.
- CA-A1 (todo con teclado), CA-F1 y CA-F10 necesitan foco, eventos de teclado y de puntero, y un layout real.
- Los scripts de QA anteriores (CDP a mano sobre el Chrome del sistema) no tenían reintentos, trazas, reportes ni una CI reproducible.

Se eligió 1.64.1, publicada el 2026-10-14, y no 1.65.0, publicada el 2026-11-05: el día antes de esta tarea. Para actualizar, cambia la versión exacta en `apps/web/package.json`, corre `pnpm install` y vuelve a correr `playwright install chromium`. La clave de la caché de la CI cambia sola.

Vitest no recoge estos archivos: su `include` es `test/**/*.test.ts`, y las E2E son `e2e/**/*.spec.ts`. Las E2E tienen su propio `tsconfig` (`e2e/tsconfig.json`, script `typecheck:e2e`).

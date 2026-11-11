# @loopitalab/stitch-render

Vista previa realista de puntos 2D: plano, tubo y círculo. Ver [ADR 0004](../../docs/adr/0004-render-de-puntos-2d.md) y [ADR 0005](../../docs/adr/0005-geometria-circulo-y-disminuciones.md). Depende solo de `pattern-core` y `yarn-catalog`; sin paquetes de terceros.

La vista previa es una aproximación visual (regla de oro 8): la interfaz lo dice y recuerda tejer una muestra.

## Capas

| Capa | Módulo | Exporta |
|---|---|---|
| 1. Disposición (pura) | `layout.ts` | `layoutGeometry`, `colorize`, `hitTest`, `needsRelayout`, `layoutShape`, `layoutInstanceCount`, `visibleCount` |
| 2. Aspecto (puro) | `look.ts` | `yarnLook`, `lookInputKey`, `lookKey`, `fillTone`, `FIBER_LEVELS`, `neutralLook`, `normalizeHex`, `FALLBACK_HEX` |
| Regiones (puro) | `regions.ts` | `instanceBounds`, `buildGrid`, `queryGrid`, `dirtyRegions`, `deviceBox` |
| Vista (pura) | `view.ts` | `fitView`, `zoomAt`, `panBy`, `screenToLayout`, `layoutToScreen` |
| 3. Backend Canvas 2D | `canvas.ts` | `createCanvasRenderer`, `createRenderer` (sobre una `Surface` cualquiera), `paintSprite`, `drawInstances` |
| Tipos | `types.ts` | `StitchLayout`, `LayoutOptions`, `LayoutGeometry`, `YarnLook`, `ViewState`, `StitchRenderer`, `FrameInfo`, `HIDDEN`, `STITCH_EXTENT`, `MAX_LAYOUT_INSTANCES` |

## Flujo en el estudio

```ts
const layout = layoutGeometry(chart, { gauge, shape, tubeRotation });
colorize(layout, chart);
renderer.setLooks(pattern.yarns.map((y) => yarnLook(y, FIBERS, { fiberEffects: true }))); // sin la opción: "Colores planos"
renderer.setLayout(layout);
renderer.setView(fitView(layout.bounds, cssW, cssH));
renderer.requestRender();

// Pintar una celda (camino crítico, sin validar):
const next = paintCells(chart, [{ x, y }], value, yarns.length);
const m = motifCoord(next, x, y);
const cell = cellIndex(next, m.x, m.y);
if (needsRelayout(layout, next, [cell])) { /* layoutGeometry + colorize + setLayout */ }
else renderer.invalidate(colorize(layout, next, [cell]));
renderer.requestRender();
```

`validatePattern` y `describeChart` corren con antirrebote o en un Worker, nunca entre la edición y el dibujo (CA-P7).

## Aspecto por fibra (fase 3, T8; ADR 0008 §4)

- **Activado por defecto en el estudio** (`PreviewEngine` de `apps/web`), con el interruptor de vista "Colores planos" que vuelve al aspecto neutro. Es estado de la vista, no del documento (regla de oro 1).
- **Niveles**: los de `yarn-catalog` (`halo`, `brillo`, `definicion`), con `FIBER_LEVELS` = bajo 0, medio 0,5, alto 1, sin otra escala.
- **Mezclas**: promedio ponderado por porcentaje, lineal. **Validar con tejedora**: la ponderación lineal de porcentajes chicos de mohair o lurex (F3-35).
- **Fibra desconocida**: neutra, y en una mezcla aporta el neutro con su porcentaje (50 % mohair + 50 % desconocida da la mitad del halo del mohair). Antes de T8 se excluía, lo que suponía que el resto se comportaba como las fibras conocidas.
- **Grosor**: no cambia el aspecto; el tamaño relativo del punto sale de la muestra. No hay datos para más (regla de oro 6).
- **Claves**: `lookInputKey(yarn, opts)` (color, grosor, fibras con porcentajes y si hay efectos) decide si recalcular; `lookKey(look)` decide si redibujar. Cambiar 70/30 a 30/70 cambia las dos; cambiar solo el grosor cambia la primera y no la segunda.
- **Dibujo**: el sprite de la V ya tenía halo (difuminado y pelitos), brillo (lomo más claro) y definición (contorno). T8 agrega `fillTone`: con halo, el hueco entre las hojas y el nivel de detalle sin V se aclaran (pelusa); con brillo, el nivel de detalle se aclara un poco. Un aspecto neutro da exactamente el relleno de la fase 2.
- **Limitación**: con el nivel de detalle sin V (círculo de más de `ROTATED_SPRITE_BUDGET` puntos visibles, o puntos de menos de `LOD_MIN_PX`), la fibra solo se nota en ese leve cambio de tono. Al acercar aparece la V con halo y brillo.

## Decisiones de geometría

- **Unidades**: px de disposición con zoom 1. El ancho del punto es `stitchPx` (12 por defecto) y el alto, `stitchPx × puntos / filas` de la muestra: un punto no es cuadrado.
- **Orden de instancias = orden de dibujo = orden de tejido** (fila 0 primero). La V monta sobre la fila que se teje después (`STITCH_OVERLAP`) y queda debajo de ella.
- **Plano y tubo**: una instancia por casilla del gráfico completo (`count = ancho × alto`); las `NO_STITCH` quedan en `yarn = HIDDEN` y se ven como hueco. Así pintar o quitar "sin punto" solo es `colorize`. Las instancias visibles siempre son `stitchTotal`.
- **`top_down`** en plano y tubo: la posición vista sale de `wornOrientation` (rotación de 180°) y la V gira 180° (`angle = π`).
- **Tubo**: la columna vista `dc` está en `φ = 2π (dc + 0,5) / W − π/2 + tubeRotation`; con rotación 0, la columna 0 queda en el borde izquierdo de la cara visible. `x = cx + R sin φ`, `scaleX = cos φ`. La cara trasera tiene `shade = 0` y no se dibuja; la de frente, `shade = 0,55 + 0,45 cos φ`.
- **Círculo** (ADR 0005): anillo `k = H − 1 − y` en `bottom_up` y `k = y` en `top_down`, todos del alto de una fila. El punto `j` de una vuelta de `n` puntos va en `θ = (j + 0,5) · 2π / n` (equivale a la fórmula por cuña del ADR), sin huecos radiales. `x = cx + s · r sin θ`, `y = cy + r cos θ`, con `s = +1` (antihorario en pantalla) en `bottom_up` y `−1` (horario) en `top_down`; el ángulo 0 apunta hacia abajo. La V es radial y abre hacia el centro en `bottom_up` y hacia afuera en `top_down`. `scaleX = 2π r / n / stitchW` es también `ringDistortion[k]`.
- **Conteos**: los del círculo salen de `rowStitchCounts`; la disposición solo ubica las columnas con punto y contrasta su cantidad con `pattern-core` (CA-F2).
- **Límite**: más de `MAX_LAYOUT_INSTANCES` (1.000.000) lanza `RangeError`; la interfaz debe consultar `layoutInstanceCount` antes.

## Backend Canvas 2D

Tres modos, elegidos en cada frame según el zoom:

1. **Baldosas** (plano y tubo con repeticiones, `tilePlan`): la pieza es periódica. Se dibuja una baldosa por clase (primera, del medio y última en cada eje; a lo más 9) desde la disposición real, con las vecinas que se solapan, y la pieza se compone copiándolas (posiciones redondeadas a px enteros). El tubo es periódico solo en y. Desplazarse solo vuelve a componer; editar, cambiar el aspecto o el zoom vuelve a dibujar las baldosas de clase (unos miles de puntos en vez de 40.000). El resaltado de fila no es periódico: va encima, punto a punto.
2. **Búfer de la pieza** (si la pieza cabe en `MAX_TILE_PX` = 2048 px por lado): la pieza se dibuja en un búfer; las ediciones son incrementales en el búfer y desplazarse es una sola copia.

Durante un zoom (la escala cambia de un frame al siguiente), las baldosas o el búfer se copian escalados (factor de 0,5 a 2) y se vuelven a dibujar nítidos `SETTLE_MS` (120 ms) después de que el zoom se detiene.
3. **Punto a punto** sobre el canvas, con recorte a lo visible (mucho zoom: pocos puntos visibles).

En los tres:

- Tres pasadas: fondo de cada punto (un trazado por lana y nivel de sombra), la V (sprite en caché por aspecto, sombra, orientación y tamaño en px del dispositivo) y el resaltado de fila.
- Plano y tubo: `drawImage` sin transformación (la rotación de `top_down` va en el sprite y la compresión del tubo es el ancho de destino). Círculo: `setTransform` por punto.
- Círculo: el fondo de cada punto es un trapecio que sigue al radio (sin cuñas vacías entre vecinos), en trazados de a lo más `QUAD_CHUNK` (64). Un trazado con 40.000 cuadriláteros rotados tardó 4,7 s en Chrome 156; en trozos de 64, unos 10 ms. Con más de `ROTATED_SPRITE_BUDGET` (15.000) puntos visibles se dibuja solo el color, porque `setTransform` + `drawImage` cuesta unas 4 veces más que sin transformación.
- Con menos de `LOD_MIN_PX` (3 px) por punto se dibuja solo el color.
- Redibujo incremental: `dirtyRegions` marca baldosas de 32 px que tocan las cajas de las instancias tocadas. Todas las regiones van en un solo recorte y se vuelven a dibujar, en orden, todas las instancias que las tocan (`queryGridRects`). Si las regiones cubren más del 60 % del área, o se toca más de la mitad de las instancias, se dibuja todo.
- `requestRender` agrupa todo lo pendiente en un solo frame; `flush` dibuja de inmediato (pruebas y benchmark). `RendererOptions.tiles` y `backbuffer` permiten desactivar los modos 1 y 2.

## Pruebas

```sh
node --test "test/**/*.test.ts"
SEED=12345 node --test "test/**/*.test.ts"
```

`test/perf.test.ts` es la guardia CA-P5: `layoutGeometry` de 40.000 puntos en las tres formas, con la referencia registrada en el archivo; falla si la supera 3 veces, o 6 veces si la variable `CI` está definida (`STITCH_RENDER_PERF_FACTOR` cambia el factor).

## Medición en el estudio (T10) y equipo de referencia (CA-P6)

El estudio real mide `edit-to-paint` con el recolector de `apps/web/src/lib/studio/perf.ts`: desde `event.timeStamp` de la entrada (puntero, teclado o campo) hasta que la vista previa **y** el editor dibujaron y el frame se pintó (la tarea siguiente o el próximo `requestAnimationFrame`, lo primero que llegue). Solo se activa en `/dev/estudio?perf=1`; en producción los ganchos son una comparación con `null`. Además de `window.__loopitaPerf` (`summary()`, `reset()`, `startFrames()`, `stopFrames()`), deja `performance.measure` con los nombres `loopita:edit-to-paint:<tipo>` y `loopita:validate:<origen>`, que se ven en la pestaña Performance de DevTools. `summary().validations.insideEditWindow` cuenta las validaciones que empezaron entre una edición y su frame (CA-P7: debe ser 0).

### Procedimiento (CA-P6, en el equipo de referencia)

Equipo: 4 núcleos, 8 GB de RAM, GPU integrada, Chrome estable, sin otras aplicaciones abiertas y con el cargador conectado.

1. Construir y levantar en modo producción con las páginas internas:
   ```sh
   pnpm --filter @loopitalab/web build
   cd apps/web && LOOPITA_DEV_PAGES=1 pnpm start -p 3310
   ```
2. Abrir Chrome con depuración remota y un perfil temporal (no el personal):
   ```sh
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9341 --user-data-dir="$(mktemp -d)" --no-first-run \
     --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling about:blank
   ```
   En Windows o Linux, el ejecutable de Chrome con las mismas opciones. **Sin** `--headless`: en el equipo de referencia se mide con ventana y GPU reales. Las tres opciones `--disable-*` evitan que Chrome suspenda los frames si la ventana queda tapada (sin ellas la medición se cuelga); no tocar la ventana mientras corre. El script avisa si la página dejó de estar visible.
3. Correr la medición automática (Node 24, sin dependencias; usa eventos de entrada reales de CDP):
   ```sh
   node apps/web/scripts/medir-estudio.mjs 9341 http://127.0.0.1:3310 /tmp/loopita-ca-p6 1 ref
   ```
   El cuarto argumento es la limitación de CPU de DevTools: en el equipo de referencia va `1` (el equipo ya es el lento). El sexto (`1`) graba además un trace de Chrome y el séptimo (`1`), capturas de las cuatro vistas. `SCEN=plano,tubo` limita los escenarios.
4. Escenarios, por cada forma (plano, tubo y círculo con 40.000 puntos; además la copa en cuña de 8 repeticiones):
   - CA-P1: 50 clics en casillas al azar del editor más 20 pinceladas con teclado (flechas + Intro);
   - CA-P2: un trazo continuo de 90 casillas (un movimiento cada 16 ms) con el contador de frames;
   - CA-P3: 20 cambios de repeticiones 5 × 5 ↔ 10 × 10 escribiendo en los campos;
   - CA-P4: 60 pasos de rueda (zoom) y 60 de arrastre (desplazamiento) sobre la vista previa.
5. Verificación a mano (opcional, sin CDP): abrir `http://127.0.0.1:3310/dev/estudio?forma=tubo&reps=10&perf=1`, pintar y mirar el panel "edit-to-paint (ms)" abajo a la derecha.

### Qué adjuntar al PR de cierre de la fase 2

- `t10-ref.json` (resumen por forma) y la salida de consola del paso 3;
- modelo de CPU, RAM, GPU (`chrome://gpu`, "GL_RENDERER"), sistema operativo y versión de Chrome;
- el trace (`trace-ref.json`) y la salida de `node apps/web/scripts/medir-estudio.mjs --revisar-trace trace-ref.json` (CA-P7);
- las capturas `estudio-*.png`;
- la tabla de p50/p95 por forma con el criterio: p95 < 100 ms en CA-P1 y CA-P3; cada actualización < 100 ms y ≥ 30 fps en CA-P2; ≥ 30 fps en CA-P4. Si algún p95 pasa de 100 ms o un fps baja de 30, se activa el criterio de WebGL2 (ADR 0004, E7) con una enmienda.

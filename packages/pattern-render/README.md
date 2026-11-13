# @loopitalab/pattern-render

Derivados estáticos del modelo canónico: el gráfico de colorwork en SVG (para imprimir desde el navegador y como base del PDF) y una descripción en español para lectores de pantalla. Más adelante, el texto escrito y el PDF. Ver la tarea T7 del [roadmap](../../docs/roadmap.md) y el [ADR 0003](../../docs/adr/0003-colorwork-en-esquema-v1.md).

- Depende solo de `@loopitalab/pattern-core`. Sin dependencias de terceros.
- Funciones puras, sin I/O. TypeScript sin compilar; `exports` apunta a `src/index.ts`.
- Todo conteo (puntos por fila, totales, puntos por lana, medidas) y todo orden de lectura salen de `pattern-core`. Aquí solo se dibuja y se redacta.

## API

```ts
import { chartToSvg, describeChart } from "@loopitalab/pattern-render";

const svg = chartToSvg(pattern, { rowNumbers: true, symbols: true, showRepeats: true });
const texto = describeChart(pattern, { paletteName: (id) => PALETTE.find((c) => c.id === id)?.name });
```

| Exporta | Qué hace |
|---|---|
| `chartToSvg(pattern, opts?, describe?)` | SVG del gráfico como texto. `describe` es opcional y se pasa a la descripción del `<desc>` |
| `ChartSvgOptions` | `cellPx` (por defecto 16, acotado entre 4 y 64), `showRepeats`, `rowNumbers`, `symbols`, `mirror` |
| `describeChart(pattern, opts?)` | Descripción breve en español, en texto plano |
| `DescribeOptions` | `paletteName(paletteId)`: nombre del color de la paleta propia. `pattern-render` no depende de `yarn-catalog`: quien llama le pasa la búsqueda |
| `describeWritten(pattern, opts?)` | Descripción estructurada y textual de un patrón escrito (T9 de la fase 4). Ver "Qué dice `describeWritten`" |
| `DescribeWrittenOptions` | `dialect` (`es` por omisión; `us`, `uk`), `assumedGauge` (muestra supuesta si el documento no trae) e `includeRounds` |
| `CHART_SVG_MAX_CELLS` | 40 000: casillas dibujadas como máximo (ver abajo) |
| `DEFAULT_CELL_PX`, `DESCRIBE_MAX_ISSUES` | 16 y 3 |

Las dos funciones aceptan cualquier documento `savable` (ADR 0003, E10), incluidos un gráfico vacío y las filas sin puntos, y **nunca lanzan**. Con un documento que tiene errores estructurales, `chartToSvg` devuelve un SVG con el aviso "No se puede dibujar el gráfico" (sin casillas ni texto del documento) y `describeChart` lo dice en una frase.

## Qué dibuja `chartToSvg`

- **Gráfico completo**: `width × repeat.x` por `height × repeat.y` casillas, como en el editor:
  - la fila 1 (`y = 0`) abajo;
  - `x = 0` a la izquierda, visto por el derecho de la labor;
  - `direction` no rota el gráfico (la rotación de `top_down` es solo de la vista previa, ADR 0003, sección 1).
- **Motivo solo, si el gráfico completo no cabe**: con más de `CHART_SVG_MAX_CELLS` casillas (40 000) se dibuja únicamente el motivo, con un rótulo visible "Motivo: se repite N × M veces". El motivo siempre cabe, porque mide como máximo 200 × 200 (ADR 0003, E7). El atributo `data-view` del `<svg>` dice `full` o `motif`.
  - Si además se teje de ida y vuelta, el alto del motivo es impar y `repeat.y > 1`, el rótulo agrega (T7b, pedido de `experto-tejido`): "Como el motivo tiene un número impar de filas, en cada repetición alterna el lado por el que se teje cada fila (derecho y revés). La numeración de la primera repetición solo vale para esa." (constante `ODD_HEIGHT_CAPTION` en `src/chart-svg.ts`).
  - El rótulo va en `<g class="caption">`, una línea por oración, y el SVG se ensancha lo necesario para que no se corte en un motivo angosto.
  - Por qué gráfico completo y no motivo: así `showRepeats` tiene sentido (marca dónde empieza y termina cada repetición) y la numeración coincide con las filas que teje la usuaria. Un gorro (8 × 10 puntos de motivo, 30 vueltas) o una manta caben de sobra.
- **Casillas**: un `<rect class="c">` por posición, con el color de la lana.
- **"Sin punto"** (`NO_STITCH`): `<rect class="c ns">` con una textura de rayas diagonales grises sobre blanco. Es una textura, no un color plano, así que se distingue de cualquier lana, también impreso en blanco y negro y con daltonismo. No lleva letra.
- **`symbols`**: la letra de cada lana (`yarnLetter` de `pattern-core`: A, B, C… en el orden del documento y, desde la 27, AA, AB…, igual que el validador) en negro o blanco, el que contraste más con el color. Las letras dobles van en un tamaño menor para que quepan en la casilla. Desde la 27 ya no se usa el número de la lana, que se confundía con la numeración de filas (QA O3; validar con `experto-tejido`).
- **`showRepeats`**: líneas en los bordes de cada repetición del motivo (blanco debajo y negro encima, visibles sobre cualquier lana). Sin la opción, o al dibujar solo el motivo, hay un marco exterior.
- **`rowNumbers`**: el número de cada fila del lado donde empieza su lectura, con una flecha que apunta hacia el gráfico (el sentido de lectura). El lado sale de `readingDirection` de `pattern-core`, así que cumple el caso 25 de [casos de dominio](../../docs/casos-dominio-colorwork.md) y la regla de numeración de la revisión de `experto-tejido` del ADR 0003:
  - ida y vuelta: filas por el derecho (1, 3, 5…) a la derecha y del revés (2, 4, 6…) a la izquierda;
  - en redondo: todas las vueltas a la derecha;
  - **numeración rala** (T7b): si la distancia vertical entre dos números del mismo lado (`cellPx` en redondo, `2 × cellPx` de ida y vuelta) es menor que `ROW_NUMBER_MIN_GAP_FACTOR` (1,2) por el tamaño de la letra, se numeran solo la fila 1, las múltiplos de 5 y la última (`isNumberedRow`), cada una en su lado. La flecha de lectura se dibuja en todas las filas. Con el tamaño de letra actual (entre 8 y 14 px), pasa en redondo con casillas de 9 px o menos y de ida y vuelta solo con 4 px. El grupo `row-numbers` lleva `data-sparse="true"`.
- **`mirror`** (preferencia `mirror_knitting`): invierte el lado de los números y el sentido de las flechas. No cambia las casillas, las letras ni el documento.

### Accesibilidad

- `<svg role="img">` con `<title>` ("Gráfico: título") y `<desc>` (el texto de `describeChart`), enlazados con `aria-labelledby` y `aria-describedby`.
- Los `id` llevan un prefijo `lr-<hash>` derivado del documento (incluidos los colores de las lanas y el texto del `<desc>`) y de las opciones **normalizadas** (lado de casilla acotado y booleanos), para no chocar si hay varios gráficos en la misma página. Nunca se hace `JSON.stringify` de las opciones del llamador: con un `BigInt`, un objeto cíclico, `null` o un `Proxy` que lanza, `chartToSvg` no lanza (QA F2).

### Seguridad

El SVG se inserta en la web. Por eso:

- todo texto que viene del documento o del validador (título, identificadores, mensajes) pasa por `escapeXml`, que además quita los caracteres que XML no admite;
- todo color pasa por `safeHex` antes de llegar a un atributo: lo que no sea `#RRGGBB` se reemplaza por gris (`#808080`);
- las notas del patrón no forman parte del gráfico y la nota privada de cada lana nunca se publica;
- un documento que no es `savable` no se dibuja.

`describeChart` devuelve **texto plano**, sin escapar: quien lo inserte en HTML o SVG debe escaparlo (React lo hace solo; `chartToSvg` lo escapa al ponerlo en `<desc>`).

## Qué dice `describeChart`

Por ejemplo, para una banda de 4 × 3 repetida 5 × 2 veces:

> Gráfico de colores a palillo: «Copa». Motivo de 4 × 3 casillas (ancho × alto), repetido 5 veces a lo ancho y 2 veces a lo alto: gráfico completo de 20 × 6 casillas. 6 vueltas y 120 puntos en total; cada vuelta tiene 20 puntos. Se teje en redondo, de abajo hacia arriba. Vista: tubo. Muestra: 24 puntos y 28 vueltas en 10 cm; mide aproximadamente 8,3 cm de circunferencia y 2,1 cm de alto. 2 lanas: A, #E9DDBE, 60 puntos; B, #BA222C, 60 puntos.

- Usa la terminología del "Glosario pendiente" del roadmap: "casilla", y "vuelta" o "fila" según `workedIn`.
- Si el motivo tiene casillas sin punto, lo dice, y da el rango de puntos por vuelta.
- Sin muestra no inventa medidas: dice "Sin muestra" (regla de oro 6).
- Cita textualmente hasta 3 avisos del validador (errores de tejido y advertencias; omite la información) y resume el resto.
- Números en español sin depender de la configuración regional: "9999", "12.500", "7,1".

## Qué dice `describeWritten`

Devuelve `{ ok, dialect, parts, placements, gaugeStatus, text }`: los datos estructurados (por parte: vueltas con su conteo, etiquetas de copias y medidas) y el texto plano para lectores de pantalla. Nunca lanza; con un documento no `savable` devuelve `ok: false` y una frase.

- **Conteos**: de `summarizePart` y `concreteRounds`; las medidas, de `shapeMetrics`, `partProfile` y `partDimensions`. Aquí no se cuenta nada (regla de oro 2).
- **Copias**: "Se teje 2 veces: Oreja (1 de 2), Oreja (2 de 2). Las copias son idénticas, sin espejo."
- **Dónde va cada pieza** (enmienda C-17 del ADR 0011): "Oreja (1 de 2): se cose a «Cabeza», entre la V10 y la V11, contando desde el anillo mágico." Sin distancia en puntos desde el inicio de la vuelta (`SurfaceAt.stitch` no se usa). Con cadeneta inicial, "contando desde la cadeneta inicial"; en hileras, H en vez de V y "la cadeneta base"; con `attach: "start"`, "por el centro de su inicio". Las copias sin entrada en `layout` salen como "se ubica de forma automática".
- **Medidas**: "≈ N cm" y siempre "estimación". Con la muestra del documento, "a partir de la muestra del patrón". Sin muestra del documento y con `assumedGauge`, además "muestra supuesta" y "supuesto". Sin ninguna, "Sin muestra: no se pueden dar medidas" y ningún "≈" (regla de oro 6).
- **Dialecto**: el prefijo de vuelta (V, H o R) y las abreviaturas de cada vuelta salen con `formatRound` de `pattern-core`; la prosa es siempre español.

## Pruebas

```bash
pnpm --filter @loopitalab/pattern-render test
# o, desde esta carpeta:
node --test "test/**/*.test.ts"
SEED=7 node --test "test/**/*.test.ts"   # otra semilla para las propiedades
```

| Archivo | Qué prueba |
|---|---|
| `test/chart-svg.test.ts` | Estructura accesible, fila 1 abajo y `x = 0` a la izquierda, colores, `cellPx`, "sin punto", letras, bordes del motivo, caso 25 (numeración con y sin espejo), motivo solo cuando el gráfico completo no cabe, gráfico vacío y documentos con errores |
| `test/describe.test.ts` | Contenido de la descripción, vuelta o fila, nombres de paleta, avisos, números en español |
| `test/escape.test.ts` | `</svg><script>` en título y notas no aparece crudo; un color inválido no llega al atributo; mensajes e identificadores escapados |
| `test/property.test.ts` | Con el generador con semilla (ADR 0002): para todo documento `savable`, el SVG es XML bien formado (lector propio en `test/support/xml.ts`), dibuja tantas casillas como el tamaño y tantas con punto como `stitchTotal`; la numeración sigue la regla del ADR 0003; `mirror` no cambia las casillas; es determinista y no modifica el documento; la descripción nombra el total |
| `test/t7b.test.ts` | Rótulo del motivo solo con alto impar, numeración rala (casos y propiedad contra la regla escrita en la prueba), prefijo de ids con opciones raras y con colores distintos, letras dobles desde la lana 27 |
| `test/describe-written.test.ts` | Fixtures A y B de `pattern-core` (importados), oreja con 2 copias anclada, muestra del documento, supuesta y ausente, dialectos, y propiedades: conteos iguales a los del motor, determinista, no modifica el documento y nunca lanza |
| `test/performance.test.ts` | Motivo de 200 × 200 con todas las opciones (mediana de 5 corridas, informada en la salida) |

`test/support/property.ts` es una copia del generador de `pattern-core`.

## Pendiente

- Validar con `experto-tejido` la presentación (flecha hacia el gráfico, textura de "sin punto", rótulo del motivo solo), el texto de `describeChart` y las letras dobles desde la lana 27 (AA, AB…).
- Con el motivo solo y `repeat.y > 1` de ida y vuelta y alto impar, la numeración es la de la primera repetición; el rótulo lo advierte (T7b).
- El SVG de 200 × 200 con letras pesa unos 4 MB: es para imprimir y para el PDF, no para el ciclo de pintar en vivo (eso es `stitch-render`).

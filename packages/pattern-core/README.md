# @loopitalab/pattern-core

Modelo canónico de patrones, motor determinista y validador. Sin dependencias: corre igual en el navegador, en Next.js y en las Edge Functions de Supabase. Ver [ADR 0001](../../docs/adr/0001-modelo-canonico.md) y [ADR 0002](../../docs/adr/0002-nucleo-sin-dependencias.md).

## Qué hace

| Módulo | Funciones principales |
|---|---|
| `types.ts` | Tipos del modelo: `Pattern` (gráfico o escrito), `Yarn`, `Chart`, `Part`, `Round`, `Item`, `Issue` |
| `stitches.ts` | Tabla de puntos con cuánto consume y produce cada uno; abreviaturas en español (Chile) e inglés (US) |
| `written.ts` | `countRound`, `expandRound`, `concreteRounds`, `summarizePart` |
| `chart.ts` | `cellIndex`, `motifCell`, `fullSize`, `cellAt`, `fullRow`, `yarnTotals`, `stitchTotal`, `rowFloats`, `dimensionsCm`, `floatLengthCm`; derivados del colorwork: `motifCoord`, `rowStitchCount`, `rowStitchCounts`, `shaping`, `readingDirection`, `wornOrientation` |
| `edit.ts` | Operaciones puras de edición: `paintCells`, `fillRegion`, `resizeMotif`, `setRepeat`, `addYarn`, `removeYarn`, `reorderYarns`, `newChartPattern`, `EDIT_LIMITS` |
| `migrate.ts` | `migratePattern`: camino obligatorio de lectura de todo documento |
| `text.ts` | `parseRound`, `parsePart`, `formatRound`, `formatPart` |
| `validate.ts` | `validatePattern`, `parsePattern`, `LIMITS` |

## Leer un documento: siempre migrar y después validar

Todo documento que se lee (de la base, de un archivo, de otra usuaria o de la IA) pasa por `migratePattern` y después por `validatePattern` ([ADR 0003](../../docs/adr/0003-colorwork-en-esquema-v1.md), sección 5):

```ts
const m = migratePattern(json); // { document, from, to, ok, issues }
if (!m.ok) return m.issues;     // versión desconocida: error SCHEMA_VERSION
const r = validatePattern(m.document);
```

- Con `schemaVersion: 1` es la identidad (devuelve el mismo objeto).
- Con una versión desconocida, futura o ausente, devuelve el documento sin tocar, `ok: false` y un error `SCHEMA_VERSION` en español. El validador también lo informa.
- Es idempotente y nunca lanza. El documento migrado se guarda solo cuando la usuaria guarda.

## Gráficos de colorwork: derivados

Convenciones (ADR 0003): `(x, y)` con `y = 0` la primera fila que se teje y `x = 0` la columna izquierda vista por el derecho. La fila 1 siempre es por el derecho. Las coordenadas son del gráfico completo (con repeticiones) salvo que se diga "motivo".

| Función | Qué devuelve |
|---|---|
| `motifCoord(chart, x, y)` | Celda del motivo `(x mod width, y mod height)` |
| `rowStitchCount(chart, y)` | Puntos de la fila `y` (celdas distintas de `NO_STITCH`); 0 fuera del gráfico |
| `rowStitchCounts(chart)` | Puntos de cada fila; su suma es `stitchTotal` |
| `shaping(chart)` | Por fila: `{ row, stitches, change, perRepeat }`. `change < 0` son disminuciones; en la fila 0 vale 0. `perRepeat = change / repeat.x` (ADR 0005) |
| `readingDirection(chart, y, { mirror })` | `"right_to_left"` o `"left_to_right"`. En redondo, todas de derecha a izquierda; en ida y vuelta, `y` par de derecha a izquierda e impar al revés. `mirror` (preferencia `mirror_knitting`) invierte el resultado. Depende solo de `workedIn`, `y` y `mirror` |
| `wornOrientation(chart, x, y)` | Celda del gráfico que se ve en `(x, y)` de la pieza terminada: identidad en `bottom_up`, rotación de 180° en `top_down` (`(W − 1 − x, H − 1 − y)`). Dos veces es la identidad |

`renderAs` nunca cambia los conteos. La interfaz no calcula conteos: usa estas funciones, `stitchTotal` y `dimensionsCm`.

## Gráficos de colorwork: edición

Operaciones puras (ADR 0003, sección 3). Nunca mutan la entrada ni lanzan excepciones. Si un parámetro no es válido, o la operación no cambia nada, devuelven **el mismo objeto**, así el historial para deshacer puede descartar los no-ops. Cada operación crea a lo más un arreglo `cells` nuevo.

```ts
paintCells(chart, refs: CellRef[], value): Chart          // un trazo completo; pinta el motivo (todas las repeticiones)
fillRegion(chart, start: CellRef, value): Chart           // contigüidad con 4 vecinos dentro del motivo, sin envolver bordes
resizeMotif(chart, width, height, anchor: Anchor, fill): Chart // 1 a 200 por lado; anchor: bottom_left | bottom_center | bottom_right | center
setRepeat(chart, x, y): Chart                             // 1 a LIMITS.maxRepeat
addYarn(pattern, yarn): ChartPattern                      // al final; rechaza lanas inválidas o con id repetido
removeYarn(pattern, index, replaceWith): ChartPattern     // replaceWith: índice actual de otra lana
reorderYarns(pattern, order): ChartPattern                // order[i] = índice anterior de la lana en la posición i
newChartPattern(input: NewChartInput): ChartPattern       // palillo, origen manual, todo en la primera lana (fondo)
```

- `value` y `fill` son un índice de lana existente o `NO_STITCH` (herramienta "sin punto", distinta del borrador que pinta el fondo). Las operaciones sobre `Chart` no conocen las lanas: quien llama debe pasar un índice que exista.
- Pintar todo el motivo con `NO_STITCH` deja un gráfico sin puntos: es una edición posible y el validador la informa (`CHART_EMPTY`).
- `newChartPattern` no inventa la muestra: solo la incluye si viene. Con un tamaño fuera de 1 a 200 devuelve el documento sin celdas y el validador lo informa.

## Sintaxis del patrón escrito

```
Parte: Bolita
Inicio: AM
Construcción: espiral
Lana: A
V1: 6 pb en AM (6)
V2: aum x6 (12)
V3: [pb, aum] x6 (18)
V4: [pb 2, aum] x6 (24)
V5-8: 24 pb (24)
V9: @B, [pb 2, dism] x6 (18)
```

- Cantidades: `6 pb`, `pb 6` o `pb x6`.
- Grupos: `[ … ] x6` o `[ … ] 6 veces`, y se pueden anidar.
- Cambio de lana: `@B`.
- Hebra trasera o delantera: `pb ht` / `sc blo`, `pb hd` / `sc flo`.
- Conteo declarado: `(18)` al final de la vuelta.
- También acepta inglés (`R3: [sc, inc] x6 (18)`) y mezclas de ambos.

## Qué valida

- **Errores**:
  - conteo declarado distinto del real;
  - una vuelta que trabaja sobre más o menos puntos de los que dejó la anterior (en espiral y vueltas cerradas);
  - numeración de vueltas;
  - lanas inexistentes;
  - composición que no suma 100 %;
  - grosor fuera de 0–7;
  - colores mal escritos;
  - celdas del gráfico con lanas que no existen;
  - entradas desmedidas.
- **Advertencias**:
  - hebras flotantes largas en colorwork a palillo (2,5 cm según la muestra, o 5 puntos sin muestra);
  - descuadres en piezas en hileras;
  - filas vacías;
  - patrones de IA sin el modelo registrado.
- **Información**: filas con más de 2 colores, vueltas sin conteo declarado y lanas que no se usan.

Nunca lanza excepciones: acepta cualquier JSON (por ejemplo, propuesto por la IA) y devuelve `{ valid, issues }`, con mensajes en español.

## Pruebas

```
node --test "test/**/*.test.ts"
```

Requiere Node 24 LTS (mínimo 22.18, que ejecuta TypeScript directamente). Incluye pruebas de propiedades con semilla: si una falla, el mensaje indica `SEED=…` para reproducirla. Desde la raíz: `pnpm --filter @loopitalab/pattern-core test`.

- `test/derived.test.ts`: derivados y casos de dominio 1 a 7, 20 (medidas sin máscara) y 24 de [casos-dominio-colorwork.md](../../docs/casos-dominio-colorwork.md).
- `test/edit.test.ts` y `test/migrate.test.ts`: operaciones de edición y migraciones.
- `test/property-colorwork.test.ts`: propiedades de derivados, edición y migración, y la guardia de rendimiento (300 × 300 en menos de 200 ms).

## Limitaciones conocidas (v1)

- Los patrones escritos son solo de crochet; el palillo se diseña con gráfico.
- `aum`, `aum3` y `dism` cuentan igual con cualquier punto, pero el render los dibuja como punto bajo.
- Inicio en óvalo (trabajar ambos lados de la cadeneta) todavía no tiene regla de consumo propia.
- Abreviaturas provisionales pendientes de validar con tejedoras: `aum3`, `ht`/`hd` (hebra trasera o delantera) y `saltar`.
- Gráficos: el tipo y la inclinación de cada disminución, y el color del punto que resulta de ella, no se expresan en v1 (ADR 0005). `dimensionsCm` todavía usa `width × repeat.x` aunque haya máscara (se corrige en T2c).

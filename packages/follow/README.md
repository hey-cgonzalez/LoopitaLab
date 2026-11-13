# @loopitalab/follow

Secuenciador del modo tejiendo: deriva los pasos de un gráfico de colorwork y maneja el puntero de avance. Especificación: [ADR 0007](../../docs/adr/0007-follow-secuencia-de-colorwork.md), con las enmiendas de la revisión T1. Casos de dominio: F3-1 a F3-13 de [casos-dominio-fase-3.md](../../docs/casos-dominio-fase-3.md).

- Depende solo de `@loopitalab/pattern-core`. Sin dependencias de terceros.
- Funciones puras: no mutan, no lanzan, no leen el reloj ni el almacenamiento. TypeScript sin compilar; `exports` apunta a `src/index.ts`.
- **No cuenta nada propio** (regla de oro 2, CA-F2): puntos, cambios, columnas de forma y sentido de lectura salen de `rowStitchCount`, `rowShapingColumns`, `readingDirection`, `motifCoord`, `cellAt` y `stitchTotal`. Aquí solo se ordena, se agrupa en tramos y se suman conteos que ya da el motor.
- La secuencia nunca se guarda: se deriva bajo demanda. Lo único que se guarda del avance es el puntero.

## API

```ts
import { planChart, stepAt, position, clampPointer, nextRow, nextRepeat } from "@loopitalab/follow";

const plan = planChart(pattern, { mirror: profile.mirror_knitting });
const ptr = clampPointer(plan, guardado);     // todo puntero de la base o del almacenamiento local
const pos = position(plan, ptr);              // paso actual, repeticiones y avance en puntos
const siguiente = nextRepeat(plan, ptr);      // un toque = una repetición horizontal
```

| Exporta | Qué hace |
|---|---|
| `planChart(pattern, opts?)` | `ChartPlan` congelado: `totalRows`, `totalStitches`, `motifWidth`, `motifHeight`, `repeatX`, `repeatY`, `workedIn`, `technique`, `mirror` y una referencia (no copia) a `pattern`. O(motivo): no depende de `repeat.y` |
| `totalRowsOf(height, repeatY)` | `height × repeat.y` con las mismas guardas que `planChart` (0 con valores dañados). Para la lista de proyectos, que lee el alto y las repeticiones desde las rutas JSON de la versión sin traer el documento |
| `stepAt(plan, row)` | `ChartStep` de la fila `row` del gráfico completo, o `null` fuera de rango o con `row` no entero. O(ancho del motivo) |
| `startPointer()` | `{ rowsDone: 0, stitchesDone: 0 }` |
| `clampPointer(plan, input: unknown)` | Puntero del dominio a partir de cualquier valor. Idempotente |
| `isFinished(plan, p)` | `rowsDone === totalRows`: **gráfico** terminado, no la pieza |
| `position(plan, p)` | `ChartPosition`: paso actual, `horizontalRepeat`, `repeatCells` (casillas de la repetición en curso, "casillas 10 a 18 de 72"), `verticalRepeat`, avance en filas y en puntos |
| `nextRow`, `prevRow` | Fila siguiente (`{ rowsDone + 1, 0 }`, tope en terminado) y anterior (con casillas hechas, vuelve al inicio de la fila) |
| `nextRepeat`, `prevRepeat` | Próximo o anterior borde de repetición horizontal. La última repetición pasa a la fila siguiente; una fila sin puntos se salta de una vez |
| `remapPointer(from, to, p)` | `RemapResult { pointer, clamped, rowChanged }` para pasar a otra versión fijada |

Tipos: `FollowOptions`, `ChartPlan`, `ChartStep`, `ColorRun`, `ChartPointer`, `ChartPosition`, `RemapResult`.

### El paso (`ChartStep`)

- `row` (0-based, argumento de `setHighlightRow`), `number` (1-based, como el gráfico), `motifRow`, `verticalRepeat`.
- `side`: en redondo siempre `"right"`; en ida y vuelta, fila par `"right"` e impar `"wrong"`. El espejo no lo cambia.
- `reading`: `readingDirection(chart, row, { mirror })`.
- `stitches`, `stitchesPerRepeat`: casillas producidas de la fila (enmienda T1-5) y de una repetición.
- `change`, `perRepeat`: como `shaping` (0 en la fila 0). `decreaseColumns`, `increaseColumns`: de `rowShapingColumns`, columnas del motivo. `decreaseBefore` (casilla antes de la cual se pierde cada punto) e `increaseAt` (casilla nueva), 1-based en el orden en que se teje una repetición; `decreases` e `increases`: totales de la fila (`increases − decreases = change`). Sin técnica de disminución (ADR 0007).
- `runs`: tramos `{ yarn, count }` de **una** repetición horizontal, en el orden en que se tejen (sin espejo, de derecha a izquierda por el derecho y de izquierda a derecha por el revés), sin `NO_STITCH`, con los colores **como se ven por el derecho** (enmienda T1-3). No se fusionan entre repeticiones: la fila completa es la misma lista `repeatX` veces. Ningún tramo tiene `count = 0` ni dos seguidos la misma lana.
- `yarns`: lanas de la fila sin repetir, en el orden en que aparecen al tejerla.

Los pasos se devuelven congelados y se guardan en una caché pequeña por plan.

### El puntero (`ChartPointer`)

```ts
interface ChartPointer { rowsDone: number; stitchesDone: number }
```

- `rowsDone ∈ [0, totalRows]`; la fila actual es `rowsDone`. `stitchesDone ∈ [0, max(stitches − 1, 0)]`: completar la última repetición deja `{ rowsDone + 1, 0 }`, así cada posición tiene una sola representación. Terminado siempre tiene `stitchesDone = 0`.
- En la fase 3 la interfaz avanza por fila o por repetición, así que `stitchesDone` queda en múltiplos de `stitchesPerRepeat`; el tipo ya admite avanzar punto a punto (fase 6). `nextRepeat` y `prevRepeat` llevan un puntero entre bordes al borde más cercano.
- Fila del motivo, repetición vertical y repetición horizontal **se derivan** con `position`; no se guardan.
- `clampPointer`: lo que no es objeto da el inicio; un campo que no es número finito, negativo o `NaN` vale 0; los decimales se truncan; lo enorme se acota. No lanza con getters o `Proxy` que lanzan. Todas las operaciones pasan su entrada por `clampPointer`.
- El códec a columnas de `project_progress` (`round_number`, `stitch_index`) vive en `apps/web` (ADR 0009), no aquí.

### Repetición resaltada (`position(...).horizontalRepeat`)

`{ index, of, xStart, xEnd }`: `index` es 0-based **en el orden de lectura** y `[xStart, xEnd)` es el rango de columnas del gráfico completo (`xEnd` exclusivo, `xEnd − xStart = motifWidth`). Si la fila se lee de derecha a izquierda, la repetición 0 es la de la derecha; con espejo o por el revés, la de la izquierda. `null` si está terminado o si la fila no tiene puntos. `verticalRepeat` con el gráfico terminado es el de la última fila.

### Cambio de versión (`remapPointer`)

Conserva el número de fila acotado al plan nuevo (`clamped` si la fila en curso ya no existe en el plan nuevo, también cuando el diseño se acorta justo hasta ella; queda en terminado). No busca "la misma fila" por contenido. `rowChanged` es `true` si la fila actual se teje distinto en los dos planes (tramos, puntos, forma, lado o sentido; también al cambiar el espejo). Si la fila cambió o se acotó, `stitchesDone` vuelve a 0; si se teje igual, se conserva, de modo que `remapPointer(plan, plan, p)` devuelve `p` (propiedad P14).

## Lo que no hace `follow`

- **Textos**: la interfaz arma "Vuelta 12, por el derecho, de derecha a izquierda" (redondo) o "Fila 12, por el revés, de izquierda a derecha" (ida y vuelta) con el glosario, a partir de `plan.workedIn`, `step.side`, `step.reading` y `plan.technique` (enmiendas T1-2 y T1-3). Nunca "vuelta" para una fila plana; nunca "los colores se invierten"; en crochet no se afirma "punto revés".
- **"Gráfico terminado"** (T1-4): la interfaz lo dice al llegar a `isFinished`, recuerda rematar o cerrar y, en `bottom_up`, menciona los `stepAt(plan, totalRows − 1).stitches` puntos que quedan. Proponer `projects.status = finished` es de la aplicación.
- **Casillas**: en filas con `change < 0`, el contador dentro de la fila se rotula "casilla N de M" (T1-5).
- Nombres de color: los inyecta quien llama (sin `yarn-catalog`).

## Entradas aceptadas

Todo documento `savable` (ADR 0003, E10), incluidos `CHART_EMPTY` y filas sin puntos (un paso con `stitches: 0` y `runs: []`). Con dimensiones dañadas (alto 0, no entero, repeticiones no enteras) el plan tiene 0 filas y nada lanza.

## Pruebas

```
node --test "test/**/*.test.ts"
```

Desde la raíz: `pnpm --filter @loopitalab/follow test`. Con otra semilla: `SEED=7 node --test "test/**/*.test.ts"`.

- `test/casos-dominio.test.ts`: casos F3-1 a F3-13 (títulos "caso F3-N"; los que quedan por validar llevan `// validar con tejedora`), incluida la guardia de rendimiento F3-13.
- `test/property.test.ts`: propiedades P1 a P16 del ADR 0007 y pureza, con documentos `savable` aleatorios (máscaras, cuñas, bandas, filas vacías, `repeat` hasta 10 × 10, ida y vuelta y en redondo, con y sin espejo, palillo y crochet).
- `test/chart.test.ts`: unitarias y bordes (planes dañados, filas sin puntos, terminado, punteros entre bordes, espejo en `remapPointer`).

## Pendiente de validar

- Orden de los tramos en el caso F3-1: el caso escribe "2 A · 1 B · 1 A" para `AABA` sin espejo (orden de las casillas), y el ADR fija el orden en que se teje (de derecha a izquierda: "1 A · 1 B · 2 A"). Se implementó el ADR; lo confirma `experto-tejido`.
- Orientación de la vista en `top_down`, la lana de un "2 juntos" de dos lanas y la presentación "3 A · 2 B" frente a casillas (tejedoras).

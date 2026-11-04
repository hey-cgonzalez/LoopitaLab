# ADR 0001: Modelo canónico de patrón

- Estado: aceptada
- Fecha: 2026-11-03
- Paquete: `packages/pattern-core`

## Contexto

La plataforma tiene varias vistas de un mismo patrón: gráfico, texto escrito, render 2D, vista 3D, modo tejiendo y PDF. Si cada vista guarda su propia copia, se desincronizan. Además, la IA puede proponer patrones, pero nunca debe calcular conteos de puntos.

## Decisión

Un patrón es un único documento JSON versionado (`schemaVersion: 1`). Todas las vistas se derivan de él con funciones puras.

### Raíz común

| Campo | Contenido |
|---|---|
| `schemaVersion` | Versión del esquema; hoy `1` |
| `id`, `title` | Identificación |
| `technique` | `knit` (palillo) o `crochet` |
| `kind` | `chart` (gráfico) o `written` (escrito por partes) |
| `yarns` | Lanas del diseño: `id` corto (A, B…), grosor CYC 0–7, composición `{fiber, percent}[]` que suma 100, color `{hex, paletteId?}`, nombre libre opcional |
| `gauge` | Muestra opcional: puntos y filas en 10 cm |
| `origin` | `manual`, `ai` o `ai_edited`; si hay IA, modelo y versión de prompt |

### Patrón de gráfico (`kind: "chart"`)

- `chart.width`, `chart.height`: tamaño del **motivo**. El motivo se guarda una sola vez.
- `chart.cells`: arreglo de `width × height` enteros, por filas, con la fila 0 como la primera que se teje. Cada valor es el índice de la lana en `yarns`, o `-1` si no hay punto (celda fuera de forma, por ejemplo en un gráfico en cuña).
- `chart.repeat`: `{x, y}`, cuántas veces se repite el motivo a lo ancho y a lo alto.
- `chart.workedIn`: `rounds` (en redondo) o `rows` (ida y vuelta). Define el sentido de lectura y si las hebras flotantes se unen entre el final y el inicio de la vuelta.
- `chart.renderAs`: `flat`, `tube`, `circle` o `yoke`. Solo afecta la vista, no los conteos.
- `chart.direction`: `bottom_up` o `top_down`.

Se eligieron índices en vez de identificadores de lana por compacidad: un gráfico de 200 × 200 son 40.000 celdas. Reordenar o quitar lanas se hace con una operación que remapea los índices.

### Patrón escrito (`kind: "written"`, crochet en v1)

- `parts[]`: cada parte (cuerpo, ojo, oreja) tiene:
  - `construction`: `spiral`, `joined` (vueltas cerradas) o `flat` (hileras);
  - `start`: `magic_ring` o `chain` con su cantidad;
  - `startYarn`: lana con la que se empieza;
  - `rounds[]`.
- Cada vuelta tiene:
  - `number` y, opcionalmente, `through` para rangos ("V5–8");
  - `items[]`: puntos, grupos `[ … ] x N` y cambios de color;
  - `expected`: el conteo que declara el patrón, opcional.
- Cada punto tiene un código canónico (`sc`, `hdc`, `dc`, `tr`, `slst`, `ch`, `inc`, `inc3`, `dec`, `sk`) con dos números fijos: cuántos puntos **consume** de la vuelta anterior y cuántos **produce**. De ahí sale todo conteo.
- Los cierres de vuelta (punto deslizado de unión) y las cadenetas para subir no se escriben como puntos: se infieren de `construction`.

### Dónde vive cada cosa

- Las abreviaturas para leer y escribir texto (pb, aum, dism; sc, inc, dec) viven en `pattern-core/src/stitches.ts`. El paquete `glossary` las reutilizará para mostrar nombres completos.
- El progreso de un proyecto **no** está en el patrón: es un puntero (parte, vuelta, punto) sobre la secuencia derivada.

## Alternativas descartadas

- **Guardar el gráfico ya repetido**: duplica datos y rompe la edición del motivo.
- **Guardar el texto escrito como fuente de verdad**: obliga a volver a interpretar texto en cada vista y no admite colores por punto de forma confiable.
- **Identificadores de lana en cada celda**: más legible, pero el doble de pesado; no compensa.

## Consecuencias

- Toda edición es una operación sobre el modelo; la interfaz nunca calcula conteos.
- El validador puede revisar cualquier patrón, venga de la interfaz o de la IA, con las mismas reglas.
- Agregar palillo escrito, la forma de canesú u otros puntos requiere `schemaVersion: 2` y una migración.

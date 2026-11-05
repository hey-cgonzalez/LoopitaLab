# ADR 0005: Forma de círculo y disminuciones radiales derivadas de la máscara

- Estado: aceptado (aprobado por la usuaria el 2026-11-05. Reglas corregidas por `experto-tejido` el 2026-11-05, ver la sección final. Lo marcado "validar con tejedora" se confirma antes de cerrar la fase 2)
- Fecha: 2026-11-05
- Paquetes: `packages/pattern-core` (conteos y validación), `packages/stitch-render` (geometría)
- Relacionado: [ADR 0003](0003-colorwork-en-esquema-v1.md), [ADR 0004](0004-render-de-puntos-2d.md)

## Contexto

La copa de un gorro en colorwork se diseña como un gráfico en cuña:

- el motivo es una cuña;
- se repite `repeat.x` veces alrededor;
- en cada vuelta de disminución la cuña pierde puntos.

En el modelo v1, los puntos que desaparecen son celdas `NO_STITCH`. Hay que decidir:

- cómo se derivan de ahí las disminuciones;
- cómo se dibuja el círculo;
- qué se valida.

Todo sin pedirle a la interfaz ni a la IA que calculen conteos (regla de oro 2).

## Opciones

1. **Disminuciones derivadas de la máscara**: el conteo de cada vuelta es la cantidad de celdas con punto. Las disminuciones son la diferencia con la vuelta anterior.
2. **Disminuciones declaradas**: un campo `decreases` por fila o un símbolo por celda. Requiere `schemaVersion: 2`.
3. **Fórmula de copa paramétrica**: por ejemplo, "disminuir 1 por cuña cada 2 vueltas". La máscara se genera desde la fórmula.

## Decisión

Opción **1** para la fase 2. La 3 puede existir como **asistente** que escribe la máscara con operaciones de `edit.ts` (sigue siendo fuente única). La 2 queda para la capa de símbolos de un ADR futuro.

### Conteos (pattern-core)

- `rowStitchCount(chart, y)` es la cantidad de celdas distintas de `NO_STITCH` en la fila `y` del gráfico completo. Es igual a `repeat.x` multiplicado por la cantidad del motivo.
- `shaping(chart)` devuelve, por fila, `{ stitches, change, perRepeat }`:
  - `change < 0` son disminuciones;
  - `change > 0` son aumentos.
- Las **columnas** donde se pierde un punto se derivan así: en la fila `y` hay `NO_STITCH` y en la fila `y - 1` había punto, en la misma columna del motivo.
- El **tipo y la inclinación** de cada disminución no se derivan en v1.
  - La interfaz muestra conteos y columnas ("V31: 56 pts, −8, 1 por repetición"), no "2 juntos al derecho" ni "inclinada a la izquierda (desliza, desliza, teje)".
  - Escribir la instrucción requiere la capa de símbolos.
  - El color del punto que resulta de la disminución tampoco se expresa: la vista usa el color de la fila `y` (ADR 0003).

### Geometría del círculo (stitch-render)

Sea `H` la altura del gráfico completo, `R = repeat.x` y `c(y)` los puntos de una repetición en la fila `y`.

- **Anillo de cada fila**, con el anillo 0 en el centro:
  - `bottom_up` (la copa se cierra al final): `k = H - 1 - y`;
  - `top_down` (se empieza en el centro): `k = y`.
- **Grosor radial**: todos los anillos miden lo mismo, la altura de una fila según la muestra (`10 / rowsPer10cm` cm, escalada). El anillo `k` va de `k · alto` a `(k + 1) · alto`.
- **Cuñas**: la repetición `w` (de 0 a `R - 1`) ocupa el sector `[w, w + 1) · 2π / R`.
- **Punto `i` dentro de su repetición** (contando solo las celdas con punto, en orden de columna):
  - su centro angular es `θ = (w + (i + 0.5) / c(y)) · 2π / R`;
  - así, las celdas `NO_STITCH` desaparecen y la cuña se ve continua, que es como queda el tejido real.
- **Sentido** (validar con tejedora). Visto desde fuera, mirando el círculo desde arriba:
  - en `bottom_up`, `x` creciente avanza en sentido **antihorario**;
  - en `top_down`, `x` creciente avanza en sentido **horario**.

  Invertir `direction` espeja el ángulo. La columna 0 empieza en el ángulo 0, que se dibuja hacia abajo en pantalla.
- **Orientación del punto**:
  - el eje de la V es radial;
  - el **extremo abierto** de la V apunta hacia donde crece la labor: el centro en `bottom_up`, afuera en `top_down`;
  - el vértice apunta hacia donde empezó la labor;
  - la escala horizontal es el arco disponible `(2π · r_medio / (R · c(y)))` dividido por el ancho del punto según la muestra.
- **Deformación**:
  - `ringDistortion[k]` es esa razón, por anillo;
  - si es menor que 0,6 o mayor que 1,6, la interfaz explica que la proyección plana comprime o estira los puntos, porque en la realidad la copa forma una cúpula;
  - **los umbrales 0,6 y 1,6 son una heurística sin fuente** (validar con tejedora);
  - es un aviso de vista, no un error del patrón (regla de oro 8).
- **Dato de referencia opcional para la ayuda** (no es una validación):
  - un disco plano suma, por vuelta, unos `2π × puntos / filas` puntos de la muestra (≈ 4,6 con una muestra de 22 × 30);
  - si se agregan menos, la pieza forma una cúpula; si se agregan más, ondula.

### Plano y tubo con máscara

- Las celdas `NO_STITCH` se dibujan vacías en su columna, para que la cuña se vea como en el gráfico impreso.
- El tubo proyecta la columna `x` del gráfico completo con el ángulo `φ = 2π · x / ancho total`, ancho total `= width × repeat.x`. Los puntos de la cara trasera se atenúan (`shade`).

### Validaciones (pattern-core)

Solo cuando `renderAs` es `circle`, salvo que se indique otra cosa. "Anterior" y "restantes" son totales de la vuelta completa (`rowStitchCount`), no por repetición.

| Código | Severidad | Regla |
|---|---|---|
| `CHART_SHAPING_IMPOSSIBLE` | error | **Todas las formas.** En una vuelta quedan menos de `ceil(anterior / 3)` puntos: ni disminuyendo de a 3 juntos se llega. Ejemplo: 80 → 8 |
| `CHART_SHAPING_TOO_FAST` | advertencia | **Todas las formas.** Disminución: quedan menos de `ceil(anterior / 2)` puntos (80 → 30 avisa, 80 → 40 no). Aumento: quedan más de `anterior × 2`. El umbral de aumento evita falsos avisos al inicio de un `top_down` (8 → 16 no avisa) |
| `CHART_SHAPING_STEEP` | advertencia | Más de 2 puntos menos (o más) por repetición en una vuelta: −3 por repetición avisa, −2 no |
| `CHART_SHAPING_UNEXPECTED` | advertencia | Aumentos en un círculo `bottom_up`, o disminuciones en un `top_down`. Queda como advertencia porque un aumento después de un elástico es legítimo |
| `CHART_CIRCLE_REPEATS` | info | `repeat.x` fuera de 4 a 12 (validar con tejedora). 6, 8, 10 y 12 son comunes |
| `CHART_WEDGE_TOO_NARROW` | info | El máximo de puntos por cuña (máximo de `c(y)`) es menor que 4: no hay espacio para un dibujo (validar con tejedora) |
| `CHART_CIRCLE_REPEAT_Y` | advertencia | `repeat.y > 1` en un círculo **cuyo motivo tiene `NO_STITCH`**: repetir una cuña hacia arriba vuelve a abrirla. Sin máscara no avisa |
| `CHART_CIRCLE_NOT_CLOSED` | info / advertencia | En `bottom_up`, por el **total** que queda en la última vuelta, sin importar `R`: info si es mayor que 16; advertencia si es mayor que 24. Fuente: Interweave recomienda cerrar con 5 a 8 puntos, pasando la hebra por ellos |
| `CHART_CIRCLE_START` | info | En `top_down`, el total de la fila 0 es menor que 4 o mayor que 16. Un anillo mágico suele tener de 6 a 12 puntos |
| `CHART_ROWS_SHAPE` | advertencia | Tubo o círculo con `workedIn: "rows"` (ADR 0003) |

`CHART_SHAPING_IMPOSSIBLE` y `CHART_SHAPING_TOO_FAST` revisan conteos, no la vista. Como `renderAs` nunca afecta los conteos (ADR 0003), aplican a todas las formas. Los nombres `CHART_SHAPING_TOO_FAST` y `CHART_CIRCLE_START` los propone `arquitecto`; la revisión solo describía la regla.

## Alternativas descartadas

- **2. Disminuciones declaradas**: obliga a cambiar el esquema y duplica la información de la máscara (dos fuentes que pueden contradecirse). Se retomará solo para el tipo y la inclinación, que la máscara no expresa.
- **3. Fórmula como fuente de verdad**: impide los gráficos en cuña libres, como las copas con estrellas o las disminuciones irregulares, que son justamente lo que dibujan las tejedoras.
- **Radio según la circunferencia real** (`r = puntos · ancho / 2π`): es una proyección fiel de la cúpula, pero junta los anillos del borde hasta volverlos ilegibles. Se puede ofrecer como modo alternativo de vista más adelante, sin cambiar el modelo.
- **Ubicar el punto según su columna (con huecos)**: deja agujeros radiales que no existen en el tejido.

## Consecuencias

- La copa es solo un gráfico con máscara. Los conteos por vuelta salen de `pattern-core` y la interfaz los muestra.
- **Pruebas de propiedades**:
  - en cada anillo, la suma de los arcos de las instancias es igual a 2π;
  - las instancias de un anillo son `rowStitchCount(chart, y)`;
  - `shaping` es consistente con `rowStitchCounts`;
  - cambiar `renderAs` nunca cambia `stitchTotal`;
  - en `bottom_up` la fila 0 queda afuera; en `top_down`, en el centro;
  - invertir `direction` espeja los ángulos.
- La limitación de no saber el tipo de disminución queda visible en la interfaz y en el [roadmap](../roadmap.md).
- Los casos de dominio para QA están en [docs/casos-dominio-colorwork.md](../casos-dominio-colorwork.md).

## Revisión de experto-tejido (2026-11-05)

El estado sigue aceptado. La decisión (disminuciones derivadas de la máscara) no cambia. Lo corregido:

- **Sentido de giro**: depende de la dirección. `x` creciente es antihorario en `bottom_up` y horario en `top_down` (validar con tejedora). La V abre hacia donde crece la labor.
- **Validaciones nuevas**:
  - `CHART_SHAPING_IMPOSSIBLE` (error) y `CHART_SHAPING_TOO_FAST` (advertencia), sobre los totales de la vuelta;
  - `CHART_WEDGE_TOO_NARROW`;
  - `CHART_CIRCLE_START`, para el inicio en `top_down`.
- **Umbrales corregidos**:
  - las repeticiones pasan de 5 a 10 a un rango de 4 a 12;
  - el cierre se juzga por el total restante (info sobre 16, advertencia sobre 24) y no por repetición;
  - `CHART_CIRCLE_REPEAT_Y` solo avisa si hay máscara.
- **`ringDistortion`**: los umbrales 0,6 y 1,6 quedan marcados como heurística sin fuente. Se agrega el dato del disco plano como referencia para la ayuda.
- **Terminología**: "pts" en vez de "p", porque "p" es *purl*. Nombres de disminución según el glosario pendiente.

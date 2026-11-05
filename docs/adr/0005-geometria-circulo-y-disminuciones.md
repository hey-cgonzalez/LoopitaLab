# ADR 0005: Forma de círculo y disminuciones radiales derivadas de la máscara

- Estado: propuesto (requiere aprobación de la usuaria y revisión de `experto-tejido`)
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
- El **tipo y la inclinación** de cada disminución no se derivan en v1. La interfaz muestra conteos y columnas ("V31: 56 p, −8, 1 por repetición"), no "2 juntos" o "deslizado". Escribir la instrucción requiere la capa de símbolos.

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
- **Sentido** (ET: lo confirma `experto-tejido`): `x` creciente avanza en sentido antihorario visto desde fuera, mirando la copa desde arriba. La fila 0 empieza en el ángulo 0, que se dibuja hacia abajo en pantalla.
- **Orientación del punto**:
  - el eje vertical de la V apunta en sentido radial, hacia el centro en `bottom_up` y hacia afuera en `top_down`;
  - la escala horizontal es el arco disponible `(2π · r_medio / (R · c(y)))` dividido por el ancho del punto según la muestra.
- **Deformación**:
  - `ringDistortion[k]` es esa razón, por anillo;
  - si es menor que 0,6 o mayor que 1,6, la interfaz explica que la proyección plana comprime o estira los puntos, porque en la realidad la copa forma una cúpula;
  - es un aviso de vista, no un error del patrón (regla de oro 8).

### Plano y tubo con máscara

- Las celdas `NO_STITCH` se dibujan vacías en su columna, para que la cuña se vea como en el gráfico impreso.
- El tubo proyecta la columna `x` del gráfico completo con el ángulo `φ = 2π · x / ancho total`, ancho total `= width × repeat.x`. Los puntos de la cara trasera se atenúan (`shade`).

### Validaciones (pattern-core)

Solo cuando `renderAs` es `circle`, salvo que se indique otra cosa. Los umbrales los confirma `experto-tejido` (ET).

| Código | Severidad | Regla |
|---|---|---|
| `CHART_CIRCLE_REPEATS` | info | `repeat.x` fuera de 5 a 10 (ET): las cuñas quedan muy anchas o muy angostas |
| `CHART_CIRCLE_REPEAT_Y` | advertencia | `repeat.y > 1` en círculo: repetir una cuña hacia arriba vuelve a abrirla |
| `CHART_SHAPING_UNEXPECTED` | advertencia | Aumentos en un círculo `bottom_up`, o disminuciones en un `top_down` |
| `CHART_SHAPING_STEEP` | advertencia | Más de 2 puntos menos (o más) por repetición en una vuelta (ET) |
| `CHART_CIRCLE_NOT_CLOSED` | info | En `bottom_up`, la última vuelta deja más de 2 puntos por repetición (ET): la copa queda abierta; lo habitual es pasar la hebra por los puntos restantes |
| `CHART_ROWS_SHAPE` | advertencia | Tubo o círculo con `workedIn: "rows"` (ADR 0003) |

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
  - cambiar `renderAs` nunca cambia `stitchTotal`.
- La limitación de no saber el tipo de disminución queda visible en la interfaz y en el [roadmap](../roadmap.md).

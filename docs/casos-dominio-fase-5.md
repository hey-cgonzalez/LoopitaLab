# Casos de dominio: fase 5, hito 1 (imagen a gráfico de colorwork)

Casos de prueba de dominio para `qa-tester`, de la revisión T1 de `experto-tejido` (2026-11-16) sobre los [ADR 0012](adr/0012-pipeline-imagen-a-patron.md) y [0013](adr/0013-subidas-y-storage.md). Siguen el estilo de [casos-dominio-colorwork.md](casos-dominio-colorwork.md) y [casos-dominio-fase-3.md](casos-dominio-fase-3.md). Cubren solo la ruta plana y el redactor; la ruta 3D queda para T1-3D.

- **Criterio de aceptación**: cada caso F5-n tiene una prueba automática (CA5-D1). Las de `image-chart`, `pattern-core` y `ai-router` van con `node:test`.
- **Casos "validar con tejedora"**: la prueba usa el valor actual y lleva el comentario `// validar con tejedora`. Esos valores van a la ronda T1b.
- **Regla física o convención**: lo marcado **[física]** no varía entre tejedoras. Lo marcado **[convención]** varía y es un valor por defecto. Lo marcado **[criterio]** es decisión de producto de este documento, sin fuente externa.
- **Fuentes**: solo las ya citadas en [casos-dominio-colorwork.md](casos-dominio-colorwork.md#fuentes) (Interweave, Osborn Fiber, Craft Yarn Council). Esta revisión no consultó fuentes nuevas. Todo lo que no tiene fuente va como [criterio] y "validar con tejedora".

## Convenciones

- `A`, `B`, `C` son lanas y `.` es `NO_STITCH`. Las filas se escriben desde la fila 0 (la primera que se teje).
- Gráfico generado: `ChartFromImage` del ADR 0012, sección 8. "Fila 0" es la primera que se teje. En `bottom_up` es la fila de abajo de la imagen.
- **Muestra supuesta**: la tabla de [casos-dominio-colorwork.md](casos-dominio-colorwork.md#muestra-supuesta-por-grosor). Para el grosor 4 son 18 puntos y 24 filas en 10 cm.
- **Umbral de hebra flotante**: el de siempre, `max(1, min(floor(2,5 × puntos en 10 cm / 10), 5))` puntos. El gráfico generado se mide con el mismo código que usa `validatePattern`.
- Las métricas del gráfico generado (`noiseRatio`, `floatRowRatio`, `rowsSimplified`, `quantError`) las calcula `image-chart`, no la IA.

---

## 1. Qué imágenes dan un gráfico honesto (pregunta 1)

### Principio

Un gráfico de colorwork solo es honesto si la tejedora puede tejerlo con hebras flotantes. Eso exige pocas zonas de color, sin ruido de un punto y con hebras cortas. Una foto con degradados no cumple nada de eso. Convertirla en silencio da un gráfico que se puede tejer pero no se reconoce, y eso es peor que rechazarla. **[criterio]**

Las decisiones usan dos fuentes:

- **El triaje (IA)**, que da `fit` (`good`, `poor` o `unsuitable`), `complexity`, `hasEmbeddedText`, `containsPeople` y `reasons`.
- **Las métricas del código** (sección 1.2), que no dependen de la IA y se ven en la vista previa antes de gastar un intento.

**La regla es "el peor de los dos manda".** Si el triaje dice `unsuitable`, o una métrica pasa su umbral de bloqueo, no se genera. Si el triaje dice `poor`, o una métrica pasa su umbral de aviso, se genera con aviso visible.

### 1.1 Tabla "se genera / se genera con aviso / no se genera"

| Tipo de imagen | Decisión | Por qué (física o convención) | Qué ve la usuaria |
|---|---|---|---|
| Dibujo simple de colores planos (ilustración, ícono, sticker, sin degradados) | **Se genera** | Pocas zonas y bordes limpios: lo ideal en colorwork | Nada especial |
| Motivo geométrico o repetitivo (grecas, rombos, estrellas, copos, damero) | **Se genera** | Se tejen bien; además `detectExactRepeat` puede dar motivo + repeticiones | Si hay repetición exacta, se ofrece como motivo repetido |
| Pixel art que ya está en cuadrícula | **Se genera** | Mapea 1 a 1 si el ancho en puntos coincide con el de la cuadrícula | Sugerir ese ancho como "tamaño exacto" (mejora) |
| Silueta o imagen de 2 colores (sombra, recorte, estarcido) | **Se genera** | 2 colores por fila: Fair Isle clásico | Nada especial |
| Mandala o motivo con simetría | **Se genera** | Aprovecha el motivo; las diagonales finas salen con escalón (aviso solo si hay ruido) | Nada especial |
| Letras o palabras grandes y de trazo grueso (texto de la imagen) | **Con aviso** | Una letra legible necesita al menos 7 puntos de alto y trazos de al menos 1 punto **[criterio, validar con tejedora]**. Si el alto en puntos es menor, la letra no se lee | "El texto necesita al menos N puntos de alto para leerse" |
| Texto pequeño, capturas de pantalla, documentos, QR | **No se genera** | A resolución de punto el texto se pierde, y un QR no se escanea sobre tejido, porque los módulos se deforman con la muestra **[criterio]** | Rechazo neutral con una sugerencia ("prueba con un dibujo más simple") |
| Dibujo de línea fina (contorno de 1 px, mapa, plano) | **Con aviso** | Un trazo de menos de 1 punto se rompe en el remuestreo, y la línea queda discontinua y con hebras largas | "Los trazos finos se pueden cortar; prueba con más ancho" |
| Foto de objeto con fondo liso (fruta, taza) a 3 o 4 colores | **Con aviso** | Se reconoce si hay pocas sombras. Con muchas, el gráfico es un posterizado con ruido | Aviso de "parece una foto" si `noiseRatio` pasa su umbral |
| Foto de paisaje, cielo o atardecer, o cualquier foto con degradados amplios | **No se genera** (ofrecer solo si la usuaria pide ver la vista previa, ver 1.3) | Con 2 a 8 colores el degradado se vuelve bandas con borde de ruido. Es el caso de los degradados y el tramado, que están fuera de la v1 | "Las fotos con degradados no se convierten bien; prueba con una ilustración o una silueta" |
| Foto de mascota o animal (pelaje) | **Con aviso** (o no, según métricas) | La textura da ruido de 1 punto. Solo funciona como silueta | Aviso, o bloqueo si `noiseRatio` pasa el umbral de bloqueo |
| Foto de una persona identificable (retrato, selfi, foto de grupo con caras) | **No se genera** (ya se rechaza: decisión 10, `identifiable_person`) | Decisión de producto hasta la revisión legal. No es un tema de tejido | Rechazo neutral, sin acusar |
| Personas no identificables (silueta, dibujo genérico, personaje propio de ilustración, persona muy lejana) | **Se genera** | El triaje solo rechaza `identifiable_person`. `containsPeople = true` solo informa | Nada especial |
| Menor de edad identificable | **No se genera** (`minor`) | Moderación ya definida | Rechazo neutral |
| Logotipo o personaje de una marca o franquicia conocida | **No se genera en la v1** | No es un problema de tejido: son derechos de terceros. El aviso de derechos pide permiso, pero el triaje puede reconocer lo evidente. Falta definir el motivo en `reasons` (ver enmienda E-5) | Rechazo neutral: "No podemos convertir logotipos o personajes de marcas" |
| Logotipo propio de la usuaria, o dibujo suyo | **Se genera** | No se puede distinguir de uno ajeno. Se confía en la casilla de derechos (ADR 0013, sección 7) | Nada especial |
| Foto de una prenda tejida o de un gráfico de otra autora | **Con aviso** | Es copia de un diseño con autoría. No es técnico, pero conviene avisar | "Si el diseño es de otra persona, confirma que tienes permiso" |
| Imagen casi de un solo color (1 color efectivo) | **No se genera** | No hay colorwork: hay un solo color | "Esta imagen tiene un solo color" |
| Imagen muy pequeña o muy borrosa (menos de 64 px de lado menor) | **Con aviso** (ver enmienda E-14: el rechazo de 64 px deja fuera a los íconos de 16 a 48 px) | El detalle ya se perdió antes de convertir | "Poca resolución: el resultado puede salir irreconocible" |
| Imagen con transparencia | **Se genera** | Alfa menor que 128 es fondo (regla F5-14) | Se informa el color de fondo como supuesto |
| Documento personal, contenido sexual, violento, de odio o de autolesión | **No se genera** | Moderación (`reasons`) | Rechazo neutral |

### 1.2 Métricas deterministas (las calcula `image-chart`)

| Métrica | Definición | Aviso | Bloqueo |
|---|---|---|---|
| `noiseRatio` | Casillas aisladas (sin ninguna de sus 4 vecinas del mismo color) sobre el total | Más del 2 % | Más del 15 % |
| `floatRowRatio` | Filas que dispararían `CHART_FLOAT_LONG` sobre el total de filas | Más del 0 % | Más del 40 % |
| `rowsSimplified` | Filas que tuvieron más de N colores y se simplificaron (ver 2) sobre el total | Más del 10 % | Más del 60 % |
| `quantError` | Error medio ΔE2000 entre el píxel (promediado por área) y el color asignado, ponderado por casilla | Más de 12 | Más de 25 |

- **Todos los umbrales son [criterio] y "validar con tejedora"**, y se calibran con el conjunto de evaluación de la sección 9: debe haber al menos una imagen "buena" bajo cada umbral de aviso y al menos una "mala" sobre cada umbral de bloqueo.
- **Bloqueo** significa que `iniciar` no se llama y la interfaz explica por qué. No significa que el documento sea inválido: un documento con hebras largas sigue siendo `valid` (son advertencias).
- Una imagen que pasa un umbral de aviso se genera, pero la advertencia tiene que aparecer en la vista previa y en los supuestos (CA5-D3).
- Estas métricas dejan fuera a la IA de la decisión de bloqueo duro por métricas. La IA solo puede agravar (`unsuitable`), nunca relajar un bloqueo del código.

### 1.3 Fotos con degradados: ¿se muestra la vista previa?

- **Propuesta**: con bloqueo por métricas, la vista previa se muestra igual (es instantánea y gratis, regla de oro 7), con el aviso grande y el botón "Crear" deshabilitado.
- Así la usuaria entiende por qué, y no queda la sensación de que "no funciona".
- Si el bloqueo viene solo del triaje (`unsuitable`) y las métricas están bien, el botón "Crear" ya no llega a mostrarse, porque el triaje ocurre después de iniciar. El triaje que dice `unsuitable` devuelve el cupo (decisión 9, "no es `savable`").

---

## 2. Colores (pregunta 2)

### Casos

| # | Caso | Esperado |
|---|---|---|
| F5-1 | Rango de colores totales | `maxColors` va de **2 a 8** (confirmado). El valor por defecto es **4**. 5 a 8 muestran un aviso: "Cada color es una lana más que cortar, cambiar y rematar." **[criterio]**. Por debajo de 2 o por encima de 8, `rasterToChart` lanza (los controles de la interfaz ya lo impiden) |
| F5-2 | Una imagen con menos colores efectivos que `maxColors` | `colors.length` es el número real, no `maxColors`. El supuesto "colores reducidos a N" solo aparece si la imagen tenía más colores que `maxColors` (ver F5-26) |
| F5-3 | La lana es una por color | Cada color del gráfico es una lana. Se respeta `LIMITS.maxYarns` (32), que nunca se alcanza con `maxColors ≤ 8` |
| F5-4 | Colores casi iguales entre sí | Dos colores cuantizados con ΔE2000 menor que `MERGE_MAX_DELTA_E` son candidatos a fusión. **Valor sugerido: 10** **[criterio, validar con tejedora]**: por debajo de eso, en lana real los dos colores se confunden. `catalogo-lanas` fija el valor final. El umbral de percepción de `NEAR_COLOR_DELTA_E` (2,3) no sirve para esto: es la diferencia apenas perceptible entre dos muestras vistas juntas, y la tela real, con sus sombras de hebra, necesita bastante más |
| F5-5 | Contraste entre colores vecinos | Si dos colores del gráfico están a menos de `MERGE_MAX_DELTA_E` entre sí y no se fusionaron, se avisa: "Estos dos colores se parecen: en la lana real puede costar distinguirlos." (info) |

### Colores por fila (Fair Isle frente a intarsia)

- **[física]** En colorwork a hebras (Fair Isle, jacquard) todas las lanas de una fila viajan por el revés. Con 2 lanas en la fila, una va en cada mano o se alterna. Con 3 o más, aumentan la tensión irregular, el enredo y el grosor de la tela **[convención: lo habitual es 2 por fila]**. La validación actual lo refleja: `CHART_COLORS_PER_ROW` es info cuando hay más de 2.
- **[física]** Intarsia es otra técnica: cada zona tiene su propia hebra o ovillo, sin hebras que cruzan. Permite muchos colores por fila, pero se teje en ida y vuelta con ovillos auxiliares. **Está fuera de la v1** (ADR 0012, sección 2).
- Por eso esta v1 genera **solo colorwork a hebras**. La decisión es:
  - **ideal: hasta 2 colores por fila**;
  - **con aviso: 3 colores por fila**, solo si la usuaria lo pide;
  - **nunca 4 o más en una fila**: se simplifican siempre.

| # | Caso | Esperado |
|---|---|---|
| F5-6 | Parámetro `maxColorsPerRow` | Valores `2` (por defecto) o `3` (avanzado). Cualquier otro lanza. Con `3`, la interfaz avisa: "Tres lanas por fila es más difícil de tejer." **[convención]** |
| F5-7 | Fila con más de `maxColorsPerRow` colores | La conversión **simplifica la fila**, nunca la deja pasar. Regla determinista: se conservan los `maxColorsPerRow` colores con más casillas en esa fila (empate: el de menor índice). Cada casilla de otro color pasa al color conservado más cercano en CIELAB (ΔE2000; empate: el de menor índice) |
| F5-8 | Ejemplo de F5-7 con `maxColorsPerRow = 2` y fila `A B C A B C` | Cada color tiene 2 casillas, así que se conservan A y B (menor índice). Las dos C pasan al más cercano de A y B. Resultado de la fila: solo A y B. `rowsSimplified` suma 1 |
| F5-9 | Simplificar nunca crea una lana nueva | Después de simplificar, `colors.length` no aumenta. Todo índice de `cells` sigue en rango (propiedad) |
| F5-10 | Cuántas filas se simplificaron | `rowsSimplified` cuenta las filas modificadas. Si es mayor que 0, el supuesto F5-27 aparece. Más del 10 % da aviso, y más del 60 % bloquea (sección 1.2) |

### Qué hace la conversión cuando hay demasiados colores

1. Cuantización global a `maxColors` colores, en CIELAB, determinista (ya definida en el ADR).
2. Fusión de los colores casi iguales (el asistente de paleta propone y el código acepta con ΔE).
3. Simplificación por fila a `maxColorsPerRow` (F5-7).
4. Opcionalmente, limpieza de puntos sueltos y de hebras largas (sección 3).

- Cada paso que cambia algo deja un supuesto con su cifra (sección 6).
- Las cifras de los supuestos las calcula el código, nunca el redactor.

### Una lana que desaparece por muchas filas

- **[física]** Si una lana no se usa durante muchas filas, hay que cortarla y volver a engancharla, o llevarla por el borde (en ida y vuelta) o por dentro. En redondo suele cortarse. Eso deja cabos que rematar.
- El validador actual no mide esto: solo mide hebras dentro de una fila.
- Propuesta de mejora **(no bloquea la v1)**: un aviso informativo "La lana X no se usa entre la fila a y la fila b: córtala y deja un cabo para rematar", con el umbral por definir **[validar con tejedora]**. Va a T1b.

---

## 3. Hebras flotantes (pregunta 3)

### Hechos

- La regla del tope ya existe y no se cambia: 5 puntos como máximo, y 2,5 cm según la muestra (tabla del caso 17 de `casos-dominio-colorwork.md`: 5, 5, 5, 5, 4, 3, 2, 1 por categoría). **[convención]** Fuentes: Interweave y Osborn Fiber.
- **[física]** Una hebra larga se engancha con los dedos o con los anillos, deforma la tela y se afloja. Cuánto es "larga" depende de la muestra, y por eso el tope es en cm y en puntos.
- El validador solo avisa: `CHART_FLOAT_LONG` es **advertencia**, y el documento sigue siendo `valid`.

### Decisión

**La conversión no corrige la imagen en silencio. Avisa, y ofrece una limpieza opcional que la usuaria ve antes de crear.**

| Nivel | Qué hace | Cuándo |
|---|---|---|
| 0. Aviso (siempre) | El gráfico sale como es y `validatePattern` da `CHART_FLOAT_LONG` por cada fila afectada. `floatRowRatio` se muestra en la vista previa | Siempre |
| 1. Limpieza de puntos sueltos (`cleanup: "specks"`) | Las casillas aisladas (sin vecinas del mismo color) pasan al color de la mayoría de sus 4 vecinas. Empate: el color de menor índice | Opcional, desactivada. Se ofrece si `noiseRatio` pasa su umbral de aviso |
| 2. Limpieza de hebras largas (`cleanup: "floats"`) | Para cada hebra de más de `maxFloat` puntos en una fila, se recolorea la casilla del medio de la brecha con el color de la hebra (así la hebra queda dividida en dos y se engancha en el medio). Se repite hasta que no quede ninguna | Opcional, desactivada. Se ofrece si `floatRowRatio` es mayor que 0 |
| 3. Enganchar a mano | La tejedora engancha la hebra al tejer. No cambia el gráfico | Siempre posible; la interfaz lo recuerda |

- **Nunca se cambia la imagen sin que la usuaria lo vea en la vista previa y lo active.** La vista previa es instantánea, así que probar las dos limpiezas no cuesta nada.
- Cada limpieza activa deja un supuesto con la cantidad de casillas cambiadas (F5-28 y F5-29).
- **Hebras muy largas** (más del doble del tope): la fila lleva aviso fuerte en la interfaz ("esta hebra es muy larga: engánchala varias veces o cambia el dibujo"). **[criterio]**

| # | Caso | Esperado |
|---|---|---|
| F5-11 | Gráfico generado sin limpieza, con una hebra de 7 puntos y muestra de 18 puntos (máximo 4) | `validatePattern` da `CHART_FLOAT_LONG` y el documento es `valid`. `floatRowRatio` cuenta esa fila. El supuesto F5-28 aparece |
| F5-12 | `cleanup: "floats"` | Después de limpiar, `validatePattern` **no** da `CHART_FLOAT_LONG` en ninguna fila (propiedad **IA-P7**). El número de casillas cambiadas es el del supuesto. El conjunto de colores no cambia |
| F5-13 | Mismo caso con el gráfico en redondo (`workedIn: "rounds"`) | La hebra que cierra la vuelta (primera y última casilla del color) cuenta como la del caso 15 de `casos-dominio-colorwork.md`. La limpieza usa la misma función del validador. **`image-chart` no duplica la regla**: recibe el máximo desde `pattern-core` (ver enmienda E-3) |

---

## 4. Proporción de la muestra, alfa y orientación (pregunta 4)

### Por qué hace falta

- **[física]** Un punto de palillo no es cuadrado: es más ancho que alto. Con la muestra supuesta de punto jersey, un punto mide `10 / puntos` cm de ancho y una fila `10 / filas` cm de alto. Para el grosor 4: 0,556 cm de ancho y 0,417 cm de alto.
- Si se dibuja un píxel por casilla, la imagen sale **más alta de lo debido**. Para que se vea con su proporción real hace falta más filas que puntos.

### Fórmula

`filas = round(anchoEnPuntos × (altoImagen / anchoImagen) × (filasEn10cm / puntosEn10cm))`

- Es la del ADR 0012, sección 2, y es correcta. El factor `filasEn10cm / puntosEn10cm` es **1,333** para el grosor 4 (24 / 18). **No** es 1,35, porque las filas de la tabla ya están redondeadas.
- Con la muestra real, el factor sale de los dos números que dio la usuaria.

| # | Caso | Esperado |
|---|---|---|
| F5-14 | Imagen 800 × 600 (aspecto 0,75), ancho 60 puntos, grosor 4 supuesto (18 y 24) | `filas = round(60 × 0,75 × 24 / 18)` = **60**. Medidas: 60 / 18 × 10 = 33,3 cm de ancho y 60 / 24 × 10 = 25 cm de alto: proporción 4:3, como la imagen |
| F5-15 | Imagen cuadrada 100 × 100, ancho 60, grosor 4 | **80** filas. No 60: un punto más ancho que alto pide más filas |
| F5-16 | Imagen cuadrada, ancho 20, grosor 7 (6 y 8) | `round(20 × 8 / 6)` = 27 filas. Grosor 0 (37 y 50): `round(20 × 50 / 37)` = 27. El factor cambia con el grosor |
| F5-17 | Muestra incompleta: la usuaria da solo los puntos | Las filas se calculan con `ROWS_PER_STITCH_RATIO` (1,35) y se marcan **supuesto** (F5-24). Nunca se completa en silencio |
| F5-18 | Propiedades (IA-P4) | Más ancho da un alto igual o mayor. Más filas en 10 cm da un alto mayor. La proporción en cm de lo generado coincide con la de la imagen con error de redondeo de menos de media fila y menos de medio punto |

### Muestra de colorwork frente a punto jersey

- **[convención, validar con tejedora]** La muestra publicada es de punto jersey. El colorwork a hebras suele salir **más apretado** (la tela queda más gruesa y las hebras de atrás tiran), y la proporción filas/puntos suele estar más cerca de 1,25 a 1,3 que de 1,35 (ya dicho en `casos-dominio-colorwork.md`).
- La consecuencia práctica es que el tamaño real puede ser algo menor y la proporción algo distinta. El supuesto de la muestra lo dice (texto F5-24), y la interfaz recuerda tejer una muestra **en colorwork** con las lanas del diseño (regla de oro 8).

### Alto acotado por el límite de 200

| # | Caso | Esperado |
|---|---|---|
| F5-19 | Imagen cuadrada, ancho pedido 200, grosor 4 | Las filas serían 267, más que `LIMITS.maxMotifSide` = 200. **No se aplasta ni se recorta.** Se reduce el ancho a `floor(200 × puntos / filas)` = **150** y las filas quedan en 200. `clampedHeight = true`, y aparece el supuesto F5-30. Con grosor 0: ancho 148 y filas 200 |
| F5-20 | Imagen muy ancha (3000 × 300 efectiva), ancho 200 | Filas = `round(200 × 0,1 × 24 / 18)` = 27. El ancho se respeta. `clampedHeight = false` |
| F5-21 | Ancho mínimo | `widthStitches` mínimo **8** (el ADR dice 4; ver enmienda E-2). Menos de **20** muestra el aviso "con tan pocos puntos solo se reconocen formas muy simples" **[criterio, validar con tejedora]** |

### Fondo y transparencia

| # | Caso | Esperado |
|---|---|---|
| F5-22 | Píxel con alfa menor que 128 | Es **fondo**. Pasa a ser una casilla del **color de fondo**, nunca `NO_STITCH` (en la v1 el gráfico plano es un rectángulo completo, sin cuñas). Regla **[criterio]** |
| F5-23 | Color de fondo | Orden de elección: 1) el que fija el asistente de paleta (`background`), si el índice existe; 2) si no, el color cuantizado con más casillas del borde de la imagen. Se informa como supuesto (F5-31). El alfa parcial se compone sobre blanco **antes** de cuantizar, para que el borde translúcido no cree un color gris falso |

### Orientación (el gráfico no se espeja)

| # | Caso | Esperado |
|---|---|---|
| F5-24 | `bottom_up`, imagen de 4 × 3 | `cells` fila 0 = fila de abajo de la imagen. La columna 0 sigue siendo la de la izquierda de la imagen. El gráfico se ve igual que la imagen (no está espejado ni invertido) |
| F5-25 | `top_down` | Se cumple la propiedad: aplicar `wornOrientation` al gráfico generado reproduce la imagen remuestreada con el arriba hacia arriba. **La prueba verifica la propiedad, no una dirección escrita a mano** (el caso 5 de `casos-dominio-colorwork.md` define `wornOrientation` y su dirección). **Validar con tejedora**: cómo se ve en "Tejiendo" un gráfico `top_down` (ya pendiente en F3-4) |

---

## 5. Tamaño del gráfico por uso (pregunta 5)

- **Límites de la interfaz**: `LIMITS.maxMotifSide` es 200 por lado.
- **Por defecto**: ancho 60 puntos. Con el grosor 4 son 33 cm.
- **Forma de trabajo**: por defecto **plano, de ida y vuelta** (`renderAs: "flat"`, `workedIn: "rows"`). Un gráfico en tubo o en círculo se cambia después en el estudio. Para tubo, el ancho debe ser la circunferencia en puntos.

| Uso | Ancho de referencia (cm) | Puntos con el grosor 4 (18 en 10 cm) | Notas |
|---|---|---|---|
| Parche o aplique | 8 a 12 | 14 a 22 | Con menos de 20 puntos solo formas muy simples (F5-21) |
| Posavasos, panel pequeño | 12 a 20 | 22 a 36 | |
| Bolsa, cojín | 30 a 45 | 54 a 81 | Un cojín de 40 cm de ancho son 72 puntos y 96 filas |
| Bufanda, banda de gorro | 20 a 25 | 36 a 45 | La banda de gorro en tubo: la circunferencia (unos 56 cm, 100 puntos) fija el ancho, y el motivo se repite o se amplía |
| Cuerpo de gorro o suéter (panel) | circunferencia | 100 a 200 | Mucho ancho con una imagen no repetida da muchos puntos con ruido: preferir un motivo repetido |
| Manta | más de 100 | más de 180 | **No cabe en un gráfico** (límite 200 por lado, unos 111 cm de ancho con el grosor 4). Se avisa; es un motivo repetido |

| # | Caso | Esperado |
|---|---|---|
| F5-26 | Tamaño en cm | La interfaz acepta cm y los convierte con la muestra: `puntos = round(cm × puntos10cm / 10)`. Si la muestra es supuesta, se marca (F5-24). El resultado se acota a 8 a 200 |
| F5-27 | Más de 100 × 100 casillas (10.000 o más) | Aviso informativo "gráfico grande: tardarás mucho y tendrás muchas hebras" **[criterio]**. No bloquea |
| F5-28 | Tamaño mayor que el recomendado para la complejidad | Una imagen con muchos detalles (`quantError` o `noiseRatio` en aviso) a menos de 40 puntos de ancho recomienda subir el ancho |

---

## 6. Textos de los supuestos (pregunta 6)

- Los **escribe el código** (`image-chart` y el orquestador), no el redactor. Se guardan en `origin.assumptions` (≤ 20 textos de ≤ 200 caracteres cada uno, pasados por `checkText`).
- **Cada texto tiene un código estable** (`assumption.code`) para las pruebas y para el glosario. El texto lleva "puntos" y "filas"; en redondo se usa "vueltas" en lugar de "filas" (caso F3-9). Los textos son provisionales: los revisa `documentador` y la ronda T1b.
- Las cifras que aparecen vienen del motor y no son inventadas.
- Las **unidades de los supuestos sí llevan cifras** (a diferencia del redactor, sección 7). Solo las produce código.

| Código | Cuándo aparece | Texto |
|---|---|---|
| `gauge_assumed` | La usuaria no dio muestra | "Muestra supuesta: 18 puntos y 24 filas en 10 cm (punto jersey, grosor Medio 4). Teje una muestra en colorwork con tus lanas y corrígela." |
| `gauge_rows_assumed` | Dio solo los puntos | "Las filas en 10 cm (24) son un supuesto: calculadas desde tus 18 puntos. Mídelas en tu muestra." |
| `gauge_colorwork_note` | Siempre que la muestra es supuesta | "El colorwork a hebras suele salir más apretado que el punto jersey: las medidas reales pueden ser algo menores." |
| `weight_assumed` | La usuaria no eligió grosor | "Grosor supuesto: Medio (4). Cámbialo si tu lana es otra." |
| `size_target` | Siempre | "Tamaño: 60 puntos de ancho por 60 filas de alto (unos 33 por 25 cm con la muestra indicada)." |
| `size_clamped` | `clampedHeight` | "El alto máximo es 200 filas, así que el ancho se redujo de 200 a 150 puntos para no deformar la imagen." |
| `colors_reduced` | La imagen tenía más colores que `maxColors` | "Colores reducidos a 4 (el máximo que elegiste)." |
| `colors_merged` | El asistente fusionó colores | "Se unieron 2 colores muy parecidos para facilitar el tejido." |
| `colors_palette` | `mapToPalette = true` | "Los colores son los más cercanos de la paleta; el color de tu lana real puede variar." |
| `background` | Siempre | "Fondo: la lana A (color X) rellena las zonas transparentes o de borde." |
| `rows_simplified` | `rowsSimplified > 0` | "12 filas tenían más de 2 colores y se simplificaron a 2 para poder tejerlas con hebras." |
| `specks_removed` | `cleanup: "specks"` | "Se cambiaron 23 casillas sueltas al color de su entorno." |
| `floats_split` | `cleanup: "floats"` | "Se añadieron 14 casillas para partir hebras largas: ahora ninguna pasa de 4 puntos." |
| `floats_long` | Quedan hebras largas | "6 filas tienen hebras de más de 4 puntos (unos 2,5 cm): engánchalas al tejer o simplifica el dibujo." |
| `worked_in` | Siempre | "Se supone tejido de ida y vuelta, de abajo hacia arriba." |
| `swatch_reminder` | Siempre | "Es una aproximación: teje una muestra en colorwork antes de empezar." |
| `ai_fibers` | El asistente sugirió fibras | "Fibras sugeridas por la IA: 100 % lana. Es una sugerencia, no un dato de tu lana." |

- **Pendiente de validar por tejedora**: la frase de "más apretado" (`gauge_colorwork_note`) y el rótulo "Fibras sugeridas".
- **Regla de redacción**: "tu lana" y "las lanas del diseño", nunca marcas (regla de oro 9).
- **Plural**: los textos concuerdan en número ("1 fila tenía…"). La prueba cubre 0, 1 y 2 o más.

| # | Caso | Esperado |
|---|---|---|
| F5-29 | Cada código aparece solo en su condición | Una prueba de tabla por código, con su texto y sus cifras sacadas del resultado (nunca de la IA) |
| F5-30 | Orden y tope | Máximo 20 supuestos, de 200 caracteres como máximo. El orden es el de la tabla. Si se pasara el tope se fusionan los menos importantes (`worked_in`, `background`), nunca los de muestra ni de simplificación |
| F5-31 | Ningún texto contiene el nombre de una marca ni una dirección | Prueba con `checkText` |

---

## 7. Filtro de cifras (pregunta 7)

### Qué protege

La regla de oro 2 dice que el redactor nunca escribe conteos. Un conteo mal escrito en una nota se lee como instrucción de tejido ("aumenta 6 puntos") y contradice al motor. El filtro rechaza el texto entero, y el redactor reintenta una vez; si vuelve a fallar, se usa el respaldo de `pattern-render` (ADR 0012, sección 4).

### Qué se rechaza

**Regla 1: ninguna cifra pegada a un término de tejido.** Se rechaza un número, en cifras o en palabras, que esté a menos de **3 palabras** de un término de la lista de abajo.

**Regla 2: ninguna cifra pegada a una unidad de medida o de cantidad del patrón.** Aunque no haya un término de tejido cerca, se rechaza un número junto a `cm`, `mm`, `m`, `metros`, `metro`, `g`, `gr`, `gramos`, `ovillo(s)`, `madeja(s)`, `hora(s)`, `minuto(s)`, `%` y `colores` (que el motor ya calculó y puede no coincidir).

**Regla 3: ninguna referencia a una fila o vuelta concreta.** Se rechazan los ordinales y las cifras con `fila`, `vuelta`, `hilera`, `ronda`, `row`, `round`, `rnd`, `rep`, `repeat`, `repetición`, salvo "primera" y "última" sin número.

**Regla 4: cantidades implícitas.** Se rechazan `doble`, `triple`, `mitad`, `par`, `docena`, `decena`, `cada otra`, `cada dos`, `cada tres`, etc., junto a un término de tejido. "Cada dos filas" es un conteo aunque no tenga cifras.

**Regla 5: sin enlaces ni correos** (ya en el ADR). **Regla 6: sin marcas** (la lista de marcas la fija el glosario de no-marcas de `catalogo-lanas`; vacía en la v1 y rechaza por la lista de `checkText` de `docs/seguridad.md`).

### Patrones que hay que rechazar (casos mínimos)

| Familia | Ejemplos que se rechazan |
|---|---|
| Cifra + abreviatura ES | `6 pb`, `12pb`, `24 pa`, `3 pma`, `10 cad`, `2 pd`, `6 aum`, `3 dism`, `x6`, `×6`, `*6`, `(6)`, `6x` |
| Cifra + abreviatura US | `6 sc`, `12 dc`, `4 hdc`, `3 tr`, `10 ch`, `2 sl st`, `6 inc`, `3 dec`, `4 sts`, `K2`, `P2`, `K2tog`, `ssk` |
| Cifra + abreviatura UK | `6 dc` (UK: punto bajo), `4 htr`, `3 tr`, `10 ch`, `2 ss`, `6 inc`, `3 dec`, `4 sts`, `rnd 5`, `rnds` |
| Cifra + palabra completa | `6 puntos`, `12 puntadas`, `10 filas`, `3 vueltas`, `5 hileras`, `4 rondas`, `8 repeticiones`, `3 veces`, `2 aumentos`, `3 disminuciones`, `6 cadenetas`, `12 stitches`, `10 rows`, `3 rounds` |
| Palabra-número + término | `seis puntos`, `doce pb`, `diez filas`, `tres vueltas`, `veinte puntadas`, `cuarenta y dos puntos`, `una docena de puntos` |
| Referencia a vuelta | `V12`, `v3`, `R5`, `Rnd 3`, `fila 5`, `fila 12`, `vuelta 3`, `la quinta vuelta`, `3.ª fila`, `3a fila`, `3ª vuelta`, `tercera hilera` |
| Rangos y listas | `6-8 puntos`, `de 6 a 12 filas`, `6 o 7 puntos`, `entre 4 y 6 vueltas`, `3/4 filas` |
| Medidas | `33 cm`, `unos 25 cm de alto`, `2 metros`, `100 g`, `2 ovillos`, `3 horas`, `50 %` |
| Cantidades implícitas | `el doble de puntos`, `la mitad de las filas`, `cada dos filas`, `cada 3 puntos`, `un par de vueltas` |
| Variantes de escritura | `6pb`, `6 PB`, `6 Pb`, `6 pb.` (con punto), `6&nbsp;pb` (espacio duro), `6 p b` (separado), números con otros dígitos (`٦`, `６`), `6.0 puntos`, `seis (6) puntos` |

### Qué se acepta (ejemplos)

- "Un motivo con formas grandes de dos colores principales."
- "Las zonas oscuras quedan en el centro y las claras alrededor."
- "Conviene enganchar las hebras largas."
- "Empieza por la primera fila y termina en la última."
- "Teje una muestra antes de empezar."
- "Se ve mejor con lanas de buen contraste."

### Lista de términos

- **No se escribe a mano.** Se saca de `packages/glossary` (`stitchAbbrev`, `name` y `aliasesEs`) para los **tres dialectos** (es, en-US, en-GB), más los términos de tejido de esta lista semilla. La prueba comprueba que cada entrada del glosario esté cubierta (IA-P6).
- **Semilla** (para completar la prueba de cobertura, todos "validar con tejedora" salvo los que ya están en el glosario del repositorio):
  - ES, términos del glosario: punto, puntada, casilla, vuelta, fila, hilera, repetición, aumento, disminución, cadeneta, cadeneta base, cadeneta de subida, cadeneta de giro, anillo mágico, muestra.
  - ES, abreviaturas: pb, pa, pma, pd, cad, aum, dism, rep.
  - US: sc, dc, hdc, tr, ch, sl st, inc, dec, st, sts, rnd, rnds, row, rows, rep, k, p, k2tog, ssk, yo, m1.
  - UK: dc (**cambia de sentido**: en UK es punto bajo, en US es punto alto), htr, tr, ch, ss, inc, dec, st, sts, rnd, rnds.
  - ES regional, **pendiente de validar por tejedora**: vareta, media vareta, punto raso, punto bajísimo, punto enano, medio punto, cadena. Se incluyen solo para **rechazar** (nunca para generar). Lo que sea ambiguo entre países se trata como término de tejido (preferimos rechazar de más que de menos).
- **Letras sueltas** (`k`, `p`, `x`, `v`, `r`): solo cuentan si llevan una cifra pegada. "Pasa de A a B" no se rechaza. **Falso positivo conocido**: "ver 3 ejemplos" no tiene término de tejido y pasa; "la fila 3" se rechaza (correcto).
- **`doble`** es ambiguo: en algunos países nombra un punto de crochet (**pendiente de validar por tejedora**). Rechazar "el doble de puntos" y aceptar "doble hebra" (dos hebras juntas, sin cifra ni conteo) es la regla propuesta.

| # | Caso | Esperado |
|---|---|---|
| F5-32 | Todos los ejemplos de la tabla "se rechaza" | El filtro devuelve rechazo. Mínimo **40 casos** (CA5-V4), repartidos en ES, US y UK |
| F5-33 | Todos los ejemplos de "se acepta" | Sin rechazo. Mínimo **20 casos** (CA5-V4) |
| F5-34 | Texto con cifra sin término de tejido ni unidad ("hay 3 ideas") | **Se acepta** (la regla 1 y la regla 2 no se activan). Una cifra suelta no es un conteo de puntos |
| F5-35 | Propiedad (IA-P6) | Para cada término `t` del glosario y cada número `n` de 1 a 200, `"{n} {t}"` y `"{t} {n}"` se rechazan. Con 3 semillas |
| F5-36 | Unicode | El filtro normaliza antes de comparar (NFKC, minúsculas, sin espacios duros ni espacios de ancho cero). `６ pb` y `6 pb` se tratan igual |
| F5-37 | Palabras-número | Cubre de "uno" a "cien", "doscientos", "una docena", "decena" y las compuestas ("veintiún", "treinta y dos"). Una prueba recorre 1 a 200 |
| F5-38 | Falso negativo conocido | "Diez pb" y "10 pb" se rechazan. No se puede garantizar el rechazo de toda paráfrasis ("el número de puntos que va en la sexta línea"); por eso el redactor **no ve** los conteos y no tiene dónde copiarlos. El filtro es la segunda barrera |

---

## 8. Qué puede decir el redactor (pregunta 8)

- El redactor (Haiku 5.5 en la ruta plana) **no ve la imagen** (ADR 0012, sección 2). Recibe un resumen del documento ya validado, con etiquetas cualitativas y sin conteos. Ve los nombres de los colores de la paleta, nunca de marcas.
- **`subject` no se le pasa al redactor.** Lo escribió un modelo que vio la foto (texto de entrada no confiable) y no hace falta para las notas. Solo se usa como título sugerido, después de `checkText` (ver enmienda E-6).

### Puede decir

| Puede | Ejemplo |
|---|---|
| Describir el motivo en general, con lo que está en el resumen | "Un motivo de formas redondeadas en tonos cálidos sobre un fondo claro." |
| Mencionar los colores por su nombre de paleta | "Usa un rojo, un crema y un verde oscuro." (sin decir cuántos) |
| Sugerir usos | "Puede servir para un cojín, un parche o un gorro." |
| Sugerir una técnica general del glosario | "Se teje a hebras, con una lana principal y otra de contraste." |
| Recordar la muestra y la naturaleza aproximada | "Teje una muestra en colorwork antes de empezar." |
| Comentar de forma cualitativa lo que el motor ya marcó | "Hay zonas con hebras largas: conviene engancharlas." (solo si `floatRowRatio` o el aviso está en el resumen) |
| Sugerir mejoras | "Con menos colores sería más fácil de tejer." |
| Repetir un supuesto que ya es texto determinista, sin cifras nuevas | "La muestra es supuesta; mide la tuya." |

### No puede decir

| No puede | Por qué |
|---|---|
| Ningún conteo de puntos, filas, vueltas, repeticiones, aumentos, disminuciones ni colores | Regla de oro 2 y el filtro (sección 7) |
| Medidas finales, metros, gramos, ovillos, tiempos | Son del motor (`yarnUsage`, `estimateYarnLength`, `follow`) y siempre rotulados como estimación |
| Cifras de muestra | Son del documento o un supuesto determinista |
| Nombres de marcas, tiendas o productos | Regla de oro 9 |
| Prometer parecido ("idéntico", "fiel", "igual a tu foto") | El gráfico es una aproximación (regla de oro 8) |
| Niveles de dificultad ("fácil", "para principiantes") | Depende de la tejedora y del dibujo; sin una regla validada, es un dato inventado **[validar con tejedora]** |
| Cuidados de la prenda, lavado o seguridad | Dependen de la fibra real, que la IA no conoce |
| Técnicas que no existen en la v1 (intarsia, tramado, tapestry en el estudio, canesú) | Está fuera del alcance. Si las menciona, el motor no las tiene |
| Describir a una persona, o inferir quién es | Decisión 10; además el redactor no ve la imagen |
| Instrucciones paso a paso | Las pasos las deriva `follow`, no un LLM |
| Enlaces, correos, HTML, instrucciones a la usuaria que no sean sugerencias | Defensa ante inyección (ADR 0012, sección 5) |

| # | Caso | Esperado |
|---|---|---|
| F5-39 | Respaldo determinista | Si el redactor se agota, las notas salen de `pattern-render` con "Notas generadas sin IA". El texto no tiene cifras de puntos que no estén en el patrón (CA5-R3) |
| F5-40 | Resumen para el redactor | Solo etiquetas cualitativas (`lowContrast`, `hasLongFloats`, `manyColors`, `simplified`), nombres de color de la paleta y el dialecto. No hay campo numérico de conteo (IA-P1, extendida al resumen) |
| F5-41 | Tope | Máximo 6 notas de 300 caracteres. Texto plano |

---

## 9. Imágenes de prueba (pregunta 9)

Imágenes **propias o sintéticas** (generadas por código o dibujadas para el repositorio), sin marcas ni personas. Cada una tiene un nombre estable. Los parámetros por defecto son: ancho 60, grosor 4 supuesto, `maxColors` 4, `maxColorsPerRow` 2, sin limpieza.

| Id | Descripción | Qué se espera |
|---|---|---|
| IMG-01 | Corazón rojo plano sobre fondo crema, 600 × 600 px, bordes limpios | Se genera. 2 colores. `noiseRatio` bajo el aviso, hebras cortas. Alto 80 con la muestra supuesta (F5-15) |
| IMG-02 | Estrella de 5 puntas azul sobre fondo blanco, 512 × 512 | Se genera. Las puntas diagonales salen con escalón (normal). Aviso solo si `noiseRatio` pasa el 2 % |
| IMG-03 | Greca geométrica (rombos concéntricos), 3 colores, 600 × 300, con repetición exacta de 12 casillas de ancho | Se genera con motivo + repetición (`detectExactRepeat`). El documento plegado da las mismas advertencias que el desplegado |
| IMG-04 | Damero de 8 × 8 casillas en 2 colores, 512 × 512 | Se genera. 2 colores por fila. Con ancho 64, cada cuadro es de 8 puntos: sin hebras largas con el grosor 4 (máximo 4: **hay hebras de 8, por eso** debe dar `CHART_FLOAT_LONG` en filas con cuadros de 8; el caso comprueba el aviso) |
| IMG-05 | Silueta negra de un gato (dibujada, sin foto) sobre fondo blanco, 600 × 600 | Se genera. 2 colores. Bien reconocible con ancho 60 |
| IMG-06 | Ícono de pixel art de 16 × 16 px (una carita sin rasgos de una persona real: un círculo con ojos y boca), 5 colores | Se genera. Con ancho 16 mapea 1 a 1 (nota: hoy el ADR 0013 rechaza imágenes de menos de 64 px; este caso fuerza la enmienda E-14). Con 5 colores y `maxColors` 4: `colors_reduced` |
| IMG-07 | Palabra "HOLA" en letras de bloque grueso, negra sobre blanco, 800 × 240 | Se genera con aviso de texto (`hasEmbeddedText`). Con ancho 60, la letra mide unos 14 puntos de alto: legible. Con ancho 20, mide menos de 7: aviso "el texto necesita más alto" |
| IMG-08 | Párrafo de texto pequeño (6 líneas, tipo captura de documento), 800 × 600 | No se genera (texto pequeño). `quantError` y `noiseRatio` altos, o `fit: "unsuitable"` |
| IMG-09 | Atardecer sintético: degradado suave de naranja a violeta, con un sol circular, 800 × 500 | No se genera (degradado). Con 4 colores salen 4 bandas; `quantError` sobre 12, aviso o bloqueo según calibración. La vista previa se muestra con el bloqueo |
| IMG-10 | Textura de ruido aleatorio de 5 colores, 512 × 512 | No se genera. `noiseRatio` sobre el 15 % y `rowsSimplified` sobre el 60 % |
| IMG-11 | Rayas horizontales de 3 colores sobre toda la imagen | Se genera. Una fila nunca tiene más de 1 color. Con `maxColors` 3 no hay simplificación |
| IMG-12 | Bandera ficticia de 4 franjas verticales de colores distintos (no es de ningún país real) | Con `maxColorsPerRow` 2, **todas** las filas tienen 4 colores y se simplifican: `rowsSimplified` = 100 %, bloqueo. Con `maxColorsPerRow` 3, sigue habiendo filas simplificadas. Es el caso que muestra que las franjas verticales de más de 3 colores son intarsia, no Fair Isle |
| IMG-13 | Dibujo de una flor roja con tallo verde y hojas verdes sobre cielo celeste, 600 × 800, 4 colores | Se genera con aviso: las filas del tallo tienen 3 colores (flor, hojas, cielo). Con `maxColorsPerRow` 2, se simplifican algunas filas y se informa. Aplica a la "rowsSimplified" intermedia (entre el aviso y el bloqueo) |
| IMG-14 | Una línea diagonal fina negra de 1 px sobre blanco, 600 × 600 | Con aviso (trazo fino): la línea queda discontinua. Con `cleanup: "specks"` desaparecen los tramos de 1 casilla, con lo cual la línea se pierde: la limpieza **no** debe ofrecerse como solución aquí (el caso comprueba que se ofrece pero con aviso) |
| IMG-15 | Dos puntos del mismo color en extremos opuestos de una fila ancha (200 de ancho) de color distinto, 1000 × 20 | La hebra mide casi 200 puntos: `CHART_FLOAT_LONG`, `floatRowRatio` alto. Con `cleanup: "floats"` queda dividida y el aviso desaparece (F5-12) |
| IMG-16 | PNG con fondo transparente: un círculo naranja sobre transparencia, 400 × 400 | Se genera. Transparente = fondo (F5-22); el color de fondo es el más frecuente del borde |
| IMG-17 | Imagen de un solo color (todo gris), 400 × 400 | No se genera (1 color efectivo) |
| IMG-18 | Silueta de una mariposa con alas simétricas en 3 colores, 700 × 500 | Se genera. Mandala/simetría. Con `maxColorsPerRow` 2 y 3 colores: algunas filas del centro se simplifican; se informa |
| IMG-19 | Logotipo ficticio **propio del repositorio** (un monograma "LL" dentro de un círculo, creado para las pruebas) | Se genera. Sirve de control: un logotipo propio no se rechaza. **No** se prueban marcas reales: las pruebas de rechazo por marca usan una respuesta grabada del triaje, no una imagen |
| IMG-20 | Silueta de una persona de espaldas, ilustrada de forma genérica (figura de palo con vestido), sin rasgos | Se genera. `containsPeople = true`, sin `identifiable_person` |

**Imágenes que no se prueban** (no hay fotos de personas reales, decisión 10): el rechazo de `identifiable_person` se prueba con una **respuesta grabada** del triaje (`FakeModelClient`), no con una imagen. Lo mismo vale para las marcas y los contenidos moderados.

- IMG-01 a IMG-05, IMG-11 e IMG-16 son los **casos buenos** para la captura de T22 (al menos 10 gráficos).
- IMG-08, IMG-09, IMG-10, IMG-12 e IMG-17 son los **casos de bloqueo** y calibran los umbrales.
- IMG-07, IMG-13, IMG-14 e IMG-15 son los **casos con aviso**.

---

## 10. Propiedades y casos sueltos de `image-chart` (motor)

| # | Caso | Esperado |
|---|---|---|
| F5-42 | Determinismo (IA-P3) | El mismo raster y los mismos parámetros dan las mismas celdas, en Node y en Deno |
| F5-43 | Rangos (IA-P3) | `colors.length ≤ maxColors`, todo índice de `cells` está en `colors`, y `height ≤ LIMITS.maxMotifSide` |
| F5-44 | `colorsPerRow` | Todo valor ≤ `maxColorsPerRow` después de simplificar |
| F5-45 | `mapToPalette = true` | Cada color tiene `paletteId` y el hex de la paleta. `deltaE` es el de `nearestPaletteColor`. Con `false`, el hex cuantizado y sin `paletteId` |
| F5-46 | El documento que sale es válido | `validatePattern` da `valid` (o con advertencias de hebras), nunca un error. `kind: "chart"`, `technique: "knit"` |
| F5-47 | Repetición exacta | `detectExactRepeat` solo devuelve motivo si **todas** las casillas coinciden. Motivo mínimo de 4 casillas de ancho y al menos 2 repeticiones. Si hay duda, no se pliega |
| F5-48 | Plegado | El documento plegado (motivo + `repeat`) y el desplegado dan los mismos códigos de aviso. En ida y vuelta, el hueco entre repeticiones cuenta como hebra (nota de F3-19) |
| F5-49 | `workedIn: "rounds"` | La hebra que cierra la vuelta cuenta (caso 15 de `casos-dominio-colorwork.md`). Al cambiar la forma del gráfico en el estudio, los avisos se recalculan |
| F5-50 | La vista previa y el resultado coinciden | La vista previa del navegador y el servidor dan celdas idénticas (IA-P3) |

---

## Fuentes

- Interweave, cómo enganchar las hebras flotantes (2,5 cm): https://www.interweave.com/article/knitting/how-to-tack-floats-stranded-colorwork
- Osborn Fiber, *Fair Isle 102: securing long floats* (5 puntos): https://osbornfiber.com/2011/09/30/fair-isle-102-securing-long-floats/
- Craft Yarn Council, *Standard Yarn Weight System* (muestras por categoría): https://www.craftyarncouncil.com/standards/yarn-weight-system
- Lo marcado **[criterio]** no tiene fuente externa y va a la ronda T1b.

---

# Anexo: correcciones para los ADR, hoja T1b y pendientes de T1-3D (informe T1, 2026-11-16)

## Correcciones para las enmiendas del ADR 0012 (para `arquitecto`)

- **E-1. Un solo orden: parámetro, cálculo, comentario.** Quitar `suggestedWeight` de `PaletteOutput` en la ruta plana. El grosor es un parámetro obligatorio (por defecto 4, supuesto `weight_assumed`) que se decide **antes** de `chart_compute`, porque fija la muestra supuesta y el alto. Dejarlo en el asistente obligaría a recalcular el gráfico. `suggestedFibers` puede quedar, porque no cambia el gráfico (solo el render).
- **E-2. Parámetros nuevos en `ChartFromImageParams`.**
  - `maxColorsPerRow: 2 | 3`.
  - `cleanup: "none" | "specks" | "floats"`.
  - `workedIn: "rows" | "rounds"` (por defecto `rows`).
  - `widthStitches` de **8 a 200** (hoy 4).
  - `maxColors` de 2 a 8, por defecto 4.
- **E-3. `image-chart` no duplica la regla de hebras.** Recibe el máximo de hebra de `pattern-core` (exportar una función `maxFloatStitches(gauge, opts)` con la fórmula del validador), y se agrega la propiedad **IA-P7**: con `cleanup: "floats"`, `validatePattern` no da `CHART_FLOAT_LONG`.
- **E-4. `ChartFromImage` con métricas.** Agregar `rowsSimplified`, `floatRowRatio`, `noiseRatio`, `quantError` y la lista de códigos de supuestos. Los calcula el código, no la IA. La decisión de aviso o bloqueo usa los umbrales de la sección 1.2.
- **E-5. Triaje.** Falta un motivo para logotipos o personajes de terceros: agregar `third_party_ip` a `reasons` (ADR 0012, sección 3). **Pendiente de revisión legal (T1c)**, porque es una decisión de derechos y no de tejido. Dejar claro que `containsPeople = true` sin `identifiable_person` no rechaza. Documentar que el triaje de `fit: "unsuitable"` devuelve el cupo.
- **E-6. `subject` no pasa al redactor.** Solo sirve como título sugerido, después de `checkText` y del filtro de cifras.
- **E-7. Alto acotado (sección 2, fórmula del alto).** Reemplazar "acotado a `LIMITS.maxMotifSide`" por: si las filas pasan de 200, se reduce el ancho a `floor(200 × puntos10cm / filas10cm)`, no se aplasta ni se recorta. `clampedHeight` se renombra `widthReduced` (o se conserva con esa semántica) y lleva el supuesto `size_clamped`.
- **E-8. Filtro de cifras (sección 4).** Reemplazar la expresión regular de la sección 4 por las seis reglas de la sección 7 de este documento: números en cifras y en palabras, abreviaturas de los tres dialectos, unidades de medida y de cantidad, ordinales, rangos, cantidades implícitas y normalización Unicode. La lista se saca de `glossary`; el redactor no ve los conteos.
- **E-9. Fusiones (sección 1, tabla).** `MERGE_MAX_DELTA_E` sugerido: 10, **no** 2,3. Es un criterio que fija `catalogo-lanas`, con validación en T1b.
- **E-10. Simplificación por fila.** Agregar al paso `chart_compute` la simplificación a `maxColorsPerRow` (F5-7) con sus supuestos, antes del asistente de paleta. Al ADR le falta decir qué pasa con una fila de más de 2 colores.
- **E-11. Supuestos (sección 6).** Reemplazar "los supuestos deterministas" por la lista de códigos de la sección 6 de este documento. Máximo 20 textos de 200 caracteres.
- **E-12. Fondo.** Agregar la regla de F5-22 y F5-23: alfa menor que 128 es fondo, nunca `NO_STITCH`.

## Correcciones para las enmiendas del ADR 0013

- **E-13. Alfa.** El paso 8 dice "alfa < 128 como fondo (regla que confirma T1)". T1 la confirma con F5-22: es el color de fondo del diseño, el alfa parcial se compone sobre blanco antes de cuantizar.
- **E-14. Mínimo de 64 px por lado.** El rechazo `dimensions_out_of_range` con el lado menor bajo 64 px deja fuera los íconos y el pixel art legítimos (16 a 48 px), que son justamente los que mapean bien a un gráfico. Proponer: aceptar desde **16 px** y avisar por debajo de 64 ("poca resolución"). El tope de 2048 y el de 4.194.304 píxeles se mantienen. Si `arquitecto` prefiere no cambiarlo, el pixel art queda fuera de la v1 y hay que decirlo en la interfaz.
- **E-15. Promedio por área.** `resizeArea` promedia en sRGB. Es aceptable para el gráfico, pero los bordes entre colores muy distintos salen algo oscuros. Dejar anotado y **validar con tejedora** con IMG-02 e IMG-05.
- **E-16. Aviso de derechos.** El texto de `rights-v1` no menciona logotipos ni personajes de terceros. Si T1c (revisión legal) confirma `third_party_ip`, subir a `rights-v2`.

## Ítems para la hoja T1b (validar con tejedora)

1. Máximo de colores por fila: 2 por defecto y 3 con aviso. ¿Es honesto ofrecer 3?
2. `MERGE_MAX_DELTA_E` = 10: ¿dos colores a esa distancia se confunden en lana real?
3. Umbrales de las métricas: `noiseRatio` (2 % y 15 %), `floatRowRatio` (0 % y 40 %), `rowsSimplified` (10 % y 60 %), `quantError` (12 y 25). Calibrar con las 20 imágenes de prueba y tejedoras reales.
4. Proporción filas/puntos del colorwork a hebras: 1,25 a 1,3 frente a 1,35 del punto jersey. ¿Cuánto más apretado sale?
5. Texto `gauge_colorwork_note` ("suele salir más apretado").
6. Altura mínima de una letra legible: 7 puntos.
7. Ancho mínimo para reconocer algo: aviso bajo 20 puntos.
8. Lana que desaparece por muchas filas: ¿desde cuántas se corta? (aviso informativo propuesto).
9. Limpieza de hebras largas (recolorear la casilla del medio): ¿es lo que haría una tejedora o prefiere enganchar la hebra?
10. Tamaño de referencia por uso (tabla de la sección 5).
11. Mirada de `top_down` en "Tejiendo" (ya pendiente en F3-4).
12. Palabras regionales del filtro de cifras (vareta, media vareta, punto raso, punto bajísimo, punto enano, medio punto): confirmar cuál es de qué país y si `doble` nombra un punto.
13. Frase "Fibras sugeridas por la IA" y los textos de los supuestos.
14. Contraste entre colores vecinos: ¿las hebras claras se transparentan bajo las oscuras?

## Lo que queda para T1-3D (hito 2)

- Cómo se mapean los colores de la foto a las lanas del amigurumi (el `maxColors` de la ruta 3D puede ser mayor, porque en crochet cada color suele ser una pieza, no una hebra flotante).
- Los supuestos de la ruta 3D (muestra de crochet: `crochet-pb` 1,2 ya marcado "validar con tejedora" en `yarn-catalog`) y su lista de códigos.
- El redactor 3D (Sonnet): el filtro de cifras para el armado (`pb`, aumentos y disminuciones aparecen en patrones escritos) y el texto de "Aproximación".
- Las reglas de personas y logotipos aplicadas a peluches y personajes: un personaje de marca en un peluche es el caso más común y E-5 lo decide.
- El conjunto de primitivas, sus rangos, qué queda fuera, el límite de partes y `maxRoundItems = 200`, ya listados en el roadmap.
- Qué hacer con el fondo y los objetos que no son un cuerpo (sombras, mesas).

## Archivos revisados

- /Users/krlos/Documents/workspace/claude/LoopitaLab/docs/roadmap.md
- /Users/krlos/Documents/workspace/claude/LoopitaLab/docs/adr/0012-pipeline-imagen-a-patron.md
- /Users/krlos/Documents/workspace/claude/LoopitaLab/docs/adr/0013-subidas-y-storage.md
- /Users/krlos/Documents/workspace/claude/LoopitaLab/docs/casos-dominio-colorwork.md
- /Users/krlos/Documents/workspace/claude/LoopitaLab/docs/casos-dominio-fase-3.md
- /Users/krlos/Documents/workspace/claude/LoopitaLab/packages/pattern-core/src/validate.ts (hebras y colores por fila, líneas 781 a 808)
- /Users/krlos/Documents/workspace/claude/LoopitaLab/packages/yarn-catalog/src/index.ts (muestra supuesta, `nearestPaletteColor`, `NEAR_COLOR_DELTA_E`)
- /Users/krlos/Documents/workspace/claude/LoopitaLab/packages/glossary/src/terms.ts

## Límites de esta revisión

- No consulté fuentes nuevas. Todo lo que no tiene fuente va marcado como criterio o "validar con tejedora".
- No revisé el estado real de `rowFloats`. Asumí que mide la brecha entre dos casillas del mismo color, como indican F3-16 y el caso 16. Conviene que `qa-tester` lo confirme antes de escribir F5-11 a F5-13.
- No leí las abreviaturas por dialecto de `packages/glossary/src/index.ts`. La lista del filtro debe salir de `stitchAbbrev`, no de mi lista semilla.

> **Nota del orquestador (2026-11-17):** por decisión de la usuaria, cuando el triaje responde `unsuitable` **no** se devuelve el cupo (ADR 0014); lo que este documento dice en §1.3 y en E-5 sobre devolverlo queda superado. `third_party_ip` se rechaza en la v1 hasta T1c.

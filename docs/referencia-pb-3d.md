# Referencia de dominio: punto bajo (pb) en el 3D del amigurumi (fases R2 y R3)

Estado: borrador de `experto-tejido`, 2026-11-20. Para validar con fotos de muestras reales de la usuaria.

Convenciones de este documento:
- **Fuente**: dato con URL. **Convención**: así se acostumbra tejer o dibujar, puede variar entre tejedoras. **Regla física**: no varía. **Supuesto, validar con fotos**: sin cifra con fuente. No se implementa como definitivo hasta validarlo.
- Terminología (CYC, glosario ES): pb (punto bajo, "sc" en US), aum (aumento), dism (disminución), pd (punto deslizado), mpa (medio punto alto), hebra delantera y hebra trasera (en inglés FLO y BLO). Ojo: en UK "sc" es el punto deslizado y el pb UK se llama "dc"; este documento usa siempre la nomenclatura US de los códigos del motor.
- Coordenadas de punto: **u** de 0 a 1 a lo ancho (0 = borde izquierdo del punto visto de frente, por el derecho de la labor), **v** de 0 a 1 a lo alto (0 = base, vuelta de abajo; 1 = tope, borde superior de la vuelta). **H** es la altura normalizada del campo de alturas (0 = fondo; 1 = cresta más alta). La profundidad real es H × d, con d = diámetro de la hebra (sección 4).

## 0. Hallazgos sobre el relieve actual

Archivo `packages/viewer-3d/src/three/normal-map.ts`, función `stitchHeightField`, líneas 11 a 22.

| Clase | Hallazgo | Corrección propuesta |
|---|---|---|
| Error de dominio | Los lóbulos son elipses de semiejes 0,2 (u) y 0,48 (v) centradas en v = 0,5. Cubren casi todo el alto (v de 0,02 a 0,98) y se tocan en u = 0,5. Es la columna de "V" del jersey de palillo (punto jersey), donde cada hebra recorre todo el alto del punto. En el pb la V ocupa solo la parte baja y media del punto; arriba va la fila de lazadas del tope. | Reemplazar por los elementos de la sección 1.2. |
| Error de dominio | El "relieve de una sola V" repetida por punto no tiene la fila de lazadas horizontal del tope. Es lo que hace reconocible el pb en amigurumi. | Agregar el elemento E3 (sección 1.2). |
| Ambigüedad terminológica | La "x" (o cruz) es el **símbolo del pb en los gráficos CYC**. No es un aspecto de la tela. | No dibujarla en el relieve. Queda solo en el gráfico 2D. |
| Mejora sugerida | Una textura repetida por punto no puede dibujar el escalón del final de la espiral ni el borde de una vuelta abierta. Esos son geometría (secciones 3 y 4). | El borde y el remate se resuelven en la malla (R2), no en el mapa de normales. |

## 1. Aspecto del pb por el derecho (espiral, ambas hebras)

### 1.1 Qué se ve (con fuente)

- Por el derecho, cada punto se ve como una **V**. Los bordes de una pieza abierta muestran "V acostadas" (*sideways V*) que son los lugares donde se trabaja la vuelta siguiente. Por el revés, cada punto se ve como una **π** ("una V al revés con una barra arriba"), y las **barras horizontales aparecen solo por el revés**. Fuente: [PlanetJune, "Which is the right side?"](https://www.planetjune.com/blog/which-is-the-right-side/).
- El remate invisible forma "una fila continua de V alrededor del borde". Fuente: [PlanetJune, Invisible Finish](https://www.planetjune.com/blog/amigurumi-help/invisible-finish-for-open-edges-in-amigurumi/).

Por lo tanto, "barra horizontal" **no** es parte del derecho (convención de la fuente) y la "x" es solo símbolo.

### 1.2 Campo de alturas propuesto para el derecho (supuesto, validar con fotos)

Las posiciones y proporciones salen de la anatomía del pb y de los diámetros de la sección 4. No hay medidas publicadas. Todas las cifras de la tabla son supuestos.

| Elemento | Qué es | Posición (u, v) | Ancho | Inclinación | H (cresta) |
|---|---|---|---|---|---|
| E0 Fondo | Espacio entre hebras, en sombra | todo el punto | | | 0,10 |
| E1 Hebra izquierda de la V | Cápsula de perfil redondeado | eje de (0,42; 0,10) a (0,26; 0,66) | 0,26 en u (rango 0,22 a 0,34) | ≈ 15° a 18° de la vertical, abierta hacia arriba | 0,75 |
| E2 Hebra derecha de la V | Espejo de E1 | eje de (0,58; 0,10) a (0,74; 0,66) | 0,26 | ≈ 15° a 18°, espejo | 0,75 |
| E2v Vértice | Las dos hebras se juntan y se funden abajo | centro (0,50; 0,08) | | | 0,60 |
| E3 Fila de lazadas del tope ("V acostada" de la vuelta siguiente y borde de la anterior) | Banda horizontal, casi continua entre puntos | centro v = 0,86, semialto 0,14 (de v 0,72 a 1,0), u de 0 a 1 | todo el ancho | dos lóbulos de media anchura inclinados ≈ ±10° respecto de la horizontal | 0,5 (**el más incierto**; subir a 0,8 si las fotos muestran la fila de lazadas muy marcada) |
| E4 Surco | Valle entre E1 y E2 | u = 0,5, v de 0,15 a 0,60 | 0,10 | vertical | 0,15 |

Notas:
- El alto de la V (de v 0,10 a 0,66) deja arriba el espacio de la fila de lazadas. En el punto jersey la V ocupa casi todo el alto; aquí no.
- La inclinación de E1 y E2 sale de dx ≈ 0,16 punto de ancho contra dy ≈ 0,56 de alto, con alto/ancho ≈ 0,9 (sección 1.4): atan(0,16 / 0,50) ≈ 17°.
- Las dos hebras de la V deben verse más suaves que en el jersey. El pb de amigurumi es denso y la profundidad es poca. H de las hebras 0,75 contra E3 0,5 es un punto de partida, no una medida.
- Convención de orientación de la textura: `DataTexture` con `flipY = false` toma la fila 0 como v = 0. Hay que comprobar que v crece hacia +z en la malla (la hebra de la V debe abrirse hacia arriba). Si sale al revés, la V se ve como la π del revés.

### 1.3 Variantes

**Tejida del revés hacia afuera (*inside out*).** "Trabajar *inside out*" es trabajar por el borde interior de la pieza. La pieza de amigurumi tiende a curvarse así al inicio y se acostumbra a darla vuelta después de unas pocas vueltas, "alrededor de 3" según la autora, para mostrar el derecho ([fuente](https://www.planetjune.com/blog/which-is-the-right-side/)). Consecuencias (deducción de dominio, validar con fotos):
- Si no se da vuelta la pieza, el exterior muestra el **revés**: π con barra arriba (campo de la tabla siguiente).
- La dirección de avance de la hebra se ve **espejada** desde afuera, porque se trabajó desde el lado opuesto.
- Es una propiedad de la pieza (de la parte), no del punto. Proponer una opción por parte, `side: "right" | "wrong"` (hoy no existe en el modelo; decide `arquitecto`).

Campo de alturas del revés (supuesto, validar con fotos):

| Elemento | Posición (u, v) | Ancho | H |
|---|---|---|---|
| Barra superior | centro v = 0,84, semialto 0,10, u de 0,05 a 0,95 | todo el ancho | 0,9 |
| Pata izquierda (Λ) | de (0,50; 0,72) a (0,34; 0,08) | 0,24 | 0,7 |
| Pata derecha (Λ) | de (0,50; 0,72) a (0,66; 0,08) | 0,24 | 0,7 |

**Hebra trasera y hebra delantera.** Solo hay fuente cualitativa:
- Trabajar una vuelta solo en la hebra trasera "es un método estándar para crear una esquina marcada" en amigurumi, y deja "una línea de lazadas sin trabajar" alrededor ([PlanetJune, Avoiding the Jog in a BLO Round](https://www.planetjune.com/blog/?p=19097)). Un comentario de lectoras en la fuente del derecho y el revés dice que, al trabajar solo la hebra trasera, las delanteras sin trabajar quedan "como una línea horizontal".
- Propuesta (supuesto): en los puntos con `loop = back` de la vuelta i, la base (v de 0 a 0,2) muestra una hebra horizontal de la vuelta anterior (la hebra delantera sin trabajar), de ancho completo en u, con H ≈ 0,7 y espesor ≈ d. La V de los puntos de la vuelta i se corre hacia atrás ≈ 1 d. El ADR 0010 (C-7) dice que la forma global no cambia; sigue valiendo para el perfil, y esto es solo relieve.
- Con hebra delantera las hebras sin trabajar son las traseras: quedan por el lado opuesto al que se mira. **Sin fuente ni fotos** de cómo se ve desde afuera. Validar con fotos antes de dibujar nada.

### 1.4 Proporción ancho/alto del pb en amigurumi

- **Fuente**: ninguna publica una cifra de alto de vuelta contra ancho de punto en amigurumi. La tabla CYC solo da puntos por 4 in ([Craft Yarn Council](https://www.craftyarncouncil.com/node/3179)).
- Hoy el repo usa ρ = 1,2 vueltas por punto (alto/ancho = 0,83) y menciona ≈ 1,05 (alto/ancho = 0,95) en `yarn-catalog` y en el ADR 0010. Ambos son supuestos.
- **Deducción geométrica** (regla física, con la convención "6 aum por vuelta = disco plano"): el radio de un anillo crece Δr = 6·w/2π = 0,955·w por vuelta. El disco queda plano cuando Δr es igual al alto de la vuelta h. Entonces h ≈ 0,955·w, es decir **ρ ≈ 1,05**. La tela es flexible, así que es un indicio, no una medida.
- **Efecto** sobre el repo (para `motor-patrones`, después de las fotos): con ρ = 1,05, Δr/s por vuelta es kρ/2π, o sea 6 aum → 1,003, 7 → 1,170, 8 → 1,337. Con `PROFILE_RADIAL_TOLERANCE` = 1,25 el aviso saldría desde 8 aum, no desde 7.
- **Para el relieve**: usar h/w ≈ 0,83 a 0,95. Un elemento de ancho d en u mide d/w, y en v mide d/h, que es 1,05 a 1,2 veces mayor. Hay que corregir ese factor al dibujar la hebra circular.
- Supuesto de partida para el relieve: **h/w = 0,9**. Validar con fotos (sección 5, pregunta 1).

## 2. Deriva de la espiral

Tres fenómenos distintos que no hay que mezclar:

1. **Inclinación de las columnas** (continua, se acumula vuelta tras vuelta).
2. **Escalón** (*jog*) entre el final y el inicio de la vuelta (de una sola vez, un alto de vuelta; sección 3).
3. **Corrimiento visible de una línea marcada**, por ejemplo un cambio de color en espiral: es la suma de 1 y 2.

Lo que dicen las fuentes:
- Una respuesta en un foro dice que los puntos de crochet tienen una inclinación natural que se amplifica cuando se trabaja siempre en el mismo sentido, y recomienda dar vuelta la labor entre vueltas para compensar ([Crochetville](https://forum.crochetville.com/topic/159733-slanting-seam-when-crocheting-spiralsrounds-in-alternating-colours)). No da ángulo ni medida.
- En espiral hay un escalón muy evidente entre el inicio y el final de cada franja, porque los extremos no se encuentran ([PlanetJune, comparación de franjas](https://www.planetjune.com/blog/?p=6857)). No da dirección ni cantidad.
- El tutorial para zurdas de [Stitch and Story](https://www.stitchandstory.com/blogs/crochet-video-tutorials/amigurumi-working-in-spirals-left-handed-crochet-tutorials) no menciona la dirección de la deriva.

**No encontré cifra con fuente.** Propuesta, marcada **validar con fotos**:
- Inclinación de la columna respecto de la vertical: **5° a 15°**, equivalente a **0,1 a 0,3 puntos de corrimiento por vuelta**. Se obtiene de tan(ángulo) = (corrimiento por vuelta × w) / h, con h/w ≈ 0,9.
- **Signo**: sin fuente. Hipótesis física: el tope de cada columna se desplaza hacia el sentido de avance de la hebra. La diestra trabaja de derecha a izquierda (convención) y la zurda al revés, así que la imagen de la zurda es el **espejo** exacto. Que sea hacia la izquierda o la derecha vista desde afuera **no se implementa hasta tener la foto** (sección 5, pregunta 2).
- Pieza tejida *inside out*: el signo visto desde afuera se invierte respecto de la pieza tejida por afuera (deducción, validar con fotos).
- Implementación propuesta cuando haya foto: una inclinación `lean` (en puntos por vuelta) que se aplica como cizalle del campo de alturas (u' = u + lean × (v − 0,5)) y del anillo (el vértice sube y se corre `lean` × w por vuelta). Mantener `ringPhase` independiente del cizalle.

## 3. Remate de una vuelta abierta en espiral

**Qué pasa en la tela (con fuente).** El último punto y el siguiente a su derecha quedan a distinta altura: hay un escalón de altura entre el punto final y el primero de la vuelta ([PlanetJune, Invisible Finish](https://www.planetjune.com/blog/?p=19719)). En la malla actual ese escalón es del alto de una vuelta (ADR 0010; README de `viewer-3d`, "Remate"). Coincide con la fuente.

**Técnicas comunes**:
- **Punto deslizado (pd) en el punto siguiente**: reduce el escalón, pero deja un pequeño bulto que no se esconde del todo cuando el borde queda a la vista (misma fuente).
- **Remate invisible** (*invisible finish*): se corta la hebra y se cierra con un punto duplicado que cruza el escalón. Mantiene el conteo de puntos del borde y forma una fila continua de V que iguala las V del pb; el escalón queda cubierto y el borde se ve liso ([PlanetJune, Invisible Finish for open edges](https://www.planetjune.com/blog/amigurumi-help/invisible-finish-for-open-edges-in-amigurumi/)). Pasos: cortar con unos 15 cm de cola, saltar el siguiente punto sin trabajar, pasar la aguja bajo las dos barras del punto siguiente, volver al último punto y entrar bajo su hebra trasera y la barra de atrás, tirar hasta igualar el tamaño de las V y esconder la cola.
- **Alturas decrecientes** (por ejemplo pb, y pd en los últimos puntos): sin fuente consultada. Se usa para bajar el borde en 2 a 4 puntos. **Supuesto, validar con fotos y con una tejedora**: el escalón se reparte en los últimos 2 a 4 puntos, con cada uno más bajo que el anterior hasta llegar al nivel de la vuelta de arriba. Ojo: esto cambia el conteo escrito (pd cuenta como punto en el motor); se dibuja solo como relieve, no cambia conteos.

**Qué debe dibujar el 3D**:

| Caso | Dibujo |
|---|---|
| "Sin rematar todavía" (la hebra sigue en la aguja) | Rampa que sube de la vuelta anterior y termina en un escalón de alto h, como hoy. Agregar el borde con volumen de la sección 4 siguiendo la hélice, para que el escalón se vea como una pared con la fila de lazadas cortada. Opcional: la lazada viva de la aguja, un bucle pequeño de radio ≈ d. |
| Caso típico: pieza cerrada o con remate invisible | Sin escalón: los últimos 2 a 3 puntos de la vuelta se bajan de forma continua hasta el nivel del primero (borde horizontal), con la fila de lazadas continua. Es la apariencia del remate invisible según la fuente. |
| Remate con pd | Igual al típico, pero con un bulto de altura ≈ d sobre el borde, de ancho 1 punto, justo en el punto de unión. |
| Pieza con dism hasta cerrar | No hay borde abierto; no aplica. |

Esto es una propuesta visual; el modelo seguiría sin dibujar `finish`. Que el remate se elija entre los tres casos queda para `arquitecto` (hoy `finish` es texto).

## 4. Borde de una vuelta abierta y diámetro de la hebra

**Aspecto (con fuente)**: el borde de una vuelta abierta de pb es una fila de "V acostadas"; el remate invisible forma una fila continua de V alrededor del borde ([fuente](https://www.planetjune.com/blog/amigurumi-help/invisible-finish-for-open-edges-in-amigurumi/)). La fuente aclara que el remate invisible no se ve como una cadena.

**Geometría propuesta del borde** (supuesto, validar con fotos):
- Un tubo de sección circular de diámetro ≈ d, que sigue la hélice del borde superior de la última vuelta.
- Cada punto aporta dos hebras (delantera y trasera), una detrás de la otra en profundidad. El grosor radial del borde es entonces ≈ 2d y el alto ≈ d.
- En cada punto, una pequeña pinza en los límites de punto (u = 0 y u = 1), de profundidad ≈ 0,2 d, para marcar la V acostada.
- El relieve del tope del punto (elemento E3, sección 1.2) es la continuación de este borde cuando la vuelta de arriba cubre el borde.

**Diámetro de la hebra por categoría CYC (supuesto: d ≈ 25,4 / WPI mm)**

Las envolturas por pulgada (WPI) vienen de la [tabla de Wikipedia "Yarn weight"](https://en.wikipedia.org/wiki/Yarn_weight) y el ancho del punto, de los puntos por 4 in de la [tabla CYC](https://www.craftyarncouncil.com/node/3179) (ancho = 101,6 mm ÷ puntos). Las dos fuentes **no dan diámetro en mm**: la conversión supone envolturas sin huecos, y es propia. La tabla CYC da para la categoría 6 de 7 a 9 puntos y Wikipedia de 5 a 9; se usó la de CYC. La categoría 0 está en punto alto en CYC y no en pb.

| CYC | Nombre | WPI | d ≈ (mm) | Ancho de pb (mm) | d / ancho |
|---|---|---|---|---|---|
| 0 | Encaje | 30 a 40+ | 0,6 a 0,85 | 2,4 a 3,2 (punto alto; no es pb) | ≈ 0,27 |
| 1 | Superfina | 14 a 30 | 0,85 a 1,8 | 3,2 a 4,8 | ≈ 0,33 |
| 2 | Fina | 12 a 18 | 1,4 a 2,1 | 5,1 a 6,4 | ≈ 0,30 |
| 3 | Ligera | 11 a 15 | 1,7 a 2,3 | 6,0 a 8,5 | ≈ 0,28 |
| 4 | Media | 9 a 12 | 2,1 a 2,8 | 7,3 a 9,2 | ≈ 0,30 |
| 5 | Gruesa | 6 a 8 | 3,2 a 4,2 | 9,2 a 12,7 | ≈ 0,34 |
| 6 | Supergruesa | 5 a 6 | 4,2 a 5,1 | 11,3 a 14,5 | ≈ 0,36 |
| 7 | Jumbo | sin dato | > 5 (supuesto) | 17 o más | sin dato |

Cociente d/ancho con los valores medios de cada rango. Para amigurumi la tela es más apretada que en la muestra CYC (agujas más chicas que las recomendadas), así que el ancho real es menor y el cociente real es mayor. **Supuesto para el 3D: d / w ≈ 0,3 a 0,5; usar 0,35 de partida. Validar con fotos** (sección 5, pregunta 4).

## 5. Pendiente de validar con fotos

Para la usuaria. En todas: lana de color claro y liso (sin pelusa, sin jaspeado), hilo sin marca visible, luz difusa de un lado (ventana lateral, no flash), fondo neutro, una regla de 15 cm al lado, y la pieza completa y un acercamiento.

1. **Proporción h/w del pb.** Muestra: tubo de 24 pb por 20 vueltas, con la hebra y la aguja que usa para amigurumi. Foto frontal y plana, regla pegada al costado. Medir 10 puntos de ancho y 10 vueltas de alto. Anotar categoría CYC, aguja y el tejido sin relleno y relleno. Pregunta: ¿el alto de una vuelta es mayor, igual o menor que el ancho de un punto?
2. **Deriva y su signo.** Misma muestra, con una columna marcada con otro color en el mismo punto de cada vuelta. Tejida por **afuera** (la V se ve por afuera) y de nuevo *inside out*. Diestra o zurda. Foto desde una distancia que muestre las 20 vueltas, de frente. Preguntas: ¿hacia qué lado se inclina la columna? ¿Cuántos puntos se corrió después de 20 vueltas? Si la usuaria es zurda, ¿se ve el espejo?
3. **Derecho y revés.** Un cuadrado plano de pb, foto del derecho y del revés, con luz rasante (lámpara baja, a unos 20 cm del paño). Pregunta: ¿se ven barras horizontales solo por el revés? ¿Dónde está la fila de lazadas del tope por el derecho, y qué tan marcada es respecto de la V?
4. **Ancho de la hebra.** Fotos de acercamiento del borde de una vuelta abierta, con la regla al lado, en categorías 2, 4 y 5 si las tiene. Medir el diámetro de la hebra suelta con una regla milimetrada. Pregunta: ¿qué cociente d / ancho del punto se ve?
5. **Borde abierto.** Un tubo abierto (como una oreja sin cerrar) de frente, desde arriba y de costado. Preguntas: ¿cuántas hebras se ven en el borde, una o dos? ¿Se ve como una fila de V acostadas o como una cadena?
6. **Escalón y remates.** Tres tubos iguales con la última vuelta: sin rematar, con pd en el punto siguiente y con remate invisible; un cuarto con alturas decrecientes (pb y pd en los últimos puntos). Foto de cerca del punto de unión, desde afuera y de costado. Preguntas: ¿cuántos puntos se necesitan para bajar el escalón? ¿Cuánto sobresale el bulto del pd?
7. **Hebra trasera y delantera.** Una vuelta en hebra trasera y otra en hebra delantera, cada una entre vueltas normales, en el mismo tubo. Foto por el lado de trabajo y por el opuesto. Pregunta: ¿qué lado muestra las hebras sin trabajar?
8. **Aumentos del disco.** Discos con 6, 7 y 8 aum por vuelta, de varias vueltas, sobre una mesa. Pregunta: ¿cuál queda plano y cuál ondula? (Es la base para decidir la tolerancia de las advertencias).
9. **Inside out.** Una pieza que se tejió por dentro, antes y después de darla vuelta. Pregunta: ¿cuántas vueltas se tejieron antes de darla vuelta? ¿Qué cara se ve afuera cuando no se da vuelta?

Quedan "pendiente de validar por tejedora" sin cambios: signo de la deriva, la sección de alturas decrecientes y todas las cifras de H, posición y ancho de la sección 1.2.

## Fuentes

- https://www.planetjune.com/blog/which-is-the-right-side/
- https://www.planetjune.com/blog/?p=19719
- https://www.planetjune.com/blog/amigurumi-help/invisible-finish-for-open-edges-in-amigurumi/
- https://www.planetjune.com/blog/?p=19097
- https://www.planetjune.com/blog/?p=6857
- https://forum.crochetville.com/topic/159733-slanting-seam-when-crocheting-spiralsrounds-in-alternating-colours
- https://www.stitchandstory.com/blogs/crochet-video-tutorials/amigurumi-working-in-spirals-left-handed-crochet-tutorials
- https://www.craftyarncouncil.com/node/3179
- https://en.wikipedia.org/wiki/Yarn_weight

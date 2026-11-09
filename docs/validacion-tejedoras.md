# Hoja de validación con tejedoras: estudio de colorwork

- Estado: borrador para validar (tarea T1b de la fase 2, [roadmap](roadmap.md)).
- Fecha de preparación: 2026-11-06.
- Uso: las secciones 1 a 4 son para imprimir o compartir con la tejedora. La sección 5 y el anexo son para la usuaria y el equipo, no para imprimir.

## Resumen de la hoja

| Tema | Preguntas | Marcadas (prioridad) |
|---|---|---|
| Datos de quien responde | 5 | No aplica |
| A. Grosores de lana | 5 | 4 |
| B. Muestra y tensión | 6 | 5 |
| C. Vocabulario | 14 | 7 |
| D. Lectura de gráficos | 7 | 6 |
| E. Círculo y copa | 14 | 8 |
| F. Hebras flotantes y lanas | 4 | 3 |
| G. Motivo, repeticiones y tamaño | 5 | 3 |
| H. Lo que la vista muestra | 5 | 2 |
| I. Disminuciones | 1 | 1 |
| J. Plantillas | 2 | 1 |
| **Total** | **63** (más 5 de datos y 5 abiertas) | **40** |

Las preguntas marcadas con "(prioridad)" forman la ruta corta. Las demás completan la validación.

---

## 1. Introducción

LoopitaLab es una plataforma web para diseñar patrones de tejido a palillo y de crochet. Estamos preparando su **estudio de colorwork**: el tejido de dibujos con dos o más colores. Se dibuja un motivo en una cuadrícula y la aplicación muestra cómo queda el tejido.

Esta hoja reúne los nombres, explicaciones y reglas que la aplicación usa hoy. Queremos saber si suenan a lo que tú haces y cómo lo dirías tú.

- No hay respuestas incorrectas. Lo que nos sirve es tu forma de decirlo.
- Puedes responder "Sí", "Lo diría de otra forma", "Depende" o "No sé". Si respondes "Depende", escribe de qué.
- Puedes saltarte cualquier pregunta.
- Cada pregunta se entiende sola. El ejemplo y el dibujo están junto a ella.
- Las líneas de origen que aparecen en letra pequeña son para el equipo. No hace falta leerlas para responder.

---

## 2. Datos de quien responde

Es opcional. Puedes dejar en blanco lo que no quieras contar.

**P1. Técnica que dominas**
- [ ] Palillo
- [ ] Crochet
- [ ] Ambas

**P2. Años tejiendo:** ______

**P3. Región o país:** ______

**P4. Idioma de los patrones que lees**
- [ ] Español
- [ ] Inglés
- [ ] Ambos
- [ ] Otro: ______

**P5. ¿Tejes con la mano izquierda (zurda)?**
- [ ] Sí
- [ ] No
- [ ] Prefiero no responder

---

## 3. Preguntas

En cada pregunta, "Hoy la aplicación dice" muestra el texto o la regla tal como está ahora. Después viene lo que necesitamos saber.

El grosor de la lana se mide en categorías del 0 (la más fina) al 7 (la más gruesa). Los nombres en español son de LoopitaLab: el Craft Yarn Council (CYC) define las categorías, pero no publica nombres en español. Los nombres en inglés de la tabla son los del CYC.

### Tema A. Grosores de lana

#### A1. Nombres de cada grosor (prioridad)

**Hoy la aplicación dice:** los nombres de la tabla. En la última columna escribe "Sí", el nombre que usarías o "No sé".

| Cat. | Nombre actual | Otros nombres que aparecen | Puntos en 10 cm (palillo, punto jersey) | Agujas (mm) | Tu respuesta |
|---|---|---|---|---|---|
| 0 | Ultra Fino | Encaje; Hilo de crochet n.º 10 | 33 a 40 | 1,5 a 2,25 | |
| 1 | Super Fino | Super Fino (Fingering) | 27 a 32 | 2,25 a 3,25 | |
| 2 | Fino | Fino (Light DK); Sport - Fino | 23 a 26 | 3,25 a 3,75 | |
| 3 | Ligero | Ligero (DK) | 21 a 24 | 3,75 a 4,5 | |
| 4 | Medio | Mediano; Medio (Aran / Worsted) | 16 a 20 | 4,5 a 5,5 | |
| 5 | Abultado | Abultado (Chunky); Grueso | 12 a 15 | 5,5 a 8 | |
| 6 | Súper Abultado | Super Grueso | 7 a 11 | 8 a 12,75 | |
| 7 | Jumbo | (ninguno) | 6 o menos | 12,75 o más | |

*Origen: `packages/yarn-catalog/data/grosores.json` (nombres, alias y rangos del CYC); `docs/roadmap.md`, glosario pendiente, "Nombres de grosores 0 a 7".*

#### A2. "Súper" con tilde (prioridad)

**Hoy la aplicación dice:** "Super Fino" (categoría 1) sin tilde, y "Súper Abultado" (categoría 6) con tilde.

**Pregunta:** ¿Cómo lo escribirías?
- [ ] Con tilde en las dos: "Súper Fino" y "Súper Abultado"
- [ ] Sin tilde en las dos: "Super Fino" y "Super Abultado"
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Tilde en Súper", a decidir con tejedoras); `packages/yarn-catalog/data/grosores.json`.*

#### A3. "Mediano" para la categoría 4 (prioridad)

**Hoy la aplicación dice:** la categoría 4 se llama "Medio" y tiene el alias "Mediano".

**Pregunta:** ¿Usarías "Mediano" para esa categoría?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente (variantes regionales); `packages/yarn-catalog/data/grosores.json`.*

#### A4. "Grueso" y "Súper Grueso"

**Hoy la aplicación dice:** "Grueso" es alias de la categoría 5 (Abultado), y "Súper Grueso" es alias de la categoría 6 (Súper Abultado). No los trata como sinónimos exactos.

**Pregunta:** ¿Son lo mismo que esas categorías?
- [ ] Sí, son lo mismo
- [ ] Son parecidos, pero no iguales. La diferencia es: ______
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Mediano", "Grueso", "Súper Grueso": variantes regionales, no equivalencias seguras); `packages/yarn-catalog/data/grosores.json`.*

#### A5. Categoría 7, "Jumbo" (prioridad)

**Hoy la aplicación dice:** la categoría 7 se llama "Jumbo". Su muestra de referencia es de 6 puntos o menos en 10 cm. Como ese dato es un tope y no un rango, la aplicación la marca con "confianza baja".

**Pregunta:** ¿Te parece razonable?
- [ ] Sí
- [ ] No. Lo diría así: ______
- [ ] No sé

*Origen: `packages/yarn-catalog/data/grosores.json`; `apps/web/src/lib/studio-texts.ts`, clave `muestra.confianzaBaja` (validar con tejedora, categoría 7); `docs/casos-dominio-colorwork.md`, tabla de muestra supuesta.*

### Tema B. Muestra y tensión

En las preguntas B2 a B5, la aplicación supone cuántas filas hay por cada punto. Es una proporción supuesta: tu muestra real siempre manda.

#### B1. Muestra o tensión

**Hoy la aplicación dice:** "Muestra". El alias es "tensión".

**Pregunta:** ¿Cómo le dices a la prueba de puntos y filas en 10 cm?
- [ ] Muestra
- [ ] Tensión
- [ ] Uso las dos
- [ ] Lo diría de otra forma: ______

*Origen: `docs/roadmap.md`, glosario pendiente ("Muestra", alias regional "tensión"); `apps/web/src/lib/studio-texts.ts`, claves `muestra.titulo` y `muestra.alias`.*

#### B2. Filas por punto en palillo, punto jersey (prioridad)

**Hoy la aplicación dice:** en punto jersey a palillo supone 1,35 filas por cada punto. Ejemplo: si tu muestra tiene 20 puntos en 10 cm, supone 27 filas (20 × 1,35 = 27).

**Pregunta:** Con 20 puntos en 10 cm en punto jersey, ¿cuántas filas tienes aproximadamente?
- [ ] Unas 27
- [ ] Otra cantidad: ______
- [ ] No sé

*Origen: `packages/yarn-catalog/src/index.ts` (`ROWS_PER_STITCH_BY_ASSUMPTION`); `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1; `apps/web/src/lib/studio-texts.ts`, clave `muestra.supuestoPuntoJersey`.*

#### B3a. Colorwork: ¿cambia la tensión? (prioridad)

**Hoy la aplicación dice:** en colorwork (dos colores o más por fila) conviene medir una muestra tejida en colorwork, porque ese tejido suele quedar con otra tensión que el punto jersey.

**Pregunta:** ¿Es cierto que el colorwork queda con otra tensión?
- [ ] Sí
- [ ] No
- [ ] Depende: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `muestra.colorworkConviene` (validar con tejedora).*

#### B3b. Colorwork: filas por punto (prioridad)

**Hoy la aplicación dice:** la proporción de 1,35 para punto jersey podría estar más cerca de 1,25 a 1,3 en colorwork. Ejemplo: con 20 puntos en 10 cm, serían entre 25 y 26 filas.

**Pregunta:** Con 20 puntos en 10 cm en colorwork, ¿cuántas filas tienes aproximadamente?
- [ ] Entre 25 y 26
- [ ] Otra cantidad: ______
- [ ] No sé

*Origen: `docs/casos-dominio-colorwork.md`, "Muestra supuesta por grosor" (validar con tejedora); `apps/web/src/lib/studio-texts.ts`, clave `muestra.supuestoPuntoJersey`.*

#### B4. Crochet, punto bajo (prioridad)

**Hoy la aplicación dice:** en crochet con punto bajo supone 1,2 filas por cada punto. Ejemplo: 16 puntos en 10 cm dan unas 19 filas. Además, la muestra de palillo no sirve para crochet, porque la proporción cambia según el punto.

**Pregunta:** Con 16 puntos de punto bajo en 10 cm, ¿cuántas filas tienes aproximadamente?
- [ ] Unas 19
- [ ] Otra cantidad: ______
- [ ] No sé

*Origen: `packages/yarn-catalog/src/index.ts`, `ROWS_PER_STITCH_BY_ASSUMPTION["crochet-pb"]` (supuesto, validar con tejedora); `apps/web/src/lib/studio-texts.ts`, clave `muestra.supuestoCrochet`.*

#### B5. Crochet, punto alto (prioridad)

**Hoy la aplicación dice:** en crochet con punto alto supone 0,6 filas por cada punto. Ejemplo: 12 puntos en 10 cm dan unas 7 filas.

**Pregunta:** Con 12 puntos de punto alto en 10 cm, ¿cuántas filas tienes aproximadamente?
- [ ] Unas 7
- [ ] Otra cantidad: ______
- [ ] No sé

*Origen: `packages/yarn-catalog/src/index.ts`, `ROWS_PER_STITCH_BY_ASSUMPTION["crochet-pa"]` (supuesto, validar con tejedora).*

### Tema C. Vocabulario

Para cada término, marca lo que dirías. Si usas otra palabra, escríbela.

#### C1. Casilla (prioridad)

**Hoy la aplicación dice:** "casilla". Cada cuadradito del gráfico es una casilla.

**Pregunta:** ¿Cómo llamas a cada cuadradito del gráfico?
- [ ] Casilla
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Unidad de la cuadrícula"); `apps/web/src/lib/studio-texts.ts`, clave `unidades.casilla`.*

#### C2. Vuelta o fila (prioridad)

**Hoy la aplicación dice:** en redondo se usa "vuelta" (cada pasada completa alrededor). En ida y vuelta se usa "fila".

**Pregunta:** ¿Cómo lo dices tú en cada caso?
- En redondo:
  - [ ] Vuelta
  - [ ] Lo diría de otra forma: ______
- En ida y vuelta:
  - [ ] Fila
  - [ ] Lo diría de otra forma: ______

*Origen: `docs/roadmap.md`, glosario pendiente ("Vuelta o fila"); `apps/web/src/lib/studio-texts.ts`, claves `unidades.vuelta` y `unidades.fila`.*

#### C3. Lado derecho, lado revés y punto revés

**Hoy la aplicación dice:** "lado derecho" y "lado revés" para las dos caras de la labor, y "punto revés" para el punto que se teje del lado revés.

**Pregunta:** ¿Usas esas palabras?
- [ ] Sí, las uso
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Lados y puntos"); `apps/web/src/lib/studio-texts.ts`, claves `unidades.ladoDerecho` y `unidades.ladoReves`.*

#### C4. Abreviatura de puntos

**Hoy la aplicación dice:** "pts". No usa "p", porque se confunde con punto revés.

**Pregunta:** Si escribes la abreviatura, ¿cuál usas?
- [ ] pts
- [ ] p
- [ ] Otra: ______
- [ ] No la uso

*Origen: `docs/roadmap.md`, glosario pendiente ("Abreviatura de puntos"); `apps/web/src/lib/studio-texts.ts`, clave `unidades.puntosAbrev`.*

#### C5. Hebras flotantes (prioridad)

**Hoy la aplicación dice:** una hebra flotante es la hebra que va tendida por el revés entre dos zonas del mismo color. Ejemplo:

```
Por el derecho:  B  A  A  A  A  A  B
Por el revés:    la hebra de B pasa tendida por debajo de los 5 puntos de A
```

**Pregunta:** ¿Se entiende el término y la definición?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Hebras": un solo término, "hebras flotantes"); `apps/web/src/lib/studio-texts.ts`, clave `ayuda.enganchar` (validar con tejedora).*

#### C6. Fijar una hebra larga: enganchar, entrelazar, trabar (prioridad)

**Hoy la aplicación dice:** "enganchar" o "entrelazar" la hebra para fijar una hebra larga. La palabra "trabar" no es del glosario de LoopitaLab; aparece aquí solo para comparar.

**Pregunta:** Para fijar una hebra larga por el revés, ¿qué verbo usas?
- [ ] Enganchar
- [ ] Entrelazar
- [ ] Trabar
- [ ] Lo diría de otra forma: ______

*Origen: `docs/roadmap.md`, glosario pendiente ("Fijar una hebra larga": "enganchar" o "entrelazar"; no "atrapar"); `apps/web/src/lib/studio-texts.ts`, clave `ayuda.enganchar`. La opción "trabar" se agregó a pedido de la usuaria, para comparar.*

#### C7. Dos puntos juntos

**Hoy la aplicación dice:** el glosario propone "2 juntos al derecho" para una disminución. Todavía no aparece en la aplicación: se usará más adelante.

**Pregunta:** Cuando tejes dos puntos como uno, ¿cómo lo nombras?
- [ ] 2 juntos al derecho
- [ ] 2 juntos
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Disminuciones"); `apps/web/src/lib/studio-texts.ts`, clave `disminuciones.tipoPendiente`.*

#### C8. Cierre de la coronilla (prioridad)

**Hoy la aplicación dice:** "coronilla" o "remate" para el cierre de la copa en el centro. "Copa" aparece como alias.

**Pregunta:** ¿Cómo le dices a la parte que cierra la copa en el centro?
- [ ] Coronilla
- [ ] Remate
- [ ] Copa
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Cierre del círculo"); `apps/web/src/lib/studio-texts.ts`, clave `ayuda.cierreCirculo` (validar con tejedora).*

#### C9. Cuña o gajo (prioridad)

**Hoy la aplicación dice:** "cuña" es cada parte en forma de triángulo que se repite alrededor de la copa. "Gajo" aparece como alias.

**Pregunta:** ¿Cómo llamas a esa parte?
- [ ] Cuña
- [ ] Gajo
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Cuña", alias "gajo"); `apps/web/src/lib/studio-texts.ts`, clave `asistente.plantillaCopa` (validar con tejedora).*

#### C10. Técnica: tejido de colores, jacquard, tapestry (prioridad)

**Hoy la aplicación dice:** en palillo, el subtítulo del estudio es "Tejido de colores (jacquard)". En crochet, "Tejido de colores (tapestry)", que llegará después.

**Pregunta:** ¿Cómo le dices a esta técnica?
- [ ] Tejido de colores
- [ ] Jacquard
- [ ] Tapestry
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Colorwork"); `apps/web/src/lib/studio-texts.ts`, clave `subtitulo` (validar con tejedora).*

#### C11. Palillos o agujas

**Hoy la aplicación dice:** "palillos", con el alias "agujas".

**Pregunta:** ¿Cómo llamas a los palillos?
- [ ] Palillos
- [ ] Agujas
- [ ] Uso las dos
- [ ] Lo diría de otra forma: ______

*Origen: `docs/roadmap.md`, glosario pendiente ("Palillo", alias "aguja"); `apps/web/src/lib/studio-texts.ts`, clave `panelLanas.agujas`.*

#### C12. Punto jersey o punto media

**Hoy la aplicación dice:** "punto jersey", con el alias "punto media". Es el punto en que se basa la muestra supuesta de palillo.

**Pregunta:** ¿Cómo lo llamas?
- [ ] Punto jersey
- [ ] Punto media
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `docs/roadmap.md`, glosario pendiente ("Punto jersey", alias "punto media"); `docs/casos-dominio-colorwork.md`, muestra supuesta.*

#### C13. Lana, hilado, hilo

**Hoy la aplicación dice:** "lana", con los alias "hilado" e "hilo".

**Pregunta:** ¿Cómo le dices al hilo para tejer?
- [ ] Lana
- [ ] Hilado
- [ ] Hilo
- [ ] Lo diría de otra forma: ______

*Origen: `docs/roadmap.md`, glosario pendiente ("Lana").*

#### C14. Crochet, ganchillo, croché

**Hoy la aplicación dice:** "crochet", con los alias "ganchillo" y "croché".

**Pregunta:** ¿Cómo le dices a esta técnica con gancho?
- [ ] Crochet
- [ ] Ganchillo
- [ ] Croché
- [ ] Lo diría de otra forma: ______

*Origen: `docs/roadmap.md`, glosario pendiente ("Crochet").*

### Tema D. Lectura de gráficos

En el gráfico, cada fila o vuelta tiene un número. La aplicación sigue la convención de los gráficos de tejido.

#### D1. La fila 1 está abajo (prioridad)

**Hoy la aplicación dice:** la fila 1 es la primera que se teje y está abajo. Las filas siguen hacia arriba. Ejemplo:

```
Fila 3:  [A][A][B][A][A]
Fila 2:  [A][B][B][B][A]
Fila 1:  [A][A][B][A][A]   <- primera fila, se teje por el derecho
```

**Pregunta:** ¿En tus gráficos, la fila 1 está abajo?
- [ ] Sí
- [ ] No, la pongo arriba
- [ ] Depende: ______
- [ ] No sé

*Origen: `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1 (coordenadas); `apps/web/src/lib/studio-texts.ts`, clave `ayuda.cuadricula`.*

#### D2. Dónde empieza la numeración de casillas (prioridad)

**Hoy la aplicación dice:** la casilla 1 está a la derecha. Las casillas se numeran de derecha a izquierda en todas las filas, también en las que se tejen por el revés. Ejemplo:

```
  5    4    3    2    1
[ A ][ A ][ B ][ A ][ A ]
                      ^ casilla 1
```

**Pregunta:** ¿Dónde empiezas a numerar las casillas de un gráfico?
- [ ] A la derecha (la casilla 1 está a la derecha)
- [ ] A la izquierda
- [ ] Depende de la fila: ______
- [ ] No sé

Si en tus gráficos las filas del revés se numeran de otra forma, cuéntalo aquí: ______

*Origen: `docs/adr/0003-colorwork-en-esquema-v1.md`, enmienda E18 (numeración del editor) y sección 1 (numeración del gráfico). Ver el anexo, punto 3.*

#### D3. Lectura en ida y vuelta (prioridad)

**Hoy la aplicación dice:** en ida y vuelta, las filas impares (1, 3, 5…) se tejen por el derecho y se leen de derecha a izquierda. Las filas pares (2, 4, 6…) se tejen por el revés y se leen de izquierda a derecha. Ejemplo:

```
Fila 3  (derecho)   se lee de derecha a izquierda   <-
Fila 2  (revés)     se lee de izquierda a derecha   ->
Fila 1  (derecho)   se lee de derecha a izquierda   <-
```

**Pregunta:** ¿Lees así tus gráficos?
- [ ] Sí
- [ ] No. Lo hago así: ______
- [ ] Depende del gráfico: ______
- [ ] No sé

*Origen: `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1 (orden de lectura); `apps/web/src/lib/studio-texts.ts`, claves `ayuda.lectura` y `tejido.ayudaIdaYVuelta` (validar con tejedora).*

#### D4. En redondo, todas las vueltas por el derecho (prioridad)

**Hoy la aplicación dice:** en redondo, todas las vueltas se tejen por el lado derecho y se leen de derecha a izquierda.

**Pregunta:** ¿Es así en tu práctica?
- [ ] Sí
- [ ] No. Lo que pasa es: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `tejido.ayudaRedondo` (validar con tejedora); `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1.*

#### D5. Motivo de alto impar, repetido a lo alto (prioridad)

**Hoy la aplicación dice:** si el motivo tiene un alto impar (por ejemplo, 3 filas) y se repite a lo alto, el derecho y el revés de cada fila se alternan entre repeticiones. La numeración es la de la primera repetición. Ejemplo: un motivo de 3 filas repetido 2 veces.

```
Fila 6  (revés)     corresponde a la fila 3 del motivo
Fila 5  (derecho)   corresponde a la fila 2 del motivo
Fila 4  (revés)     corresponde a la fila 1 del motivo
Fila 3  (derecho)   corresponde a la fila 3 del motivo
Fila 2  (revés)     corresponde a la fila 2 del motivo
Fila 1  (derecho)   corresponde a la fila 1 del motivo
```

**Pregunta:** ¿Qué pasa con las filas del motivo al repetirlo a lo alto?
- [ ] Se alternan: por ejemplo, la fila 1 del motivo se teje por el derecho en una repetición y por el revés en la siguiente
- [ ] Siempre quedan iguales
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `ayuda.alternanciaMotivo` (validar con tejedora); `docs/roadmap.md`, Fase 2, tarea T7b (numeración con el motivo solo).*

#### D6a. Lectura en espejo para zurdas (prioridad)

**Hoy la aplicación dice:** hay una preferencia de la cuenta, "Tejer en espejo", desactivada por defecto. No se activa sola por ser zurda. Con ella, las filas por el derecho se leen de izquierda a derecha, las del revés de derecha a izquierda, y las casillas se numeran desde la izquierda. El dibujo no cambia.

**Pregunta:** ¿Las zurdas que conoces leen un gráfico de otra forma?
- [ ] Sí, la mayoría
- [ ] Algunas
- [ ] No, la mayoría lee igual que las diestras
- [ ] Depende: ______
- [ ] No sé

*Origen: `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1 (tejido en espejo; la decisión de no espejar por `dominant_hand`); `apps/web/src/lib/studio-texts.ts`, clave `editor.espejo` (validar con tejedora); `docs/roadmap.md`, tarea T3c. Ver el anexo, punto 4.*

#### D6b. Preferencia en vez de automático

**Hoy la aplicación dice:** la lectura en espejo es una preferencia que cada persona activa.

**Pregunta:** ¿Te parece bien que sea una preferencia?
- [ ] Sí
- [ ] No. Lo mejor sería: ______
- [ ] No sé

*Origen: `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1.*

### Tema E. Círculo y copa

La vista de círculo muestra una copa de gorro. Cada cuña se repite alrededor, y en cada vuelta de disminución la cuña pierde puntos.

#### E1a. Sentido de avance, de abajo hacia arriba (prioridad)

**Hoy la aplicación dice:** al mirar la copa desde arriba, si se teje de abajo hacia arriba, la vista dibuja las cuñas en sentido antihorario.

**Pregunta:** Al tejer la copa de abajo hacia arriba, mirándola desde arriba, ¿la vuelta avanza en sentido horario o antihorario?
- [ ] Horario
- [ ] Antihorario
- [ ] Depende de: ______
- [ ] No sé

*Origen: `docs/adr/0005-geometria-circulo-y-disminuciones.md`, sección "Geometría del círculo" (sentido; validar con tejedora); `docs/casos-dominio-colorwork.md`, caso 26.*

#### E1b. Sentido de avance, de arriba hacia abajo (prioridad)

**Hoy la aplicación dice:** al mirar la copa desde arriba, si se teje de arriba hacia abajo, la vista dibuja las cuñas en sentido horario.

**Pregunta:** Al tejer la copa de arriba hacia abajo, mirándola desde arriba, ¿la vuelta avanza en sentido horario o antihorario?
- [ ] Horario
- [ ] Antihorario
- [ ] Depende de: ______
- [ ] No sé

*Origen: `docs/adr/0005-geometria-circulo-y-disminuciones.md`, sección "Geometría del círculo" (validar con tejedora).*

#### E2. De abajo hacia arriba (prioridad)

**Hoy la aplicación dice:** "La pieza empieza abajo y crece hacia arriba. En el círculo, la copa se cierra al final."

**Pregunta:** ¿Se entiende así?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `direccion.ayudaBottomUp` (validar con tejedora).*

#### E3. De arriba hacia abajo (prioridad)

**Hoy la aplicación dice:** la vista gira el gráfico 180 grados, para que la pieza se vea como queda puesta. No es un espejo. Ejemplo: una casilla que está arriba a la izquierda en el gráfico aparece abajo a la derecha en la vista.

**Pregunta:** Si tejes de arriba hacia abajo, ¿esperas ver el gráfico girado así?
- [ ] Sí
- [ ] No. Lo esperaba: ______
- [ ] Depende: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `direccion.ayudaTopDown` (validar con tejedora); `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1 (`direction`).*

#### E4. Número de cuñas (prioridad)

**Hoy la aplicación dice:** se recomiendan de 4 a 12 cuñas por copa. Las más comunes son 6, 8, 10 y 12. Con menos o más, aparece un aviso informativo.

**Pregunta:** ¿Es un rango razonable?
- [ ] Sí
- [ ] No. El rango debería ser: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `panel.repeticionesRango`; `docs/adr/0005-geometria-circulo-y-disminuciones.md`, validación `CHART_CIRCLE_REPEATS` (validar con tejedora).*

#### E5. Cuña mínima (prioridad)

**Hoy la aplicación dice:** en la fila más ancha de una cuña, si hay menos de 4 puntos, aparece un aviso: no hay espacio para un dibujo.

**Pregunta:** ¿Te parece un mínimo razonable?
- [ ] Sí
- [ ] No. El mínimo debería ser: ______
- [ ] No sé

*Origen: `docs/adr/0005-geometria-circulo-y-disminuciones.md`, validación `CHART_WEDGE_TOO_NARROW` (validar con tejedora); `docs/roadmap.md`, glosario pendiente ("Cuña angosta").*

#### E6. Cierre de la coronilla (prioridad)

**Hoy la aplicación dice:** al cerrar la copa en el centro, no avisa si la última vuelta tiene hasta 16 puntos. Muestra un aviso informativo si tiene más de 16, y una advertencia si tiene más de 24.

**Pregunta:** ¿Cuántos puntos quedan normalmente en la última vuelta antes de cerrar la coronilla?
- [ ] 5 a 8
- [ ] 8 a 16
- [ ] Otra cantidad: ______
- [ ] No sé

*Origen: `docs/adr/0005-geometria-circulo-y-disminuciones.md`, validación `CHART_CIRCLE_NOT_CLOSED` (validar con tejedora); `docs/casos-dominio-colorwork.md`, caso 10. Ver el anexo, punto 2.*

#### E7a. Montaje inicial del círculo (prioridad)

**Hoy la aplicación dice:** "Montaje inicial de 8 a 12 puntos para empezar un círculo a palillo". La aplicación solo avisa si el montaje tiene menos de 4 o más de 16 puntos.

**Pregunta:** ¿Cuántos puntos montas para empezar un círculo a palillo?
- [ ] 8 a 12
- [ ] Otra cantidad: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `ayuda.comienzoCirculo` (validar con tejedora); `docs/adr/0005-geometria-circulo-y-disminuciones.md`, validación `CHART_CIRCLE_START`. Ver el anexo, punto 1.*

#### E7b. Nombre del montaje inicial

**Hoy la aplicación dice:** "montaje inicial".

**Pregunta:** ¿Cómo le dices a ese primer grupo de puntos?
- [ ] Montaje inicial
- [ ] Montaje
- [ ] Lo diría de otra forma: ______

*Origen: `docs/roadmap.md`, glosario pendiente ("Comienzo del círculo a palillo": validar el término "montaje inicial").*

#### E7c. Anillo mágico en crochet

**Hoy la aplicación dice:** en crochet, anillo mágico de 6 a 12 puntos. La fase 2 solo cubre palillo; esta pregunta es para el glosario.

**Pregunta:** En crochet, ¿cuántos puntos tiene el anillo mágico con que empiezas?
- [ ] 6 a 12
- [ ] Otra cantidad: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `ayuda.comienzoCirculo`; `docs/roadmap.md`, glosario pendiente.*

#### E8. Circunferencia

**Hoy la aplicación dice:** en el círculo, el ancho que se muestra es la circunferencia del borde, es decir, la vuelta más ancha.

**Pregunta:** ¿Se entiende "circunferencia" para esa medida?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `medidas.ayudaCircunferenciaCirculo` (validar con tejedora).*

#### E9. Deformación de la copa en la vista

**Hoy la aplicación dice:** en un círculo, los dibujos se ven más estirados cerca del borde y más apretados cerca del centro. La vista es plana, y la copa real forma una cúpula. Es una aproximación, no un error del patrón.

**Pregunta:** ¿Es una explicación clara?
- [ ] Sí
- [ ] No. Le falta: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `limitaciones.deformacionCirculo` (validar con tejedora, incluidos los umbrales); `docs/adr/0005-geometria-circulo-y-disminuciones.md`, sección "ringDistortion".*

#### E10. Plano, tubo y círculo

**Hoy la aplicación dice:**
- Plano: tejido plano, como un rectángulo abierto.
- Tubo: tejido en redondo sin disminuciones, como una banda cerrada.
- Círculo: tejido en redondo que se cierra en el centro, como la copa de un gorro. Cada cuña se repite alrededor.

**Pregunta:** ¿Se entienden estas tres definiciones?
- [ ] Sí
- [ ] Cambiaría: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, claves `formas.ayudaPlano`, `formas.ayudaTubo` y `formas.ayudaCirculo` (esta última, validar con tejedora).*

#### E11. Tubo tejido de ida y vuelta

**Hoy la aplicación dice:** si un tubo se teje de ida y vuelta, avisa que se cierra con una costura.

**Pregunta:** ¿Es correcto?
- [ ] Sí
- [ ] No. Es así: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `tejido.tuboIdaYVuelta` (validar con tejedora); `docs/adr/0005-geometria-circulo-y-disminuciones.md`, validación `CHART_ROWS_SHAPE`.*

### Tema F. Hebras flotantes y lanas en el diseño

#### F1. Máximo de hebra flotante por grosor (prioridad)

**Hoy la aplicación dice:** avisa cuando una hebra flotante pasa de cierto número de puntos. Ese máximo sale de 2,5 cm de hebra, con tope de 5 puntos. La tabla usa la muestra supuesta de cada grosor (punto medio del rango).

| Cat. | Puntos en 10 cm (supuesto) | Máximo de hebra flotante, en puntos | Tu respuesta |
|---|---|---|---|
| 0 | 37 | 5 | |
| 1 | 30 | 5 | |
| 2 | 25 | 5 | |
| 3 | 23 | 5 | |
| 4 | 18 | 4 | |
| 5 | 14 | 3 | |
| 6 | 9 | 2 | |
| 7 | 6 | 1 | |

**Pregunta:** ¿Te parecen razonables estos máximos? En la última columna escribe "Sí" o el número que usarías.

*Origen: `docs/casos-dominio-colorwork.md`, "Muestra supuesta por grosor" y casos 15 a 17; `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 4 ("Umbral de hebras flotantes") (validar con tejedora).*

#### F2. Cada cuánto enganchar (prioridad)

**Hoy la aplicación dice:** conviene enganchar una hebra flotante larga. El máximo se calcula con 2,5 cm de hebra y tope de 5 puntos. Ejemplo: con una muestra de 25 puntos en 10 cm, 2,5 cm son unos 6 puntos, y manda el tope de 5.

**Pregunta:** ¿Cada cuánto enganchas una hebra flotante?
- [ ] Cada 2,5 cm
- [ ] Cada 5 puntos
- [ ] Otra medida: ______
- [ ] No engancho
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `ayuda.enganchar` (validar con tejedora); `docs/casos-dominio-colorwork.md`, "Fuentes" (2,5 cm y 5 puntos).*

#### F3. Cuántas lanas por vuelta o fila

**Hoy la aplicación dice:** si una vuelta o fila usa más de 2 lanas, aparece un aviso informativo. En colorwork de hebras, lo habitual es 2 por vuelta o fila.

**Pregunta:** ¿Cuántas lanas usas como máximo en una misma vuelta o fila?
- [ ] 2
- [ ] 3
- [ ] Más de 3: ______
- [ ] Depende: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, función `issueGroupText`; `docs/adr/0003-colorwork-en-esquema-v1.md`, validación `CHART_COLORS_PER_ROW`.*

#### F4. Quitar una lana (prioridad)

**Hoy la aplicación dice:** "Antes de quitarla, elige la lana que reemplazará sus casillas."

**Pregunta:** ¿Se entiende el paso?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `lanas.eligeReemplazo` (validar con tejedora); `docs/adr/0003-colorwork-en-esquema-v1.md`, enmienda E4.*

### Tema G. Motivo, repeticiones y tamaño

#### G1. Repeticiones

**Hoy la aplicación dice:** "El motivo se repite este número de veces a lo ancho y a lo alto. Al editar cualquier repetición, cambia el mismo punto en todas."

**Pregunta:** ¿Lo esperarías así?
- [ ] Sí
- [ ] No. Lo esperaba: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `repeticiones.ayuda`.*

#### G2. Tamaño máximo del motivo (prioridad)

**Hoy la aplicación dice:** el motivo puede medir hasta 200 casillas de ancho por 200 de alto.

**Pregunta:** ¿Alcanza para un diseño sin repetir, por ejemplo el cuerpo de un suéter con un dibujo único?
- [ ] Sí
- [ ] No. El máximo debería ser: ______
- [ ] No sé

*Origen: `docs/adr/0003-colorwork-en-esquema-v1.md`, enmienda E7 (pendiente de confirmar con `experto-tejido`); `docs/roadmap.md`, decisión 3.*

#### G3a. Agrandar el motivo: dónde quedan las casillas nuevas (prioridad)

**Hoy la aplicación dice:** si agrandas el motivo, lo nuevo se rellena con la lana A, y el motivo queda anclado abajo a la izquierda. Ejemplo (N = casilla nueva):

```
Antes (2 × 2):             Después (3 × 3):
Fila 2:  [A][B]            Fila 3:  [N][N][N]
Fila 1:  [B][A]            Fila 2:  [A][B][N]
                           Fila 1:  [B][A][N]
```

**Pregunta:** Si agrandas un motivo, ¿dónde esperarías las casillas nuevas?
- [ ] Arriba y a la derecha, como en el ejemplo
- [ ] En otro lugar: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `panel.tamanoAyuda`; `docs/adr/0003-colorwork-en-esquema-v1.md`, enmienda E5 (anclajes); `docs/roadmap.md`, Fase 2 (cambio de tamaño con ancla). Ver el anexo, punto 10.*

#### G3b. Agrandar el motivo: con qué lana

**Hoy la aplicación dice:** las casillas nuevas se rellenan con la lana A, que es la primera de la lista.

**Pregunta:** ¿Con qué lana esperarías que se rellenen?
- [ ] La lana A, la primera de la lista
- [ ] Otra: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `panel.tamanoAyuda`; `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 3 (`newChartPattern`: la primera lana es el fondo).*

#### G4. Agrandar el motivo en el círculo (prioridad)

**Hoy la aplicación dice:** en el círculo, las casillas nuevas se rellenan con la lana A y pueden romper la forma de la cuña. Hay que revisar los bordes y marcar con "sin punto" las casillas que queden fuera de la cuña.

**Pregunta:** ¿Se entiende? ¿Lo harías distinto?
- [ ] Sí
- [ ] Lo haría distinto: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `panel.tamanoCirculo` (validar con tejedora).*

### Tema H. Lo que la vista muestra

Esta vista es una aproximación. Estas preguntas miran si lo que dice la aplicación sobre lo que no muestra se entiende y es correcto.

#### H1. Casillas "sin punto" en plano y tubo (prioridad)

**Hoy la aplicación dice:** en plano y tubo, las casillas "sin punto" se dibujan como huecos. La prenda real no tiene huecos: la pieza se teje continua. Ejemplo:

```
Gráfico (- = sin punto):      Fila 3: [A][-][A]
                              Fila 2: [A][A][A]

Vista en plano o tubo:        Fila 3: [A]   [A]     <- hueco
                              Fila 2: [A][A][A]
```

**Pregunta:** ¿Se entiende que el hueco de la vista no existe en la prenda?
- [ ] Sí
- [ ] No. En la prenda real pasa esto: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, claves `ayuda.sinPuntoPlanoTubo` y `limitaciones.huecosSinPunto`; `docs/roadmap.md`, criterio CA-F13.*

#### H2. Orillos

**Hoy la aplicación dice:** "La vista no dibuja los orillos (las puntadas de los bordes)."

**Pregunta:** ¿Es correcto y se entiende?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `limitaciones.orillos` (validar con tejedora).*

#### H3. Salto de vuelta (jog)

**Hoy la aplicación dice:** "La vista no dibuja el salto de vuelta (jog), el desfase donde termina y empieza cada vuelta en redondo."

**Pregunta:** ¿Es correcto y se entiende?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `limitaciones.jog` (validar con tejedora).*

#### H4. Color del punto después de una disminución (prioridad)

**Hoy la aplicación dice:** "El punto que queda después de una disminución se muestra con el color de su fila. En el tejido real puede tener otro color."

**Pregunta:** ¿Es así en tu práctica?
- [ ] Sí
- [ ] No. Lo que pasa es: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `limitaciones.colorTrasDisminucion` (validar con tejedora); `docs/adr/0003-colorwork-en-esquema-v1.md`, sección 1 (matices de `NO_STITCH`).*

#### H5. Aviso de prototipo digital

**Hoy la aplicación dice:** "La vista es una aproximación. Teje una muestra para comprobar la tensión y las proporciones."

**Pregunta:** ¿Se entiende? ¿Lo dirías distinto?
- [ ] Sí
- [ ] Lo diría de otra forma: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `prototipo.aviso`.*

### Tema I. Disminuciones

#### I1. Dónde se marca una disminución (prioridad)

**Hoy la aplicación dice:** marca con un triángulo la casilla donde se pierde un punto. Todavía no indica el tipo de disminución. Puede que la disminución se teja en una casilla vecina. Ejemplo:

```
Vuelta 31:  [A][A][A][A][A]     5 puntos
Vuelta 32:  [A][A][A][-][A]     4 puntos
                      ^ aquí se pierde un punto
```

**Pregunta:** ¿Dónde marcarías una disminución?
- [ ] En la casilla donde desaparece el punto
- [ ] En una casilla vecina: ______
- [ ] Depende del tipo de disminución: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, claves `disminuciones.tipoPendiente` y `disminuciones.ayuda` (validar con tejedora); `docs/adr/0003-colorwork-en-esquema-v1.md`, enmienda E8.*

### Tema J. Plantillas

La aplicación ofrece plantillas como punto de partida al crear un diseño nuevo.

#### J1. Banda en tubo

**Hoy la aplicación dice:** la plantilla se llama "Banda en tubo".

**Pregunta:** ¿Es un punto de partida realista para una banda tejida en redondo?
- [ ] Sí
- [ ] No. Le falta: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `asistente.plantillaBanda`; `docs/roadmap.md`, Fase 2 (pantalla `/disenos/nuevo`). Ver el anexo, punto 11.*

#### J2. Copa de gorro en 8 cuñas (prioridad)

**Hoy la aplicación dice:** la plantilla se llama "Copa de gorro en 8 cuñas". Es una copa en círculo con 8 repeticiones de cuña, como punto de partida para editarla.

**Pregunta:** ¿Es realista? ¿Qué le cambiarías?
- [ ] Sí, es realista
- [ ] No. Le cambiaría: ______
- [ ] No sé

*Origen: `apps/web/src/lib/studio-texts.ts`, clave `asistente.plantillaCopa` (validar con tejedora); `docs/roadmap.md`, Fase 2 (plantillas); `docs/adr/0005-geometria-circulo-y-disminuciones.md`. Ver el anexo, punto 11.*

---

## 4. Preguntas abiertas

1. ¿Qué parte de esta hoja te confundiría si la leyera alguien que no teje?
2. ¿Qué término, tema o ejemplo falta?
3. ¿Hay algo que la aplicación dice y que harías distinto?
4. ¿Qué te gustaría que la aplicación te preguntara o te avisara?
5. Comentarios libres: ______

### Tabla resumen para transcribir

Copia aquí las respuestas. En "Respuesta" escribe la opción marcada, el dato o "No sé". Si hay dos tejedoras, anota en "Comentario" a cuál corresponde.

| ID | Tema | Respuesta | Comentario |
|---|---|---|---|
| P1 | Técnica | | |
| P2 | Años tejiendo | | |
| P3 | Región o país | | |
| P4 | Idioma de los patrones | | |
| P5 | Zurda | | |
| A1 | Nombres de grosores | | |
| A2 | "Súper" con tilde | | |
| A3 | "Mediano" (cat. 4) | | |
| A4 | "Grueso" y "Súper Grueso" | | |
| A5 | Categoría 7 | | |
| B1 | Muestra o tensión | | |
| B2 | Filas en palillo jersey | | |
| B3a | Colorwork: tensión | | |
| B3b | Colorwork: filas | | |
| B4 | Crochet, punto bajo | | |
| B5 | Crochet, punto alto | | |
| C1 | Casilla | | |
| C2 | Vuelta o fila | | |
| C3 | Lado derecho, lado revés, punto revés | | |
| C4 | Abreviatura "pts" | | |
| C5 | Hebras flotantes | | |
| C6 | Enganchar, entrelazar, trabar | | |
| C7 | 2 juntos | | |
| C8 | Coronilla, remate, copa | | |
| C9 | Cuña o gajo | | |
| C10 | Tejido de colores, jacquard, tapestry | | |
| C11 | Palillos o agujas | | |
| C12 | Punto jersey o punto media | | |
| C13 | Lana, hilado, hilo | | |
| C14 | Crochet, ganchillo, croché | | |
| D1 | Fila 1 abajo | | |
| D2 | Numeración de casillas | | |
| D3 | Lectura en ida y vuelta | | |
| D4 | En redondo, todas por el derecho | | |
| D5 | Alto impar y repetición | | |
| D6a | Lectura en espejo para zurdas | | |
| D6b | Espejo como preferencia | | |
| E1a | Sentido, de abajo hacia arriba | | |
| E1b | Sentido, de arriba hacia abajo | | |
| E2 | De abajo hacia arriba | | |
| E3 | De arriba hacia abajo | | |
| E4 | Número de cuñas | | |
| E5 | Cuña mínima | | |
| E6 | Cierre de la coronilla | | |
| E7a | Montaje inicial, puntos | | |
| E7b | Nombre del montaje inicial | | |
| E7c | Anillo mágico, puntos | | |
| E8 | Circunferencia | | |
| E9 | Deformación de la copa | | |
| E10 | Plano, tubo y círculo | | |
| E11 | Tubo de ida y vuelta | | |
| F1 | Máximo de hebra por grosor | | |
| F2 | Cada cuánto enganchar | | |
| F3 | Lanas por vuelta o fila | | |
| F4 | Quitar una lana | | |
| G1 | Repeticiones | | |
| G2 | Tamaño máximo 200 × 200 | | |
| G3a | Dónde quedan las casillas nuevas | | |
| G3b | Con qué lana se rellenan | | |
| G4 | Agrandar en el círculo | | |
| H1 | Sin punto en plano y tubo | | |
| H2 | Orillos | | |
| H3 | Salto de vuelta (jog) | | |
| H4 | Color después de una disminución | | |
| H5 | Aviso de prototipo | | |
| I1 | Dónde se marca una disminución | | |
| J1 | Plantilla banda en tubo | | |
| J2 | Plantilla copa en 8 cuñas | | |
| Abiertas 1 a 5 | Preguntas abiertas | | |

---

## 5. Para la usuaria

**Cómo usar la hoja**

1. Imprime las secciones 1 a 4, o comparte el archivo con la tejedora.
2. Lee la sección 1 con la tejedora antes de empezar. Recuerda que no hay respuestas incorrectas.
3. Elige la ruta. La **ruta corta** son las 40 preguntas con "(prioridad)" en el título. La **ruta completa** incluye las 63 preguntas.
4. Marca una opción o escribe en la línea. "No sé" es una respuesta válida.
5. Anota las respuestas en la tabla de la sección 4, o cópialas en un documento.

**Cuánto toma (estimación, no medida)**

- Ruta corta: 40 a 50 minutos.
- Ruta completa: 70 a 90 minutos. Conviene dividirla en dos sesiones.
- Con dos tejedoras: entrega la misma hoja a cada una y anota las respuestas por separado (en "Comentario", "Tejedora 1" o "Tejedora 2").

**Cómo devolver las respuestas**

Hay dos formas:

- Pega las respuestas en el chat con el código de cada pregunta. Por ejemplo: "A1: Sí; A2: Súper Fino con tilde; C6: Enganchar".
- Envía la tabla de la sección 4 completa.

Con eso, `experto-tejido` aplica las correcciones al texto y a las reglas (tarea T16 del roadmap). La validación T1b se cierra antes de T16.

**Antes de la primera sesión**

Revisa el anexo. Tiene puntos que faltan por confirmar, y algunos afectan lo que se le pregunta a la tejedora.

---

## Anexo. Para el equipo (no imprimir)

**Fuentes leídas para preparar esta hoja:** `docs/roadmap.md` (glosario pendiente, fila T1b, tareas T3, T3c, T7b, T12, T16 y decisiones); `docs/casos-dominio-colorwork.md`; `docs/adr/0003-colorwork-en-esquema-v1.md` (incluidas las enmiendas E1 a E18); `docs/adr/0005-geometria-circulo-y-disminuciones.md`; `apps/web/src/lib/studio-texts.ts`; `packages/yarn-catalog/data/grosores.json`; `packages/yarn-catalog/src/index.ts`.

**Nota sobre el glosario:** `packages/glossary` todavía no existe (es de la fase 4). La terminología de esta hoja sale del "Glosario pendiente" de `docs/roadmap.md`. No se propuso ningún término nuevo: las opciones son las del glosario, sus alias, o el término que ya usa la aplicación. "Trabar" es la única excepción, porque se pidió para comparar (C6).

**Puntos marcados TODO(verificar):**

1. **Montaje inicial (E7a).** El texto de ayuda dice "8 a 12 puntos" y "anillo mágico de 6 a 12". La regla (`CHART_CIRCLE_START`, ADR 0005) solo avisa con menos de 4 o más de 16 puntos en la fila 0. El texto describe una recomendación y la regla es otra cosa. Decidir cuál queda, o si el texto se ajusta.
2. **Cierre de la coronilla (E6).** El caso 10 cita a Interweave (cerrar con 5 a 8 puntos). La regla avisa solo sobre 16 (informativo) y 24 (advertencia). Esperar lo que confirme la tejedora antes de cambiar el texto.
3. **Dos convenciones de numeración (D2).** El ADR 0003 (`rowNumbers` de `pattern-render`) numera las filas por el derecho a la derecha y las del revés a la izquierda. La enmienda E18 numera las casillas del editor de derecha a izquierda en todas las filas. Son convenciones distintas. Confirmar con las tejedoras cuál se usa en gráficos impresos y si el SVG y el editor deben coincidir.
4. **Lectura en espejo (D6a, D6b).** La frase "la mayoría de las zurdas teje igual que las diestras" aparece en el ADR 0003 sin fuente citada. La pregunta la pone a prueba; en la hoja se presenta como pregunta, no como hecho.
5. **Crochet.** La fase 2 es solo palillo. Las proporciones 1,2 (punto bajo) y 0,6 (punto alto) están marcadas como supuestos en `packages/yarn-catalog/src/index.ts`. Además, `studio-texts.ts` (`muestra.supuestoCrochet`) dice que "todavía no hay muestra supuesta propia para crochet", pero `suggestedGauge(cat, "crochet")` sí la calcula. Inconsistencia a revisar.
6. **Tilde en "Súper" (A2).** Pendiente de decisión (glosario). Hoy "Super Fino" (cat. 1) sin tilde, "Súper Abultado" (cat. 6) con tilde y el alias "Super Grueso" sin tilde.
7. **"Trabar" (C6).** No está en el glosario pendiente. Si la tejedora lo elige, `experto-tejido` decide antes de usarlo en la interfaz.
8. **"2 juntos al derecho" (C7).** Solo aparecerá con la capa de símbolos (ADR 0003, sección 6). La pregunta no implica que el término esté en la fase 2.
9. **Tamaño 200 × 200 (G2).** Pendiente de `experto-tejido` (ADR 0003, enmienda E7).
10. **Anclaje del motivo (G3a).** El texto dice que el motivo "se ancla abajo a la izquierda". No se encontró en las fuentes leídas si la usuaria puede elegir otro anclaje. `ANCHORS` existe según el ADR (enmienda E5), pero no se leyó `packages/pattern-core` ni `apps/web` para confirmarlo. Verificar antes de la sesión.
11. **Plantillas (J1, J2).** Las fuentes leídas dan el nombre de las plantillas, pero no el número de puntos por vuelta que crean. La hoja no describe ese contenido. Verificar con el responsable de `/disenos/nuevo` (tarea T8) antes de la sesión.
12. **Canesú.** No se incluyó en la hoja, porque el editor de la fase 2 no lo ofrece (ADR 0003, sección 1; el texto `formas.yoke` sigue en `studio-texts.ts`).
13. **Umbrales de deformación (E9).** Los valores 0,6 y 1,6 son una heurística sin fuente (ADR 0005). La hoja no los expone; la pregunta solo evalúa la explicación.
14. **Privacidad de las respuestas.** Las fuentes no dicen cómo se guardan las respuestas de las tejedoras, ni si se publican o se asocian a un nombre. La hoja no pide nombre. Antes de la primera sesión, definir el tratamiento de las respuestas con la usuaria. El roadmap (fase 7 y decisión abierta) menciona la Ley 21.719, que entraría en vigencia el 1 de diciembre de 2026.
15. **Duraciones.** Las estimaciones de la sección 5 son de criterio, no mediciones. Conviene probar la hoja con una persona antes de la primera sesión y ajustar los tiempos.
16. **Ruta corta.** Las 40 preguntas prioritarias salen de las marcas "validar con tejedora" y de las decisiones abiertas del roadmap. La usuaria puede cambiar la selección.

# Revisión de tejido T21 (fase 4, 2026-11-16): revisión final de la lógica de tejido del estudio amigurumi (fase 4)

Revisión de solo lectura sobre `fase-4/grupo-e`. No modifiqué archivos. Las referencias de línea son las que leí hoy.

## Alcance y límites de esta revisión

- **Capturas de fibra:** vi 8 de los 14 PNG de `docs/capturas/fase-4/fibra-3d/`: algodón 3D y 2D, lana/mohair 3D, seda 3D y 2D, algodón/lurex 3D y 2D, y mohair 3D. Acrílico y "Colores planos" los juzgué por las métricas del documento.
- **CA4-V2 sigue sin poder cerrarse.** El repo solo trae las capturas de fibra, que son todas del fixture B. No hay capturas del cuerpo de 39 vueltas (fixture A), cilindro, panel plano, cambios de color, pieza que ondula ni muñeco armado. Sin ellas, el punto 8 se apoya en las pruebas numéricas y no en la vista.
- **Fuentes:** una búsqueda sobre "hilera" o "fila" no dio ninguna fuente que distinga el uso chileno. Esa decisión queda "validar con tejedora". No inventé equivalencias.

## Tabla de decisiones

| # | Punto | Decisión | Razón | Validar con tejedora |
|---|---|---|---|---|
| 1 | Muestra supuesta (BUG-QA4-1) | Manda la **lana inicial de cada parte**, no la A. El panel, el validador y la descripción deben usar la misma función que `metricsResolver`. | Una pieza mide lo que mide por la lana con que se teje. Un cuerpo en grosor 6 y unos ojos en grosor 1 no tienen la misma muestra. "Lana A" es solo el primer elemento de `yarns`, no la lana principal de la pieza. Es **regla física** (el tamaño del punto depende de la lana y del ganchillo) más una convención de respaldo. | No para la regla. Sí para los valores de `suggestedGauge`. |
| 2a | `maxRoundItems = 100` | Se **mantiene 100 para cerrar la fase 4** y se **sube a 200 antes de tapestry o de imagen a amigurumi (fase 5)**. | En amigurumi habitual una vuelta tiene entre 3 y 30 nodos (`[pb 3, aum] x6` son 3), así que 100 sobra. En tapestry irregular o en un gráfico venido de una imagen, cada cambio de color suma 2 nodos (`@B` y `pb N`). Una fila de 100 a 200 puntos con corridas de 1 a 3 puntos da entre 70 y 200 nodos. El `limits.ts` dice que subir un tope después es compatible y bajarlo no, así que empezar en 100 es lo seguro. Pasar a 200 solo cuesta `maxLineLength: 4_000` (unos 0,6 ms). | Sí, con 2 o 3 tejedoras de tapestry. |
| 2b | Grupo que solo cambia de lana (`[@A] x5`) | **Advertencia, no error.** Aviso nuevo, por ejemplo `GROUP_COLOR_ONLY`, con `times ≥ 2` y sin ningún punto en el subárbol. Un `@B` suelto, o un grupo de `times` 1, sigue válido. | Repetir un cambio de lana no teje nada: solo importa el último. Pero un `@B` al final de una vuelta es legítimo (prepara la lana de la vuelta siguiente), y como error estructural estorbaría al editar por bloques. La defensa de T20-A1 en `written.ts` y el tope de trabajo siguen protegiendo contra el documento hostil. | No. Es criterio de dominio. |
| 2c | `[[pb] x100] x500` da LIMIT (trabajo 50.501) con 50.000 puntos | **No importa en la práctica; no cambiar el comportamiento.** | Una vuelta de 50.000 puntos es 250 veces el límite recomendado (200). El único efecto raro es que el máximo efectivo con grupos anidados queda en unos 49.500 puntos, no en 50.000. Mejora opcional: documentarlo, o separar `maxRoundWork` (por ejemplo 100.000) de `maxRoundStitches`. | No. |
| 3a | Avisos de forma solo si la vuelta cambia el conteo en el mismo sentido, uno por vuelta escrita (T5-3) | **Aprobada.** | El ondulado o el fruncido se produce en la vuelta que aumenta o disminuye de más. Una vuelta de `60 pb` posterior no ondula nada nuevo. Avisar en cada vuelta siguiente repetiría un solo hecho físico. | No. |
| 3b | `invdec`, `sk`, `skip` solo en `es-us` (T6-3) | **Compartirlos con `es-uk`.** | `invdec` nombra una técnica, no una abreviatura de dialecto. `sk` y `skip` significan lo mismo en UK. La regla RT5 permite compartir un alias que significa lo mismo, y la estrictez se justifica solo donde cambia el significado (`sc`, `dc`, `tr`). `formatPart` sigue escribiendo `miss` en UK. | `miss` frente a `skip` en UK: sí (ya estaba pendiente). |
| 4 | `newRoundAt` (T15-4) | **Aprobada.** | Copiar el conteo que deja la vuelta anterior es lo que hace una vuelta de meseta en pb, y no inventa un `expected` (regla de oro 6). Con inicio libre (anillo mágico) 6 es el valor más habitual (F4-2). Bien resuelto: rango, tomando la última vuelta concreta; hileras, con `count − 1`. Borde menor, sin importancia hoy: con más de 5.000 puntos en la anterior, el pb N supera `maxItemCount`. | No, pero 6 como valor por omisión es convención. |
| 5 | "fila" o "hilera" (F4-16) | En **crochet y amigurumi: "hilera"**. En colorwork y palillo se mantiene "fila" (F3-9). | Ya es lo que usan la sintaxis (`H2`, `Construcción: hileras`) y `describe-written.ts:178`. Hoy la misma pantalla dice "hilera" en la descripción y "fila" en los avisos del validador: eso es el error real. Ambas palabras son comunes en español y no hay fuente que dirima para Chile. Que el glosario configurable lleve una clave por técnica. | **Sí** (hoja T1b, ítem 4). |
| 6 | Capturas de fibra (CA4-V8) | **Aceptables como aproximación v1.** El orden de brillo y de halo entre fibras es coherente con el 2D y con el oficio. Dos advertencias en el análisis de abajo. | Ver "Capturas de fibra". | **Sí**, todos los niveles. |
| 7 | Textos `// validar con tejedora` | Cuatro correcciones concretas (C3 a C5 abajo) y el resto se mantiene. | | Sí, los que sigan. |
| 8 | Forma y calibración (A y B) | **Aprobado en números.** Visualmente, solo el fixture B (esfera). | `profile.test.ts` fija A en 8,33 cm de alto y razón 0,87 (tambor de tapas planas) y B en 10,1 cm de alto con razón entre 0,95 y 1,15. Con 1,25 y ρ = 1,2 el disco de 6 aumentos de pb no avisa y desde 7 sí. En las capturas, B se lee como esfera. | **Sí**, ítems 8 y 10. |

## Análisis de los puntos con más sustancia

### Punto 1: cómo se corrige BUG-QA4-1
- **Validador:** `ValidateOptions` toma hoy una sola muestra supuesta (`assumedGauge` y `assumedGaugeStitch`, con `weightCat` de respaldo, `validate.ts:35-48` y `:504`). Falta una opción por parte, por ejemplo `assumedGaugeOf?: (part) => { gauge; stitch } | undefined`. Eso es de `motor-patrones`.
- **Función única:** esa resolución debe salir de la misma función que usa `metricsResolver`: lana inicial de la parte, `yarns[0]` si no existe, y grosor 4 si no hay grosor. Hoy el validador, ante un grosor no numérico, cae a la tabla interna sin supuesto y las medidas caen a la categoría 4. Es otra divergencia de BUG-QA4-1.
- **Efecto por tipo de aviso:** los avisos de forma dependen solo de ρ (la razón entre vueltas y puntos), que cambia poco entre categorías. Las medidas en cm sí cambian el doble. Por eso el síntoma visible es la lista de medidas frente a la descripción.
- **Mejora sugerida (dos avisos informativos nuevos):**
  - Si una parte usa lanas de grosores distintos, "la muestra se toma de la lana con que empieza la parte".
  - Si el diseño trae muestra propia y las partes empiezan con lanas de grosores distintos, "esta muestra se aplica a todas las partes". Con la muestra del documento hoy no se distingue y una sola medición vale para una sola lana.

### Punto 6: capturas de fibra
- **Algodón y acrílico idénticos.** Lo reconoce el propio documento. Aceptable, con la nota de que el acrílico real suele verse algo más liso o brillante.
- **Mohair 100 % en 3D.** Se ve como una esfera lisa y casi sin punto, con contraste local 1,7 igual que "Colores planos". Se lee como látex y no como pelusa. El 70/30 con lana se ve bien, pelusa suave y borde claro. El 100 % mohair es raro en amigurumi, así que no bloquea, pero el aviso de prototipo debe decir que **la pelusa no se dibuja** y hoy solo dice "halo y brillo… aproximación visual".
- **Seda.** Los destellos recorren la hilera del punto y se lee satinada, algo vinílica en el borde. Aceptable. Es la más brillante, como corresponde.
- **Lurex 85/15.** Casi no se distingue del algodón en 3D (p98 58 frente a 51) ni en 2D (90 frente a 85). Es un límite conocido de la ponderación lineal. Un lurex real brilla con puntos de luz aunque sea poco porcentaje. No es una falla de orden, pero la vista no muestra el efecto. Mejora sugerida: efecto de destello no lineal con el porcentaje de lurex. T1b.
- **Observación fuera del plan:** el relieve 2D y 3D es de punto en V (tipo jersey de palillo). El pb de crochet en espiral tiene una V inclinada con barra horizontal. Para amigurumi es una aproximación. Va a T1b: ¿se parece al pb?
- **Observación en la esfera (fixture B):** las 7 capturas 3D muestran arriba una **lengüeta plana** asimétrica que no parece un cierre de 6 puntos. Si es la última vuelta abierta (F4-35), conviene revisar la malla en `/dev/visor-3d`. Una esfera cerrada no debería tener esa tira.

## Correcciones concretas (archivo y texto)

**C1 (error de dominio). BUG-QA4-1.** Archivos:
- `apps/web/src/lib/amigurumi/review.ts:17-25` (`writtenValidateOptions`).
- `apps/web/src/components/amigurumi/WrittenStudio.tsx:192-195`.
- `apps/web/src/lib/amigurumi/texts.ts:197`.

Pasos:
1. Mover `weightOf` y `suggestedGauge` de `metrics.ts:22-35` a un módulo compartido.
2. Que el validador y `describeWritten` reciban la muestra por parte.
3. Cambiar `texts.ts:197` a:
   `Muestra supuesta: ${n(st)} puntos y ${n(rw)} vueltas en 10 cm, según el grosor de la lana con que empieza esta parte.`
   y, si las partes difieren, mostrarla por parte.

**C2 (ambigüedad terminológica). "hilera" en crochet.** Archivo `packages/pattern-core/src/validate.ts`:
- `:823-824`: `const partRowWord = (construction: unknown) => (construction === "flat" ? "hilera" : "vuelta");`
- `:927`: "…en filas (ida y vuelta)" pasa a "…en hileras (ida y vuelta)".
- `:961`: "las filas suelen empezar con una cadeneta base" pasa a "las hileras suelen empezar con una cadeneta base".
- `rowWord` (`:498-499`, gráficos de colorwork) queda en "fila".
- Hay que actualizar las pruebas que fijan "fila" para partes `flat` (por ejemplo `qa-fase4.test.ts`, caso O-QA4-1).

**C3 (ambigüedad terminológica). "aguja" frente a "ganchillo" en crochet.** `texts.ts:196` dice "ganchillo" y estos cuatro dicen "aguja":
- `packages/viewer-3d/src/scene.ts:117`, `GAUGE_ASSUMED`: "Teje una muestra con tu lana y tu ganchillo para comprobarlas."
- `packages/pattern-render/src/describe-written.ts:269`: "…teje una muestra con tu lana y tu ganchillo…"
- `apps/web/src/components/amigurumi/texts.ts:11`: "…teje una muestra con tu ganchillo para comprobar."
- Tres pruebas fijan esas frases literales y hay que cambiarlas también:
  - `test/viewer-3d-adaptador.test.ts:247`.
  - `test/qa-fase4.test.ts:136`.
  - `e2e/webgl.spec.ts:50`.
- Añadir al aviso de prototipo: "La pelusa del mohair y de las lanas peludas no se dibuja."
- `packages/glossary/src/terms.ts:107` (muestra) es común a palillo y crochet. Queda "tu aguja" y se señala como pendiente. Sugerencia: "con tu lana y tu aguja o ganchillo".
- Si T1b prefiere "aguja de crochet", el cambio es una sola búsqueda en esos archivos. El término sale del glosario y no del código.

**C4 (error de dominio menor). Zona de forma en el 3D.** `packages/viewer-3d/src/scene.ts:236-241`.
- `zone` usa solo la primera y la última vuelta. Con vueltas con aviso no contiguas, por ejemplo [3, 5], dice "entre la vuelta 3 y la 5" e incluye la 4. Debe agrupar por tramos contiguos, o listar "en las vueltas 3 y 5" si no son contiguas.
- Restaurar al final de ambos textos la frase que propuse en F4-77 y F4-78: "Si es lo que buscas (volante, pétalo, remate), ignora este aviso." Sin ella, el cierre habitual de una pieza (`dism x9` sobre 18) parece un error del patrón.

**C5 (mejora). Textos de ayuda.** `apps/web/src/lib/amigurumi/texts.ts`:
- `:65`: reemplazar "Una base ovalada se escribe con «Inicio: AM» y todos sus puntos en la V1: el 3D la dibuja redonda." por "Una base ovalada se escribe con «Inicio: AM» y todos sus puntos en la V1: el 3D la dibuja redonda y puede aparecer un aviso informativo por la cantidad de puntos del anillo, que es esperado." Razón: `MAGIC_RING_UNUSUAL` sale con más de 12 puntos y una base oval tiene 14 o más.
- `:68`: reemplazar por "Abreviaturas: inglés del Reino Unido (UK). Ojo: en UK «dc» es el punto bajo; en US «dc» es el punto alto y el punto bajo es «sc». Aquí «sc» da error. Se leen también las del español."
- `:257`: reemplazar por "Las vueltas (o hileras) se cuentan desde el anillo mágico, la cadeneta inicial o la cadeneta base, no desde el cuello ni desde el marcador."
- `:274`: agregar al final "Si la lana nueva es de otro grosor, cambian las medidas de la pieza."

**C6 (ambigüedad terminológica). Alias.** `packages/pattern-core/src/stitches.ts`:
- `:105`: `uk: ["dec", "dc2tog", "invdec"]`.
- `:109`: `uk: ["miss", "sk", "skip"]`.
- El formateador sigue escribiendo `miss` en UK.
- Actualizar la fila T6-3 del ADR 0011 y la prueba RT5.

**C7 (mejora). Grupo solo de lana.** `written.ts:32`: reemplazar "Pendiente de `experto-tejido`…" por "Decisión T21: aviso, no error". Agregar el aviso `GROUP_COLOR_ONLY` (advertencia) en `checkItems`, con este texto:
"Este grupo solo cambia de lana y no teje ningún punto; solo cuenta el último cambio. Quita el grupo o agrega puntos."

**C8 (documentación). Topes.**
- `limits.ts:33`: reemplazar "validar con experto-tejido: ¿alcanzan 100?" por "T21: 100 alcanza para amigurumi; subir a 200 (con `maxLineLength` 4.000) antes de tapestry o imagen a amigurumi".
- Opcional: documentar en el mismo archivo que, con grupos anidados, el máximo efectivo es de unos 49.500 puntos.

## Lo que queda abierto para T1b

Se suman a los ítems 1 a 26 de la hoja:
- **"Hilera" o "fila"** en crochet (ítem 4, ahora con una propuesta concreta).
- **Muestra por parte:** que una sola muestra del diseño sirva para partes de lanas de grosores distintos.
- **"Ganchillo" o "aguja de crochet"** en los textos de amigurumi.
- **Relieve en V** del pb en el 3D y el 2D.
- **Lurex** casi invisible a 15 %, y mohair 100 % que se ve liso.
- **Aviso de grupo solo de color:** ¿se entiende?
- **Aliases UK:** `miss` frente a `skip`, y los tres compartidos.
- **Base ovalada con anillo mágico** (ítem 20): ¿el aviso informativo estorba?
- **`maxRoundItems`:** si 100 basta para tapestry, antes de fase 5.
- **Capturas CA4-V2 faltantes:** hay que generarlas y revisarlas.

## Aprobación

- **Aprobado con condiciones.** En lo de tejido, apruebo los puntos 2 (decisiones propias), 3, 4 y 8 (en números). Apruebo el 6 como aproximación v1, con C3.
- **Condiciones para cerrar el código de la fase 4:** aplicar C1 (BUG-QA4-1), C2 (hilera), C3 (ganchillo y pelusa) y C4. Además, entregar las capturas faltantes de CA4-V2: el fixture A, el cilindro, el panel, los cambios de color, la pieza que ondula y el muñeco armado. Las vuelvo a revisar y cierro CA4-V2.
- **La aprobación final de dominio queda abierta, como en la fase 3.** Es la resolución (a) del roadmap: todo lo "validar con tejedora" se cierra en la ronda T1b, y nada se publica sin ella. No apruebo sin T1b por mi cuenta los valores que dependen de la tejedora: `STITCH_HEIGHT_FACTOR`, la tolerancia de 1,25, ρ = 1,2, los niveles de fibra, el término "hilera" ni la cantidad de puntos del anillo mágico.

Archivos de referencia (rutas absolutas):
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/packages/pattern-core/src/validate.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/packages/pattern-core/src/stitches.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/packages/pattern-core/src/limits.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/packages/pattern-core/src/written.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/packages/viewer-3d/src/scene.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/packages/pattern-render/src/describe-written.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/apps/web/src/lib/amigurumi/review.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/apps/web/src/lib/amigurumi/texts.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/apps/web/src/components/amigurumi/metrics.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/apps/web/src/components/amigurumi/texts.ts`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/apps/web/src/components/amigurumi/WrittenStudio.tsx`
- `/Users/krlos/Documents/workspace/claude/LoopitaLab/docs/casos-dominio-fase-4.md`

Sources:
- Craft Yarn Council, terminología US y UK de crochet (abierta en T1): https://www.craftyarncouncil.com/standards/crochet-abbreviations
- Búsqueda sobre el uso de "hilera", "fila" y "vuelta": sin una fuente que distinga el uso chileno; las que aparecieron (por ejemplo https://design.tutsplus.com/es/articles/como-leer-un-patron-de-crochet--cms-20601) solo confirman que se usan "fila" e "hilera" en plano y "vuelta" en redondo.

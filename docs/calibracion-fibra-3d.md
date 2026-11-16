# Calibración del aspecto por fibra en el 3D (T11c, fase 4)

ADR 0010, sección 6b; criterio CA4-V8. El 3D y el 2D parten del mismo `yarnLook` (niveles de `fibras.json`: 0 / 0,5 / 1). Esta calibración ajusta cómo el 3D traduce esos tres números a luz, para que el **orden** de brillo y de halo entre fibras sea el del 2D. Es una aproximación visual: no promete la lana real.

## Cómo se generó

- 3D: `/dev/visor-3d` (fixture B, una esfera) con la lana A en `#BA222C` y solo cambia la composición. Muestras en `FIBER_SAMPLES` (`apps/web/src/app/dev/visor-3d/demo-patterns.ts`; se agregó 85/15 algodón y lurex).
- 2D: página nueva `/dev/fibras-2d` (protegida como el resto de `/dev`: `devPagesEnabled`, `noindex`, sin sesión), con `stitch-render` y el mismo color: un tubo de 12 × 10 puntos por lana.
- Captura y métricas: prueba `calibración` de `apps/web/e2e/webgl.spec.ts` (proyecto `webgl`, SwiftShader). `E2E_CAPTURAS_DIR=<dir>` guarda los PNG; el brillo de cada captura se mide en la propia prueba (luminancia de los píxeles de la lana).
- Las capturas se hicieron con SwiftShader en macOS; los valores absolutos dependen de la luz de la escena, por eso se comparan solo órdenes y diferencias contra el algodón.

## Constantes

| Constante | Antes | Después | Razón |
|---|---|---|---|
| `ROUGHNESS_BASE` | 0,85 | 0,85 (sin cambio) | Es el material neutro (prueba "neutro = base"); no hay razón visual para moverlo y cambiarlo mueve todas las lanas, incluidas las de "Colores planos". |
| `FIBER_SHEEN_ROUGHNESS` | 0,45 | 0,40 | Con 0,45 la seda (brillo 1) quedaba con destellos casi de plástico, sobre todo en las vueltas altas. Con 0,40 sigue siendo la más brillante (percentil 98 de luminancia 124 frente a 111 del mohair puro) sin perder el punto. |
| `FIBER_HALO_RIM` | 0,55 | 0,35 | Con 0,55 la mezcla 70/30 lana y mohair (halo 0,3) subía el borde y los destellos más que el brillo de un lurex (en el 2D no pasa: el halo no aclara tanto). Con 0,35 el halo se ve como un borde difuso y el orden de destellos coincide con el 2D. |
| `FIBER_HALO_SOFTEN` | 0,7 | 0,7 (sin cambio) | Probé 0,8 y 0,85: el mohair puro perdía el dibujo del punto, y en el 2D el punto sigue legible bajo el halo. |
| `FIBER_DEFINITION_RELIEF` | 0,8 | 1,0 | La diferencia de relieve entre algodón o acrílico (definición 1) y mohair (0) era poco visible; con 1,0 el relieve del algodón es el doble que el de "Colores planos" y el del mohair, un tercio. |
| `FIBER_SHEEN_SPECULAR` | 0,6 | 0,6 (sin cambio) | Fuera del alcance de la tarea; no hizo falta. |
| `FIBER_HALO_FRESNEL_POWER` | 3 | 3 (sin cambio) | Idem. |

Con el aspecto neutro, el píxel sigue siendo el del material base (las constantes de fibra se multiplican por 0, y `ROUGHNESS_BASE` no cambió).

## Medidas (lana roja `#BA222C`)

Luminancia 0-255 de los píxeles de la lana: media, percentil 98 (destellos), borde (a 5 px de la silueta) y contraste local entre píxeles vecinos del centro. Cada captura es del mismo color; solo cambia la composición.

| Lana | 3D media | 3D p98 | 3D borde | 3D contraste | 2D media | 2D p98 | 2D contraste |
|---|---|---|---|---|---|---|---|
| 100 % algodón | 37,3 | 51,7 | 35,5 | 2,9 | 46,2 | 84,6 | 9,6 |
| 100 % acrílico | 37,3 | 51,7 | 35,5 | 2,9 | 46,2 | 84,6 | 9,6 |
| 70/30 lana y mohair | 46,2 | 74,2 | 57,9 | 2,3 | 55,4 | 90,8 | 8,5 |
| 100 % seda | 41,4 | 124,3 | 33,4 | 7,8 | 59,5 | 155,7 | 23,8 |
| 85/15 algodón y lurex | 38,7 | 58,1 | 35,4 | 3,6 | 47,5 | 90,2 | 10,7 |
| 100 % mohair | 59,2 | 110,5 | 87,7 | 1,5 | 75,9 | 112,1 | 11,6 |
| "Colores planos" | 38,1 | 51,7 | 35,7 | 1,6 | 50,7 | 85,2 | 8,6 |

Lectura:

- **Brillo (destellos, p98)**: orden en el 3D seda > mohair > lana/mohair > lurex > algodón = acrílico; en el 2D, seda > mohair > lurex ≈ lana/mohair > algodón = acrílico. La única diferencia es lurex y lana/mohair, que tienen el mismo brillo (0,15) y casi el mismo valor en el 2D; en el 3D la mezcla con mohair queda más arriba por el halo.
- **Halo (borde frente al algodón)**: mohair > lana/mohair > resto, en ambos.
- **Definición**: algodón, acrílico y seda (1) más marcados que lana/mohair (0,35) y mohair (0). El 3D lo traduce en el contraste local.
- **Colores planos**: en 3D, igual que el algodón sin relieve extra y sin halo ni brillo; en 2D, el tubo sin sombra de fibra.
- **Diferencias que quedan** (no son fallas de orden): en 3D la media de la seda queda debajo de la lana/mohair (en el 2D, encima) porque el 3D aclara por el borde y no rellena el punto; el mohair puro en 3D tiene casi el mismo contraste que "Colores planos" (el 2D dibuja pelos que el 3D no tiene: la v1 no usa pelaje, ADR 0010).

Las capturas 3D se regeneraron tras corregir la lengüeta de la esfera (cierre en espiral continua, commit c4ab055); las cifras cambian en menos de 1 punto y el orden entre fibras es el mismo. Las capturas 2D no cambian.

## Capturas

3D (`docs/capturas/fase-4/fibra-3d/`) y 2D de la misma lana:

| Lana | 3D | 2D |
|---|---|---|
| 100 % algodón | [calib-3d-algodon.png](capturas/fase-4/fibra-3d/calib-3d-algodon.png) | [calib-2d-algodon.png](capturas/fase-4/fibra-3d/calib-2d-algodon.png) |
| 100 % acrílico | [calib-3d-acrilico.png](capturas/fase-4/fibra-3d/calib-3d-acrilico.png) | [calib-2d-acrilico.png](capturas/fase-4/fibra-3d/calib-2d-acrilico.png) |
| 70/30 lana y mohair | [calib-3d-lana-mohair.png](capturas/fase-4/fibra-3d/calib-3d-lana-mohair.png) | [calib-2d-lana-mohair.png](capturas/fase-4/fibra-3d/calib-2d-lana-mohair.png) |
| 100 % seda | [calib-3d-seda.png](capturas/fase-4/fibra-3d/calib-3d-seda.png) | [calib-2d-seda.png](capturas/fase-4/fibra-3d/calib-2d-seda.png) |
| 85/15 algodón y lurex | [calib-3d-algodon-lurex.png](capturas/fase-4/fibra-3d/calib-3d-algodon-lurex.png) | [calib-2d-algodon-lurex.png](capturas/fase-4/fibra-3d/calib-2d-algodon-lurex.png) |
| 100 % mohair (extremo) | [calib-3d-mohair.png](capturas/fase-4/fibra-3d/calib-3d-mohair.png) | [calib-2d-mohair.png](capturas/fase-4/fibra-3d/calib-2d-mohair.png) |
| Colores planos | [calib-3d-colores-planos.png](capturas/fase-4/fibra-3d/calib-3d-colores-planos.png) | [calib-2d-colores-planos.png](capturas/fase-4/fibra-3d/calib-2d-colores-planos.png) |

## Informe de cobertura de fibras (`catalogo-lanas`)

Fuente de `fibras.json`: filtros públicos de composición de tres tiendas (3 de noviembre de 2026); las propiedades son "orientaciones generales del oficio", ya marcadas para validar con `experto-tejido`. Los niveles `halo`, `brillo` y `definicion` no tienen una fuente medible: son una escala de tres pasos, por lo que **todos** los niveles se tratan como "validar con tejedora" (T1b).

| Fibra habitual en amigurumi | ¿Está? | Niveles (halo / brillo / definición) | Observación |
|---|---|---|---|
| Algodón | Sí | bajo / bajo / alta | La nota dice que el mercerizado tiene brillo: el catálogo no distingue mercerizado. Validar con tejedora. |
| Acrílico | Sí | bajo / bajo / alta | Algodón y acrílico dan el mismo aspecto; en la realidad el acrílico suele verse algo más brillante. Validar con tejedora. |
| Poliéster | Sí | bajo / medio / media | Base de hilados tipo felpa o chenilla, pero el catálogo no describe esos hilados. |
| Mezclas (por ejemplo, algodón y acrílico, lana y mohair) | Sí, por porcentaje | promedio ponderado lineal | La ponderación lineal de porcentajes chicos de mohair o lurex es una hipótesis sin fuente (F3-35). Validar con tejedora. |
| Lana, merino, alpaca, mohair, seda, lino, bambú, viscosa, yute, lurex, poliamida | Sí | ver `fibras.json` | Poliamida: el propio archivo la marca "pendiente de validación". |
| **Chenille (chenilla)** | **No** | n/a | Es una **construcción** del hilado (hebras sujetas por un hilo central), no una fibra: puede ser de algodón, poliéster u otra. Su aspecto (aterciopelado, sin definición de punto) no sale de la composición. No se agregó nada sin fuente. |
| Tipo felpa / velour / "plush" | No | n/a | Mismo caso que el chenille: construcción. |
| Hilos con pelo largo o de fantasía | No | n/a | Idem; hoy solo se cubre el mohair. |
| Algodón mercerizado | No como fibra | n/a | Es un acabado del algodón. |

Conclusión: los niveles cubren las fibras de uso habitual en amigurumi (algodón, acrílico, poliéster y sus mezclas), con valores que son una escala cualitativa por validar. Quedan **fuera** las construcciones (chenille, felpa) y los acabados (mercerizado).

### Pendientes propuestos para T1b (no agregados)

1. Decidir si "construcción del hilado" (chenille, felpa, bouclé, cordón) y "acabado" (mercerizado, superwash) son un campo aparte de la composición, con su fuente; hoy no hay dónde guardarlos, y modelarlos como fibra sería inventar.
2. Validar con tejedoras los niveles de las fibras de amigurumi (algodón, acrílico, poliéster) y la ponderación lineal de las mezclas.
3. Si se agrega una construcción, definir cómo cambia el aspecto (en 2D y en 3D); sin eso el 3D no puede distinguir un chenille de un poliéster.
4. Ajustar, si hace falta, la escala 0 / 0,5 / 1 (`FIBER_LEVELS`): el ADR 0008 la dejó "salvo que la revisión visual pida otra". Esta calibración mantuvo la escala y ajustó solo las constantes del 3D.

## Para la validación con tejedoras ("¿se parece el 3D a la lana real?")

Mostrar cada par de capturas (o el visor y `/dev/fibras-2d`) y preguntar:

- [ ] El algodón y el acrílico se ven iguales: ¿es aceptable, o el acrílico debería verse más liso o brillante?
- [ ] El mohair (70/30 y puro): ¿el borde difuso y el punto suavizado se parecen a un mohair real? ¿Hace falta pelo visible?
- [ ] La seda: ¿el brillo se ve a seda, o a plástico?
- [ ] El lurex en 85/15: ¿el destello se parece a un hilo metalizado? Un lurex real brilla con puntos de luz, no con un brillo general.
- [ ] "Colores planos": ¿es reconocible como el color sin efecto de fibra?
- [ ] ¿El orden de brillo y de halo entre las lanas coincide con lo que ven en sus ovillos?
- [ ] ¿Qué fibras o hilados de amigurumi faltan (chenille, felpa, algodón mercerizado)?
- [ ] ¿La mezcla de porcentajes chicos (por ejemplo, 5 % de mohair o de lurex) se ve como la real?

## Limitaciones

- Las capturas usan una sola luz y un solo color; un color muy claro o muy oscuro reduce o exagera el halo.
- Valores medidos en SwiftShader, no en GPU.
- Sin pelo, sin pelaje y sin hilado de construcción distinta (ADR 0010).

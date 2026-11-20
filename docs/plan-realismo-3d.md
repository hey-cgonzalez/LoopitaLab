# Plan: visor 3D amigurumi con aspecto de lana real

- Creado: 2026-11-19 · Estado al 2026-11-20: **R0 hecho (borrador para validar con fotos); R1 y R2 sin empezar en código**
- Agente principal: `visor-3d` (opus). Revisan `experto-tejido`, `catalogo-lanas`, `qa-tester` y `ux-accesibilidad`; `arquitecto` registra las enmiendas del ADR 0010.
- Referencia de dominio: [`docs/referencia-pb-3d.md`](referencia-pb-3d.md).

## Estado y cómo continuar

| Fase | Estado | Rama |
|---|---|---|
| R0. Referencia del pb | Borrador hecho (`docs/referencia-pb-3d.md`). Falta validarlo con fotos de la usuaria (lista en su sección 5) | `render-3d/r0-referencia` |
| R1. Escena e iluminación | Sin empezar. Encargo listo más abajo | crear `render-3d/r1-escena` desde `main` |
| R2. Borde y remate | Sin empezar. Encargo listo más abajo | crear `render-3d/r2-bordes` desde esta rama (usa el doc de R0) |
| R3 a R7 | Pendientes. R3 espera las fotos de R0 | — |

R1 y R2 pueden ir en paralelo (archivos distintos: R1 toca `three/renderer.ts`, `constants.ts` y `material.ts`; R2 toca `mesh.ts` y lo puro). Cada uno termina con `qa-tester` y con la enmienda del ADR 0010 que redacta `arquitecto`.

Nota de entorno: en la sesión web donde se armó este plan no había acceso a npm, así que no se pudieron correr las pruebas de `three`, los tipos ni el E2E. En Claude Code local, con `pnpm install`, sí se puede.

## 1. Qué hay hoy en el código (main `fc8a5dd`)

| Pieza | Estado actual | Archivo |
|---|---|---|
| Forma | Superficie de revolución sin relleno ni tensión: piezas simétricas, sin abombado | `mesh.ts`, ADR 0010 §2 |
| Malla | Un cuadrilátero o abanico por punto, vértices propios (color nítido), uv de 0 a 1 por punto, normales analíticas lisas | `mesh.ts` |
| Relieve | Mapa de normales procedural de 64 × 64 con dos lóbulos altos ("V" de jersey), sin desplazamiento, parallax ni oclusión | `three/normal-map.ts` |
| Material | `MeshStandardMaterial` con `onBeforeCompile`. Brillo simulado con rugosidad y especular; halo como borde de Fresnel. `DoubleSide` | `three/material.ts`, `three/constants.ts` |
| Luz | `HemisphereLight` y una `DirectionalLight` pegada a la cámara. Sin entorno, sombras ni oclusión ambiental | `three/renderer.ts:136-143` |
| Remate | Última vuelta abierta; en espiral, rampa que termina en un escalón del alto de la vuelta (la "ranura") | `mesh.ts`, README "Remate" |
| Niveles de detalle | `relief` hasta 20.000 puntos, `smooth` después, siluetas sobre 200.000. Todo en el hilo principal | `three/policy.ts` |
| Reglas del ADR 0010 | Sin `drei`. Sin pelaje por capas ni `sheen` físico (se reevalúan con medición). Sin sombras en la v1. E2E "neutro = material base" con 0 píxeles distintos | ADR 0010 §6b y alternativas |

Infraestructura para medir: `setMaterialVariant` (A/B), `stats`, `/dev/visor-3d`, `apps/web/e2e/medir-visor-3d.ts`, `latencia-visor.spec.ts` (CA4-P1 a P10) y la prueba de calibración de `webgl.spec.ts`.

## 2. Restricciones

1. Regla de oro 7: CA4-P1, P8 y P10 siguen cumpliendo; cambiar un color sigue siendo subir solo el rango de `yarn`.
2. Regla de oro 1: el modelo canónico no cambia; todo se deriva y es determinista (semilla de parte, vuelta y punto).
3. Contratos que se mantienen: G7 (prefijo con `limit`), G12 (`reuse`), `pick`, `faceStitch`, resaltado por `gl_VertexID`, `surfaceFrame`. Si alguno cambia, se redefine de forma explícita con su prueba y su enmienda.
4. Lo que el ADR 0010 descartó entra solo como enmienda con medición.
5. Primero lo que trae `three` 0.186 en `addons` (`RoomEnvironment`, `PMREMGenerator`, `GTAOPass`, `AgXToneMapping`); nada de `drei` ni `postprocessing` sin justificarlo en el PR.
6. Regla de oro 9: fotos de muestras propias, sin marcas.

## 3. Fases

- **R0. Referencias.** Fotos de la usuaria y especificación de `experto-tejido` (hecha como borrador). Métrica nueva en la calibración: periodo y contraste del relieve contra la foto.
- **R1. Escena e iluminación.** Entorno `RoomEnvironment` + PMREM, luz principal y relleno, sombra de contacto horneada (se rehace solo al cambiar la geometría), sombras propias preparadas pero apagadas, constante para comparar AgX y ACES.
- **R2. Bordes y remate.** Tubo de borde en vueltas abiertas (d ≈ 0,35 × ancho del punto, supuesto), remate típico sin escalón en la parte completa, escalón conservado con `limit`.
- **R3. Punto bajo convincente.** Nuevo campo de alturas según `referencia-pb-3d.md` §1.2, a 256 px, cavidad oscurecida, textura de cabos, variación por punto (atributo `seed`), deriva de la espiral (signo según foto; espejo para zurdos) y parallax solo en `relief`.
- **R4. Material y halo.** A/B `MeshPhysicalMaterial` con `sheen`, brillo a lo largo de la hebra, destellos de lurex, pelaje por capas solo con halo ≥ 0,5 en calidad alta. Se rehace `calibracion-fibra-3d.md` contra las fotos.
- **R5. Relleno (ADR 0015).** Inflado de piezas cerradas en un *worker*, asimetría por aumentos de un lado, anclas sobre la malla inflada; una pieza a medias no se infla.
- **R6. Hebra geométrica de cerca** (opcional, solo si R3 no alcanza).
- **R7. Calidad adaptativa y validación.** Selector de calidad, reducción de movimiento, prueba ciega con tejedoras y mediciones de rendimiento.

Orden: R0 → R1 y R2 en paralelo → R3 → R4 → R5 → R6 si hace falta; R7 transversal.

## 4. Encargo para R1 (`visor-3d`, opus)

Objetivo, sin tocar la geometría de la malla:
1. `scene.environment` con `RoomEnvironment` + `PMREMGenerator` (import de addons como el `OrbitControls` de la app), con intensidad en una constante.
2. Luz principal y relleno. Decidir si la principal sigue a la cámara o queda fija y justificarlo (si queda fija, el lado de atrás no puede quedar negro).
3. Sombra de contacto horneada: plano bajo la pieza con textura suave (render ortográfico desde abajo a un `WebGLRenderTarget` de 256² como máximo, más desenfoque en dos pasadas). Se recalcula solo cuando cambia la geometría o los `bounds`, no con `setLooks`, el recoloreo ni el resaltado. Fuera de `pick` y `bounds`, idéntica en las dos variantes de "neutro = base", liberada en `dispose()` y sin subir nada en modo `silhouettes`.
4. `shadowMap` apagado por defecto, preparado detrás de una constante.
5. Tone mapping sin cambiar; constante y nota para comparar AgX y ACES.
6. Constantes nuevas en `constants.ts`, marcadas "valor inicial, calibrar en R4".

No se puede romper: los dos programas (`relief` y `smooth`) compilados al montar, con el entorno ya puesto en `gl.compile`; `pick`, `setHighlight`, `snapshot` (con entorno y sombra), A/B, `stats`, `dispose` (restaurar el `scene.environment` previo); sin trabajo extra por edición; sin dependencias nuevas. Pruebas en `test/three.test.ts`; revisar las aserciones de la calibración E2E. Actualizar el README y proponer la enmienda del ADR 0010 §6 (R1-1…).

## 5. Encargo para R2 (`visor-3d`, opus)

En la parte pura (`buildPartMesh`), según `referencia-pb-3d.md` §3 y §4:
1. **Borde con volumen** en toda vuelta abierta (última vuelta de una parte en revolución; borde superior del panel en hileras, y decidir los costados). Tubo de alto ≈ d y grosor radial ≈ 2d, con una pinza de ≈ 0,2 d en cada límite de punto. `d = RIM_YARN_TO_STITCH_RATIO × ancho del punto`, con valor inicial 0,35 marcado como supuesto. Sección de pocos segmentos (unos 6); medir el aumento de vértices. `faceStitch` y `yarn` del punto al que pertenece (`colorizePartMesh` lo recolorea). Uv que no deformen el relieve del punto sobre el tubo.
2. **Remate**: parte completa sin `limit` → remate invisible (los últimos 2 a 3 puntos bajan hasta dejar el borde sin escalón; cantidad en una constante). Con `limit` → se conserva el escalón y el borde sigue la hélice. Las vueltas unidas no tienen escalón. No cambia conteos ni el perfil.
3. Contratos: G7, G12, `roundStart`, `bounds`, `surfaceFrame` con `{ mesh }` y `attach: "end"`, hileras, `colorizePartMesh`, `shapeSignature` y `PART_TOO_LARGE`. Si G7 debe redefinirse (por ejemplo, que valga para la geometría de los puntos y el borde vaya al final), hacerlo de forma explícita con su prueba y su enmienda. `reuse` no debe arrastrar el borde viejo.
4. Pruebas de propiedades con semilla: el borde existe solo donde hay vuelta abierta; sin triángulos degenerados, área invertida ni NaN; sin salto en el remate típico; escalón con `limit`; color y `faceStitch` del borde. La guardia `perf.test.ts` sigue bajo el presupuesto (10 ms con el fixture A).
5. Si el backend necesita más capacidad de búferes, cambio mínimo.
6. Actualizar el README (Malla, Remate, Limitaciones) y proponer la enmienda del ADR 0010 (R2-1…).

## 6. Skills y recursos

- `cloudai-x/threejs-skills` (shaders, materiales, texturas, postproceso, geometría): instalar en local después de revisar el contenido y la licencia.
- `MengTo/3d-cloth-material`: solo como referencia (tela de telar, sin licencia declarada).
- Skill propia `render-lana-3d` en `.claude/skills/`, con las reglas de este plan y los contratos que no se pueden romper.
- Referencias: Yuksel et al. 2012 (stitch meshes); Wu y Yuksel 2017 (fibras en tiempo real); Khattar et al. 2026, Eurographics (puntada analítica, perfiles 1D, parallax con curvatura); Edelstein et al. 2022 (AmiGo).

## 7. Riesgos

- Rendimiento del parallax, el pelaje y las sombras: solo en `relief` o en calidad alta, medido con la infraestructura de T12.
- Contratos de malla (G7, G12, `pick`) con el borde y el desplazamiento: pruebas de propiedades antes de mezclar.
- Exactitud del pb: R0 validado antes de R3.
- Inflado inestable con muchos aumentos seguidos: límite de iteraciones y volver a la forma de revolución.
- Sigue siendo un prototipo digital (regla 8); el aviso se mantiene.

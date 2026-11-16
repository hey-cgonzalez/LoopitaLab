# Capturas del visor 3D para CA4-V2 (fase 4, después de T21)

Capturas de `/dev/visor-3d` (patrones de `apps/web/src/app/dev/visor-3d/demo-patterns.ts`), tomadas el 2026-11-16 en la rama `fase-4/grupo-e` con las correcciones de T21 en `packages/viewer-3d`: hélice continua en espiral y C3 y C4.

El 3D es una **aproximación visual**: no hay relleno, tensión ni el cierre de la última vuelta. Ninguna de estas imágenes reemplaza una muestra tejida.

## Cómo se generaron

- Prueba `visor 3D: capturas de los patrones de referencia y de las fibras (CA4-V2, CA4-V8)` de `apps/web/e2e/webgl.spec.ts`, proyecto `webgl`.
- Chromium con WebGL por software: ANGLE sobre SwiftShader (Vulkan 1.3.0, LLVM 10.0.0).
- Ventana de 1440 × 900. El lienzo mide 974 × 519.
- Encuadre automático del visor: cámara 17° por encima del horizonte, con FOV de 40°.
- Aspecto de fibra activo (no "Colores planos").
- Lanas de la demo:
  - A: crudo, 100 % algodón.
  - B: rojo, 100 % algodón.
  - C: azul marino, 75/25 lana y poliamida.
  - D: rosado, 100 % acrílico.

```sh
cd apps/web
LOOPITA_NEXT_DIST_DIR=.next-capturas E2E_PORT=3177 E2E_CAPTURAS_DIR=/ruta/temporal \
  pnpm exec playwright test --project=webgl e2e/webgl.spec.ts -g "capturas de los patrones"
# Recorte centrado a 560 × 440 (macOS):
sips -c 440 560 /ruta/temporal/visor-3d-<demo>.png --out docs/capturas/fase-4/visor-3d/<demo>.png
```

`fixture-b-detalle.png` es la captura `calib-3d-algodon.png` de la prueba de calibración (T11c) de la misma corrida. Es un recorte de 330 × 300 sobre la esfera roja, sin escalar.

## Capturas

### `fixture-a.png`: fixture A, cuerpo de 39 vueltas (1.800 puntos)

- **Qué es:**
  - Crece +6 por vuelta hasta 60 puntos (V1 a V10).
  - Meseta de 60 (V11 a V30).
  - Cierra −6 por vuelta hasta 6 (V31 a V39).
  - Lana A.
- **Qué se ve:**
  - Un tambor de lados rectos con las tapas casi planas, más ancho que alto.
  - La tapa de arriba muestra las disminuciones en espiral, con un remate chico al centro.
  - El relieve de punto es parejo en toda la meseta.
- **Qué revisar:**
  - Que el tambor de tapas planas (razón 0,87 en `profile.test.ts`) se lea como un cuerpo de amigurumi plausible, o si debería verse más redondeado.
  - Lo esperable es que el relleno lo redondee, y el 3D no lo dibuja (C-13).

### `fixture-b.png` y `fixture-b-detalle.png`: fixture B, esfera (1.384 puntos), después de T21

- **Qué es:** 36 vueltas con conteos `round(60·sen(π(i − 0,5)/36))` y aumentos y disminuciones **juntos** al inicio de cada vuelta ("aum x5, 8 pb"). Lana A, o roja en el detalle.
- **Qué se ve:**
  - Una esfera completa.
  - Arriba queda solo un cuello corto y chico, de unos 1 cm de diámetro y unos 0,4 cm de alto: la última vuelta de 6 puntos, abierta.
  - Ya no está la "lengüeta" plana y asimétrica de las capturas anteriores (`../fibra-3d/calib-3d-*.png`).
- **Causa de la lengüeta:**
  - No era la última vuelta abierta ni un error de las disminuciones finales: era el escalón de la espiral.
  - Cada anillo de la espiral subía en altura dentro de la vuelta, pero mantenía su radio y su giro.
  - En la línea de inicio de vuelta, el final de una vuelta no se tocaba con el inicio de la siguiente. Quedaba una ranura de ancho |Δr| por vuelta, de hasta 1,05 cm en el fixture B.
  - En el ecuador Δr ≈ 0 y no se notaba.
  - En el cierre, Δr es casi el alto de una vuelta y Δz es chico: las ranuras de las vueltas 30 a 35 formaban una tira, y por ella se veía el interior de la pieza (material de dos caras).
  - Corrección: `ringPoint` en `packages/viewer-3d/src/geometry.ts`, con la prueba `test/t21-espiral.test.ts`.
- **Qué revisar:**
  - Que la esfera se lea como esfera.
  - Que el cuello del remate se entienda como la última vuelta abierta. El cierre ("pasar la hebra por la hebra delantera y tirar") va en `finish` como texto y el 3D no lo dibuja (F4-35).

### `cilindro.png`: cilindro abierto

- **Qué es:**
  - Base plana de 36 puntos (V1 a V6).
  - 20 vueltas rectas de 36 (V7 a V26).
  - Abierto arriba. Lana A.
- **Qué se ve:**
  - Un tubo recto con la base plana, que no se ve desde este ángulo.
  - El borde de arriba es una rampa: la última vuelta sube de la altura de la V25 a la de la V26 y termina en un escalón, a la derecha, como el final de una espiral real sin cerrar.
- **Qué revisar:**
  - Que el escalón del borde se entienda como el final de la espiral y no como un defecto.
  - Si conviene marcar en la interfaz el borde abierto (ver "Propuesta" abajo).

### `panel.png`: panel plano en hileras

- **Qué es:** cadeneta de 21 y 24 hileras de 20 pb. Lana D, acrílico rosado.
- **Qué se ve:**
  - Un rectángulo plano de frente.
  - Se ve como un trapecio porque la cámara está por encima: el borde de arriba queda más cerca.
  - El relieve de punto va en filas rectas.
- **Qué revisar:**
  - Que el relieve de la hilera de ida y el de la de vuelta no se distingan. Hoy son iguales; en crochet real, el derecho y el revés del pb alternan.
  - Que el término "hilera" en la etiqueta de la demo coincida con el de la interfaz (C2).

### `colores.png`: pieza con cambios de color

- **Qué es:**
  - El fixture A con cambios de lana:
    - V15: B.
    - V16: C.
    - V17: B.
    - V18: A con un punto de B cada 10 (`[pb 9, @B, pb, @A] x6`).
    - V19: C.
    - V20 en adelante: A.
- **Qué se ve:**
  - De abajo hacia arriba: franja roja (V15), azul marino (V16), roja (V17), crudo con puntos rojos sueltos (V18) y azul marino (V19).
  - De los 6 puntos rojos de la V18 se ven los del frente.
  - El color es por punto, sin mezcla entre vecinos.
- **Qué revisar:**
  - Que el escalón de color al inicio de cada franja (jog de la espiral) se lea como en la tela.
  - Que los puntos de la V18 caigan donde dice el patrón: 6 marcas rojas repartidas en la vuelta, una cada 10 puntos.

### `ondula.png`: pieza que ondula (aumentos de más)

- **Qué es:** disco con `aum x12` por vuelta desde la V4 hasta la V9. Δr/s pasa de 1,25 (CA4-V6). Lana D.
- **Qué se ve:**
  - Un disco **liso y plano**, no ondulado. Es lo esperado: el 3D no simula el volante y avisa con `SHAPE_RUFFLES`: "Volado, entre la vuelta 4 y la 9: la pieza aumenta más de lo que la tela puede abrir en plano. El 3D la dibuja lisa; tejida, puede ondularse. Las vueltas con aviso están en la revisión del patrón. Si es lo que buscas (volante, pétalo, remate), ignora este aviso."
  - El remolino del relieve viene de los aumentos juntos al inicio de cada vuelta.
  - A la izquierda, el escalón del final de la espiral.
  - Cerca del centro se ven unos anillos claros finos: son astillas de triángulos plegados en el disco plano. Las causa el perfil acotado y los aumentos juntos, y ya estaban antes de T21 (`packages/viewer-3d/README.md`, "Limitaciones").
- **Qué revisar:**
  - Que el aviso alcance para entender que la pieza tejida ondula aunque el 3D la muestre lisa.
  - Si los anillos claros del centro distraen lo suficiente para corregirlos antes de publicar.

### `muneco.png`: muñeco armado con partes, copias y anclas

- **Qué es:**
  - Cuerpo: cilindro de 22 vueltas, lana A, ubicado libre.
  - Cabeza: fixture B, lana A, ubicada libre sobre el cuerpo.
  - Orejas: 2 copias, lana D, cosidas con ancla en la V30 de la cabeza (puntos 4 y 18).
  - Brazos: 2 copias, lana C, cosidos con ancla en la V20 del cuerpo (puntos 0 y 18).
- **Qué se ve:**
  - La cabeza redonda sobre el cuerpo.
  - Las dos orejas rosadas arriba, como tubos cortos abiertos.
  - Los dos brazos azules horizontales, a los lados del cuerpo.
  - Arriba de la cabeza, el mismo cuello corto del remate del fixture B.
  - En el cuello, a la derecha, asoma el escalón del borde abierto del cuerpo.
- **Qué revisar:**
  - Que las anclas caigan donde dice el patrón: las orejas en la parte alta de la cabeza y simétricas, y los brazos a la misma altura.
  - Que las orejas y los brazos "sin rellenar" se lean como tubos. No hay aplanado: es una limitación conocida.
  - Que las copias tengan la misma forma.

## Propuesta para mostrar mejor la última vuelta abierta

No se inventa un cierre que no está en el patrón: si el 3D lo dibujara cerrado, mostraría algo que el modelo canónico no dice.

1. **Avisar del borde abierto en el visor.** Si la parte termina en redondo, el visor podría resaltar el borde superior de la última vuelta con una línea fina y mostrar una nota corta, por ejemplo: "La última vuelta queda abierta en el 3D. El cierre está en «Remate»." La nota solo aparecería si la parte tiene `finish`.
2. **Mismo borde en el modo tejiendo.** Con `limit`, ese borde es el punto actual: marcarlo ayuda a ver dónde va el próximo punto.
3. **No tocar el perfil sin la tejedora.**
   - El cuello sale de `partProfile`: con poco cambio de radio, la vuelta de 6 conserva su alto completo y sube casi recta.
   - Una vuelta de cierre real se tira y queda más baja.
   - Achicarla sería una regla nueva de forma, y va a T1b, no al visor.

Las tres van a T1b (textos) y a `arquitecto` (la sección 3 del ADR 0010 dice "Se ve el escalón al empezar cada vuelta, como en la tela real"). Con la hélice continua, el único escalón visible es el final de la última vuelta.

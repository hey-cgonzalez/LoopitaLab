# Roadmap de LoopitaLab (fases 2 a 7)

Última revisión: 2026-11-13, agentes `arquitecto` y `documentador` (cierre de la fase 3, T19; ver [Estado al cierre de la fase 3](#estado-al-cierre-de-la-fase-3)). Revisión anterior: 2026-11-09, agente `arquitecto` (fase 3: T0, T1 y T3 hechas; ADR 0007 a 0009 aceptados con las enmiendas de la revisión de dominio T1; [sección "Fase 3 en detalle"](#fase-3-en-detalle)). Revisión anterior: 2026-11-06 (T4, T5, T6 y T7 hechas; enmiendas E1 a E8 del ADR 0004 y E11 del ADR 0006; contrato de `pattern-render` actualizado; antes: T2b y T2c, enmiendas E10 a E13 del ADR 0003 y E10 del ADR 0006), con la revisión de dominio de `experto-tejido` aplicada. Las fases se derivan de las modalidades v1 de [`CLAUDE.md`](../CLAUDE.md). Las decisiones de arquitectura están en [`docs/adr/`](adr/). Los pendientes de seguridad, en [`docs/seguridad.md`](seguridad.md).

## Resumen

| Fase | Nombre | Estado | Complejidad global |
|---|---|---|---|
| 1 | Base: modelo canónico, validador, lanas, Supabase con RLS, acceso, proyectos y cuenta | Lista | — |
| 2 | Estudio de colorwork (palillo: plano, tubo y círculo) | Lista en código; ADR 0003 a 0006 aceptados. Faltan CA-P6, T1b, T16 y el E2E con sesión | Alta |
| 3 | Lanas por grosor y composición en la interfaz, más seguimiento de colorwork fila a fila | Implementada en código (grupos A a E; rama `fase-3/grupo-d`, último commit `6c23a65`). Pendiente lo que no es código: T1b (tras T1c), CA-P6, lector de pantalla real y la puesta en público. Ver [Estado al cierre de la fase 3](#estado-al-cierre-de-la-fase-3) | Media-alta |
| 4 | Estudio amigurumi 3D | Pendiente | Alta |
| 5 | Imagen → patrón (IA) | Pendiente | Alta |
| 6 | Modo tejiendo completo (amigurumi punto a punto, contadores, tiempo) | Pendiente | Media |
| 7 | Compartir y publicar, exportación PDF y lanzamiento | Pendiente | Media |

### Ajuste al orden propuesto: seguir colorwork fila a fila pasa a la fase 3

El orden original dejaba todo el modo tejiendo en la fase 6. Se propone adelantar **solo el seguimiento de colorwork fila a fila** a la fase 3, por cuatro razones técnicas:

1. **Costo bajo**:
   - Con la fase 2 terminada, el seguimiento de colorwork es casi solo derivación: la fila actual es un puntero (`project_progress.round_number`) y el resaltado ya está en el contrato de `stitch-render` (`setHighlightRow`, ADR 0004).
   - No requiere 3D ni el modelo escrito.
2. **Contrato de `packages/follow`**:
   - El secuenciador se diseña con el caso simple (filas de un gráfico) y se prueba con datos reales antes de extenderlo al amigurumi punto a punto.
   - Así se evita diseñarlo solo desde el caso más complejo.
3. **Producto usable antes**: la usuaria puede diseñar un gorro y tejerlo en la plataforma desde la fase 3, y las tejedoras pueden validar pronto la lectura de gráficos (derecha a izquierda, ida y vuelta, tejido en espejo).
4. **La IA abre en un flujo completo**: en la fase 5, el gráfico generado desde una foto ya se puede editar y tejer.

La fase 5 sigue siendo imagen → patrón, como fija [`docs/seguridad.md`](seguridad.md) para la subida de imágenes por el servidor (M3).

## Dependencias entre fases

```
1 ──► 2 ──► 3 ──► 4 ──► 6
            │     │
            └──►  5 ◄┘   (la ruta plana necesita 2 y 3; la ruta 3D necesita 4)
                  │
   2..6 ─────────►7
```

---

## Fase 2: Estudio de colorwork

Detalle completo en la [sección de la fase 2](#fase-2-en-detalle) más abajo.

- **Objetivo**: diseñar un motivo de colorwork a palillo en una cuadrícula, definir sus repeticiones y verlo al instante como tejido realista en plano, tubo o círculo (copa de gorro con disminuciones radiales).
- **Entregables**:
  - operaciones y derivados en `pattern-core` (ADR 0003 y 0005);
  - paquete `stitch-render` (ADR 0004);
  - paquete `pattern-render` con el gráfico SVG;
  - rutas `/disenos` y `/disenos/[id]` en la web;
  - guardado con versiones (ADR 0006);
  - medición de latencia.
- **Paquetes**: `pattern-core`, `yarn-catalog`, `stitch-render` (nuevo), `pattern-render` (nuevo), `apps/web`, `supabase/`.
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `arquitecto` | ADR |
  | `experto-tejido` | Reglas y revisión |
  | `motor-patrones` | `pattern-core`, `pattern-render` |
  | `render-puntos` | `stitch-render` y presupuesto de 100 ms |
  | `frontend-editor` | Estudio |
  | `catalogo-lanas` | Muestra sugerida con filas |
  | `backend-supabase` | Guardado y migración menor |
  | `ux-accesibilidad` | Teclado, lector de pantalla, daltonismo, tejido en espejo |
  | `documentador` | Textos |
  | `devops` | CI y Playwright |
  | `qa-tester` | Pruebas |
  | `revisor-seguridad` | Guardado en el servidor |

- **Dependencias**: fase 1. Aprobación de los ADR 0003 a 0006.
- **Criterios de salida**: los de la sección [criterios de aceptación](#criterios-de-aceptación-medibles), incluido el presupuesto de 100 ms medido.

## Fase 3: Lanas por grosor y composición, y seguimiento de colorwork

Detalle completo en la [sección de la fase 3](#fase-3-en-detalle) más abajo (ADR [0007](adr/0007-follow-secuencia-de-colorwork.md), [0008](adr/0008-lanas-selector-aspecto-y-metraje.md) y [0009](adr/0009-tejer-este-diseno-y-proyectos.md), aceptados). Donde el detalle precisa este resumen, manda el detalle.

- **Objetivo**: que cada lana del diseño se elija por grosor CYC, composición y color (paleta o personalizado), con su efecto en el render y en las recomendaciones. Que un diseño de colorwork se pueda tejer fila a fila.
- **Entregables**:
  - **3A. Lanas**:
    - **Selector completo**:
      - grosor con nombre en español y alias;
      - composición con fibras y porcentajes, validada;
      - paleta propia de 8 × 6 o color personalizado, con el color más cercano de la paleta como sugerencia.
    - **Vista previa al pasar el cursor**: `setPreviewOverride` en menos de 100 ms, sin modificar el diseño.
    - **Aspecto por fibra**: `yarnLook` con halo (mohair, alpaca), brillo (seda, viscosa, bambú, lurex) y definición (algodón, acrílico).
    - **Grosor y muestra**: el grosor sugiere aguja o crochet y una muestra inicial. Mientras la muestra no se confirme, se marca como supuesto.
    - **Lanas guardadas** de la usuaria (`user_yarns`, ya existe la tabla) y nota privada.
    - **Metraje estimado por color**: `yarnTotals` × largo por punto según grosor y muestra, marcado como estimación.
  - **3B. Seguimiento de colorwork**:
    - paquete `packages/follow`, primera versión: la secuencia de filas derivada del gráfico, con el orden de lectura de ADR 0003 y el espejo opcional del perfil (`mirror_knitting`, desactivado por defecto; no depende de `dominant_hand`);
    - pantalla "Tejiendo" con la fila actual resaltada en el gráfico y en la vista previa, avanzar y retroceder, y contador de filas y repeticiones;
    - "Tejer este diseño": crea un proyecto, fija una versión con `snapshot_pattern()` y guarda el puntero en `project_progress`.
- **Paquetes**: `yarn-catalog`, `stitch-render`, `pattern-core` (metraje), `follow` (nuevo), `apps/web`, `supabase/`.
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `arquitecto` | ADR 0007 a 0009 y revisión de contratos |
  | `catalogo-lanas` | Datos, conversión a metros, búsqueda de grosores, color cercano, rasgos visuales por fibra |
  | `motor-patrones` | `yarnUsage` (conteos para el metraje) en `pattern-core` |
  | `render-puntos` | Aspecto por fibra, vista previa al pasar el cursor y presupuesto de 100 ms |
  | `frontend-editor` | Selector de lanas, "Mis lanas" y panel de metraje |
  | `modo-tejiendo` | `follow` y pantalla "Tejiendo" |
  | `backend-supabase` | Lanas guardadas, migración de proyectos con versión fijada y acciones de avance |
  | `experto-tejido` | Muestras por grosor, lectura de gráficos, metraje |
  | `ux-accesibilidad` | Uso con una mano y pantalla siempre encendida |
  | `documentador` | Textos |
  | `devops` | E2E con sesión en la CI |
  | `qa-tester` | Pruebas |
  | `revisor-seguridad` | Obligatorio: migración, funciones del servidor, acciones y almacenamiento local |

- **Dependencias**: fase 2 (en código; T1b de la fase 2 y el E2E con sesión se cierran dentro de la fase 3, ver el detalle). Aprobación de los ADR 0007 a 0009.
- **Criterios de salida**:
  - la vista previa al pasar el cursor cumple p95 < 100 ms con el mismo escenario de la fase 2;
  - la composición inválida no se puede guardar;
  - el metraje se muestra siempre como estimación;
  - el puntero de un proyecto sobrevive a recargar y a cambiar de dispositivo;
  - las propiedades de `follow` pasan, por ejemplo: la cantidad de pasos es igual a la cantidad de filas del gráfico completo, y avanzar y retroceder son inversas;
  - `experto-tejido` aprueba la lectura con y sin espejo, y las tejedoras la validan.

## Fase 4: Estudio amigurumi 3D

- **Objetivo**: escribir un patrón de amigurumi por partes (con sintaxis o bloques), con color por punto y un modelo 3D que se actualiza en vivo.
- **Entregables**:
  - **Editor de patrón escrito**:
    - parte, inicio, construcción y vueltas;
    - la sintaxis existe en `pattern-core/src/text.ts`;
    - bloques equivalentes;
    - errores del validador junto a cada vuelta.
  - **Paquete `viewer-3d`**:
    - geometría derivada de los conteos por vuelta (radio por vuelta según la muestra) y color por punto;
    - partes posicionadas a mano en la v1;
    - con react-three-fiber. Las dependencias nuevas (`three`, `@react-three/fiber`) se justifican en el PR.
  - **Paquete `glossary`**:
    - nombres completos y abreviaturas en US, UK y variantes en español, reutilizando `stitches.ts`;
    - implementa las decisiones del [glosario pendiente](#glosario-pendiente), una vez validadas con tejedoras.
  - **Notas de armado** en el modelo (`assembly`, ya existe).
  - **ADR nuevo**:
    - geometría 3D derivada de las vueltas;
    - cómo se guarda la posición de las partes (probablemente requiere `schemaVersion: 2`).
- **Paquetes**: `pattern-core`, `viewer-3d` (nuevo), `glossary` (nuevo), `stitch-render` (puntos de crochet, si se usan en miniaturas), `apps/web`.
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `arquitecto` | ADR de geometría y posición de partes |
  | `visor-3d` | `viewer-3d` |
  | `motor-patrones` | Bloques y validación |
  | `frontend-editor` | Editor |
  | `documentador` | `glossary` |
  | `experto-tejido` | Validación del dominio |
  | `qa-tester` | Pruebas |
  | `ux-accesibilidad` | Accesibilidad |

- **Dependencias**: fase 3 (selector de lanas). La fase 1 ya tiene el modelo escrito y el validador.
- **Criterios de salida**:
  - editar una vuelta actualiza el 3D en menos de 100 ms con una pieza de 40 vueltas;
  - el texto y los bloques producen el mismo documento (ida y vuelta sin pérdida);
  - el glosario tiene ES, US y UK, marcado como pendiente de validación con tejedoras;
  - el 3D muestra el aviso de prototipo digital.

## Fase 5: Imagen → patrón (IA)

- **Objetivo**: de una foto a un gráfico de colorwork (ruta plana) o a un amigurumi aproximado (ruta 3D), que se abre en el estudio correspondiente, editable y etiquetado "Generado con IA".
- **Entregables**:
  - **Subida por el servidor** (M3 de `docs/seguridad.md`):
    - Route Handler que revisa el contenido real, re-codifica, quita EXIF y guarda con la clave secreta;
    - aviso de derechos sobre la imagen al subirla.
  - **`packages/ai-router` como paquete del workspace**:
    - hoy es solo `router.config.ts`;
    - le falta `package.json`, `src/` y pruebas.
  - **Máquina de estados** de `ai_jobs` en el servidor (`docs/agentes-runtime.md`):
    - cuotas por usuaria;
    - presupuesto con corte automático;
    - registro de modelo, tokens y costo.
  - **Procesamiento determinista en el servidor**:
    - recorte;
    - redimensionado según la muestra;
    - cuantización;
    - color más cercano con `nearestPaletteColor`.

    Una dependencia de imagen, si hace falta, se justifica en el PR.
  - **Agentes del producto**: moderador, clasificador, asistente de paleta, descomponedor de forma y redactor. Toda salida pasa por `validatePattern` (regla de oro 3).
  - **Duplicar un patrón de IA** por el servidor (`service_role`): la copia queda `ai_edited` con los metadatos de origen del original. Hasta entonces, `duplicatePattern` devuelve `AI_DUPLICATE_UNSUPPORTED` (ADR 0006, E11).
- **Paquetes**: `ai-router`, `pattern-core`, `yarn-catalog`, `apps/web` (Route Handlers), `supabase/` (Edge Functions o servidor, Storage).
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `ia-pipeline` | Pipeline |
  | `backend-supabase` | Storage, `ai_jobs`, cuotas |
  | `motor-patrones` | Primitivas → vueltas |
  | `frontend-editor` | Flujo de subida |
  | `revisor-seguridad` | Obligatorio: subidas e IA |
  | `qa-tester` | Pruebas |
  | `experto-tejido` | Validación del dominio |

- **Dependencias**: la ruta plana necesita las fases 2 y 3. La ruta 3D necesita la fase 4.
- **Criterios de salida**:
  - ninguna salida de IA se muestra sin validar;
  - los reintentos escalan de modelo según el router y se registran;
  - la etiqueta de IA no se puede quitar (el trigger ya existe);
  - el presupuesto diario corta;
  - `revisor-seguridad` aprueba (inyección por texto en la imagen, EXIF, tamaño, tipo real del archivo).

## Fase 6: Modo tejiendo completo

- **Objetivo**: seguir cualquier patrón paso a paso. En amigurumi, punto a punto ("1/60 pb"), con el 3D creciendo a medida que se avanza. En todos los patrones, con contadores, avance por parte, tiempo estimado y notas de armado.
- **Entregables**:
  - **`follow` extendido a patrones escritos**: la secuencia punto a punto se deriva de `expandRound`.
  - **Pantalla "Tejiendo" de amigurumi** con el 3D parcial (`viewer-3d` hasta el punto actual).
  - **Contadores**:
    - de vueltas, repeticiones y personalizados;
    - temporizador y tiempo estimado (ritmo de la propia usuaria);
    - notas por proyecto (la tabla `project_notes` ya existe).
  - **Migración**: `project_progress` necesita contadores y tiempo acumulado (por ejemplo, `counters jsonb` y `elapsed_seconds`). Nunca se guarda una copia del patrón.
  - **Uso sin conexión**: el avance se encola localmente y se sincroniza.
- **Paquetes**: `follow`, `viewer-3d`, `apps/web`, `supabase/`.
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `modo-tejiendo` | `follow` y pantalla "Tejiendo" |
  | `visor-3d` | 3D parcial |
  | `backend-supabase` | Migración de `project_progress` |
  | `ux-accesibilidad` | Uso con una mano, tejido en espejo (`mirror_knitting`), tamaño de letra |
  | `qa-tester` | Pruebas |
  | `experto-tejido` | Validación del dominio |

- **Dependencias**: fases 3B y 4.
- **Criterios de salida**:
  - la posición "n/total" coincide con los conteos del motor en toda vuelta;
  - el 3D parcial corresponde al puntero;
  - el avance se sincroniza entre dos dispositivos sin perder pasos;
  - las propiedades de `follow` pasan.

## Fase 7: Compartir, publicar, exportar y lanzamiento

- **Objetivo**: publicar diseños o compartirlos por enlace, exportar a PDF y abrir la plataforma al público cumpliendo los requisitos legales.
- **Entregables**:
  - **Publicar y compartir**:
    - interfaz para publicar o compartir por enlace (`visibility`);
    - vista pública con los documentos ajenos validados (B1; la base ya está en `apps/web/src/lib/shared-pattern.ts`).
  - **Proyectos sobre patrones públicos ajenos**: resolver cómo se fija la versión, porque hoy `pattern_versions` solo la lee la dueña (ADR 0006).
  - **Exportación a PDF** desde `pattern-render`: gráfico, texto escrito, lanas, muestra, supuestos, aviso de prototipo y etiqueta de IA.
  - **Historial de versiones**: ver, comparar y restaurar.
  - **Legal y confianza**:
    - **Política de privacidad** y revisión legal según la Ley 21.719 (ver la nota de calendario abajo) y, si hay usuarias en la UE, el RGPD;
    - términos de servicio;
    - mecanismo de denuncia de patrones públicos;
    - aviso de derechos al publicar.
  - **Antes de abrir el registro**:
    - CAPTCHA en Auth (Turnstile o hCaptcha);
    - SMTP propio;
    - dominio real en Site URL y Redirect URLs.
  - **Glosario validado** por tejedoras reales antes de publicarse (regla de oro 5).
  - **Producción**:
    - despliegue (Vercel y Supabase);
    - entornos de staging y producción;
    - monitoreo de errores;
    - alertas de costo de IA.
- **Paquetes**: `pattern-render` (PDF), `apps/web`, `supabase/`, `glossary`.
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `frontend-editor` | Interfaz de publicación e historial |
  | `motor-patrones` | PDF |
  | `backend-supabase` | Denuncias, RLS de publicación |
  | `revisor-seguridad` | Obligatorio |
  | `devops` | Despliegue |
  | `documentador` | Términos y textos |
  | `ux-accesibilidad` | Accesibilidad |
  | `qa-tester` | E2E de extremo a extremo |

- **Dependencias**: fases 2 a 6, según lo que se publique.
- **Criterios de salida**:
  - todos los pendientes de `docs/seguridad.md` cerrados;
  - el PDF se deriva solo del modelo canónico;
  - la etiqueta de IA y el aviso de prototipo aparecen en la vista pública y en el PDF;
  - la revisión legal está aprobada.

> **Calendario legal.** Según `docs/seguridad.md`, la Ley 21.719 entraría en vigencia el **1 de diciembre de 2026**, antes de que termine la fase 2. La plataforma ya guarda datos personales (cuentas). Si una sola persona externa se registra antes de la fase 7 (por ejemplo, tejedoras de una beta cerrada), la política de privacidad y las bases de tratamiento deben estar listas **antes** de esa beta, no en el lanzamiento. Es una decisión abierta (ver abajo).

---

## Fase 2 en detalle

### Alcance

**Dentro**

- Palillo, gráfico de colores (`kind: "chart"`, `technique: "knit"`).
- **Creación de un diseño**:
  - título;
  - forma de vista: plano, tubo o círculo;
  - en redondo o ida y vuelta;
  - dirección: de abajo hacia arriba o de arriba hacia abajo;
  - tamaño del motivo (hasta 200 × 200);
  - repeticiones a lo ancho y a lo alto;
  - lana de fondo.
- **Editor de motivo**:
  - herramientas: lápiz, relleno, cuentagotas y "sin punto" (celda fuera de forma);
  - trazo continuo;
  - deshacer y rehacer;
  - edición sobre cualquier repetición (escribe en el motivo);
  - cambio de tamaño del motivo con ancla.
- **Lanas del diseño, versión mínima**:
  - agregar, cambiar y quitar;
  - color de la paleta o personalizado;
  - grosor CYC;
  - composición (por defecto, 100 % de una fibra elegida).

  La biblioteca completa es de la fase 3.
- **Vista previa realista** (`stitch-render`) en plano, tubo (con rotación) y círculo, con zoom y desplazamiento.
- **Muestra**: puntos y filas en 10 cm, rotulada "muestra en punto jersey".
  - Si falta, se usa una muestra supuesta marcada como tal:
    - los puntos son el punto medio del rango CYC;
    - las filas, `round(puntos × 1,35)`;
    - la categoría 7 lleva una advertencia de baja confianza;
    - ver la tabla en [docs/casos-dominio-colorwork.md](casos-dominio-colorwork.md).
  - Se muestran las medidas resultantes en cm (`dimensionsCm`). En tubo y círculo, el ancho se rotula "circunferencia".
- **Conteos por vuelta y disminuciones por repetición** en el círculo (`shaping`), derivados de la máscara.
- **Panel de validación**: hebras flotantes largas, más de 2 colores por fila y reglas del círculo, con la fila o celda resaltada.
- **Aviso permanente de prototipo digital** (regla de oro 8): "La vista es una aproximación. Teje una muestra para comprobar la muestra y las proporciones."
- **"Mis diseños"**: listar, crear, abrir, duplicar y borrar. Autoguardado con concurrencia optimista y "Guardar versión" (ADR 0006).
- **Accesibilidad**:
  - editor operable con teclado (flechas, espacio para pintar, atajos de herramienta);
  - letra o símbolo por lana sobre la cuadrícula (daltonismo);
  - descripción textual del motivo para lectores de pantalla.
- **Gráfico de símbolos estático en SVG** (`pattern-render`): para imprimir desde el navegador y como base del PDF.

**Fuera** (fase en que entra)

| Tema | Fase |
|---|---|
| Canesú | Después de la v1 del estudio, con un ADR propio |
| Crochet tapestry | Después de la fase 4 |
| Tallas, secciones múltiples (banda + copa) y símbolos de punto (revés, tipo de disminución) | Un ADR futuro con `schemaVersion: 2` (ADR 0003) |
| Vista previa al pasar el cursor, aspecto por fibra, lanas guardadas, metraje | Fase 3 |
| Modo tejiendo | Fase 3B |
| Texto escrito del colorwork, PDF, publicar | Fase 7 |
| Imagen → gráfico | Fase 5 |
| Miniaturas en la lista | Cuando se diseñe la caché derivada (ADR 0006) |
| Uso cómodo en teléfono | La fase 2 apunta a escritorio y tableta. En teléfono debe funcionar sin romperse, aunque no sea cómodo |

### Historias de usuaria

| ID | Historia |
|---|---|
| HU-01 | Como tejedora, creo un diseño de colorwork eligiendo forma, tamaño del motivo y repeticiones, para empezar desde una cuadrícula lista. |
| HU-02 | Pinto celdas con las lanas del diseño y veo al instante el tejido repetido, para decidir el dibujo mirando el resultado. |
| HU-03 | Marco celdas como "sin punto" para dibujar una cuña, y en el círculo veo cerrarse la copa con los puntos por vuelta y las disminuciones por repetición. |
| HU-04 | Cambio las repeticiones a lo ancho y a lo alto y veo el resultado y las medidas en cm. |
| HU-05 | Ingreso mi muestra. Si no la tengo, veo una sugerida, claramente marcada como supuesto. |
| HU-06 | Elijo si tejo en redondo o de ida y vuelta, y de abajo hacia arriba o de arriba hacia abajo, y la vista lo refleja. |
| HU-07 | Agrego, cambio y quito lanas del diseño (color de la paleta o personalizado, grosor y composición). |
| HU-08 | Veo las advertencias (hebras flotantes largas, demasiados colores por fila, coronilla que no cierra, disminuciones imposibles) señaladas en el gráfico. |
| HU-09 | Deshago y rehago cualquier cambio. |
| HU-10 | Mi diseño se guarda solo, puedo guardar una versión con nombre y lo encuentro en "Mis diseños". Si lo edité en otro dispositivo, se me avisa en vez de perder cambios. |
| HU-11 | Uso el editor con teclado o lector de pantalla, y distingo las lanas aunque no distinga bien los colores. |
| HU-12 | Siempre veo que la vista es una aproximación y que conviene tejer una muestra. |

### Criterios de aceptación medibles

**Rendimiento (regla de oro 7)**. Se mide según el ADR 0004:

- Playwright en Chromium, con CPU limitada ×4;
- motivo de 20 × 20 con repeticiones de 10 × 10 (40.000 puntos);
- formas plano, tubo y círculo.

| ID | Criterio |
|---|---|
| CA-P1 | Pintar una celda (50 veces): p95 de `edit-to-paint` < 100 ms en las tres formas |
| CA-P2 | Trazo continuo: cada actualización < 100 ms y ≥ 30 fps durante el trazo |
| CA-P3 | Cambiar las repeticiones de 5 × 5 a 10 × 10 (20 veces): p95 < 100 ms |
| CA-P4 | Zoom y desplazamiento: ≥ 30 fps |
| CA-P5 | `layoutGeometry` con 40.000 puntos en Node: tiempo registrado en CI; falla si supera 3 veces la referencia |
| CA-P6 | Medición manual en el equipo de referencia (4 núcleos, 8 GB, GPU integrada), adjunta al PR de cierre. **Pendiente** (T6 midió el benchmark y T10 el estudio real en Chrome sin interfaz con CPU ×4: peor p95 91,2 ms, zoom ≥ 46,5 fps; ADR 0004, E7). Procedimiento: `packages/stitch-render/README.md`, "Medición en el estudio (T10) y equipo de referencia (CA-P6)" |
| CA-P7 | La validación nunca corre entre la edición y el dibujo (verificado en el perfil de rendimiento del PR) |

**Funcionales**

| ID | Criterio |
|---|---|
| CA-F1 | Pintar una celda en cualquier repetición cambia esa celda en todas las repeticiones. La prueba E2E compara la lana de las instancias con `cellAt` |
| CA-F2 | Total de puntos, puntos por vuelta, disminuciones por repetición y medidas en cm se obtienen solo de `pattern-core`. Revisión de código: ningún conteo calculado en `apps/web` |
| CA-F3 | En el círculo, un gráfico en cuña de 8 repeticiones que baja de 10 a 1 punto por repetición muestra 80 → 8 puntos y las disminuciones correctas por vuelta. La vista no deja huecos radiales |
| CA-F4 | Sin muestra, la interfaz indica "supuesto" junto a la muestra y a las medidas, y el documento guardado no tiene `gauge` |
| CA-F5 | Cambiar `renderAs` nunca cambia `stitchTotal` ni el documento salvo ese campo (prueba de propiedades) |
| CA-F6 | El autoguardado ocurre como máximo 2 s después de la última edición. Una edición concurrente desde otra pestaña produce aviso de conflicto, nunca una sobrescritura silenciosa |
| CA-F7 | El servidor rechaza un documento con errores **estructurales** (`savable: false`). Los errores de tejido (`CHART_EMPTY`, `CHART_ROW_EMPTY_FULL`) y las advertencias no impiden guardar el borrador; los errores de tejido sí impiden "Tejer este diseño", publicar y exportar, verificado en el servidor (ADR 0006, E10) |
| CA-F8 | "Guardar versión" crea una fila en `pattern_versions`. El autoguardado no crea ninguna |
| CA-F9 | Deshacer y rehacer funcionan para pintar, rellenar, "sin punto", cambiar el tamaño, las repeticiones y las lanas, y cambiar forma, dirección y muestra |
| CA-F10 | El aviso de prototipo digital está visible en el estudio en todas las formas y no se puede cerrar de forma permanente |
| CA-F11 | Los 27 casos de [docs/casos-dominio-colorwork.md](casos-dominio-colorwork.md) tienen prueba automática y pasan. Los marcados "validar con tejedora" pasan con el valor actual y quedan señalados en la prueba |
| CA-F12 | Sin `gauge` en el documento, el umbral de hebras flotantes sale de la muestra supuesta (`assumedGauge` o `weightCat`), no del 5 fijo |
| CA-F13 | En plano y tubo, la interfaz aclara que los huecos de "sin punto" no existen en la prenda real |

**Accesibilidad**

| ID | Criterio |
|---|---|
| CA-A1 | Todas las acciones del editor se pueden hacer solo con el teclado (E2E sin ratón) |
| CA-A2 | Cada lana tiene una letra o un símbolo visible en la cuadrícula. El contraste de la interfaz cumple WCAG 2.2 AA |
| CA-A3 | El lector de pantalla anuncia la celda enfocada (fila, punto, lana) y hay una descripción textual del motivo |

### Cambios al modelo canónico (`pattern-core`)

Detalle en el [ADR 0003](adr/0003-colorwork-en-esquema-v1.md) y el [ADR 0005](adr/0005-geometria-circulo-y-disminuciones.md). Resumen:

- **Sin cambio de forma del documento** (`schemaVersion` sigue en 1). Motivo, repeticiones, muestra, dirección, máscara (`NO_STITCH`) y forma ya existen.
- **Semántica precisada**:
  - `x = 0` es la izquierda vista desde el derecho, y la fila 1 se teje por el derecho;
  - el orden de lectura se deriva. El espejo opcional `mirror_knitting` (preferencia del perfil, desactivada por defecto) afecta solo la vista, nunca el documento, y no depende de `dominant_hand`;
  - `direction`:
    - `top_down` muestra la pieza rotada 180°, `(x, y) → (W − 1 − x, H − 1 − y)`;
    - en el círculo decide si la fila 0 es el borde o el centro, y el sentido de giro: antihorario en `bottom_up` y horario en `top_down` (validar con tejedora);
  - `NO_STITCH` tiene matices visibles:
    - el color del punto tras una disminución no se expresa;
    - en plano y tubo se ven huecos que la prenda no tiene;
    - en tubo y círculo, el ancho es una circunferencia;
  - `yoke` es válido, pero sin vista propia todavía.
- **Derivados nuevos**: `motifCoord`, `rowStitchCount`, `rowStitchCounts`, `shaping`, `readingDirection` (con `mirror`), `wornOrientation` y, por la enmienda E8 del ADR 0003, `rowShapingColumns`. Se corrige `dimensionsCm` (circunferencia con máscara).
- **Operaciones puras nuevas** (`edit.ts`): `paintCells`, `fillRegion`, `resizeMotif`, `setRepeat`, `addYarn`, `removeYarn`, `reorderYarns`, `newChartPattern`.
- **Migraciones**: `migratePattern` (identidad para v1), en el camino de toda lectura.
- **Validaciones nuevas o corregidas** (ADR 0003 y 0005):
  - `TITLE_LENGTH`, `CHART_RENDER_UNSUPPORTED`, `CHART_ROWS_SHAPE`, `CHART_ROW_EMPTY_FULL`, `YARNS_MIXED_WEIGHT`;
  - `CHART_FLOAT_LONG`:
    - máximo de `min(floor(2,5 × puntos / 10), 5)` puntos;
    - usa `assumedGauge` o `weightCat` cuando el documento no tiene `gauge`;
    - el mensaje dice "enganchar";
  - en todas las formas: `CHART_SHAPING_IMPOSSIBLE` y `CHART_SHAPING_TOO_FAST` (las dos advertencias desde E10: pasar de 80 a 8 se teje cerrando, dejando en espera o pasando la hebra);
  - `CHART_EMPTY` y `CHART_ROW_EMPTY_FULL` son **errores de tejido** (E10): no impiden guardar, sí tejer y publicar;
  - en el círculo: `CHART_SHAPING_STEEP`, `CHART_SHAPING_UNEXPECTED`, `CHART_CIRCLE_REPEATS` (4 a 12), `CHART_WEDGE_TOO_NARROW`, `CHART_CIRCLE_REPEAT_Y` (solo con máscara), `CHART_CIRCLE_NOT_CLOSED` (por total: más de 16 o más de 24) y `CHART_CIRCLE_START`.
- **En `yarn-catalog`**:
  - `suggestedGauge` también devuelve `rowsPer10cm = round(puntos × 1,35)`, rotulado como supuesto en punto jersey. La categoría 7 tiene baja confianza. Hoy solo devuelve puntos, y la vista previa necesita las dos medidas para la proporción del punto;
  - limpieza de alias de `grosores.json` según la regla de oro 9 (T3).

### Paquetes nuevos y su contrato

| Paquete | Qué hace | Depende de | Contrato |
|---|---|---|---|
| `packages/stitch-render` | Vista previa realista. Tres capas: disposición (pura), aspecto de la lana (puro), backend (Canvas 2D primero) | `pattern-core`, `yarn-catalog`. Sin terceros | `layoutGeometry`, `colorize`, `hitTest`, `needsRelayout`, `layoutInstanceCount`, `yarnLook`, funciones de vista, `StitchRenderer`, `createCanvasRenderer` ([ADR 0004](adr/0004-render-de-puntos-2d.md), contrato estable en la enmienda E5) |
| `packages/pattern-render` | Derivados estáticos: gráfico de símbolos en SVG y descripción textual. Más adelante, texto escrito y PDF | `pattern-core`. Sin terceros | Ver abajo |

Contrato de `pattern-render`:

```ts
export interface ChartSvgOptions {
  cellPx?: number;          // por defecto 16
  showRepeats?: boolean;    // marca los bordes del motivo
  rowNumbers?: boolean;     // ida y vuelta: derecho a la derecha, revés a la izquierda; en redondo, todas a la derecha (ADR 0003)
  symbols?: boolean;        // letra por lana (daltonismo)
  mirror?: boolean;         // preferencia mirror_knitting: solo la numeración y las flechas de lectura
}
export interface DescribeOptions {
  /** Nombre del color de la paleta propia. Lo pasa quien llama: pattern-render no depende de yarn-catalog. */
  paletteName?(paletteId: string): string | undefined;
}
export const CHART_SVG_MAX_CELLS = 40_000; // casillas del gráfico completo que se dibujan como máximo
export const DEFAULT_CELL_PX = 16;
export const DESCRIBE_MAX_ISSUES = 3;     // avisos citados textualmente en la descripción
export function chartToSvg(pattern: ChartPattern, opts?: ChartSvgOptions, describe?: DescribeOptions): string;
/** Descripción en español, en texto plano, para lectores de pantalla. */
export function describeChart(pattern: ChartPattern, opts?: DescribeOptions): string;
```

**Revisión del contrato tras T7 (2026-11-06, `arquitecto`)**. Se aceptan las desviaciones de la implementación:

- **`DescribeOptions`** como tercer parámetro de `chartToSvg` y segundo de `describeChart`. Se aceptan porque mantienen a `pattern-render` dependiendo solo de `pattern-core`: quien llama (la web) inyecta la búsqueda en la paleta de `yarn-catalog`. Se separa de `ChartSvgOptions` porque es contenido de la descripción, no presentación del gráfico.
- **Gráfico completo, o solo el motivo** si el gráfico completo pasa de `CHART_SVG_MAX_CELLS` (40.000) casillas, con el rótulo visible "Motivo: se repite N × M veces" y `data-view="full" | "motif"`. El tope coincide con el escenario de 40.000 puntos del ADR 0004 y protege del caso de `LIMITS.maxRepeat` (500 por eje).
- Las dos funciones aceptan todo documento `savable`, nunca lanzan y no dibujan un documento con errores estructurales.
- **Letra de la lana**: `yarnLetter` hoy está copiada en `pattern-render/src/xml.ts` desde `yarnLabel` del validador. Es terminología del dominio (la usan el validador, el SVG, la cuadrícula del editor por CA-A2 y, en la fase 3, `follow`), así que **se exporta desde `pattern-core`** como `yarnLetter(index: number): string` (A–Z; desde la 27, su número). `yarnLabel` del validador y `pattern-render` la usan, y se borra la copia. Tarea T7b.
- **Pedidos de `experto-tejido`** (2026-11-06), tarea T7b:
  - con el motivo solo, ida y vuelta, alto del motivo impar y `repeat.y > 1`, el rótulo agrega que la numeración es la de la primera repetición y que el derecho y el revés de cada fila del motivo se alternan entre repeticiones;
  - con casillas chicas (por debajo de una constante con nombre, propuesta 12 px), se numeran solo la fila 1, los múltiplos de 5 y la última; con casillas grandes, todas. La flecha de lectura acompaña a cada número que se dibuja.

Los dos paquetes siguen la convención del núcleo:

- TypeScript sin compilar;
- `exports` apuntando a `src/index.ts`;
- pruebas con `node:test`.

Para usarlos, `apps/web` los agrega a `transpilePackages` en `next.config.ts`, junto con `yarn-catalog`, que hoy no está.

### Pantallas de `apps/web`

| Ruta | Contenido |
|---|---|
| `/disenos` | "Mis diseños": lista (título, forma, tamaño, fecha, etiqueta de IA si corresponde), crear, duplicar y borrar. Se enlaza desde el encabezado junto a "Proyectos" |
| `/disenos/nuevo` | Asistente corto: forma, en redondo o ida y vuelta, dirección, tamaño del motivo, repeticiones, lana de fondo y muestra opcional. Ofrece plantillas (banda en tubo, copa en cuña de 8 repeticiones) generadas con `newChartPattern` |
| `/disenos/[id]` | Estudio (ver abajo) |

Distribución del estudio:

- **Barra de herramientas**: lápiz, relleno, cuentagotas, "sin punto", deshacer, rehacer y zoom.
- **Lanas del diseño**: lista A, B, C… con muestra de color, letra y editor mínimo.
- **Editor de motivo**:
  - cuadrícula en canvas, con la fila 1 abajo;
  - numeración y flechas de lectura;
  - opción de ver el gráfico completo con repeticiones.
- **Vista previa** (`stitch-render`): al lado del editor en escritorio, en una pestaña en tableta.
- **Panel lateral**:
  - repeticiones;
  - forma;
  - en redondo o ida y vuelta;
  - dirección;
  - muestra (con "supuesto");
  - medidas;
  - total de puntos;
  - puntos por vuelta (círculo);
  - validación.
- **Aviso fijo** de prototipo digital.
- **Estado del guardado**: guardado, guardando, sin conexión o conflicto. Botón "Guardar versión".

Lo que vive en cada capa:

| Capa | Contenido |
|---|---|
| Dominio | `pattern-core`, `stitch-render/layout` |
| Aplicación | Almacén del documento con historial para deshacer; orquestación del autoguardado; Server Actions |
| Infraestructura | Supabase, `localStorage`, canvas |

### Persistencia en Supabase

**Cabe en el esquema actual** (`patterns` y `pattern_versions`), según el [ADR 0006](adr/0006-guardado-de-disenos.md):

- un diseño es una fila de `patterns` con `kind = 'chart'` y `technique = 'knit'`;
- las versiones se crean con `snapshot_pattern()`, solo al pedirlo;
- el autoguardado usa concurrencia optimista con `updated_at`;
- el servidor valida con `migratePattern` y `validatePattern` antes de escribir.

Hay **una migración menor recomendada**: agregar `document ->> 'title' = title` a `patterns_document_consistent`, porque hoy el título está duplicado sin verificar.

`backend-supabase` también verifica que el peor documento de la interfaz quepa:

- en el tope de 1.000.000 bytes del texto del documento en `patterns` (`patterns_document_text_size`) y en los 750.000 bytes que acepta el servidor (ADR 0006, E11);
- en el límite del cuerpo de las Server Actions.

### Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | El círculo y el tubo con Canvas 2D (una transformación por punto) no cumplen 100 ms | Interfaz de backend reemplazable. Pasar a WebGL2 según el criterio del ADR 0004. T6 midió el peor p95 en 87,8 ms (círculo, repeticiones) y T10, con el estudio real, 91,2 ms (círculo de 40.000 puntos, repeticiones; CPU ×4): el criterio no se activó, pero el margen es corto. Falta CA-P6 en el equipo de referencia (ADR 0004, E7) |
| R2 | Documentos grandes superan el tope de la base (1 MB de texto) o el límite de las Server Actions | Límite de 200 × 200 en la interfaz. Prueba del peor caso (T4: cabe con margen; tope de 750 KB en el servidor, ADR 0006, E11). Codificación compacta como plan B (ADR 0003) |
| R3 | Paquetes en TypeScript sin compilar, con imports `.ts` e imports JSON con atributos (`yarn-catalog`), en Next 16 y Turbopack | Prueba de concepto al inicio de T8. `pattern-core` ya funciona con `transpilePackages`; falta probar `yarn-catalog` |
| R4 | Lo marcado "validar con tejedora" no coincide con lo que esperan las tejedoras reales: sentido de giro en el círculo, proporción 1,35 en colorwork, rango de repeticiones, ancho mínimo de cuña, umbrales de `ringDistortion`, terminología | `experto-tejido` ya revisó las reglas (T1). T1b valida con tejedoras antes de cerrar la fase. Los valores viven en constantes con nombre, para cambiarlos sin rediseñar |
| R5 | Las usuarias esperan ver el tipo de disminución ("2 juntos al derecho", "inclinada a la izquierda") en la coronilla | Limitación visible en la interfaz y en la ayuda. Capa de símbolos en un ADR futuro |
| R6 | Expectativa de realismo: la vista previa se confunde con el resultado real (huecos de "sin punto", color tras la disminución, orillos, *jog*) | Aviso permanente (CA-F10), aclaración de los huecos (CA-F13) y aviso de deformación en el círculo (ADR 0005) |
| R7 | Conflictos de autoguardado entre pestañas | Concurrencia optimista y respaldo local (ADR 0006) |
| R8 | Cambiar los alias de `grosores.json` cambia el SQL generado de datos de referencia, y la migración original ya está aplicada en el proyecto remoto | Hoy `scripts/gen-reference-sql.ts --write` **sobrescribe** `20261104010100_datos_referencia.sql`, y `reference-sql.test.ts` compara contra ese archivo. Eso choca con no editar migraciones aplicadas. Hay que cambiar el generador para que escriba una migración **nueva** de datos (idempotente, con `on conflict … do update`) y que la prueba compare contra la última (T3b) |

### Desglose de tareas

El orden es el de ejecución. Las tareas con la misma letra de grupo pueden ir en paralelo. Complejidad y modelo según la tabla de `CLAUDE.md`.

| # | Grupo | Tarea | Agente | Complejidad (modelo) | Depende de |
|---|---|---|---|---|---|
| T0 | A | **Hecha (2026-11-05).** La usuaria aprobó los ADR 0003 a 0006 | (usuaria) | — | — |
| T1 | A | **Hecha (2026-11-05).** `experto-tejido` revisó la semántica y las reglas. Las correcciones están aplicadas en los ADR 0003 a 0005 y en [casos de dominio](casos-dominio-colorwork.md) | `experto-tejido` | Media (sonnet) | — |
| T1b | A | Validar con tejedoras reales lo marcado "validar con tejedora" (sentido del círculo, proporción 1,35 en colorwork, repeticiones de 4 a 12, cuña mínima, `ringDistortion`) y el [glosario pendiente](#glosario-pendiente). Se cierra antes de T16 Hoja lista: `docs/validacion-tejedoras.md` (2026-11-08). | `experto-tejido` con la usuaria | Media (sonnet) | T1 |
| T2 | B | `pattern-core`: derivados (`motifCoord`, `rowStitchCount(s)`, `shaping`, `readingDirection` con `mirror`, `wornOrientation`), `edit.ts`, `migrate.ts`, pruebas de propiedades y actualización del README del paquete. **Hecha 2026-11-06** (decisiones de contrato resueltas en el [ADR 0003, enmiendas E1 a E9](adr/0003-colorwork-en-esquema-v1.md#enmiendas-tras-la-implementación-de-t2-2026-11-06); los cambios C1 a C9 van en T2b) | `motor-patrones` | Alta (opus) | T0, T1 |
| T2b | B | `validate.ts`: `assumedGauge` y `weightCat` en `ValidateOptions`; tope de 5 puntos en hebras flotantes; mensaje "enganchar"; `TITLE_LENGTH` (1 a 120 caracteres, como la columna); `CHART_RENDER_UNSUPPORTED` para `yoke` (hoy se acepta sin geometría ni aviso); `CHART_ROWS_SHAPE`; `CHART_ROW_EMPTY_FULL`; `YARNS_MIXED_WEIGHT`; `CHART_SHAPING_IMPOSSIBLE` y `TOO_FAST`; `WEDGE_TOO_NARROW`; cierre por total; `CIRCLE_START`; `REPEAT_Y` solo con máscara. Pruebas de los casos 8 a 18 y 21 a 23. Además, los cambios C1 a C9 del [ADR 0003](adr/0003-colorwork-en-esquema-v1.md#cambios-que-aplica-motor-patrones-en-t2b): `MigrationResult` discriminado, `yarnCount` obligatorio en `paintCells`, `fillRegion` y `resizeMotif`, `ANCHORS`, `LIMITS.maxMotifSide` con `CHART_MOTIF_TOO_LARGE`, `rowShapingColumns` y `validateYarn`. **Hecha 2026-11-06** (revisión de contrato en el [ADR 0003, enmiendas E10 a E13](adr/0003-colorwork-en-esquema-v1.md#enmiendas-tras-t2b-y-t2c-2026-11-06): se aprueban `validateYarn` con `opts` y `maxFloatStitches` como tope; los ajustes van en T2d) | `motor-patrones` | Media (sonnet) | T2 |
| T2c | B | `chart.ts`: `dimensionsCm` con circunferencia real cuando hay máscara (máximo de `rowStitchCount` en el círculo) y `widthIsCircumference`. Caso 20. **Hecha 2026-11-06** (contrato `ChartDimensions` confirmado en E13; `yoke` como circunferencia queda por validar con `experto-tejido` cuando exista el canesú) | `motor-patrones` | Baja (haiku) | T2 |
| T2d | B | Cambios C10 a C16 del [ADR 0003](adr/0003-colorwork-en-esquema-v1.md#cambios-que-aplica-motor-patrones-t2d): `ValidationResult.savable`, `DRAFT_ERROR_CODES` e `isDraftError`; `CHART_SHAPING_IMPOSSIBLE` a advertencia con el mensaje nuevo; `CHART_ROW_EMPTY_FULL` a error de tejido; `validateYarn` con `opts` acotado; `maxFloatStitches` entero ≥ 1; propiedades (las operaciones dejan documentos `savable`, los derivados aceptan `savable`, las opciones no cambian errores); README. Actualizar el caso 8 de [casos de dominio](casos-dominio-colorwork.md) (`documentador` o `qa-tester`). Se hace antes de T4 y T8 | `motor-patrones` | Media (sonnet) | T2b |
| T3 | B | `yarn-catalog`: `suggestedGauge` devuelve `rowsPer10cm = round(puntos × 1,35)` y una marca de baja confianza en la categoría 7. Caso 19. Limpieza de `grosores.json` (regla de oro 9): mover a la fuente los alias con nombre de tienda ("… en Orquídea", "… en Revés Derecho", "(Modista)") y quitar "Baby" y "Roving" de las equivalencias. Los nombres en español no cambian hasta T1b. **Hecha 2026-11-06** | `catalogo-lanas` | Baja (haiku) | T1 |
| T3b | B | Generador de datos de referencia: escribir una migración nueva e idempotente en vez de sobrescribir la ya aplicada; ajustar `reference-sql.test.ts`; aplicar los alias limpios de T3. **Hecha 2026-11-06** (`20261106035603_datos_referencia_v2.sql`; falta aplicarla en el proyecto real) | `backend-supabase` | Media (sonnet) | T3 |
| T3c | B | Perfil: columna `profiles.mirror_knitting boolean not null default false`, con permiso de UPDATE por columna y verificación en `10_rls_check.sql`. Interruptor "Tejer en espejo" en `/cuenta`. **Hecha 2026-11-06** (`20261106035525_tejer_en_espejo.sql`) | `backend-supabase` (migración) y `frontend-editor` (interruptor) | Media (sonnet) / Baja (haiku) | T0 |
| T3d | B | `packages/ai-router` como paquete del workspace: `package.json`, `router.config.ts` a `src/` (así entra en `tsc -p tsconfig.json`), corrección de `model: MODEL_LADDER[capped]` (con `noUncheckedIndexedAccess` es `ModelId \| undefined`) y pruebas de `selectModel`. Actualizar `pnpm-lock.yaml`, porque la CI instala con `--frozen-lockfile`. **Hecha 2026-11-06** | `ia-pipeline` | Baja (haiku) | — |
| T4 | B | Migración de consistencia del título, verificación en `10_rls_check.sql`, prueba del peor tamaño de documento. Capa de datos y Server Actions: crear, guardar con `expectedUpdatedAt`, guardar versión, listar, duplicar y borrar. Guardar decide por `savable`, no por `valid` (ADR 0006, E10). **Hecha 2026-11-06** (`20261106153401_consistencia_titulo.sql`, `apps/web/src/app/disenos/actions.ts`, `apps/web/src/lib/designs/`; peor documento medido: 617 595 bytes de texto de jsonb en la base (269 235 con ASCII) y 576 933 de JSON compacto del cliente (228 573 con ASCII); tope 1 000 000 en la base y 750 000 en el servidor; migración pendiente en el proyecto real; correcciones de la revisión T15 en `20261106153415_publicar_y_cuotas.sql`) | `backend-supabase` | Media (sonnet) | T0, T2d |
| T5 | C | `stitch-render`: disposición (plano, tubo, círculo; `top_down` como rotación de 180°; sentido de giro según la dirección; V abierta hacia donde crece la labor) y `yarnLook` neutro, con pruebas de propiedades (casos 5, 26 y 27) y la guardia de rendimiento en Node. **Hecha 2026-11-06** (desviaciones de contrato aceptadas en el [ADR 0004, E1 a E5 y E8](adr/0004-render-de-puntos-2d.md#enmiendas-tras-t5-y-t6-2026-11-06): una instancia por casilla en plano y tubo, `geometry`, tope de 1.000.000 de instancias, aspecto neutro con `fiberEffects` opcional) | `render-puntos` | Alta (opus) | T2 |
| T6 | C | `stitch-render`: backend Canvas 2D, redibujo incremental, `hitTest`, `snapshot` y página de benchmark. **Hecha 2026-11-06** (ADR 0004, E2, E3, E6 y E7: peor p95 87,8 ms, zoom ≥ 48,5 fps, sin WebGL2; **CA-P6 pendiente**) | `render-puntos` | Alta (opus) | T5 |
| T7 | C | `pattern-render`: `chartToSvg` (numeración según el caso 25) y `describeChart`, con pruebas. **Hecha 2026-11-06** (`DescribeOptions`, `CHART_SVG_MAX_CELLS` y motivo solo aceptados en el [contrato de `pattern-render`](#paquetes-nuevos-y-su-contrato)) | `motor-patrones` | Media (sonnet) | T2 |
| T7b | C | `pattern-core`: exportar `yarnLetter(index)` y usarla en `yarnLabel`; `pattern-render`: usarla y borrar la copia de `xml.ts`. Pedidos de `experto-tejido`: rótulo de numeración alternada con el motivo solo (ida y vuelta, alto impar, `repeat.y > 1`) y numerar solo la fila 1, los múltiplos de 5 y la última con casillas chicas (constante con nombre). Pruebas y README. Antes de T9, que usa la letra en la cuadrícula | `motor-patrones` | Baja (haiku) | T7 |
| T8a | C | Web: agregar `@loopitalab/yarn-catalog` (y luego `stitch-render` y `pattern-render`) a `transpilePackages` en `next.config.ts` y a las dependencias de `apps/web`. Prueba de concepto de que los imports JSON con atributos (`with { type: "json" }`) compilan en Next 16. **Hecha 2026-11-06** | `frontend-editor` | Baja (haiku) | — |
| T8 | C | Web: almacén del documento con historial para deshacer, autoguardado (envía si `savable`; estado "guardado como borrador" si no es `valid`; título y muestra solo se escriben en el documento cuando son válidos, ADR 0006, E10), rutas `/disenos` y `/disenos/nuevo` | `frontend-editor` | Media (sonnet) | T2d, T4, T8a |
| T9 | D | Web: editor de motivo en canvas (herramientas, teclado, numeración, letras por lana) y paneles (repeticiones, forma, dirección, muestra, lanas mínimas, validación, aviso de prototipo). Junto a la vista previa, las limitaciones del render (ADR 0004, E8): orillos y *jog* sin dibujar, color tras una disminución, canesú dibujado como tubo, huecos de "sin punto" en plano y tubo. Letras por lana con `yarnLetter` de `pattern-core`. "Duplicar" no disponible en diseños de IA (ADR 0006, E11) | `frontend-editor` | Media (sonnet) | T7b, T8 |
| T10 | D | Integrar la vista previa en el estudio. Instrumentación `edit-to-paint`. Cumplir CA-P1 a CA-P4 y CA-P7. **Hecha 2026-11-06 salvo CA-P6** (ADR 0004, E7: CA-P1 a CA-P4 cumplidos con CPU ×4; CA-P7 cumplido para el autoguardado, con un ajuste pendiente en la revisión del panel lateral; CA-P6 pendiente en el equipo de referencia). Consultar `layoutInstanceCount` antes de `layoutGeometry` (tope de 1.000.000; sobre 40.000 instancias, aviso de que la respuesta no es instantánea). Usar solo el contrato estable de `stitch-render` (ADR 0004, E5). Medir CA-P6 en el equipo de referencia | `render-puntos` con `frontend-editor` | Alta (opus) | T6, T9 |
| T11 | D | Accesibilidad: teclado, lector de pantalla, daltonismo, tejido en espejo y tableta (CA-A1 a CA-A3) | `ux-accesibilidad` | Media (sonnet) | T9 |
| T12 | D | Textos de la interfaz con la terminología del [glosario pendiente](#glosario-pendiente) (provisional hasta T1b): aviso de prototipo, ayuda del estudio, limitación de las disminuciones, huecos de "sin punto", muestra supuesta en punto jersey, limitaciones del render (orillos, *jog*, color tras una disminución, canesú como tubo; ADR 0004, E8) | `documentador` | Baja (haiku) | T1 |
| T13 | B | Jobs de CI para `stitch-render`, `pattern-render` y `ai-router`, y el E2E de latencia con Playwright (coordinado con quien edita `ci.yml`). **Hecha 2026-11-06, con alcance `/dev/estudio`** (sin sesión ni Supabase): `@playwright/test` 1.64.1, 26 pruebas en `apps/web/e2e/` (editor, teclado, lanas, muestra, formas, avisos, accesibilidad, móvil 390 px y latencia de CA-P1, CA-P3 y CA-P7 en las tres formas), job "E2E (estudio)" en la CI y acciones fijadas por SHA (seguridad B6). Los jobs de `stitch-render`, `pattern-render` y `ai-router` ya estaban en el job "Núcleo". Ver `apps/web/e2e/README.md`. **Pendiente:** E2E con sesión (proyecto Supabase de pruebas o Supabase local con Docker) | `devops` | Media (sonnet) | — |
| T14 | E | QA: propiedades, los 27 casos de dominio (CA-F11), E2E funcional y de latencia. Revisión con opus de T2, T5, T6 y T10 (no se revisa con un modelo inferior cuando la complejidad es alta); sonnet para el resto **Hecha 2026-11-08**: `docs/qa-fase-2.md` (27 casos con prueba, matriz de criterios; pendientes no-código: CA-P6, E2E con sesión, lector de pantalla real, T1b). | `qa-tester` | Alta (opus) / Media (sonnet) | T10, T11, T13 |
| T15 | E | Revisión de seguridad: Server Actions de guardado (validación en el servidor, tamaño, concurrencia, RLS) y las migraciones (título, `mirror_knitting`, datos de referencia) **Hecha 2026-11-08**: sección "Revisión final de la fase 2 (T15)" de `docs/seguridad.md`; Google activo con riesgo aceptado, Microsoft apagado. | `revisor-seguridad` | Media (sonnet) | T3b, T3c, T4, T8 |
| T16 | E | Revisión final de la lógica de tejido: conteos, disminuciones, lectura y textos Espera las respuestas de T1b. | `experto-tejido` | Media (sonnet) | T1b, T14 |
| T17 | E | Actualizar el README (estado de la fase 2), este roadmap y los ADR a "aceptada" con las enmiendas que hayan surgido **Hecha 2026-11-08** (README, roadmap y ADR 0003 a 0006 aceptados con sus enmiendas); se completa tras T16. | `arquitecto` + `documentador` | Baja (haiku) | T16 |

### Criterios de salida de la fase 2

- CA-P1 a CA-P7, CA-F1 a CA-F10 y CA-A1 a CA-A3 cumplidos, con la evidencia en el PR (mediciones, capturas de las tres formas, informe de QA).
- `pnpm test` y `pnpm typecheck` en verde (incluido `ai-router`), y la CI corriendo de verdad en el repositorio nuevo.
- T1b cerrada: lo marcado "validar con tejedora" está confirmado o corregido.
- `experto-tejido`, `qa-tester` y `revisor-seguridad` aprueban.
- Los ADR 0003 a 0006 quedan en estado "aceptada" o enmendados.

---

## Fase 3 en detalle

Planificada el 2026-11-09 por `arquitecto` sobre `main` (fase 2 completa en código). Decisiones en el [ADR 0007](adr/0007-follow-secuencia-de-colorwork.md) (`follow`), el [ADR 0008](adr/0008-lanas-selector-aspecto-y-metraje.md) (lanas) y el [ADR 0009](adr/0009-tejer-este-diseno-y-proyectos.md) (proyectos y avance), los tres **aceptados** el 2026-11-09 y enmendados tras la revisión de dominio T1 (sección "Enmiendas tras la revisión de dominio T1" de cada ADR). Los casos de prueba de dominio están en [casos-dominio-fase-3.md](casos-dominio-fase-3.md). En esta sección, "T*n*" son las tareas de la fase 3; las de la fase 2 se citan como "T1b de la fase 2".

### Alcance

**Dentro**

- **3A. Lanas del diseño, versión completa** (ADR 0008):
  - **grosor** CYC 0 a 7 con el nombre de LoopitaLab, los nombres en inglés y los alias (los de tienda, como equivalencia aproximada y sin nombrar la tienda), con búsqueda por cualquiera de ellos; sugerencia de agujas, crochet y muestra inicial, marcada "supuesto" hasta que la usuaria ingrese la suya;
  - **composición** con fibras del catálogo y porcentajes, validada (no entra al documento si no suma 100 %);
  - **color**: paleta propia de 8 × 6 como cuadrícula navegable, o personalizado con el color de la paleta más cercano (CIEDE2000) como sugerencia;
  - **vista previa al pasar el cursor o el foco** por un color o una lana guardada, sin tocar el documento, en menos de 100 ms;
  - **aspecto por fibra** (`fiberEffects`) activado por defecto, tras calibrarlo y medirlo; interruptor "Colores planos" (deseable);
  - **lanas guardadas** ("Mis lanas", tabla `user_yarns`): guardar desde el diseño, usar en un diseño (copia por valor), editar y borrar; marca solo como nota privada (regla de oro 9);
  - **metraje estimado por lana** en metros, con rango y la lista de supuestos, siempre rotulado "estimación".
- **3B. Seguimiento de colorwork fila a fila** (ADR 0007 y 0009):
  - paquete `packages/follow`, primera versión (gráficos);
  - **"Tejer este diseño"**: crea un proyecto con la versión fijada (solo diseños propios y `valid`, verificado en el servidor);
  - pantalla **"Tejiendo"**: fila actual resaltada en el gráfico y en la vista previa; número, lado, sentido de lectura (con espejo opcional), puntos, tramos de color por repetición, disminuciones y aumentos; avanzar y retroceder por fila y, opcionalmente, por repetición; avance en filas y en puntos;
  - **uso con una mano**: botones grandes en la zona del pulgar, del lado de la mano dominante (`profiles.dominant_hand`, que aquí sí aplica: es ubicación de controles, no espejo), teclado y pasapáginas (Espacio, Enter, flechas, Re Pág y Av Pág);
  - **pantalla encendida** con la API Wake Lock mientras "Tejiendo" está visible, con interruptor y aviso si el navegador no la admite;
  - **sincronización entre dispositivos** con concurrencia optimista y conflictos explícitos; **cortes de conexión** con la página abierta;
  - "Pasar a la versión actual" del diseño, con reubicación del puntero y aviso de qué cambia (deseable dentro de la fase);
  - `/proyectos` muestra el diseño, la versión y el avance; `/proyectos/[id]` como detalle.
- **Pendientes de la fase 2 que se cierran aquí** (ver más abajo): E2E con sesión, T1b de la fase 2, mapeo de topes (54000) en proyectos.

**Fuera** (fase en que entra)

| Tema | Fase |
|---|---|
| Seguir patrones escritos (amigurumi) punto a punto, 3D parcial | 6 |
| Contadores personalizados, temporizador, tiempo estimado, notas del proyecto en "Tejiendo" | 6 |
| Abrir "Tejiendo" sin conexión (service worker, PWA) | 6 |
| Avance punto a punto en colorwork (el contrato ya lo admite) | 6 |
| Gramos, ovillos necesarios y metros por ovillo de la lana propia | 6 o 7, como dato privado del proyecto (decisión abierta) |
| Metraje en crochet (no hay factores validados) | Con el crochet tapestry, después de la fase 4 |
| Proyectos sobre patrones públicos ajenos | 7 |
| Historial de versiones (ver, comparar, restaurar) | 7. En la fase 3 solo se muestra "versión N" y si hay una más nueva |
| Tiempo real entre dispositivos (Realtime, CRDT) | No previsto (ADR 0009) |
| Paquete `glossary` | 4. Los textos de la fase 3 usan el glosario pendiente, provisional |
| Marcas, códigos o fotos de productos | Nunca (regla de oro 9) |

### Historias de usuaria

| ID | Historia |
|---|---|
| HU3-01 | Como tejedora, busco el grosor por el nombre que conozco ("aran", "DK", "mediano") y veo las agujas, el crochet y una muestra sugerida marcada como supuesto. |
| HU3-02 | Defino la composición con fibras y porcentajes, y la plataforma no me deja usar una que no suma 100 %. |
| HU3-03 | Elijo un color de la paleta o uno propio, y veo qué color de la paleta se le parece más. |
| HU3-04 | Paso el cursor (o el foco) por los colores y veo al instante cómo quedaría el tejido, sin cambiar mi diseño hasta que elijo. |
| HU3-05 | Veo el halo del mohair, el brillo de la seda y la definición del algodón en la vista previa, y puedo volver a colores planos. |
| HU3-06 | Guardo mis lanas y las reutilizo en otros diseños; anoto la marca o dónde la compré en una nota que solo yo veo. |
| HU3-07 | Veo cuántos metros necesito, más o menos, de cada lana, con lo que se supuso para calcularlo. |
| HU3-08 | Pulso "Tejer este diseño" y empiezo un proyecto que no cambia aunque siga editando el diseño. |
| HU3-09 | En "Tejiendo" veo la fila actual resaltada en el gráfico y en la vista previa, con su número, el lado, el sentido de lectura, los puntos, los colores y las disminuciones. |
| HU3-10 | Avanzo y retrocedo con un toque y con una sola mano, con el teclado o con un pasapáginas, y llevo la cuenta de las repeticiones dentro de la vuelta. |
| HU3-11 | La pantalla no se apaga mientras tejo. |
| HU3-12 | Retomo en otro dispositivo donde quedé; si avancé en dos a la vez, se me pregunta con cuál sigo. |
| HU3-13 | Si se corta la conexión, sigo avanzando y el avance se guarda cuando vuelve. |
| HU3-14 | Si tengo activado "tejer en espejo", las filas se me indican en el sentido en que tejo. |
| HU3-15 | Si cambié el diseño después de empezar, puedo pasar a la versión nueva sabiendo qué cambia en la fila donde voy. |

### Criterios de aceptación medibles

**Rendimiento (regla de oro 7)**. Mismo escenario y método que la fase 2 (ADR 0004): Playwright en Chromium, CPU ×4, motivo de 20 × 20 con repeticiones de 10 × 10 (40.000 puntos), plano, tubo, círculo y copa; **con `fiberEffects` activado**.

| ID | Criterio |
|---|---|
| CA3-P1 | Vista previa al pasar el cursor por 50 colores distintos: p95 de `hover-to-paint` < 100 ms en las cuatro formas |
| CA3-P2 | Con `fiberEffects` activado, CA-P1 a CA-P4 de la fase 2 se siguen cumpliendo (sin regresión) |
| CA3-P3 | "Tejiendo": 50 avances de fila, p95 desde la entrada hasta que la fila resaltada se pinta en la cuadrícula y en la vista previa < 100 ms |
| CA3-P4 | La vista previa al pasar el cursor no cambia el documento (misma referencia), no agrega pasos de deshacer, no dispara autoguardado ni validación (E2E y unitaria) |
| CA3-P5 | Metraje y validación corren diferidos (`paintGate`): 0 cálculos dentro de la ventana de una edición o de una vista previa (extiende CA-P7) |
| CA3-P6 | `follow` en Node: `stepAt` con un motivo de 200 de ancho < 1 ms; `planChart` no depende de `repeat.y` (guardia en la CI, como CA-P5) |

**Lanas (3A)**

| ID | Criterio |
|---|---|
| CA3-L1 | El selector muestra las 8 categorías con nombre, nombres en inglés y alias. Buscar "aran", "worsted", "dk", "fingering", "mediano" y "grueso" encuentra la categoría correcta; los alias de tienda se rotulan como equivalencia aproximada y no nombran la tienda |
| CA3-L2 | Una composición que no suma 100 ± 0,01, con un porcentaje ≤ 0 o con más de 10 fibras no entra al documento ni a `user_yarns`; el servidor la rechaza aunque se llame directo (prueba de la acción y de la base) |
| CA3-L3 | La paleta muestra las 48 muestras en 8 × 6 con su nombre accesible; se recorre con flechas; el seleccionado se distingue sin depender del color |
| CA3-L4 | Con un color personalizado se muestra el más cercano de la paleta con su nombre (de `nearestPaletteColor`); "Usarlo" deja `paletteId`; un hex fuera de la paleta nunca lleva `paletteId` |
| CA3-L5 | Al salir, perder el foco o pulsar Esc, la vista previa vuelve al diseño; elegir crea exactamente un paso de deshacer |
| CA3-L6 | Con `fiberEffects`: halo visible en mohair y alpaca, brillo en seda, viscosa, bambú y lurex, definición en algodón y acrílico, ponderados por porcentaje; cambiar solo un porcentaje actualiza el aspecto. Capturas de Playwright de las cuatro formas en el PR |
| CA3-L7 | La muestra sugerida por el grosor se rotula "supuesto" y no se escribe en el documento hasta que la usuaria ingresa la suya (CA-F4 sigue vigente) |
| CA3-L8 | Mis lanas: guardar, usar en un diseño (un paso de deshacer), editar y borrar. La nota no se copia al diseño salvo que se marque. El tope de 500 se informa con un mensaje claro |
| CA3-L9 | El metraje se muestra siempre como "≈ N m (entre L y H m), estimación" con sus supuestos visibles, dice "supuesto" si la muestra es supuesta y aclara "solo del gráfico: no incluye elástico, montaje ni remate" (ADR 0008, enmienda T1-6). Revisión de código: ninguna cifra de metraje se calcula en `apps/web` (solo `yarnUsage` y `estimateYarnLength`) |
| CA3-L10 | Las propiedades de `yarnUsage` y `estimateYarnLength` del ADR 0008 pasan con tres semillas |
| CA3-L11 | Ningún dato nuevo de `yarn-catalog` contiene marcas ni nombres de tienda fuera del campo de fuente (prueba automática sobre los JSON) |

**Seguimiento (3B)**

| ID | Criterio |
|---|---|
| CA3-T1 | "Tejer este diseño" está en el estudio y en "Mis diseños". Con errores de tejido aparece deshabilitado con el motivo. El servidor rechaza con `NOT_KNITTABLE` un diseño no `valid` aunque se llame directo, y con `CONFLICT` si el diseño cambió entre la validación y la fijación |
| CA3-T2 | Empezar un segundo proyecto con el mismo diseño sin cambios reutiliza la versión (no crea otra fila en `pattern_versions`); con cambios, crea una |
| CA3-T3 | La fila resaltada es la misma en la cuadrícula y en la vista previa, en las cuatro formas y en `top_down`. Numeración y flecha de lectura iguales a las del editor y del SVG (ADR 0003, E18), con y sin espejo |
| CA3-T4 | Avanzar y retroceder funcionan con botones, Espacio, Enter, flechas, Re Pág y Av Pág, y por repetición; el último avance se puede deshacer |
| CA3-T5 | El puntero sobrevive a recargar y a cambiar de dispositivo: E2E con sesión con dos contextos de navegador |
| CA3-T6 | Avance concurrente en dos contextos: nunca se pisa en silencio. Con punteros iguales no hay aviso; con punteros distintos se pregunta y la elección se respeta. Cambiar de versión en un contexto hace que el otro reciba `VERSION_CHANGED` y recargue |
| CA3-T7 | Sin conexión con la página abierta: se sigue avanzando, el estado lo dice, y al volver la conexión el avance se guarda. El avance local se guarda bajo la clave de la usuaria, se borra al cerrar sesión y al eliminar la cuenta, y caduca a los 14 días |
| CA3-T8 | Editar el diseño después de empezar no cambia el proyecto (E2E). El proyecto avisa que hay una versión más nueva; pasar a ella mantiene el número de fila acotado y avisa si la fila cambió |
| CA3-T9 | Un diseño con proyectos no se puede borrar (también por PostgREST directo) y el mensaje lo explica; borrar la cuenta con diseños y proyectos sigue funcionando (`10_rls_check.sql`) |
| CA3-T10 | Wake Lock: se pide al mostrar "Tejiendo", se vuelve a pedir al volver a la pestaña, se suelta al salir; interruptor visible; aviso si no está disponible |
| CA3-T11 | En 390 px de ancho, avanzar, retroceder y la repetición están en el 40 % inferior de la pantalla, con objetivos táctiles de al menos 56 × 56 px, del lado de `dominant_hand` |
| CA3-T12 | Las propiedades P1 a P16 de `follow` (ADR 0007; P16 de la enmienda T1-3) pasan con tres semillas |
| CA3-T13 | Revisión de código: los puntos, cambios, tramos y avances de "Tejiendo" salen de `follow` y `pattern-core`; ninguno se calcula en `apps/web` |
| CA3-T14 | El cliente no puede escribir `pattern_id` ni `pattern_version_id` de un proyecto (check de RLS); `pattern_version` ya no existe (ADR 0009, enmienda T1-9) |
| CA3-T15 | "Tejer este diseño" muestra la pantalla previa (ADR 0009, enmienda T1-7; caso F3-39) con muestra, metraje por lana (solo palillo), advertencias, forma de trabajo, lo que no está en el gráfico y aviso de prototipo; ninguna cifra se calcula en `apps/web` |
| CA3-T16 | Los textos de "Tejiendo", conflictos y `/proyectos` dicen "vuelta" en redondo y "fila" en ida y vuelta; al terminar dicen "Gráfico terminado" y recuerdan rematar o cerrar; en filas con disminuciones el contador dice "casilla N de M" (ADR 0007, enmiendas T1-2 a T1-5) |

**Accesibilidad**

| ID | Criterio |
|---|---|
| CA3-A1 | "Tejiendo" se usa entero con teclado y con lector de pantalla. Cada cambio de fila se anuncia (`aria-live`): número, lado, sentido, puntos y lanas |
| CA3-A2 | El selector de color y "Mis lanas" se usan solo con teclado; cada muestra tiene el nombre del color y la letra de la lana que se edita |
| CA3-A3 | "Tejiendo" se lee con el texto al 200 % sin perder controles; respeta `prefers-reduced-motion`; contraste WCAG 2.2 AA, incluida la fila resaltada |

### Cambios al modelo canónico (`pattern-core`)

- **Sin cambio de forma del documento: `schemaVersion` sigue en 1.** Nada de la fase 3 lo necesita: el puntero vive en `project_progress`, la versión fijada en `pattern_versions`, las lanas guardadas en `user_yarns`, y el metraje y la secuencia son derivados. Agregar un nombre o una marca de lana, o enlazar con `user_yarns`, sí exigiría `schemaVersion: 2` y se descarta (ADR 0008).
- **Derivado nuevo**: `yarnUsage(chart, yarnCount): { stitches, floatStitches }` (ADR 0008, sección 6), con propiedades. `stitches` es igual a `yarnTotals`.
- **Regla para el futuro** (ADR 0007, sección 5): toda migración que cambie la secuencia de filas de un documento viene con su migración de puntero en `follow`.

### Paquetes nuevos y su contrato

| Paquete | Qué hace | Depende de | Contrato |
|---|---|---|---|
| `packages/follow` | Secuencia de pasos del modo tejiendo derivada del modelo. Fase 3: filas de un gráfico. Fase 6: patrones escritos | Solo `pattern-core`. Sin terceros | `planChart`, `stepAt`, `position`, `startPointer`, `clampPointer`, `isFinished`, `nextRow`, `prevRow`, `nextRepeat`, `prevRepeat`, `remapPointer`; tipos `ChartPlan`, `ChartStep`, `ColorRun`, `ChartPointer`, `ChartPosition`, `RemapResult` ([ADR 0007](adr/0007-follow-secuencia-de-colorwork.md), sección 3) |

Puntero (lo único que se guarda del avance):

```ts
export interface ChartPointer {
  /** Filas terminadas, 0 … totalRows. La fila actual es rowsDone; rowsDone === totalRows es "terminado". */
  rowsDone: number;
  /** Puntos tejidos de la fila actual, 0 … stitches − 1. En la fase 3, múltiplos de stitchesPerRepeat. */
  stitchesDone: number;
}
```

Misma convención que el núcleo: TypeScript sin compilar, `exports` a `src/index.ts`, `node:test`, generador de propiedades con semilla. Se agrega al job "Núcleo" de la CI y a `transpilePackages` de `apps/web`.

**Funciones nuevas en paquetes existentes**:

| Paquete | Agrega | ADR |
|---|---|---|
| `pattern-core` | `yarnUsage`, `YarnUsage` | 0008 |
| `yarn-catalog` | `findWeights`, `WeightMatch`, `nearestPaletteColors`, `NEAR_COLOR_DELTA_E`, `YARN_LENGTH_ASSUMPTIONS`, `estimateYarnLength`, `LengthEstimate`, `LengthAssumption`; primeras pruebas de propiedades del paquete | 0008 |
| `stitch-render` | Sin cambio de contrato: se activa `fiberEffects` y se calibran los niveles. `setPreviewOverride` y `setHighlightRow` ya existen | 0004 (E4), 0008 |
| `apps/web` (aplicación) | `PreviewEngine.previewYarn(index, candidate)`; clave de aspectos con grosor y porcentajes; códec del puntero (`lib/projects/progress-codec.ts`); cola local del avance; mapeo fila ↔ `Yarn` de `user_yarns` (`lib/yarns/`) | 0008, 0009 |

### Pantallas de `apps/web`

| Ruta | Contenido |
|---|---|
| `/disenos/[id]` | Estudio: selector de lanas completo (grosor con búsqueda, composición, paleta 8 × 6, personalizado con color cercano, pestaña "Mis lanas"), vista previa al pasar el cursor, aspecto por fibra, panel "Metraje estimado" por lana y total, botón "Tejer este diseño" |
| `/disenos` | "Tejer" por diseño y cuántos proyectos tiene. Borrar un diseño con proyectos explica por qué no se puede |
| `/lanas` | "Mis lanas": lista (muestra de color, grosor, composición, extracto de la nota), editar, borrar, tope |
| `/proyectos` | Lista: título, diseño, "versión N", "Vuelta 34 de 120" (total con `fullSize` de `pattern-core` a partir de rutas JSON de la versión, sin leer el documento completo), estado. Los proyectos sin patrón siguen como hoy |
| `/proyectos/[id]` | Detalle: diseño y versión, avance, "Seguir tejiendo", "Pasar a la versión actual" (si hay una más nueva), estado, borrar |
| `/proyectos/[id]/tejer` | "Tejiendo" (abajo) |

**"Tejiendo"** (`modo-tejiendo` con `frontend-editor`; revisa `ux-accesibilidad`):

- **Tarjeta de la fila actual**: "Vuelta 34 de 120" (o "Fila" en ida y vuelta, glosario), lado ("por el derecho" o "por el revés"), flecha y texto del sentido de lectura, puntos ("80 pts"), cambio ("−8, 1 por repetición") y dónde se pierde un punto, lanas de la fila, tramos ("3 A · 2 B · 3 A, 8 veces"), fila del motivo y repetición vertical.
- **Gráfico**: el gráfico completo en una ventana centrada en la fila actual, con la fila 1 abajo como en el editor, la fila resaltada, las terminadas atenuadas y la repetición horizontal en curso marcada si se usa el contador. Mismo dibujo que el editor, en modo de solo lectura.
- **Vista previa** (`stitch-render`) con `setHighlightRow(step.row)`, con el aviso de prototipo digital (regla de oro 8).
- En teléfono, gráfico y vista previa en pestañas; la tarjeta y los botones siempre visibles.
- **Controles en la zona del pulgar**: "Fila terminada" (grande), "Atrás", "Repetición hecha" (si la fila tiene más de una repetición), aviso "Deshacer" tras cada avance. Del lado de `dominant_hand`.
- **Avance**: barra de filas y "2.680 de 9.600 pts" (de `position`). Al terminar, propone marcar el proyecto como terminado.
- **Estado del guardado** del avance (guardado, guardando, sin conexión, conflicto) y diálogo de conflicto (ADR 0009, sección 4).
- **Pantalla encendida**: interruptor, activado por defecto (decisión 6 abajo).

Lo que vive en cada capa:

| Capa | Contenido |
|---|---|
| Dominio | `follow`, `pattern-core` (`yarnUsage`), `yarn-catalog` (búsqueda, color cercano, metros), `stitch-render/layout` y `look` |
| Aplicación | Códec del puntero, cola del avance y su resolución de conflictos, almacén del estudio con `previewYarn`, mapeo de `user_yarns`, Server Actions |
| Infraestructura | Supabase (tablas, funciones `start_chart_project` y `repin_project`), `localStorage`, canvas, Wake Lock |

### Persistencia en Supabase

Detalle en el [ADR 0009](adr/0009-tejer-este-diseno-y-proyectos.md) y el [ADR 0008](adr/0008-lanas-selector-aspecto-y-metraje.md), sección 5.

- **Lanas guardadas**: `user_yarns` sin cambios de esquema (ya tiene grosor, composición validada, color, `palette_id` y nota ≤ 200, RLS y tope de 500). Server Actions que validan con `validateYarn` y normalizan la nota. Copia por valor; la nota no pasa al diseño salvo que se pida.
- **Fijar la versión** (migración nueva):
  - `projects.pattern_version_id → pattern_versions(id)` con `on delete no action`: un diseño con proyectos no se borra; borrar la cuenta sigue funcionando;
  - consistencia versión ↔ `pattern_id`;
  - el cliente ya no escribe `pattern_id`, `pattern_version` ni `pattern_version_id`; `pattern_version` (entero) queda en desuso o se elimina tras comprobar la base real;
  - `start_chart_project` (bloquea el diseño, exige dueña, `kind = 'chart'` y `updated_at` exacto, reutiliza la última versión idéntica o crea una con los topes de `snapshot_pattern()`, crea el proyecto y su avance inicial) y `repin_project`;
  - las dos funciones entran en la lista permitida del check.
- **Puntero en `project_progress`**: `round_number = rowsDone + 1` (`totalRows + 1` = terminado), `stitch_index = stitchesDone`, `part_id = null`; CHECK de cotas generales; la cota exacta la aplica `clampPointer` al leer. `device` no se usa.
- **Sincronización entre dispositivos**: concurrencia optimista con `project_progress.updated_at` (como el autoguardado, ADR 0006 E11); escritura agrupada (una en vuelo, el último puntero, 800 ms o al ocultarse la página); conflicto explícito salvo punteros iguales; relectura al volver a la pantalla; `VERSION_CHANGED` si otro dispositivo cambió la versión fijada.
- **Sin conexión**: cola local de un solo puntero por proyecto (`loopitalab:<uid>:avance:<projectId>`), con las reglas del respaldo del estudio (T15 de la fase 2).
- **Qué exige `valid`**: empezar y cambiar de versión, verificado en el servidor sobre el documento leído de la base (ADR 0006, E10). Abrir un proyecto exige `savable`; guardar el avance no depende del documento.
- **Cuotas**: empezar un proyecto puede gastar una versión (200 por diseño, 5000 por usuaria) y un proyecto (1000); la reutilización de la versión idéntica evita gastar versiones de más. Los 54000 se traducen a mensajes.

### Pendientes de la fase 2 que afectan a la fase 3

| Pendiente | Impacto en la fase 3 | Dónde se resuelve |
|---|---|---|
| E2E con sesión (T13 de la fase 2) | Sin él no se verifican CA3-T5, CA3-T6, CA3-T8 ni CA3-T9 | T2 |
| CA-P6 en el equipo de referencia | El margen de latencia es de unos 10 ms y la fase 3 agrega carga (fibras, vista previa, resaltado). La medición manual incluye los escenarios nuevos | T15 (la usuaria mide) |
| T1b de la fase 2 (tejedoras) | La lectura con y sin espejo, la numeración de casillas (E18) y los nombres de grosores que muestra el selector vienen de ahí | T1b |
| T16 de la fase 2 (`experto-tejido`) | Espera a T1b; sus correcciones de lectura afectan a `follow` | Antes de T4, si llega a tiempo; si no, en T18 |
| `fiberEffects` apagado por defecto (ADR 0004, E4) | Se activa en esta fase, después de calibrar y medir | T6, T8 |
| Proporciones de filas en crochet (1,2 y 0,6) por validar | No bloquea: la fase 3 es palillo. El selector las muestra como supuesto y el metraje en crochet queda fuera | T1b |
| Umbrales provisionales (`ringDistortion`, cuñas, 1,35) | La vista de "Tejiendo" reutiliza los avisos del estudio; no se agregan umbrales nuevos sin constante con nombre | T1b |
| Topes 54000 sin mensaje en `app/proyectos/actions.ts` y migración `20261109024823` en el proyecto real | Empezar un proyecto puede chocar con los topes | T3 (hecha el 2026-11-09; queda aplicar `20261111031138_revocar_execute_triggers.sql` en el proyecto real) |
| ADR 0006, E10: tejer exige `valid` en el servidor | Se implementa en `startProjectFromDesign` y `start_chart_project` | T7, T11 |

### Qué depende de `experto-tejido` o de T1b

- **`experto-tejido` antes de implementar (T1, hecha el 2026-11-09)**: casos en [casos-dominio-fase-3.md](casos-dominio-fase-3.md) y correcciones registradas como enmiendas en los ADR 0007 (T1-2 a T1-5), 0008 (T1-1, T1-6 y T1-8) y 0009 (T1-2, T1-7 y T1-9). Temas revisados: orden de la secuencia (siempre desde la fila 0, también en `top_down`); lado y sentido con y sin espejo; tramos por repetición sin fusionar; "terminado" y la propuesta de marcar el proyecto; factor 3,8, holgura 10 %, margen 10 %, rango 0,85 a 1,2 y regla de las hebras de orillo a orillo del metraje; niveles de halo, brillo y definición de `fibras.json`; alias de tienda como equivalencia aproximada; textos de "Tejiendo". Produce `docs/casos-dominio-fase-3.md` con casos numerados para QA.
- **Tejedoras (T1b, con cuentas propias en la plataforma; después de T1c)**: la lista "Pendiente de validar por tejedora" de [casos-dominio-fase-3.md](casos-dominio-fase-3.md#pendiente-de-validar-por-tejedora), más lectura en "Tejiendo" con y sin espejo, utilidad del contador de repeticiones, tramos ("3 A · 2 B"), metraje comparado con 2 o 3 proyectos reales, realismo del halo y el brillo, nombres de grosores y alias.
- **`experto-tejido` al cierre (T18)**: aprobación final de la lógica de tejido con las respuestas de T1b.

### Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R3-1 | `fiberEffects` y la vista previa al pasar el cursor superan los 100 ms en el círculo de 40.000 puntos (margen actual de unos 10 ms) | Medición temprana en T8 antes de construir la interfaz; baldosas y niveles de detalle del backend; criterio de WebGL2 del ADR 0004 con enmienda si hace falta |
| R3-2 | La API Wake Lock no está en todos los navegadores o el sistema la suelta (batería baja) | Se vuelve a pedir al volver a la pestaña; estado visible; aviso si no hay soporte; nunca se promete |
| R3-3 | Los conflictos de avance confunden | Sin aviso cuando los punteros coinciden; texto con las dos posiciones y la hora; pruebas E2E con dos contextos |
| R3-4 | El metraje estimado se aleja del real | Rango y supuestos visibles, margen, "estimación" siempre; comparación con proyectos reales en T1b; constantes con nombre |
| R3-5 | No poder borrar un diseño con proyectos frustra | Mensaje con la cantidad de proyectos y enlace a ellos; decisión 2 abajo |
| R3-6 | La fase 2 deja pendientes que bloquean (E2E con sesión, T1b, CA-P6) | T2, T1b y T3 en el grupo A, al inicio |
| R3-7 | La Ley 21.719 entra en vigencia el 1 de diciembre de 2026; validar con tejedoras usando cuentas en la plataforma es una beta con personas externas | Decidido (punto 9 de las decisiones de la fase 3): validar con cuentas propias, después de T1c (privacidad, términos, revisión legal y lista "antes de beta" de `docs/seguridad.md`). T1b depende de T1c |
| R3-8 | Cuotas: empezar proyectos gasta versiones | Reutilización de la versión idéntica; mensajes claros de tope |
| R3-9 | La lectura o los tramos no coinciden con lo que esperan las tejedoras (en especial con espejo) | `experto-tejido` antes (T1) y al cierre (T18); T1b; datos de `follow` independientes de los textos |
| R3-10 | El avance local en `localStorage` no está cifrado | Solo contiene números y la clave del proyecto; mismas reglas de limpieza que el respaldo del estudio (riesgo ya aceptado en BAJO-2 de T15) |
| R3-11 | Paquete nuevo en TypeScript sin compilar en Next 16 | Igual que `stitch-render` y `pattern-render` (`transpilePackages`); prueba al inicio de T12 |

### Desglose de tareas

El orden es el de ejecución. Las tareas con la misma letra de grupo pueden ir en paralelo. Complejidad y modelo según la tabla de `CLAUDE.md`. QA y seguridad van al final (grupo E); `experto-tejido` revisa la lógica de tejido antes (T1) y al cierre (T18).

| # | Grupo | Tarea | Agente | Complejidad (modelo) | Depende de |
|---|---|---|---|---|---|
| T0 | A | **Hecha (2026-11-09)**. La usuaria aprueba los ADR 0007 a 0009 y las [decisiones de la fase 3](#decisiones-de-la-fase-3-aprobadas-el-2026-11-09) | (usuaria) | — | — |
| T1 | A | **Hecha (2026-11-09)**. Revisión de dominio de la fase 3 (lista en "Qué depende de `experto-tejido` o de T1b"). Produjo [casos-dominio-fase-3.md](casos-dominio-fase-3.md). Las correcciones quedaron como enmiendas a los ADR 0007, 0008 y 0009 (`arquitecto`) | `experto-tejido` | Media (sonnet) | — |
| T1c | A | Preparar la beta con tejedoras: completar `/privacidad` y `/terminos` con los datos de la responsable y pasar la revisión legal; resolver la lista "antes de beta" de [`docs/seguridad.md`](seguridad.md) | usuaria + `documentador` + `revisor-seguridad` | Media (sonnet) | T0 |
| T1b | A | Ampliar `docs/validacion-tejedoras.md` con los temas de la fase 3 (incluida la lista "Pendiente de validar por tejedora" de [casos-dominio-fase-3.md](casos-dominio-fase-3.md#pendiente-de-validar-por-tejedora)) y cerrar, junto con T1b de la fase 2, antes de T18. Se hace **con cuentas propias en la plataforma** (punto 9 de las decisiones de la fase 3): es una beta con personas externas y exige la revisión legal previa de T1c | `experto-tejido` con la usuaria | Media (sonnet) | T1, T1c |
| T2 | A | E2E con sesión: Supabase local (Docker) en la CI con todas las migraciones y usuarias de prueba, o un proyecto de pruebas; sesión reutilizable de Playwright; dos contextos de navegador. Sin claves en el repositorio | `devops` | Media (sonnet) | — |
| T3 | A | **Hecha (2026-11-09)**: mensajes de los 54000 en proyectos (`app/proyectos/actions.ts`, `lib/project-messages.ts`), migración de cuotas aplicada y `projects.pattern_version` sin datos (2 proyectos, 0 con valor). Nueva migración `20261111031138_revocar_execute_triggers.sql`, **aplicada en el proyecto real el 2026-11-11**. Encargo original: aplicar `20261109024823` en el proyecto real y repetir `10_rls_check.sql`; mapear 54000 en `app/proyectos/actions.ts`; comprobar en la base real que `projects.pattern_version` no tiene datos | `backend-supabase` | Baja (haiku) | — |
| T4 | B | `packages/follow` (ADR 0007 con sus enmiendas): API (con `ChartPlan.technique`), propiedades P1 a P16, casos F3-1 a F3-13, guardia de rendimiento, README, job de CI y `transpilePackages` | `modo-tejiendo` | Alta (opus) | T0, T1 |
| T5 | B | `pattern-core`: `yarnUsage` con la regla de flotantes por `workedIn` y sus propiedades (ADR 0008, sección 6 y enmienda T1-1; casos F3-14 a F3-20) y README | `motor-patrones` | Media (sonnet) | T0, T1 |
| T6 | B | `yarn-catalog` (ADR 0008 con las enmiendas T1-6 y T1-8): `findWeights`, `weightQueryHint`, `nearestPaletteColors`, `NEAR_COLOR_DELTA_E`, `YARN_LENGTH_ASSUMPTIONS`, `estimateYarnLength`, soporte de propiedades y propiedades; revisión de los niveles de `fibras.json` con lo que dicte T1; prueba de marcas en los JSON (CA3-L11) | `catalogo-lanas` | Media (sonnet) | T0, T1 |
| T7 | B | Migración de proyectos con versión fijada (ADR 0009, secciones 1 y 2, y enmienda T1-9): columna, eliminar `projects.pattern_version` (sin datos), `no action`, consistencia, permisos por columna, cotas, `start_chart_project`, `repin_project`, lista permitida y verificaciones en `10_rls_check.sql` (incluidos borrar un diseño con proyectos y borrar la cuenta) | `backend-supabase` | Alta (opus) | T0, T3 |
| T8 | C | `stitch-render` y `PreviewEngine`: calibrar `fiberEffects` con los niveles de T6, activarlo, clave de aspectos con grosor y porcentajes, `previewYarn` con instrumentación `hover-to-paint`. **Primero** una medición de CA3-P1, CA3-P2 y CA3-P3 en el círculo con CPU ×4; si falla, enmienda del ADR 0004 (WebGL2) antes de seguir | `render-puntos` | Alta (opus) | T0, T6 |
| T9 | C | Selector de lanas completo (ADR 0008, secciones 2 a 4), panel de metraje e interruptor "Colores planos" | `frontend-editor` | Media (sonnet) | T5, T6, T8 |
| T10 | C | Lanas guardadas: Server Actions de `user_yarns` (`backend-supabase`) y pestaña "Mis lanas" más `/lanas` (`frontend-editor`) | `backend-supabase` y `frontend-editor` | Media (sonnet) | T6; la interfaz, también T9 |
| T11 | C | Server Actions de proyectos (ADR 0009, sección 3): `startProjectFromDesign`, `loadProject`, `saveProgress` (con `VERSION_CHANGED`), `repinProject`; códec del puntero; `deletePattern` con 23503 | `backend-supabase` | Media (sonnet) | T4, T7 |
| T12 | D | "Tejer este diseño" en el estudio y en "Mis diseños", con su pantalla previa (ADR 0009, enmienda T1-7); `/proyectos` con avance; `/proyectos/[id]`; `/proyectos/[id]/tejer` con cola de avance, conflictos, estado sin conexión, Wake Lock, teclado y pasapáginas, "Pasar a la versión actual" | `modo-tejiendo` (con `frontend-editor` para los componentes compartidos del gráfico) | Media (sonnet) | T4, T8, T11 |
| T13 | D | Accesibilidad: una mano y `dominant_hand`, Wake Lock, anuncios de fila, paleta y "Mis lanas" con teclado, texto al 200 %, movimiento reducido, 390 px (CA3-A1 a CA3-A3, CA3-T11) | `ux-accesibilidad` | Media (sonnet) | T9, T12 |
| T14 | D | Textos: selector, alias aproximados, metraje como estimación y sus supuestos, "Tejiendo" (lado, sentido, tramos, "Gráfico terminado", "casilla N de M", "vuelta" o "fila" según `workedIn`, colores del derecho en filas por el revés), pantalla previa de "Tejer este diseño", búsqueda de grosores sin resultado ("ply"), conflictos, sin conexión, pantalla encendida, borrar un diseño con proyectos. Con el glosario pendiente (provisional hasta T1b) | `documentador` | Baja (haiku) | T1 |
| T15 | D | E2E de latencia extendida (CA3-P1 a CA3-P3) en la CI; guía para que la usuaria mida CA-P6 y los escenarios nuevos en el equipo de referencia | `render-puntos` con `devops` | Alta (opus) | T2, T9, T12 |
| T16 | E | QA: propiedades (P1 a P16, `yarnUsage`, `estimateYarnLength`), casos de `docs/casos-dominio-fase-3.md`, E2E con sesión (CA3-T5 a CA3-T9), latencia, matriz de criterios en `docs/qa-fase-3.md`. Revisión con opus de T4, T7, T8 y T15 (complejidad alta); sonnet para el resto | `qa-tester` | Alta (opus) / Media (sonnet) | T10 a T15 |
| T17 | E | Seguridad: migración y funciones `security definer` de T7 (permisos, `search_path`, `updated_at` exacto, cascadas, lista permitida), acciones de T10 y T11 (validación en el servidor, `valid` sin confiar en el cliente, notas privadas, topes), cola local del avance. Con opus, porque T7 es de complejidad alta | `revisor-seguridad` | Alta (opus) | T7, T10, T11, T12 |
| T18 | E | Revisión final de la lógica de tejido: `follow`, metraje, aspecto por fibra y textos. Espera las respuestas de T1b | `experto-tejido` | Media (sonnet) | T1b, T16 |
| T19 | E | **Hecha (2026-11-13)**. README, este roadmap y los ADR 0007 a 0009 (aceptados, con las enmiendas de la implementación de T11 a T18). T18 sigue abierta en su aprobación final hasta que cierre T1b | `arquitecto` + `documentador` | Baja (haiku) | T17, T18 |

### Criterios de salida de la fase 3

- CA3-P1 a CA3-P6, CA3-L1 a CA3-L11, CA3-T1 a CA3-T16 y CA3-A1 a CA3-A3 cumplidos, con la evidencia en el PR (mediciones, capturas de las cuatro formas con fibras, informe de QA).
- `pnpm test` y `pnpm typecheck` en verde, incluido `follow`; la CI corre el E2E con sesión.
- CA-P6 medido en el equipo de referencia, con los escenarios de la fase 2 y los nuevos.
- T1b cerrada (fase 2 y fase 3): lo marcado "validar con tejedora" está confirmado o corregido.
- `experto-tejido`, `qa-tester` y `revisor-seguridad` aprueban.
- Los ADR 0007 a 0009 quedan "aceptado" o enmendados.

### Estado al cierre de la fase 3

Fecha: 2026-11-13. Los grupos A a E están implementados en la rama `fase-3/grupo-d` (último commit `6c23a65`, con las correcciones de T17 y T18). Evidencia: [docs/qa-fase-3.md](qa-fase-3.md) (matriz de criterios) y [docs/seguridad.md](seguridad.md), sección "Revisión final de la fase 3".

**Criterios de salida**

| Criterio | Estado |
|---|---|
| CA3-* con evidencia | Cumplen según la matriz de QA, salvo: CA3-P2 con CPU ×4 (1 de 5 corridas sobre el umbral, 105,0 ms en el círculo; lo decide CA-P6), CA3-A1 (lector de pantalla real en "Tejiendo") y CA3-A3 (verificación manual del 200 % y del contraste de la fila resaltada). Falta también la captura de las cuatro formas con fibras para el PR (CA3-L6) |
| `pnpm test` y `pnpm typecheck` | En verde en local. Las E2E sin sesión dependen de la carga del equipo: revisar la primera corrida de CI del PR |
| CA-P6 | Pendiente (medición manual) |
| T1b cerrada (fases 2 y 3) | Pendiente. Depende de T1c |
| Aprobaciones | `qa-tester`: apto para PR con observaciones. `revisor-seguridad`: revisión hecha el 2026-11-12, sin hallazgos críticos ni altos. Medios: M1 corregido en el repo (pendiente de aplicar), M2 a M4 incorporados al plan de despliegue. Bajos: B1, B2, B3 y B5 corregidos en el repo (B5, pendiente de aplicar), B7 incorporado al plan, B6 parcial, B4 es requisito de la fase 7. `experto-tejido`: correcciones de T18 aplicadas; aprobación final pendiente de T1b |
| ADR 0007 a 0009 | Aceptados, con enmiendas. Las de implementación están al final de cada ADR |

**Pendientes que no son código**

1. **Validación con tejedoras (T1b, fases 2 y 3).** Depende de T1c: revisión legal de `/privacidad` y `/terminos`, y de la lista "antes de beta" de [docs/seguridad.md](seguridad.md). La Ley 21.719 entra en vigencia el 2026-12-01. Incluye:
   - ampliar [docs/validacion-tejedoras.md](validacion-tejedoras.md) con los temas de la fase 3 (comprobado el 2026-11-13: la hoja no los incluye);
   - la lista "Pendiente de validar por tejedora" de [docs/casos-dominio-fase-3.md](casos-dominio-fase-3.md#pendiente-de-validar-por-tejedora);
   - el [glosario pendiente](#glosario-pendiente) de la fase 3.
2. **Textos marcados `validar con tejedora`.** Están en `apps/web/src/lib/studio-texts.ts` y `apps/web/src/lib/projects/texts.ts`. Hay que confirmar o corregir cada uno después de T1b.
3. **CA-P6 en el equipo de referencia.** Guía en [docs/qa-fase-3.md](qa-fase-3.md), "Guía para medir CA-P6": tres corridas del estudio sin limitar la CPU y una de "Tejiendo" (con Docker). Criterio: p95 bajo 100 ms en `pintar`, `repeticiones`, `hover` y `fila`, en los cuatro escenarios y en "Tejiendo". Si el círculo de rombos queda sobre 90 ms, avisar a `render-puntos` antes de cerrar. Si la puesta en público cambia el build, repetir contra el sitio real (P5 de [docs/despliegue-publico.md](despliegue-publico.md)).
4. **Prueba con VoiceOver y NVDA de las pantallas nuevas**, como en la fase 2 (2026-11-09): "Tejiendo" (anuncios de fila y de casilla), la pantalla previa de "Tejer este diseño", el diálogo de conflicto, el selector de lanas con la paleta, "Mis lanas" (`/lanas`) y `/proyectos`. Anotar en el PR el navegador y el lector de cada prueba.
5. **Base real de Supabase.** `20261113145129_tope_part_id_y_detalle_cuotas.sql` y `20261111031813_tejer_disenos.sql` están aplicadas. Falta repetir `supabase/checks/10_rls_check.sql` contra el proyecto real (necesita cuentas de prueba allí) y, en una limpieza, quitar los bloques `TRANSITORIO` de `apps/web/src/lib/designs/messages.ts` y `apps/web/src/lib/projects/messages.ts`.
6. **Puesta en público** ([docs/despliegue-publico.md](despliegue-publico.md), fases P0 a P5). Se deja para el final, después de los puntos 1 a 5. Su orden y sus dependencias están en la sección "Orden y dependencias" del plan. La apertura a tejedoras depende de P5.

**Abiertos de código o CI** (no bloquean el cierre documental; detalle en [docs/qa-fase-3.md](qa-fase-3.md)):

- O-F3-1: latencia del círculo de 40.000 puntos con CPU ×4 (`render-puntos`).
- O-F3-3: no hay E2E de "Tejiendo" en plano, círculo, `top_down` ni espejo.
- Propuesta de `devops`: agregar `E2E_LATENCY_BUDGET_MS: "160"` al job "E2E con sesión", y mover la medición de hover del selector al proyecto `latencia`.
- O-F3-7: `apps/web/e2e/README.md` no menciona `qa-fase3-tejer.spec.ts` ni `E2E_FLAT_COLORS` (`documentador`).
- Comentario de `apps/web/src/lib/projects/messages.ts` con un nombre de migración que no coincide con el archivo (ver la enmienda 9 de [ADR 0009](adr/0009-tejer-este-diseno-y-proyectos.md)).

---

## Glosario pendiente

Estas son decisiones de terminología de la revisión de `experto-tejido` (2026-11-05). **Todas deben validarse con tejedoras reales** antes de publicarse (regla de oro 5).

- **Fase 2**: los textos las usan de forma provisional (T12).
- **Fase 4**: se implementan en `packages/glossary`, con variantes regionales configurables.
- **Fase 7**: quedan cerradas antes del lanzamiento.

| Tema | Propuesta | Alias o notas |
|---|---|---|
| Unidad de la cuadrícula | "casilla" en la interfaz (no "celda") | En el código y en los ADR se sigue diciendo *cell* o celda |
| Vuelta o fila | "vuelta" con `workedIn: "rounds"`; "fila" con `workedIn: "rows"` | Mismo dato, distinta palabra según cómo se teje |
| Lados y puntos | "lado revés" y "punto revés" | — |
| Abreviatura de puntos | "pts" (no "p") | "p" se confunde con *purl* (revés) |
| Disminuciones | "2 juntos al derecho"; "inclinada a la izquierda (desliza, desliza, teje)" | Reemplaza "deslizado". Solo aparecen cuando exista la capa de símbolos |
| Cierre del círculo | "coronilla" o "remate" | "copa" como alias |
| Cuña | "cuña" | "gajo" como alias |
| Colorwork | Subtítulo "Tejido de colores (jacquard)" | — |
| Hebras | Un solo término: "hebras flotantes" | No usar "hebras sueltas" |
| Fijar una hebra larga | "enganchar" o "entrelazar" la hebra | No "atrapar" (hoy aparece en `validate.ts`; se corrige en T2b) |
| Muestra | "muestra" | Alias regional: "tensión" |
| Lana | "lana" | Alias: "hilado", "hilo" |
| Crochet | "crochet" | Alias: "ganchillo", "croché" |
| Palillo | "palillo" | Alias: "aguja" |
| Punto jersey | "punto jersey" | Alias: "punto media" |
| Nombres de grosores 0 a 7 | Rotular como "nombres de LoopitaLab": el CYC no publica nombres en español | "Abultado" es poco común. Las tiendas usan "Grueso" y "Súper Grueso", y en Chile se dice "Mediano" para la categoría 4. Tilde uniforme en "Súper" |
| Alias de tienda en `grosores.json` | Mover el origen ("… en Orquídea", "… en Revés Derecho", "(Modista)") al campo de fuente (regla de oro 9) | Quitar "Baby" y "Roving": son nombres comerciales que aparecen en dos categorías (T3) |
| Tilde en "Súper" | Unificar "Super Fino" (cat 1) y "Súper Abultado" (cat 6) con tilde | A decidir con tejedoras (T1b). Se quitaron los alias "Ultra Fino" (igual al nombre) y "Super Abultado" (variante sin tilde) |
| "Mediano", "Grueso", "Súper Grueso" | Variantes regionales de Chile (modista.cl) | No son equivalencias seguras: no tratarlas como sinónimos exactos de las categorías 4, 5 y 6 |
| Filas en crochet | Proporciones filas / puntos 1,2 (punto bajo) y 0,6 (punto alto) | Supuestos por validar con tejedoras (T1b). El 1,35 es solo para jersey a palillo |
| Cuñas del círculo | Rango habitual de 4 a 12 cuñas (6, 8, 10 y 12 son comunes); fuera de él, aviso informativo `CHART_CIRCLE_REPEATS` | Umbral provisional de `experto-tejido`: validar con tejedoras |
| Cuña angosta | Cuña de al menos 4 puntos en su fila más ancha; con menos, aviso informativo `CHART_WEDGE_TOO_NARROW` | Umbral provisional: validar con tejedoras |
| Comienzo del círculo a palillo | "montaje inicial de 8 a 12 puntos" (en crochet, "anillo mágico de 6 a 12 puntos"), en `CHART_CIRCLE_START` | Validar el término "montaje inicial" y el rango con tejedoras |
| Fin del gráfico (fase 3) | "Gráfico terminado", con el recordatorio de rematar o cerrar (y los N puntos que quedan en una copa `bottom_up`) | Nunca "Pieza terminada" (ADR 0007, T1-4) |
| Contador dentro de la fila (fase 3) | "casilla N de M" en filas con disminuciones | No "puntos tejidos": cuenta casillas producidas (ADR 0007, T1-5) |
| Fila por el revés (fase 3) | "por el revés, de izquierda a derecha"; los colores del gráfico son los del derecho | No decir que los colores se invierten; en crochet no afirmar "punto revés" (ADR 0007, T1-3) |
| Metraje (fase 3) | "≈ N m (entre L y H m), estimación", "solo del gráfico: no incluye elástico, montaje ni remate" | Holgura de las flotantes y rango por validar con proyectos reales (ADR 0008, T1-6) |
| "Light" y "Fino (Light DK)" (fase 3) | "light" encuentra la cat. 2 (alias aproximado) y la cat. 3 ("Light Worsted") | Validar con tejedoras |
| "4 ply" y "8 ply" (fase 3) | Sin equivalencia: la búsqueda no devuelve categoría y explica que el nombre varía por país | Pendiente de tejedora; no se mapea sin fuente (ADR 0008, T1-8) |

Lista completa de lo pendiente de validar por tejedora en la fase 3 (orientación de `top_down` en "Tejiendo", lana de un "2 juntos" de dos lanas, tramos frente a casillas, holgura y rango del metraje, aspecto por fibra, "light", "4 ply" y "8 ply"): [casos-dominio-fase-3.md](casos-dominio-fase-3.md#pendiente-de-validar-por-tejedora). Se valida en T1b de la fase 3.

---

## Decisiones

Aprobadas por la usuaria el 2026-11-05:

1. **ADR 0003 a 0006 aceptados**:
   - 0003: no subir `schemaVersion` en la fase 2 y dejar tallas, secciones y símbolos para después;
   - 0004: Canvas 2D primero, con WebGL2 como plan B;
   - 0005: disminuciones derivadas de la máscara, sin tipo ni inclinación. Las reglas (ET) se confirman con `experto-tejido` antes de implementarse. La revisión se aplicó el 2026-11-05; lo que queda "validar con tejedora" va en T1b;
   - 0006: guardado y migración del título.
2. **El seguimiento de colorwork fila a fila se adelanta a la fase 3** (en vez de la fase 6).
3. **Límite del motivo en la interfaz de la fase 2: 200 × 200.**
4. **Equipo de referencia** para medir "notebook de gama media": 4 núcleos, 8 GB, GPU integrada, Chrome estable.
5. **Sin Turborepo por ahora**: el monorepo usa `pnpm -r`. Se reevalúa si el build o la CI se vuelven lentos.

Abierta (resuelta el 2026-11-09 por el punto 9 de las decisiones de la fase 3: validación con cuentas propias, preparada en T1c antes de T1b):

- **Política de privacidad antes de cualquier beta con personas externas**, por la vigencia de la Ley 21.719 el 1 de diciembre de 2026, sin esperar a la fase 7. Las páginas `/terminos` y `/privacidad` existen como borrador con marcadores por completar y requieren revisión legal. **Se vuelve urgente en la fase 3**: la ley entra en vigencia en tres semanas, y validar "Tejiendo" con tejedoras usando cuentas en la plataforma (T1b) sería una beta con personas externas. Alternativa sin cuentas: validar con la hoja y capturas.

### Decisiones de la fase 3 (aprobadas el 2026-11-09)

La usuaria revisó una por una y aprobó las opciones recomendadas de los puntos 1 a 8 (T0 hecha). Punto 9 (validación con tejedoras): **con cuentas propias en la plataforma**, lo que es una beta con personas externas: antes de invitarlas hay que completar y revisar legalmente `/privacidad` y `/terminos` (Ley 21.719, vigente desde el 1 de diciembre de 2026) y resolver los requisitos de seguridad previos a una beta (`docs/seguridad.md`, riesgo aceptado de OAuth y lista "antes de beta"). Ese trabajo es la tarea T1c, y T1b depende de ella.

Propuestas de `arquitecto` (2026-11-09); quedó aprobada la opción marcada como recomendada en cada una.

1. **Aprobar los ADR 0007, 0008 y 0009** (hoy "propuesto"), sin cambiar `schemaVersion`.
2. **Borrar un diseño que tiene proyectos**: (a) impedirlo con un mensaje que lista los proyectos (**recomendada**; protege el avance); (b) borrar también los proyectos; (c) conservar la versión aunque se borre el diseño (descartada en el ADR 0009 por la RLS).
3. **Avance tejido en dos dispositivos a la vez**: preguntar con cuál seguir cuando los punteros difieren (**recomendada**) o que gane el último que guardó.
4. **Aspecto por fibra activado por defecto**, después de calibrarlo y medirlo, con un interruptor "Colores planos" (**recomendada**), o dejarlo como opción apagada.
5. **Metraje**: metros con rango y margen del 10 %, siempre como estimación, sin gramos ni ovillos en la fase 3 (**recomendada**). Ovillos y metros por ovillo de la lana propia, en la fase 6 o 7 como dato privado del proyecto.
6. **Pantalla encendida activada por defecto** en "Tejiendo", con interruptor (**recomendada**), o apagada por defecto.
7. **Nota de una lana guardada**: no se copia al diseño salvo que se marque "copiar también la nota" (**recomendada**), porque suele llevar la marca.
8. **Sin conexión en la fase 3**: solo cortes con la página ya abierta (**recomendada**); abrir "Tejiendo" sin conexión, en la fase 6.

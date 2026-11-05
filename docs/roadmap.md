# Roadmap de LoopitaLab (fases 2 a 7)

Última revisión: 2026-11-05, agente `arquitecto`. Las fases se derivan de las modalidades v1 de [`CLAUDE.md`](../CLAUDE.md). Las decisiones de arquitectura están en [`docs/adr/`](adr/). Los pendientes de seguridad, en [`docs/seguridad.md`](seguridad.md).

## Resumen

| Fase | Nombre | Estado | Complejidad global |
|---|---|---|---|
| 1 | Base: modelo canónico, validador, lanas, Supabase con RLS, acceso, proyectos y cuenta | Lista | — |
| 2 | Estudio de colorwork (palillo: plano, tubo y círculo) | Planificada; ADR 0003 a 0006 propuestos | Alta |
| 3 | Lanas por grosor y composición en la interfaz, más seguimiento de colorwork fila a fila | Pendiente | Media |
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
3. **Producto usable antes**: la usuaria puede diseñar un gorro y tejerlo en la plataforma desde la fase 3, y las tejedoras pueden validar pronto la lectura de gráficos (derecha a izquierda, ida y vuelta, zurdas).
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
  | `ux-accesibilidad` | Teclado, lector de pantalla, daltonismo, zurdas |
  | `documentador` | Textos |
  | `devops` | CI y Playwright |
  | `qa-tester` | Pruebas |
  | `revisor-seguridad` | Guardado en el servidor |

- **Dependencias**: fase 1. Aprobación de los ADR 0003 a 0006.
- **Criterios de salida**: los de la sección [criterios de aceptación](#criterios-de-aceptación-medibles), incluido el presupuesto de 100 ms medido.

## Fase 3: Lanas por grosor y composición, y seguimiento de colorwork

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
    - paquete `packages/follow`, primera versión: la secuencia de filas derivada del gráfico, con el orden de lectura de ADR 0003 y espejo para zurdas;
    - pantalla "Tejiendo" con la fila actual resaltada en el gráfico y en la vista previa, avanzar y retroceder, y contador de filas y repeticiones;
    - "Tejer este diseño": crea un proyecto, fija una versión con `snapshot_pattern()` y guarda el puntero en `project_progress`.
- **Paquetes**: `yarn-catalog`, `stitch-render`, `pattern-core` (metraje), `follow` (nuevo), `apps/web`, `supabase/`.
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `catalogo-lanas` | Datos, metraje, rasgos visuales por fibra |
  | `render-puntos` | Aspecto por fibra y vista previa al pasar el cursor |
  | `frontend-editor` | Selector de lanas |
  | `modo-tejiendo` | `follow` y pantalla "Tejiendo" |
  | `backend-supabase` | Lanas guardadas y fijar la versión al crear el proyecto |
  | `experto-tejido` | Muestras por grosor, lectura de gráficos, metraje |
  | `ux-accesibilidad` | Uso con una mano y pantalla siempre encendida |
  | `qa-tester` | Pruebas |

- **Dependencias**: fase 2.
- **Criterios de salida**:
  - la vista previa al pasar el cursor cumple p95 < 100 ms con el mismo escenario de la fase 2;
  - la composición inválida no se puede guardar;
  - el metraje se muestra siempre como estimación;
  - el puntero de un proyecto sobrevive a recargar y a cambiar de dispositivo;
  - las propiedades de `follow` pasan, por ejemplo: la cantidad de pasos es igual a la cantidad de filas del gráfico completo, y avanzar y retroceder son inversas;
  - `experto-tejido` aprueba la lectura para diestras y zurdas.

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
  - **Paquete `glossary`**: nombres completos y abreviaturas en US, UK y variantes en español, reutilizando `stitches.ts`.
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
  | `ux-accesibilidad` | Uso con una mano, zurdas, tamaño de letra |
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
- **Muestra**: puntos y filas en 10 cm. Si falta, se usa una muestra supuesta marcada como tal. Se muestran las medidas resultantes en cm (`dimensionsCm`).
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
| HU-08 | Veo las advertencias (hebras sueltas largas, demasiados colores por fila, copa que no cierra) señaladas en el gráfico. |
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
| CA-P6 | Medición manual en el equipo de referencia (4 núcleos, 8 GB, GPU integrada), adjunta al PR de cierre |
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
| CA-F7 | El servidor rechaza un documento con errores de validación. Una advertencia no impide guardar |
| CA-F8 | "Guardar versión" crea una fila en `pattern_versions`. El autoguardado no crea ninguna |
| CA-F9 | Deshacer y rehacer funcionan para pintar, rellenar, "sin punto", cambiar el tamaño, las repeticiones y las lanas, y cambiar forma, dirección y muestra |
| CA-F10 | El aviso de prototipo digital está visible en el estudio en todas las formas y no se puede cerrar de forma permanente |

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
  - `x = 0` es la izquierda vista desde el derecho;
  - el orden de lectura se deriva, con espejo para zurdas solo en la vista;
  - `direction` decide la orientación de la vista previa y, en el círculo, si la fila 0 es el borde o el centro;
  - `yoke` es válido, pero sin vista propia todavía.
- **Derivados nuevos**: `motifCoord`, `rowStitchCount`, `rowStitchCounts`, `shaping`, `readingDirection`.
- **Operaciones puras nuevas** (`edit.ts`): `paintCells`, `fillRegion`, `resizeMotif`, `setRepeat`, `addYarn`, `removeYarn`, `reorderYarns`, `newChartPattern`.
- **Migraciones**: `migratePattern` (identidad para v1), en el camino de toda lectura.
- **Validaciones nuevas**:
  - `TITLE_LENGTH`;
  - `CHART_RENDER_UNSUPPORTED`;
  - `CHART_ROWS_SHAPE`;
  - `CHART_ROW_EMPTY_FULL`;
  - reglas del círculo: `CHART_CIRCLE_REPEATS`, `CHART_CIRCLE_REPEAT_Y`, `CHART_SHAPING_UNEXPECTED`, `CHART_SHAPING_STEEP` y `CHART_CIRCLE_NOT_CLOSED`.
- **En `yarn-catalog`**: `suggestedGauge` también devuelve `rowsPer10cm`, con la proporción filas/puntos que confirme `experto-tejido`. Hoy solo devuelve puntos, y la vista previa necesita las dos medidas para la proporción del punto.

### Paquetes nuevos y su contrato

| Paquete | Qué hace | Depende de | Contrato |
|---|---|---|---|
| `packages/stitch-render` | Vista previa realista. Tres capas: disposición (pura), aspecto de la lana (puro), backend (Canvas 2D primero) | `pattern-core`, `yarn-catalog`. Sin terceros | `layoutGeometry`, `colorize`, `hitTest`, `yarnLook`, `StitchRenderer`, `createCanvasRenderer` ([ADR 0004](adr/0004-render-de-puntos-2d.md)) |
| `packages/pattern-render` | Derivados estáticos: gráfico de símbolos en SVG y descripción textual. Más adelante, texto escrito y PDF | `pattern-core`. Sin terceros | Ver abajo |

Contrato de `pattern-render`:

```ts
export interface ChartSvgOptions {
  cellPx?: number;          // por defecto 16
  showRepeats?: boolean;    // marca los bordes del motivo
  rowNumbers?: boolean;     // numeración según workedIn y lectura (ADR 0003)
  symbols?: boolean;        // letra por lana (daltonismo)
  mirror?: boolean;         // zurdas: solo la numeración y las flechas de lectura
}
export function chartToSvg(pattern: ChartPattern, opts?: ChartSvgOptions): string;
/** Descripción en español para lectores de pantalla. */
export function describeChart(pattern: ChartPattern): string;
```

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

- en el límite de 2 MB de `patterns`;
- en el límite del cuerpo de las Server Actions.

### Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | El círculo y el tubo con Canvas 2D (una transformación por punto) no cumplen 100 ms | Interfaz de backend reemplazable. Pasar a WebGL2 según el criterio del ADR 0004. Medir temprano (tarea T6) |
| R2 | Documentos grandes superan 2 MB en la base o el límite de las Server Actions | Límite de 200 × 200 en la interfaz. Prueba del peor caso (T4). Codificación compacta como plan B (ADR 0003) |
| R3 | Paquetes en TypeScript sin compilar, con imports `.ts` e imports JSON con atributos (`yarn-catalog`), en Next 16 y Turbopack | Prueba de concepto al inicio de T8. `pattern-core` ya funciona con `transpilePackages`; falta probar `yarn-catalog` |
| R4 | La semántica de lectura y dirección no coincide con lo que esperan las tejedoras, y hay que rehacer trabajo | T1 (`experto-tejido`) antes de implementar. Los puntos marcados (ET) en los ADR quedan bloqueados hasta su aprobación |
| R5 | Las usuarias esperan ver el tipo de disminución (2 juntos o deslizado) en la copa | Limitación visible en la interfaz y en la ayuda. Capa de símbolos en un ADR futuro |
| R6 | `apps/web` todavía no tiene Vitest ni Playwright; sin ellos no se pueden medir los criterios de rendimiento | T13 (`devops`) agrega las dependencias, justificadas en el PR |
| R7 | La CI no corre (repositorio movido) y `pnpm-lock.yaml` no está versionado, mientras la CI usa `--frozen-lockfile` | Versionar el lockfile y habilitar Actions antes de mezclar la fase 2. Lo coordina quien edita `ci.yml` |
| R8 | Expectativa de realismo: la vista previa se confunde con el resultado real | Aviso permanente (CA-F10) y aviso de deformación en el círculo (ADR 0005) |
| R9 | Conflictos de autoguardado entre pestañas | Concurrencia optimista y respaldo local (ADR 0006) |

### Desglose de tareas

El orden es el de ejecución. Las tareas con la misma letra de grupo pueden ir en paralelo. Complejidad y modelo según la tabla de `CLAUDE.md`.

| # | Grupo | Tarea | Agente | Complejidad (modelo) | Depende de |
|---|---|---|---|---|---|
| T0 | A | La usuaria aprueba o ajusta los ADR 0003 a 0006 | (usuaria) | — | — |
| T1 | A | Validar la semántica marcada (ET): `x = 0`, orden de lectura y espejo para zurdas, `direction` en la vista, sentido antihorario en el círculo, umbrales de disminución, 5 a 10 repeticiones, copa cerrada, proporción filas/puntos por defecto, nombres de herramientas ("sin punto") | `experto-tejido` | Media (sonnet) | — |
| T2 | B | `pattern-core`: derivados, `edit.ts`, `migrate.ts`, validaciones nuevas, pruebas de propiedades y actualización del README del paquete | `motor-patrones` | Alta (opus) | T0, T1 |
| T3 | B | `yarn-catalog`: `suggestedGauge` con filas y pruebas | `catalogo-lanas` | Baja (haiku) | T1 |
| T4 | B | Migración de consistencia del título, verificación en `10_rls_check.sql`, prueba del peor tamaño de documento. Capa de datos y Server Actions: crear, guardar con `expectedUpdatedAt`, guardar versión, listar, duplicar y borrar | `backend-supabase` | Media (sonnet) | T0 (el guardado necesita T2 para validar) |
| T5 | C | `stitch-render`: disposición (plano, tubo, círculo) y `yarnLook` neutro, con pruebas de propiedades y la guardia de rendimiento en Node | `render-puntos` | Alta (opus) | T2 |
| T6 | C | `stitch-render`: backend Canvas 2D, redibujo incremental, `hitTest`, `snapshot` y página de benchmark | `render-puntos` | Alta (opus) | T5 |
| T7 | C | `pattern-render`: `chartToSvg` y `describeChart`, con pruebas | `motor-patrones` | Media (sonnet) | T2 |
| T8 | C | Web: prueba de concepto de paquetes TS en Next, `transpilePackages`, almacén del documento con historial para deshacer, autoguardado, rutas `/disenos` y `/disenos/nuevo` | `frontend-editor` | Media (sonnet) | T2, T4 |
| T9 | D | Web: editor de motivo en canvas (herramientas, teclado, numeración, letras por lana) y paneles (repeticiones, forma, dirección, muestra, lanas mínimas, validación, aviso de prototipo) | `frontend-editor` | Media (sonnet) | T7, T8 |
| T10 | D | Integrar la vista previa en el estudio. Instrumentación `edit-to-paint`. Cumplir CA-P1 a CA-P4 y CA-P7 | `render-puntos` con `frontend-editor` | Alta (opus) | T6, T9 |
| T11 | D | Accesibilidad: teclado, lector de pantalla, daltonismo, zurdas y tableta (CA-A1 a CA-A3) | `ux-accesibilidad` | Media (sonnet) | T9 |
| T12 | D | Textos de la interfaz, aviso de prototipo, ayuda del estudio y explicación de la limitación de las disminuciones | `documentador` | Baja (haiku) | T1 |
| T13 | B | Vitest y Playwright en `apps/web` (dependencias justificadas). Jobs de CI para `stitch-render`, `pattern-render` y el E2E de latencia (coordinado con quien edita `ci.yml`) | `devops` | Media (sonnet) | — |
| T14 | E | QA: propiedades, E2E funcional y de latencia. Revisión con opus de T2, T5, T6 y T10 (no se revisa con un modelo inferior cuando la complejidad es alta); sonnet para el resto | `qa-tester` | Alta (opus) / Media (sonnet) | T10, T11, T13 |
| T15 | E | Revisión de seguridad: Server Actions de guardado (validación en el servidor, tamaño, concurrencia, RLS) y la migración | `revisor-seguridad` | Media (sonnet) | T4, T8 |
| T16 | E | Revisión final de la lógica de tejido: conteos, disminuciones, lectura y textos | `experto-tejido` | Media (sonnet) | T14 |
| T17 | E | Actualizar el README (estado de la fase 2), este roadmap y los ADR a "aceptada" con las enmiendas que hayan surgido | `arquitecto` + `documentador` | Baja (haiku) | T16 |

### Criterios de salida de la fase 2

- CA-P1 a CA-P7, CA-F1 a CA-F10 y CA-A1 a CA-A3 cumplidos, con la evidencia en el PR (mediciones, capturas de las tres formas, informe de QA).
- `pnpm test` y `pnpm typecheck` en verde, y la CI corriendo de verdad en el repositorio nuevo.
- `experto-tejido`, `qa-tester` y `revisor-seguridad` aprueban.
- Los ADR 0003 a 0006 quedan en estado "aceptada" o enmendados.

---

## Decisiones abiertas para la usuaria

1. **Aprobar los ADR 0003 a 0006**:
   - 0003: no subir `schemaVersion` en la fase 2 y dejar tallas, secciones y símbolos para después;
   - 0004: Canvas 2D primero, con WebGL2 como plan B;
   - 0005: disminuciones derivadas de la máscara, sin tipo ni inclinación;
   - 0006: guardado y migración del título.
2. **Adelantar el seguimiento de colorwork fila a fila a la fase 3** (en vez de la fase 6).
3. **Política de privacidad antes de cualquier beta con personas externas**, por la vigencia de la Ley 21.719 el 1 de diciembre de 2026, sin esperar a la fase 7.
4. **Límite del motivo en la interfaz de la fase 2** (propuesto: 200 × 200).
5. **Equipo de referencia** para medir "notebook de gama media" (propuesto: 4 núcleos, 8 GB, GPU integrada, Chrome estable).

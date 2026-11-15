# Roadmap de LoopitaLab (fases 2 a 7)

Última revisión: 2026-11-13, agente `arquitecto` (fase 4, grupo B: T4, T4b, T5, T6 y T8 hechas; enmienda E12 del [ADR 0006](adr/0006-guardado-de-disenos.md#enmienda-e12-2026-11-13-borradores-de-patrones-escritos-fase-4-t4), T5-1 a T5-6 del [ADR 0010](adr/0010-geometria-3d-amigurumi.md#enmiendas-por-la-implementación-de-t5-2026-11-13) y T4-1 a T4-7, T6-1 a T6-6 y T8-1 del [ADR 0011](adr/0011-posicion-de-partes-y-editor-escrito.md#enmiendas-por-la-implementación-del-grupo-b-2026-11-13); tareas T13 a T21 ajustadas). Revisión anterior: 2026-11-13, agente `arquitecto` (fase 4, grupo A: T1, T3 y T3b hechas; enmiendas C-1 a C-21 de la revisión de dominio y V-1 a V-5 del prototipo del visor en los [ADR 0010](adr/0010-geometria-3d-amigurumi.md#enmiendas-por-t1-y-t3b-2026-11-13) y [0011](adr/0011-posicion-de-partes-y-editor-escrito.md#enmiendas-por-t1-2026-11-13); tareas T4 a T18 y criterios CA4-* ajustados). Revisión anterior: 2026-11-13, agente `arquitecto` (fase 4, T0 hecha: la usuaria respondió las [decisiones de la fase 4](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13); [ADR 0010](adr/0010-geometria-3d-amigurumi.md) y [ADR 0011](adr/0011-posicion-de-partes-y-editor-escrito.md) aceptados con enmiendas; tareas y criterios ajustados). Revisión anterior: 2026-11-13, agente `arquitecto` (planificación de la fase 4, ADR 0010 y 0011 propuestos, [sección "Fase 4 en detalle"](#fase-4-en-detalle)). Revisión anterior: 2026-11-13, agentes `arquitecto` y `documentador` (cierre de la fase 3, T19; ver [Estado al cierre de la fase 3](#estado-al-cierre-de-la-fase-3)). Revisión anterior: 2026-11-09, agente `arquitecto` (fase 3: T0, T1 y T3 hechas; ADR 0007 a 0009 aceptados con las enmiendas de la revisión de dominio T1; [sección "Fase 3 en detalle"](#fase-3-en-detalle)). Revisión anterior: 2026-11-06 (T4, T5, T6 y T7 hechas; enmiendas E1 a E8 del ADR 0004 y E11 del ADR 0006; contrato de `pattern-render` actualizado; antes: T2b y T2c, enmiendas E10 a E13 del ADR 0003 y E10 del ADR 0006), con la revisión de dominio de `experto-tejido` aplicada. Las fases se derivan de las modalidades v1 de [`CLAUDE.md`](../CLAUDE.md). Las decisiones de arquitectura están en [`docs/adr/`](adr/). Los pendientes de seguridad, en [`docs/seguridad.md`](seguridad.md).

## Resumen

| Fase | Nombre | Estado | Complejidad global |
|---|---|---|---|
| 1 | Base: modelo canónico, validador, lanas, Supabase con RLS, acceso, proyectos y cuenta | Lista | — |
| 2 | Estudio de colorwork (palillo: plano, tubo y círculo) | Lista en código; ADR 0003 a 0006 aceptados. Faltan CA-P6, T1b, T16 y el E2E con sesión | Alta |
| 3 | Lanas por grosor y composición en la interfaz, más seguimiento de colorwork fila a fila | Lista en código (PR #9 a #11 en `main`). Pendiente lo que no es código: T1b (tras T1c), CA-P6, lector de pantalla real y la puesta en público. Ver [Estado al cierre de la fase 3](#estado-al-cierre-de-la-fase-3) | Media-alta |
| 4 | Estudio amigurumi 3D | Planificada; grupo A hecho el 2026-11-13 (T0, T1, T2, T3 y T3b; ADR 0010 y 0011 aceptados con las enmiendas de T1 y T3b). Falta T1b (tejedoras) y verificar en la CI las tres corridas de T3. Grupo B en curso: T4, T4b, T5, T6 y T8 hechas el 2026-11-13 (T8 aplicada en el proyecto real el 2026-11-14); faltan T7 y T9. Grupo C en curso: T10 y T11 hechas el 2026-11-14 (enmiendas T10-1 a T10-9 y T11-1 a T11-9 del ADR 0010); faltan T11c y T12. Ver [Fase 4 en detalle](#fase-4-en-detalle) | Alta |
| 5 | Imagen → patrón (IA) | Pendiente | Alta |
| 6 | Modo tejiendo completo (amigurumi punto a punto, contadores, tiempo) | Pendiente | Media |
| 7 | Compartir y publicar, exportación PDF y lanzamiento | Pendiente | Media |
| Futuras | Trabajo registrado sin fecha, por ejemplo el [editor de bloques completo](#editor-de-bloques-completo) | Sin fecha | — |

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

Detalle completo en la [sección de la fase 4](#fase-4-en-detalle) más abajo (ADR [0010](adr/0010-geometria-3d-amigurumi.md) y [0011](adr/0011-posicion-de-partes-y-editor-escrito.md), aceptados el 2026-11-13). Donde el detalle precisa este resumen, manda el detalle. En particular: la posición de las partes **sí** requiere `schemaVersion: 2` (el documento es cerrado, ADR 0003 E16), `glossary` se diseña como sección del ADR 0011, el 3D lleva aspecto por fibra desde esta fase (decisión 10) y los límites de tamaño son recomendaciones con advertencia (decisión 5).

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
- **Paquetes**: `pattern-core`, `viewer-3d` (nuevo), `glossary` (nuevo), `stitch-render` (`yarnLook` para el aspecto por fibra del 3D; puntos de crochet, si se usan en miniaturas), `yarn-catalog` (datos de fibras, sin cambios de contrato), `apps/web`.
- **Agentes**:

  | Agente | Responsabilidad |
  |---|---|
  | `arquitecto` | ADR de geometría y posición de partes |
  | `visor-3d` | `viewer-3d`, incluido el aspecto por fibra |
  | `catalogo-lanas` | Revisión de los datos de fibra y de la calibración del aspecto en el 3D (T11c) |
  | `motor-patrones` | Bloques y validación |
  | `frontend-editor` | Editor |
  | `documentador` | `glossary` |
  | `experto-tejido` | Validación del dominio |
  | `qa-tester` | Pruebas |
  | `ux-accesibilidad` | Accesibilidad |

- **Dependencias**: fase 3 (selector de lanas). La fase 1 ya tiene el modelo escrito y el validador.
- **Criterios de salida**:
  - editar una vuelta actualiza el 3D en menos de 100 ms con una pieza de 40 vueltas, dentro de los límites recomendados y con el aspecto por fibra activado;
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

Fecha: 2026-11-13. Los grupos A a E están implementados en la rama `fase-3/grupo-d` (último commit `6c23a65`, con las correcciones de T17 y T18), fusionada en `main` con los PR #9 a #11. Evidencia: [docs/qa-fase-3.md](qa-fase-3.md) (matriz de criterios) y [docs/seguridad.md](seguridad.md), sección "Revisión final de la fase 3".

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

## Fase 4 en detalle

Planificada el 2026-11-13 por `arquitecto` sobre `main` (fase 3 lista en código, PR #9 a #11), en la rama `fase-4/planificacion`. **T0 hecha el 2026-11-13**: la usuaria respondió las [decisiones de la fase 4](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13), y los dos ADR quedaron **aceptados** con enmiendas:

- el [ADR 0010](adr/0010-geometria-3d-amigurumi.md): geometría 3D derivada de las vueltas y paquete `viewer-3d`;
- el [ADR 0011](adr/0011-posicion-de-partes-y-editor-escrito.md): posición de las partes, `schemaVersion: 2`, editor de texto y bloques, y `glossary`.

Los casos de prueba de dominio están en [`docs/casos-dominio-fase-4.md`](casos-dominio-fase-4.md) (T1, 2026-11-13: casos F4-1 a F4-84, fixtures A y B, decisión 6 y correcciones C-1 a C-21, registradas como enmiendas de los dos ADR). El prototipo del visor (T3b) dejó las enmiendas V-1 a V-5 del ADR 0010. En esta sección, "T*n*" son las tareas de la fase 4; las de fases anteriores se citan con su fase ("T1b de la fase 3").

### Alcance

**Dentro**

- **Estudio amigurumi** (`kind: "written"`, crochet):
  - crear un diseño escrito;
  - partes con nombre, construcción (espiral, vueltas unidas o hileras), inicio (anillo mágico o cadeneta), lana inicial, cantidad de copias y cierre;
  - lista de partes con su cantidad de vueltas y su conteo final (del motor).
- **Editor de texto** por parte, con la sintaxis de `text.ts` ampliada (notas `>`, encabezado "Cantidad: N" con los alias "Hacer", "Piezas" y "Tejer") en ES y US. UK solo con selector explícito, según la [decisión 4](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13). Errores de lectura en su línea y errores del validador junto a cada vuelta.
- **Editor de bloques** equivalente al texto, con ida y vuelta sin pérdida (ADR 0011, sección 7). Edición básica ([decisión 2](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13)): punto, cantidad, hebra, cambio de lana, grupos hasta 2 niveles, insertar y borrar vueltas, mover con botones. Todo se ve. Las operaciones, el árbol de bloques y el almacén soportan la profundidad completa del núcleo; solo la interfaz limita a 2 niveles (`BlockEditPolicy`).
- **Límites recomendados** ([decisión 5](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13)): 20 partes, 10 copias, 100 vueltas por parte, 200 puntos por vuelta y 40.000 puntos en la escena, **solo como advertencia**. Se informan desde el inicio (medidor y ayuda visibles) y, al superarlos, la usuaria decide si sigue (ADR 0011, sección 3b; ADR 0010, sección 6c).
- **Borradores**: un patrón escrito con vueltas que no cuadran se guarda y se ve (ADR 0011, sección 4). Los errores de conteo se ven, pero no impiden guardar.
- **Visor 3D** (`viewer-3d`, ADR 0010):
  - forma de cada parte derivada de los conteos y la muestra;
  - color por punto;
  - partes en espiral, en vueltas unidas y en hileras (panel plano);
  - copias, ubicación automática y posicionado anclado a la superficie ([decisión 3](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13));
  - **aspecto por fibra** (halo, brillo, definición) con `yarnLook` de `stitch-render` e interruptor "Colores planos" compartido con la fase 3 ([decisión 10](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13); ADR 0010, sección 6b);
  - medidas estimadas, aviso de prototipo digital y silueta 2D si no hay WebGL.
- **Lanas**: el selector de la fase 3 (grosor, composición, paleta o color personalizado, "Mis lanas") en el estudio amigurumi; los cambios de lana con `@id` y en bloques.
- **Armado**: pasos escritos (`assembly`) y la lista derivada "Dónde va cada pieza".
- **`glossary`**: ES, US y UK, todo marcado como pendiente de validación. Preferencia de dialecto en la cuenta ([decisión 4](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13)).
- **`schemaVersion: 2`** con su migración y la compatibilidad de la sección 5 del ADR 0011.

**Fuera** (fase en que entra)

| Tema | Fase |
|---|---|
| Seguir un amigurumi punto a punto, 3D parcial en "Tejiendo" (el contrato `limit` queda listo). En la fase 4, aviso "Seguir un amigurumi punto a punto llega en una próxima versión" | 6 ([decisión 8](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13)) |
| Amigurumi desde una foto | 5 (ruta 3D) |
| Metraje del amigurumi (no hay factores validados en crochet) | Después de validar factores con tejedoras, como el metraje en crochet de la fase 3 |
| Editor de bloques completo: editar grupos de 3 a 6 niveles y arrastrar y soltar | Fase futura ([Editor de bloques completo](#editor-de-bloques-completo)); la fase 4 lo deja preparado |
| Pelaje por capas para el halo, materiales físicos de tela | Sin fecha; se reevalúa con medición si las tejedoras lo piden (ADR 0010, sección 6b) |
| Simulación física del relleno, aumentos asimétricos (hocicos) en la forma | Sin fecha (ADR 0010, alternativas y consecuencias) |
| Ojos de seguridad, bordados y accesorios como objetos 3D | Sin fecha. En la fase 4 se anotan en `assembly` |
| Crochet tapestry en el estudio de colorwork | Después de la fase 4 |
| Palillo escrito (`kind: "written"` con `technique: "knit"`) | Sin fecha (ADR 0001) |
| PDF del amigurumi, vista pública | 7 |
| Traducir toda la interfaz al inglés | No previsto: `glossary` es la terminología de los patrones |
| Marcas, códigos o fotos de productos (también de ojos de seguridad o relleno) | Nunca (regla de oro 9) |

### Historias de usuaria

| ID | Historia |
|---|---|
| HU4-01 | Como diseñadora, creo un amigurumi nuevo y agrego partes (cuerpo, cabeza, orejas) con su inicio y su forma de trabajo. |
| HU4-02 | Escribo cada parte como texto ("V2: aum x6 (12)"), en español o con abreviaturas en inglés, y veo enseguida el 3D. |
| HU4-03 | Si me equivoco en una vuelta, veo el error en esa línea y el patrón no se rompe: sigo viendo el último 3D bueno. |
| HU4-04 | Si una vuelta no cuadra con la anterior, el estudio me lo dice junto a la vuelta, y puedo guardar igual como borrador. |
| HU4-05 | Prefiero armar las vueltas con bloques (punto, cantidad, grupo, color) y, al pasar al texto, veo exactamente lo mismo. |
| HU4-06 | Cambio de color en medio de una vuelta y el 3D muestra cada punto con su lana. |
| HU4-07 | Indico que una oreja se teje 2 veces sin escribirla dos veces. |
| HU4-08 | Ubico la oreja sobre la cabeza tocando la superficie, y si la cabeza crece la oreja la sigue. Veo "entre la V10 y la V11". |
| HU4-09 | Veo cuánto mide más o menos cada parte, rotulado como estimación y como supuesto si no ingresé mi muestra. |
| HU4-10 | Escribo notas por vuelta ("coloca el marcador") y pasos de armado, y no se pierden al cambiar de vista ni al recargar. |
| HU4-11 | Elijo si veo los patrones con abreviaturas de Chile, de EE. UU. o del Reino Unido, y la elección me sigue en otros dispositivos. |
| HU4-12 | Si mi equipo no tiene 3D, igual veo la silueta de cada parte y una descripción. |
| HU4-13 | Desde que abro el estudio sé cuáles son los tamaños recomendados para que la vista previa sea fluida. Si los paso, me avisa y yo decido si sigo. |
| HU4-14 | Veo en el 3D el halo de una lana con mohair o el brillo de una con seda, y puedo apagarlo con "Colores planos". |

### Criterios de aceptación medibles

**Rendimiento (regla de oro 7)**. Escenario del ADR 0010, sección 6: el **fixture A, "cuerpo de 39 vueltas, 1.800 puntos"** (máximo de 60 puntos; F4-45, enmiendas C-1 y C-2), 9 partes más (orejas, brazos y piernas con 2 copias) y 3 lanas, **una de ellas con mohair y otra con seda**, para que el aspecto por fibra trabaje. Queda dentro de los límites recomendados. Playwright en Chromium, CPU ×4, WebGL por software en la CI (proyecto `webgl`, presupuesto propio en `E2E_VIEWER_BUDGET_MS`, provisional en 400 ms: SwiftShader tarda p95 43 ms solo en subir y dibujar, enmienda V-3); el equipo de referencia de la fase 2 decide. **CA4-P1 a CA4-P4 se exigen dentro de los límites recomendados y con el aspecto por fibra activado**; fuera de los límites rigen CA4-P8 y CA4-P9 (ADR 0010, sección 6c).

| ID | Criterio |
|---|---|
| CA4-P1 | Editar una vuelta del cuerpo en el texto (50 ediciones: cambiar un conteo, agregar un aumento): p95 de `edit-to-paint-3d` < 100 ms |
| CA4-P2 | Lo mismo con bloques (50 acciones): p95 < 100 ms |
| CA4-P3 | Cambiar el color o la composición de una lana, o activar y desactivar "Colores planos" (50 veces): p95 < 100 ms, con 0 llamadas a `buildPartMesh` y a `colorizePartMesh` y 0 atributos subidos (solo la tabla por lana). Cambiar la lana de un cambio de color (`@B` → `@C`, 50 veces): p95 < 100 ms, con 0 llamadas a `buildPartMesh` (solo `colorizePartMesh`). En los dos casos, `renderer.info.programs.length` no crece |
| CA4-P4 | Girar y acercar con el aspecto por fibra activado: ≥ 30 fps en el equipo de referencia (medición manual; en la CI es solo informativo). Incluye la confirmación de `LOD_STITCH_BUDGET = 20.000`: una escena de 20.000 puntos en `"relief"` con razón de píxeles 2 gira a ≥ 30 fps; si no, el valor baja a 10.000 (enmienda V-4) |
| CA4-P5 | La validación completa y las medidas corren diferidas: 0 llamadas a `validatePattern` dentro de la ventana de una edición (extiende CA-P7) |
| CA4-P6 | Guardia en Node: `partProfile` y `buildPartMesh` del cuerpo (fixture A, 1.800 puntos) bajo 3 veces la referencia registrada; `buildScene` con una sola parte editada reconstruye exactamente 1 malla |
| CA4-P7 | El estudio de colorwork no carga `three`: ninguna petición del fragmento de `three` en `/disenos/[id]` de un gráfico (E2E), y el PR informa el tamaño del fragmento del estudio amigurumi (referencia de T3b: 246 KB con gzip para el prototipo, cargado solo por `next/dynamic`) |
| CA4-P8 | **Fuera de los límites recomendados** (escena de unos 60.000 puntos, una parte de 120 vueltas y una vuelta de 300 puntos): la advertencia aparece; el nivel de detalle pasa a `"smooth"`; el editor (texto, conteo de la vuelta y errores de lectura) responde con p95 < 100 ms medido como `edit-to-feedback` (no espera al 3D); el 3D llega a la última edición sin cola (nunca más de una reconstrucción en curso) y muestra "Actualizando 3D…" mientras tanto. El PR informa el p95 de `edit-to-paint-3d` en este escenario, sin umbral obligatorio |
| CA4-P9 | Con más de `SCENE_HARD_STITCH_CAP` puntos (200.000 al inicio, enmienda V-1; documento armado en la prueba, dentro de los topes del núcleo), el visor muestra siluetas y el mensaje, la pestaña no se cuelga (ninguna tarea larga de más de 500 ms) y el diseño se sigue editando y guardando |
| CA4-P10 | `hover-to-paint-3d` (vista previa de una lana al pasar el cursor por un color, con el aspecto activado, 50 veces): p95 < 100 ms. Latencia A/B con `E2E_FLAT_COLORS=1` informada en el PR, como en la fase 3 |

**Modelo y motor**

| ID | Criterio |
|---|---|
| CA4-M1 | Las propiedades M1 a M4 de la migración (ADR 0011, sección 5, con M1 enmendada por C-9: mismos códigos de error; solo pueden sumarse las advertencias e informaciones nuevas de la v2) pasan con tres semillas y con todos los fixtures v1 del repositorio |
| CA4-M2 | Un diseño v1 guardado en la base se abre, se guarda como v2 (`schema_version = 2`) y sigue igual. Un proyecto con una versión fijada v1 abre "Tejiendo" con los mismos pasos (E2E con sesión) |
| CA4-M3 | Cada código de `layout` de la tabla del ADR 0011, sección 3, tiene su prueba. Documentos hostiles (ciclos, cadenas de 10.000 anclas, `NaN`, 1e308, 50 partes con `LIMITS.maxCopies + 1` copias) se rechazan sin lanzar y en menos de 50 ms. Un documento que supera los cinco límites recomendados, pero no los topes duros, es `valid` |
| CA4-M8 | `recommendedLimitUsage` y `recommendedLimitNotices` (ADR 0011, sección 3b): coinciden con `concreteRounds` y `copies` en documentos aleatorios (tres semillas), el total de la escena es igual a `stitchCount` de `buildScene` (G13), nunca lanzan y no aparecen en `validatePattern` |
| CA4-M4 | Un patrón escrito con `ROUND_CONSUMPTION_MISMATCH` se guarda como borrador; uno con `STITCH_UNKNOWN` o un error de `layout` no, ni siquiera llamando directo a la acción. Un documento con la clave `stuffing` da `UNKNOWN_KEY` (fuera de la v2, enmienda C-13) |
| CA4-M5 | Las propiedades G1 a G13 (ADR 0010; G12 solo si se implementa `reuse`) y RT1 a RT6 (ADR 0011) pasan con tres semillas. RT3 genera operaciones de bloques a toda la profundidad de `LIMITS.maxNesting`, no solo a 2 niveles |
| CA4-M6 | Revisión de código: ningún conteo de puntos se calcula en `apps/web` ni en `viewer-3d`; todos salen de `concreteRounds`, `countRound`, `expandRound` y `STITCHES` |
| CA4-M7 | Los casos F4-* de `docs/casos-dominio-fase-4.md` (T1) pasan como pruebas, con los valores "validar con tejedora" marcados `// validar con tejedora`. Como mínimo: fixture A (39 vueltas, 1.800 puntos, tambor: alto/diámetro ≈ 0,87) y fixture B (36 vueltas, 1.384 puntos, esfera: alto/diámetro entre 0,95 y 1,15), con B más alto que A (F4-45 a F4-51); disco de 6 aumentos plano y sin aviso, de 7 y de 12 con `ROUND_GROWS_FAST` (F4-36 a F4-38); `shapeMetrics` con `gaugeStitch: "dc"` en la muestra supuesta de la categoría 0 (F4-43); V1 con cadeneta en aro como advertencia y `PART_START_RING_SHORT`, `PART_START_FLAT_RING` y `MAGIC_RING_UNUSUAL` (F4-2 a F4-7); pista de la cadeneta de subida y del pd de unión (F4-11, F4-12) |

**Editor**

| ID | Criterio |
|---|---|
| CA4-E1 | El texto acepta ES y US mezclados (modo `es-us`). Una línea que no se lee marca línea y columna; el documento y el 3D no cambian hasta que la parte se lee |
| CA4-E2 | Los errores y avisos del validador aparecen junto a su vuelta, en el texto y en los bloques, con el mismo mensaje |
| CA4-E3 | Ida y vuelta: 20 cambios de pestaña texto ↔ bloques con ediciones aleatorias dejan el documento igual al que producen las mismas ediciones en una sola vista (E2E con `deepEqual` del documento guardado) |
| CA4-E4 | Las notas por vuelta (`>`) y un cierre de varias líneas sobreviven a guardar, recargar y cambiar de vista |
| CA4-E5 | Una línea `#` muestra el aviso de que los comentarios no se guardan |
| CA4-E6 | Los bloques muestran todo documento `savable`, incluidos grupos anidados hasta `LIMITS.maxNesting`. Editan lo que fija la decisión 2 (punto, cantidad, hebra, cambio de lana, grupos hasta 2 niveles, insertar y borrar vueltas, subir y bajar); los niveles 3 a 6 se ven en solo lectura con "Editar en el texto". Cada acción es un paso de deshacer |
| CA4-E7 | La forma canónica se aplica al salir de la línea, nunca mientras se escribe: el cursor no salta (E2E) |
| CA4-E8 | Partes: agregar, renombrar, reordenar, fijar la cantidad ("se teje N veces"; la interfaz no dice "copias", enmienda C-14) y borrar. La lista muestra "Oreja (1 de 2)". Borrar o bajar copias avisa qué piezas quedaron sin ubicar. Los topes duros del núcleo (`LIMITS`) se informan con un mensaje claro cuando una acción no se puede hacer |
| CA4-E9 | Las líneas sin leer se conservan en el respaldo local y se recuperan al recargar; nunca entran al documento |
| CA4-E10 | El selector de lanas de la fase 3 funciona en el estudio amigurumi; quitar una lana usada pide la de reemplazo y actualiza `@id` y `startYarn` |
| CA4-E11 | **Editor de bloques preparado para la versión completa** (decisión 2; ADR 0011, sección 7): (1) una prueba de Vitest monta el editor con `{ maxEditDepth: LIMITS.maxNesting, dragAndDrop: false }` y edita, agrupa y mueve un ítem a 6 niveles de profundidad sin cambiar otro código; (2) la revisión de código confirma que ninguna comparación de profundidad vive fuera de `canEditBlock` y que la selección se guarda por rutas (`ItemPath`); (3) RT3 corre a profundidad completa (CA4-M5) |
| CA4-E12 | **Límites recomendados desde el inicio** (decisión 5; ADR 0011, sección 3b): al abrir un amigurumi nuevo ya se ven el medidor de puntos de la escena, "N de 20 partes recomendadas" y la ayuda "¿Por qué hay límites recomendados?", antes de acercarse a ningún límite (E2E). El medidor avisa con texto desde el 80 %. Al superar un límite con una acción puntual aparece el diálogo "Seguir igual" o "Cancelar"; "Cancelar" deja el documento igual y "Seguir igual" aplica la acción y no vuelve a preguntar por ese límite en la sesión. Al superarlo escribiendo texto no hay diálogo: la advertencia aparece junto a la vuelta. Ninguna de las dos cosas entra al documento |

**Visor 3D**

| ID | Criterio |
|---|---|
| CA4-V1 | El aviso de prototipo digital está siempre visible junto al visor y no se puede cerrar, y menciona el relleno ("redondea la pieza y puede cambiar sus medidas") y la tensión de amigurumi ("teje una muestra con tu aguja") (enmienda C-11). Las medidas dicen "estimación", y "supuesto" si la muestra es supuesta |
| CA4-V2 | Capturas de Playwright en el PR: esfera (fixture B), cuerpo de 39 vueltas (fixture A, tambor de tapas planas), cilindro, panel plano, pieza con cambios de color, pieza que ondula y muñeco armado. `experto-tejido` las revisa (T21) |
| CA4-V3 | Una oreja anclada en la V10 de la cabeza sigue en la V10 después de agregar 4 vueltas a la cabeza (E2E) |
| CA4-V4 | Tocar la superficie fija el ancla en la vuelta y el punto tocados, y "Dónde va cada pieza" lo dice en texto con la forma de la enmienda C-17 ("Oreja (1 de 2): se cose a la cabeza, entre la V10 y la V11, contando desde el anillo mágico"), sin distancia en puntos desde el inicio de la vuelta |
| CA4-V5 | Sin WebGL2 (un contexto solo WebGL1 cuenta como sin WebGL, enmienda V-2), o si se pierde el contexto y no vuelve, se muestran las siluetas (`profileToSvg`) y la descripción; el estudio sigue editable |
| CA4-V6 | Con aumentos de más (`Δr/s > 1,25`, por ejemplo 7 o 12 por vuelta en pb), aparece `ROUND_GROWS_FAST` como información (nunca como error) con el texto de F4-77, y el 3D muestra la ondulación acotada. Un disco de 6 por vuelta no avisa, ni la V1 sobre anillo mágico (enmiendas C-5 y C-6) |
| CA4-V7 | "Tejer este diseño" no está disponible para patrones escritos, con el texto de la decisión 8; el servidor ya lo rechaza (`start_chart_project` exige `kind = 'chart'`) |
| CA4-V8 | **Aspecto por fibra** (decisión 10; ADR 0010, sección 6b): activado por defecto; capturas de Playwright en el PR de la misma pieza con 100 % algodón, 100 % acrílico, 70/30 lana y mohair, 100 % seda y "Colores planos", revisadas por `catalogo-lanas` y `experto-tejido` (T11c). Con el aspecto neutro, el píxel es igual al del material base (prueba de captura). "Colores planos" es la misma preferencia que el estudio de colorwork (`loopita:vista:colores-planos`), sobrevive a recargar y nunca entra al documento. Ninguna textura viene de un archivo de imagen. Sin WebGL, la silueta usa el color plano y el texto dice que el halo y el brillo solo se ven en 3D. Una prueba de tipos asegura que `YarnLook` y `SurfaceLook` son intercambiables, y `viewer-3d` no importa `stitch-render` ni `yarn-catalog` (revisión de dependencias) |

**Glosario**

| ID | Criterio |
|---|---|
| CA4-G1 | Todo código de `STITCHES` tiene abreviatura y nombre en `es`, `us` y `uk` (tabla de la enmienda C-15), y todos los términos están en estado "pendiente". Están los términos de amigurumi de T1 y "cadeneta de subida", "pd de unión" y "cadeneta de giro" con la nota de que no cuentan como puntos (C-21). Ninguna variante regional del español sin respaldo (F4-69). La interfaz rotula la terminología como pendiente de validación |
| CA4-G2 | El modo `es-uk` solo se usa si se elige. "dc" se lee como punto alto en `es-us` y como punto bajo en `es-uk`, y "tr" como pad en `es-us` y como pa en `es-uk` (prueba, F4-63 y F4-65). `htr`, `dtr`, `ss`, `miss` y `dc2tog` solo se leen en `es-uk`; `sc` (y `sc2tog`) en `es-uk` da error de lectura con la pista del otro dialecto (F4-64, F4-66). US escribe "sl st". `formatPart` en UK escribe `dc` para el punto bajo, con ida y vuelta sin pérdida (F4-68). RT5 pasa por modo (enmiendas C-15 y C-16) |
| CA4-G3 | La preferencia de dialecto se guarda en el perfil, se respeta en otro dispositivo y nadie puede cambiar la de otra usuaria (`10_rls_check.sql`) |
| CA4-G4 | Los datos de `glossary` no contienen marcas ni nombres de tienda (prueba automática, como CA3-L11) |

**Accesibilidad**

| ID | Criterio |
|---|---|
| CA4-A1 | Partes, texto, bloques y visor se usan enteros con teclado. El lector de pantalla anuncia (`aria-live`) el conteo de la vuelta editada y sus errores |
| CA4-A2 | Visor: descripción textual (`describeWritten`), giro con flechas, acercar con `+` y `−`, `prefers-reduced-motion` respetado |
| CA4-A3 | En 390 px, partes, editor y visor van en pestañas, sin perder controles; texto al 200 %; contraste WCAG 2.2 AA; los bloques muestran la letra de la lana, no solo el color |

### Cambios al modelo canónico (`pattern-core`)

- **`schemaVersion: 2`** ([ADR 0011](adr/0011-posicion-de-partes-y-editor-escrito.md), secciones 1 a 5):
  - `WrittenPattern.layout` (posiciones libres y ancladas) y `Part.copies`, **y nada más**: `Part.stuffing` y el inicio en óvalo quedan fuera de la v2 (decisión 6 resuelta por T1, enmienda C-13 del ADR 0011);
  - paso de migración `STEPS[1]` sin transformar datos;
  - validador v2 con los códigos `PART_COPIES` y `LAYOUT_*`, y topes duros nuevos en `LIMITS` (`maxCopies: 50`, `maxLayoutDepth: 16`, `maxPositionCm: 1000`, `maxOffsetCm: 100`; ADR 0011, sección 3).
- **Límites recomendados** (decisión 5; ADR 0011, sección 3b): `RECOMMENDED_WRITTEN_LIMITS`, `recommendedLimitUsage` y `recommendedLimitNotices`, puros y **fuera del validador**. Los topes duros de `LIMITS` no cambian.
- **Borradores escritos**: cinco códigos de conteo pasan a `DRAFT_ERROR_CODES` (ADR 0011, sección 4). Enmienda E12 del ADR 0006 (hecha en T4).
- **Ajustes de T1 al validador** (ADR 0011, sección 4; enmiendas C-9, C-10, C-19 y C-20): la V1 con cadeneta en aro que no cuadra pasa a advertencia; advertencia `PART_START_RING_SHORT`; información `PART_START_FLAT_RING` y `MAGIC_RING_UNUSUAL`; pista de la cadeneta de subida y del pd de unión en los mensajes de desajuste.
- **Derivados nuevos** ([ADR 0010](adr/0010-geometria-3d-amigurumi.md), secciones 1 y 2): `shapeMetrics(gauge, { assumed, gaugeStitch })` (enmienda C-3), `partProfile`, `partDimensions`, `STITCH_HEIGHT_FACTOR` (`sc` 1, `hdc` 1,5, `dc` 2, `tr` 2,5, `inc`/`inc3`/`dec` 1; `slst` y `ch` sin valor, fuera del promedio) y `PROFILE_RADIAL_TOLERANCE = 1,25` (C-5). Avisos informativos nuevos: `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST`, por `Δr/s` y con los textos de F4-77 y F4-78 (C-6). Desde T5: `STITCH_HEIGHT_FACTOR` vive en `profile.ts`, `ValidateOptions.assumedGaugeStitch` (por omisión `"sc"`) y los avisos exigen que la vuelta cambie el conteo en el mismo sentido (ADR 0010, enmiendas T5-1 a T5-6).
- **Texto** (ADR 0011, sección 7):
  - `normalizePart`, `formatPartLines` y `parseWrittenParts`;
  - notas `>` y encabezado "Cantidad" (alias "Hacer", "Piezas" y "Tejer"; C-14);
  - `Dialect` con `uk`, modos de lectura `es-us` y `es-uk` con alias por modo, tabla UK del CYC y "sl st" en US (C-15 y C-16);
  - `PARSE_LIMITS`.
- **Operaciones de edición escritas** (`edit-written.ts`, ADR 0011, sección 6); `addYarn`, `removeYarn` y `reorderYarns` generalizados a `Pattern`.
- **Regla del ADR 0007, sección 5**: la migración v1 → v2 no cambia la secuencia de pasos (propiedad M3), así que no necesita `migratePointer`.

### Paquetes nuevos y su contrato

| Paquete | Qué hace | Depende de | Contrato |
|---|---|---|---|
| `packages/viewer-3d` | Malla por punto, escena con copias y anclas, silueta SVG (puro); adaptador `three` en la subruta `./three` | Puro: solo `pattern-core`. `./three`: `three` como dependencia par | `buildPartMesh` (con `reuse` opcional), `shapeSignature`, `colorizePartMesh`, `surfaceFrame`, `buildScene` (con `stitchCount`), `profileToSvg`, `SurfaceLook`; `createThreeRenderer` (`AmigurumiRenderer` con `setLooks` y `setPreviewOverride`) ([ADR 0010](adr/0010-geometria-3d-amigurumi.md), secciones 3 a 6c y 9). No depende de `stitch-render` ni de `yarn-catalog` |
| `packages/glossary` | Términos de patrón ES, US y UK, nombres completos, variantes regionales y su estado de validación | Solo `pattern-core` | `term`, `stitchLabel`, `roundWord`, `TERMS` ([ADR 0011](adr/0011-posicion-de-partes-y-editor-escrito.md), sección 8) |

Misma convención que `follow`: TypeScript sin compilar, `exports` a `src/index.ts` (más `./three` en `viewer-3d`), `node:test`, generador de propiedades con semilla. Se agregan al job "Núcleo" de la CI y a `transpilePackages`.

**Funciones nuevas en paquetes existentes**:

| Paquete | Agrega | ADR |
|---|---|---|
| `pattern-core` | Lo de la sección anterior | 0010, 0011 |
| `pattern-render` | `describeWritten` (descripción accesible del amigurumi, con partes, vueltas, conteos y medidas estimadas) | 0010, sección 8 |
| `yarn-catalog` | Sin cambios de contrato: la muestra supuesta en crochet sale de `suggestedGauge(grosor, "crochet")`, y los niveles de fibra (`halo`, `brillo`, `definicion`) son los de la fase 3. `catalogo-lanas` revisa en T11c que cubran las fibras habituales en amigurumi, sin inventar datos | 0010, secciones 1 y 6b |
| `stitch-render` | Sin cambios: el 3D reutiliza `yarnLook`, `lookInputKey` y `lookKey` desde la aplicación | 0010, sección 6b |
| `apps/web` | Componente r3f del visor (`components/amigurumi/`), almacén del estudio amigurumi, traducción de rutas del validador a líneas, respaldo local de líneas sin leer, preferencia de dialecto, aspectos por lana para el 3D (`yarnLook`) con "Colores planos" compartido, árbol de bloques (`blockTree`, `BlockEditPolicy`), medidor y advertencias de límites recomendados | 0010, 0011 |

**Dependencias nuevas**: `three` y `@react-three/fiber`, solo para `apps/web` y `viewer-3d/three`, con su justificación en el PR (ADR 0010, sección 9). **Sin `drei`.** Versiones confirmadas en T3b (enmienda V-5): `three` 0.186.1, `@react-three/fiber` 9.8.2 (pide `react >=19 <19.4`), `@types/three` 0.186.0. `three` y r3f no van en `transpilePackages`; solo `@loopitalab/viewer-3d`.

### Pantallas de `apps/web`

| Ruta | Contenido |
|---|---|
| `/disenos/nuevo` | Elegir "Colorwork (palillo)" o "Amigurumi (crochet, por partes)". El amigurumi pide título y lana inicial, y crea una parte "Cuerpo" con anillo mágico |
| `/disenos` | Tipo de cada diseño ("Colorwork" o "Amigurumi"). "Tejer" solo en los de colorwork |
| `/disenos/[id]` | Despacha por `kind`. Un gráfico abre el estudio de colorwork, sin cambios; un escrito abre el estudio amigurumi |
| `/cuenta` | "Abreviaturas de los patrones": Chile (ES), EE. UU. (US) o Reino Unido (UK), con el rótulo "terminología pendiente de validación" |

**Estudio amigurumi** (`frontend-editor`, con `visor-3d` para el visor; revisa `ux-accesibilidad`):

- **Partes** (columna o pestaña): nombre, "× 2" si tiene copias, vueltas, conteo final y estado (bien, con errores de conteo o sin leer). Agregar, renombrar, reordenar, copias, borrar.
- **Editor** de la parte elegida, con pestañas "Texto" y "Bloques" (bloques: edición básica hasta 2 niveles; niveles más profundos en solo lectura con "Editar en el texto").
  - Encabezado de la parte: inicio, construcción, lana inicial y cierre.
  - Errores junto a cada vuelta y conteo de cada vuelta, del motor.
- **Visor 3D**: muñeco armado o la parte sola, giro y acercamiento, aviso de prototipo, medidas estimadas, interruptor "Colores planos", medidor "N de 40.000 puntos recomendados", indicador "Actualizando 3D…" fuera de los límites, modo "Posicionar" (tocar la superficie, inclinar y girar) y "Restablecer cámara".
- **Límites recomendados**: medidor y ayuda "¿Por qué hay límites recomendados?" siempre visibles; "N de 20 partes recomendadas" en la lista de partes; diálogo "Seguir igual" o "Cancelar" en acciones puntuales; advertencia junto a la vuelta al escribir.
- **Lanas y muestra**: el selector de la fase 3 y la muestra, con "supuesto" si falta.
- **Armado**: pasos escritos y "Dónde va cada pieza".
- **En teléfono**: pestañas Partes, Editor y 3D. El conteo de la vuelta en edición queda siempre visible.

Lo que vive en cada capa:

| Capa | Contenido |
|---|---|
| Dominio | `pattern-core` (v2, perfil, texto, operaciones), `viewer-3d` puro, `glossary`, `pattern-render` (`describeWritten`) |
| Aplicación | Almacén del estudio amigurumi (fuera de React), resolución de la muestra supuesta, traducción de rutas a líneas, respaldo local, conversión de anclas con `viewer-3d` antes de `setPlacement`, Server Actions |
| Infraestructura | Supabase (`patterns` sin cambios, `profiles.pattern_dialect`), WebGL (`three`, r3f), `localStorage` |

### Persistencia en Supabase

- **`patterns`: sin migración SQL.** El CHECK `patterns_document_consistent` compara documento y columna, y `prepareDocument` ya migra antes de validar. Guarda v2 desde el despliegue.
- **Verificación previa (T2)**:
  - en la base real, ¿cuántos documentos `kind = 'written'` hay?;
  - ¿alguna función (`snapshot_pattern`, `start_chart_project`, `repin_project`, las RPC de compartidos) supone `schema_version = 1`?;
  - ¿algún índice o CHECK depende de la forma de `parts`?
- **Preferencia de dialecto**: migración `profiles.pattern_dialect text not null default 'es' check (pattern_dialect in ('es', 'us', 'uk'))`, con permiso de UPDATE por columna para la propia fila y una Server Action que valida el valor. Pasa por `revisor-seguridad`.
- **Borradores escritos**: se guardan por el flujo actual (ADR 0006, E10) con los códigos nuevos de `DRAFT_ERROR_CODES`. El servidor sigue rechazando todo documento no `savable`.
- **Tamaño**: un amigurumi dentro de los límites recomendados de la decisión 5 queda muy por debajo del tope de 750 KB (ADR 0006, E11). Como esos límites son solo advertencia, un diseño puede pasarlos: el tope de 750 KB y los de `LIMITS` siguen siendo la barrera dura, y `layout` está acotado por `LIMITS`.
- **Cuotas**: sin cambios (500 diseños por usuaria, versiones como hoy).

### Pendientes de la fase 3 que afectan a la fase 4

| Pendiente | Impacto en la fase 4 | Dónde se resuelve |
|---|---|---|
| T1b de las fases 2 y 3 (tejedoras), que depende de T1c (revisión legal) | La terminología de la fase 4 también queda pendiente, y no se puede publicar sin T1b | T1b de esta fase se suma a la misma ronda ([decisión 9](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13)) |
| CA-P6 en el equipo de referencia | El mismo equipo mide CA4-P1 a CA4-P4 | T12 (la usuaria mide) |
| Repetir `10_rls_check.sql` en el proyecto real | La migración de `profiles` agrega verificaciones | T8 |
| Puesta en público (P0 a P5 de `docs/despliegue-publico.md`) | Desde la puesta en público, los cambios de esquema se despliegan en dos pasos (ADR 0011, sección 5). Si la puesta en público ocurre durante la fase 4, la v2 se despliega antes o en dos pasos | T4, coordinado con `devops` |
| O-F3-1 (latencia del círculo con CPU ×4) | No bloquea: el visor 3D es otra ruta. La CI comparte la máquina | `render-puntos`, sin cambios |

### Qué depende de `experto-tejido` o de T1b

- **`experto-tejido` antes de implementar (T1)**. Produce `docs/casos-dominio-fase-4.md` con casos numerados F4-n. Las correcciones quedan como enmiendas de los ADR 0010 y 0011 (`arquitecto`). Temas:
  - **anillo mágico**: cuántos puntos son habituales en la V1 y si fuera de ese rango corresponde un aviso informativo;
  - **cadeneta base**:
    - en vueltas, cadeneta unida en aro (hoy la V1 consume `count`) frente a óvalo (trabajar por los dos lados: regla de consumo de la V1 y puntos de los extremos), y si el óvalo entra en la v2 (decisión 6);
    - en hileras, la convención de "la primera cadeneta desde el ganchillo no se trabaja" (`startAvailable` = `count − 1`) y qué pasa con mpa y pa;
  - **espiral frente a vueltas cerradas**: el punto deslizado de unión y la cadeneta para subir no son puntos del modelo, si la cadeneta de subida cuenta en pa, el escalón de la espiral y el marcador;
  - **pb, aum y dism**: aum = 2 pb en el mismo punto, aum3; dism común e invisible (mismo conteo); aumentos escalonados entre vueltas (solo texto y vista, nunca conteos);
  - **conteos**: el conteo declarado "(18)", los rangos que mantienen el conteo y qué errores de conteo son borrador (ADR 0011, sección 4);
  - **relleno**: valores de `stuffing`, su efecto en la vista (pieza sin relleno aplanada), el cierre (pasar la hebra por las hebras delanteras) y si entra en la v2 (decisión 6);
  - **copias**: el término del encabezado ("Cantidad: 2", "Hacer 2"…);
  - **forma**: valores de `STITCH_HEIGHT_FACTOR`; calibración de `PROFILE_RADIAL_TOLERANCE` (¿un disco de pb con 6 aumentos por vuelta queda plano?, ¿desde cuántos ondula?); si la vuelta en hebra trasera quiebra el perfil; fixture de referencia de unas 40 vueltas;
  - **terminología**: tabla UK completa y variantes regionales del español que se puedan respaldar; términos de amigurumi para el [glosario pendiente](#glosario-pendiente);
  - **límites recomendados** (decisión 5): si 20 partes, 10 copias, 100 vueltas y 200 puntos por vuelta cubren los amigurumi habituales con holgura. Si no, se ajustan los valores antes de T4 (son advertencias, así que el ajuste no cambia qué se puede guardar);
  - **textos**: avisos `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST`, aviso de prototipo del 3D (con el halo y el brillo), "Dónde va cada pieza", comentarios `#`, notas `>` y las advertencias de límites recomendados.
- **Resultado de T1 (2026-11-13)**: todos los temas tienen regla o quedan "validar con tejedora" ([casos de dominio](casos-dominio-fase-4.md), con la hoja para T1b). Lo principal: relleno y óvalo fuera de la v2 (la v2 queda con `layout` y `copies`); `STITCH_HEIGHT_FACTOR` y `PROFILE_RADIAL_TOLERANCE = 1,25` fijados; el cuerpo de +6 por vuelta es un tambor (fixture A) y la esfera es el fixture B; `shapeMetrics` recibe el punto de la muestra; tabla UK confirmada con el CYC; encabezado "Cantidad"; los cinco límites recomendados se mantienen. Enmiendas C-1 a C-12 en el ADR 0010 y C-9, C-10 y C-13 a C-21 en el ADR 0011.
- **Tejedoras (T1b de esta fase, en la misma ronda que T1b de las fases 2 y 3, después de T1c)**:
  - lectura y escritura de la sintaxis, y utilidad de los bloques;
  - parecido del 3D con piezas reales (2 o 3 patrones propios tejidos), incluido el aspecto por fibra (algodón, acrílico y alguna mezcla con halo);
  - si usan grupos de más de 2 niveles y si echan de menos arrastrar y soltar (decide la prioridad del [editor de bloques completo](#editor-de-bloques-completo));
  - nombres ES, US y UK, y variantes regionales;
  - copias, relleno y "Dónde va cada pieza".
- **`experto-tejido` al cierre (T21)**: aprobación final de la lógica de tejido, la forma y los textos, con las respuestas de T1b si llegaron.

### Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R4-1 | WebGL por software en la CI es lento o inestable y las mediciones no reflejan el equipo real | T3 lo prepara temprano; la CI informa y el equipo de referencia decide (como CA-P6); presupuesto configurable por variable, como `E2E_LATENCY_BUDGET_MS` |
| R4-2 | Versiones de `three` y r3f incompatibles con React 19.2, Next 16 o `transpilePackages` | **Mitigado por T3b**: `three` 0.186.1 y r3f 9.8.2 funcionan con React 19.2 y Next 16 sin `transpilePackages` (enmienda V-5). Queda el riesgo de rango R4-18 |
| R4-18 | `apps/web` pide `react ^19.2.0`; React 19.4 saldría del rango de r3f 9.8.2 (`react >=19 <19.4`) y una actualización automática rompería el visor | `devops` decide si acota o fija el rango de `react`, o si vigila y sube r3f a la vez (ADR 0010, riesgos de las enmiendas) |
| R4-19 | Las cifras de T3b vienen de una malla sintética: el `buildPartMesh` real será más lento, y no se midió el costo de la extensión del material frente a `MeshStandardMaterial` sin extender | Guardia de Node en T10 (CA4-P6); A/B del material base y de `E2E_FLAT_COLORS` en T11; T12 mide con la malla real. **Mitigado en parte (2026-11-14)**: T10 midió la malla real en Node (`buildPartMesh` del fixture A de 0,72 a 0,90 ms en el M1; ADR 0010, T10-8) y T11 cerró el A/B del material sin costo medible en el M1 ni en SwiftShader (T11-5). Falta la confirmación en el equipo de referencia (T12) |
| R4-20 | Cerca de `SCENE_HARD_STITCH_CAP` (armado de hasta 1 s), reconstruir una parte grande en el hilo principal podría romper `edit-to-feedback` (CA4-P8) | T12 lo mide; si falla, `reuse` obligatorio y, si no alcanza, *worker* con una enmienda del ADR 0010 (sección 6c) |
| R4-21 | Los valores "validar con tejedora" de forma (`STITCH_HEIGHT_FACTOR`, tolerancia 1,25, `ρ = 1,2`) cambian en T1b y mueven capturas y pruebas | Constantes con nombre y pruebas marcadas `// validar con tejedora`; un cambio es una enmienda sin tocar el documento |
| R4-3 | El tamaño del paquete de `three` empeora la carga | `next/dynamic` solo en el estudio amigurumi; CA4-P7; tamaño informado en el PR. T11: fragmento del visor de 255 KB con gzip, siluetas también por `next/dynamic` (sin WebGL2 no se descarga `three`) y 0,8 KB más en las rutas con `pattern-core` por `recommendedLimitUsage`, aceptado (ADR 0010, T11-7) |
| R4-4 | La forma no se parece a la pieza real (calibración, alto de los puntos) | Calibración con casos de T1 (fixtures A y B: el perfil distingue tambor y esfera con el mismo máximo); capturas revisadas por `experto-tejido`; comparación con piezas reales en T1b; aviso de prototipo y medidas como estimación |
| R4-5 | Algún camino de lectura no migra y un v1 falla al subir a v2 | T4 enumera todos los lectores (`prepare.ts`, `shared-pattern.ts`, proyectos, `follow`, fixtures); M1 a M4; CA4-M2 con documentos v1 reales |
| R4-6 | La ida y vuelta texto ↔ documento pierde algún caso no previsto | Generador de partes que cubre todos los campos (notas, cierres de varias líneas, hebras, grupos anidados, rangos, copias); RT1 a RT3 con tres semillas |
| R4-7 | Expresiones regulares del lector con entradas desmedidas (texto pegado, IA en la fase 5) | `PARSE_LIMITS`; prueba de tiempo con líneas hostiles; revisión de T20 |
| R4-8 | Ambigüedad entre US y UK ("dc", "tr") cambia los conteos sin que se note | Modo de lectura explícito; RT5; el modo se ve junto al editor |
| R4-9 | El editor de bloques crece sin control, o la v1 básica se arma de forma que la versión completa obligue a rehacerla | Alcance fijado en la decisión 2; todo se ve, se edita lo acordado. Operaciones y árbol con profundidad completa, tope solo en `BlockEditPolicy`; CA4-E11 lo verifica |
| R4-15 | El aspecto por fibra rompe el presupuesto de 100 ms o los 30 fps, sobre todo con WebGL por software | Tabla por lana en uniformes (sin reconstruir ni subir atributos), un solo programa de shader, `"smooth"` mantiene solo los términos baratos; CA4-P3, CA4-P4 y CA4-P10 con el aspecto activado; A/B con `E2E_FLAT_COLORS`. Si no alcanza, enmienda del ADR 0010 que baja el aspecto en `"smooth"` |
| R4-16 | El aspecto 3D no coincide con el 2D de la misma lana, o no se parece a lanas reales | Una sola fuente (`yarnLook`); capturas 2D y 3D revisadas juntas en T11c; "validar con tejedora" en T1b; aviso de prototipo |
| R4-17 | Al ser solo advertencia, una usuaria arma escenas enormes y el navegador se pone lento o se cuelga | Información desde el inicio (CA4-E12); degradación explícita sobre 40.000 puntos y siluetas sobre `SCENE_HARD_STITCH_CAP` (CA4-P8 y CA4-P9); los topes duros de `LIMITS` y los 750 KB siguen vigentes |
| R4-10 | T1b sigue bloqueada por T1c y la terminología no se valida | La fase 4 avanza con `experto-tejido` y todo queda "pendiente" (decisión 9); nada se publica sin T1b |
| R4-11 | Los errores parpadean mientras se escribe | El error de lectura se muestra tras una pausa o al salir de la línea; el 3D queda en el último estado bueno |
| R4-12 | La puesta en público ocurre durante la fase 4 y cambia la regla de reversión | Desplegar la v2 antes de P5 o en dos pasos (lector y después escritor); T4 coordina con `devops` |
| R4-13 | El 3D es poco accesible por naturaleza | El texto es la vista principal; descripción textual y siluetas; el 3D es complementario |
| R4-14 | Las anclas quedan fuera de rango al editar el anfitrión | `LAYOUT_ANCHOR_RANGE` como advertencia, el 3D acota y lo dice; las operaciones limpian las referencias que se borran |

### Desglose de tareas

El orden es el de ejecución. Las tareas con la misma letra de grupo pueden ir en paralelo. Complejidad y modelo según la tabla de `CLAUDE.md`. QA y seguridad van al final (grupo E); `experto-tejido` revisa la lógica de tejido antes (T1) y al cierre (T21).

| # | Grupo | Tarea | Agente | Complejidad (modelo) | Depende de |
|---|---|---|---|---|---|
| T0 | A | **Hecha el 2026-11-13.** La usuaria aprueba los ADR 0010 y 0011 y las [decisiones de la fase 4](#decisiones-de-la-fase-4-aprobadas-el-2026-11-13). `arquitecto` registró las enmiendas (decisiones 2, 5 y 10) en los dos ADR y en esta sección | (usuaria) | — | — |
| T1 | A | **Hecha (2026-11-13)**: [casos de dominio](casos-dominio-fase-4.md) (F4-1 a F4-84, fixtures A y B, hoja para T1b); decisión 6 resuelta (relleno y óvalo fuera de la v2); límites confirmados; correcciones C-1 a C-21 registradas por `arquitecto` como enmiendas de los ADR 0010 y 0011. Encargo: revisión de dominio **antes de implementar** (lista en "Qué depende de `experto-tejido` o de T1b"): anillo mágico, cadeneta base (aro u óvalo; hileras), espiral frente a cerradas, pb/aum/dism, conteos, relleno, copias, alto de los puntos y calibración del disco plano, tabla UK, textos. Produce `docs/casos-dominio-fase-4.md` (casos F4-n, incluido el fixture de unas 40 vueltas). `arquitecto` registra las correcciones como enmiendas de los ADR 0010 y 0011. Incluye la revisión de los límites recomendados (decisión 5). **Aceptación**: cada tema tiene una regla o queda marcado "validar con tejedora"; `STITCH_HEIGHT_FACTOR` tiene valores; la decisión 6 queda resuelta (`stuffing` y óvalo con regla antes de T4, o fuera de la v2); los cinco límites recomendados quedan confirmados o ajustados | `experto-tejido` | Media (sonnet) | T0 |
| T1b | A | Agregar los temas de la fase 4 a `docs/validacion-tejedoras.md` y validarlos en la misma ronda que T1b de las fases 2 y 3, **después de T1c** de la fase 3. **Aceptación**: lo marcado "validar con tejedora" en los ADR 0010 y 0011 y en los casos F4 queda confirmado o corregido | `experto-tejido` con la usuaria | Media (sonnet) | T1; T1c de la fase 3 |
| T2 | A | **Hecha (2026-11-13)**: [informe](auditoria-base-fase-4.md); la v2 no necesita migración SQL de `patterns`. Encargo: auditoría de la base real (ver "Persistencia en Supabase"): cantidad de documentos escritos, funciones o restricciones que supongan `schema_version = 1` o una forma de `parts`. **Aceptación**: informe con las consultas usadas y la conclusión "la v2 no necesita migración SQL de `patterns`" (o la lista de cambios) | `backend-supabase` | Baja (haiku) | — |
| T3 | A | **Hecha (2026-11-13)**: proyecto Playwright `webgl` con las opciones de SwANGLE (SwiftShader) en Chromium, página `/dev/webgl`, `E2E_VIEWER_BUDGET_MS` provisional en 400 ms en la CI. **Las tres corridas seguidas de la CI se verifican tras el push.** Encargo: CI: WebGL por software (SwiftShader) en Chromium para el E2E y la latencia del visor; jobs de `viewer-3d` y `glossary` en "Núcleo"; presupuesto por variable de entorno. **Aceptación**: una página de prueba con un lienzo WebGL pasa en la CI tres veces seguidas | `devops` | Media (sonnet) | — |
| T3b | A | **Hecha (2026-11-13)**: prototipo en `apps/web/src/app/dev/visor/` (borrado en T11 y reemplazado por `/dev/visor-3d`; ADR 0010, enmienda T11-4). `three` 0.186.1 y r3f 9.8.2 sin `drei` ni `transpilePackages`; fragmento de 246 KB con gzip por `next/dynamic`; con CPU ×4 y 2.448 puntos, p95 de 2,8 ms (atributos), 6,4 ms (subir y dibujar), 2,2 ms (recolorear) y 0,7 ms (`setLooks`); 2 programas sin recompilar; SwiftShader p95 43 ms. Enmiendas V-1 a V-5 del ADR 0010 (`SCENE_HARD_STITCH_CAP = 200.000`, uniformes sin textura de datos, `LOD_STITCH_BUDGET = 20.000`, versiones). Riesgos R4-18 y R4-19. Encargo: prototipo: lienzo r3f en `/dev` con `next/dynamic`, `frameloop="demand"`, una malla de 10.000 vértices actualizada en el lugar. Confirmar versiones de `three` y r3f con React 19.2 y Next 16, `transpilePackages` y tamaño del fragmento. Primera calibración de `LOD_STITCH_BUDGET`. **Aspecto por fibra** (ADR 0010, sección 6b): `MeshStandardMaterial` con `onBeforeCompile` y la tabla de 32 lanas en uniformes (o en textura de datos si los uniformes no alcanzan, con la razón), medición de `setLooks` y de fps con el aspecto activado y apagado, y comprobación de que cambiar aspectos no recompila. Escena de 40.000 y de 60.000 puntos para una primera cifra de `SCENE_HARD_STITCH_CAP`. **Aceptación**: informe con versiones, tamaño, tiempo de actualización de atributos con CPU ×4, costo del aspecto por fibra (A/B), programas de shader y la recomendación; si algo falla, enmienda del ADR 0010 antes de T11 | `visor-3d` | Media (sonnet) | T0 |
| T4 | B | **Hecha (2026-11-13, commit `e4db73e`)**: v2, validador, borradores escritos y límites recomendados. Enmiendas E12 del ADR 0006 y T4-1 a T4-7 del ADR 0011: pistas en `data.hints`, `MAGIC_RING_UNUSUAL` solo en vueltas, `LIMIT` por lo que trabaja una vuelta (endurecimiento a propósito de M1), `ROUND_NUMBERING` de −1000 a 0, `maxRotationDeg` y `maxPlacements`, M1 contra un validador v1 congelado. Encargo: `pattern-core` v2 (ADR 0011, secciones 1 a 5): tipos, `STEPS[1]`, validador v2 (`PART_COPIES`, `LAYOUT_*`, topes duros nuevos de `LIMITS`), **sin `stuffing` ni óvalo** (fuera de la v2, enmienda C-13: la clave `stuffing` da `UNKNOWN_KEY`), `DRAFT_ERROR_CODES` escritos (y enmienda del ADR 0006), **ajustes de T1 al validador** (ADR 0011, sección 4: V1 con cadeneta en aro como advertencia con la pista del aro, `PART_START_RING_SHORT`, `PART_START_FLAT_RING`, `MAGIC_RING_UNUSUAL`, pista de la cadeneta de subida y del pd de unión, sugerencia en `ROUND_RANGE_CHANGES`; C-9, C-10, C-19 y C-20), lista de todos los lectores del documento, propiedades M1 (enmendada: mismos códigos de error, solo pueden sumarse las advertencias e informaciones nuevas) a M4, README. Más los **límites recomendados** (ADR 0011, sección 3b): `RECOMMENDED_WRITTEN_LIMITS` con los valores confirmados por T1 (20, 10, 100, 200 y 40.000; C-18), `recommendedLimitUsage` y `recommendedLimitNotices`, fuera del validador. **Aceptación**: CA4-M1, CA4-M3, CA4-M4 y CA4-M8 en pruebas de `pattern-core`, más los casos F4-2 a F4-7, F4-11, F4-12 y F4-29 a F4-34 (parte de CA4-M7); `pnpm test` en verde | `motor-patrones` | Alta (opus) | T0, T1, T2 |
| T4b | B | **Hecha (2026-11-13, commit `a7cec12`)**: fixtures y dobles de base con `SCHEMA_VERSION`. Encargo: actualizar los fixtures y pruebas que escriben `schemaVersion: 1` a mano para usar `SCHEMA_VERSION`, salvo los de migración (tarea mecánica en muchos archivos). **Aceptación**: `pnpm -r test` y `pnpm typecheck` en verde; ningún `schemaVersion: 1` fuera de las pruebas de migración y de `10_rls_check.sql` | `motor-patrones` | Baja (haiku) | T4 |
| T5 | B | **Hecha (2026-11-13, commit `ca96b46`)**: perfil de las partes (`shapeMetrics`, `partProfile`, `partDimensions`) y avisos de forma. Enmiendas T5-1 a T5-6 del ADR 0010: `ValidateOptions.assumedGaugeStitch` (por omisión `"sc"`) y tabla de muestra de crochet copiada de `yarn-catalog` (prueba cruzada pendiente, T19); `STITCH_HEIGHT_FACTOR` en `profile.ts`; avisos solo si la vuelta cambia el conteo en el mismo sentido, uno por vuelta escrita (validar con `experto-tejido`, T21); `CLAMP_EPSILON` interno; sin muestra no hay avisos; textos con "parte, vuelta N:". Encargo: `pattern-core` (ADR 0010, secciones 1 y 2, con las enmiendas C-2 a C-8 y C-12): `shapeMetrics(gauge, { assumed, gaugeStitch })` con la conversión desde el punto de la muestra (C-3); `partProfile` con los tres tramos del paso radial (C-4) y la V1 sobre anillo mágico sin acotar; `partDimensions`; `STITCH_HEIGHT_FACTOR` (`sc` 1, `hdc` 1,5, `dc` 2, `tr` 2,5, `inc`/`inc3`/`dec` 1; `slst` y `ch` sin valor y fuera del promedio) y `PROFILE_RADIAL_TOLERANCE = 1,25` (C-5), marcados `// validar con tejedora`; avisos `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST` por `Δr/s` con los textos de F4-77 y F4-78 (C-6); propiedades G1, G2, G3 reescrita y G11 (la parte del perfil); guardia de rendimiento con el fixture A. **Aceptación**: los casos F4-36 a F4-51 pasan; el fixture A (39 vueltas, 1.800 puntos) da un tambor de ≈ 9,55 cm de diámetro y ≈ 8,33 cm de alto, y el fixture B (36 vueltas, 1.384 puntos) una esfera con alto/diámetro entre 0,95 y 1,15; los dos cierran arriba y abajo hasta el anillo de 6 | `motor-patrones` | Alta (opus) | T1, T4 |
| T6 | B | **Hecha (2026-11-13, commit `29b1cde`)**: texto con ida y vuelta, dialecto UK y `edit-written.ts`. Enmiendas T6-1 a T6-6 del ADR 0011: `maxNesting` 6 = 6 niveles de ítems (5 grupos; `ItemPath` de hasta 6 índices, la misma definición para T15); `Make: N` en us y uk; alias sin "pr", "ss" fuera de `es-us`, `invdec`/`sk`/`skip` solo en `es-us` (pendiente de `experto-tejido`); semántica de `moveItem`, `unwrapGroup`, `insertRound`/`replaceRound`, `V0:`, cierres y notas en blanco; API `Dialect`, `ReadingMode`, `readingModeFor`, `PARSE_LIMITS` y los `PARSE_*` nuevos. Huecos de topes (`expected`, `start.count`, ítems por vuelta) para T20. Encargo: `pattern-core`, texto y operaciones (ADR 0011, secciones 6 y 7): `normalizePart`, notas `>`, encabezado "Cantidad" (escribe "Cantidad: N"; lee también "Hacer", "Piezas" y "Tejer", con o sin dos puntos; C-14), `formatPartLines`, `parseWrittenParts`, `Dialect` con `uk`, modo `es-uk` con la tabla UK de la enmienda C-15 y alias cargados por modo (C-16: "sl st" en US, `sc2tog` fuera de `es-uk`, `dc2tog` solo en `es-uk`, pista del otro dialecto para `sc` en `es-uk` y para `htr`/`dtr` en `es-us`), sin variantes regionales del español sin respaldo (F4-69), `Inicio: óvalo N` como `PARSE_START` con mensaje claro (F4-9), `PARSE_LIMITS`, `edit-written.ts` con **profundidad completa** (rutas hasta `LIMITS.maxNesting`, `moveItem` entre grupos y niveles; sin ningún tope de 2 niveles en el núcleo, decisión 2), generalización de las operaciones de lanas, propiedades RT1 a RT6. **Aceptación**: CA4-M5 (la parte RT, con RT3 a profundidad completa) y CA4-G2 en pruebas, con los casos F4-9 y F4-63 a F4-68; una línea hostil de 2.000 caracteres se lee en menos de 5 ms; las operaciones respetan los topes duros y nunca los recomendados | `motor-patrones` | Alta (opus) | T1, T4 |
| T7 | B | `packages/glossary` (ADR 0011, sección 8): datos del glosario pendiente y de T1 (sección 11 de los casos de dominio, más "cadeneta de subida", "pd de unión" y "cadeneta de giro" con la nota de que no cuentan como puntos, C-21), API, pruebas de cobertura de códigos y de marcas, README, job de CI. **Aceptación**: CA4-G1 y CA4-G4 | `documentador` | Media (sonnet) | T1, T6 (tabla UK) |
| T8 | B | **Hecha (2026-11-13; migración `20261114015632_perfil_dialecto.sql` aplicada en el proyecto real) (2026-11-13, commit `18a0f02`)**: `profiles.pattern_dialect` (`es`, `us` o `uk`, por omisión `es`) con permiso por columna, acción del perfil y verificaciones en `10_rls_check.sql`; coincide con el ADR 0011, sección 8 (enmienda T8-1). **Falta repetir el check en el proyecto real (necesita cuentas de prueba allí).** Encargo: migración `profiles.pattern_dialect` con permiso por columna, Server Action, verificaciones en `10_rls_check.sql`; repetir el check en el proyecto real. **Aceptación**: CA4-G3 (parte de la base); el check pasa en local y en el proyecto real | `backend-supabase` | Media (sonnet) | T0, T2 |
| T9 | B | `pattern-render`: `describeWritten` con partes, vueltas, conteo final, copias, posiciones en lenguaje de tejedora (forma de la enmienda C-17: "entre la V10 y la V11, contando desde el anillo mágico", sin distancia en puntos) y medidas estimadas, más sus propiedades. **Aceptación**: la descripción no calcula conteos propios (solo del motor) y dice "estimación" y "supuesto" cuando corresponde | `motor-patrones` | Media (sonnet) | T5, T6 |
| T10 | C | **Hecha (2026-11-14, commit `f803e9c`)**: `packages/viewer-3d`, parte pura. Enmiendas T10-1 a T10-9 del ADR 0010 (y su enlace en el ADR 0011): `PartMesh.loop` y `ringPhase`; giro por anillo, con `surfaceFrame(profile, round, stitch, { mesh }?)`, que `buildScene` y T16 tienen que llamar con la malla del anfitrión; `SceneResult.updates` (`kept`, `recolored` con su rango, `built` con `reusedRounds`); convenciones de `rotationDeg`, Euler XYZ, `attach` y hileras; ubicación automática a la derecha de las piezas libres; `reuse.fromRound` como cota; `limit` solo por parte (la escena parcial es de la fase 6); avisos `ANCHOR_*`, `GAUGE_ASSUMED` y `SHAPE_*`, con textos provisionales para T18. Referencia de Node en el M1: `buildPartMesh` del fixture A de 0,72 a 0,90 ms (se registran 1,8) y `buildScene` con una parte editada de 0,41 a 0,50 ms; la guardia salta a 3× (6× en la CI). Encargo: `viewer-3d` puro (ADR 0010, secciones 3, 4 y 9): `buildPartMesh` con topología por punto, `shapeSignature`, `colorizePartMesh`, `surfaceFrame`, `buildScene` con caché, copias, anclas, ubicación automática y `stitchCount`, `limit` para la fase 6, `reuse` desde la vuelta editada (deseable; obligatorio si CA4-P8 falla), `profileToSvg` con relleno de color plano, tipo `SurfaceLook`, propiedades G4 a G13, guardia de rendimiento con el fixture A (1.800 puntos; registra la referencia real de `buildPartMesh`, que T3b no midió por usar una malla sintética, R4-19), README, CI y `@loopitalab/viewer-3d` en `transpilePackages` (`three` y r3f no, enmienda V-5). Topología con `inc`, `inc3` y `dec` de punto bajo (C-12); la hebra trasera no quiebra el perfil, solo línea de borde con relieve (C-7); sin relleno ni óvalo (C-13). Sin importar `stitch-render` ni `yarn-catalog`. **Aceptación**: CA4-P6 y CA4-M5 (la parte G) en Node; F4-10, F4-28 y F4-58 como pruebas | `visor-3d` | Alta (opus) | T4, T5 |
| T11 | C | **Hecha (2026-11-14, commit `d7595ac`)**: subruta `viewer-3d/three`, `apps/web/src/components/amigurumi/` y `/dev/visor-3d`, que reemplaza a `/dev/visor`. Enmiendas T11-1 a T11-9 del ADR 0010: API real de `createThreeRenderer` (`setScene` con el resultado de `buildScene`, `pick` con `roundIndex` 0-based, `stitchInRound` y `point`, `setHighlight` con `roundIndex`, `bounds`, `snapshot`, `setMaterialVariant`, `stats`, `renderNow`); las luces las pone el renderer; resaltado por `gl_VertexID`, sin un tercer programa; `ViewerController` fuera de React, que decide el modo con `recommendedLimitUsage` antes de armar mallas; siluetas por `next/dynamic` (sin WebGL2 no se descarga `three`). A/B del material sin costo medible (cierra esa parte de R4-19). p95 con CPU ×4 en el M1: editar una vuelta, 24,7 ms; recolorear, 12,1; `setLooks`, 12,4; vista previa, 11,8. Fragmento de 255 KB con gzip, más 0,8 KB en las rutas con `pattern-core` (aceptado). Límites: la pieza que ondula se dibuja lisa y `snapshot` escala el lienzo; la descripción accesible es propia y T14 suma la completa. Encargo: `viewer-3d/three` y componente r3f en `apps/web` (ADR 0010, secciones 5 a 8, con las enmiendas V-1 a V-5 y C-11), partiendo del prototipo de T3b: atributos reservados y actualizados en el lugar, un solo material con la tabla por lana **en uniformes** (leída en el sombreador de vértices, *varyings* `flat`, `customProgramCacheKey` explícito; sin textura de datos; "sin WebGL" = sin WebGL2) y relieve procedural, `LOD_STITCH_BUDGET = 20.000` y `SCENE_HARD_STITCH_CAP = 200.000` iniciales, A/B del costo del material extendido frente a `MeshStandardMaterial` base (R4-19), **aspecto por fibra** (sección 6b: brillo, halo y definición con las constantes con nombre, `setLooks`, `setPreviewOverride`, los dos programas de nivel de detalle compilados al montar), aspectos calculados en la aplicación con `yarnLook` y "Colores planos" compartido con el estudio de colorwork, nivel de detalle con la degradación de la sección 6c ("smooth" forzado, razón de píxeles 1, una sola reconstrucción en curso, "Actualizando 3D…", siluetas sobre `SCENE_HARD_STITCH_CAP`), selección con el puntero, resaltado, controles con teclado, aviso de prototipo, medidas, silueta sin WebGL, pérdida de contexto, `dispose`, contadores del modo de medición. **Aceptación**: CA4-V1, CA4-V5, CA4-V8 (menos la revisión de T11c) y capturas para CA4-V2 | `visor-3d` | Alta (opus) | T3b, T10 |
| T11c | C | Calibración del aspecto por fibra en el 3D (ADR 0010, sección 6b): `visor-3d` ajusta `ROUGHNESS_BASE`, `FIBER_SHEEN_ROUGHNESS`, `FIBER_HALO_RIM`, `FIBER_HALO_SOFTEN` y `FIBER_DEFINITION_RELIEF` con capturas 2D y 3D de las mismas lanas (100 % algodón, 100 % acrílico, 70/30 lana y mohair, 100 % seda, un lurex y "Colores planos"). `catalogo-lanas` revisa que los niveles de `fibras.json` cubran las fibras habituales en amigurumi y que el 3D sea coherente con el 2D; lo que no tenga fuente (por ejemplo, lanas tipo chenille, que son una construcción y no una fibra) queda "validar con tejedora", sin inventar datos ni marcas. `experto-tejido` revisa el parecido. **Aceptación**: constantes fijadas con las capturas en el PR; informe de `catalogo-lanas` con la cobertura de fibras y lo pendiente para T1b; CA4-V8 completo | `visor-3d` con `catalogo-lanas` y `experto-tejido` | Media (sonnet) | T11 |
| T12 | C | Latencia del visor en E2E (CA4-P1 a CA4-P5 y CA4-P7 a CA4-P10) con instrumentación `edit-to-paint-3d`, `edit-to-feedback` y `hover-to-paint-3d`, siempre con el aspecto por fibra activado y el A/B de `E2E_FLAT_COLORS`; escenario fuera de los límites recomendados (unos 60.000 puntos) y escenario sobre `SCENE_HARD_STITCH_CAP`; guía para que la usuaria mida en el equipo de referencia (con CA-P6 pendiente de la fase 3); calibración final de `LOD_STITCH_BUDGET` (≥ 30 fps con 20.000 puntos en `"relief"` y razón de píxeles 2; si no, 10.000) y de `SCENE_HARD_STITCH_CAP` (la escena más grande que se arma completa en ≤ 1 s con CPU ×4), como enmiendas del ADR 0010; valor definitivo de `E2E_VIEWER_BUDGET_MS` para la CI con SwiftShader (hoy 400 provisional); medición de R4-20 (reconstruir una parte grande cerca del tope sin romper `edit-to-feedback`). **Lo que deja T11** (ADR 0010, T11-4 a T11-6): la página es `/dev/visor-3d` y el script de medición, `apps/web/e2e/medir-visor-3d.ts`, que T12 extiende con las tres métricas; el A/B del material frente a `MeshStandardMaterial` ya está cerrado (sin costo medible), así que queda solo el A/B de `E2E_FLAT_COLORS` en la latencia; las cifras del M1 y de SwiftShader de T11-6 son el punto de partida, y T12 las deja en `docs/qa-fase-4.md` con la salida del script (hoy no están en el repositorio); los contadores `?perf=1` salen de `stats()` del renderer y de `counters` de `ViewerController`. **Aceptación**: CA4-P1 a CA4-P3 y CA4-P10 con p95 < 100 ms en la CI con su presupuesto; CA4-P8 y CA4-P9 cumplidos; guía publicada en `docs/qa-fase-4.md` | `visor-3d` con `devops` | Alta (opus) | T3, T11, T11c, T14, T15 |
| T13 | D | Flujo de diseños escritos: `/disenos/nuevo` con tipo, `/disenos/[id]` que despacha por `kind`, guardado de borradores escritos (por `savable`, validando sin opciones; ADR 0006, E12), mensajes de los códigos nuevos, "Tejer" fuera para escritos (decisión 8), tipo en `/disenos`. **Aceptación**: CA4-M2, CA4-M4 (parte de la acción) y CA4-V7 | `frontend-editor` | Media (sonnet) | T4 |
| T14 | D | Estudio amigurumi: almacén fuera de React, partes, editor de texto por parte (lectura en cada cambio, errores por línea y por vuelta, forma canónica al salir de la línea, respaldo de líneas sin leer, aviso de `#`), selector de lanas, muestra, visor integrado con "Colores planos". **Dialecto** (ADR 0011, T8-1 y T6-5): escribe con `formatPart(part, profiles.pattern_dialect)` y lee con `readingModeFor(dialect)`; nunca guarda el modo de lectura. **Pistas** de los desajustes desde `data.hints` (T4-2) y validación con `assumedGauge`, `assumedGaugeStitch` (traducido de `assumption`) o `weightCat` cuando falta la muestra (ADR 0010, T5-1). **Límites recomendados** (ADR 0011, sección 3b): medidor de puntos de la escena y "N de 20 partes recomendadas" visibles desde el inicio, ayuda "¿Por qué hay límites recomendados?", diálogo "Seguir igual" o "Cancelar" en acciones puntuales (recordado por límite en la sesión, nunca en el documento), advertencia junto a la vuelta al escribir, todo con `recommendedLimitUsage` (sin contar en la interfaz). **Visor** (ADR 0010, T11-1, T11-3, T11-8 y T11-9): se monta con `AmigurumiViewerLoader`, que recibe el almacén como fuente (`subscribe` y `getSnapshot`) y deja el modo, la reconstrucción diferida y las siluetas a `ViewerController`, sin repetir esa lógica en el estudio; `pick` y `setHighlight` usan la vuelta concreta 0-based (`roundIndex`), que el estudio traduce al número visible con `concreteRounds` (cuidado con los rangos "V5–8"); la descripción accesible completa con `describeWritten` (T9) se suma a la corta del visor; los avisos de la escena (`notes`) se muestran como avisos, con los textos de T18. `recommendedLimitUsage` ya está en el fragmento compartido (T11-7), así que el medidor no suma peso. **Aceptación**: CA4-E1, CA4-E2, CA4-E4, CA4-E5, CA4-E7 a CA4-E10 y CA4-E12 | `frontend-editor` | Media (sonnet) | T6, T11, T13 |
| T15 | D | Editor de bloques con el alcance de la decisión 2 (edición básica), sobre las operaciones de `edit-written.ts`, **preparado para la versión completa** (ADR 0011, sección 7): árbol `blockTree` recursivo sin límite de profundidad, un solo componente recursivo, `BlockEditPolicy` (`BLOCK_EDIT_POLICY_V1 = { maxEditDepth: 2, dragAndDrop: false }`) como único lugar del tope, con la profundidad contada en **niveles de ítems** como el validador y el lector (1 = ítems de la vuelta; `LIMITS.maxNesting` 6 = 5 grupos anidados; `ItemPath` de hasta 6 índices; ADR 0011, T6-1), `canEditBlock`, selección por rutas, "subir" y "bajar" con `moveItem` (`to` es la ruta después de mover, T6-4), niveles 3 a 6 en solo lectura con "Editar en el texto"; cambio de pestaña con líneas sin leer. **Aceptación**: CA4-E3, CA4-E6 y CA4-E11 | `frontend-editor` | Media (sonnet) | T6, T14 |
| T16 | D | Posicionado y armado (decisión 3): modo "Posicionar" (tocar la superficie, inclinar, girar, separar), pieza principal libre, "Quitar posición", aviso de piezas sin ubicar, pasos de armado y "Dónde va cada pieza" con la forma de la enmienda C-17 (sin distancia en puntos desde el inicio de la vuelta; "contando desde el anillo mágico"). **Contratos de T10 y T11** (ADR 0010, T10-2, T10-4 y T11-1; ADR 0011, enmiendas por T10): tocar la superficie usa `pick`, que da `roundIndex` (vuelta concreta 0-based), `stitchInRound` y `point`. `SurfaceAt.round` se guarda como **número visible** (`concreteRounds(anfitrión)[roundIndex].number`) y `stitch` como `stitchInRound`. Todo marco que se muestre (vista previa del ancla, manijas de giro) sale de `surfaceFrame(profile, round, stitch, { mesh })` **con la malla del anfitrión**, igual que `buildScene`. Si no, el ancla no cae sobre el punto. "Inclinar" y "girar" escriben `rotationDeg` como `[sobre la normal, sobre la tangente, sobre el meridiano]`; la pieza principal libre usa Euler XYZ; `attach` es `"end"` o `"start"`, como en T10-4. En hileras, la tangente es +x y el panel mira hacia −y. El aviso de piezas sin ubicar sale de `placed: false` de las instancias, y los avisos `ANCHOR_CLAMPED` y `ANCHOR_UNRESOLVED`, de `notes`. **Aceptación**: CA4-V3, CA4-V4 y CA4-E8 (parte de las posiciones) | `frontend-editor` con `visor-3d` | Media (sonnet) | T10, T11, T14 |
| T17 | D | Accesibilidad: teclado en partes, texto, bloques y visor; anuncios de conteo y errores; descripción y siluetas; movimiento reducido; 390 px, 200 % y contraste; preferencia de dialecto en `/cuenta`; medidor y diálogo de límites recomendados (texto además del color, anuncio `polite` sin repetir en cada tecla, foco del diálogo); "Colores planos" alcanzable junto al visor. **Aceptación**: CA4-A1 a CA4-A3 | `ux-accesibilidad` | Media (sonnet) | T14, T15, T16 |
| T18 | D | Textos: aviso de prototipo del 3D (con el halo y el brillo como aproximación, el relleno y la tensión de amigurumi; C-11), medidas como estimación, ayuda de la sintaxis (con `>`, el encabezado "Cantidad" y sus alias, y que las bases ovaladas se escriben con `Inicio: AM` y se ven redondas), mensajes de `LAYOUT_*`, `PART_COPIES`, `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST` (de F4-77 y F4-78), `PART_START_RING_SHORT`, `PART_START_FLAT_RING`, `MAGIC_RING_UNUSUAL` y las pistas del aro, de la cadeneta de subida y de la cadeneta de giro (`data.hints`: `ring`, `join`, `turning_chain`; ADR 0011, T4-2), los `PARSE_*` nuevos (T6-5) y las pistas del otro dialecto, piezas sin ubicar, "Dónde va cada pieza", modo UK, terminología pendiente, **límites recomendados** (medidor, ayuda "¿Por qué hay límites recomendados?", diálogo, advertencia junto a la vuelta, "Actualizando 3D…", mensaje de siluetas sobre el tope del visor), "Editar en el texto" de los bloques profundos, "el halo y el brillo solo se ven en la vista 3D", avisos de la escena 3D (`ANCHOR_CLAMPED`, `ANCHOR_UNRESOLVED`, `GAUGE_ASSUMED`, `SHAPE_RUFFLES` y `SHAPE_GATHERS`, hoy provisionales en `packages/viewer-3d/src/scene.ts`; ADR 0010, T10-7) y textos del visor de `apps/web/src/components/amigurumi/texts.ts`. **Aceptación**: los textos usan el glosario (`term`) y los términos de T1, marcados "validar con tejedora" donde corresponde | `documentador` | Baja (haiku) | T1, T7 |
| T19 | E | QA: propiedades (M, G y RT), casos F4, E2E con sesión (CA4-M2, CA4-E3, CA4-V3), latencia, matriz de criterios en `docs/qa-fase-4.md`, incluidos CA4-E11 (editor preparado para la versión completa), CA4-E12 (límites desde el inicio) y CA4-V8 (aspecto por fibra). Revisión con opus de T4, T5, T6, T10, T11 y T12 (complejidad alta); sonnet para el resto. **Pendientes de T5 y T6**: prueba cruzada de la tabla de muestra de crochet del validador con `suggestedGauge(cat, "crochet")` de `yarn-catalog` para las categorías 0 a 7, fuera del núcleo (ADR 0010, riesgos de T5); pruebas de RT1 en el borde de los topes que decida T20 (`expected`, `start.count`, vueltas largas; ADR 0011, huecos de T6) | `qa-tester` | Alta (opus) / Media (sonnet) | T11c, T12 a T18 |
| T20 | E | Seguridad: validador v2 como barrera ante documentos hostiles (ciclos, profundidad, números extremos, tamaño), `PARSE_LIMITS` y tiempos del lector, migración y permisos de `profiles.pattern_dialect`, dependencias nuevas (`three`, r3f: *lockfile*, procedencia y transitivas), recursos WebGL en el cliente (incluido que un documento sobre los límites recomendados, pero dentro de los topes duros, no cuelgue la pestaña: CA4-P9). Con opus, porque T4 y T6 son de complejidad alta. **Pendientes de T4 y T6 para decidir aquí** (ADR 0011, "Huecos para T20" y "Lo que no coincide"; propuestas, no decididas): (1) tope de `expected` y de `start.count`, por ejemplo ≤ `LIMITS.maxRoundStitches`, hoy sin tope superior (un 1e20 es `savable` y no hace la ida y vuelta por texto); (2) tope de ítems por vuelta, para que una vuelta `savable` quepa en los 2.000 caracteres de `PARSE_LIMITS.maxLineLength`, o que `formatPart` la corte; (3) llevar la revisión de texto de los identificadores de `target` y `host` en `layout` al tope de 20 por código (hoy sin tope: hasta unos 5.000 problemas con 2.500 ubicaciones) | `revisor-seguridad` | Alta (opus) | T4, T6, T8, T11, T13 |
| T21 | E | Revisión final de la lógica de tejido: forma y calibración con las capturas, sintaxis, borradores, copias, textos. Incluye las reglas que la implementación dejó más estrictas que el ADR: los avisos de forma solo cuando la vuelta cambia el conteo en el mismo sentido, uno por vuelta escrita (ADR 0010, T5-3), y los alias `invdec`, `sk` y `skip` solo en `es-us` (ADR 0011, T6-3). Con las respuestas de T1b si llegaron; si no, la aprobación final queda abierta como en la fase 3 | `experto-tejido` | Media (sonnet) | T19; T1b |
| T22 | E | Cierre: README, este roadmap y los ADR 0010 y 0011 (ya aceptados en T0; se agregan las enmiendas de la implementación) | `arquitecto` + `documentador` | Baja (haiku) | T20, T21 |

### Criterios de salida de la fase 4

- CA4-P1 a CA4-P10, CA4-M1 a CA4-M8, CA4-E1 a CA4-E12, CA4-V1 a CA4-V8, CA4-G1 a CA4-G4 y CA4-A1 a CA4-A3 cumplidos, con la evidencia en el PR (mediciones, capturas, informe de QA).
- Editar una vuelta actualiza el 3D en menos de 100 ms con una pieza de 40 vueltas (CA4-P1 y CA4-P2), dentro de los límites recomendados y con el aspecto por fibra activado, medido también en el equipo de referencia. Fuera de los límites, el editor sigue inmediato y el 3D se degrada como dice el ADR 0010, sección 6c (CA4-P8 y CA4-P9).
- El editor de bloques básico queda preparado para la versión completa (CA4-E11), y los límites recomendados se ven desde el inicio (CA4-E12).
- El texto y los bloques producen el mismo documento (RT1 a RT3 y CA4-E3).
- El glosario tiene ES, US y UK, marcado como pendiente de validación con tejedoras.
- El 3D muestra el aviso de prototipo digital (CA4-V1).
- `pnpm test` y `pnpm typecheck` en verde, incluidos `viewer-3d` y `glossary`; la CI corre el E2E del visor con WebGL por software.
- `experto-tejido`, `qa-tester` y `revisor-seguridad` aprueban.
- Los ADR 0010 y 0011 (aceptados en T0) llevan las enmiendas de la implementación.

---

## Glosario pendiente

Estas son decisiones de terminología de la revisión de `experto-tejido` (2026-11-05). **Todas deben validarse con tejedoras reales** antes de publicarse (regla de oro 5).

- **Fase 2**: los textos las usan de forma provisional (T12).
- **Fase 4**: se implementan en `packages/glossary`, con variantes regionales configurables ([ADR 0011](adr/0011-posicion-de-partes-y-editor-escrito.md), sección 8). T1 de la fase 4 agrega los términos de amigurumi (anillo mágico, cadeneta base, espiral, vueltas cerradas, aumento, disminución, relleno, copias, notas) y la tabla UK, todos en estado "pendiente".
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

### Decisiones de la fase 4 (aprobadas el 2026-11-13)

Propuestas de `arquitecto` (2026-11-13). La usuaria las respondió el 2026-11-13 (T0 hecha). Resumen de lo elegido:

| # | Tema | Elegida | Notas de la usuaria |
|---|---|---|---|
| 1 | ADR 0010 y 0011, `schemaVersion: 2` | (a), la recomendada | — |
| 2 | Editor de bloques | (a), la recomendada, **con un agregado** | "Deja registro y déjalo preparado para la versión completa" |
| 3 | Posicionado | (a), la recomendada | — |
| 4 | Glosario | (a), la recomendada | — |
| 5 | Límites | Valores de (a), **pero solo como advertencia** | "Déjalo claro desde el inicio" |
| 6 | Campos condicionales | (a), la recomendada | — |
| 7 | Forma canónica del texto | (a), la recomendada | — |
| 8 | "Tejer" amigurumi | (a), la recomendada | — |
| 9 | Validación con tejedoras | (a), la recomendada | — |
| 10 | Aspecto por fibra en el 3D | **(b)**, no la recomendada | Desde ya, en la fase 4 |

Cada punto conserva sus opciones como registro; la línea **Resolución** dice lo elegido y dónde quedó.

1. **Aprobar los ADR 0010 y 0011, con `schemaVersion: 2` en la fase 4.**
   - (a) Aprobar los dos, con la v2 limitada a `layout` y `copies` más los campos condicionales del punto 6 (**recomendada**). El documento es cerrado, así que ubicar partes exige v2. La migración es trivial y no hace falta tocar SQL de `patterns`.
   - (b) Seguir en v1 y guardar las posiciones en una tabla aparte. Las versiones fijadas, la exportación y la IA no las verían, y el diseño quedaría en dos lugares.
   - (c) Seguir en v1 sin posicionado: las piezas se ven lado a lado y no hay copias. Se puede, pero el 3D no muestra el muñeco armado, que es el valor del estudio.
   - **Resolución: (a).** ADR 0010 y 0011 aceptados el 2026-11-13, con las enmiendas de las decisiones 2, 5 y 10.
2. **Alcance del editor de bloques en la v1.**
   - (a) Todo se ve, y se edita punto, cantidad, hebra, cambio de lana, grupos de hasta 2 niveles, insertar y borrar vueltas, y mover con botones (**recomendada**). Cubre los patrones habituales sin construir un editor de arrastrar y soltar. Los grupos más anidados se ven en bloques y se editan en el texto.
   - (b) Bloques completos: anidación hasta 6 niveles y arrastrar y soltar. Es más trabajo de interfaz y de accesibilidad para casos raros.
   - (c) Bloques solo de lectura en la fase 4. No cumple el criterio de salida "texto y bloques producen el mismo documento" como edición.
   - **Resolución: (a), edición básica, con el agregado de la usuaria**: "deja registro y déjalo preparado para la versión completa".
     - **Registro**: el ADR 0011, sección 7, documenta lo que queda fuera de la v1 y por qué: editar grupos de 3 a 6 niveles (raros en amigurumi; costo alto de interfaz y accesibilidad por nivel en 390 px) y arrastrar y soltar (necesita igual una alternativa de un toque por WCAG 2.2, 2.5.7; costo táctil y de E2E).
     - **Preparado**: las operaciones de `edit-written.ts` y RT3 trabajan a la profundidad completa del núcleo (`LIMITS.maxNesting`); el árbol de bloques (`BlockNode`, `blockTree`) es recursivo y sin límite; el tope de 2 niveles vive solo en `BlockEditPolicy` (interfaz); la selección va por rutas y `moveItem` ya mueve entre niveles.
     - **Verificación**: CA4-E11 (T15) y RT3 a profundidad completa (CA4-M5, T6).
     - **Versión completa**: entrada [Editor de bloques completo](#editor-de-bloques-completo), fase futura.
3. **Posicionado de las partes.**
   - (a) Anclar las piezas a la superficie del anfitrión (vuelta y punto), con la pieza principal libre (**recomendada**). Si la cabeza crece, la oreja la sigue, y la posición se dice en lenguaje de tejedora ("entre la V10 y la V11").
   - (b) Todo libre, con posición y rotación en el espacio. Es más simple, pero las piezas quedan flotando al cambiar una parte y no hay texto de armado.
   - (c) Sin posicionado en la fase 4: ubicación automática lado a lado.
   - **Resolución: (a).** Sin cambios al ADR 0011 (secciones 2 y 9); T16.
4. **Glosario en la fase 4.**
   - (a) `glossary` con ES, US y UK para mostrar y escribir; leer UK solo con un selector explícito; preferencia de dialecto en el perfil, todo marcado como pendiente (**recomendada**). Es lo que pide el criterio de salida, y el selector explícito evita la ambigüedad de "dc" entre US y UK.
   - (b) ES y US en la fase 4, UK en la fase 7. Es menos trabajo, pero no cumple el criterio de salida tal como está.
   - (c) Igual que (a), pero con la preferencia guardada solo en el navegador. No hay migración, pero la preferencia no sigue a la usuaria entre dispositivos.
   - **Resolución: (a).** ES, US y UK, con `profiles.pattern_dialect` (ADR 0011, sección 8); T6, T7 y T8.
5. **Límites de partes, vueltas y puntos en la interfaz.** Los topes del núcleo se mantienen (50 partes, 1000 vueltas por parte, 50.000 puntos por vuelta) como barrera para la IA y para JSON manipulados.
   - (a) 20 partes, 10 copias por parte, 100 vueltas por parte, 200 puntos por vuelta y 40.000 puntos en la escena (**recomendada**). Cubre los amigurumi habituales con holgura (validar con `experto-tejido` en T1) y deja el presupuesto de 100 ms con margen. T3b y T12 confirman con mediciones; subir un límite después es compatible, bajarlo no.
   - (b) Solo los topes del núcleo. No se puede garantizar la regla de oro 7 con piezas enormes.
   - (c) Más estrictos (10 partes, 60 vueltas, 120 puntos). Deja fuera piezas grandes sin necesidad técnica.
   - **Resolución: los valores de (a), pero solo como advertencia.** Si se supera un límite, se muestra una advertencia y la usuaria decide si sigue. Nota de la usuaria: "déjalo claro desde el inicio".
     - **Contrato**: `RECOMMENDED_WRITTEN_LIMITS`, `recommendedLimitUsage` y `recommendedLimitNotices` en `pattern-core`, puros y fuera del validador (ADR 0011, sección 3b). Los conteos salen del motor.
     - **Desde el inicio**: medidor "N de 40.000 puntos recomendados", "N de 20 partes recomendadas" y la ayuda "¿Por qué hay límites recomendados?" siempre visibles, no solo al superarlos.
     - **Al superarlos**: diálogo "Seguir igual" o "Cancelar" en acciones puntuales; advertencia junto a la vuelta, sin diálogo, al escribir texto. Nada de esto entra al documento.
     - **Topes duros**: `LIMITS` y la validación estructural y de la base se mantienen; se agregan los de la v2 (`maxCopies: 50`, `maxLayoutDepth: 16`, `maxPositionCm: 1000`, `maxOffsetCm: 100`).
     - **Rendimiento**: los 100 ms se exigen dentro de los límites recomendados (CA4-P1 a CA4-P4). Fuera de ellos, la advertencia dice que la vista previa puede ir más lenta; sobre 40.000 puntos el 3D pasa a `"smooth"` con razón de píxeles 1, el editor nunca espera al 3D y aparece "Actualizando 3D…" (CA4-P8); sobre `SCENE_HARD_STITCH_CAP`, siluetas (CA4-P9). ADR 0010, sección 6c.
     - **Tareas**: T1 (revisión de los valores), T4, T11, T12, T14 (CA4-E12), T17 y T18.
6. **Campos condicionales de la v2** (`stuffing`, para piezas con o sin relleno, e inicio en óvalo).
   - (a) Incluirlos solo si T1 confirma sus reglas antes de que empiece T4 (**recomendada**). Si entran ahora, se evita una v3 a corto plazo; si no hay reglas validadas, no se inventan.
   - (b) Incluirlos siempre, con reglas provisionales. Arriesga guardar datos con un significado que después cambia.
   - (c) Dejarlos para una v3.
   - **Resolución: (a).** `stuffing` y el inicio en óvalo entran en la v2 solo si T1 (`experto-tejido`) confirma sus reglas antes de que empiece T4; si no, quedan para una v3 con su ADR.
   - **Resultado de T1 (2026-11-13): los dos quedan fuera de la v2.** No hay regla de forma con fuente para el relleno, y la regla de consumo de la V1 del óvalo no es única (además, la superficie de revolución no puede dibujarlo). La v2 queda con `layout` y `copies` (ADR 0011, enmienda C-13).
7. **Forma canónica del texto.**
   - (a) Al salir de una línea que se leyó bien, el editor la reescribe en forma canónica ("pb x6" → "6 pb") (**recomendada**). Es la consecuencia visible de que la fuente de verdad sea el documento, y nunca pasa mientras se escribe.
   - (b) Reescribir solo al recargar o al cambiar de pestaña. Hay menos cambios a la vista, pero sorprende más cuando ocurren.
   - (c) Conservar el texto tal como se escribió. Exige guardar el texto aparte, una segunda copia del patrón (regla de oro 1). Descartada.
   - **Resolución: (a).** El texto se reescribe en forma canónica al salir de una línea bien leída, nunca mientras se escribe (CA4-E7, T14).
8. **"Tejer este diseño" para amigurumi.**
   - (a) En la fase 6, como está planificado. En la fase 4 no está disponible, con el texto "Seguir un amigurumi punto a punto llega en una próxima versión" (**recomendada**). Mantiene la fase 4 acotada; el contrato `limit` del 3D parcial ya queda listo.
   - (b) Adelantar a la fase 4 un seguimiento por vuelta (sin punto a punto), como se adelantó el colorwork a la fase 3. Agrega `follow` escrito, la migración de `project_progress` con la copia y su revisión de seguridad.
   - **Resolución: (a).** "Tejer" amigurumi queda para la fase 6, con el aviso en la fase 4 (CA4-V7, T13).
9. **Validación con tejedoras.** T1b sigue bloqueada por T1c (revisión legal).
   - (a) La fase 4 avanza con `experto-tejido` (T1 y T21), todo lo de dominio queda "validar con tejedora", y su T1b se suma a la misma ronda que T1b de las fases 2 y 3. Nada se publica sin T1b (**recomendada**). No frena el código y respeta la regla de oro 5.
   - (b) No empezar la implementación hasta cerrar T1b. Es lo más seguro en dominio, pero detiene la fase por un trámite legal ajeno al código.
   - **Resolución: (a).** Se avanza con `experto-tejido` (T1 y T21); todo queda pendiente de la ronda T1b, junto con T1b de las fases 2 y 3, después de T1c.
10. **Aspecto por fibra en el 3D** (halo del mohair, brillo de la seda).
    - (a) No en la fase 4: color por punto más el relieve del punto (**recomendada**). El amigurumi se teje casi siempre en lanas lisas (validar con tejedora), y así se protege el presupuesto de 100 ms.
    - (b) Sí, reutilizando `yarnLook` de `stitch-render`. Agrega materiales y medición en una fase ya cargada.
    - **Resolución: (b), desde ya** (no la recomendada). Quedó en el ADR 0010, sección 6b:
      - **Cómo**: la aplicación calcula los aspectos con el mismo `yarnLook` de `stitch-render` (niveles de `yarn-catalog`) y los pasa al visor como `SurfaceLook`; `viewer-3d` no depende de `stitch-render` ni de `yarn-catalog`. Un solo `MeshStandardMaterial` con `onBeforeCompile` y una tabla de 32 lanas en uniformes, indexada por el atributo `yarn`: el brillo baja la rugosidad, el halo agrega un borde difuso y suaviza el relieve, y la definición marca el relieve. El aspecto neutro da exactamente el material base. Sin texturas de marcas ni fotos: todo procedural.
      - **Presupuesto**: cambiar el color o la composición de una lana, o "Colores planos", solo actualiza uniformes (sin reconstruir la malla ni subir atributos ni recompilar). Cambiar la lana de un punto usa `colorizePartMesh`, sin reconstruir.
      - **"Colores planos"**: la misma preferencia de la fase 3 (`loopita:vista:colores-planos`), compartida entre los dos estudios y fuera del documento.
      - **Nivel de detalle y sin WebGL**: `"smooth"` conserva el brillo y el borde del halo; sin WebGL, siluetas con el color plano y el aviso de que el aspecto solo se ve en 3D.
      - **Guardia**: contadores (0 `buildPartMesh`, 0 `colorizePartMesh`, 0 atributos subidos al cambiar aspectos), programas de shader constantes, A/B con `E2E_FLAT_COLORS`, `hover-to-paint-3d` y 30 fps con el aspecto activado (CA4-P3, CA4-P4, CA4-P10, CA4-V8).
      - **Tareas**: T3b (prototipo y medición), T10 (`SurfaceLook`), T11 (material y conexión), **T11c nueva** (calibración con `catalogo-lanas` y `experto-tejido`), T12, T18 y T1b (parecido con lanas reales).

---

## Fases futuras (sin fecha)

Trabajo registrado para después de la fase 7. Cada entrada se planifica con su ADR o enmienda cuando se decida.

### Editor de bloques completo

- **Qué**: editar con bloques los grupos de 3 a 6 niveles (la anidación completa del núcleo, `LIMITS.maxNesting`) y mover ítems con arrastrar y soltar, además de los botones.
- **Por qué no está en la fase 4**: decisión 2 de la fase 4 (edición básica). Razones en el ADR 0011, sección 7.
- **Qué ya queda listo en la fase 4**: operaciones de `edit-written.ts` con profundidad completa y `moveItem` entre niveles; RT3 a profundidad completa; árbol `BlockNode` recursivo; `BlockEditPolicy` como único lugar del tope; selección por rutas; deshacer por acción (CA4-E11).
- **Qué falta**: la interfaz por nivel (sangrías, foco, anuncios de lector de pantalla, diseño en 390 px), el arrastre con puntero, táctil y teclado, con la alternativa de un toque (WCAG 2.2, 2.5.7), y sus E2E. Cambiar `BLOCK_EDIT_POLICY_V1` por `{ maxEditDepth: LIMITS.maxNesting, dragAndDrop: true }`.
- **Cuándo**: según T1b de la fase 4 (si las tejedoras usan bloques y grupos profundos). Agentes: `frontend-editor`, `ux-accesibilidad`, `qa-tester`. Complejidad media.

# LoopitaLab: plataforma de patrones de crochet y palillo

Plataforma web para diseñar libremente patrones de crochet y tejido a palillo (aguja), con cuentas de usuario, proyectos guardados, seguimiento de avance y generación de patrones aproximados a partir de una imagen usando IA.

## Modalidades del producto (v1)

Rediseñadas a partir de los referentes Colorwork Studio (colorwork.studio) y Yarnify3D (yarnify3d.com).

1. **Estudio de colorwork** (palillo; crochet tapestry después): se diseña un motivo en una cuadrícula y se define cuántas veces se repite a lo ancho y a lo alto. La vista previa muestra puntos realistas en las lanas elegidas y se actualiza en vivo. Formas de render: plano/tubo, círculo (copa de gorro con disminuciones radiales) y, más adelante, canesú. Incluye muestra (gauge), dirección de tejido y celdas fuera de forma desactivadas (gráficos en cuña).
2. **Estudio amigurumi 3D** (crochet): patrón escrito por partes (cuerpo, ojos, orejas…) con sintaxis o bloques, color por punto y modelo 3D en vivo.
3. **Lanas por grosor y composición** (sin marcas): cada lana del diseño se define por su categoría de grosor (estándar Craft Yarn Council 0–7, con nombres en español), su composición (fibras y porcentajes) y un color de la paleta propia o uno personalizado. El grosor sugiere aguja o crochet y muestra; la fibra ajusta el render (halo, brillo) y las recomendaciones. Vista previa instantánea al pasar el cursor por un color.
4. **Modo tejiendo**: el patrón se sigue paso a paso. En amigurumi, punto a punto ("1/60 pb"), con el 3D creciendo a medida que se avanza. En colorwork, fila a fila con la fila actual resaltada. Siempre con contadores, avance por parte, tiempo estimado y notas de armado.
5. **Imagen → patrón (IA)**: foto a gráfico de colorwork, o a amigurumi aproximado, que se abre en el estudio correspondiente para editarlo. Siempre etiquetado como "generado con IA".
6. **Cuenta y proyectos**: diseños privados o públicos, versiones, exportación, proyectos con avance guardado entre dispositivos.

## Reglas de oro (no negociables)

1. **Fuente única de verdad**: todo patrón se guarda en el *modelo canónico* (`packages/pattern-core`). Gráfico, texto escrito, render 2D, vista 3D, pasos del modo tejiendo y PDF se *derivan* de él. Ninguna vista guarda su propia copia del patrón.
2. **Los LLM nunca calculan conteos de puntos**. La IA interpreta, propone y redacta. El motor determinista calcula puntos, aumentos, disminuciones, repeticiones y valida.
3. **Toda salida de IA pasa por el validador** del motor antes de mostrarse. Si no valida, se reintenta escalando de modelo (ver router) o se devuelve con advertencias explícitas.
4. **Transparencia**: todo patrón generado o modificado por IA queda etiquetado como tal en la base de datos y en la interfaz.
5. **Terminología**: abreviaturas y símbolos basados en el estándar del Craft Yarn Council. La interfaz en español usa un glosario configurable (US, UK y variantes regionales en español), validado por tejedoras reales antes de publicarse.
6. **No inventar datos**: si falta información (medidas, muestra, tipo de lana), se pide al usuario o se marca como supuesto visible.
7. **Respuesta instantánea**: pintar una celda o cambiar las repeticiones debe reflejarse en la vista previa en menos de 100 ms. Ese ciclo inmediato es el gancho del producto.
8. **Prototipo digital**: render 2D y 3D son aproximaciones; la interfaz recuerda tejer una muestra para comprobar gauge y proporciones.
9. **Sin catálogos de marcas**: no se cargan nombres, códigos, fotos ni precios de productos de marcas. Las tiendas chilenas (orquidea.cl, revesderecho.com, modista.cl) se usan solo como referencia pública de terminología de grosores y fibras. Si la usuaria quiere anotar la marca de su lana, es texto libre privado en su proyecto.

## Protocolo de orquestación (sesión principal)

La sesión principal de Claude Code actúa como **orquestador**. Los subagentes no pueden lanzar otros subagentes, por lo que toda delegación pasa por aquí.

Para cada solicitud:

1. **Clasificar** la tarea: dominio (motor, UI, 3D, backend, IA, QA, seguridad, docs, devops) y complejidad (baja / media / alta).
2. **Elegir agente** según la tabla de roles de abajo.
3. **Elegir modelo**: usar el modelo por defecto del agente. Subir o bajar con el parámetro `model` de la invocación según la tabla de complejidad.
4. **Delegar con un brief completo**: objetivo, archivos involucrados, criterios de aceptación, restricciones. El subagente empieza sin contexto previo.
5. **Integrar** el resultado y pasar siempre por `qa-tester`. Los cambios que tocan auth, RLS, uploads o IA pasan además por `revisor-seguridad`.
6. Los cambios de lógica de tejido pasan por `experto-tejido` antes de cerrarse.
7. Registrar decisiones de arquitectura en `docs/adr/` (lo hace `arquitecto`).

### Roles

| Dominio | Agente | Modelo por defecto |
|---|---|---|
| Arquitectura, ADR, modelo de datos | `arquitecto` | opus |
| Reglas de tejido, terminología, validación de dominio | `experto-tejido` | sonnet |
| Motor determinista de patrones | `motor-patrones` | opus |
| Interfaz y editores (Next.js) | `frontend-editor` | sonnet |
| Render realista de puntos 2D (plano, tubo, círculo) | `render-puntos` | opus |
| Simulación 3D amigurumi (Three.js) | `visor-3d` | opus |
| Modo tejiendo (seguimiento punto a punto / fila a fila) | `modo-tejiendo` | sonnet |
| Grosores, fibras, paleta de colores y cálculo de metraje | `catalogo-lanas` | sonnet |
| Supabase: auth, esquema, RLS, storage | `backend-supabase` | sonnet |
| Pipeline de IA y router de modelos del producto | `ia-pipeline` | opus |
| Pruebas unitarias, de propiedades y E2E | `qa-tester` | sonnet |
| Revisión de seguridad y privacidad | `revisor-seguridad` | sonnet |
| Accesibilidad, móvil, daltonismo, zurdos | `ux-accesibilidad` | sonnet |
| Documentación, glosario, textos i18n | `documentador` | haiku |
| CI/CD, entornos, despliegue | `devops` | sonnet |

### Selección de modelo según complejidad (desarrollo)

| Complejidad | Señales | Modelo |
|---|---|---|
| Baja | Cambio acotado, un archivo, textos, renombres, búsquedas, docs | haiku |
| Media | Funcionalidad nueva en un módulo, bugs con causa clara, componentes UI | sonnet |
| Alta | Diseño transversal, geometría 3D, algoritmos del motor, pipeline IA, bugs sin causa clara, migraciones de datos | opus |

Reglas adicionales:
- Si un subagente falla dos veces la misma tarea, reintentar con el siguiente modelo superior.
- Las revisiones (QA, seguridad) nunca usan un modelo inferior al que escribió el código revisado cuando la complejidad es alta.
- Tareas masivas y repetitivas (traducciones, fixtures, docs) van a haiku aunque toquen muchos archivos.

## Stack

- **Frontend**: Next.js (App Router) + TypeScript estricto + Tailwind.
- **3D**: Three.js (vía react-three-fiber).
- **Backend**: Supabase (Postgres, Auth, Storage, Row Level Security, Edge Functions).
- **IA**: API de Anthropic (Claude) con router propio en `packages/ai-router`.
- **Node**: 22.18 o superior (ejecuta TypeScript directamente; los imports internos llevan extensión `.ts`).
- **Procesamiento de imagen determinista**: en servidor (cuantización de color, pixelado, mapeo a paleta).
- **Pruebas**: núcleo (`pattern-core`, `yarn-catalog`) sin dependencias, con `node:test` y pruebas de propiedades con semilla (ADR 0002); interfaz con Vitest y Playwright (E2E).
- **Gestor de paquetes**: pnpm con monorepo (Turborepo).

## Estructura del repositorio

```
apps/web/                 # Next.js
packages/pattern-core/    # Modelo canónico + motor determinista + validador
packages/pattern-render/  # Derivados: gráfico SVG, texto escrito, PDF
packages/stitch-render/   # Render realista 2D de puntos (canvas/WebGL)
packages/viewer-3d/       # Simulación 3D amigurumi
packages/follow/          # Secuenciador del modo tejiendo (deriva pasos del modelo)
packages/yarn-catalog/    # Grosores CYC, fibras, paleta propia, color más cercano (CIELAB)
packages/ai-router/       # Agentes de IA del producto + selección de modelo
packages/glossary/        # Terminología US/UK/ES y símbolos CYC
supabase/                 # Migraciones, políticas RLS, Edge Functions
docs/adr/                 # Decisiones de arquitectura
```

## Convenciones

- Código e identificadores en inglés; interfaz, documentación y commits en español.
- Toda función del motor y del secuenciador `follow` tiene pruebas de propiedades (por ejemplo: el conteo de puntos de una vuelta coincide con la suma de sus instrucciones).
- No se agregan dependencias sin justificación en el PR.
- Nunca se suben claves al repositorio; variables en `.env.local` y en el gestor de secretos del entorno.

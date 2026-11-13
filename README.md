# LoopitaLab

Plataforma web para diseñar patrones de colorwork y amigurumi, seguir el avance mientras se teje y partir desde una foto con IA. La arquitectura, las reglas y los agentes de desarrollo están en [`CLAUDE.md`](CLAUDE.md) y en [`docs/`](docs/).

## Estado

| Fase | Estado |
|---|---|
| 1. Base: modelo canónico y validador | Listo (`packages/pattern-core`, `packages/yarn-catalog`) |
| 1. Base: Supabase (esquema, RLS, storage) | Listo; aplicar migraciones según [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md) |
| 1. Base: web con registro, ingreso, proyectos y cuenta | Listo (`apps/web`) |
| 2. Estudio de colorwork (plano, tubo y círculo) | Listo en código (`/disenos`): editor, vista previa realista, guardado y E2E. Cierre pendiente de la validación con tejedoras (T1b/T16), la medición en el equipo de referencia (CA-P6). Probado con VoiceOver y NVDA el 2026-11-09. Ver [docs/qa-fase-2.md](docs/qa-fase-2.md) |
| 3. Lanas por grosor y composición, y seguimiento de colorwork fila a fila | Listo en código: selector de lanas (grosor, composición, paleta), metraje estimado, «Mis lanas» (`/lanas`), «Tejer este diseño» con la versión fijada, proyectos con avance guardado entre dispositivos (`/proyectos`) y el modo tejiendo fila a fila para colorwork, con la fila actual resaltada y aviso de conflicto entre dispositivos. Pendiente: validación con tejedoras (T1b, después de T1c), medición CA-P6 y prueba con lector de pantalla real. Ver [docs/qa-fase-3.md](docs/qa-fase-3.md) y el [cierre de la fase 3](docs/roadmap.md#estado-al-cierre-de-la-fase-3) |
| 4. Estudio amigurumi 3D | Pendiente |
| 5. Imagen → patrón (IA) | Pendiente |
| 6. Modo tejiendo completo | Pendiente |
| 7. Compartir, publicar, exportar PDF y lanzamiento | Pendiente |

El detalle de cada fase (objetivo, entregables, agentes, dependencias y criterios de salida) está en [docs/roadmap.md](docs/roadmap.md).

## Requisitos

- Node 24 LTS (mínimo 22.18, que ejecuta TypeScript directamente). La versión está fijada en `.nvmrc`: usa `nvm use`.
- pnpm 10

## Comandos

```
nvm use           # toma la versión de .nvmrc
pnpm install
pnpm dev          # web en http://localhost:3000 (requiere apps/web/.env.local)
pnpm test         # pruebas de todos los paquetes
pnpm typecheck    # chequeo de tipos
```

Para conectar Supabase y configurar Auth, sigue [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md).

Los paquetes del núcleo no tienen dependencias, así que también se pueden probar sin instalar nada:

```
cd packages/pattern-core && node --test "test/**/*.test.ts"
```

## Estructura

```
apps/web/                Next.js 16: acceso, proyectos con avance (/proyectos y «Tejiendo»), cuenta, lanas (/lanas) y estudio de colorwork (/disenos); E2E en apps/web/e2e
supabase/                Migraciones (esquema, RLS, datos, storage, cuotas, proyectos) y verificaciones
packages/pattern-core/   Modelo canónico, motor (derivados, edición, migraciones, conteos de hebras) y validador
packages/pattern-render/ Gráfico SVG accesible y descripción textual del motivo
packages/stitch-render/  Render realista de puntos en Canvas 2D (plano, tubo y círculo)
packages/follow/         Secuenciador del modo tejiendo: pasos por fila del gráfico y puntero de avance
packages/yarn-catalog/   Grosores CYC, búsqueda de grosores, fibras, paleta propia, muestra sugerida, color más cercano y metraje estimado
packages/ai-router/      Router de modelos de IA del producto (se usa desde la fase 5)
docs/adr/                Decisiones de arquitectura (0001 a 0009)
docs/roadmap.md          Fases 2 a 7
docs/qa-fase-2.md        QA de cierre de la fase 2 (criterios y casos de dominio)
docs/qa-fase-3.md        QA de cierre de la fase 3 (matriz de criterios, latencia y observaciones)
docs/seguridad.md        Revisiones de seguridad, riesgos aceptados y pendientes
docs/validacion-tejedoras.md  Hoja de preguntas para validar terminología con tejedoras (T1b)
docs/agentes-runtime.md  Agentes de IA del producto
.claude/agents/          Agentes de desarrollo para Claude Code
```

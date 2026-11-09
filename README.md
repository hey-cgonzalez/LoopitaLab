# LoopitaLab

Plataforma web para diseñar patrones de colorwork y amigurumi, seguir el avance mientras se teje y partir desde una foto con IA. La arquitectura, las reglas y los agentes de desarrollo están en [`CLAUDE.md`](CLAUDE.md) y en [`docs/`](docs/).

## Estado

| Fase | Estado |
|---|---|
| 1. Base: modelo canónico y validador | Listo (`packages/pattern-core`, `packages/yarn-catalog`) |
| 1. Base: Supabase (esquema, RLS, storage) | Listo; aplicar migraciones según [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md) |
| 1. Base: web con registro, ingreso, proyectos y cuenta | Listo (`apps/web`) |
| 2. Estudio de colorwork (plano, tubo y círculo) | Listo en código (`/disenos`): editor, vista previa realista, guardado y E2E. Cierre pendiente de la validación con tejedoras (T1b/T16), la medición en el equipo de referencia (CA-P6) y una prueba con lector de pantalla. Ver [docs/qa-fase-2.md](docs/qa-fase-2.md) |
| 3. Lanas por grosor y composición, y seguimiento de colorwork fila a fila | Pendiente |
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
apps/web/                Next.js 16: acceso, proyectos, cuenta y estudio de colorwork (/disenos); E2E en apps/web/e2e
supabase/                Migraciones (esquema, RLS, datos, storage, cuotas) y verificaciones
packages/pattern-core/   Modelo canónico, motor (derivados, edición, migraciones) y validador
packages/pattern-render/ Gráfico SVG accesible y descripción textual del motivo
packages/stitch-render/  Render realista de puntos en Canvas 2D (plano, tubo y círculo)
packages/yarn-catalog/   Grosores CYC, fibras, paleta propia, muestra sugerida y color más cercano
packages/ai-router/      Router de modelos de IA del producto (se usa desde la fase 5)
docs/adr/                Decisiones de arquitectura (0001 a 0006)
docs/roadmap.md          Fases 2 a 7
docs/qa-fase-2.md        QA de cierre de la fase 2 (criterios y casos de dominio)
docs/seguridad.md        Revisiones de seguridad, riesgos aceptados y pendientes
docs/validacion-tejedoras.md  Hoja de preguntas para validar terminología con tejedoras (T1b)
docs/agentes-runtime.md  Agentes de IA del producto
.claude/agents/          Agentes de desarrollo para Claude Code
```

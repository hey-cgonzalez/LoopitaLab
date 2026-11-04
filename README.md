# LoopitaLab

Plataforma web para diseñar patrones de colorwork y amigurumi, seguir el avance mientras se teje y partir desde una foto con IA. La arquitectura, las reglas y los agentes de desarrollo están en [`CLAUDE.md`](CLAUDE.md) y en [`docs/`](docs/).

## Estado

| Fase | Estado |
|---|---|
| 1. Base: modelo canónico y validador | Listo (`packages/pattern-core`, `packages/yarn-catalog`) |
| 1. Base: Supabase (esquema, RLS, storage) | Listo; aplicar migraciones según [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md) |
| 1. Base: web con registro, ingreso, proyectos y cuenta | Listo (`apps/web`) |
| 2 a 7 | Ver el roadmap en el documento de arquitectura |

## Requisitos

- Node 22.18 o superior
- pnpm 10

## Comandos

```
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
apps/web/                Next.js 16: acceso, proyectos y cuenta
supabase/                Migraciones (esquema, RLS, datos, storage) y verificaciones
packages/pattern-core/   Modelo canónico, motor y validador
packages/yarn-catalog/   Grosores CYC, fibras, paleta propia y color más cercano
docs/adr/                Decisiones de arquitectura
docs/agentes-runtime.md  Agentes de IA del producto
.claude/agents/          Agentes de desarrollo para Claude Code
```

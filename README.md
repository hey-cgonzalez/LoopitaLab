# LoopitaLab

Plataforma web para diseñar patrones de colorwork y amigurumi, seguir el avance mientras se teje y partir desde una foto con IA. La arquitectura, las reglas y los agentes de desarrollo están en [`CLAUDE.md`](CLAUDE.md) y en [`docs/`](docs/).

## Estado

| Fase | Estado |
|---|---|
| 1. Base: modelo canónico y validador | Listo (`packages/pattern-core`, `packages/yarn-catalog`) |
| 1. Base: monorepo, Supabase y cuentas | Pendiente: requiere el repositorio en GitHub y el proyecto en Supabase |
| 2 a 7 | Ver el roadmap en el documento de arquitectura |

## Requisitos

- Node 22.18 o superior
- pnpm 10

## Comandos

```
pnpm install      # solo trae herramientas de desarrollo (TypeScript, tipos de Node)
pnpm test         # pruebas de todos los paquetes
pnpm typecheck    # chequeo de tipos
```

Los paquetes del núcleo no tienen dependencias, así que también se pueden probar sin instalar nada:

```
cd packages/pattern-core && node --test "test/**/*.test.ts"
```

## Estructura

```
packages/pattern-core/   Modelo canónico, motor y validador
packages/yarn-catalog/   Grosores CYC, fibras, paleta propia y color más cercano
docs/adr/                Decisiones de arquitectura
docs/agentes-runtime.md  Agentes de IA del producto
.claude/agents/          Agentes de desarrollo para Claude Code
```

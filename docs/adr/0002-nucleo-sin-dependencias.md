# ADR 0002: Núcleo sin dependencias y pruebas con el ejecutor de Node

- Estado: aceptada
- Fecha: 2026-11-03
- Paquetes: `pattern-core`, `yarn-catalog`

## Contexto

`CLAUDE.md` proponía Zod para validar, y Vitest con fast-check para las pruebas. El núcleo debe correr igual en el navegador, en el servidor de Next.js y en las Edge Functions de Supabase. Además, el entorno donde se construyó la primera versión no tenía acceso al registro de npm.

## Decisión

- `pattern-core` y `yarn-catalog` no tienen dependencias en tiempo de ejecución. La validación usa funciones propias que devuelven errores estructurados (`code`, `severity`, `path`, `message`) en vez de lanzar excepciones.
- Las pruebas usan `node:test` y `node:assert`. Node 22.18 o superior ejecuta TypeScript directamente, así que no hace falta compilar para probar.
- Las pruebas de propiedades usan un generador propio con semilla (`test/support/property.ts`). Si una prueba falla, informa la semilla para poder reproducirla.
- Para la interfaz (`apps/web`) se mantienen Vitest y Playwright.

## Consecuencias

- `pnpm test` funciona sin instalar paquetes de terceros en el núcleo.
- Si más adelante se quiere fast-check (que achica automáticamente los casos que fallan), las propiedades están escritas como funciones puras y se pueden migrar sin reescribirlas.
- No usar Zod obliga a mantener los tipos de TypeScript y el validador alineados a mano. Las pruebas cubren ese riesgo.

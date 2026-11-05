import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Pruebas unitarias de la interfaz y los Route Handlers (CLAUDE.md: Vitest para la interfaz).
 * Corren en Node, sin red: Supabase se simula en cada prueba.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lanza un error fuera de un React Server Component; aquí no aplica.
      "server-only": fileURLToPath(new URL("./test/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});

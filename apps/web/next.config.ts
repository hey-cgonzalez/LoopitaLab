import type { NextConfig } from "next";
import { assertDevPagesSafe } from "./src/lib/dev-pages.ts";

// Falla el build y el arranque si las páginas `/dev/*` quedaran activas en el despliegue real (seguridad, MEDIO-2).
// `next build` corre con NODE_ENV=production; `next start` también.
assertDevPagesSafe();

/**
 * Cabeceras de seguridad para todas las rutas.
 * Todavía no hay una CSP completa de scripts. Cuando exista, debe permitir
 * https://challenges.cloudflare.com en script-src y en frame-src (Turnstile).
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS solo en producción: en local (http://localhost) el navegador lo recordaría.
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // Las E2E con sesión (proyecto `sesion` de playwright.config.ts) construyen en otra carpeta: su build lleva la URL
  // de la Supabase local, y no debe pisar el `.next` de `pnpm build` ni el de las E2E sin sesión.
  ...(process.env.LOOPITA_NEXT_DIST_DIR ? { distDir: process.env.LOOPITA_NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // Los paquetes del monorepo se publican como TypeScript sin compilar. `three` y `@react-three/fiber` no van aquí:
  // compilan y cargan sin eso (ADR 0010, enmienda V-5).
  transpilePackages: ["@loopitalab/follow", "@loopitalab/pattern-core", "@loopitalab/yarn-catalog", "@loopitalab/stitch-render", "@loopitalab/pattern-render", "@loopitalab/viewer-3d"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

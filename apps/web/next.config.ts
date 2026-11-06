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
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Los paquetes del monorepo se publican como TypeScript sin compilar.
  transpilePackages: ["@loopitalab/pattern-core", "@loopitalab/yarn-catalog", "@loopitalab/stitch-render", "@loopitalab/pattern-render"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

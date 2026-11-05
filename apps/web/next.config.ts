import type { NextConfig } from "next";

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
  // Se sumarán stitch-render y pattern-render cuando existan (T8a).
  transpilePackages: ["@loopitalab/pattern-core", "@loopitalab/yarn-catalog"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

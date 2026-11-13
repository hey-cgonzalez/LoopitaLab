import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { devPagesEnabled } from "@/lib/dev-pages";
import { WebglProbe } from "./WebglProbe";

export const metadata: Metadata = {
  title: "Prueba de WebGL",
  robots: { index: false, follow: false },
};

/**
 * Página interna de desarrollo (T3, fase 4): comprueba que el navegador de la CI (Chromium con WebGL por software,
 * SwiftShader) entrega un contexto WebGL y dibuja. No depende de three. En producción responde 404 salvo con
 * `LOOPITA_DEV_PAGES=1` (ver `src/lib/dev-pages.ts`).
 */
export default async function Page() {
  await connection();
  if (!devPagesEnabled()) notFound();
  return (
    <main className="mx-auto grid max-w-2xl gap-4 px-6 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Prueba de WebGL</h1>
      <p className="text-tinta-suave">Página interna. Dibuja un triángulo con WebGL y publica el resultado en atributos data-*.</p>
      <WebglProbe />
    </main>
  );
}

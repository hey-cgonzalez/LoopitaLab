import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { devPagesEnabled } from "@/lib/dev-pages";
import { VisorLoader } from "./VisorLoader";

export const metadata: Metadata = {
  title: "Visor 3D (prototipo)",
  robots: { index: false, follow: false },
};

/**
 * Página interna de desarrollo (T3b de la fase 4): prototipo del visor 3D con r3f para medir antes de implementar
 * `viewer-3d` (ADR 0010, secciones 5, 6, 6b y 6c). En producción responde 404 salvo con `LOOPITA_DEV_PAGES=1`, y
 * nunca en el despliegue real (`VERCEL_ENV` o `LOOPITA_ENV` = production; ver `src/lib/dev-pages.ts`).
 * Usa una malla sintética: no lee patrones, la sesión ni Supabase. La medición está en `e2e/medir-visor.ts`.
 */
export default async function Page() {
  await connection();
  if (!devPagesEnabled()) notFound();
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Visor 3D (prototipo)</h1>
        <p className="mt-2 text-tinta-suave">
          Página interna. Mide la actualización de atributos en el lugar, el aspecto por fibra en uniformes y escenas grandes.
        </p>
      </div>
      <VisorLoader />
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { devPagesEnabled } from "@/lib/dev-pages";
import { demoData } from "./demo-patterns.ts";
import VisorDemo from "./VisorDemo.tsx";

export const metadata: Metadata = {
  title: "Visor 3D",
  robots: { index: false, follow: false },
};

/**
 * Página interna de desarrollo (T11 de la fase 4): el visor 3D real (`@loopitalab/viewer-3d/three` con r3f) sobre
 * patrones de demostración leídos por el motor. Reemplaza al prototipo sintético de T3b (`/dev/visor`). En
 * producción responde 404 salvo con `LOOPITA_DEV_PAGES=1`, y nunca en el despliegue real (`src/lib/dev-pages.ts`).
 * No lee la sesión ni Supabase. `?perf=1` muestra los contadores; `?sinwebgl=1` fuerza las siluetas;
 * `?demo=<clave>` abre un patrón. La medición está en `e2e/medir-visor-3d.ts`.
 */
export default async function Page() {
  await connection();
  if (!devPagesEnabled()) notFound();
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Visor 3D</h1>
        <p className="mt-2 text-tinta-suave">
          Página interna. Fixtures A y B, cilindro, panel, cambios de color, una pieza que ondula, un muñeco armado con anclas y
          copias, y escenas sobre los límites.
        </p>
      </div>
      <VisorDemo data={demoData()} />
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { devPagesEnabled } from "@/lib/dev-pages";
import { FIBER_SAMPLES } from "../visor-3d/demo-patterns.ts";
import { Fibras2d } from "./Fibras2d.tsx";

export const metadata: Metadata = { title: "Fibras en 2D", robots: { index: false, follow: false } };

/**
 * Página interna de desarrollo (T11c de la fase 4): el render 2D de `stitch-render` con las mismas lanas que
 * `/dev/visor-3d`, para calibrar el aspecto por fibra del 3D contra el 2D. Mismo color en todas las lanas; solo
 * cambia la composición. En producción responde 404 salvo con `LOOPITA_DEV_PAGES=1` (`src/lib/dev-pages.ts`).
 * `?hex=%23BA222C` cambia el color. No lee la sesión ni Supabase.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ hex?: string }> }) {
  await connection();
  if (!devPagesEnabled()) notFound();
  const { hex } = await searchParams;
  const color = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#BA222C";
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Fibras en 2D</h1>
        <p className="mt-2 text-tinta-suave">Página interna. Aproximación visual: el render no promete la lana real.</p>
      </div>
      <Fibras2d samples={FIBER_SAMPLES} hex={color} />
    </main>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { devPagesEnabled } from "@/lib/dev-pages";
import { RenderBenchmark } from "./RenderBenchmark";

export const metadata: Metadata = {
  title: "Benchmark de la vista previa",
  robots: { index: false, follow: false },
};

/**
 * Página interna de desarrollo (T6). En producción responde 404 salvo con
 * `LOOPITA_DEV_PAGES=1` (ver `src/lib/dev-pages.ts`). Usa datos sintéticos: no lee la
 * sesión ni llama a Supabase. `?auto=1` ejecuta el benchmark al cargar.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ auto?: string }> }) {
  await connection();
  if (!devPagesEnabled()) notFound();
  const { auto } = await searchParams;
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Benchmark de la vista previa</h1>
        <p className="mt-2 text-tinta-suave">
          Página interna. Mide el tiempo entre editar y ver el cambio (regla de oro 7: menos de 100 ms) en plano, tubo y círculo,
          con 40.000 puntos visibles.
        </p>
      </div>
      <RenderBenchmark autoRun={auto === "1"} />
    </main>
  );
}

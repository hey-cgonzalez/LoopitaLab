import { newWrittenPattern, type Dialect, type WrittenPattern } from "@loopitalab/pattern-core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { WrittenStudio } from "@/components/amigurumi/WrittenStudio";
import { DEMOS } from "@/app/dev/visor-3d/demo-patterns.ts";
import { devPagesEnabled } from "@/lib/dev-pages";

export const metadata: Metadata = { title: "Estudio amigurumi (desarrollo)", robots: { index: false, follow: false } };

/**
 * Página interna de desarrollo (T14 de la fase 4): el estudio amigurumi sin sesión ni guardado, para las E2E sin
 * Supabase. En producción responde 404 salvo con `LOOPITA_DEV_PAGES=1` (ver `src/lib/dev-pages.ts`).
 * - Sin parámetros: un amigurumi nuevo, como el de `/disenos/nuevo` (una parte con la V1 de 6 pb en anillo mágico).
 * - `?demo=<clave>`: un patrón de `/dev/visor-3d` (`fixture-a`, `muneco`, `grande`…).
 * - `?dialecto=us|uk`: el dialecto del perfil (se escribe con él y se lee con `readingModeFor`).
 * - `?sinwebgl=1`: siluetas sin WebGL. `?perf=1`: contadores del visor.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ demo?: string; dialecto?: string; sinwebgl?: string; perf?: string }> }) {
  await connection();
  if (!devPagesEnabled()) notFound();
  const { demo, dialecto, sinwebgl, perf } = await searchParams;
  const dialect: Dialect = dialecto === "us" || dialecto === "uk" ? dialecto : "es";
  const found = DEMOS.find((d) => d.key === demo);
  const doc: WrittenPattern = found
    ? found.build()
    : newWrittenPattern({
        id: "dev-amigurumi",
        title: "Amigurumi de prueba",
        yarns: [{ id: "A", weight: 4, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#E9DDBE", paletteId: "crudo" } }],
        partName: "Cuerpo",
      });
  return (
    <WrittenStudio
      document={doc}
      updatedAt="2026-11-14T00:00:00.000000+00:00"
      ownerId="dev"
      draftIssues={[]}
      dialect={dialect}
      detached
      perf={perf === "1"}
      forceNoWebGL={sinwebgl === "1"}
      exposeForTests
    />
  );
}

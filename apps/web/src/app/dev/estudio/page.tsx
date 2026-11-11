import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StudioShell } from "@/components/studio/StudioShell";
import { devPagesEnabled } from "@/lib/dev-pages";
import { crownPattern, diamondsPattern } from "@/lib/render-bench";

export const metadata: Metadata = { title: "Estudio (desarrollo)", robots: { index: false, follow: false } };

/**
 * Página interna de desarrollo (T9): el estudio con un documento sintético, sin sesión ni guardado.
 * En producción responde 404 salvo con `LOOPITA_DEV_PAGES=1` (ver `src/lib/dev-pages.ts`).
 * `?forma=circulo|tubo|plano`, `?espejo=1`, `?reps=N` (repeticiones de los rombos).
 * `?motivo=rombos` con `forma=circulo`: los rombos de 20 × 20 en círculo (con `reps=10`, 40.000 puntos: el peor caso de T6).
 * `?tecnica=crochet`: la misma página con técnica crochet (metraje "sin estimación", T9 de la fase 3).
 * `?perf=1`: recolector `edit-to-paint` (T10) con su panel y `window.__loopitaPerf`.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ forma?: string; espejo?: string; reps?: string; motivo?: string; perf?: string; tecnica?: string }> }) {
  await connection();
  if (!devPagesEnabled()) notFound();
  const { forma, espejo, reps, motivo, perf, tecnica } = await searchParams;
  const n = Math.max(1, Math.min(30, Number.parseInt(reps ?? "3", 10) || 3));
  const base = forma === "circulo" ? (motivo === "rombos" ? diamondsPattern(n, "circle") : crownPattern(8)) : diamondsPattern(n, forma === "plano" ? "flat" : "tube");
  const shaped = forma === "plano" ? { ...base, chart: { ...base.chart, workedIn: "rows" as const } } : base;
  const doc = tecnica === "crochet" ? { ...shaped, technique: "crochet" as const } : shaped;
  return <StudioShell document={doc} updatedAt="2026-11-06T00:00:00.000000+00:00" ownerId="dev" draftIssues={[]} mirror={espejo === "1"} detached perf={perf === "1"} />;
}

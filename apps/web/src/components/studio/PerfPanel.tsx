"use client";

import { useEffect, useState } from "react";
import type { PerfSummary } from "@/lib/studio/perf.ts";
import { installPerfProbe } from "./perf-probe.ts";

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");

/**
 * Panel de medición `edit-to-paint` (solo `/dev/estudio?perf=1`, T10). Instala el recolector y muestra p50 y p95 por
 * tipo de edición y las validaciones que cayeron dentro de una ventana de edición (CA-P7, debe ser 0).
 * Herramienta de desarrollo: no es interfaz para tejedoras, por eso no pasa por el glosario.
 */
export function PerfPanel() {
  const [s, setS] = useState<PerfSummary | null>(null);
  useEffect(() => {
    const uninstall = installPerfProbe();
    const t = setInterval(() => setS(window.__loopitaPerf?.summary() ?? null), 1000);
    return () => {
      clearInterval(t);
      uninstall();
    };
  }, []);
  return (
    <details className="fixed right-2 bottom-14 z-20 max-w-xs rounded-lg border-2 border-linea bg-superficie p-2 text-xs" data-testid="perf-panel">
      <summary className="cursor-pointer font-bold">edit-to-paint (ms)</summary>
      {s ? (
        <table className="mt-1">
          <thead>
            <tr>
              <th className="pr-2 text-left">tipo</th>
              <th className="pr-2">n</th>
              <th className="pr-2">p50</th>
              <th>p95</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.edits).map(([k, v]) => (
              <tr key={k}>
                <td className="pr-2">{k}</td>
                <td className="pr-2 text-right">{v.n}</td>
                <td className="pr-2 text-right">{fmt(v.p50)}</td>
                <td className="text-right">{fmt(v.p95)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {s ? (
        <p className="mt-1">
          validaciones: {s.validations.n} (dentro de una edición: {s.validations.insideEditWindow}); descartadas: {s.dropped}
        </p>
      ) : null}
    </details>
  );
}

"use client";

import type { Chart, Yarn } from "@loopitalab/pattern-core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { inkFor } from "@/lib/studio/color.ts";
import { cellOrigin, clampCellPx, fitCellPx, gridLayout, gridSize, lostStitchMarks, rowNumbering, type GridLayout } from "@/lib/studio/editor-grid.ts";
import { activePerf } from "@/lib/studio/perf.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { makeHatch, paintAll, paintRowHighlight, type DrawParams } from "../studio/draw-grid.ts";

const MAX_FIT_PX = 28;

export interface KnitChartProps {
  chart: Chart;
  yarns: readonly Yarn[];
  mirror: boolean;
  /** Fila del gráfico completo (base 0) a resaltar; `null` sin resaltado (gráfico terminado). */
  highlightRow: number | null;
  /** Fila del motivo (base 0) de la fila resaltada, por si el gráfico completo no cabe y se dibuja solo el motivo. */
  motifRow: number | null;
  /** Columnas `[xStart, xEnd)` del gráfico completo de la repetición en curso (`position().horizontalRepeat`). */
  repeat: { xStart: number; xEnd: number } | null;
  label: string;
}

/**
 * Gráfico de solo lectura de la pantalla "Tejiendo" (T12): la misma cuadrícula del editor (`draw-grid.ts`,
 * `editor-grid.ts`: fila 1 abajo, letras por lana, flechas de lectura, marcas de "se pierde un punto"), sin
 * herramientas, con la fila actual y la repetición en curso resaltadas. Dibuja el gráfico completo si cabe
 * (`gridSize(chart, "full")`); si no, el motivo, resaltando la fila del motivo. No cuenta nada: todo viene de
 * `follow` y de `pattern-core`. La fila resaltada se mantiene a la vista al avanzar.
 */
export function KnitChart({ chart, yarns, mirror, highlightRow, motifRow, repeat, label }: KnitChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hatchRef = useRef<DrawParams["hatch"] | null>(null);
  const [available, setAvailable] = useState({ w: 360, h: 320 });
  const [dpr, setDpr] = useState(1);

  const size = gridSize(chart, "full");
  const { cols, rows } = size;
  const full = size.view === "full";

  useEffect(() => {
    setDpr(Math.min(2, window.devicePixelRatio || 1));
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = Math.max(160, host.clientHeight - 8);
      if (w > 0) setAvailable((a) => (a.w === w && a.h === h ? a : { w, h }));
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const cellPx = useMemo(() => clampCellPx(Math.min(MAX_FIT_PX, fitCellPx(cols, rows, available.w, available.h, dpr)), cols, rows, dpr), [cols, rows, available.w, available.h, dpr]);
  const layout: GridLayout = useMemo(() => gridLayout(cols, rows, cellPx), [cols, rows, cellPx]);
  const numbering = useMemo(() => rowNumbering(chart, cellPx), [chart, cellPx]);
  const marks = useMemo(() => lostStitchMarks(chart, size.view), [chart, size.view]);
  const yarnHex = useMemo(() => yarns.map((y) => y.color.hex), [yarns]);
  const yarnInk = useMemo(() => yarnHex.map(inkFor), [yarnHex]);

  const row = highlightRow === null ? null : full ? highlightRow : motifRow;
  const repeatCols = full && repeat ? repeat : null;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    hatchRef.current ??= makeHatch(ctx) ?? "#EEEEEE";
    const px = Math.ceil(layout.width * dpr);
    const py = Math.ceil(layout.height * dpr);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
    paintAll(ctx, { chart, yarnHex, yarnInk, layout, numbering, mirror, marks, hatch: hatchRef.current, focus: null, showRepeats: full }, dpr);
    if (row !== null) paintRowHighlight(ctx, layout, dpr, row, repeatCols);
    activePerf()?.editorDrawn();
  }, [chart, yarnHex, yarnInk, layout, numbering, mirror, marks, full, row, repeatCols, dpr]);

  // La fila resaltada se mantiene a la vista cuando la cuadrícula es más alta que su marco.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || row === null) return;
    const o = cellOrigin(layout, { x: 0, y: row });
    const top = o.y - host.clientHeight / 2 + layout.cellPx / 2;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    host.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
  }, [row, layout]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div ref={hostRef} className="flex min-h-64 flex-1 basis-0 overflow-auto rounded-xl border-2 border-borde bg-white p-1" data-testid="knit-chart-scroll">
        <canvas
          ref={canvasRef}
          data-testid="knit-chart"
          data-cols={cols}
          data-rows={rows}
          data-cell-px={cellPx}
          data-highlight-row={row ?? ""}
          role="img"
          aria-label={label}
          style={{ width: layout.width, height: layout.height }}
          className="m-auto block max-w-none shrink-0"
        />
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-tinta-suave" aria-label="Leyenda del gráfico">
        <li>{STUDIO_TEXTS.ayuda.cuadricula}</li>
        <li>{STUDIO_TEXTS.editor.leerDerecho}</li>
        {size.forcedMotif ? <li className="font-bold text-marino">{STUDIO_TEXTS.editor.vistaCompletaDemasiado}</li> : null}
      </ul>
    </div>
  );
}

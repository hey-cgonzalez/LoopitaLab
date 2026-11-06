"use client";

import { NO_STITCH, rowShapingColumns, yarnLetter, type ChartPattern } from "@loopitalab/pattern-core";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { inkFor } from "@/lib/studio/color.ts";
import {
  DEFAULT_CELL_PX,
  clampCellPx,
  fitCellPx,
  gridLayout,
  gridSize,
  lostStitchMarks,
  moveFocus,
  pointToCell,
  rowNumbering,
  valueAt,
  type Cell,
  type GridLayout,
  type GridView,
} from "@/lib/studio/editor-grid.ts";
import { activePerf } from "@/lib/studio/perf.ts";
import { selectChart, selectYarns } from "@/lib/studio/select.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { applyTool, lineCells, paintCellsOf, toolForKey, yarnIndexForKey, type Tool } from "@/lib/studio/tools.ts";
import { STUDIO_TEXTS, cellAnnouncement, lostStitchNote, yarnTitle } from "@/lib/studio-texts.ts";
import { cellsOfMotifIndex, makeHatch, paintAll, paintCells, type DrawParams } from "./draw-grid.ts";
import { useStoreSelector } from "./useStoreSelector.ts";

const MAX_FIT_PX = 32;
/** Sobre esta cantidad de casillas del motivo cambiadas de una vez (relleno), se repinta todo en lugar de casilla por casilla. */
const INCREMENTAL_MAX_CELLS = 1500;

export interface ChartEditorProps {
  store: DocumentStore;
  tool: Tool;
  /** Índice de la lana activa en `yarns`. */
  activeYarn: number;
  view: GridView;
  /** `null` = ajustar al espacio disponible. */
  cellPx: number | null;
  mirror: boolean;
  onToolChange(tool: Tool): void;
  onYarnChange(index: number): void;
  /** Cuentagotas sobre una casilla "sin punto" (`NO_STITCH`) o con lana. */
  onPick(yarn: number): void;
  onZoom(direction: "in" | "out" | "fit"): void;
  /** Tamaño de casilla en uso (con "ajustar", el calculado), para el porcentaje de zoom. */
  onEffectivePx(px: number): void;
}

/**
 * Editor del motivo (T9): cuadrícula en canvas con la fila 1 abajo, numeración y flechas de lectura como el SVG,
 * letra por lana en cada casilla, "sin punto" rayado y marca de "se pierde un punto".
 *
 * El estado del dibujo se deriva del modelo (`doc`); cada edición es una operación sobre el almacén. Pintar una casilla
 * redibuja solo las casillas cambiadas (más sus bordes), por eso responde dentro del presupuesto de 100 ms.
 *
 * Accesibilidad provisional (T11 la afina): el canvas es un `role="application"` enfocable con instrucciones;
 * las flechas mueven la casilla enfocada y una región `aria-live` discreta anuncia cada casilla.
 */
export function ChartEditor(props: ChartEditorProps) {
  const { store, tool, activeYarn, view, cellPx, mirror } = props;
  // Solo el gráfico y las lanas (T10): el título, la muestra o el historial no vuelven a dibujar el editor.
  const chart = useStoreSelector(store, selectChart);
  const yarns = useStoreSelector(store, selectYarns);
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hatchRef = useRef<DrawParams["hatch"] | null>(null);
  const lastDraw = useRef<{ chart: ChartPattern["chart"]; key: string } | null>(null);
  const stroke = useRef<{ last: Cell } | null>(null);
  /** Casilla donde estuvo el anillo de foco la última vez que se dibujó (hay que repintarla al moverlo). */
  const focusRef = useRef<{ prev: Cell }>({ prev: { x: 0, y: 0 } });
  const [available, setAvailable] = useState({ w: 640, h: 480 });
  const [focus, setFocus] = useState<Cell>({ x: 0, y: 0 });
  const [hasFocus, setHasFocus] = useState(false);
  const [message, setMessage] = useState("");
  const [dpr, setDpr] = useState(1);
  const descId = useId();
  const noteId = useId();

  const size = gridSize(chart, view);
  const { cols, rows } = size;

  useEffect(() => {
    setDpr(Math.min(2, window.devicePixelRatio || 1));
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      // El alto disponible no sale del contenedor (su alto depende del canvas): es una fracción de la ventana.
      const h = Math.round(Math.max(300, window.innerHeight * 0.65));
      if (w > 0) setAvailable((a) => (a.w === w && a.h === h ? a : { w, h }));
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const effective = useMemo(() => {
    const d = dpr;
    if (cellPx !== null) return clampCellPx(cellPx, cols, rows, d);
    return Math.min(MAX_FIT_PX, fitCellPx(cols, rows, available.w, available.h, d));
  }, [cellPx, cols, rows, available.w, available.h, dpr]);

  const { onEffectivePx } = props;
  useEffect(() => onEffectivePx(effective), [effective, onEffectivePx]);

  const layout: GridLayout = useMemo(() => gridLayout(cols, rows, effective), [cols, rows, effective]);
  const numbering = useMemo(() => rowNumbering(chart, effective), [chart.workedIn, effective]); // eslint-disable-line react-hooks/exhaustive-deps
  // Las marcas dependen de las casillas: se recalculan en cada edición (O(casillas), sin render ni validación).
  const marks = useMemo(() => lostStitchMarks(chart, size.view), [chart, size.view]); // eslint-disable-line react-hooks/exhaustive-deps
  const yarnHex = useMemo(() => yarns.map((y) => y.color.hex), [yarns]);
  const yarnInk = useMemo(() => yarnHex.map(inkFor), [yarnHex]);

  // ------------------------------------------------------------------ dibujo
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    hatchRef.current ??= makeHatch(ctx) ?? "#EEEEEE";
    const p: DrawParams = {
      chart,
      yarnHex,
      yarnInk,
      layout,
      numbering,
      mirror,
      marks,
      hatch: hatchRef.current,
      focus: hasFocus ? focus : null,
      showRepeats: size.view === "full",
    };
    // Todo lo que obliga a repintar entero: si no cambia, una pincelada repinta solo las casillas tocadas.
    const key = [cols, rows, effective, dpr, mirror, size.view, chart.repeat.x, chart.repeat.y, chart.width, chart.height, chart.workedIn, yarnHex.join(",")].join("|");
    const prev = lastDraw.current;
    const px = Math.ceil(layout.width * dpr);
    const py = Math.ceil(layout.height * dpr);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
    if (!prev || prev.key !== key) {
      paintAll(ctx, p, dpr);
    } else if (prev.chart.cells !== chart.cells) {
      // Pincelada: se repintan solo las casillas cambiadas (y la de arriba, por la marca de "se pierde un punto").
      // Un relleno grande se repinta entero.
      const changedIdx: number[] = [];
      const n = chart.cells.length;
      for (let i = 0; i < n; i++) if (prev.chart.cells[i] !== chart.cells[i]) changedIdx.push(i);
      if (changedIdx.length > INCREMENTAL_MAX_CELLS) {
        paintAll(ctx, p, dpr);
      } else {
        const changed: Cell[] = [focusRef.current.prev];
        for (const i of changedIdx) for (const c of cellsOfMotifIndex(chart, cols, rows, i)) changed.push(c);
        paintCells(ctx, p, dpr, changed);
      }
    } else {
      // Solo cambió el foco (o nada): repinta la casilla anterior y la nueva.
      paintCells(ctx, p, dpr, [focusRef.current.prev, focus]);
    }
    focusRef.current.prev = focus;
    lastDraw.current = { chart, key };
    activePerf()?.editorDrawn();
  }, [chart, yarnHex, yarnInk, layout, numbering, mirror, marks, hasFocus, focus, size.view, cols, rows, effective, dpr]);

  // Si el foco queda fuera de la cuadrícula (cambió el tamaño o la vista), vuelve dentro.
  useEffect(() => {
    setFocus((f) => (f.x < cols && f.y < rows ? f : { x: Math.min(f.x, cols - 1), y: Math.min(f.y, rows - 1) }));
  }, [cols, rows]);

  // ------------------------------------------------------------------ anuncios
  const describeCellIn = useCallback(
    (ch: ChartPattern["chart"], c: Cell): string => {
      const chart = ch;
      const v = valueAt(chart, c);
      const yarn = v >= 0 && v < yarns.length ? yarnTitle(yarnLetter(v)) : STUDIO_TEXTS.herramientas.sinPunto.toLowerCase();
      let text = cellAnnouncement(c.y + 1, c.x + 1, yarn, chart.workedIn);
      const lost = rowShapingColumns(chart, c.y).decreases.includes(c.x % chart.width);
      if (lost && v === NO_STITCH) text += `. ${lostStitchNote(c.y + 1, c.x + 1)}`;
      return text;
    },
    [yarns.length],
  );
  const describeCell = (c: Cell) => describeCellIn(chart, c);

  // ------------------------------------------------------------------ puntero
  function cellFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Cell | null {
    const r = e.currentTarget.getBoundingClientRect();
    return pointToCell(layout, e.clientX - r.left, e.clientY - r.top);
  }

  function applyAt(c: Cell) {
    const r = applyTool(store, tool, c, activeYarn);
    if (r.kind === "pick") {
      props.onPick(r.yarn);
      setMessage(`${STUDIO_TEXTS.accesibilidad.anuncioCuentagotas}: ${r.yarn === NO_STITCH ? STUDIO_TEXTS.herramientas.sinPunto.toLowerCase() : yarnTitle(yarnLetter(r.yarn))}`);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const c = cellFromEvent(e);
    if (!c) return;
    e.currentTarget.focus({ preventScroll: true });
    setFocus(c);
    if (tool === "pencil" || tool === "nostitch") {
      e.currentTarget.setPointerCapture(e.pointerId);
      store.endStroke(); // por si otro panel dejó un trazo abierto
      store.beginStroke(); // todo el trazo se deshace de una vez
      stroke.current = { last: c };
      paintCellsOf(store, tool, [c], activeYarn);
    } else {
      applyAt(c);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = stroke.current;
    if (!s) return;
    const c = cellFromEvent(e);
    if (!c || (c.x === s.last.x && c.y === s.last.y)) return;
    // Un solo despacho por movimiento, aunque el puntero haya saltado varias casillas.
    paintCellsOf(store, tool, lineCells(s.last, c), activeYarn);
    s.last = c;
    setFocus(c);
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!stroke.current) return;
    stroke.current = null;
    store.endStroke();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  // Un trazo abierto no puede quedar colgado si el componente se desmonta.
  useEffect(() => () => store.endStroke(), [store]);

  // ------------------------------------------------------------------ teclado
  function onKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // deshacer y rehacer: atajo global del estudio
    const next = moveFocus(focus, e.key, cols, rows);
    if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End" || e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      if (next !== focus) {
        setFocus(next);
        setMessage(describeCell(next));
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (tool === "eyedropper") {
        applyAt(focus);
        return;
      }
      const r = applyTool(store, tool, focus, activeYarn);
      const changed = r.kind === "edit" && r.changed;
      const verb = tool === "fill" ? STUDIO_TEXTS.accesibilidad.anuncioRellenada : STUDIO_TEXTS.accesibilidad.anuncioPintada;
      // La casilla se describe con el documento ya cambiado (el almacén es la fuente de verdad).
      setMessage(changed ? `${describeCellIn(store.doc.chart, focus)}, ${verb}` : describeCell(focus));
      return;
    }
    const t = toolForKey(e.key);
    if (t) {
      e.preventDefault();
      props.onToolChange(t);
      return;
    }
    const yi = yarnIndexForKey(e.key, yarns.length);
    if (yi !== null) {
      e.preventDefault();
      props.onYarnChange(yi);
      return;
    }
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      const n = yarns.length;
      props.onYarnChange((activeYarn + (e.key === "]" ? 1 : n - 1)) % n);
      return;
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      props.onZoom("in");
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      props.onZoom("out");
    } else if (e.key === "0") {
      e.preventDefault();
      props.onZoom("fit");
    }
  }

  const paints = tool === "pencil" || tool === "nostitch";
  const showAlternation = chart.workedIn === "rows" && chart.height % 2 === 1 && chart.repeat.y > 1 && size.view === "full";

  return (
    <div className="grid gap-2">
      <div ref={hostRef} className="max-h-[70vh] min-h-48 overflow-auto rounded-xl border-2 border-linea bg-white p-1" data-testid="chart-scroll">
        <canvas
          ref={canvasRef}
          data-testid="chart-canvas"
          data-cols={cols}
          data-rows={rows}
          data-cell-px={effective}
          role="application"
          aria-roledescription="cuadrícula del motivo"
          aria-label={STUDIO_TEXTS.accesibilidad.editorEtiqueta}
          aria-describedby={`${descId} ${noteId}`}
          tabIndex={0}
          style={{ width: layout.width, height: layout.height, touchAction: paints ? "none" : "auto", cursor: paints ? "crosshair" : "cell" }}
          className="block max-w-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onLostPointerCapture={endStroke}
          onKeyDown={onKeyDown}
          onFocus={() => {
            setHasFocus(true);
            setMessage(describeCell(focus));
          }}
          onBlur={() => setHasFocus(false)}
        />
      </div>
      <p id={descId} className="sr-only">
        {STUDIO_TEXTS.accesibilidad.instrucciones}
      </p>
      <p id={noteId} className="sr-only">
        {STUDIO_TEXTS.ayuda.cuadricula} {STUDIO_TEXTS.editor.leerDerecho}
      </p>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="cell-announcement">
        {message}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-tinta-suave" aria-label="Leyenda del gráfico">
        <li>{STUDIO_TEXTS.ayuda.cuadricula}</li>
        <li>{STUDIO_TEXTS.editor.leyendaSinPunto}</li>
        <li>{STUDIO_TEXTS.editor.leyendaPierde}</li>
        <li>{STUDIO_TEXTS.editor.leerDerecho}</li>
        {mirror ? <li>{STUDIO_TEXTS.editor.espejo}</li> : null}
      </ul>
      {size.forcedMotif ? <p className="text-sm font-bold">{STUDIO_TEXTS.editor.vistaCompletaDemasiado}</p> : null}
      {showAlternation ? <p className="text-sm text-tinta-suave">{STUDIO_TEXTS.ayuda.alternanciaMotivo}</p> : null}
      {size.view === "full" ? <p className="text-sm text-tinta-suave">{STUDIO_TEXTS.repeticiones.ayuda}</p> : null}
    </div>
  );
}

export { DEFAULT_CELL_PX };

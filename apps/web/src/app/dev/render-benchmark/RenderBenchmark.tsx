"use client";

/**
 * Benchmark de la vista previa realista (T6, ADR 0004). Página interna de desarrollo.
 *
 * Reglas de integración que se ejercitan aquí (ADR 0004):
 * - El documento y el canvas viven fuera de React (`PreviewEngine`): una edición nunca
 *   vuelve a renderizar un árbol proporcional al número de puntos.
 * - Camino crítico: operación del modelo → `colorize` incremental (o geometría nueva si
 *   cambia la máscara del círculo o las repeticiones) → `invalidate` → `requestRender`.
 * - La validación y la descripción textual corren con antirrebote de 300 ms, nunca
 *   entre la edición y el dibujo (CA-P7).
 * - `edit-to-paint`: desde `event.timeStamp` (o `performance.now()` en el benchmark
 *   automático) hasta el `requestAnimationFrame` siguiente al dibujo más una tarea
 *   (`MessageChannel`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  NO_STITCH,
  cellIndex,
  fullSize,
  motifCoord,
  paintCells,
  setRepeat,
  validatePattern,
  type ChartPattern,
  type Issue,
} from "@loopitalab/pattern-core";
import { FIBERS, PALETTE } from "@loopitalab/yarn-catalog";
import { describeChart } from "@loopitalab/pattern-render";
import {
  HIDDEN,
  colorize,
  createCanvasRenderer,
  fitView,
  hitTest,
  layoutGeometry,
  needsRelayout,
  neutralLook,
  panBy,
  screenToLayout,
  yarnLook,
  zoomAt,
  type FrameInfo,
  type StitchLayout,
  type StitchRenderer,
} from "@loopitalab/stitch-render";
import { BENCH_GAUGE, crownPattern, diamondsPattern, fpsFromFrames, summarize, type Summary } from "@/lib/render-bench";

type Shape = "flat" | "tube" | "circle";
const SHAPES: { id: Shape; label: string }[] = [
  { id: "flat", label: "Plano" },
  { id: "tube", label: "Tubo" },
  { id: "circle", label: "Círculo" },
];

const BG = "#EFE9DF";

/** Documento, disposición y canvas, fuera de React. */
class PreviewEngine {
  pattern: ChartPattern;
  layout: StitchLayout | null = null;
  renderer: StitchRenderer | null = null;
  shape: Shape = "flat";
  tubeRotation = 0;
  fiberEffects = false;
  lastFrame: FrameInfo | null = null;
  cssW = 720;
  cssH = 540;
  onDocChange: (() => void) | null = null;

  constructor(p: ChartPattern) {
    this.pattern = p;
  }

  attach(canvas: HTMLCanvasElement) {
    this.renderer = createCanvasRenderer(canvas, { background: BG, onFrame: (f) => (this.lastFrame = f) });
    this.renderer.resize(this.cssW, this.cssH, window.devicePixelRatio || 1);
    this.applyLooks();
    this.relayout(true);
  }

  detach() {
    this.renderer?.destroy();
    this.renderer = null;
  }

  resize(w: number, h: number) {
    this.cssW = w;
    this.cssH = h;
    this.renderer?.resize(w, h, window.devicePixelRatio || 1);
    this.fit();
  }

  applyLooks() {
    this.renderer?.setLooks(this.pattern.yarns.map((y) => yarnLook(y, FIBERS, { fiberEffects: this.fiberEffects })));
    this.renderer?.requestRender();
  }

  relayout(refit: boolean) {
    const chart = this.pattern.chart;
    const layout = layoutGeometry(chart, { gauge: this.pattern.gauge ?? BENCH_GAUGE, shape: this.shape, tubeRotation: this.tubeRotation });
    colorize(layout, chart);
    this.layout = layout;
    this.renderer?.setLayout(layout);
    if (refit) this.fit();
    this.renderer?.requestRender();
  }

  fit() {
    if (!this.layout || !this.renderer) return;
    this.renderer.setView(fitView(this.layout.bounds, this.cssW, this.cssH, 12));
    this.renderer.requestRender();
  }

  load(p: ChartPattern, shape: Shape) {
    this.pattern = p;
    this.shape = shape;
    this.applyLooks();
    this.relayout(true);
    this.onDocChange?.();
  }

  /** Pinta la celda (x, y) del gráfico completo. Camino crítico: sin validar. */
  paint(x: number, y: number, value: number): boolean {
    const chart = this.pattern.chart;
    const next = paintCells(chart, [{ x, y }], value, this.pattern.yarns.length);
    if (next === chart || !this.layout) return false;
    this.pattern = { ...this.pattern, chart: next };
    const m = motifCoord(next, x, y);
    const cell = cellIndex(next, m.x, m.y);
    if (needsRelayout(this.layout, next, [cell])) this.relayout(false);
    else this.renderer?.invalidate(colorize(this.layout, next, [cell]));
    this.renderer?.requestRender();
    this.onDocChange?.();
    return true;
  }

  setRepeats(n: number) {
    const next = setRepeat(this.pattern.chart, n, n);
    if (next === this.pattern.chart) return;
    this.pattern = { ...this.pattern, chart: next };
    this.relayout(true);
    this.onDocChange?.();
  }

  /** Celda del gráfico completo bajo un punto de la pantalla (px CSS relativos al canvas). */
  cellAt(sx: number, sy: number): { x: number; y: number } | null {
    if (!this.layout || !this.renderer) return null;
    const p = screenToLayout(this.renderer.getView(), sx, sy);
    const i = hitTest(this.layout, p.x, p.y);
    if (i === null) return null;
    return { x: this.layout.col[i] as number, y: this.layout.row[i] as number };
  }
}

/** Espera al frame pintado: rAF después del dibujo y una tarea más. */
function afterPaint(start: number, label = "edit-to-paint"): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => {
        const end = performance.now();
        try {
          performance.measure(label, { start, end });
        } catch {
          // Navegadores sin `measure` con opciones: solo se devuelve el número.
        }
        resolve(end - start);
      };
      ch.port2.postMessage(0);
    });
  });
}

function nextFrame(): Promise<number> {
  return new Promise((r) => requestAnimationFrame((t) => r(t)));
}

/** Generador con semilla para que el benchmark sea reproducible. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ShapeResult {
  shape: Shape;
  stitches: number;
  paint: Summary;
  paintDraw: Summary;
  repeats: Summary;
  zoomFps: number;
  zoomDraw: Summary;
  panFps: number;
  maskPaint?: Summary;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");

export function RenderBenchmark({ autoRun }: { autoRun: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PreviewEngine | null>(null);
  const [shape, setShape] = useState<Shape>("flat");
  const [design, setDesign] = useState<"diamonds" | "crown">("diamonds");
  const [paintValue, setPaintValue] = useState(1);
  const [fiberEffects, setFiberEffects] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Listo.");
  const [results, setResults] = useState<ShapeResult[]>([]);
  const [manual, setManual] = useState<number[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [description, setDescription] = useState("");
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [thumb, setThumb] = useState<string | null>(null);
  const [distorted, setDistorted] = useState(false);
  const [hasHoles, setHasHoles] = useState(false);
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paintValueRef = useRef(paintValue);
  paintValueRef.current = paintValue;

  // Validación y descripción fuera del camino crítico (antirrebote de 300 ms, CA-P7).
  const scheduleValidation = useCallback(() => {
    if (validateTimer.current) clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(() => {
      const e = engineRef.current;
      if (!e) return;
      const v = validatePattern({ ...e.pattern, chart: { ...e.pattern.chart, renderAs: e.shape } });
      setIssues(v.issues.filter((i) => i.severity !== "error" || v.savable === false));
      setDescription(describeChart({ ...e.pattern, chart: { ...e.pattern.chart, renderAs: e.shape } }));
      const l = e.layout;
      setDistorted(!!l?.ringDistortion && [...l.ringDistortion].some((d) => d > 0 && (d < 0.6 || d > 1.6)));
      let holes = false;
      if (l && l.geometry.shape !== "circle") for (let i = 0; i < l.count && !holes; i++) holes = l.yarn[i] === HIDDEN;
      setHasHoles(holes);
    }, 300);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const e = new PreviewEngine(diamondsPattern(10, "flat"));
    e.onDocChange = scheduleValidation;
    engineRef.current = e;
    const w = wrapRef.current?.clientWidth ?? 720;
    e.cssW = Math.min(960, Math.max(320, w));
    e.cssH = Math.round(e.cssW * 0.72);
    e.attach(canvas);
    scheduleValidation();
    const ro = new ResizeObserver(() => {
      const width = Math.min(960, Math.max(320, wrapRef.current?.clientWidth ?? 720));
      if (Math.abs(width - e.cssW) > 1) e.resize(width, Math.round(width * 0.72));
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    // Rueda: zoom en el cursor (listener no pasivo para poder evitar el desplazamiento de la página).
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = e.renderer;
      if (!r) return;
      const rect = canvas.getBoundingClientRect();
      r.setView(zoomAt(r.getView(), Math.exp(-ev.deltaY * 0.0015), ev.clientX - rect.left, ev.clientY - rect.top));
      r.requestRender();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      ro.disconnect();
      e.detach();
      if (validateTimer.current) clearTimeout(validateTimer.current);
    };
  }, [scheduleValidation]);

  // ------------------------------------------------------------ Interacción

  const drag = useRef<{ mode: "paint" | "pan"; x: number; y: number } | null>(null);

  const paintFromEvent = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const e = engineRef.current;
    const canvas = canvasRef.current;
    if (!e || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cell = e.cellAt(ev.clientX - rect.left, ev.clientY - rect.top);
    if (!cell) return;
    const start = ev.timeStamp;
    if (!e.paint(cell.x, cell.y, paintValueRef.current)) return;
    void afterPaint(start).then((ms) => setManual((m) => [...m.slice(-199), ms]));
  };

  const onPointerDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const pan = ev.button !== 0 || ev.shiftKey;
    drag.current = { mode: pan ? "pan" : "paint", x: ev.clientX, y: ev.clientY };
    if (!pan) paintFromEvent(ev);
  };
  const onPointerMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    const e = engineRef.current;
    if (!d || !e?.renderer) return;
    if (d.mode === "pan") {
      e.renderer.setView(panBy(e.renderer.getView(), ev.clientX - d.x, ev.clientY - d.y));
      e.renderer.requestRender();
      d.x = ev.clientX;
      d.y = ev.clientY;
    } else paintFromEvent(ev);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const zoomBy = (f: number) => {
    const e = engineRef.current;
    if (!e?.renderer) return;
    e.renderer.setView(zoomAt(e.renderer.getView(), f, e.cssW / 2, e.cssH / 2));
    e.renderer.requestRender();
  };

  // Teclado: flechas mueven el cursor de celda (resalta su fila), Enter o Espacio pinta.
  const onKeyDown = (ev: React.KeyboardEvent<HTMLCanvasElement>) => {
    const e = engineRef.current;
    if (!e) return;
    const { width, height } = fullSize(e.pattern.chart);
    const move: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const m = move[ev.key];
    if (m) {
      ev.preventDefault();
      const nx = Math.min(width - 1, Math.max(0, cursor.x + m[0]));
      const ny = Math.min(height - 1, Math.max(0, cursor.y + m[1]));
      setCursor({ x: nx, y: ny });
      e.renderer?.setHighlightRow(ny);
      e.renderer?.requestRender();
    } else if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      const start = ev.timeStamp;
      if (e.paint(cursor.x, cursor.y, paintValueRef.current)) void afterPaint(start).then((ms) => setManual((s) => [...s.slice(-199), ms]));
    } else if (ev.key === "+" || ev.key === "=") zoomBy(1.25);
    else if (ev.key === "-") zoomBy(0.8);
    else if (ev.key === "0") engineRef.current?.fit();
  };

  const changeShape = (s: Shape) => {
    setShape(s);
    const e = engineRef.current;
    if (!e) return;
    e.shape = s;
    e.relayout(true);
    scheduleValidation();
  };

  const changeDesign = (d: "diamonds" | "crown") => {
    setDesign(d);
    const e = engineRef.current;
    if (!e) return;
    const s: Shape = d === "crown" ? "circle" : shape;
    setShape(s);
    e.load(d === "crown" ? crownPattern(8) : diamondsPattern(10, s), s);
  };

  const preview = (hex: string | null) => {
    const r = engineRef.current?.renderer;
    if (!r) return;
    r.setPreviewOverride(hex && paintValueRef.current >= 0 ? { yarn: paintValueRef.current, look: neutralLook(hex) } : null);
    r.requestRender();
  };

  const takeSnapshot = async () => {
    const r = engineRef.current?.renderer;
    if (!r) return;
    const blob = await r.snapshot({ width: 512, height: 512 });
    setThumb((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
  };

  // ------------------------------------------------------------ Benchmark automático

  const runBenchmark = useCallback(async () => {
    const e = engineRef.current;
    if (!e?.renderer || running) return;
    setRunning(true);
    const out: ShapeResult[] = [];
    try {
      for (const s of SHAPES.map((x) => x.id)) {
        setStatus(`Midiendo ${s}…`);
        e.load(diamondsPattern(10, s), s);
        await afterPaint(performance.now());
        const rnd = seeded(20261106);
        const { width, height } = fullSize(e.pattern.chart);
        // CA-P1: pintar una celda, 50 veces.
        const paint: number[] = [];
        const paintDraw: number[] = [];
        for (let k = 0; k < 50; k++) {
          const x = Math.floor(rnd() * width);
          const y = Math.floor(rnd() * height);
          const start = performance.now();
          if (!e.paint(x, y, k % 4)) {
            e.paint(x, y, (k + 1) % 4);
          }
          paint.push(await afterPaint(start));
          paintDraw.push(e.lastFrame?.ms ?? Number.NaN);
        }
        // CA-P3: repeticiones de 5 × 5 a 10 × 10, 20 veces.
        const repeats: number[] = [];
        for (let k = 0; k < 20; k++) {
          const start = performance.now();
          e.setRepeats(k % 2 === 0 ? 5 : 10);
          repeats.push(await afterPaint(start));
        }
        e.setRepeats(10);
        await afterPaint(performance.now());
        // CA-P4: zoom y desplazamiento, 60 frames cada uno.
        const zoomTimes: number[] = [];
        const zoomDraw: number[] = [];
        const r = e.renderer;
        if (!r) break;
        for (let k = 0; k < 60; k++) {
          const t = await nextFrame();
          zoomTimes.push(t);
          const t0 = performance.now();
          r.setView(zoomAt(r.getView(), k < 30 ? 1.035 : 1 / 1.035, e.cssW / 2, e.cssH / 2));
          r.flush();
          zoomDraw.push(performance.now() - t0);
        }
        const panTimes: number[] = [];
        for (let k = 0; k < 60; k++) {
          panTimes.push(await nextFrame());
          r.setView(panBy(r.getView(), k < 30 ? 4 : -4, k < 30 ? 2 : -2));
          r.flush();
        }
        const res: ShapeResult = {
          shape: s,
          stitches: e.layout?.count ?? 0,
          paint: summarize(paint),
          paintDraw: summarize(paintDraw),
          repeats: summarize(repeats),
          zoomFps: fpsFromFrames(zoomTimes),
          zoomDraw: summarize(zoomDraw),
          panFps: fpsFromFrames(panTimes),
        };
        if (s === "circle") {
          // Peor caso del círculo: pintar o quitar "sin punto" cambia los conteos y exige geometría nueva.
          const mask: number[] = [];
          for (let k = 0; k < 20; k++) {
            const start = performance.now();
            e.paint(19, 199, k % 2 === 0 ? NO_STITCH : 0);
            mask.push(await afterPaint(start));
          }
          res.maskPaint = summarize(mask);
        }
        out.push(res);
        setResults([...out]);
      }
      setStatus("Benchmark terminado.");
      (window as unknown as { __renderBench?: unknown }).__renderBench = { userAgent: navigator.userAgent, dpr: window.devicePixelRatio, canvas: { w: e.cssW, h: e.cssH }, results: out };
      e.load(design === "crown" ? crownPattern(8) : diamondsPattern(10, shape), design === "crown" ? "circle" : shape);
    } finally {
      setRunning(false);
    }
  }, [running, design, shape]);

  useEffect(() => {
    if (!autoRun) return;
    const t = setTimeout(() => void runBenchmark(), 500);
    return () => clearTimeout(t);
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  const yarns = engineRef.current?.pattern.yarns ?? diamondsPattern(1).yarns;
  const manualSummary = summarize(manual);
  const swatches = PALETTE.filter((_, i) => i % 3 === 0).slice(0, 16);

  return (
    <div className="grid gap-6">
      <p className="rounded-lg border border-mostaza bg-superficie p-3 text-sm" role="note">
        <strong>Vista previa aproximada.</strong> Es un prototipo digital: el tejido real cambia con la lana, la tensión y el
        bloqueo. Teje una muestra para comprobar la muestra (gauge) y las proporciones.
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <fieldset className="flex gap-2">
          <legend className="text-sm font-bold">Forma</legend>
          {SHAPES.map((s) => (
            <label key={s.id} className="flex items-center gap-1 text-sm">
              <input type="radio" name="shape" checked={shape === s.id} onChange={() => changeShape(s.id)} disabled={running} />
              {s.label}
            </label>
          ))}
        </fieldset>
        <label className="text-sm">
          <span className="block font-bold">Diseño</span>
          <select value={design} onChange={(ev) => changeDesign(ev.target.value as "diamonds" | "crown")} disabled={running} className="rounded border border-linea bg-superficie px-2 py-1">
            <option value="diamonds">Rombos, 20 × 20 con 10 × 10 repeticiones (40.000 puntos)</option>
            <option value="crown">Copa en cuña, 8 repeticiones (80 → 8 puntos)</option>
          </select>
        </label>
        {shape === "tube" && (
          <label className="text-sm">
            <span className="block font-bold">Rotación del tubo</span>
            <input
              type="range"
              min={0}
              max={360}
              value={rotation}
              onChange={(ev) => {
                const deg = Number(ev.target.value);
                setRotation(deg);
                const e = engineRef.current;
                if (!e) return;
                e.tubeRotation = (deg * Math.PI) / 180;
                e.relayout(false);
              }}
              aria-valuetext={`${rotation} grados`}
            />
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={fiberEffects}
            onChange={(ev) => {
              setFiberEffects(ev.target.checked);
              const e = engineRef.current;
              if (!e) return;
              e.fiberEffects = ev.target.checked;
              e.applyLooks();
            }}
          />
          Aspecto según la fibra (halo, brillo, definición)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="text-sm font-bold">Pintar con</legend>
          {yarns.map((y, i) => (
            <label key={y.id} className="flex items-center gap-1 text-sm">
              <input type="radio" name="paint" checked={paintValue === i} onChange={() => setPaintValue(i)} />
              <span aria-hidden className="inline-block h-4 w-4 rounded-sm border border-linea" style={{ background: y.color.hex }} />
              Lana {y.id}
            </label>
          ))}
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" name="paint" checked={paintValue === NO_STITCH} onChange={() => setPaintValue(NO_STITCH)} />
            Sin punto
          </label>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Probar un color de la paleta en la lana seleccionada (sin cambiar el diseño)">
        {swatches.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.nombre}
            aria-label={`Probar ${c.nombre}`}
            className="h-7 w-7 rounded border border-linea"
            style={{ background: c.hex }}
            onMouseEnter={() => preview(c.hex)}
            onMouseLeave={() => preview(null)}
            onFocus={() => preview(c.hex)}
            onBlur={() => preview(null)}
          />
        ))}
      </div>

      <div ref={wrapRef} className="w-full max-w-[960px]">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="img"
          aria-label="Vista previa realista del tejido (aproximación visual)"
          aria-describedby="bench-desc bench-keys"
          className="touch-none rounded-lg border border-linea"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(ev) => ev.preventDefault()}
          onKeyDown={onKeyDown}
        />
        <p id="bench-keys" className="mt-2 text-sm text-tinta-suave">
          Clic o arrastre: pintar. Mayúscula + arrastre o botón derecho: desplazar. Rueda: zoom. Con el teclado: flechas para
          moverse (columna {cursor.x + 1}, fila {cursor.y + 1}), Enter o Espacio para pintar, + y − para el zoom y 0 para
          ajustar.
        </p>
        <p id="bench-desc" className="sr-only">
          {description}
        </p>
      </div>

      {hasHoles && shape !== "circle" && (
        <p className="text-sm" role="note">
          Los huecos de “sin punto” se dibujan vacíos para que se vea la forma del gráfico, pero no existen en la prenda real.
        </p>
      )}
      {distorted && shape === "circle" && (
        <p className="text-sm" role="note">
          La proyección plana comprime o estira los puntos en algunas vueltas; en la prenda, la copa forma una cúpula.
        </p>
      )}
      {issues.length > 0 && (
        <ul className="list-disc pl-6 text-sm">
          {issues.slice(0, 6).map((i, k) => (
            <li key={`${i.code}-${k}`}>
              <span className="font-bold">{i.severity === "info" ? "Nota" : i.severity === "warning" ? "Aviso" : "Error"}:</span> {i.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => zoomBy(1.25)} className="rounded border border-linea bg-superficie px-3 py-1">
          Acercar
        </button>
        <button type="button" onClick={() => zoomBy(0.8)} className="rounded border border-linea bg-superficie px-3 py-1">
          Alejar
        </button>
        <button type="button" onClick={() => engineRef.current?.fit()} className="rounded border border-linea bg-superficie px-3 py-1">
          Ajustar
        </button>
        <button type="button" onClick={() => void takeSnapshot()} className="rounded border border-linea bg-superficie px-3 py-1">
          Captura (512 × 512)
        </button>
        <button type="button" onClick={() => void runBenchmark()} disabled={running} className="rounded bg-marino px-3 py-1 font-bold text-white disabled:opacity-60">
          {running ? "Midiendo…" : "Ejecutar benchmark"}
        </button>
      </div>
      {thumb && (
        // Miniatura generada en el navegador (blob:), no es una imagen remota.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="Captura de la vista previa" width={256} height={256} className="rounded border border-linea" />
      )}

      <p aria-live="polite" className="text-sm">
        {status} Ediciones a mano: {manualSummary.n} · p50 {fmt(manualSummary.p50)} ms · p95 {fmt(manualSummary.p95)} ms.
      </p>

      {results.length > 0 && (
        <table className="w-full max-w-4xl border-collapse text-sm" data-testid="bench-results">
          <caption className="text-left font-bold">edit-to-paint en ms (p50 / p95 / máx.), dibujo en ms y fps</caption>
          <thead>
            <tr className="border-b border-linea text-left">
              <th scope="col">Forma</th>
              <th scope="col">Puntos</th>
              <th scope="col">Pintar celda (50)</th>
              <th scope="col">Dibujo incremental p95</th>
              <th scope="col">Repeticiones 5↔10 (20)</th>
              <th scope="col">Zoom fps (dibujo p95)</th>
              <th scope="col">Desplazamiento fps</th>
              <th scope="col">Sin punto en círculo (20)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.shape} className="border-b border-linea">
                <th scope="row">{SHAPES.find((s) => s.id === r.shape)?.label}</th>
                <td>{r.stitches.toLocaleString("es-CL")}</td>
                <td>
                  {fmt(r.paint.p50)} / {fmt(r.paint.p95)} / {fmt(r.paint.max)}
                </td>
                <td>{fmt(r.paintDraw.p95)}</td>
                <td>
                  {fmt(r.repeats.p50)} / {fmt(r.repeats.p95)} / {fmt(r.repeats.max)}
                </td>
                <td>
                  {fmt(r.zoomFps)} ({fmt(r.zoomDraw.p95)})
                </td>
                <td>{fmt(r.panFps)}</td>
                <td>{r.maskPaint ? `${fmt(r.maskPaint.p50)} / ${fmt(r.maskPaint.p95)}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {results.length > 0 && <pre className="sr-only" data-testid="bench-json">{JSON.stringify(results)}</pre>}
    </div>
  );
}

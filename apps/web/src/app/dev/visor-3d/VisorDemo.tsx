"use client";

import { LIMITS, type Part, type WrittenPattern } from "@loopitalab/pattern-core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewerHandle, PatternSource } from "@/components/amigurumi/AmigurumiViewer.tsx";
import { AmigurumiViewerLoader } from "@/components/amigurumi/AmigurumiViewerLoader.tsx";
import { PreviewControls } from "@/components/studio/preview-controls.ts";
import type { DemoData } from "./demo-patterns.ts";

/*
 * Página interna del visor 3D (T11 de la fase 4): monta el visor real (`viewer-3d/three` + r3f) con los fixtures
 * A y B, un cilindro, un panel, cambios de color, una pieza que ondula, un muñeco armado y escenas sobre los
 * límites. Todo lo que mide lo expone en `window.__loopitaVisor3d` (E2E `webgl.spec.ts` y `e2e/medir-visor-3d.ts`).
 * El documento vive fuera de React (`DemoSource`), como el almacén del estudio (ADR 0004).
 */

class DemoSource implements PatternSource {
  #pattern: WrittenPattern;
  #listeners = new Set<() => void>();
  constructor(p: WrittenPattern) {
    this.#pattern = p;
  }
  getSnapshot = (): WrittenPattern => this.#pattern;
  subscribe = (l: () => void): (() => void) => {
    this.#listeners.add(l);
    return () => this.#listeners.delete(l);
  };
  set(p: WrittenPattern): void {
    this.#pattern = p;
    for (const l of this.#listeners) l();
  }
}

export interface FrameStats {
  frames: number;
  fps: number;
  p50: number;
  p95: number;
  max: number;
}

export interface Visor3dDevApi {
  ready: boolean;
  select(key: string): Promise<{ ms: number }>;
  /** Arma una escena de unos `n` puntos hasta el primer frame (`unique`: partes distintas, sin copias). */
  sceneOfStitches(n: number, unique?: boolean): Promise<{ ms: number; stitches: number; parts: number }>;
  /** Edita una vuelta del fixture A (meseta V11–30 ↔ V11–31) hasta el frame pintado: `edit-to-paint-3d`. */
  editToPaint(): Promise<{ ms: number }>;
  /** Cambia la lana de una vuelta (misma forma): `colorizePartMesh` y el rango de `yarn`. */
  recolorToPaint(): Promise<{ ms: number }>;
  /** Cambia la composición (o el color con `hex`) de la lana A: solo `setLooks`. */
  looksToPaint(fiber: string, hex?: string): Promise<{ ms: number }>;
  flatToPaint(flat: boolean): Promise<{ ms: number }>;
  hoverToPaint(hex: string | null): Promise<{ ms: number }>;
  setVariant(v: "fiber" | "base"): Promise<void>;
  setLod(l: "relief" | "smooth"): Promise<void>;
  orbit(ms: number): Promise<FrameStats>;
  renderCost(k: number): { p50: number; p95: number };
  /** CA4-V8: con aspectos neutros, el material extendido da los mismos píxeles que `MeshStandardMaterial`. */
  neutralVsBase(): { pixels: number; differing: number; maxDelta: number; lit: number };
  stats(): unknown;
  status(): unknown;
  loseContext(): boolean;
  restoreContext(): boolean;
}

declare global {
  interface Window {
    __loopitaVisor3d?: Visor3dDevApi;
  }
}

const q = (xs: number[], f: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(f * s.length))] ?? 0;
};

/**
 * Escena de unos `stitches` puntos para medir (T11 y T12). Con copias de una parte (por defecto), se arma una sola
 * malla y el costo es del dibujo. Con `unique`, hasta `LIMITS.maxParts` partes distintas (el fixture A con la meseta
 * alargada, sin pasar por el lector de texto), cada una con su malla: el peor caso para armar la escena
 * (calibración de `SCENE_HARD_STITCH_CAP`, ADR 0010, sección 6c).
 */
function sceneOfStitches(template: WrittenPattern, stitches: number, unique = false): WrittenPattern {
  const base = template.parts[0]!;
  const parts: Part[] = [];
  if (unique) {
    const count = Math.min(LIMITS.maxParts, Math.max(1, Math.ceil(stitches / 6_000)));
    // Fixture A: 1.800 puntos con 20 vueltas de 60 en la meseta (V11–30, índice 10); cada vuelta más suma 60.
    const plateau = Math.max(1, Math.round(20 + (stitches / count - 1_800) / 60));
    for (let i = 0; i < count; i++) {
      const rounds = base.rounds.map((r, j) => (j < 10 ? r : j === 10 ? { ...r, through: r.number + plateau - 1 } : { ...r, number: r.number + plateau - 20 }));
      parts.push({ ...base, id: `cuerpo-${stitches}-${i + 1}`, name: `Cuerpo ${i + 1}`, rounds });
    }
  } else {
    const copies = Math.max(1, Math.round(stitches / 1_800));
    for (let left = copies, i = 0; left > 0; i++) {
      const n = Math.min(50, left);
      parts.push({ ...base, id: `cuerpo-${i + 1}`, name: `Cuerpo ${i + 1}`, copies: n });
      left -= n;
    }
  }
  return { ...template, id: `escena-${stitches}`, title: `Escena ${stitches}`, parts, layout: { placements: [] } };
}

export default function VisorDemo({ data }: { data: DemoData }) {
  const DEMOS = data.demos.map((d) => ({ ...d, build: () => structuredClone(d.pattern) }));
  const FIBER_SAMPLES = data.fibers;
  const [demo, setDemo] = useState(DEMOS[0]!.key);
  const [fiber, setFiber] = useState("algodon");
  const [perf, setPerf] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  const source = useMemo(() => new DemoSource(structuredClone(data.demos[0]!.pattern)), [data]);
  const controls = useMemo(() => new PreviewControls(), []);
  const handle = useRef<ViewerHandle | null>(null);
  const plateau = useRef(30);
  const recolored = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPerf(params.get("perf") === "1");
    setNoWebGL(params.get("sinwebgl") === "1");
    const d = params.get("demo");
    if (d && DEMOS.some((x) => x.key === d)) {
      setDemo(d);
      source.set(DEMOS.find((x) => x.key === d)!.build());
    }
  }, [source]);

  const paint = async (change: () => void): Promise<{ ms: number }> => {
    const h = handle.current;
    const t0 = performance.now();
    change();
    if (!h) return { ms: performance.now() - t0 };
    const end = await h.nextPaint();
    return { ms: end - t0 };
  };

  const replacePart0 = (p: WrittenPattern, part: Part): WrittenPattern => ({ ...p, parts: [part, ...p.parts.slice(1)] });

  const choose = (key: string) => {
    const entry = DEMOS.find((d) => d.key === key);
    if (!entry) return;
    plateau.current = 30;
    recolored.current = false;
    setDemo(key);
    source.set(entry.build());
    requestAnimationFrame(() => handle.current?.frame());
  };

  const onHandle = (h: ViewerHandle | null) => {
    handle.current = h;
    if (!h) {
      delete window.__loopitaVisor3d;
      return;
    }
    const api: Visor3dDevApi = {
      ready: true,
      select: (key) =>
        paint(() => {
          choose(key);
        }),
      sceneOfStitches: async (n, unique) => {
        // Partes nuevas (sin mallas anteriores): la escena se arma completa (`buildScene`, subir y el primer frame).
        // Sobre el límite recomendado el armado va en un turno aparte: se espera al frame que ya la dibuja.
        const t0 = performance.now();
        source.set(sceneOfStitches(data.demos[0]!.pattern, n, unique === true));
        let end = await h.nextPaint();
        for (let i = 0; i < 600 && h.controller.status.updating; i++) end = await h.nextPaint();
        h.frame();
        const st = h.renderer.stats();
        return { ms: end - t0, stitches: st.stitches, parts: st.parts };
      },
      editToPaint: () =>
        paint(() => {
          plateau.current = plateau.current === 30 ? 31 : 30;
          const p = source.getSnapshot();
          const old = p.parts[0]!;
          const copies = old.copies;
          const part: Part = { ...structuredClone(data.editParts[plateau.current as 30 | 31]), id: old.id, name: old.name, ...(copies ? { copies } : {}) };
          source.set(replacePart0(p, part));
        }),
      recolorToPaint: () =>
        paint(() => {
          recolored.current = !recolored.current;
          const p = source.getSnapshot();
          const part = structuredClone(p.parts[0]!);
          const r = part.rounds[Math.min(14, part.rounds.length - 1)]!;
          r.items = recolored.current ? [{ type: "color", yarn: "B" }, ...r.items, { type: "color", yarn: part.startYarn }] : r.items.filter((it) => it.type !== "color");
          source.set(replacePart0(p, part));
        }),
      looksToPaint: (key, hex) =>
        paint(() => {
          const p = source.getSnapshot();
          const sample = FIBER_SAMPLES[key] ?? FIBER_SAMPLES.algodon!;
          const y0 = p.yarns[0]!;
          source.set({ ...p, yarns: [{ ...y0, composition: sample.composition, color: hex ? { hex } : y0.color }, ...p.yarns.slice(1)] });
        }),
      flatToPaint: (flat) => paint(() => controls.setFlatColors(flat)),
      hoverToPaint: (hex) => paint(() => controls.previewYarn(0, hex ? { color: { hex } } : null)),
      setVariant: async (v) => {
        await paint(() => h.renderer.setMaterialVariant(v));
      },
      setLod: async (l) => {
        await paint(() => h.renderer.setLod(l));
      },
      orbit: (ms) =>
        new Promise((resolve) => {
          const deltas: number[] = [];
          const start = performance.now();
          let last = start;
          const cam = h.camera;
          const target = h.orbit.target.clone();
          const r0 = cam.position.clone().sub(target);
          const step = () => {
            const now = performance.now();
            if (now !== last) deltas.push(now - last);
            last = now;
            const angle = ((now - start) / 4000) * Math.PI * 2;
            const x = r0.x * Math.cos(angle) + r0.z * Math.sin(angle);
            const z = -r0.x * Math.sin(angle) + r0.z * Math.cos(angle);
            cam.position.set(target.x + x, target.y + r0.y, target.z + z);
            cam.lookAt(target);
            h.renderer.renderNow(false);
            if (now - start < ms) requestAnimationFrame(step);
            else {
              deltas.shift();
              const total = deltas.reduce((a, b) => a + b, 0);
              resolve({ frames: deltas.length, fps: total ? (deltas.length * 1000) / total : 0, p50: q(deltas, 0.5), p95: q(deltas, 0.95), max: Math.max(0, ...deltas) });
            }
          };
          requestAnimationFrame(step);
        }),
      renderCost: (k) => {
        const xs: number[] = [];
        for (let i = 0; i < k; i++) xs.push(h.renderer.renderNow(true));
        return { p50: q(xs, 0.5), p95: q(xs, 0.95) };
      },
      neutralVsBase: () => {
        const gl = h.gl.getContext();
        const w = gl.drawingBufferWidth;
        const hh = gl.drawingBufferHeight;
        const read = () => {
          h.renderer.renderNow(false);
          const px = new Uint8Array(w * hh * 4);
          gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return px;
        };
        h.renderer.setMaterialVariant("fiber");
        const a = read();
        h.renderer.setMaterialVariant("base");
        const b = read();
        h.renderer.setMaterialVariant("fiber");
        h.renderer.renderNow(false);
        let differing = 0;
        let maxDelta = 0;
        let lit = 0;
        const bg = [a[0], a[1], a[2]];
        for (let i = 0; i < a.length; i += 4) {
          let d = 0;
          for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a[i + k]! - b[i + k]!));
          if (d > 0) differing++;
          if (d > maxDelta) maxDelta = d;
          if (a[i] !== bg[0] || a[i + 1] !== bg[1] || a[i + 2] !== bg[2]) lit++;
        }
        return { pixels: w * hh, differing, maxDelta, lit };
      },
      stats: () => ({ visor: h.renderer.stats(), controlador: { ...h.controller.counters } }),
      status: () => {
        const s = h.controller.status;
        return { mode: s.mode, updating: s.updating, stitches: s.stitches, policy: s.policy, flatColors: s.flatColors, notes: s.notes.map((n) => n.code) };
      },
      loseContext: () => h.loseContext(),
      restoreContext: () => h.restoreContext(),
    };
    window.__loopitaVisor3d = api;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="grid gap-1">
          <span className="font-semibold">Patrón</span>
          <select className="rounded border border-borde px-2 py-1" value={demo} onChange={(e) => choose(e.target.value)} data-testid="visor-3d-demo">
            {DEMOS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-semibold">Fibra de la lana A</span>
          <select
            className="rounded border border-borde px-2 py-1"
            value={fiber}
            data-testid="visor-3d-fibra"
            onChange={(e) => {
              setFiber(e.target.value);
              void window.__loopitaVisor3d?.looksToPaint(e.target.value);
            }}
          >
            {Object.entries(FIBER_SAMPLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="rounded border border-borde px-2 py-1" onClick={() => void window.__loopitaVisor3d?.editToPaint()}>
          Editar una vuelta
        </button>
        <button type="button" className="rounded border border-borde px-2 py-1" onClick={() => void window.__loopitaVisor3d?.recolorToPaint()}>
          Cambiar la lana de una vuelta
        </button>
        <button
          type="button"
          className="rounded border border-borde px-2 py-1"
          onMouseEnter={() => controls.previewYarn(0, { color: { hex: "#25A8A6" } })}
          onMouseLeave={() => controls.previewYarn(0, null)}
          onFocus={() => controls.previewYarn(0, { color: { hex: "#25A8A6" } })}
          onBlur={() => controls.previewYarn(0, null)}
        >
          Pasa el cursor: vista previa en turquesa
        </button>
      </div>
      <AmigurumiViewerLoader source={source} controls={controls} perf={perf} onHandle={onHandle} forceNoWebGL={noWebGL} />
    </div>
  );
}

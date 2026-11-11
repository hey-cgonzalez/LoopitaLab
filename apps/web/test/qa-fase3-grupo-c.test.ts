import { NO_STITCH, stitchTotal, validatePattern, yarnUsage, type ChartPattern, type WeightCategory, type Yarn } from "@loopitalab/pattern-core";
import type { RendererOptions, StitchRenderer, YarnLook } from "@loopitalab/stitch-render";
import { estimateYarnLength, PALETTE } from "@loopitalab/yarn-catalog";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previewControls } from "@/components/studio/preview-controls.ts";
import { PreviewEngine } from "@/components/studio/preview-engine.ts";
import { gaugeInUse, lengthLowConfidence } from "@/lib/studio/measures.ts";
import { yarnLengthReport } from "@/lib/studio/metraje.ts";
import { DocumentStore, type EditAction } from "@/lib/studio/store.ts";
import { prepareUserYarn, SAVED_NOTE_MAX } from "@/lib/yarns/saved.ts";

/*
 * QA del grupo C de la fase 3 (T8 a T11). Propiedades con semilla (mulberry32, `SEED` como en el núcleo, ADR 0002):
 *  - `yarnLengthReport` es consistente con `yarnUsage` + `estimateYarnLength` en documentos `savable` al azar;
 *  - la vista previa al pasar el cursor (`previewYarn`, por el motor y por `previewControls`) nunca cambia el
 *    documento ni el historial, aunque se intercale con ediciones reales (CA3-P4);
 *  - bordes de "Mis lanas": nota de exactamente 200 / 201 puntos de código, fibra desconocida y mezcla con mohair.
 */

const SEED = Number(process.env.SEED ?? 20261111);
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
  return { next, int, pick, bool: (p = 0.5) => next() < p };
}
type R = ReturnType<typeof rng>;

const FIBER_POOL = ["lana", "mohair", "algodon", "seda", "alpaca", "acrilico", "fibra-rara"] as const;
function genYarn(r: R, i: number): Yarn {
  const fibers = r.bool(0.6) ? [r.pick(FIBER_POOL)] : [...new Set([r.pick(FIBER_POOL), r.pick(FIBER_POOL)])];
  const composition =
    fibers.length === 1 ? [{ fiber: fibers[0]!, percent: 100 }] : [{ fiber: fibers[0]!, percent: 70 }, { fiber: fibers[1]!, percent: 30 }];
  const p = r.bool(0.5) ? r.pick(PALETTE) : null;
  return {
    id: String.fromCharCode(65 + i),
    weight: r.int(0, 7) as WeightCategory,
    composition,
    color: p ? { hex: p.hex, paletteId: p.id } : { hex: `#${r.int(0, 0xffffff).toString(16).padStart(6, "0").toUpperCase()}` },
  };
}

/** Documento de gráfico al azar; puede no ser `savable` (muestra rara): la propiedad filtra con `validatePattern`. */
function genDoc(r: R): ChartPattern {
  const n = r.int(1, 6);
  const width = r.int(1, 14);
  const height = r.int(1, 10);
  const cells = Array.from({ length: width * height }, () => (r.bool(0.1) ? NO_STITCH : r.int(0, n - 1)));
  const mode = r.int(0, 5);
  if (mode === 0) cells.fill(NO_STITCH);
  if (mode === 1) for (let x = 0; x < width; x++) cells[x] = NO_STITCH; // una fila entera sin punto (borrador)
  const gaugeChoice = r.int(0, 4);
  const gauge =
    gaugeChoice === 0
      ? undefined
      : gaugeChoice === 1
        ? { stitchesPer10cm: r.pick([0.5, 1, 7.5, 18, 22, 28, 40, 80]), rowsPer10cm: r.pick([1, 24, 30, 55]) }
        : gaugeChoice === 2
          ? { stitchesPer10cm: r.pick([0, -3, Number.NaN]), rowsPer10cm: 30 } // inválida: no debería ser savable
          : undefined;
  return {
    schemaVersion: 1,
    id: "p",
    title: "Prueba",
    technique: r.bool(0.85) ? "knit" : "crochet",
    kind: "chart",
    yarns: Array.from({ length: n }, (_, i) => genYarn(r, i)),
    origin: { kind: "manual" },
    ...(gauge ? { gauge } : {}),
    chart: {
      width,
      height,
      cells,
      repeat: { x: r.int(1, 30), y: r.int(1, 30) },
      workedIn: r.bool() ? "rounds" : "rows",
      renderAs: r.pick(["flat", "tube", "circle"] as const),
      direction: r.bool() ? "bottom_up" : "top_down",
    },
  } as ChartPattern;
}

const ORDER = ["assumed_gauge", "low_confidence_weight", "loop_factor", "float_slack", "waste_margin"] as const;

describe("propiedad: yarnLengthReport = yarnUsage + estimateYarnLength (documentos savable al azar)", () => {
  it("puntos, estimaciones, total, supuestos y rótulos coinciden con el motor y el catálogo (400 casos)", () => {
    const r = rng(SEED);
    let checked = 0;
    let knitWithEstimate = 0;
    for (let i = 0; i < 600 && checked < 400; i++) {
      const doc = genDoc(r);
      if (!validatePattern(doc).savable) continue;
      checked++;
      const ctx = `semilla ${SEED}, caso ${i}`;
      const rep = expectNoThrow(() => yarnLengthReport(doc), ctx);
      const usage = yarnUsage(doc.chart, doc.yarns.length);
      const use = gaugeInUse(doc);

      expect(rep.technique, ctx).toBe(doc.technique);
      expect(rep.rows.map((x) => x.id), ctx).toEqual(doc.yarns.map((y) => y.id));
      expect(rep.rows.map((x) => x.stitches), ctx).toEqual(usage.stitches);
      expect(rep.rows.reduce((t, x) => t + x.stitches, 0), ctx).toBe(stitchTotal(doc.chart));
      expect(rep.noGauge, ctx).toBe(use === null);
      expect(rep.gaugeAssumed, ctx).toBe(doc.gauge === undefined && use !== null);

      rep.rows.forEach((row, k) => {
        const u = { stitches: usage.stitches[k] ?? 0, floatStitches: usage.floatStitches[k] ?? 0 };
        if (doc.technique === "crochet" || !use) {
          expect(row.estimate, `${ctx} lana ${k}: sin estimación`).toBeUndefined();
          return;
        }
        const expected = estimateYarnLength(u, use.gauge, { technique: "knit", gaugeAssumed: use.assumed, lowConfidence: lengthLowConfidence(use, doc.yarns[k]!.weight) });
        expect(row.estimate, `${ctx} lana ${k}`).toEqual(expected);
        const e = row.estimate!;
        expect(e.low <= e.meters && e.meters <= e.high, `${ctx} lana ${k}: low ≤ m ≤ high`).toBe(true);
        for (const v of [e.meters, e.low, e.high]) expect(v % 5, `${ctx} múltiplo de 5`).toBe(0);
        expect(e.assumptions.includes("assumed_gauge"), ctx).toBe(use.assumed);
        expect(e.assumptions.includes("float_slack"), ctx).toBe(u.floatStitches > 0);
        expect(u.stitches === 0 && u.floatStitches === 0 ? e.meters === 0 : e.meters > 0, `${ctx} metros 0 solo sin puntos`).toBe(true);
        knitWithEstimate++;
      });

      const all = rep.rows.every((x) => x.estimate !== undefined);
      if (all && rep.rows.length > 0) {
        expect(rep.total, ctx).toEqual({
          meters: rep.rows.reduce((t, x) => t + x.estimate!.meters, 0),
          low: rep.rows.reduce((t, x) => t + x.estimate!.low, 0),
          high: rep.rows.reduce((t, x) => t + x.estimate!.high, 0),
        });
      } else expect(rep.total, ctx).toBeUndefined();

      const union = new Set(rep.rows.flatMap((x) => x.estimate?.assumptions ?? []));
      expect(rep.assumptions, ctx).toEqual(ORDER.filter((a) => union.has(a)));
      // Nunca gramos ni ovillos: el informe no tiene más campos que los del contrato.
      expect(JSON.stringify(rep), ctx).not.toMatch(/gram|ovillo|skein|ball/i);
    }
    expect(checked, "casos savable generados").toBeGreaterThanOrEqual(300);
    expect(knitWithEstimate, "casos con estimación").toBeGreaterThan(200);
  });

  it("duplicar repeat.y en redondo duplica puntos y no baja los metros de ninguna lana (monotonía)", () => {
    const r = rng(SEED + 7);
    let n = 0;
    for (let i = 0; i < 300 && n < 150; i++) {
      const doc = genDoc(r);
      if (!validatePattern(doc).savable || doc.technique !== "knit") continue;
      const twice: ChartPattern = { ...doc, chart: { ...doc.chart, workedIn: "rounds", repeat: { ...doc.chart.repeat, y: doc.chart.repeat.y * 2 } } };
      const once: ChartPattern = { ...doc, chart: { ...doc.chart, workedIn: "rounds" } };
      if (!validatePattern(twice).savable) continue;
      n++;
      const a = yarnLengthReport(once);
      const b = yarnLengthReport(twice);
      a.rows.forEach((row, k) => {
        expect(b.rows[k]!.stitches).toBe(row.stitches * 2);
        if (row.estimate) expect(b.rows[k]!.estimate!.meters).toBeGreaterThanOrEqual(row.estimate.meters);
      });
    }
    expect(n).toBeGreaterThan(50);
  });
});

function expectNoThrow<T>(fn: () => T, ctx: string): T {
  try {
    return fn();
  } catch (e) {
    throw new Error(`${ctx}: yarnLengthReport lanzó con un documento savable: ${(e as Error).message}`);
  }
}

// ------------------------------------------------------------------ CA3-P4: vista previa sin tocar documento ni historial

function stubRenderer() {
  const frames: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => (frames.push(cb), frames.length));
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  let opts: RendererOptions = {};
  let scheduled = false;
  const r = {
    setLayout: vi.fn(),
    invalidate: vi.fn(),
    setLooks: vi.fn<(l: readonly YarnLook[]) => void>(),
    setPreviewOverride: vi.fn<(o: { yarn: number; look: YarnLook } | null) => void>(),
    setHighlightRow: vi.fn(),
    setView: vi.fn(),
    getView: () => ({ zoom: 1, panX: 0, panY: 0 }),
    resize: vi.fn(),
    destroy: vi.fn(),
    flush: vi.fn(() => null),
    requestRender: vi.fn(() => {
      if (scheduled) return;
      scheduled = true;
      opts.schedule?.(() => {
        scheduled = false;
        r.flush();
      });
    }),
  };
  const make = (_c: HTMLCanvasElement, o: RendererOptions) => ((opts = o), r as unknown as StitchRenderer);
  const frame = () => {
    for (const cb of frames.splice(0)) cb();
  };
  return { r, make, frame };
}

afterEach(() => vi.unstubAllGlobals());

function savableDoc(r: R): ChartPattern {
  for (;;) {
    const d = genDoc(r);
    if (validatePattern(d).savable) return d;
  }
}

function randomEdit(r: R, doc: ChartPattern): EditAction {
  const c = doc.chart;
  switch (r.int(0, 3)) {
    case 0:
      return { type: "paint", refs: [{ x: r.int(0, c.width - 1), y: r.int(0, c.height - 1) }], value: r.int(0, doc.yarns.length - 1) };
    case 1:
      return { type: "repeat", x: r.int(1, 12), y: r.int(1, 12) };
    case 2:
      return { type: "updateYarn", index: r.int(0, doc.yarns.length - 1), yarn: { ...doc.yarns[0]!, id: doc.yarns[0]!.id, color: { hex: "#0A0B0C" } } };
    default:
      return { type: "setShape", renderAs: r.pick(["flat", "tube", "circle"] as const) };
  }
}

function randomCandidate(r: R) {
  const hex = `#${r.int(0, 0xffffff).toString(16).padStart(6, "0").toUpperCase()}`;
  return r.bool(0.3) ? { color: { hex }, composition: [{ fiber: r.pick(FIBER_POOL), percent: 100 }] } : { color: { hex } };
}

describe("propiedad CA3-P4: la vista previa al pasar el cursor nunca cambia el documento ni el historial", () => {
  it("intercalada con ediciones reales, por el motor y por previewControls (120 secuencias con semilla)", () => {
    const r = rng(SEED + 3);
    for (let s = 0; s < 120; s++) {
      const ctx = `semilla ${SEED + 3}, secuencia ${s}`;
      const st = stubRenderer();
      const store = new DocumentStore(savableDoc(r));
      const engine = new PreviewEngine(st.make);
      engine.attach({} as HTMLCanvasElement);
      engine.connect(store);
      // previewControls(store) es la vía real de los manejadores del selector (yarn-picker-ui.ts).
      const controls = previewControls(store);
      const unbind = controls.bind(engine);
      st.frame();
      const listener = vi.fn();
      store.subscribe(listener);
      let notifications = 0;
      let edits = 0;

      for (let step = 0; step < 40; step++) {
        if (r.bool(0.25)) {
          const changed = store.dispatch(randomEdit(r, store.doc));
          if (changed) {
            edits++;
            notifications++;
          }
          st.frame();
          continue;
        }
        const docBefore = store.doc;
        const stateBefore = store.getState();
        const yarnsJson = JSON.stringify(store.doc.yarns);
        const idx = r.bool(0.1) ? r.pick([-1, 99, 1.5, Number.NaN]) : r.int(0, store.doc.yarns.length - 1);
        const cand = r.bool(0.2) ? null : randomCandidate(r);
        if (r.bool()) engine.previewYarn(idx, cand);
        else controls.previewYarn(idx, cand);
        if (r.bool(0.7)) st.frame();
        expect(store.doc, `${ctx} paso ${step}: misma referencia`).toBe(docBefore);
        expect(store.getState(), `${ctx} paso ${step}: mismo estado (revisión e historial)`).toBe(stateBefore);
        expect(JSON.stringify(store.doc.yarns), `${ctx} paso ${step}: lanas intactas`).toBe(yarnsJson);
        expect(listener.mock.calls.length, `${ctx} paso ${step}: no avisa al almacén`).toBe(notifications);
      }
      controls.previewYarn(0, null);
      st.frame();
      // Deshacer todas las ediciones reales deja el historial vacío: ninguna vista previa agregó pasos.
      let undos = 0;
      while (store.undo()) undos++;
      expect(undos, ctx).toBe(Math.min(edits, 100));
      expect(store.getState().canUndo, ctx).toBe(false);
      unbind();
    }
  });
});

// ------------------------------------------------------------------ Mis lanas: bordes

describe("Mis lanas: bordes de la nota y de la composición", () => {
  const base = { weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#123456" } };

  it("nota de exactamente 200 puntos de código entra; 201 es NOTE_TOO_LONG; con emojis cuenta puntos de código, no unidades UTF-16", () => {
    expect(prepareUserYarn({ ...base, note: "a".repeat(SAVED_NOTE_MAX) })).toMatchObject({ ok: true });
    expect(prepareUserYarn({ ...base, note: "a".repeat(SAVED_NOTE_MAX + 1) })).toMatchObject({ ok: false, code: "NOTE_TOO_LONG" });
    // 200 emojis son 400 unidades UTF-16 pero 200 caracteres para Postgres (char_length): debe entrar.
    expect(prepareUserYarn({ ...base, note: "🧶".repeat(SAVED_NOTE_MAX) })).toMatchObject({ ok: true });
    const cut = prepareUserYarn({ ...base, note: "🧶".repeat(SAVED_NOTE_MAX + 5) }, { truncateNote: true });
    expect(cut.ok && [...(cut.row.note ?? "")].length).toBe(SAVED_NOTE_MAX);
    // Espacios alrededor no cuentan (se recortan antes de medir).
    expect(prepareUserYarn({ ...base, note: `  ${"b".repeat(SAVED_NOTE_MAX)}  ` })).toMatchObject({ ok: true });
  });

  it("fibra desconocida: entra con aviso (no bloquea); mezcla 70/30 con mohair entra sin avisos; 70/31 no", () => {
    const unknown = prepareUserYarn({ ...base, composition: [{ fiber: "ortiga-del-himalaya", percent: 100 }] });
    expect(unknown.ok).toBe(true);
    expect(unknown.ok && unknown.warnings.length).toBeGreaterThan(0);
    const mix = prepareUserYarn({ ...base, composition: [{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 30 }] });
    expect(mix).toMatchObject({ ok: true, warnings: [] });
    expect(prepareUserYarn({ ...base, composition: [{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 31 }] })).toMatchObject({ ok: false, code: "INVALID_YARN" });
    // Borde de la tolerancia (100 ± 0,01).
    expect(prepareUserYarn({ ...base, composition: [{ fiber: "lana", percent: 69.995 }, { fiber: "mohair", percent: 30 }] }).ok).toBe(true);
    expect(prepareUserYarn({ ...base, composition: [{ fiber: "lana", percent: 69.98 }, { fiber: "mohair", percent: 30 }] }).ok).toBe(false);
  });
});


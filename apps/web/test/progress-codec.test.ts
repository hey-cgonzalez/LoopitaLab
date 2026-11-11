import { clampPointer, planChart, startPointer, type ChartPlan } from "@loopitalab/follow";
import { newChartPattern } from "@loopitalab/pattern-core";
import { describe, expect, it } from "vitest";
import { columnsToPointer, columnsToRawPointer, MAX_ROW_NUMBER, MAX_STITCH_INDEX, parseClientPointer, pointerToColumns } from "@/lib/projects/progress-codec";
import { positionText, progressConflictMessage, rowWord, versionChangedMessage } from "@/lib/projects/messages";

/** Generador con semilla (mulberry32): las propiedades son reproducibles. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = Number(process.env.SEED ?? 20261111);

const yarns = [
  { id: "A", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } },
  { id: "B", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
];
function planOf(r: () => number): ChartPlan {
  const doc = newChartPattern({
    id: "p",
    title: "t",
    width: 1 + Math.floor(r() * 12),
    height: 1 + Math.floor(r() * 12),
    repeat: { x: 1 + Math.floor(r() * 5), y: 1 + Math.floor(r() * 5) },
    workedIn: r() < 0.5 ? "rounds" : "rows",
    renderAs: "flat",
    direction: "bottom_up",
    yarns,
  });
  return planChart(doc, { mirror: r() < 0.5 });
}

describe("códec del puntero (ADR 0009)", () => {
  it("ida y vuelta: columnsToPointer(pointerToColumns(p)) es p para todo puntero acotado al plan (200 casos con semilla)", () => {
    const r = rng(SEED);
    for (let i = 0; i < 200; i++) {
      const plan = planOf(r);
      const raw = { rowsDone: Math.floor(r() * (plan.totalRows + 5)), stitchesDone: Math.floor(r() * (plan.totalStitches + 5)) };
      const p = clampPointer(plan, raw);
      expect(columnsToPointer(plan, pointerToColumns(p))).toEqual(p);
    }
  });

  it("las columnas cumplen los CHECK de la base: round_number >= 1, stitch_index >= 0 y las cotas generales", () => {
    const r = rng(SEED + 1);
    for (let i = 0; i < 200; i++) {
      const plan = planOf(r);
      const p = clampPointer(plan, { rowsDone: Math.floor(r() * 3000), stitchesDone: Math.floor(r() * 3000) });
      const c = pointerToColumns(p);
      expect(c.round_number).toBe(p.rowsDone + 1);
      expect(c.round_number).toBeGreaterThanOrEqual(1);
      expect(c.round_number).toBeLessThanOrEqual(plan.totalRows + 1);
      expect(c.round_number).toBeLessThanOrEqual(MAX_ROW_NUMBER);
      expect(c.stitch_index).toBeGreaterThanOrEqual(0);
      expect(c.stitch_index).toBeLessThanOrEqual(MAX_STITCH_INDEX);
    }
  });

  it("decodificar siempre da un puntero acotado al plan, aunque la fila esté dañada o fuera de rango", () => {
    const r = rng(SEED + 2);
    const weird: unknown[] = [0, -5, 1.7, NaN, Infinity, -Infinity, "3", null, undefined, {}, [], 1e12, Number.MAX_SAFE_INTEGER];
    for (let i = 0; i < 300; i++) {
      const plan = planOf(r);
      const pick = () => (r() < 0.5 ? weird[Math.floor(r() * weird.length)] : Math.floor(r() * 5000));
      const p = columnsToPointer(plan, { round_number: pick(), stitch_index: pick() });
      expect(clampPointer(plan, p)).toEqual(p); // idempotente: ya está acotado
      expect(p.rowsDone).toBeGreaterThanOrEqual(0);
      expect(p.rowsDone).toBeLessThanOrEqual(plan.totalRows);
    }
  });

  it("sin fila de avance (null, undefined o columnas nulas) es el inicio", () => {
    const plan = planOf(rng(1));
    expect(columnsToPointer(plan, null)).toEqual(startPointer());
    expect(columnsToPointer(plan, undefined)).toEqual(startPointer());
    expect(columnsToPointer(plan, { round_number: null, stitch_index: null })).toEqual(startPointer());
    expect(columnsToRawPointer(null)).toEqual({ rowsDone: 0, stitchesDone: 0 });
  });

  it("round_number = totalRows + 1 es el gráfico terminado", () => {
    const plan = planOf(rng(7));
    const p = columnsToPointer(plan, { round_number: plan.totalRows + 1, stitch_index: 0 });
    expect(p).toEqual({ rowsDone: plan.totalRows, stitchesDone: 0 });
  });

  it("parseClientPointer acepta solo dos enteros dentro de las cotas generales", () => {
    expect(parseClientPointer({ rowsDone: 0, stitchesDone: 0 })).toEqual({ rowsDone: 0, stitchesDone: 0 });
    expect(parseClientPointer({ rowsDone: 100_000, stitchesDone: 100_000 })).toEqual({ rowsDone: 100_000, stitchesDone: 100_000 });
    expect(parseClientPointer({ rowsDone: 100_001, stitchesDone: 0 })).toBeNull();
    expect(parseClientPointer({ rowsDone: 0, stitchesDone: 100_001 })).toBeNull();
    // Campos extra se descartan: lo que sale tiene solo los dos campos.
    expect(parseClientPointer({ rowsDone: 2, stitchesDone: 1, device: "x", __proto__: { a: 1 } })).toEqual({ rowsDone: 2, stitchesDone: 1 });
    const r = rng(SEED + 3);
    for (let i = 0; i < 200; i++) {
      const v = (): unknown => [NaN, 1.5, -1, "2", null, undefined, true, {}, 2n, 1e20][Math.floor(r() * 10)];
      expect(parseClientPointer({ rowsDone: v(), stitchesDone: 0 })).toBeNull();
      expect(parseClientPointer({ rowsDone: 0, stitchesDone: v() })).toBeNull();
    }
    for (const bad of [null, undefined, 3, "x", [], [0, 0]]) expect(parseClientPointer(bad)).toBeNull();
  });

  it("los códigos que acepta parseClientPointer entran en las columnas válidas (cota superior incluida)", () => {
    const c = pointerToColumns(parseClientPointer({ rowsDone: 100_000, stitchesDone: 100_000 })!);
    expect(c).toEqual({ round_number: MAX_ROW_NUMBER, stitch_index: MAX_STITCH_INDEX });
  });
});

describe("textos con «vuelta» o «fila» (C2)", () => {
  it("rowWord y positionText siguen workedIn", () => {
    expect(rowWord("rounds")).toBe("vuelta");
    expect(rowWord("rows")).toBe("fila");
    expect(rowWord(undefined)).toBe("vuelta");
    expect(positionText("rounds", 100, { rowsDone: 39, stitchesDone: 0 })).toBe("la vuelta 40");
    expect(positionText("rows", 10, { rowsDone: 3, stitchesDone: 0 })).toBe("la fila 4");
    expect(positionText("rows", 10, { rowsDone: 10, stitchesDone: 0 })).toBe("el gráfico terminado");
    expect(positionText("rows", 0, { rowsDone: 0, stitchesDone: 0 })).toBe("la fila 1");
  });

  it("los mensajes de conflicto y de versión nunca mezclan las palabras", () => {
    const a = { rowsDone: 39, stitchesDone: 0 };
    const b = { rowsDone: 35, stitchesDone: 0 };
    expect(progressConflictMessage("rounds", 100, a, b)).toBe("En otro dispositivo vas en la vuelta 40. Aquí vas en la vuelta 36. ¿Con cuál sigues?");
    const rows = progressConflictMessage("rows", 100, a, b);
    expect(rows).toContain("fila 40");
    expect(rows).not.toContain("vuelta");
    expect(versionChangedMessage("rows", 100, a)).toContain("fila 40");
    expect(versionChangedMessage("rows", 100, a)).not.toContain("vuelta");
  });
});

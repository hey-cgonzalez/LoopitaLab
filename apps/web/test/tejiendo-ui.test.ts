import { NO_STITCH, newChartPattern, type ChartPattern, type NewChartInput } from "@loopitalab/pattern-core";
import { nextRepeat, nextRow, planChart, position, startPointer, stepAt } from "@loopitalab/follow";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTextTarget, knitKeyAction } from "@/lib/projects/knit-keys.ts";
import { buildKnitPreview, knitDocument, notInChartFor } from "@/lib/projects/knit-preview.ts";
import {
  PROJECT_TEXTS,
  conflictQuestionText,
  finishedText,
  progressSummaryText,
  relativeTimeText,
  motifText,
  repeatCellsText,
  repeatCounterText,
  rowAnnouncement,
  rowCounterText,
  runsSpoken,
  runsText,
  shapingText,
  sideAndReadingText,
  workShapeText,
} from "@/lib/projects/texts.ts";
import { WAKE_LOCK_STORAGE_KEY, readWakeLockPreference, requestWakeLock, wakeLockSupported, writeWakeLockPreference } from "@/lib/projects/wake-lock.ts";
import { createProjectsDb } from "./support/projects-db.ts";
import { USER } from "./support/supabase-mock.ts";

/*
 * T12: textos (vuelta/fila, lado y sentido, "casilla N de M", "Gráfico terminado", conflicto con hora relativa),
 * teclado y pasapáginas, pantalla encendida, render estático de la pantalla previa y de "Tejiendo", y `deleteProject`.
 */

const db = createProjectsDb(USER);
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.admin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const yarns = [
  { id: "A", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } },
  { id: "B", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
];
const PID = "aaaaaaaa-0000-4000-8000-000000000001";
function doc(over: Partial<Omit<NewChartInput, "id">> = {}, cells?: number[]): ChartPattern {
  const d = newChartPattern({ id: PID, title: "Gorro de prueba", width: 4, height: 3, repeat: { x: 2, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns, ...over });
  if (cells) d.chart.cells = cells;
  return d;
}
const A = 0;
const B = 1;
const X = NO_STITCH;

describe("textos: vuelta o fila según workedIn (F3-9)", () => {
  it("contador, resumen y anuncio", () => {
    expect(rowCounterText("rounds", 12, 60)).toBe("Vuelta 12 de 60");
    expect(rowCounterText("rows", 12, 60)).toBe("Fila 12 de 60");
    expect(progressSummaryText("rows", 60, { rowsDone: 11, stitchesDone: 0 })).toBe("Fila 12 de 60");
    expect(progressSummaryText("rounds", 60, { rowsDone: 60, stitchesDone: 0 })).toBe("Gráfico terminado");
    expect(rowAnnouncement("rows", 3, 9, [{ yarn: 0, count: 3 }, { yarn: 1, count: 2 }])).toBe("Fila 3 de 9: 3 de la lana A, 2 de la lana B");
    expect(rowAnnouncement("rounds", 3, 9, [])).toBe("Vuelta 3 de 9");
    expect(workShapeText("rows", "top_down", "flat", 12)).toBe("Ida y vuelta, de arriba hacia abajo: 12 filas en total (plano).");
    expect(workShapeText("rounds", "bottom_up", "circle", 1)).toContain("1 vuelta en total");
  });

  it("lado y sentido (F3-10): nunca «se invierten» ni «punto revés»", () => {
    expect(sideAndReadingText("right", "right_to_left")).toBe("por el derecho, de derecha a izquierda");
    expect(sideAndReadingText("wrong", "left_to_right")).toBe("por el revés, de izquierda a derecha");
    const all = JSON.stringify(PROJECT_TEXTS, (_k, v) => (typeof v === "function" ? v(3, 3) : v));
    expect(all).not.toMatch(/se invierten|punto revés|Pieza terminada/i);
    expect(PROJECT_TEXTS.tejiendo.coloresDelDerecho).toMatch(/se ven por el derecho/);
  });

  it("tramos (visual y hablado), repetición y «casillas N a M de T» (T18, R1 y R6)", () => {
    const runs = [{ yarn: 0, count: 3 }, { yarn: 1, count: 2 }, { yarn: 0, count: 3 }];
    expect(runsText(runs)).toBe("3 A · 2 B · 3 A");
    expect(runsSpoken(runs)).toBe("3 de la lana A, 2 de la lana B, 3 de la lana A");
    const many = Array.from({ length: 8 }, (_, i) => ({ yarn: i % 2, count: 1 }));
    expect(runsSpoken(many, 5)).toBe("1 de la lana A, 1 de la lana B, 1 de la lana A, 1 de la lana B, 1 de la lana A y 3 tramos más");
    expect(runsSpoken(many.slice(0, 6), 5)).toMatch(/y 1 tramo más$/);
    expect(repeatCounterText(2, 8)).toBe("repetición 3 de 8");
    expect(repeatCellsText({ first: 10, last: 18, of: 72 })).toBe("casillas 10 a 18 de 72");
    expect(repeatCellsText({ first: 3, last: 3, of: 8 })).toBe("casilla 3 de 8");
    expect(repeatCellsText({ first: 10, last: 18, of: 72 })).not.toMatch(/punto/);
  });

  it("disminuciones y aumentos: cuántos y dónde, sin nombrar la técnica (T18, R2 y R3)", () => {
    const dec = { decreases: 8, increases: 0, decreaseBefore: [3], increaseAt: [], stitchesPerRepeat: 8 };
    expect(shapingText("rows", dec, 8)).toEqual(["Disminuye 8 puntos en la fila (1 por repetición).", "Se pierde un punto antes de la casilla 3 de cada repetición."]);
    expect(shapingText("rounds", { ...dec, decreases: 1 }, 1)).toEqual(["Disminuye 1 punto en la vuelta.", "Se pierde un punto antes de la casilla 3 de la vuelta."]);
    expect(shapingText("rounds", { ...dec, decreases: 16, decreaseBefore: [3, 9] }, 8)[1]).toBe("Se pierde un punto antes de la casilla 3 y al final de cada repetición.");
    expect(shapingText("rounds", { ...dec, decreases: 16, decreaseBefore: [3, 3] }, 8)[1]).toBe("Se pierden puntos de cada repetición: 2 antes de la casilla 3.");
    const inc = { decreases: 0, increases: 12, decreaseBefore: [], increaseAt: [2, 5], stitchesPerRepeat: 6 };
    expect(shapingText("rounds", inc, 6)).toEqual(["Aumenta 12 puntos en la vuelta (2 por repetición).", "Las casillas 2 y 5 de cada repetición son puntos nuevos."]);
    expect(shapingText("rounds", { ...inc, increases: 6, increaseAt: [4] }, 6)[1]).toBe("La casilla 4 de cada repetición es un punto nuevo.");
    expect(shapingText("rounds", { ...inc, increases: 0, increaseAt: [] }, 6)).toEqual([]);
    expect(JSON.stringify([shapingText("rows", dec, 8), shapingText("rounds", inc, 6)])).not.toMatch(/juntos|2pjd|ssk/i);
  });

  it("«Gráfico terminado» según técnica, forma y dirección (T18, R4); nunca «Pieza terminada»", () => {
    const base = { technique: "knit" as const, workedIn: "rounds" as const, direction: "bottom_up" as const, renderAs: "circle", lastStitches: 8 };
    expect(finishedText(base)).toBe("Tejiste todas las vueltas del gráfico. Pasa la hebra por los 8 puntos y tira para cerrar la copa.");
    expect(finishedText({ ...base, renderAs: "tube" })).toBe("Tejiste todas las vueltas del gráfico. Quedan 8 puntos: ciérralos.");
    expect(finishedText({ ...base, workedIn: "rows", renderAs: "flat", lastStitches: 1 })).toBe("Tejiste todas las filas del gráfico. Queda 1 punto: ciérralo.");
    expect(finishedText({ ...base, direction: "top_down" })).toBe("Tejiste todas las vueltas del gráfico. Quedan 8 puntos en el borde: falta el elástico o borde y cerrarlos.");
    expect(finishedText({ ...base, technique: "crochet" })).toBe(`Tejiste todas las vueltas del gráfico. ${PROJECT_TEXTS.tejiendo.rematarCrochet}`);
    expect(finishedText({ ...base, lastStitches: null })).toBe("Tejiste todas las vueltas del gráfico. Falta rematar o cerrar la pieza.");
  });

  it("motivo (M7) y lo que el gráfico no incluye según la técnica (M1)", () => {
    expect(motifText(8, 8, 12, 1)).toBe("Motivo de 8 × 8, repetido 12 veces a lo ancho y sin repetir a lo alto.");
    expect(motifText(8, 8, 1, 1)).toBe("Motivo de 8 × 8, sin repetir.");
    expect(motifText(4, 3, 2, 5)).toBe("Motivo de 4 × 3, repetido 2 veces a lo ancho y repetido 5 veces a lo alto.");
    expect(notInChartFor("knit", "rows")).toEqual(["cast_on", "edging", "prior_shaping", "bind_off", "assembly"]);
    expect(notInChartFor("crochet", "rounds")).toEqual(["foundation", "prior_shaping", "fasten_off", "assembly"]);
    expect(notInChartFor("crochet", "rows")).toEqual(["foundation", "turning_chain", "prior_shaping", "fasten_off", "assembly"]);
  });

  it("T17, B3: el documento para Tejiendo no lleva las notas privadas y el original no cambia", () => {
    const d = doc();
    d.yarns[0]!.note = "la lana que me regaló mi tía";
    d.notes = ["nota privada"];
    const k = knitDocument(d);
    expect(k.yarns.every((y) => !("note" in y))).toBe(true);
    expect("notes" in k).toBe(false);
    expect(JSON.stringify(k)).not.toContain("tía");
    expect(d.yarns[0]!.note).toBe("la lana que me regaló mi tía");
    expect(k.chart).toEqual(d.chart);
    expect(k.yarns.map((y) => y.color)).toEqual(d.yarns.map((y) => y.color));
  });
});

describe("conflicto: las dos posiciones y la hora relativa (F3-41, O-2)", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  it("hora relativa", () => {
    expect(relativeTimeText("2026-11-11T11:59:50Z", now)).toBe("recién");
    expect(relativeTimeText("2026-11-11T11:57:00Z", now)).toBe("hace 3 min");
    expect(relativeTimeText("2026-11-11T10:00:00Z", now)).toBe("hace 2 h");
    expect(relativeTimeText("2026-11-10T11:00:00Z", now)).toBe("hace 1 día");
    expect(relativeTimeText("2026-11-07T12:00:00Z", now)).toBe("hace 4 días");
    expect(relativeTimeText("2026-11-11T11:57:00.123456+00:00", now)).toBe("hace 3 min");
    expect(relativeTimeText(null, now)).toBe("");
    expect(relativeTimeText("no es fecha", now)).toBe("");
    expect(relativeTimeText("2026-11-11T12:05:00Z", now), "reloj adelantado").toBe("recién");
  });
  it("pregunta en redondo, en ida y vuelta y con el gráfico terminado", () => {
    const at = "2026-11-11T11:57:00Z";
    expect(conflictQuestionText("rounds", 60, { rowsDone: 39, stitchesDone: 0 }, at, { rowsDone: 35, stitchesDone: 0 }, now)).toBe("En otro dispositivo vas en la vuelta 40 (hace 3 min). Aquí vas en la vuelta 36. ¿Con cuál sigues?");
    expect(conflictQuestionText("rows", 60, { rowsDone: 39, stitchesDone: 0 }, null, { rowsDone: 35, stitchesDone: 0 }, now)).toBe("En otro dispositivo vas en la fila 40. Aquí vas en la fila 36. ¿Con cuál sigues?");
    expect(conflictQuestionText("rows", 60, { rowsDone: 60, stitchesDone: 0 }, at, { rowsDone: 35, stitchesDone: 0 }, now)).toBe("En otro dispositivo ya terminaste el gráfico (hace 3 min). Aquí vas en la fila 36. ¿Con cuál sigues?");
  });
});

describe("teclado y pasapáginas Bluetooth", () => {
  it("flechas, Espacio, Enter y Av Pág avanzan; Retroceso y Re Pág retroceden; Mayús + flechas, por repetición", () => {
    for (const k of ["ArrowRight", "ArrowDown", " ", "Enter", "PageDown"]) expect(knitKeyAction(k), k).toBe("next-row");
    for (const k of ["ArrowLeft", "ArrowUp", "Backspace", "PageUp"]) expect(knitKeyAction(k), k).toBe("prev-row");
    expect(knitKeyAction("ArrowRight", { shift: true })).toBe("next-repeat");
    expect(knitKeyAction("ArrowUp", { shift: true })).toBe("prev-repeat");
    expect(knitKeyAction("PageDown", { shift: true }), "Mayús solo cambia las flechas").toBe("next-row");
    for (const k of ["a", "Tab", "Escape", "Home"]) expect(knitKeyAction(k)).toBeNull();
    for (const m of [{ ctrl: true }, { alt: true }, { meta: true }]) expect(knitKeyAction("ArrowRight", m)).toBeNull();
  });
  it("no se avanza con el foco en un campo de texto", () => {
    expect(isTextTarget("INPUT", false)).toBe(true);
    expect(isTextTarget("select", false)).toBe(true);
    expect(isTextTarget("DIV", true)).toBe(true);
    expect(isTextTarget("BUTTON", false)).toBe(false);
    expect(isTextTarget(undefined, false)).toBe(false);
  });
});

describe("pantalla encendida (Wake Lock)", () => {
  it("activada por defecto, se recuerda y degrada en silencio", async () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    expect(readWakeLockPreference(storage)).toBe(true);
    expect(readWakeLockPreference(null)).toBe(true);
    writeWakeLockPreference(storage, false);
    expect(map.get(WAKE_LOCK_STORAGE_KEY)).toBe("0");
    expect(WAKE_LOCK_STORAGE_KEY).toBe("loopitalab:tejiendo:pantalla");
    expect(readWakeLockPreference(storage)).toBe(false);
    writeWakeLockPreference(storage, true);
    expect(readWakeLockPreference(storage)).toBe(true);
    const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(readWakeLockPreference(throwing)).toBe(true);
    expect(() => writeWakeLockPreference(throwing, false)).not.toThrow();

    expect(wakeLockSupported(undefined)).toBe(false);
    expect(wakeLockSupported({})).toBe(false);
    expect(await requestWakeLock({})).toBeNull();
    expect(await requestWakeLock({ wakeLock: { request: async () => { throw new DOMException("NotAllowedError"); } } })).toBeNull();
    const sentinel = { release: async () => undefined };
    const request = vi.fn(async () => sentinel);
    expect(await requestWakeLock({ wakeLock: { request } })).toBe(sentinel);
    expect(request).toHaveBeenCalledWith("screen");
  });
});

describe("render estático: pantalla previa (F3-37, F3-39, F3-40)", () => {
  const render = async (d: ChartPattern) => {
    const { KnitPreviewView } = await import("@/components/knit/KnitPreviewView");
    return renderToStaticMarkup(createElement(KnitPreviewView, { preview: buildKnitPreview(d, "2026-11-11T10:00:00.000001+00:00") }));
  };
  it("muestra supuesta rotulada, forma de trabajo, metraje con rango, lo que no está en el gráfico y el aviso de prototipo", async () => {
    const html = await render(doc());
    expect(html).toContain("(supuesta)");
    expect(html).toContain("En redondo, de abajo hacia arriba: 3 vueltas en total (tubo).");
    expect(html).toMatch(/≈ [\d.,]+ m \(entre [\d.,]+ y [\d.,]+ m\), estimación/);
    expect(html).toContain("Solo del gráfico: no incluye elástico, montaje ni remate.");
    expect(html).toContain("Supuestos");
    for (const k of notInChartFor("knit", "rounds")) expect(html).toContain(PROJECT_TEXTS.noEnGrafico[k]);
    expect(html).not.toContain(PROJECT_TEXTS.noEnGrafico.foundation);
    expect(html).toContain("Motivo de 4 × 3, repetido 2 veces a lo ancho y sin repetir a lo alto.");
    expect(html).toContain("Prototipo digital");
    expect(html).toContain("Teje una muestra");
    expect(html).not.toContain("knit-preview-sewn");
    expect(html).not.toContain("knit-preview-warnings");
  });
  it("muestra propia: sin «supuesta»; crochet: sin estimación; tubo en filas: se cose", async () => {
    const own = await render(doc({ gauge: { stitchesPer10cm: 20, rowsPer10cm: 28 } }));
    expect(own).toContain("20 puntos × 28 vueltas en 10 cm");
    expect(await render(doc({ workedIn: "rows", gauge: { stitchesPer10cm: 20, rowsPer10cm: 28 } }))).toContain("20 puntos × 28 filas en 10 cm");
    expect(own).not.toContain("(supuesta)");
    const crochet = await render({ ...doc(), technique: "crochet" });
    expect(crochet).toContain("Sin estimación en crochet todavía");
    expect(crochet).not.toMatch(/≈ [\d.,]+ m/);
    expect(crochet).toContain(PROJECT_TEXTS.noEnGrafico.foundation);
    expect(crochet).not.toContain(PROJECT_TEXTS.noEnGrafico.cast_on);
    const sewn = await render(doc({ workedIn: "rows" }));
    expect(sewn).toContain("Se teje de ida y vuelta y se cose");
    expect(sewn).toContain("3 filas en total");
  });
  it("CHART_FLOAT_LONG: advertencia con el máximo y la sugerencia de enganchar, sin bloquear", async () => {
    const d = doc({ width: 12, height: 2, repeat: { x: 1, y: 1 } });
    d.chart.cells = d.chart.cells.map((_, i) => (i < 12 ? (i === 0 ? 0 : 1) : i % 2));
    const html = await render(d);
    expect(html).toContain("knit-preview-warnings");
    expect(html).toContain('data-issue-code="CHART_FLOAT_LONG"');
    expect(html).toMatch(/enganchar/);
    expect(html).toContain("no impiden tejer");
  });
});

describe("render estático: tarjeta de la fila de «Tejiendo»", () => {
  const card = async (d: ChartPattern, moves: ((p: ReturnType<typeof startPointer>, plan: ReturnType<typeof planChart>) => ReturnType<typeof startPointer>)[] = [], mirror = false) => {
    const { KnitRowCard } = await import("@/components/knit/KnitRowCard");
    const plan = planChart(d, { mirror });
    let p = startPointer();
    for (const m of moves) p = m(p, plan);
    return renderToStaticMarkup(createElement(KnitRowCard, { plan, position: position(plan, p), yarns: d.yarns, direction: d.chart.direction, renderAs: d.chart.renderAs, lastRowStitches: stepAt(plan, plan.totalRows - 1)?.stitches ?? null }));
  };
  const next = (p: ReturnType<typeof startPointer>, plan: ReturnType<typeof planChart>) => nextRow(plan, p);
  const rep = (p: ReturnType<typeof startPointer>, plan: ReturnType<typeof planChart>) => nextRepeat(plan, p);
  //                       fila 1        fila 2        fila 3
  const cells = [A, A, B, A, B, B, A, A, A, B, A, B];

  it("en redondo: «Vuelta 1 de 3», por el derecho, tramos en el orden en que se teje y repetición 1 de 2", async () => {
    const html = await card(doc({}, cells));
    expect(html).toContain("Vuelta 1 de 3");
    expect(html).toContain("por el derecho, de derecha a izquierda");
    // AABA leído de derecha a izquierda: 1 A · 1 B · 2 A (ADR 0007, enmienda T4-1).
    expect(html.match(/>(\d+ [AB])</g)?.map((m) => m.slice(1, -1))).toEqual(["1 A", "1 B", "2 A"]);
    expect(html).toContain("repetición 1 de 2");
    expect(html).not.toContain("knit-wrong-side-note");
    expect(html).not.toContain("knit-cell-counter");
    expect(html).toContain("background-color:#F4EBD9");
  });
  it("ida y vuelta, fila 2: «Fila 2 de 3», por el revés de izquierda a derecha, con la nota de colores del derecho", async () => {
    const html = await card(doc({ workedIn: "rows", renderAs: "flat" }, cells), [next]);
    expect(html).toContain("Fila 2 de 3");
    expect(html).not.toContain("Vuelta");
    expect(html).toContain("por el revés, de izquierda a derecha");
    expect(html).toContain("knit-wrong-side-note");
    expect(html.match(/>(\d+ [AB])</g)?.map((m) => m.slice(1, -1))).toEqual(["2 B", "2 A"]);
    expect(html).not.toMatch(/se invierten|punto revés/);
  });
  it("espejo (P15): cambia el sentido y el orden de los tramos, no los conteos", async () => {
    const html = await card(doc({}, cells), [], true);
    expect(html).toContain("por el derecho, de izquierda a derecha");
    expect(html.match(/>(\d+ [AB])</g)?.map((m) => m.slice(1, -1))).toEqual(["2 A", "1 B", "1 A"]);
    expect(html).toContain("Lectura en espejo");
  });
  it("fila con disminuciones: cuántas, dónde y «casillas N a M de T» de la repetición en curso (T18, R1 y R2)", async () => {
    const d = doc({ renderAs: "circle" }, [A, A, B, A, B, B, A, X, A, X, X, X]);
    const plan = planChart(d);
    const s = stepAt(plan, 1)!;
    expect(s.change).toBeLessThan(0);
    const html = await card(d, [next, rep]);
    expect(html).toContain("Vuelta 2 de 3");
    const cells = position(plan, nextRepeat(plan, nextRow(plan, startPointer()))).repeatCells!;
    expect(cells.first).toBe(s.stitchesPerRepeat + 1);
    expect(html).toContain(repeatCellsText(cells));
    expect(html).toContain("repetición 2 de 2");
    for (const t of shapingText("rounds", s, plan.repeatX)) expect(html).toContain(t);
    expect(html).toContain(`Disminuye ${s.decreases} `);
  });
  it("con una sola repetición no se muestra el rango de casillas (T18, R1)", async () => {
    const d = doc({ renderAs: "circle", repeat: { x: 1, y: 1 } }, [A, A, B, A, B, B, A, X, A, X, X, X]);
    const html = await card(d, [next]);
    expect(html).toContain("knit-shaping");
    expect(html).not.toContain("knit-cell-counter");
  });
  it("terminado: «Gráfico terminado» con los puntos que quedan; nunca «Pieza terminada»", async () => {
    const d = doc({ renderAs: "circle" }, [A, A, B, A, B, B, A, X, A, X, X, X]);
    const last = stepAt(planChart(d), 2)!.stitches;
    const html = await card(d, [next, next, next, next]);
    expect(html).toContain("Gráfico terminado");
    expect(html).toContain(PROJECT_TEXTS.tejiendo.cerrarCopa(last));
    expect(html).not.toContain("Pieza terminada");
  });
});

describe("render estático: estado del avance y «Pasar a la versión actual»", () => {
  it("guardado, guardando, sin conexión y conflicto", async () => {
    const { ProgressStatusView, describeQueueState } = await import("@/components/knit/ProgressStatusView");
    expect(renderToStaticMarkup(createElement(ProgressStatusView, { state: { kind: "saved" } }))).toContain("Avance guardado");
    expect(describeQueueState({ kind: "saving" }).label).toBe("Guardando el avance…");
    const off = describeQueueState({ kind: "offline", attempt: 1, retryAt: 5000, reason: "network" }, 1000);
    expect(off.label).toBe("Sin conexión: tu avance se guardará al volver");
    expect(off.detail).toBe("Reintentando en 4 s.");
    expect(describeQueueState({ kind: "conflict", theirs: { rowsDone: 1, stitchesDone: 0 }, theirsAt: null, yours: { rowsDone: 2, stitchesDone: 0 }, message: "" }).label).toBe("Conflicto de avance");
  });
  it("F3-12: avisa si la fila cambió, si se acotó o si no hay nada que pasar", async () => {
    const { RepinDetails } = await import("@/app/proyectos/[id]/ProjectSheet");
    const base = { sameDocument: false, from: { version: 1, workedIn: "rows" as const, totalRows: 20 }, to: { workedIn: "rows" as const, totalRows: 24 }, currentPointer: { rowsDone: 11, stitchesDone: 4 }, pointer: { rowsDone: 11, stitchesDone: 0 }, clamped: false, rowChanged: true, progressUpdatedAt: null };
    const changed = renderToStaticMarkup(createElement(RepinDetails, { preview: base }));
    expect(changed).toContain("Tu avance ahora: la fila 12. Después del cambio: la fila 12.");
    expect(changed).toContain(PROJECT_TEXTS.repin.filaCambio("rows"));
    expect(changed).toContain(PROJECT_TEXTS.repin.casillasACero("rows"));
    expect(changed).toContain("20 filas");
    const clamped = renderToStaticMarkup(createElement(RepinDetails, { preview: { ...base, to: { workedIn: "rows", totalRows: 6 }, pointer: { rowsDone: 6, stitchesDone: 0 }, clamped: true } }));
    expect(clamped).toContain(PROJECT_TEXTS.repin.acotado);
    expect(clamped).toContain("Después del cambio: el gráfico terminado.");
    const kept = renderToStaticMarkup(createElement(RepinDetails, { preview: { ...base, rowChanged: false, currentPointer: { rowsDone: 11, stitchesDone: 0 } } }));
    expect(kept).toContain(PROJECT_TEXTS.repin.conservaFila("rows", "la fila 12"));
    expect(kept).toContain("Tu avance queda en la fila 12. Solo se compara la fila en la que vas: si cambiaste filas anteriores o el ancho, lo que ya tejiste puede no coincidir.");
    expect(kept).not.toContain(PROJECT_TEXTS.repin.casillasACero("rows"));
    expect(renderToStaticMarkup(createElement(RepinDetails, { preview: { ...base, sameDocument: true } }))).toContain(PROJECT_TEXTS.repin.igual);
  });
});

describe("deleteProject", () => {
  const { id: ANA } = USER;
  const BEA = "33333333-3333-4333-8333-333333333333";
  beforeEach(() => {
    db.current = USER;
    for (const k of ["patterns", "versions", "projects", "progress", "profiles", "yarns", "log", "rpcLog"] as const) db[k].length = 0;
    db.clock = 1;
    db.seq = 1;
    db.writeError = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  const start = async () => {
    const actions = await import("@/app/proyectos/actions");
    const d = doc();
    db.seedPattern({ id: d.id, owner_id: ANA, document: d as unknown as Record<string, unknown> });
    const r = await actions.startProjectFromDesign(d.id, db.updatedAt(d.id));
    if (!r.ok) throw new Error(r.code);
    return { actions, projectId: r.projectId };
  };

  it("borra el proyecto propio y su avance; la versión fijada queda y el diseño ya se puede borrar", async () => {
    const { actions, projectId } = await start();
    const { deletePattern } = await import("@/app/disenos/actions");
    expect(await deletePattern(PID)).toMatchObject({ ok: false, code: "HAS_PROJECTS" });
    expect(await actions.deleteProject(projectId)).toEqual({ ok: true });
    expect(db.projects).toHaveLength(0);
    expect(db.progress).toHaveLength(0);
    expect(db.versions).toHaveLength(1);
    expect(await actions.loadProject(projectId)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await deletePattern(PID)).toEqual({ ok: true });
  });
  it("sin sesión, con id inválido, ajeno o inexistente no borra nada", async () => {
    const { actions, projectId } = await start();
    expect(await actions.deleteProject("no-es-uuid")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await actions.deleteProject("99999999-0000-4000-8000-000000000009")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    db.current = { ...USER, id: BEA };
    expect(await actions.deleteProject(projectId)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    db.current = null;
    expect(await actions.deleteProject(projectId)).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(db.projects).toHaveLength(1);
    expect(db.progress).toHaveLength(1);
  });
  it("un error de la base se traduce sin filtrar su texto", async () => {
    const { actions, projectId } = await start();
    db.writeError = { at: "projects.delete", error: { message: 'relation "projects" secreta', code: "XX000" } };
    const r = await actions.deleteProject(projectId);
    expect(r).toMatchObject({ ok: false, code: "DATABASE" });
    if (!r.ok) expect(r.error).not.toMatch(/relation|secreta/);
    expect(db.projects).toHaveLength(1);
  });
});

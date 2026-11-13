import { NO_STITCH, newChartPattern, yarnUsage, type ChartPattern, type NewChartInput, type Yarn } from "@loopitalab/pattern-core";
import { estimateYarnLength } from "@loopitalab/yarn-catalog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gaugeInUse, lengthLowConfidence } from "@/lib/studio/measures.ts";
import { yarnLengthReport } from "@/lib/studio/metraje.ts";
import { createProjectsDb } from "./support/projects-db.ts";
import { USER } from "./support/supabase-mock.ts";

/*
 * QA del grupo C de la fase 3 (T11): casos F3-37 a F3-42 de docs/casos-dominio-fase-3.md a nivel de Server Actions
 * (`getKnitPreview`, `startProjectFromDesign`, `saveProgress`, `repinProject`), con la misma base simulada de
 * proyectos-tejer.test.ts. Completa lo que ya cubre ese archivo.
 */

const ANA = USER.id;
const db = createProjectsDb(USER);
const adminFactory = vi.fn(() => db.admin);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFactory() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { startProjectFromDesign, getKnitPreview, saveProgress, repinProject, loadProject } = await import("@/app/proyectos/actions");

const lana = [{ fiber: "lana", percent: 100 }];
const yarns: Yarn[] = [
  { id: "A", weight: 4, composition: lana, color: { hex: "#F4EBD9" } },
  { id: "B", weight: 4, composition: lana, color: { hex: "#BA222C" } },
];
const PID = "aaaaaaaa-0000-4000-8000-000000000001";
const jsonDoc = (d: ChartPattern) => d as unknown as Record<string, unknown>;

function doc(over: Partial<Omit<NewChartInput, "id">> = {}): ChartPattern {
  return newChartPattern({ id: PID, title: "Gorro", width: 4, height: 3, repeat: { x: 2, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns, ...over });
}

/** Fila 0 con una sola casilla A y el resto B (12 de ancho): la hebra de A cruza 11 puntos en redondo. */
function longFloatDoc(over: Partial<Omit<NewChartInput, "id">> = {}): ChartPattern {
  const d = doc({ width: 12, height: 2, repeat: { x: 1, y: 1 }, ...over });
  d.chart.cells = d.chart.cells.map((_, i) => (i < 12 ? (i === 0 ? 0 : 1) : (i % 2)));
  return d;
}

const seed = (d: ChartPattern) => db.seedPattern({ id: d.id, owner_id: ANA, document: jsonDoc(d) });

beforeEach(() => {
  db.current = USER;
  for (const k of ["patterns", "versions", "projects", "progress", "profiles", "yarns", "log", "rpcLog"] as const) db[k].length = 0;
  db.clock = 1;
  db.seq = 1;
  db.writeError = null;
  db.rpcError = null;
  db.beforeRpc = null;
  adminFactory.mockReset();
  adminFactory.mockImplementation(() => db.admin);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

async function startOne(d: ChartPattern) {
  seed(d);
  const r = await startProjectFromDesign(d.id, db.updatedAt(d.id));
  if (!r.ok) throw new Error(`no empezó: ${r.code}`);
  const project = db.projects.find((p) => p.id === r.projectId)!;
  return { projectId: r.projectId, versionId: project.pattern_version_id as string };
}

describe("F3-37: diseño valid con CHART_FLOAT_LONG", () => {
  it("la pantalla previa muestra la advertencia con el máximo y la sugerencia de enganchar; se puede empezar", async () => {
    seed(longFloatDoc());
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.warnings.find((i) => i.code === "CHART_FLOAT_LONG");
    expect(w, "advertencia de hebra larga").toBeDefined();
    expect(w!.severity).toBe("warning");
    expect(w!.data).toMatchObject({ row: 0, length: 11 });
    expect(typeof w!.data?.max).toBe("number");
    expect(w!.message).toMatch(/enganchar la hebra/);
    expect(w!.message).toMatch(/máximo sugerido: \d+ puntos/);
    expect(w!.message).toMatch(/muestra supuesta/); // sin muestra del documento, la cifra en cm lo dice
    const start = await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(start).toMatchObject({ ok: true, version: 1 });
  });
});

describe("F3-38: diseño con un error de tejido", () => {
  it("getKnitPreview y startProjectFromDesign responden NOT_KNITTABLE con los errores que lo explican", async () => {
    const d = doc();
    d.chart.cells.fill(NO_STITCH, 0, d.chart.width);
    seed(d);
    for (const r of [await getKnitPreview(PID), await startProjectFromDesign(PID, db.updatedAt(PID))]) {
      expect(r).toMatchObject({ ok: false, code: "NOT_KNITTABLE" });
      if (!r.ok) {
        expect(r.error).toMatch(/errores de tejido/);
        expect(r.issues?.length).toBeGreaterThan(0);
        expect(r.issues!.every((i) => i.severity === "error")).toBe(true);
        expect(r.issues!.every((i) => i.message.length > 0)).toBe(true);
      }
    }
    expect(adminFactory).not.toHaveBeenCalled();
  });
});

describe("F3-39: pantalla previa al empezar", () => {
  it("muestra supuesta rotulada, forma de trabajo (top_down, ida y vuelta, filas), lo que no está en el gráfico", async () => {
    seed(doc({ workedIn: "rows", renderAs: "flat", direction: "top_down", repeat: { x: 3, y: 4 } }));
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gauge).toMatchObject({ assumed: true });
    expect(r.shape).toMatchObject({ workedIn: "rows", renderAs: "flat", direction: "top_down", totalRows: 12, flatAndSewn: false, motif: { width: 4, height: 3 }, repeat: { x: 3, y: 4 } });
    expect(r.lengthScope).toBe("chart_only");
    // T18, M1: lista de palillo (la de crochet es otra; ver tejiendo-ui.test.ts).
    expect([...r.notInChart]).toEqual(["cast_on", "edging", "prior_shaping", "bind_off", "assembly"]);
  });

  it("nada se calcula en apps/web: puntos y metros son los de yarnUsage + estimateYarnLength", async () => {
    const d = longFloatDoc();
    seed(d);
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const usage = yarnUsage(d.chart, d.yarns.length);
    const use = gaugeInUse(d)!;
    r.yarns.forEach((y, i) => {
      expect(y.stitches).toBe(usage.stitches[i]);
      expect(y.floatStitches).toBe(usage.floatStitches[i]);
      expect(y.length).toEqual(estimateYarnLength({ stitches: usage.stitches[i]!, floatStitches: usage.floatStitches[i]! }, use.gauge, { technique: "knit", gaugeAssumed: true, lowConfidence: lengthLowConfidence(use, d.yarns[i]!.weight) }));
    });
  });

  it("la pantalla previa y el panel de metraje del estudio dan las mismas cifras por lana (también con una lana de categoría 7)", async () => {
    // Lana principal de categoría 4 (la muestra supuesta sale de ella) y una segunda lana Jumbo (categoría 7).
    const d = doc({ yarns: [yarns[0]!, { ...yarns[1]!, weight: 7 }] });
    d.chart.cells = d.chart.cells.map((_, i) => i % 2);
    seed(d);
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const studio = yarnLengthReport(d);
    r.yarns.forEach((y, i) => {
      expect(y.length, `lana ${y.id}: misma estimación que el estudio`).toEqual(studio.rows[i]!.estimate);
    });
  });

  it("muestra propia + lana categoría 7: sin low_confidence_weight en la pantalla previa ni en el panel", async () => {
    const d = doc({ gauge: { stitchesPer10cm: 20, rowsPer10cm: 28 }, yarns: [yarns[0]!, { ...yarns[1]!, weight: 7 }] });
    d.chart.cells = d.chart.cells.map((_, i) => i % 2);
    seed(d);
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const studio = yarnLengthReport(d);
    expect(studio.assumptions).not.toContain("low_confidence_weight");
    r.yarns.forEach((y, i) => {
      expect(y.length?.assumptions).not.toContain("low_confidence_weight");
      expect(y.length).toEqual(studio.rows[i]!.estimate);
    });
  });

  it("muestra supuesta (A categoría 4) + lana B categoría 7: solo B con low_confidence_weight, igual en ambos", async () => {
    const d = doc({ yarns: [yarns[0]!, { ...yarns[1]!, weight: 7 }] });
    d.chart.cells = d.chart.cells.map((_, i) => i % 2);
    seed(d);
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const studio = yarnLengthReport(d);
    expect(studio.rows[0]!.estimate!.assumptions).not.toContain("low_confidence_weight");
    expect(studio.rows[1]!.estimate!.assumptions).toContain("low_confidence_weight");
    expect(r.yarns[0]!.length?.assumptions).not.toContain("low_confidence_weight");
    expect(r.yarns[1]!.length?.assumptions).toContain("low_confidence_weight");
    r.yarns.forEach((y, i) => expect(y.length).toEqual(studio.rows[i]!.estimate));
  });

  it("con la muestra del documento no hay 'supuesto'", async () => {
    seed(doc({ gauge: { stitchesPer10cm: 24, rowsPer10cm: 32 } }));
    const r = await getKnitPreview(PID);
    expect(r.ok && r.gauge).toMatchObject({ assumed: false, stitchesPer10cm: 24 });
    expect(r.ok && r.yarns.every((y) => !y.length?.assumptions.includes("assumed_gauge"))).toBe(true);
  });
});

describe("F3-40: tubo o círculo con rows", () => {
  it.each(["tube", "circle"] as const)("%s de ida y vuelta: se teje plano y se cose (CHART_ROWS_SHAPE)", async (renderAs) => {
    seed(doc({ workedIn: "rows", renderAs, width: 8, height: 4, repeat: { x: 4, y: 1 } }));
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shape.flatAndSewn).toBe(true);
    const all = [...r.warnings, ...r.info];
    expect(all.some((w) => w.code === "CHART_ROWS_SHAPE")).toBe(true);
  });

  it("plano de ida y vuelta y tubo en redondo no lo dicen", async () => {
    seed(doc({ workedIn: "rows", renderAs: "flat" }));
    const flat = await getKnitPreview(PID);
    expect(flat.ok && flat.shape.flatAndSewn).toBe(false);
    db.patterns.length = 0;
    seed(doc({ workedIn: "rounds", renderAs: "tube" }));
    const tube = await getKnitPreview(PID);
    expect(tube.ok && tube.shape.flatAndSewn).toBe(false);
    expect(tube.ok && [...tube.warnings, ...tube.info].some((w) => w.code === "CHART_ROWS_SHAPE")).toBe(false);
  });
});

describe("F3-41: conflicto de avance entre dispositivos", () => {
  it("ida y vuelta: «fila» en las dos posiciones, con la hora del servidor; no pisa", async () => {
    const { projectId, versionId } = await startOne(doc({ workedIn: "rows", renderAs: "flat", repeat: { x: 2, y: 3 } }));
    const seen = db.progress[0]!.updated_at as string;
    db.setProgress(projectId, 5, 2); // otro dispositivo: fila 5
    const r = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, seen);
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "progress", workedIn: "rows", totalRows: 9 });
    if (r.ok) return;
    expect(r.error).toBe("En otro dispositivo vas en la fila 5. Aquí vas en la fila 2. ¿Con cuál sigues?");
    expect(r.error).not.toMatch(/vuelta/);
    expect(r.currentUpdatedAt).toBe(db.progress[0]!.updated_at);
    expect(r.currentUpdatedAt).not.toBe(seen);
    expect(db.progress[0]).toMatchObject({ round_number: 5, stitch_index: 2 });
  });

  it("en redondo: «vuelta» en las dos posiciones", async () => {
    const { projectId, versionId } = await startOne(doc({ repeat: { x: 2, y: 3 } }));
    const seen = db.progress[0]!.updated_at as string;
    db.setProgress(projectId, 7, 0);
    const r = await saveProgress(projectId, versionId, { rowsDone: 3, stitchesDone: 1 }, seen);
    expect(!r.ok && r.error).toBe("En otro dispositivo vas en la vuelta 7. Aquí vas en la vuelta 4. ¿Con cuál sigues?");
  });

  it("repinProject con avance cambiado y VERSION_CHANGED también dicen «fila» en ida y vuelta", async () => {
    const { projectId, versionId } = await startOne(doc({ workedIn: "rows", renderAs: "flat" }));
    const seen = db.progress[0]!.updated_at as string;
    db.setProgress(projectId, 2, 0);
    db.editPattern(PID, jsonDoc(doc({ workedIn: "rows", renderAs: "flat", height: 5 })));
    const repin = await repinProject(projectId, seen);
    expect(repin).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "progress" });
    if (!repin.ok) expect(repin.error).toMatch(/la fila 2/);
    const ok = await repinProject(projectId, db.progress[0]!.updated_at as string);
    expect(ok.ok).toBe(true);
    const stale = await saveProgress(projectId, versionId, { rowsDone: 0, stitchesDone: 0 }, db.progress[0]!.updated_at as string);
    expect(stale).toMatchObject({ ok: false, code: "VERSION_CHANGED", workedIn: "rows" });
    if (!stale.ok) {
      expect(stale.error).toMatch(/fila/);
      expect(stale.error).not.toMatch(/vuelta/);
    }
  });
});

describe("F3-42: versión fijada que una regla nueva ya no valida", () => {
  it("valid falso: loadProject la muestra con aviso y saveProgress sigue guardando", async () => {
    const { projectId, versionId } = await startOne(doc());
    const draft = doc();
    draft.chart.cells.fill(NO_STITCH, 0, draft.chart.width);
    db.versions[0]!.document = jsonDoc(draft);
    const l = await loadProject(projectId);
    expect(l).toMatchObject({ ok: true, valid: false });
    if (l.ok) expect(l.issues.some((i) => i.code === "CHART_ROW_EMPTY_FULL")).toBe(true);
    const s = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, db.progress[0]!.updated_at as string);
    expect(s.ok).toBe(true);
  });

  it.each([
    ["rows", "fila", "vuelta"],
    ["rounds", "vuelta", "fila"],
  ] as const)("O-1: conflicto de avance con la versión ilegible (%s) dice «%s», no «%s»", async (workedIn, word, other) => {
    const good = workedIn === "rows" ? doc({ workedIn: "rows", renderAs: "flat" }) : doc();
    const { projectId, versionId } = await startOne(good);
    const seen = db.progress[0]!.updated_at as string;
    db.versions[0]!.document = { ...jsonDoc(good), chart: { ...(jsonDoc(good).chart as object), width: -1 } };
    db.setProgress(projectId, 3, 0);
    const r = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, seen);
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "progress", workedIn });
    if (!r.ok) {
      expect(r.error).toContain(word);
      expect(r.error).not.toContain(other);
    }
  });

  it("sin savable: loadProject no la muestra y lo explica; repinProject tampoco la usa", async () => {
    const { projectId } = await startOne(doc());
    db.versions[0]!.document = { ...jsonDoc(doc()), chart: { width: -1 } };
    const l = await loadProject(projectId);
    expect(l).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    if (!l.ok) expect(l.error).toMatch(/errores que impiden abrirlo/);
    expect(await repinProject(projectId, db.progress[0]!.updated_at as string)).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
  });
});

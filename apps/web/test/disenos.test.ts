import { newChartPattern, validatePattern, NO_STITCH, type ChartPattern, type NewChartInput } from "@loopitalab/pattern-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, PATTERNS_QUOTA, stamp } from "./support/patterns-db.ts";
import { USER } from "./support/supabase-mock.ts";

// ---------------------------------------------------------------- simulación de Supabase

const ANA = USER.id;
const BEA = "33333333-3333-4333-8333-333333333333";
const db = createFakeDb(USER);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { createChartPattern, savePattern, savePatternVersion, listPatterns, duplicatePattern, deletePattern } = await import("@/app/disenos/actions");
const { MAX_DOCUMENT_BYTES } = await import("@/lib/designs/prepare");
const { DESIGN_MESSAGES } = await import("@/lib/designs/messages");

const yarns = [
  { id: "A", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } },
  { id: "B", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
];

const input = (over: Partial<Omit<NewChartInput, "id">> = {}): Omit<NewChartInput, "id"> => ({
  title: "Gorro de prueba",
  width: 4,
  height: 3,
  repeat: { x: 2, y: 1 },
  workedIn: "rounds",
  renderAs: "tube",
  direction: "bottom_up",
  yarns,
  ...over,
});

/** Documento válido, con el id de la fila. */
function doc(id: string, over: Partial<NewChartInput> = {}): ChartPattern {
  return newChartPattern({ id, ...input(), ...over });
}

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ID = "bbbbbbbb-0000-4000-8000-000000000002";

function seedMine(d: ChartPattern = doc(ID), extra: Record<string, unknown> = {}) {
  return db.seed({ id: d.id, owner_id: ANA, document: d as unknown as Record<string, unknown>, ...extra });
}

beforeEach(() => {
  db.current = USER;
  db.rows = [];
  db.versions = [];
  db.log = [];
  db.clock = 1;
  db.nextError = null;
  db.snapshotError = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const writes = () => db.log.filter((l) => l.op === "insert" || l.op === "update" || l.op === "delete" || l.table === "rpc");

// ---------------------------------------------------------------- sin sesión

describe("sin sesión", () => {
  beforeEach(() => {
    db.current = null;
  });

  it("ninguna acción escribe ni lee: devuelve UNAUTHENTICATED con el mensaje en español", async () => {
    const results = [
      await createChartPattern(input()),
      await savePattern(ID, doc(ID), stamp(1)),
      await savePatternVersion(ID),
      await listPatterns(),
      await duplicatePattern(ID),
      await deletePattern(ID),
    ];
    for (const r of results) {
      expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED", error: DESIGN_MESSAGES.UNAUTHENTICATED });
    }
    expect(db.log).toEqual([]);
  });
});

// ---------------------------------------------------------------- crear

describe("createChartPattern", () => {
  it("crea un diseño privado, manual, chart y knit, con el id del servidor en la fila y en el documento", async () => {
    const r = await createChartPattern(input());
    expect(r).toMatchObject({ ok: true, draft: false });
    if (!r.ok) throw new Error("no debería fallar");
    expect(r.updatedAt).toMatch(/^2026-11-06T/);
    const row = db.rows.find((x) => x.id === r.id)!;
    expect(row).toMatchObject({ owner_id: ANA, kind: "chart", technique: "knit", origin: "manual", visibility: "private", title: "Gorro de prueba" });
    expect(row.document.id).toBe(r.id);
    expect(row.document.title).toBe(row.title);
    expect(validatePattern(row.document).valid).toBe(true);
  });

  it("ignora el id, el origen y la visibilidad que intente imponer el cliente", async () => {
    const evil = { ...input(), id: OTHER_ID, origin: { kind: "ai" }, visibility: "public" } as unknown as Omit<NewChartInput, "id">;
    const r = await createChartPattern(evil);
    if (!r.ok) throw new Error("no debería fallar");
    expect(r.id).not.toBe(OTHER_ID);
    const row = db.rows.find((x) => x.id === r.id)!;
    expect(row).toMatchObject({ origin: "manual", visibility: "private" });
    expect(row.document.origin).toEqual({ kind: "manual" });
  });

  it("rechaza un documento no guardable (título vacío, tamaño 0) sin escribir", async () => {
    for (const bad of [input({ title: "" }), input({ width: 0 }), input({ yarns: [] })]) {
      const r = await createChartPattern(bad);
      expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
      if (!r.ok) expect(r.issues?.length).toBeGreaterThan(0);
    }
    expect(writes()).toEqual([]);
  });

  it("rechaza una entrada que no es un objeto", async () => {
    expect(await createChartPattern(null as never)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(writes()).toEqual([]);
  });

  it("cuerpo demasiado grande: TOO_LARGE antes de construir nada", async () => {
    const big = input({ yarns: [{ ...yarns[0]!, note: "x".repeat(MAX_DOCUMENT_BYTES + 1) }] });
    expect(await createChartPattern(big)).toMatchObject({ ok: false, code: "TOO_LARGE", error: DESIGN_MESSAGES.TOO_LARGE });
    expect(writes()).toEqual([]);
  });

  it("un fallo de la base se informa sin filtrar su mensaje", async () => {
    db.nextError = { message: 'violates "patterns_internal_name"', code: "XX000" };
    const r = await createChartPattern(input());
    expect(r).toMatchObject({ ok: false, code: "DATABASE", error: DESIGN_MESSAGES.DATABASE });
    expect(JSON.stringify(r)).not.toContain("patterns_internal_name");
  });
});

// ---------------------------------------------------------------- guardar

describe("savePattern", () => {
  it("guarda y devuelve el updatedAt nuevo, sin borrador", async () => {
    const row = seedMine();
    const before = row.updated_at;
    const d = doc(ID, { title: "Gorro renombrado" });
    const r = await savePattern(ID, d, before);
    expect(r).toMatchObject({ ok: true, draft: false });
    if (!r.ok) throw new Error();
    expect(r.updatedAt > before).toBe(true);
    expect(db.rows[0]).toMatchObject({ title: "Gorro renombrado", updated_at: r.updatedAt });
    expect((db.rows[0]!.document as { title: string }).title).toBe("Gorro renombrado");
  });

  it("no cambia kind, technique, origen ni visibilidad: solo título, versión de esquema y documento", async () => {
    seedMine();
    await savePattern(ID, doc(ID), stamp(1));
    const update = db.log.find((l) => l.op === "update")!;
    expect(Object.keys(update.payload as object).sort()).toEqual(["document", "schema_version", "title"]);
  });

  it("documento no guardable (valor de celda inválido): NOT_SAVABLE con los errores, sin escribir", async () => {
    const row = seedMine();
    const bad = doc(ID);
    bad.chart.cells[0] = 99;
    const r = await savePattern(ID, bad, row.updated_at);
    expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE", error: DESIGN_MESSAGES.NOT_SAVABLE });
    if (r.ok) throw new Error();
    expect(r.issues?.some((i) => i.code === "CHART_CELL_VALUE")).toBe(true);
    expect(r.issues?.every((i) => i.severity === "error")).toBe(true);
    expect(writes()).toEqual([]);
  });

  it("no confía en el cliente: un título vacío o una versión de esquema desconocida se rechazan", async () => {
    const row = seedMine();
    expect(await savePattern(ID, { ...doc(ID), title: "" }, row.updated_at)).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    expect(await savePattern(ID, { ...doc(ID), schemaVersion: 999 }, row.updated_at)).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    expect(await savePattern(ID, "no soy un documento", row.updated_at)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await savePattern(ID, [doc(ID)], row.updated_at)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(writes()).toEqual([]);
  });

  it("borrador con error de tejido (una vuelta sin ningún punto) se guarda con draft: true (E10)", async () => {
    const row = seedMine();
    const draft = doc(ID);
    draft.chart.cells.fill(NO_STITCH, 0, draft.chart.width); // vuelta 0 sin puntos
    const v = validatePattern(draft);
    expect(v.valid).toBe(false);
    expect(v.savable).toBe(true);
    const r = await savePattern(ID, draft, row.updated_at);
    expect(r).toMatchObject({ ok: true, draft: true });
    expect((db.rows[0]!.document as unknown as ChartPattern).chart.cells[0]).toBe(NO_STITCH);
  });

  it("las advertencias no son borrador", async () => {
    const row = seedMine();
    const d = doc(ID, { gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 } });
    const r = await savePattern(ID, d, row.updated_at);
    expect(r).toMatchObject({ ok: true, draft: false });
  });

  it("conflicto: si updated_at cambió, no sobrescribe y devuelve el updatedAt actual", async () => {
    const row = seedMine();
    const old = row.updated_at;
    // Otra pestaña guarda primero.
    const other = await savePattern(ID, doc(ID, { title: "Desde la otra pestaña" }), old);
    if (!other.ok) throw new Error("la primera debería guardar");
    const mine = await savePattern(ID, doc(ID, { title: "Desde mi pestaña" }), old);
    expect(mine).toMatchObject({ ok: false, code: "CONFLICT", error: DESIGN_MESSAGES.CONFLICT, currentUpdatedAt: other.updatedAt });
    expect(db.rows[0]!.title).toBe("Desde la otra pestaña");
    // Sobrescribir es una acción explícita: repetir con el updatedAt actual.
    const overwrite = await savePattern(ID, doc(ID, { title: "Desde mi pestaña" }), other.updatedAt);
    expect(overwrite).toMatchObject({ ok: true });
    expect(db.rows[0]!.title).toBe("Desde mi pestaña");
  });

  it("el updated_at se envía tal cual (microsegundos), sin pasar por Date", async () => {
    const row = seedMine();
    await savePattern(ID, doc(ID), row.updated_at);
    const update = db.log.find((l) => l.op === "update")!;
    expect(update.filters).toContainEqual(["updated_at", "2026-11-06T10:00:00.000001+00:00"]);
    expect(update.filters).toContainEqual(["owner_id", ANA]);
  });

  it("diseño inexistente o de otra usuaria: NOT_FOUND y no toca nada", async () => {
    db.seed({ id: OTHER_ID, owner_id: BEA, document: doc(OTHER_ID) as unknown as Record<string, unknown> });
    const bea = db.rows[0]!;
    expect(await savePattern(OTHER_ID, doc(OTHER_ID, { title: "Robado" }), bea.updated_at)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(bea.title).not.toBe("Robado");
    expect(await savePattern("cccccccc-0000-4000-8000-000000000003", doc("cccccccc-0000-4000-8000-000000000003"), stamp(1))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("parámetros mal formados: INVALID_REQUEST sin consultar la base", async () => {
    expect(await savePattern("no-es-uuid", doc(ID), stamp(1))).toMatchObject({ code: "INVALID_REQUEST" });
    expect(await savePattern(ID, doc(ID), "ayer")).toMatchObject({ code: "INVALID_REQUEST" });
    expect(await savePattern(ID, doc(OTHER_ID), stamp(1))).toMatchObject({ code: "INVALID_REQUEST" }); // id del documento distinto
    expect(db.log).toEqual([]);
  });

  it("cuerpo demasiado grande: TOO_LARGE y no escribe", async () => {
    const row = seedMine();
    const big = { ...doc(ID), notes: ["x".repeat(MAX_DOCUMENT_BYTES)] };
    expect(await savePattern(ID, big, row.updated_at)).toMatchObject({ ok: false, code: "TOO_LARGE", error: DESIGN_MESSAGES.TOO_LARGE });
    expect(writes()).toEqual([]);
  });

  it("una referencia circular no tumba el servidor", async () => {
    const row = seedMine();
    const cyc: Record<string, unknown> = { ...doc(ID) };
    cyc.self = cyc;
    expect(await savePattern(ID, cyc, row.updated_at)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });

  it("el peor documento válido (200 x 200, 32 lanas, notas al máximo, caracteres de 4 bytes) cabe y se guarda", async () => {
    const wideYarns = Array.from({ length: 32 }, (_, i) => ({
      id: `Y${i}`, weight: 4 as const, composition: [{ fiber: "lana", percent: 50 }, { fiber: "algodon", percent: 50 }], color: { hex: "#BA222C" }, note: "😀".repeat(500),
    }));
    const row = seedMine();
    const worst = doc(ID, { title: "😀".repeat(120), width: 200, height: 200, repeat: { x: 500, y: 500 }, yarns: wideYarns });
    worst.chart.cells = worst.chart.cells.map((_, i) => (i * 7919) % 32);
    worst.notes = Array.from({ length: 50 }, () => "😀".repeat(2000));
    expect(validatePattern(worst).valid).toBe(true);
    const bytes = Buffer.byteLength(JSON.stringify(worst));
    expect(bytes).toBeLessThan(MAX_DOCUMENT_BYTES);
    expect(bytes).toBeGreaterThan(500_000); // es de verdad el peor caso, no uno chico
    expect(await savePattern(ID, worst, row.updated_at)).toMatchObject({ ok: true });
  });
});

// ---------------------------------------------------------------- versiones

describe("savePatternVersion", () => {
  it("crea una versión con snapshot_pattern y devuelve su número", async () => {
    seedMine();
    expect(await savePatternVersion(ID, "  Antes de cambiar el fondo  ")).toEqual({ ok: true, version: 1 });
    expect(await savePatternVersion(ID)).toEqual({ ok: true, version: 2 });
    expect(db.versions).toEqual([
      { pattern_id: ID, version: 1, label: "Antes de cambiar el fondo" },
      { pattern_id: ID, version: 2, label: null },
    ]);
  });

  it("corta la etiqueta a 80 caracteres y trata la vacía como sin etiqueta", async () => {
    seedMine();
    await savePatternVersion(ID, "ñ".repeat(200));
    await savePatternVersion(ID, "   ");
    expect(db.versions[0]!.label).toBe("ñ".repeat(80));
    expect(db.versions[1]!.label).toBeNull();
  });

  it("quita los caracteres de control de la etiqueta (U+0000, saltos de línea, tabulaciones)", async () => {
    seedMine();
    await savePatternVersion(ID, "  Antes\u0000 del\n\tfondo\u0085 ");
    await savePatternVersion(ID, "\u0000\n");
    expect(db.versions[0]!.label).toBe("Antes delfondo");
    expect(db.versions[1]!.label).toBeNull();
  });

  it("guardar (autoguardado) nunca crea versiones", async () => {
    const row = seedMine();
    await savePattern(ID, doc(ID, { title: "Uno" }), row.updated_at);
    expect(db.versions).toEqual([]);
    expect(db.log.some((l) => l.table === "rpc")).toBe(false);
  });

  it("tope de 200 versiones, diseño ajeno y parámetros inválidos", async () => {
    seedMine();
    db.snapshotError = { message: "Este patrón llegó al máximo de 200 versiones guardadas", code: "54000" };
    expect(await savePatternVersion(ID)).toMatchObject({ ok: false, code: "MAX_VERSIONS", error: DESIGN_MESSAGES.MAX_VERSIONS });
    db.snapshotError = null;
    db.seed({ id: OTHER_ID, owner_id: BEA, document: doc(OTHER_ID) as unknown as Record<string, unknown> });
    expect(await savePatternVersion(OTHER_ID)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await savePatternVersion("x")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await savePatternVersion(ID, 5 as never)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });
});

// ---------------------------------------------------------------- listar

describe("listPatterns", () => {
  it("lista solo los diseños propios, del más reciente al más antiguo, sin leer el documento completo", async () => {
    seedMine(doc(ID, { title: "Primero" }));
    const second = doc("aaaaaaaa-0000-4000-8000-000000000009", { title: "Segundo", width: 6, height: 5, renderAs: "circle" });
    seedMine(second);
    db.seed({ id: OTHER_ID, owner_id: BEA, document: doc(OTHER_ID, { title: "De Bea" }) as unknown as Record<string, unknown> });
    const r = await listPatterns();
    if (!r.ok) throw new Error();
    expect(r.designs.map((d) => d.title)).toEqual(["Segundo", "Primero"]);
    expect(r.designs[0]).toMatchObject({ width: 6, height: 5, renderAs: "circle", kind: "chart", technique: "knit", origin: "manual", visibility: "private" });
    const select = db.log.find((l) => l.op === "select")!;
    expect(select.filters).toContainEqual(["owner_id", ANA]);
    // el listado pide rutas JSON puntuales, no la columna `document` completa
    expect(select.sel).not.toMatch(/(^|,\s*)document(\s*,|$)/);
    expect(select.sel).toContain("document->chart->>width");
  });

  it("sin diseños devuelve una lista vacía", async () => {
    expect(await listPatterns()).toEqual({ ok: true, designs: [] });
  });
});

// ---------------------------------------------------------------- duplicar

describe("cuota de diseños (patterns_quota, 54000)", () => {
  const fill = (n: number) => {
    for (let i = 0; i < n; i++) db.seed({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, owner_id: ANA, document: doc(`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, { title: `D${i}` }) as unknown as Record<string, unknown> });
  };

  it("crear el diseño 501 devuelve QUOTA con mensaje propio y no escribe", async () => {
    fill(PATTERNS_QUOTA);
    const r = await createChartPattern(input());
    expect(r).toMatchObject({ ok: false, code: "QUOTA", error: DESIGN_MESSAGES.QUOTA });
    expect(DESIGN_MESSAGES.QUOTA).toMatch(/500/);
    expect(db.rows).toHaveLength(PATTERNS_QUOTA);
  });

  it("duplicar con la cuota llena devuelve QUOTA, no MAX_VERSIONS", async () => {
    fill(PATTERNS_QUOTA);
    expect(await duplicatePattern(db.rows[0]!.id)).toMatchObject({ ok: false, code: "QUOTA" });
  });

  it("con 499 todavía se puede crear uno; la cuota es por usuaria", async () => {
    fill(PATTERNS_QUOTA - 1);
    db.seed({ id: "00000000-0000-4000-8000-0000000000ff", owner_id: BEA, document: doc("00000000-0000-4000-8000-0000000000ff", { title: "De Bea" }) as unknown as Record<string, unknown> });
    expect(await createChartPattern(input())).toMatchObject({ ok: true });
  });
});

describe("permisos de columna (visibility no es editable por la usuaria)", () => {
  it("el doble rechaza un INSERT o UPDATE que nombre visibility, aunque sea private", async () => {
    const row = seedMine();
    type Table = { update(p: object): { eq(c: string, v: string): PromiseLike<{ error: unknown }> }; insert(p: object): PromiseLike<{ error: unknown }> };
    const table = () => db.client.from("patterns") as unknown as Table;
    const u = await table().update({ visibility: "private" }).eq("id", row.id);
    expect(u.error).toMatchObject({ code: "42501" });
    const i = await table().insert({ id: OTHER_ID, title: "x", document: doc(OTHER_ID), visibility: "private" });
    expect(i.error).toMatchObject({ code: "42501" });
    expect(db.rows[0]!.visibility).toBe("private");
  });

  it("las acciones nunca envían visibility (la base la fija en private por defecto)", async () => {
    seedMine();
    await createChartPattern(input());
    await duplicatePattern(ID);
    const inserts = db.log.filter((l) => l.table === "patterns" && l.op === "insert");
    expect(inserts).toHaveLength(2);
    for (const l of inserts) expect(Object.keys(l.payload as object)).not.toContain("visibility");
  });
});

describe("duplicatePattern", () => {
  it("crea una copia privada y manual con id y título nuevos; el original no cambia", async () => {
    const original = seedMine(doc(ID, { title: "Gorro" }));
    const r = await duplicatePattern(ID);
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.id).not.toBe(ID);
    expect(db.rows).toHaveLength(2);
    const copy = db.rows.find((x) => x.id === r.id)!;
    expect(copy).toMatchObject({ owner_id: ANA, title: "Copia de Gorro", origin: "manual", visibility: "private", kind: "chart" });
    expect(copy.document.id).toBe(r.id);
    expect(copy.document.title).toBe("Copia de Gorro");
    expect((copy.document as unknown as ChartPattern).chart.cells).toEqual((original.document as unknown as ChartPattern).chart.cells);
    expect(original.title).toBe("Gorro");
    expect(original.document.id).toBe(ID);
  });

  it("acorta el título de la copia a 120 caracteres", async () => {
    seedMine(doc(ID, { title: "x".repeat(120) }));
    const r = await duplicatePattern(ID);
    if (!r.ok) throw new Error();
    expect(db.rows.find((x) => x.id === r.id)!.title).toHaveLength(120);
  });

  it("duplica un borrador con error de tejido y lo marca draft", async () => {
    const d = doc(ID);
    d.chart.cells.fill(NO_STITCH, 0, d.chart.width);
    seedMine(d);
    expect(await duplicatePattern(ID)).toMatchObject({ ok: true, draft: true });
  });

  it("no duplica un diseño de IA (conservaría la etiqueta, que solo asigna el servidor)", async () => {
    seedMine(doc(ID), { origin: "ai" });
    expect(await duplicatePattern(ID)).toMatchObject({ ok: false, code: "AI_DUPLICATE_UNSUPPORTED" });
    expect(db.rows).toHaveLength(1);
  });

  it("un documento guardado que ya no migra o no es guardable no se duplica", async () => {
    seedMine({ ...doc(ID), schemaVersion: 999 } as unknown as ChartPattern);
    expect(await duplicatePattern(ID)).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
  });

  it("diseño ajeno o inexistente: NOT_FOUND", async () => {
    db.seed({ id: OTHER_ID, owner_id: BEA, document: doc(OTHER_ID) as unknown as Record<string, unknown> });
    expect(await duplicatePattern(OTHER_ID)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await duplicatePattern("nope")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(db.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- borrar

describe("deletePattern", () => {
  it("borra un diseño propio", async () => {
    seedMine();
    expect(await deletePattern(ID)).toEqual({ ok: true });
    expect(db.rows).toEqual([]);
  });

  it("no borra el de otra usuaria: NOT_FOUND y la fila sigue ahí", async () => {
    db.seed({ id: OTHER_ID, owner_id: BEA, document: doc(OTHER_ID) as unknown as Record<string, unknown> });
    expect(await deletePattern(OTHER_ID)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(db.rows).toHaveLength(1);
  });

  it("borrar dos veces: la segunda es NOT_FOUND; id mal formado es INVALID_REQUEST", async () => {
    seedMine();
    await deletePattern(ID);
    expect(await deletePattern(ID)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await deletePattern("1; drop table patterns")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });
});

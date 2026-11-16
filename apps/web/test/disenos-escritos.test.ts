import { newWrittenPattern, validatePattern, SCHEMA_VERSION, type WrittenPattern, type Yarn } from "@loopitalab/pattern-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, stamp } from "./support/patterns-db.ts";
import { USER } from "./support/supabase-mock.ts";

// T13: flujo de diseños escritos (amigurumi). Guardado de borradores por `savable` (ADR 0006, E12), mensajes y "Tejer" fuera.

const ANA = USER.id;
const db = createFakeDb(USER);
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { createWrittenPattern, savePattern, listPatterns } = await import("@/app/disenos/actions");
const { DESIGN_MESSAGES, WRITTEN_ISSUE_MESSAGES, writtenIssueMessage } = await import("@/lib/designs/messages");
const { PROJECT_MESSAGES } = await import("@/lib/projects/messages");

const yarns: Yarn[] = [{ id: "A", weight: 4, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#F4EBD9" } }];
const ID = "aaaaaaaa-0000-4000-8000-000000000001";

function doc(over: Record<string, unknown> = {}): WrittenPattern {
  return { ...newWrittenPattern({ id: ID, title: "Osito", yarns }), ...over } as WrittenPattern;
}
/** V2 de 12 pb sobre una V1 de 6 pb: consume 12 y solo hay 6 puntos. */
function withMismatch(): WrittenPattern {
  const d = doc();
  d.parts[0]!.rounds.push({ number: 2, items: [{ type: "stitch", stitch: "sc", count: 12 }], expected: 12 });
  return d;
}

beforeEach(() => {
  db.current = USER;
  db.rows = [];
  db.versions = [];
  db.log = [];
  db.clock = 1;
  db.nextError = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("createWrittenPattern", () => {
  it("crea un amigurumi privado, manual, crochet y written, con schema_version = SCHEMA_VERSION", async () => {
    const r = await createWrittenPattern({ title: "Osito", yarns });
    expect(r).toMatchObject({ ok: true, draft: false });
    if (!r.ok) throw new Error("no debería fallar");
    const row = db.rows.find((x) => x.id === r.id)!;
    expect(row).toMatchObject({ owner_id: ANA, kind: "written", technique: "crochet", origin: "manual", visibility: "private", schema_version: SCHEMA_VERSION, title: "Osito" });
    expect(row.document.id).toBe(r.id);
    expect(validatePattern(row.document).valid).toBe(true);
  });

  it("ignora las partes, el id y el origen que intente imponer el cliente", async () => {
    const evil = { title: "Osito", yarns, id: "x", origin: { kind: "ai" }, parts: [] } as never;
    const r = await createWrittenPattern(evil);
    if (!r.ok) throw new Error("no debería fallar");
    const row = db.rows.find((x) => x.id === r.id)!;
    expect(row.origin).toBe("manual");
    expect((row.document as unknown as WrittenPattern).parts).toHaveLength(1);
  });

  it("rechaza título vacío o sin lanas, sin escribir", async () => {
    for (const bad of [{ title: "", yarns }, { title: "Osito", yarns: [] }]) {
      expect(await createWrittenPattern(bad)).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    }
    expect(await createWrittenPattern(null as never)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(db.rows).toEqual([]);
  });

  it("sin sesión devuelve UNAUTHENTICATED", async () => {
    db.current = null;
    expect(await createWrittenPattern({ title: "Osito", yarns })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});

describe("savePattern con diseños escritos (CA4-M4)", () => {
  function seed(d: WrittenPattern) {
    return db.seed({ id: d.id, owner_id: ANA, kind: "written", technique: "crochet", document: d as unknown as Record<string, unknown> });
  }

  it("una vuelta que no cuadra se guarda como borrador (draft: true)", async () => {
    seed(doc());
    const r = await savePattern(ID, withMismatch(), stamp(1));
    expect(r).toMatchObject({ ok: true, draft: true });
    const parts = (db.rows[0]!.document as unknown as WrittenPattern).parts;
    expect(parts[0]!.rounds).toHaveLength(2);
    expect(db.rows[0]!.schema_version).toBe(SCHEMA_VERSION);
  });

  it("un punto desconocido (STITCH_UNKNOWN) no se guarda, ni llamando directo a la acción", async () => {
    seed(doc());
    const bad = doc();
    (bad.parts[0]!.rounds[0]!.items[0] as { stitch: string }).stitch = "zz";
    const r = await savePattern(ID, bad, stamp(1));
    expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    expect((db.rows[0]!.document as unknown as WrittenPattern).parts[0]!.rounds[0]!.items[0]).toMatchObject({ stitch: "sc" });
  });

  it("un error de layout no se guarda", async () => {
    seed(doc());
    const bad = doc({ layout: { placements: [{ target: { part: "no-existe" }, at: { host: { part: "p1" }, round: 1, stitch: 0 } }] } });
    expect(await savePattern(ID, bad, stamp(1))).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
  });

  it("la clave stuffing da UNKNOWN_KEY y no se guarda", async () => {
    seed(doc());
    const bad = doc();
    (bad.parts[0] as unknown as Record<string, unknown>).stuffing = true;
    const r = await savePattern(ID, bad, stamp(1));
    expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    if (!r.ok) expect(r.issues?.map((i) => i.code)).toContain("UNKNOWN_KEY");
  });

  it("una parte con copies inválido es PART_COPIES y no se guarda", async () => {
    seed(doc());
    const bad = doc();
    (bad.parts[0] as unknown as { copies: number }).copies = 0;
    const r = await savePattern(ID, bad, stamp(1));
    expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    if (!r.ok) expect(r.issues?.map((i) => i.code)).toContain("PART_COPIES");
  });
});

describe("lista", () => {
  it("devuelve el tipo (kind) de cada diseño", async () => {
    const r = await createWrittenPattern({ title: "Osito", yarns });
    expect(r.ok).toBe(true);
    const list = await listPatterns();
    if (!list.ok) throw new Error("no debería fallar");
    expect(list.designs.map((d) => d.kind)).toEqual(["written"]);
  });
});

describe("mensajes", () => {
  const CODES = ["PART_COPIES", "LAYOUT_COPY_RANGE", "LAYOUT_TARGET_UNKNOWN", "LAYOUT_HOST_UNKNOWN", "LAYOUT_DUPLICATE", "LAYOUT_ANCHOR_RANGE", "LIMIT", "ROUND_CONSUMPTION_MISMATCH", "ROUND_COUNT_MISMATCH", "ROUND_ZERO", "ROUND_RANGE_CHANGES", "ROUND_NUMBERING"];

  it("cada código nuevo tiene un texto en español, sin nombres técnicos", () => {
    for (const c of CODES) {
      const t = WRITTEN_ISSUE_MESSAGES[c];
      expect(t, c).toBeTruthy();
      expect(t, c).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
  });

  it("los ROUND_* avisan que queda como borrador; un código ajeno usa el mensaje del motor", () => {
    for (const c of CODES.filter((x) => x.startsWith("ROUND_"))) expect(writtenIssueMessage({ code: c, message: "m" })).toMatch(/borrador/);
    expect(writtenIssueMessage({ code: "OTRO", message: "del motor" })).toBe("del motor");
  });

  it("el rechazo de tejer un escrito usa el aviso de la próxima versión", () => {
    expect(PROJECT_MESSAGES.NOT_A_CHART).toMatch(/próxima versión/);
    expect(DESIGN_MESSAGES.NOT_SAVABLE).toBeTruthy();
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { newChartPattern, validatePattern, type ChartPattern, type NewChartInput } from "@loopitalab/pattern-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONSISTENCY_RULES, DOCUMENT_TEXT_MAX, createFakeDb, instantMicros, jsonbTextBytes, stamp, type Row } from "./support/patterns-db.ts";
import { USER } from "./support/supabase-mock.ts";

/*
 * QA de T4 (diseños): que el doble en memoria refleje la migración real, que savePattern no deje
 * al cliente imponer columnas, y la concurrencia optimista con microsegundos.
 * Las restricciones reales se prueban en Postgres con supabase/checks/10_rls_check.sql.
 */

const ANA = USER.id;
const db = createFakeDb(USER);
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { savePattern } = await import("@/app/disenos/actions");
const { MAX_DOCUMENT_BYTES } = await import("@/lib/designs/prepare");
const { dbErrorCode, DESIGN_MESSAGES } = await import("@/lib/designs/messages");
const yarns = [
  { id: "A", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } },
  { id: "B", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
];
const ID = "aaaaaaaa-0000-4000-8000-000000000001";

function doc(over: Partial<NewChartInput> = {}): ChartPattern {
  return newChartPattern({ id: ID, title: "Gorro", width: 4, height: 3, repeat: { x: 2, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns, ...over });
}
const seedMine = (d: ChartPattern = doc(), extra: Partial<Row> = {}) => db.seed({ id: d.id, owner_id: ANA, document: d as unknown as Record<string, unknown>, ...extra });
/** Inserción directa en el doble (como haría PostgREST), para probar sus restricciones. */
type Insertable = { insert: (p: unknown) => { select: (c: string) => { single: () => Promise<{ data: unknown; error: { code?: string } | null }> } } };
const insertRow = (payload: Record<string, unknown>) => (db.client.from("patterns") as unknown as Insertable).insert(payload).select("id").single();
const writes = () => db.log.filter((l) => l.op === "insert" || l.op === "update" || l.op === "delete");

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

// ---------------------------------------------------------------- el doble frente a la migración

const MIGRATIONS = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

/** Última definición de una restricción en las migraciones (en orden), sin comentarios. */
function lastConstraint(name: string): string {
  let found = "";
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = readFileSync(MIGRATIONS + f, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    const re = new RegExp(`add constraint ${name} check \\(([\\s\\S]*?)\\);`, "g");
    for (const m of sql.matchAll(re)) found = m[1] as string;
  }
  return found.replace(/\s+/g, " ").trim();
}

describe("el doble en memoria refleja la migración", () => {
  it("las condiciones de patterns_document_consistent son exactamente las que imita el doble", () => {
    const body = lastConstraint("patterns_document_consistent");
    expect(body).not.toBe("");
    const conditions = body.split(/ and (?![^()]*\))/).map((c) => c.trim());
    expect(conditions.sort()).toEqual(CONSISTENCY_RULES.map((r) => r.sql).sort());
  });

  it("el tope de patterns_document_text_size es el del doble y mide document::text", () => {
    expect(lastConstraint("patterns_document_text_size")).toBe(`octet_length(document::text) <= ${DOCUMENT_TEXT_MAX}`);
  });

  it("jsonbTextBytes reproduce lo que midió Postgres para el peor documento (10_rls_check.sql: 269 235 y 617 595 bytes de texto de jsonb)", () => {
    const worst = (ch: string) => ({
      schemaVersion: 1, id: "i".repeat(64), title: ch.repeat(120), kind: "chart", technique: "knit",
      origin: { kind: "manual" },
      gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 },
      yarns: Array.from({ length: 32 }, (_, i) => ({
        id: `Y${i}`, weight: 4, composition: [{ fiber: "lana", percent: 50 }, { fiber: "algodon", percent: 50 }], color: { hex: "#BA222C" }, note: ch.repeat(500),
      })),
      notes: Array.from({ length: 50 }, () => ch.repeat(2000)),
      chart: {
        width: 200, height: 200, repeat: { x: 500, y: 500 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up",
        cells: Array.from({ length: 40_000 }, (_, k) => ((k + 1) * 7919) % 32),
      },
    });
    expect(jsonbTextBytes(worst("a"))).toBe(269_235);
    expect(jsonbTextBytes(worst("😀"))).toBe(617_595);
  });

  describe("rechaza (23514) lo que la base rechaza", () => {
    const base = () => doc() as unknown as Record<string, unknown>;
    const cases: [string, Record<string, unknown>, Record<string, unknown>?][] = [
      ["document.title distinto de title", { ...base(), title: "Otro" }],
      ["documento sin título", (({ title: _t, ...rest }) => rest)(base())],
      ["título que no es texto", { ...base(), title: 123 }],
      ["kind distinto", { ...base(), kind: "written" }],
      ["technique distinta", { ...base(), technique: "crochet" }],
      ["schemaVersion distinta", { ...base(), schemaVersion: 2 }],
      ["origen del documento distinto de la columna", { ...base(), origin: { kind: "ai_edited" } }],
      ["yarns que no es arreglo", { ...base(), yarns: { A: { note: "secreto" } } }],
    ];
    for (const [name, document] of cases) {
      it(name, async () => {
        const r = await insertRow({ id: ID, title: "Gorro", schema_version: 1, document, technique: "knit", kind: "chart", origin: "manual" });
        expect(r.error?.code).toBe("23514");
        expect(db.rows).toEqual([]);
      });
    }

    it("el documento válido sí entra (control)", async () => {
      const r = await insertRow({ id: ID, title: "Gorro", schema_version: 1, document: base() });
      expect(r.error).toBeNull();
    });

    it("tope por texto de jsonb, no por JSON compacto: 700 KB compactos de números cortos superan 1 MB en la base", async () => {
      const document = { ...base(), extra: Array(350_000).fill(0) };
      expect(Buffer.byteLength(JSON.stringify(document))).toBeLessThan(DOCUMENT_TEXT_MAX);
      expect(jsonbTextBytes(document)).toBeGreaterThan(DOCUMENT_TEXT_MAX);
      const r = await insertRow({ id: ID, title: "Gorro", schema_version: 1, document });
      expect(r.error?.code).toBe("23514");
    });
  });
});

// ---------------------------------------------------------------- savePattern y el cliente

describe("savePattern ignora lo que intenta imponer el cliente", () => {
  it("claves de columnas dentro del documento (owner_id, visibility, updated_at, created_at) hacen que no se guarde (ADR 0003 E16)", async () => {
    const row = seedMine();
    const sneaky = { ...doc({ title: "Nuevo" }), owner_id: "33333333-3333-4333-8333-333333333333", visibility: "public", updated_at: "2099-01-01T00:00:00Z", created_at: "2000-01-01T00:00:00Z" };
    const r = await savePattern(ID, sneaky, row.updated_at);
    expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    if (!r.ok) expect(r.issues?.some((i) => i.code === "UNKNOWN_KEY")).toBe(true);
    expect(writes().some((l) => l.op === "update")).toBe(false);
    expect(db.rows[0]).toMatchObject({ owner_id: ANA, visibility: "private", origin: "manual", title: "Gorro", updated_at: row.updated_at });
  });

  it("un documento que se declara de IA no convierte en IA un diseño manual: no se guarda", async () => {
    const row = seedMine();
    const fake = { ...doc({ title: "Falso IA" }), origin: { kind: "ai", model: "claude" } };
    const r = await savePattern(ID, fake, row.updated_at);
    expect(r.ok).toBe(false);
    expect(db.rows[0]).toMatchObject({ origin: "manual", title: "Gorro" });
    expect((db.rows[0]!.document.origin as { kind: string }).kind).toBe("manual");
  });

  it("un diseño de IA conserva la etiqueta aunque el cliente mande origin manual: queda ai_edited en columna y documento", async () => {
    const ai = { ...doc(), origin: { kind: "ai" as const, model: "claude" } } as ChartPattern;
    const row = seedMine(ai, { origin: "ai" });
    const r = await savePattern(ID, { ...doc({ title: "Retocado" }), origin: { kind: "manual" } }, row.updated_at);
    expect(r).toMatchObject({ ok: true });
    expect(db.rows[0]!.origin).toBe("ai_edited");
    expect((db.rows[0]!.document.origin as { kind: string }).kind).toBe("ai_edited");
  });

  it("technique o kind distintos de la fila no se guardan (validador o base)", async () => {
    const row = seedMine();
    for (const bad of [{ ...doc(), technique: "crochet" }, { ...doc(), kind: "written" }]) {
      const r = await savePattern(ID, bad, row.updated_at);
      expect(r.ok).toBe(false);
    }
    expect(db.rows[0]).toMatchObject({ technique: "knit", kind: "chart", title: "Gorro", updated_at: row.updated_at });
  });
});

// ---------------------------------------------------------------- conflicto con microsegundos

describe("concurrencia optimista con microsegundos", () => {
  it("instantMicros (del doble) compara como timestamptz: mismo instante con otro desfase o menos dígitos", () => {
    expect(instantMicros("2026-11-06T10:00:00.123456+00:00")).toBe(instantMicros("2026-11-06T07:00:00.123456-03:00"));
    expect(instantMicros("2026-11-06T10:00:00.12+00:00")).toBe(instantMicros("2026-11-06T10:00:00.120000+00"));
    expect(instantMicros("2026-11-06T10:00:00.123456+00:00")).not.toBe(instantMicros("2026-11-06T10:00:00.123457+00:00"));
  });

  it("un microsegundo de diferencia (antes o después) es CONFLICT y no escribe", async () => {
    const row = seedMine(doc(), { updated_at: "2026-11-06T10:00:00.500005+00:00" });
    for (const expected of ["2026-11-06T10:00:00.500004+00:00", "2026-11-06T10:00:00.500006+00:00", "2026-11-06T10:00:00.5+00:00"]) {
      const r = await savePattern(ID, doc({ title: "Mío" }), expected);
      expect(r).toMatchObject({ ok: false, code: "CONFLICT", currentUpdatedAt: row.updated_at });
    }
    expect(db.rows[0]!.title).toBe("Gorro");
  });

  it("el mismo instante escrito de otra forma (desfase -03:00, ceros finales recortados) guarda, como en Postgres", async () => {
    seedMine(doc(), { updated_at: "2026-11-06T10:00:00.120000+00:00" });
    const a = await savePattern(ID, doc({ title: "Uno" }), "2026-11-06T07:00:00.12-03:00");
    expect(a).toMatchObject({ ok: true });
  });

  it("más de 6 decimales o un desfase raro: INVALID_REQUEST sin consultar la base", async () => {
    seedMine();
    for (const bad of ["2026-11-06T10:00:00.1234567+00:00", "2026-11-06T10:00:00.1+0", "2026-11-06T10:00:00.1+00:00:00", "2026-11-06"]) {
      expect(await savePattern(ID, doc(), bad)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    }
    expect(db.log).toEqual([]);
  });

  it("dos guardados simultáneos con el mismo updatedAt: exactamente uno gana; el otro recibe el updatedAt del ganador", async () => {
    const row = seedMine();
    const [a, b] = await Promise.all([savePattern(ID, doc({ title: "Pestaña A" }), row.updated_at), savePattern(ID, doc({ title: "Pestaña B" }), row.updated_at)]);
    const wins = [a, b].filter((r) => r.ok);
    expect(wins).toHaveLength(1);
    const loser = [a, b].find((r) => !r.ok)!;
    expect(loser).toMatchObject({ code: "CONFLICT", currentUpdatedAt: (wins[0] as { updatedAt: string }).updatedAt });
  });
});

// ---------------------------------------------------------------- textos que jsonb no acepta y tamaño

describe("textos que el validador acepta pero jsonb no", () => {
  // Hallazgo de QA (T4): validatePattern acepta U+0000 en el título y las notas; Postgres lo
  // rechaza con 22P05 y dbErrorCode lo traduce a DATABASE ("Revisa tu conexión e intenta de
  // nuevo en unos minutos"): un mensaje falso y un autoguardado que nunca se recupera.
  // Corregido: dbErrorCode traduce 22P05 y 22P02 a REJECTED_BY_DATABASE (y el validador lo rechaza antes, E16).
  it("un título con U+0000 (pegado de un PDF) no da un error de conexión", async () => {
    const row = seedMine();
    const d = doc({ title: "Gorro\u0000rojo" });
    // Neutral frente al validador: con E16 lo rechaza antes (NOT_SAVABLE); sin él, la base (REJECTED_BY_DATABASE).
    const r = await savePattern(ID, d, row.updated_at);
    expect(r.ok).toBe(false);
    expect(r).not.toMatchObject({ code: "DATABASE" });
  });

  it("dbErrorCode: 22P05 y 22P02 son REJECTED_BY_DATABASE (no 'revisa tu conexión'); 54000 depende de la operación", () => {
    expect(dbErrorCode({ code: "22P05" })).toBe("REJECTED_BY_DATABASE");
    expect(dbErrorCode({ code: "22P02" })).toBe("REJECTED_BY_DATABASE");
    expect(dbErrorCode({ code: "54000" }, "create")).toBe("QUOTA");
    expect(dbErrorCode({ code: "54000" })).toBe("MAX_VERSIONS");
    expect(DESIGN_MESSAGES.REJECTED_BY_DATABASE).toMatch(/carácter que no se puede guardar/);
    expect(DESIGN_MESSAGES.REJECTED_BY_DATABASE).not.toMatch(/conexión/);
  });

  it("un sustituto UTF-16 suelto lo detiene el validador (TEXT_CONTROL_CHAR, ADR 0003 E16) y no se guarda", async () => {
    const row = seedMine();
    const d = doc({ title: "Gorro \ud83d" });
    const r = await savePattern(ID, d, row.updated_at);
    expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    if (!r.ok) expect(r.issues?.some((i) => i.code === "TEXT_CONTROL_CHAR")).toBe(true);
    expect(db.rows[0]!.title).toBe("Gorro");
  });

  it("con el documento cerrado (ADR 0003 E16) ya no se puede inflar un documento con datos arbitrarios: NOT_SAVABLE antes de llegar a la base", async () => {
    // Antes era un riesgo aceptado (ADR 0006): una clave extra cabía bajo 750 KB compactos y
    // superaba 1 MB en jsonb. Con el documento cerrado no es savable y el servidor no lo envía;
    // el peor documento válido (617.595 bytes de texto jsonb) sigue bajo el tope de la base.
    const row = seedMine();
    const d = { ...doc(), extra: Array(370_000).fill(0) };
    expect(validatePattern(d).savable).toBe(false);
    const r = await savePattern(ID, d, row.updated_at);
    expect(r).toMatchObject({ ok: false });
    expect(writes().some((l) => l.op === "update")).toBe(false);
    expect(db.rows[0]!.document.extra).toBeUndefined();
  });
});

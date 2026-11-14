/**
 * Migraciones (ADR 0003, sección 5; ADR 0011, sección 5): `STEPS[1]` (v1 → v2) y las
 * propiedades M1 a M4 (criterio CA4-M1). M1 compara contra el validador v1 congelado
 * (`support/validate-v1.ts`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BALL_TEXT,
  ballPart,
  ballPattern,
  smallChart,
  yarnA,
  yarnB,
} from "./support/fixtures.ts";
import {
  NO_STITCH,
  SCHEMA_VERSION,
  concreteRounds,
  migratePattern,
  parsePart,
  rowStitchCounts,
  stitchTotal,
  summarizePart,
  validatePattern,
  yarnUsage,
  type ChartPattern,
  type ChartPatternV1,
  type Issue,
  type PatternV1,
  type WrittenPattern,
  type WrittenPatternV1,
} from "../src/index.ts";
import { fixtureAPart, fixtureBPart } from "./support/amigurumi.ts";
import { forAll, type Rng } from "./support/property.ts";
import { validatePatternV1 } from "./support/validate-v1.ts";
import { genWrittenV1, genWrittenV2 } from "./support/written-gen.ts";

/** Un documento del repositorio, tal como se guardaba en la v1. */
function asV1(doc: ChartPattern): ChartPatternV1;
function asV1(doc: WrittenPattern): WrittenPatternV1;
function asV1(doc: ChartPattern | WrittenPattern): PatternV1 {
  return { ...(structuredClone(doc) as object), schemaVersion: 1 } as PatternV1;
}

/** Fixtures v1 del paquete: los de `support/fixtures.ts`, los textos de ejemplo y los de los casos de dominio. */
function v1Fixtures(): PatternV1[] {
  const ball = parsePart(BALL_TEXT, { id: "bolita" });
  assert.ok(ball.ok);
  const written = (parts: WrittenPatternV1["parts"], id: string): WrittenPatternV1 => ({ ...asV1(ballPattern()), id, parts });
  return [
    asV1(smallChart()),
    asV1(ballPattern()),
    written([ball.value], "p-texto"),
    written([fixtureAPart()], "p-fixture-a"),
    written([fixtureBPart()], "p-fixture-b"),
    written([ballPart(), { ...fixtureAPart(), id: "cuerpo" }], "p-dos-partes"),
    // Hileras con cadeneta base, que ya eran advertencia en la v1.
    written([{ id: "panel", name: "Panel", construction: "flat", start: { type: "chain", count: 11 }, startYarn: "A", rounds: [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: 10 }], expected: 10 }] }], "p-panel"),
  ];
}

/** Gráfico v1 al azar (válido o con errores de tejido). */
function genChartV1(r: Rng): ChartPatternV1 {
  const width = r.int(1, 8);
  const height = r.int(1, 8);
  const cells = Array.from({ length: width * height }, () => (r.bool(0.15) ? NO_STITCH : r.int(0, 1)));
  return {
    ...asV1(smallChart()),
    yarns: [structuredClone(yarnA), structuredClone(yarnB)],
    chart: { width, height, cells, repeat: { x: r.int(1, 6), y: r.int(1, 3) }, workedIn: r.pick(["rounds", "rows"] as const), renderAs: r.pick(["flat", "tube", "circle"] as const), direction: r.pick(["bottom_up", "top_down"] as const) },
  };
}

const genV1 = (r: Rng): PatternV1 => (r.bool(0.25) ? genChartV1(r) : genWrittenV1(r));

/** Códigos que la v2 puede sumar como advertencia o información (M1 enmendada por C-9). */
const NEW_NOTICE_CODES = new Set(["PART_START_RING_SHORT", "PART_START_FLAT_RING", "MAGIC_RING_UNUSUAL", "ROUND_GROWS_FAST", "ROUND_SHRINKS_FAST"]);

const key = (i: Issue) => `${i.code}@${i.path}`;
const sorted = (xs: string[]) => [...xs].sort();

/** Compara la validación v1 del documento con la v2 del documento migrado (M1). */
function checkM1(doc: PatternV1): void {
  const before = validatePatternV1(doc);
  const m = migratePattern(doc);
  assert.equal(m.ok, true);
  const after = validatePattern(m.document);

  const oldErrors = before.issues.filter((i) => i.severity === "error" && i.code !== "SCHEMA_VERSION");
  const newErrors = after.issues.filter((i) => i.severity === "error");
  // La única transición permitida de error a advertencia: la V1 sobre una cadeneta en aro.
  const relaxed = new Set(after.issues.filter((i) => i.severity === "warning" && i.code === "ROUND_CONSUMPTION_MISMATCH" && (i.data?.hints as string[] | undefined)?.includes("ring")).map(key));

  if (before.savable) assert.equal(after.savable, true, "un v1 savable migrado es savable");
  if (before.valid) assert.equal(after.valid, true, "un v1 valid migrado es valid");
  if (!before.savable) return; // M1 habla de documentos v1 valid o savable.

  assert.deepEqual(sorted(newErrors.map(key)), sorted(oldErrors.map(key).filter((k) => !relaxed.has(k))), "mismos códigos de error");
  const oldNotices = before.issues.filter((i) => i.severity !== "error").map(key);
  const newNotices = after.issues.filter((i) => i.severity !== "error").map(key);
  const remaining = [...newNotices];
  for (const k of oldNotices) {
    const at = remaining.indexOf(k);
    assert.ok(at >= 0, `la v2 no pierde la advertencia o información ${k}`);
    remaining.splice(at, 1);
  }
  for (const k of remaining) {
    const code = k.slice(0, k.indexOf("@"));
    assert.ok(NEW_NOTICE_CODES.has(code) || relaxed.has(k), `aviso nuevo no permitido: ${k}`);
  }
}

describe("migratePattern: v1 → v2 (STEPS[1])", () => {
  it("la v2 es la versión actual", () => {
    assert.equal(SCHEMA_VERSION, 2);
  });

  it("sube la versión con una copia, sin mutar la entrada ni tocar otros datos (gráfico y escrito)", () => {
    for (const doc of [asV1(smallChart()), asV1(ballPattern())]) {
      const before = structuredClone(doc);
      const m = migratePattern(doc);
      assert.equal(m.ok, true);
      assert.notEqual(m.document, doc);
      assert.deepEqual(doc, before, "no muta la entrada");
      assert.deepEqual(m.document, { ...before, schemaVersion: 2 });
      assert.deepEqual({ from: m.from, to: m.to, issues: m.issues }, { from: 1, to: SCHEMA_VERSION, issues: [] });
      assert.equal(validatePattern(m.document).valid, true);
      // La v1 sin migrar ya no es la versión actual: el validador la rechaza.
      assert.ok(validatePattern(doc).issues.some((i) => i.code === "SCHEMA_VERSION"));
    }
  });

  it("no transforma datos: notas y cierres de varias líneas, loop explícito y expected se conservan", () => {
    const doc = asV1(ballPattern());
    doc.parts[0]!.finish = "Rellenar.\nCerrar con la hebra.";
    doc.parts[0]!.rounds[0]!.note = "Coloca un marcador.\nAl inicio de la vuelta.";
    (doc.parts[0]!.rounds[1]!.items[0] as { loop?: string }).loop = "both";
    doc.assembly = ["Coser.", "Bordar los ojos."];
    const m = migratePattern(doc);
    assert.ok(m.ok);
    const out = m.document as WrittenPattern;
    assert.equal(out.parts[0]!.finish, "Rellenar.\nCerrar con la hebra.");
    assert.equal(out.parts[0]!.rounds[0]!.note, "Coloca un marcador.\nAl inicio de la vuelta.");
    assert.deepEqual(out.parts[0]!.rounds[1]!.items[0], { type: "stitch", stitch: "inc", count: 6, loop: "both" });
    assert.ok(!("copies" in out.parts[0]!), "no agrega copies");
    assert.ok(!("layout" in out), "no agrega layout");
  });

  it("schemaVersion queda en la misma posición de las claves", () => {
    const m = migratePattern(asV1(smallChart()));
    assert.deepEqual(Object.keys(m.document as object), Object.keys(smallChart()));
  });

  it("rechaza una versión futura con un error claro y deja el documento sin tocar", () => {
    const doc = { ...smallChart(), schemaVersion: 3 };
    const m = migratePattern(doc);
    assert.equal(m.document, doc);
    assert.equal(m.ok, false);
    assert.equal(m.from, 3);
    assert.equal(m.to, 3);
    assert.equal(m.issues.length, 1);
    assert.equal(m.issues[0]?.code, "SCHEMA_VERSION");
    assert.equal(m.issues[0]?.severity, "error");
    assert.match(m.issues[0]?.message ?? "", /versión de esquema 3/);
    assert.match(m.issues[0]?.message ?? "", /lee la 2/);
    assert.ok(validatePattern(m.document).issues.some((i) => i.code === "SCHEMA_VERSION"));
  });

  it("rechaza documentos sin versión o con versiones no válidas", () => {
    for (const input of [null, undefined, 3, "x", [], {}, { schemaVersion: "1" }, { schemaVersion: "2" }, { schemaVersion: 0 }, { schemaVersion: 1.5 }, { schemaVersion: Number.NaN }]) {
      const m = migratePattern(input);
      assert.equal(m.ok, false, JSON.stringify(input));
      assert.equal(m.document, input);
      assert.equal(m.issues[0]?.code, "SCHEMA_VERSION");
    }
    const none = migratePattern({});
    assert.equal(none.from, null);
    assert.equal(none.to, null);
    assert.match(none.issues[0]?.message ?? "", /no declara su versión/);
  });
});

describe("M1: un v1 valid o savable migrado conserva sus errores y solo suma avisos nuevos", () => {
  it("con todos los fixtures v1 del paquete", () => {
    for (const doc of v1Fixtures()) {
      assert.equal(validatePatternV1(doc).valid, true, `el fixture ${doc.id} es válido en la v1`);
      checkM1(doc);
    }
  });

  it("propiedad: documentos v1 al azar (gráficos y escritos, válidos y con desajustes)", () => {
    let savable = 0;
    forAll("M1", genV1, (doc) => {
      checkM1(doc);
      if (validatePatternV1(doc).savable) savable++;
    }, 400);
    assert.ok(savable >= 100, `se probaron ${savable} documentos v1 savable (se esperaban al menos 100)`);
  });

  it("la V1 con cadeneta en aro pasa de error a advertencia (C-9); desde la V2 sigue siendo error", () => {
    const doc = asV1(ballPattern());
    doc.parts[0]!.start = { type: "chain", count: 2 }; // "cad 2 y 6 pb en la 2.ª cadeneta" (F4-3)
    const before = validatePatternV1(doc);
    assert.ok(before.issues.some((i) => i.code === "ROUND_CONSUMPTION_MISMATCH" && i.severity === "error"));
    const after = validatePattern(migratePattern(doc).document);
    assert.equal(after.valid, true);
    const w = after.issues.find((i) => i.code === "ROUND_CONSUMPTION_MISMATCH");
    assert.equal(w?.severity, "warning");
    assert.equal(w?.path, "parts[0].rounds[0]");
  });

  it("los errores de conteo de la v1 siguen siendo errores, ahora de tejido (savable)", () => {
    const doc = asV1(ballPattern());
    doc.parts[0]!.rounds[2]!.expected = 20;
    assert.equal(validatePatternV1(doc).savable, false);
    const after = validatePattern(migratePattern(doc).document);
    assert.deepEqual(after.issues.filter((i) => i.severity === "error").map((i) => i.code), ["ROUND_COUNT_MISMATCH"]);
    assert.equal(after.valid, false);
    assert.equal(after.savable, true);
  });

  it("propiedad: la v2 nunca pierde un código de error de la v1 (salvo la V1 sobre cadeneta en aro)", () => {
    forAll("M1 errores", genV1, (doc) => {
      const before = validatePatternV1(doc).issues.filter((i) => i.severity === "error" && i.code !== "SCHEMA_VERSION");
      if (before.some((i) => i.code === "LIMIT")) return; // un LIMIT detiene antes el conteo en la v2
      const after = validatePattern(migratePattern(doc).document).issues;
      const relaxed = new Set(after.filter((i) => i.severity === "warning" && (i.data?.hints as string[] | undefined)?.includes("ring")).map(key));
      const errors = new Set(after.filter((i) => i.severity === "error").map(key));
      for (const i of before) assert.ok(errors.has(key(i)) || relaxed.has(key(i)), `se perdió ${key(i)}`);
    }, 300);
  });
});

describe("M2: migrar es idempotente", () => {
  it("un v2 devuelve el mismo objeto (===) y migrar dos veces un v1 no cambia el resultado", () => {
    forAll("M2", (r) => (r.bool(0.5) ? genV1(r) : genWrittenV2(r)), (doc) => {
      const once = migratePattern(doc);
      assert.equal(once.ok, true);
      const twice = migratePattern(once.document);
      assert.equal(twice.document, once.document);
      assert.deepEqual({ ok: twice.ok, from: twice.from, to: twice.to, issues: twice.issues }, { ok: true, from: SCHEMA_VERSION, to: SCHEMA_VERSION, issues: [] });
      if (doc.schemaVersion === SCHEMA_VERSION) assert.equal(once.document, doc);
    }, 200);
  });
});

describe("M3: los derivados no cambian al migrar", () => {
  it("gráficos: stitchTotal, rowStitchCounts y yarnUsage", () => {
    forAll("M3 gráfico", genChartV1, (doc) => {
      const out = migratePattern(doc).document as ChartPattern;
      const chart = doc.chart;
      assert.equal(stitchTotal(out.chart), stitchTotal(chart));
      assert.deepEqual(rowStitchCounts(out.chart), rowStitchCounts(chart));
      assert.deepEqual(yarnUsage(out.chart, out.yarns.length), yarnUsage(chart, doc.yarns.length));
    }, 150);
  });

  it("escritos: concreteRounds y summarizePart de cada parte", () => {
    forAll("M3 escrito", genWrittenV1, (doc) => {
      const out = migratePattern(doc).document as WrittenPattern;
      assert.equal(out.parts.length, doc.parts.length);
      doc.parts.forEach((p, i) => {
        assert.deepEqual(concreteRounds(out.parts[i]!), concreteRounds(p));
        assert.deepEqual(summarizePart(out.parts[i]!), summarizePart(p));
      });
    }, 200);
  });
});

describe("M4: migratePattern nunca lanza", () => {
  it("con v1 mutados al azar, valores primitivos y objetos con getters que lanzan", () => {
    const junk = (r: Rng): unknown => {
      const doc: Record<string, unknown> = structuredClone(genV1(r)) as unknown as Record<string, unknown>;
      const roll = r.int(0, 5);
      if (roll === 0) delete doc.kind;
      else if (roll === 1) doc.parts = r.pick([null, 3, "x", [null]]);
      else if (roll === 2) doc.schemaVersion = r.pick([1, 2, 3, -1, 0.5, "1", null]);
      else if (roll === 3) return r.pick([null, undefined, 0, "", [], {}, true]);
      else if (roll === 4) doc.layout = { placements: [{ target: { part: "x", copy: r.int(-2, 2) } }] };
      return doc;
    };
    forAll("M4", junk, (input) => {
      const m = migratePattern(input);
      assert.equal(typeof m.ok, "boolean");
      validatePattern(m.document);
    }, 300);
    const evil = Object.defineProperty({ schemaVersion: 1 }, "parts", { enumerable: true, get() { throw new Error("boom"); } });
    const m = migratePattern(evil);
    assert.equal(m.ok, false);
    assert.equal(m.issues[0]?.code, "SCHEMA_VERSION");
  });
});

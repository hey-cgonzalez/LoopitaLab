/** Migraciones (ADR 0003, sección 5). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCHEMA_VERSION, migratePattern, validatePattern } from "../src/index.ts";
import { ballPattern, smallChart } from "./support/fixtures.ts";

describe("migratePattern", () => {
  it("es la identidad para la versión 1 (gráfico y escrito)", () => {
    for (const doc of [smallChart(), ballPattern()]) {
      const before = structuredClone(doc);
      const m = migratePattern(doc);
      assert.equal(m.document, doc);
      assert.deepEqual(doc, before);
      assert.deepEqual({ from: m.from, to: m.to, ok: m.ok, issues: m.issues }, { from: 1, to: SCHEMA_VERSION, ok: true, issues: [] });
      assert.equal(validatePattern(m.document).valid, true);
    }
  });

  it("rechaza una versión futura con un error claro y deja el documento sin tocar", () => {
    const doc = { ...smallChart(), schemaVersion: 2 };
    const m = migratePattern(doc);
    assert.equal(m.document, doc);
    assert.equal(m.ok, false);
    assert.equal(m.from, 2);
    assert.equal(m.to, 2);
    assert.equal(m.issues.length, 1);
    assert.equal(m.issues[0]?.code, "SCHEMA_VERSION");
    assert.equal(m.issues[0]?.severity, "error");
    assert.match(m.issues[0]?.message ?? "", /versión de esquema 2/);
    // El validador informa lo mismo.
    assert.ok(validatePattern(m.document).issues.some((i) => i.code === "SCHEMA_VERSION"));
  });

  it("rechaza documentos sin versión o con versiones no válidas", () => {
    for (const input of [null, undefined, 3, "x", [], {}, { schemaVersion: "1" }, { schemaVersion: 0 }, { schemaVersion: 1.5 }, { schemaVersion: Number.NaN }]) {
      const m = migratePattern(input);
      assert.equal(m.ok, false, JSON.stringify(input));
      assert.equal(m.document, input);
      assert.equal(m.issues[0]?.code, "SCHEMA_VERSION");
    }
    const none = migratePattern({});
    assert.equal(none.from, null);
    assert.equal(none.to, 0);
    assert.match(none.issues[0]?.message ?? "", /no declara su versión/);
  });
});

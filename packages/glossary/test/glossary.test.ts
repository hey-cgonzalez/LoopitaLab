import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { DIALECTS, STITCHES, stitchAbbrev } from "@loopitalab/pattern-core";
import type { StitchCode } from "@loopitalab/pattern-core";
import { TERMS, roundWord, stitchLabel, stitchLabels, term, termDefinition, termEntry } from "../src/index.ts";
import type { GlossaryLocale } from "../src/index.ts";

const LOCALES: readonly GlossaryLocale[] = ["es", "en-US", "en-GB"];
const CODES = Object.keys(STITCHES) as StitchCode[];

describe("cobertura de puntos (CA4-G1)", () => {
  it("cada código de STITCHES tiene abreviatura y nombre en es, us y uk", () => {
    assert.ok(CODES.length > 0);
    for (const code of CODES) {
      for (const d of DIALECTS) {
        const l = stitchLabel(code, d);
        assert.ok(l.abbrev.length > 0, `${code}/${d}: abreviatura`);
        assert.ok(l.name.length > 0, `${code}/${d}: nombre`);
      }
    }
  });

  it("las abreviaturas son las de pattern-core, sin duplicarlas", () => {
    for (const code of CODES) {
      for (const d of DIALECTS) assert.equal(stitchLabel(code, d).abbrev, stitchAbbrev(code, d));
    }
  });

  it("stitchLabels lista todos los códigos en cada dialecto", () => {
    for (const d of DIALECTS) assert.deepEqual(stitchLabels(d).map((l) => l.code), CODES);
  });

  it("el punto bajo se llama dc en UK y sc en US (enmienda C-15)", () => {
    assert.equal(stitchLabel("sc", "uk").abbrev, "dc");
    assert.equal(stitchLabel("sc", "us").abbrev, "sc");
    assert.equal(stitchLabel("dc", "uk").abbrev, "tr");
  });

  it("todo rótulo de punto está pendiente", () => {
    for (const code of CODES) for (const d of DIALECTS) assert.equal(stitchLabel(code, d).status, "pendiente");
  });
});

describe("términos", () => {
  const REQUIRED = [
    "magic_ring", "foundation_chain", "spiral", "joined_rounds", "increase", "decrease",
    "invisible_decrease", "stuffing", "quantity", "fasten_off", "part",
    "turning_chain_up", "join_slip_stitch", "turning_chain",
  ] as const;

  it("están los términos de amigurumi y los de C-21", () => {
    for (const k of REQUIRED) assert.ok(termEntry(k), k);
  });

  it("las claves no se repiten", () => {
    assert.equal(new Set(TERMS.map((t) => t.key)).size, TERMS.length);
  });

  it("cada término tiene nombre y definición en los tres idiomas", () => {
    for (const t of TERMS) {
      for (const l of LOCALES) {
        assert.ok(term(t.key, l).length > 0, `${t.key}/${l}: nombre`);
        assert.ok((termDefinition(t.key, l) ?? "").length > 0, `${t.key}/${l}: definición`);
      }
    }
  });

  it("los atajos es, enUS y enGB coinciden con los textos", () => {
    for (const t of TERMS) {
      assert.equal(t.es, t.texts.es.name);
      assert.equal(t.enUS, t.texts["en-US"].name);
      assert.equal(t.enGB, t.texts["en-GB"].name);
    }
  });

  it("C-21: cadeneta de subida, pd de unión y cadeneta de giro dicen que no cuentan como puntos", () => {
    for (const k of ["turning_chain_up", "join_slip_stitch", "turning_chain"] as const) {
      const t = termEntry(k);
      assert.equal(t?.notAStitch, true, k);
      assert.match(t?.note ?? "", /no cuenta como punto/i, k);
    }
    assert.equal(term("turning_chain_up", "es"), "cadeneta de subida");
    assert.equal(term("join_slip_stitch", "es"), "pd de unión");
    assert.equal(term("turning_chain", "es"), "cadeneta de giro");
  });

  it("term: plural con respaldo al singular y clave desconocida", () => {
    assert.equal(term("round", "es", { plural: true }), "vueltas");
    assert.equal(term("magic_ring", "es", { plural: true }), "anillo mágico");
    assert.equal(term("nope" as never, "es"), "nope");
  });

  it("roundWord: vuelta en redondo, fila de ida y vuelta", () => {
    assert.equal(roundWord("spiral", "es"), "vuelta");
    assert.equal(roundWord("joined", "es"), "vuelta");
    assert.equal(roundWord("rounds", "es", { plural: true }), "vueltas");
    assert.equal(roundWord("flat", "es"), "fila");
    assert.equal(roundWord("rows", "en-GB", { plural: true }), "rows");
  });
});

describe("estado de validación", () => {
  it("todo término está pendiente (regla de oro 5)", () => {
    for (const t of TERMS) assert.equal(t.status, "pendiente", t.key);
  });
});

describe("variantes regionales sin respaldo (F4-69)", () => {
  it("no hay alias 'medio punto', 'pma', 'punto raso' ni 'punto bajísimo'", () => {
    const text = JSON.stringify(TERMS).toLowerCase();
    for (const bad of ["medio punto\"", "pma", "punto raso", "punto bajísimo", "p.bjs"]) {
      assert.ok(!text.includes(bad), bad);
    }
  });
});

describe("glosario sin marcas (CA4-G4)", () => {
  // Misma lista que la prueba de marcas de yarn-catalog (CA3-L11), más tiendas de referencia.
  const brands =
    /\b(lion brand|drops|katia|malabrigo|cascade|rowan|paons|ovejita|lanas gato|red heart|bernat|caron|patons|sirdar|orquidea|orquídea|revesderecho|reves derecho|revés derecho|modista)\b/i;

  it("los datos serializados no contienen marcas ni nombres de tienda", () => {
    assert.ok(!brands.test(JSON.stringify(TERMS)));
    for (const code of CODES) for (const d of DIALECTS) {
      const l = stitchLabel(code, d);
      assert.ok(!brands.test(`${l.abbrev} ${l.name}`), `${code}/${d}`);
    }
  });

  it("los archivos fuente del paquete tampoco", () => {
    const dir = new URL("../src/", import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      assert.ok(!brands.test(readFileSync(new URL(f, dir), "utf8")), f);
    }
  });
});

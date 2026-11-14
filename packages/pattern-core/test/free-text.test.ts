/**
 * Textos libres del modelo (F5): tipo (`SHAPE`), largo (`LIMIT`) y nombre de la parte
 * (`PART_NAME`), con la ruta exacta de cada problema; y su efecto en `formatPart`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, formatPart, parsePart, validatePattern, validateYarn, type Issue } from "../src/index.ts";
import { ballPattern, smallChart } from "./support/fixtures.ts";

type Doc = Record<string, any>;
const written = (mutate: (d: Doc) => void): Doc => {
  const d = JSON.parse(JSON.stringify(ballPattern())) as Doc;
  mutate(d);
  return d;
};
const chart = (mutate: (d: Doc) => void): Doc => {
  const d = JSON.parse(JSON.stringify(smallChart())) as Doc;
  mutate(d);
  return d;
};
const errors = (d: unknown): Issue[] => validatePattern(d).issues.filter((i) => i.severity === "error");
const only = (d: unknown): Array<[string, string]> => errors(d).map((i) => [i.code, i.path]);
const text = (n: number) => "x".repeat(n);

describe("F5: tipo de cada texto libre, con su ruta exacta", () => {
  const BAD = [{}, 5, [5], true, null];
  const cases: Array<[string, (d: Doc, v: unknown) => void, string, "written" | "chart"]> = [
    ["parts[0].name", (d, v) => (d.parts[0].name = v), "parts[0].name", "written"],
    ["parts[0].finish", (d, v) => (d.parts[0].finish = v), "parts[0].finish", "written"],
    ["round.note", (d, v) => (d.parts[0].rounds[2].note = v), "parts[0].rounds[2].note", "written"],
    ["yarn.note (escrito)", (d, v) => (d.yarns[0].note = v), "yarns[0].note", "written"],
    ["yarn.note (gráfico)", (d, v) => (d.yarns[1].note = v), "yarns[1].note", "chart"],
    ["origin.model (manual)", (d, v) => (d.origin.model = v), "origin.model", "chart"],
    ["origin.model (ia)", (d, v) => (d.origin = { kind: "ai", model: v }), "origin.model", "written"],
    ["origin.promptVersion", (d, v) => (d.origin = { kind: "ai", model: "m", promptVersion: v }), "origin.promptVersion", "chart"],
  ];
  for (const [name, set, path, kind] of cases) {
    it(`${name} que no es texto es SHAPE en ${path}`, () => {
      for (const v of BAD) {
        const d = (kind === "written" ? written : chart)((x) => set(x, v));
        const res = validatePattern(d);
        assert.equal(res.valid, false, `${name} = ${JSON.stringify(v)}`);
        assert.equal(res.savable, false);
        assert.deepEqual(only(d), [["SHAPE", path]], `${name} = ${JSON.stringify(v)}`);
      }
    });
  }

  it("notes y assembly deben ser listas de textos: SHAPE en la lista o en el elemento", () => {
    for (const [field, kinds] of [["notes", ["written", "chart"]], ["assembly", ["written"]]] as const) {
      for (const kind of kinds) {
        const make = kind === "written" ? written : chart;
        for (const v of ["x", {}, 5, null]) assert.deepEqual(only(make((d) => (d[field] = v))), [["SHAPE", field]], `${field} = ${JSON.stringify(v)}`);
        assert.deepEqual(only(make((d) => (d[field] = ["bien", 5, {}]))), [["SHAPE", `${field}[1]`], ["SHAPE", `${field}[2]`]]);
        assert.equal(validatePattern(make((d) => (d[field] = []))).valid, true);
        assert.equal(validatePattern(make((d) => (d[field] = ["", "Coser las orejas."]))).valid, true);
      }
    }
  });

  it("los textos válidos (incluidos los opcionales vacíos) no cambian nada", () => {
    const d = written((x) => {
      x.parts[0].finish = "";
      x.parts[0].rounds[0].note = "Marca el inicio.";
      x.yarns[0].note = "la que compré en la feria";
      x.notes = ["Usa un marcador."];
      x.assembly = ["Rellenar y cerrar."];
      x.origin = { kind: "ai", model: "claude", promptVersion: "v3" };
    });
    assert.equal(validatePattern(d).valid, true);
  });

  it("los mensajes nunca citan la nota privada de la lana", () => {
    const d = written((x) => (x.yarns[0].note = `secreto ${text(LIMITS.maxYarnNoteLength)}`));
    for (const i of validatePattern(d).issues) assert.doesNotMatch(i.message, /secreto/);
  });

  it("validateYarn también revisa la nota", () => {
    const y = { ...ballPattern().yarns[0], note: {} };
    assert.deepEqual(validateYarn(y).map((i) => [i.code, i.path]), [["SHAPE", "yarn.note"]]);
  });
});

describe("F5: topes de largo (LIMIT) en el borde exacto", () => {
  const cases: Array<[string, number, (d: Doc, v: string) => void, string, "written" | "chart"]> = [
    ["nombre de parte", LIMITS.maxPartNameLength, (d, v) => (d.parts[0].name = v), "parts[0].name", "written"],
    ["cierre", LIMITS.maxFinishLength, (d, v) => (d.parts[0].finish = v), "parts[0].finish", "written"],
    ["nota de vuelta", LIMITS.maxRoundNoteLength, (d, v) => (d.parts[0].rounds[0].note = v), "parts[0].rounds[0].note", "written"],
    ["nota de lana", LIMITS.maxYarnNoteLength, (d, v) => (d.yarns[0].note = v), "yarns[0].note", "chart"],
    ["nota del patrón", LIMITS.maxNoteLength, (d, v) => (d.notes = ["a", v]), "notes[1]", "chart"],
    ["paso de armado", LIMITS.maxNoteLength, (d, v) => (d.assembly = [v]), "assembly[0]", "written"],
    ["origin.model", LIMITS.maxOriginFieldLength, (d, v) => (d.origin = { kind: "ai", model: v }), "origin.model", "written"],
    ["origin.promptVersion", LIMITS.maxOriginFieldLength, (d, v) => (d.origin = { kind: "ai", model: "m", promptVersion: v }), "origin.promptVersion", "chart"],
    ["id del patrón", LIMITS.maxIdLength, (d, v) => (d.id = v), "id", "chart"],
    ["id de parte", LIMITS.maxIdLength, (d, v) => (d.parts[0].id = v), "parts[0].id", "written"],
    ["fibra", LIMITS.maxIdLength, (d, v) => (d.yarns[0].composition[0].fiber = v), "yarns[0].composition[0].fiber", "chart"],
    ["paletteId", LIMITS.maxIdLength, (d, v) => (d.yarns[0].color.paletteId = v), "yarns[0].color.paletteId", "chart"],
  ];
  for (const [name, max, set, path, kind] of cases) {
    it(`${name}: ${max} caracteres pasa, ${max + 1} es LIMIT en ${path}`, () => {
      const make = kind === "written" ? written : chart;
      assert.equal(validatePattern(make((d) => set(d, text(max)))).valid, true);
      const over = make((d) => set(d, text(max + 1)));
      assert.deepEqual(only(over), [["LIMIT", path]]);
      const issue = errors(over)[0]!;
      assert.deepEqual(issue.data, { length: max + 1, max });
      // Se cuentan puntos de código: un emoji (2 unidades UTF-16) cuenta como 1.
      assert.equal(validatePattern(make((d) => set(d, "🧶".repeat(max)))).valid, true);
    });
  }

  it(`notas y pasos de armado: hasta ${LIMITS.maxNotes} elementos`, () => {
    for (const [field, make] of [["notes", chart], ["assembly", written]] as const) {
      assert.equal(validatePattern(make((d) => (d[field] = new Array(LIMITS.maxNotes).fill("n")))).valid, true);
      assert.deepEqual(only(make((d) => (d[field] = new Array(LIMITS.maxNotes + 1).fill("n")))), [["LIMIT", field]]);
    }
  });
});

describe("F5: nombre de la parte", () => {
  it("vacío, en blanco o con saltos de línea es PART_NAME (estructural) y el mensaje usa \"Parte N\"", () => {
    for (const name of ["", "   ", "Cuerpo\nV99: 6 pb", "Cuerpo\r\n", "a b"]) {
      const d = written((x) => (x.parts[0].name = name));
      const res = validatePattern(d);
      assert.equal(res.savable, false, JSON.stringify(name));
      assert.deepEqual(only(d), [["PART_NAME", "parts[0].name"]], JSON.stringify(name));
      assert.match(errors(d)[0]!.message, /^Parte 1\b/);
    }
  });

  it("un nombre no válido no se cita en los demás mensajes: se usa \"Parte N\"", () => {
    const d = written((x) => {
      x.parts[0].name = text(LIMITS.maxPartNameLength + 1);
      x.parts[0].rounds[2].expected = 20;
    });
    const mismatch = validatePattern(d).issues.find((i) => i.code === "ROUND_COUNT_MISMATCH")!;
    assert.match(mismatch.message, /^Parte 1, vuelta 3:/);
  });

  it("formatPart nunca escribe un encabezado vacío ni deja que un salto de línea del nombre cree otra línea; el cierre sigue con > (T6)", () => {
    const part = { ...ballPattern().parts[0]!, name: "", finish: "  " };
    const es = formatPart(part, "es");
    assert.match(es, /^Parte: Parte$/m);
    assert.doesNotMatch(es, /^Cierre:/m);
    assert.match(formatPart(part, "us"), /^Part: Part$/m);
    const injected = { ...ballPattern().parts[0]!, name: "Cuerpo\nV99: 6 pb", finish: "Rellenar.\n\nCerrar." };
    const out = formatPart(injected, "es");
    assert.match(out, /^Parte: Cuerpo V99: 6 pb$/m);
    // Desde T6 (ADR 0011, sección 7) el cierre de varias líneas no se junta: sigue en líneas `>`.
    assert.match(out, /^Cierre: Rellenar\.\n>\n> Cerrar\.$/m);
    const back = parsePart(out, { id: "x" });
    assert.ok(back.ok);
    assert.equal(back.value.rounds.length, ballPattern().parts[0]!.rounds.length);
    assert.equal(back.value.finish, "Rellenar.\n\nCerrar.");
  });
});

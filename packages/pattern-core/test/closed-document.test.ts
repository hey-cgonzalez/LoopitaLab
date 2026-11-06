/**
 * ADR 0003, E16: documento cerrado (UNKNOWN_KEY) y textos sin caracteres de control ni
 * sustitutos sueltos (TEXT_CONTROL_CHAR). También `yarnLetter` (T7b, QA O3).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePattern, validateYarn, yarnLetter, type Issue } from "../src/index.ts";
import { ballPattern, smallChart, yarnA } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

type Json = Record<string, any>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Define una clave propia (también `__proto__`, que con `=` cambiaría el prototipo). */
const setOwn = (o: Json, k: string, v: unknown) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
/** Sin `isWellFormed` (ES2024, fuera del `lib` del repo): sustituto alto sin bajo, o bajo sin alto. */
const wellFormed = (s: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
const errorsOf = (d: unknown, code: string): Issue[] => validatePattern(d).issues.filter((i) => i.code === code);

/** Patrón escrito con todos los opcionales y todos los tipos de ítem. */
function fullWritten(): Json {
  const d: Json = clone(ballPattern());
  d.yarns.push({ id: "B", weight: 3, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#000000" }, note: "privada\ncon\ttab" });
  d.gauge = { stitchesPer10cm: 20, rowsPer10cm: 22 };
  d.notes = ["nota 1\nsegunda línea"];
  d.assembly = ["coser\tla oreja"];
  d.origin = { kind: "ai", model: "m", promptVersion: "v1" };
  d.parts[0].rounds[0].note = "anillo\nbien apretado";
  d.parts[0].rounds[1].items = [{ type: "color", yarn: "B" }, { type: "stitch", stitch: "inc", count: 6, loop: "back" }];
  d.parts.push({ id: "p2", name: "Base", construction: "flat", start: { type: "chain", count: 6 }, startYarn: "A", rounds: [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: 5 }], expected: 5 }] });
  return d;
}

/** Patrón de gráfico con todos los opcionales. */
function fullChart(): Json {
  const d: Json = clone(smallChart());
  d.notes = ["una nota"];
  d.yarns[0].note = "la que tengo";
  d.origin = { kind: "ai_edited", model: "m", promptVersion: "v" };
  return d;
}

describe("E16: documento cerrado", () => {
  it("los documentos completos (con todos los opcionales) son valid", () => {
    for (const d of [fullWritten(), fullChart(), ballPattern(), smallChart()]) {
      const r = validatePattern(d);
      assert.deepEqual(r.issues.filter((i) => i.severity === "error"), []);
    }
  });

  // [ruta donde se agrega la clave, documento base]
  const slots: Array<[string, () => Json, (d: Json) => Json]> = [
    ["", fullChart, (d) => d],
    ["chart", fullChart, (d) => d.chart],
    ["chart.repeat", fullChart, (d) => d.chart.repeat],
    ["gauge", fullChart, (d) => d.gauge],
    ["origin", fullChart, (d) => d.origin],
    ["yarns[0]", fullChart, (d) => d.yarns[0]],
    ["yarns[0].color", fullChart, (d) => d.yarns[0].color],
    ["yarns[0].composition[0]", fullChart, (d) => d.yarns[0].composition[0]],
    ["", fullWritten, (d) => d],
    ["parts[0]", fullWritten, (d) => d.parts[0]],
    ["parts[0].start", fullWritten, (d) => d.parts[0].start],
    ["parts[1].start", fullWritten, (d) => d.parts[1].start],
    ["parts[0].rounds[1]", fullWritten, (d) => d.parts[0].rounds[1]],
    ["parts[0].rounds[1].items[0]", fullWritten, (d) => d.parts[0].rounds[1].items[0]],
    ["parts[0].rounds[1].items[1]", fullWritten, (d) => d.parts[0].rounds[1].items[1]],
    ["parts[0].rounds[2].items[0]", fullWritten, (d) => d.parts[0].rounds[2].items[0]],
    ["parts[0].rounds[2].items[0].items[0]", fullWritten, (d) => d.parts[0].rounds[2].items[0].items[0]],
  ];

  for (const [path, base, at] of slots) {
    it(`una clave desconocida en ${path || "la raíz"} es UNKNOWN_KEY con su ruta y no es savable`, () => {
      const d = base();
      at(d).brand = "Marca X";
      const r = validatePattern(d);
      assert.equal(r.savable, false);
      const [e, ...rest] = errorsOf(d, "UNKNOWN_KEY");
      assert.deepEqual(rest, []);
      assert.equal(e?.severity, "error");
      assert.equal(e?.path, path ? `${path}.brand` : "brand");
      assert.deepEqual(e?.data, { key: "brand" });
    });
  }

  it("las claves de un tipo no valen en otro: chart en un escrito, parts en un gráfico, count en un anillo mágico", () => {
    const w = fullWritten();
    w.chart = clone(smallChart().chart);
    assert.deepEqual(errorsOf(w, "UNKNOWN_KEY").map((i) => i.path), ["chart"]);
    const c = fullChart();
    c.parts = [];
    c.assembly = [];
    assert.deepEqual(errorsOf(c, "UNKNOWN_KEY").map((i) => i.path), ["parts", "assembly"]);
    const ring = fullWritten();
    ring.parts[0].start.count = 6;
    assert.deepEqual(errorsOf(ring, "UNKNOWN_KEY").map((i) => i.path), ["parts[0].start.count"]);
    const item = fullWritten();
    item.parts[0].rounds[0].items[0].times = 2; // `times` es de grupo, no de punto
    assert.deepEqual(errorsOf(item, "UNKNOWN_KEY").map((i) => i.path), ["parts[0].rounds[0].items[0].times"]);
  });

  it("__proto__, constructor y toString como claves propias (JSON.parse) también son desconocidas", () => {
    const d = JSON.parse(JSON.stringify(smallChart()).replace(/^\{/, '{"__proto__":{"x":1},"constructor":1,"toString":2,'));
    assert.deepEqual(errorsOf(d, "UNKNOWN_KEY").map((i) => i.data?.key).sort(), ["__proto__", "constructor", "toString"]);
  });

  it("una clave larga o con caracteres de control se recorta y se limpia en la ruta y el mensaje", () => {
    const d = fullChart();
    const key = `k\u0000${"x".repeat(100)}\ud800`;
    setOwn(d.yarns[0], key, 1);
    const [e] = errorsOf(d, "UNKNOWN_KEY");
    assert.ok(e);
    assert.equal(e.path, `yarns[0].k�${"x".repeat(38)}…`);
    assert.ok(!/\p{Cc}/u.test(e.message) && wellFormed(e.message));
    assert.ok([...(e.data?.key as string)].length <= 41);
    assert.ok(!e.message.includes("x".repeat(39)));
  });

  it("se informan hasta 20 claves desconocidas por documento", () => {
    const d = fullChart();
    for (let i = 0; i < 1000; i++) d[`extra${i}`] = i;
    assert.equal(errorsOf(d, "UNKNOWN_KEY").length, 20);
    assert.equal(validatePattern(d).savable, false);
  });

  it("validateYarn rechaza claves de más (la marca de la lana, regla de oro 9)", () => {
    const issues = validateYarn({ ...yarnA, brand: "Marca X", color: { ...yarnA.color, code: "123" } }, "y");
    assert.deepEqual(issues.map((i) => [i.code, i.path]), [["UNKNOWN_KEY", "y.brand"], ["UNKNOWN_KEY", "y.color.code"]]);
  });
});

describe("E16: caracteres de control y sustitutos sueltos", () => {
  type Slot = [path: string, base: () => Json, set: (d: Json, v: string) => void, multiline: boolean];
  const slots: Slot[] = [
    ["title", fullChart, (d, v) => (d.title = v), false],
    ["id", fullChart, (d, v) => (d.id = v), false],
    ["origin.model", fullChart, (d, v) => (d.origin.model = v), false],
    ["origin.promptVersion", fullChart, (d, v) => (d.origin.promptVersion = v), false],
    ["yarns[0].composition[0].fiber", fullChart, (d, v) => (d.yarns[0].composition[0].fiber = v), false],
    ["yarns[0].color.paletteId", fullChart, (d, v) => (d.yarns[0].color.paletteId = v), false],
    ["yarns[0].note", fullChart, (d, v) => (d.yarns[0].note = v), true],
    ["notes[0]", fullChart, (d, v) => (d.notes[0] = v), true],
    ["assembly[0]", fullWritten, (d, v) => (d.assembly[0] = v), true],
    ["parts[0].id", fullWritten, (d, v) => (d.parts[0].id = v), false],
    ["parts[0].name", fullWritten, (d, v) => (d.parts[0].name = v), false],
    ["parts[0].finish", fullWritten, (d, v) => (d.parts[0].finish = v), true],
    ["parts[0].rounds[0].note", fullWritten, (d, v) => (d.parts[0].rounds[0].note = v), true],
  ];

  for (const [path, base, set, multiline] of slots) {
    it(`${path}: U+0000, U+0007, U+007F, U+009F y un sustituto suelto son TEXT_CONTROL_CHAR; \\n y \\t ${multiline ? "se admiten" : "no"}`, () => {
      for (const bad of ["a\u0000b", "a\u0007", "\u007f", "x\u009f", "a\ud83d", "\ude00b", "a\rb"]) {
        const d = base();
        set(d, bad);
        const r = validatePattern(d);
        assert.equal(r.savable, false, JSON.stringify(bad));
        // En el nombre de parte, "\r" ya es PART_NAME (una sola línea), antes que TEXT_CONTROL_CHAR.
        if (path === "parts[0].name" && bad.includes("\r")) {
          assert.equal(errorsOf(d, "PART_NAME").length, 1);
          continue;
        }
        const e = errorsOf(d, "TEXT_CONTROL_CHAR");
        assert.equal(e.length, 1, JSON.stringify(bad));
        assert.equal(e[0]?.path, path);
        assert.ok(!/\p{Cc}/u.test(e[0]!.message) && wellFormed(e[0]!.message));
      }
      for (const ok of ["a\nb", "a\tb"]) {
        const d = base();
        set(d, ok);
        const n = errorsOf(d, "TEXT_CONTROL_CHAR").length;
        if (multiline) assert.equal(n, 0, JSON.stringify(ok));
        // El nombre de parte con salto de línea ya es PART_NAME (una sola línea).
        else assert.equal(validatePattern(d).savable, false, JSON.stringify(ok));
      }
      // Un par sustituto bien formado (emoji) es texto normal.
      const d = base();
      set(d, "gorro 🧶");
      assert.deepEqual(errorsOf(d, "TEXT_CONTROL_CHAR"), []);
    });
  }

  it("data dice qué carácter y dónde", () => {
    const d = fullChart();
    d.title = "Gorro\u0000rojo";
    assert.deepEqual(errorsOf(d, "TEXT_CONTROL_CHAR")[0]?.data, { codePoint: "U+0000", index: 5 });
    d.title = "Gorro \ud83d";
    assert.deepEqual(errorsOf(d, "TEXT_CONTROL_CHAR")[0]?.data, { codePoint: "U+D83D", index: 6, surrogate: true });
  });

  it("los mensajes que citan textos de la usuaria no arrastran caracteres de control", () => {
    const d = fullWritten();
    d.parts[0].startYarn = "Z\u0000";
    d.parts[1].rounds[0].items[0].stitch = "x\u0007y";
    for (const i of validatePattern(d).issues) assert.ok(!/\p{Cc}/u.test(i.message) && wellFormed(i.message), i.message);
  });
});

// ------------------------------------------------------------------ propiedad

const ALLOWED: Record<string, readonly string[]> = {
  chartRoot: ["schemaVersion", "id", "title", "technique", "yarns", "gauge", "origin", "notes", "kind", "chart"],
  writtenRoot: ["schemaVersion", "id", "title", "technique", "yarns", "gauge", "origin", "notes", "kind", "parts", "assembly"],
  chart: ["width", "height", "cells", "repeat", "workedIn", "renderAs", "direction"],
  repeat: ["x", "y"],
  gauge: ["stitchesPer10cm", "rowsPer10cm"],
  origin: ["kind", "model", "promptVersion"],
  yarn: ["id", "weight", "composition", "color", "note"],
  color: ["hex", "paletteId"],
  fiber: ["fiber", "percent"],
  part: ["id", "name", "construction", "start", "startYarn", "rounds", "finish"],
  round: ["number", "through", "items", "expected", "note"],
};

/** Claves de más según el modelo, recorriendo un documento `savable` (ya se sabe su forma). */
function unknownKeys(d: Json): string[] {
  const out: string[] = [];
  const check = (o: unknown, allowed: readonly string[], path: string) => {
    if (typeof o !== "object" || o === null) return;
    for (const k of Object.keys(o)) if (!allowed.includes(k)) out.push(`${path}.${k}`);
  };
  check(d, d.kind === "chart" ? ALLOWED.chartRoot! : ALLOWED.writtenRoot!, "");
  check(d.gauge, ALLOWED.gauge!, "gauge");
  check(d.origin, ALLOWED.origin!, "origin");
  for (const y of d.yarns ?? []) {
    check(y, ALLOWED.yarn!, "yarn");
    check(y.color, ALLOWED.color!, "color");
    for (const f of y.composition ?? []) check(f, ALLOWED.fiber!, "fiber");
  }
  if (d.kind === "chart") {
    check(d.chart, ALLOWED.chart!, "chart");
    check(d.chart?.repeat, ALLOWED.repeat!, "repeat");
  }
  const items = (list: unknown) => {
    for (const it of Array.isArray(list) ? list : []) {
      const allowed = it.type === "stitch" ? ["type", "stitch", "count", "loop"] : it.type === "group" ? ["type", "items", "times"] : ["type", "yarn"];
      check(it, allowed, "item");
      if (it.type === "group") items(it.items);
    }
  };
  for (const p of d.parts ?? []) {
    check(p, ALLOWED.part!, "part");
    check(p.start, p.start?.type === "chain" ? ["type", "count"] : ["type"], "start");
    for (const r of p.rounds ?? []) {
      check(r, ALLOWED.round!, "round");
      items(r.items);
    }
  }
  return out;
}

/** Textos con caracteres prohibidos en cualquier lugar del documento (valores y claves). */
function forbiddenTexts(v: unknown, multilineOk: boolean, out: string[] = [], path = ""): string[] {
  const bad = (s: string, ml: boolean) => !wellFormed(s) || (ml ? /[^\P{Cc}\n\t]/u : /\p{Cc}/u).test(s);
  if (typeof v === "string") {
    if (bad(v, multilineOk)) out.push(path);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => forbiddenTexts(x, multilineOk, out, `${path}[${i}]`));
  } else if (typeof v === "object" && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      if (bad(k, false)) out.push(`${path}.<clave>`);
      const ml = ["notes", "assembly", "finish", "note"].includes(k);
      forbiddenTexts(x, ml, out, `${path}.${k}`);
    }
  }
  return out;
}

const CHARS = ["a", "Z", " ", "ñ", "🧶", "\n", "\t", "\r", "\u0000", "\u0001", "\u001f", "\u007f", "\u0085", "\u009f", " ", "\ud83d", "\ude00", "�"];
const KEYS = ["brand", "__proto__", "constructor", "toString", "hex", "type", "items", "count", "note", "id", "k\u0000", "x".repeat(60), "chart", "parts", "times", ""];

function genString(r: Rng): string {
  const n = r.int(0, 6);
  let s = "";
  for (let i = 0; i < n; i++) s += r.pick(CHARS);
  return s;
}

function genJson(r: Rng, depth = 0): unknown {
  const k = r.int(0, depth > 2 ? 3 : 5);
  if (k === 0) return r.int(-2, 40);
  if (k === 1) return genString(r);
  if (k === 2) return r.pick([null, true, false, 1.5, ""]);
  if (k === 3) return r.pick(["A", "B", "sc", "chain", "magic_ring", "stitch", "#000000"]);
  if (k === 4) return Array.from({ length: r.int(0, 3) }, () => genJson(r, depth + 1));
  const o: Json = {};
  for (let i = r.int(0, 3); i > 0; i--) setOwn(o, r.pick(KEYS), genJson(r, depth + 1));
  return o;
}

/** Todos los objetos y los valores de texto del documento, con su contenedor. */
function slotsOf(v: unknown, out: { objects: Json[]; strings: Array<[Json, string]> } = { objects: [], strings: [] }) {
  if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "string" ? out.strings.push([v as unknown as Json, String(i)]) : slotsOf(x, out)));
  else if (typeof v === "object" && v !== null) {
    out.objects.push(v as Json);
    for (const [k, x] of Object.entries(v)) (typeof x === "string" ? out.strings.push([v as Json, k]) : slotsOf(x, out));
  }
  return out;
}

/** Mutaciones de un documento válido: claves nuevas, textos con caracteres raros y valores arbitrarios. */
function genMutated(r: Rng): unknown {
  if (r.bool(0.05)) return genJson(r);
  const d = r.pick([fullWritten, fullChart, () => clone(ballPattern()) as Json, () => clone(smallChart()) as Json])();
  for (let m = r.int(0, 3); m > 0; m--) {
    const { objects, strings } = slotsOf(d);
    const kind = r.int(0, 3);
    if (kind === 0 && objects.length > 0) setOwn(r.pick(objects), r.pick(KEYS), genJson(r));
    else if (kind === 1 && strings.length > 0) {
      const [o, k] = r.pick(strings);
      o[k] = r.bool(0.5) ? `${o[k]}${genString(r)}` : genString(r);
    } else if (kind === 2 && objects.length > 0) {
      const o = r.pick(objects);
      const keys = Object.keys(o);
      if (keys.length > 0) o[r.pick(keys)] = genJson(r);
    } else if (strings.length > 0) {
      // Clave de otro objeto del modelo (por ejemplo, `count` en un anillo mágico).
      const [o] = r.pick(strings);
      if (!Array.isArray(o)) setOwn(o, r.pick(["count", "times", "loop", "yarn", "through", "paletteId", "note"]), r.pick([1, "x", "back"]));
    }
  }
  return d;
}

describe("E16: propiedad con JSON arbitrario", () => {
  it("si es savable, no tiene claves desconocidas ni caracteres prohibidos, y JSON.stringify no contiene \\u0000", () => {
    let savable = 0;
    forAll(
      "savable implica documento cerrado y sin caracteres prohibidos",
      genMutated,
      (d) => {
        const r = validatePattern(d);
        if (!r.savable) return;
        savable++;
        const doc = d as Json;
        assert.deepEqual(unknownKeys(doc), []);
        assert.deepEqual(forbiddenTexts(doc, false), []);
        assert.ok(!JSON.stringify(doc).includes("\\u0000"));
        assert.ok(!r.issues.some((i) => i.code === "UNKNOWN_KEY" || i.code === "TEXT_CONTROL_CHAR"));
      },
      600,
    );
    assert.ok(savable > 50, `pocos casos savable (${savable}): el generador no prueba la propiedad`);
  });

  it("los mensajes nunca contienen caracteres de control ni sustitutos sueltos", () => {
    forAll("mensajes limpios", genMutated, (d) => {
      for (const i of validatePattern(d).issues) assert.ok(!/[^\P{Cc}\n]/u.test(i.message) && wellFormed(i.message) && wellFormed(i.path), `${i.code}: ${JSON.stringify(i.message)}`);
    });
  });
});

describe("yarnLetter (T7b, QA O3)", () => {
  it("A a Z y, desde la 27, dos letras como las columnas de una planilla", () => {
    assert.equal(yarnLetter(0), "A");
    assert.equal(yarnLetter(25), "Z");
    assert.equal(yarnLetter(26), "AA");
    assert.equal(yarnLetter(31), "AF");
    assert.equal(yarnLetter(51), "AZ");
    assert.equal(yarnLetter(52), "BA");
    assert.equal(yarnLetter(701), "ZZ");
    assert.equal(yarnLetter(702), "AAA");
  });

  it("no lanza con índices inválidos", () => {
    for (const v of [-1, 1.5, Number.NaN, Infinity, 2 ** 60]) assert.equal(yarnLetter(v), "?");
  });

  it("propiedad: inyectiva, solo letras mayúsculas (nunca un número que se confunda con la fila) y ordenada por largo", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const l = yarnLetter(i);
      assert.match(l, /^[A-Z]+$/);
      assert.ok(!seen.has(l), `${l} repetida (${seen.get(l)} y ${i})`);
      seen.set(l, i);
      if (i > 0) assert.ok(l.length >= yarnLetter(i - 1).length);
    }
  });

  it("el validador nombra la lana 27 como AA", () => {
    const d = fullChart();
    d.yarns = Array.from({ length: 28 }, (_v, i) => ({ ...clone(yarnA), id: `Y${i}`, color: { hex: "#112233" } }));
    d.chart = { ...d.chart, width: 1, height: 1, cells: [0], repeat: { x: 1, y: 1 } };
    const unused = validatePattern(d).issues.filter((i) => i.code === "YARN_UNUSED").map((i) => i.message);
    assert.ok(unused.includes("La lana AA (#112233) no se usa en el gráfico."), unused.join("\n"));
    assert.ok(unused.includes("La lana AB (#112233) no se usa en el gráfico."));
  });
});

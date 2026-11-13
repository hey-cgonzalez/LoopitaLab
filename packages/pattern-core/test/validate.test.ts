import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, SCHEMA_VERSION, parsePattern, validatePattern, type Issue } from "../src/index.ts";
import { ballPattern, smallChart, yarnB } from "./support/fixtures.ts";

const codes = (issues: Issue[], severity?: Issue["severity"]) =>
  issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

describe("patrón escrito", () => {
  it("la bolita es válida y sin avisos", () => {
    const r = validatePattern(ballPattern());
    assert.equal(r.valid, true);
    assert.deepEqual(r.issues, []);
  });

  it("detecta un conteo declarado que no cuadra", () => {
    const p = ballPattern();
    p.parts[0]!.rounds[2]!.expected = 20;
    const r = validatePattern(p);
    assert.equal(r.valid, false);
    const i = r.issues.find((x) => x.code === "ROUND_COUNT_MISMATCH");
    assert.ok(i);
    assert.match(i.message, /^Bolita, vuelta 3: el patrón declara 20 puntos, pero las instrucciones dan 18\.$/);
  });

  it("detecta instrucciones que no consumen lo que dejó la vuelta anterior", () => {
    const p = ballPattern();
    // V3: [pb 2, aum] x6 consume 18, pero la V2 dejó 12.
    p.parts[0]!.rounds[2]!.items = [{ type: "group", times: 6, items: [{ type: "stitch", stitch: "sc", count: 2 }, { type: "stitch", stitch: "inc", count: 1 }] }];
    p.parts[0]!.rounds[2]!.expected = 24;
    const r = validatePattern(p);
    const i = r.issues.find((x) => x.code === "ROUND_CONSUMPTION_MISMATCH");
    assert.ok(i);
    assert.match(i.message, /vuelta 3: se trabaja sobre 18 puntos, pero la vuelta 2 dejó 12\. Sobran 6/);
  });

  it("detecta vueltas mal numeradas", () => {
    const p = ballPattern();
    p.parts[0]!.rounds[3]!.number = 5;
    assert.ok(codes(validatePattern(p).issues).includes("ROUND_NUMBERING"));
  });

  it("detecta un rango de vueltas que cambia el conteo, una sola vez", () => {
    const p = ballPattern();
    p.parts[0]!.rounds[4] = { number: 5, through: 8, items: [{ type: "group", times: 6, items: [{ type: "stitch", stitch: "sc", count: 3 }, { type: "stitch", stitch: "inc", count: 1 }] }] };
    const r = validatePattern(p);
    assert.equal(codes(r.issues).filter((c) => c === "ROUND_RANGE_CHANGES").length, 1);
  });

  it("detecta lanas inexistentes en cambios de color", () => {
    const p = ballPattern();
    p.parts[0]!.rounds[0]!.items.unshift({ type: "color", yarn: "Z" });
    assert.ok(codes(validatePattern(p).issues).includes("COLOR_UNKNOWN_YARN"));
  });

  it("valida la cadeneta inicial en hileras", () => {
    const p = ballPattern();
    p.parts[0] = {
      id: "panel",
      name: "Panel",
      construction: "flat",
      start: { type: "chain", count: 11 },
      startYarn: "A",
      rounds: [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: 10 }], expected: 10 }],
    };
    assert.equal(validatePattern(p).valid, true);
    p.parts[0].rounds[0]!.items = [{ type: "stitch", stitch: "sc", count: 11 }];
    p.parts[0].rounds[0]!.expected = 11;
    const r = validatePattern(p);
    const i = r.issues.find((x) => x.code === "ROUND_CONSUMPTION_MISMATCH");
    assert.ok(i);
    assert.match(i.message, /la cadeneta inicial deja 10/);
    // En hileras es advertencia: depende de si la cadeneta para girar cuenta como punto.
    assert.equal(i.severity, "warning");
    assert.equal(r.valid, true);
  });

  it("en espiral, el descuadre de consumo es error", () => {
    const p = ballPattern();
    p.parts[0]!.rounds[1]!.items = [{ type: "stitch", stitch: "inc", count: 7 }];
    p.parts[0]!.rounds[1]!.expected = 14;
    const i = validatePattern(p).issues.find((x) => x.code === "ROUND_CONSUMPTION_MISMATCH");
    assert.equal(i?.severity, "error");
  });

  it("palillo escrito todavía no se admite", () => {
    const p = ballPattern();
    (p as { technique: string }).technique = "knit";
    assert.ok(codes(validatePattern(p).issues).includes("WRITTEN_TECHNIQUE"));
  });

  it("avisa vueltas sin conteo declarado", () => {
    const p = ballPattern();
    delete p.parts[0]!.rounds[1]!.expected;
    const r = validatePattern(p);
    assert.equal(r.valid, true);
    assert.deepEqual(codes(r.issues), ["ROUND_NO_EXPECTED"]);
  });
});

describe("lanas", () => {
  it("la composición debe sumar 100", () => {
    const p = ballPattern();
    p.yarns[0]!.composition = [{ fiber: "lana", percent: 70 }, { fiber: "alpaca", percent: 20 }];
    const i = validatePattern(p).issues.find((x) => x.code === "YARN_COMPOSITION_SUM");
    assert.ok(i);
    assert.match(i.message, /suma 90 %/);
  });

  it("revisa grosor, color, identificadores y fibras conocidas", () => {
    const p = ballPattern();
    p.yarns.push({ ...structuredClone(yarnB), id: "A" });
    (p.yarns[0] as { weight: number }).weight = 9;
    p.yarns[0]!.color.hex = "rojo";
    p.yarns[0]!.composition = [{ fiber: "unicornio", percent: 100 }];
    const r = validatePattern(p, { fibers: new Set(["lana", "algodon"]) });
    const c = codes(r.issues);
    for (const code of ["YARN_WEIGHT", "YARN_COLOR", "YARN_DUPLICATE_ID", "YARN_FIBER_UNKNOWN"]) assert.ok(c.includes(code), code);
  });

  it("pide registrar el modelo cuando el patrón viene de IA", () => {
    const p = ballPattern();
    p.origin = { kind: "ai" };
    assert.deepEqual(codes(validatePattern(p).issues), ["ORIGIN_AI_MODEL"]);
  });
});

describe("gráfico", () => {
  it("el gráfico de ejemplo es válido", () => {
    const r = validatePattern(smallChart());
    assert.equal(r.valid, true);
    assert.deepEqual(codes(r.issues, "error"), []);
  });

  it("detecta celdas con lanas inexistentes y largo incorrecto", () => {
    const p = smallChart();
    p.chart.cells[5] = 7;
    const i = validatePattern(p).issues.find((x) => x.code === "CHART_CELL_VALUE");
    assert.ok(i);
    // En redondo el mensaje dice "vuelta" (glosario pendiente); de ida y vuelta, "fila".
    assert.match(i.message, /vuelta 2, casilla 3/);
    const q = smallChart();
    q.chart.cells.pop();
    assert.ok(codes(validatePattern(q).issues).includes("CHART_CELLS_LENGTH"));
  });

  it("avisa hebras flotantes largas según la muestra", () => {
    const p = smallChart();
    // 24 pts/10 cm → floor(6) pero con tope de 5 puntos. Una vuelta A + 9 B en redondo deja A suelta 9 puntos.
    p.chart = { ...p.chart, width: 10, height: 1, cells: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1], repeat: { x: 1, y: 1 } };
    const i = validatePattern(p).issues.find((x) => x.code === "CHART_FLOAT_LONG");
    assert.ok(i);
    assert.equal(i.data?.length, 9);
    assert.equal(i.data?.max, 5);
    assert.match(i.message, /enganchar/);
    assert.doesNotMatch(i.message, /atrap/);
    // En crochet tapestry no aplica.
    const q = structuredClone(p);
    q.technique = "crochet";
    assert.ok(!codes(validatePattern(q).issues).includes("CHART_FLOAT_LONG"));
  });

  it("informa filas con más de dos colores y filas vacías", () => {
    const p = smallChart();
    p.yarns.push(structuredClone(yarnB), structuredClone(yarnB));
    p.yarns[2]!.id = "C";
    p.yarns[3]!.id = "D";
    p.chart.cells = [0, 1, 2, 3, NO_STITCH, NO_STITCH, NO_STITCH, NO_STITCH, 1, 1, 1, 1];
    const c = codes(validatePattern(p).issues);
    assert.ok(c.includes("CHART_COLORS_PER_ROW"));
    // Una fila sin puntos es error de tejido (E10), con un solo aviso por fila (T2d).
    assert.ok(c.includes("CHART_ROW_EMPTY_FULL"));
    assert.ok(!c.includes("CHART_EMPTY_ROW"));
  });
});

describe("entradas inválidas", () => {
  it("nunca lanza excepciones", () => {
    const junk: unknown[] = [null, 42, "hola", [], {}, { schemaVersion: SCHEMA_VERSION }, { kind: "chart", chart: { cells: "x" } }, { kind: "written", parts: [{ rounds: [{ items: [{ type: "group", items: null }] }] }] }];
    for (const j of junk) {
      const r = validatePattern(j);
      assert.equal(r.valid, false);
      assert.ok(r.issues.length > 0);
    }
  });

  it("frena entradas desmedidas", () => {
    const p = ballPattern();
    p.parts[0]!.rounds[0]!.items = [{ type: "group", times: 500, items: [{ type: "group", times: 500, items: [{ type: "stitch", stitch: "sc", count: 5000 }] }] }];
    const r = validatePattern(p);
    assert.equal(r.valid, false);
    assert.ok(codes(r.issues).includes("LIMIT"));
  });

  it("parsePattern devuelve el patrón tipado solo si es válido", () => {
    assert.equal(parsePattern(ballPattern()).ok, true);
    assert.equal(parsePattern({}).ok, false);
  });
});

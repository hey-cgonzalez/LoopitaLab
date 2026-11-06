/**
 * Textos de los mensajes revisados por experto-tejido (T2e): palabras, plurales y
 * "fila" en las partes de ida y vuelta.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, validatePattern, type Issue, type Part, type WrittenPattern } from "../src/index.ts";
import { ballPattern, smallChart, yarnA, yarnB } from "./support/fixtures.ts";

type Doc = Record<string, any>;
const msg = (d: unknown, code: string): string[] => validatePattern(d).issues.filter((i: Issue) => i.code === code).map((i) => i.message);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function flatPattern(): WrittenPattern {
  const part: Part = {
    id: "panel",
    name: "Panel",
    construction: "flat",
    start: { type: "chain", count: 11 },
    startYarn: "A",
    rounds: [
      { number: 1, items: [{ type: "stitch", stitch: "sc", count: 10 }], expected: 10 },
      { number: 2, through: 4, items: [{ type: "stitch", stitch: "sc", count: 10 }], expected: 10 },
    ],
  };
  return { ...ballPattern(), parts: [part] };
}

describe("textos del gráfico", () => {
  it("workedIn, renderAs y direction desconocidos explican las opciones en palabras de tejedora", () => {
    const d = clone(smallChart()) as Doc;
    d.chart.workedIn = "x";
    d.chart.renderAs = "x";
    d.chart.direction = "x";
    assert.deepEqual(msg(d, "CHART_WORKED_IN"), ["Indica si el gráfico se teje en redondo (vueltas) o de ida y vuelta (filas)."]);
    assert.deepEqual(msg(d, "CHART_RENDER"), ["Forma de vista desconocida. Elige plano, tubo, círculo o canesú."]);
    assert.deepEqual(msg(d, "CHART_DIRECTION"), ["Indica si se teje de abajo hacia arriba o de arriba hacia abajo."]);
  });

  it("CHART_CELL_VALUE en singular y en plural", () => {
    const one = clone(smallChart());
    one.chart.cells[5] = 7;
    assert.deepEqual(msg(one, "CHART_CELL_VALUE"), ["Hay 1 casilla con una lana que no existe en la paleta; la primera está en la vuelta 2, casilla 2."]);
    const two = clone(smallChart());
    two.chart.cells[5] = 7;
    two.chart.cells[6] = 9;
    assert.match(msg(two, "CHART_CELL_VALUE")[0]!, /^Hay 2 casillas con una lana/);
  });

  it("YARN_UNUSED nombra la lana por su letra y su color, con mayúscula inicial", () => {
    const d = clone(smallChart());
    d.chart.cells = d.chart.cells.map(() => 0);
    assert.deepEqual(msg(d, "YARN_UNUSED"), ["La lana B (#BA222C) no se usa en el gráfico."]);
    const w = clone(ballPattern());
    w.yarns.push(clone(yarnB));
    assert.deepEqual(msg(w, "YARN_UNUSED"), ["La lana B (#BA222C) no se usa en ninguna parte."]);
  });

  it("CHART_ROW_EMPTY_FULL propone pintar o quitar la fila", () => {
    const d = clone(smallChart());
    for (let x = 0; x < 4; x++) d.chart.cells[4 + x] = NO_STITCH;
    assert.match(msg(d, "CHART_ROW_EMPTY_FULL")[0]!, /pinta al menos una casilla en ella o quita esa vuelta\.$/);
  });

  it("CHART_CIRCLE_REPEATS usa cuña o cuñas según la cantidad", () => {
    for (const [x, word] of [[1, "1 cuña;"], [2, "2 cuñas;"], [13, "13 cuñas;"]] as const) {
      const d = clone(smallChart());
      d.chart.renderAs = "circle";
      d.chart.repeat = { x, y: 1 };
      d.yarns = [clone(yarnA), clone(yarnB)];
      assert.match(msg(d, "CHART_CIRCLE_REPEATS")[0]!, new RegExp(`^El círculo tiene ${word}`));
    }
  });
});

describe("textos del patrón escrito", () => {
  it("PART_CONSTRUCTION y STITCH_LOOP", () => {
    const d = clone(ballPattern()) as Doc;
    d.parts[0].construction = "x";
    assert.deepEqual(msg(d, "PART_CONSTRUCTION"), ["Bolita: la construcción debe ser en espiral, en vueltas unidas o en filas (ida y vuelta)."]);
    const l = clone(ballPattern()) as Doc;
    l.parts[0].rounds[0].items[0].loop = "x";
    assert.deepEqual(msg(l, "STITCH_LOOP"), ["Bolita, vuelta 1: la lazada no es válida (debe ser ambas, delantera o trasera)."]);
  });

  it("ROUND_COUNT_MISMATCH: el patrón declara N puntos (singular y plural)", () => {
    const d = clone(ballPattern());
    d.parts[0]!.rounds[0]!.expected = 1;
    assert.deepEqual(msg(d, "ROUND_COUNT_MISMATCH"), ["Bolita, vuelta 1: el patrón declara 1 punto, pero las instrucciones dan 6."]);
  });

  it("las partes de ida y vuelta (flat) dicen \"fila\" en vez de \"vuelta\"", () => {
    const base = flatPattern();
    assert.equal(validatePattern(base).valid, true);

    const mismatch = clone(base);
    mismatch.parts[0]!.rounds[0]!.expected = 9;
    assert.deepEqual(msg(mismatch, "ROUND_COUNT_MISMATCH"), ["Panel, fila 1: el patrón declara 9 puntos, pero las instrucciones dan 10."]);

    const numbering = clone(base);
    numbering.parts[0]!.rounds[1]!.number = 3;
    numbering.parts[0]!.rounds[1]!.through = 5;
    assert.deepEqual(msg(numbering, "ROUND_NUMBERING"), ["Panel: se esperaba la fila 2 y aparece la 3."]);

    const consumption = clone(base);
    consumption.parts[0]!.rounds[1]!.items = [{ type: "stitch", stitch: "sc", count: 9 }];
    consumption.parts[0]!.rounds[1]!.expected = 9;
    const [c] = msg(consumption, "ROUND_CONSUMPTION_MISMATCH");
    assert.match(c!, /^Panel, fila 2: se trabaja sobre 9 puntos, pero la fila 1 dejó 10\. Falta 1 punto en las instrucciones\./);
    assert.deepEqual(msg(consumption, "ROUND_RANGE_CHANGES"), []);

    const range = clone(base);
    range.parts[0]!.rounds[1]!.items = [{ type: "stitch", stitch: "sc", count: 8 }, { type: "stitch", stitch: "inc", count: 2 }];
    range.parts[0]!.rounds[1]!.expected = 12;
    assert.deepEqual(msg(range, "ROUND_RANGE_CHANGES"), ["Panel, filas 2-4: un rango de filas iguales debe mantener el conteo, pero cada fila pasa de 10 a 12 puntos."]);

    const zero = clone(base);
    zero.parts[0]!.rounds[0]!.items = [{ type: "stitch", stitch: "sk", count: 10 }];
    delete zero.parts[0]!.rounds[0]!.expected;
    assert.deepEqual(msg(zero, "ROUND_ZERO"), ["Panel, fila 1 no deja puntos para la fila siguiente."]);
    assert.deepEqual(msg(zero, "ROUND_NO_EXPECTED"), ["Panel: 1 fila no declara su conteo final; sirve para detectar errores."]);

    const empty = clone(base) as Doc;
    empty.parts[0].rounds = [];
    assert.deepEqual(msg(empty, "PART_NO_ROUNDS"), ["Panel no tiene filas."]);
    empty.parts[0].construction = "joined";
    assert.deepEqual(msg(empty, "PART_NO_ROUNDS"), ["Panel no tiene vueltas."]);
  });

  it("ROUND_NO_EXPECTED en plural con vueltas", () => {
    const d = clone(ballPattern());
    delete d.parts[0]!.rounds[0]!.expected;
    delete d.parts[0]!.rounds[1]!.expected;
    assert.deepEqual(msg(d, "ROUND_NO_EXPECTED"), ["Bolita: 2 vueltas no declaran su conteo final; sirve para detectar errores."]);
  });
});

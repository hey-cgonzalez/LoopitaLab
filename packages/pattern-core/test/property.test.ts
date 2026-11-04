/**
 * Pruebas de propiedades: se generan cientos de casos al azar (con semilla) y se
 * comprueban reglas que deben cumplirse siempre.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STITCHES,
  NO_STITCH,
  countRound,
  expandRound,
  formatRound,
  parseRound,
  stitchTotal,
  validatePattern,
  yarnTotals,
  fullSize,
  cellAt,
  type ChartPattern,
  type Item,
  type Part,
  type Round,
  type StitchCode,
  type WrittenPattern,
} from "../src/index.ts";
import { ballPattern, smallChart, yarnA, yarnB, yarnC } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

const CODES = Object.keys(STITCHES) as StitchCode[];
const YARNS = ["A", "B", "C"];

function genItems(r: Rng, depth: number): Item[] {
  const n = r.int(1, 4);
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const roll = r.next();
    if (roll < 0.15) items.push({ type: "color", yarn: r.pick(YARNS) });
    else if (roll < 0.35 && depth < 3) items.push({ type: "group", times: r.int(1, 8), items: genItems(r, depth + 1) });
    else {
      const it: Item = { type: "stitch", stitch: r.pick(CODES), count: r.int(1, 12) };
      if (r.bool(0.2)) it.loop = r.pick(["front", "back"] as const);
      items.push(it);
    }
  }
  return items;
}

function genRound(r: Rng): Round {
  const number = r.int(1, 60);
  const round: Round = { number, items: genItems(r, 0) };
  if (r.bool(0.3)) round.through = number + r.int(1, 5);
  if (r.bool(0.6)) round.expected = r.int(0, 300);
  return round;
}

/** Conteo de referencia: expande todo y suma con la tabla de puntos. */
function naiveCount(round: Round, start: string) {
  const { stitches, endYarn } = expandRound(round, start);
  let consumed = 0;
  let produced = 0;
  const by: Record<string, number> = {};
  for (const s of stitches) {
    consumed += STITCHES[s.stitch].consumes;
    const p = STITCHES[s.stitch].produces;
    produced += p;
    if (p > 0) by[s.yarn] = (by[s.yarn] ?? 0) + p;
  }
  return { consumed, produced, producedByYarn: by, endYarn };
}

/** Esfera de amigurumi con base b, m vueltas de aumento, mesetas y disminución simétrica. */
function genSphere(r: Rng): Part {
  const b = r.int(4, 8);
  const m = r.int(2, 8);
  const plateau = r.int(0, 6);
  const rounds: Round[] = [];
  let n = 1;
  const color = (): Item[] => (r.bool(0.3) ? [{ type: "color", yarn: r.pick(YARNS) }] : []);
  rounds.push({ number: n++, items: [...color(), { type: "stitch", stitch: "sc", count: b }], expected: b });
  for (let i = 2; i <= m; i++) {
    const inner: Item[] = i > 2 ? [{ type: "stitch", stitch: "sc", count: i - 2 }, { type: "stitch", stitch: "inc", count: 1 }] : [{ type: "stitch", stitch: "inc", count: 1 }];
    rounds.push({ number: n++, items: [...color(), { type: "group", times: b, items: inner }], expected: b * i });
  }
  if (plateau > 0) {
    const first = n;
    n += plateau;
    const round: Round = { number: first, items: [...color(), { type: "stitch", stitch: "sc", count: b * m }], expected: b * m };
    if (plateau > 1) round.through = first + plateau - 1;
    rounds.push(round);
  }
  for (let i = m; i >= 2; i--) {
    const inner: Item[] = i > 2 ? [{ type: "stitch", stitch: "sc", count: i - 2 }, { type: "stitch", stitch: "dec", count: 1 }] : [{ type: "stitch", stitch: "dec", count: 1 }];
    rounds.push({ number: n++, items: [...color(), { type: "group", times: b, items: inner }], expected: b * (i - 1) });
  }
  return { id: "esfera", name: "Esfera", construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds };
}

function writtenWith(part: Part): WrittenPattern {
  return { ...ballPattern(), yarns: [structuredClone(yarnA), structuredClone(yarnB), structuredClone(yarnC)], parts: [part] };
}

describe("propiedades del patrón escrito", () => {
  it("escribir y volver a leer una vuelta devuelve la misma vuelta (es y us)", () => {
    forAll("ida y vuelta", genRound, (round) => {
      for (const dialect of ["es", "us"] as const) {
        const text = formatRound(round, dialect);
        const back = parseRound(text);
        if (!back.ok) throw new Error(`No se pudo leer "${text}": ${back.issues[0]?.message}`);
        assert.deepEqual(back.value, round, text);
      }
    });
  });

  it("el conteo rápido coincide con expandir punto por punto", () => {
    forAll("conteo", (r) => ({ round: genRound(r), start: r.pick(YARNS) }), ({ round, start }) => {
      assert.deepEqual(countRound(round, start), naiveCount(round, start));
    });
  });

  it("toda esfera bien construida es válida, con cualquier cambio de color", () => {
    forAll("esfera", genSphere, (part) => {
      const r = validatePattern(writtenWith(part));
      assert.deepEqual(r.issues.filter((i) => i.severity !== "info"), []);
    }, 200);
  });

  it("cambiar un conteo declarado de una esfera siempre se detecta", () => {
    forAll(
      "esfera alterada",
      (r) => {
        const part = genSphere(r);
        const i = r.int(0, part.rounds.length - 1);
        const delta = r.pick([-2, -1, 1, 3]);
        part.rounds[i]!.expected = (part.rounds[i]!.expected ?? 0) + delta;
        return part;
      },
      (part) => {
        const r = validatePattern(writtenWith(part));
        assert.equal(r.valid, false);
        assert.ok(r.issues.some((i) => i.code === "ROUND_COUNT_MISMATCH"));
      },
      200,
    );
  });
});

describe("propiedades del gráfico", () => {
  function genChart(r: Rng): ChartPattern {
    const p = smallChart();
    const width = r.int(1, 12);
    const height = r.int(1, 8);
    const yarns = r.int(1, 2);
    p.yarns = p.yarns.slice(0, yarns);
    p.chart = {
      ...p.chart,
      width,
      height,
      cells: Array.from({ length: width * height }, () => (r.bool(0.1) ? NO_STITCH : r.int(0, yarns - 1))),
      repeat: { x: r.int(1, 6), y: r.int(1, 4) },
      workedIn: r.pick(["rounds", "rows"] as const),
    };
    return p;
  }

  it("los totales por lana suman el total de puntos y coinciden con recorrer el gráfico completo", () => {
    forAll("totales", genChart, (p) => {
      const totals = yarnTotals(p.chart, p.yarns.length);
      assert.equal(totals.reduce((a, b) => a + b, 0), stitchTotal(p.chart));
      const { width, height } = fullSize(p.chart);
      const walk = new Array<number>(p.yarns.length).fill(0);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const v = cellAt(p.chart, x, y);
        if (v !== NO_STITCH) walk[v] = (walk[v] ?? 0) + 1;
      }
      assert.deepEqual(totals, walk);
    });
  });

  it("el validador nunca lanza, aunque se dañe cualquier campo", () => {
    const junk = [null, -1, 0, 1e9, "x", {}, [], true, NaN];
    forAll(
      "daño aleatorio",
      (r) => {
        const base: Record<string, unknown> = r.bool() ? (genChart(r) as unknown as Record<string, unknown>) : (writtenWith(genSphere(r)) as unknown as Record<string, unknown>);
        // Baja por el objeto hasta un campo al azar y lo reemplaza.
        let node: unknown = base;
        for (let depth = 0; depth < 6; depth++) {
          if (typeof node !== "object" || node === null) break;
          const keys = Object.keys(node);
          if (keys.length === 0) break;
          const k = r.pick(keys);
          const child = (node as Record<string, unknown>)[k];
          if (r.bool(0.35) || typeof child !== "object" || child === null) {
            (node as Record<string, unknown>)[k] = r.pick(junk);
            break;
          }
          node = child;
        }
        return base;
      },
      (input) => {
        const r = validatePattern(input);
        assert.ok(Array.isArray(r.issues));
      },
      500,
    );
  });
});

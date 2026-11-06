/**
 * Bordes de los derivados (chart.ts), la edición (edit.ts) y las migraciones (migrate.ts):
 * motivo 1 × 1, 200 × 200 con el máximo de repeticiones, máscara completa, índices
 * negativos o fuera de rango, parámetros NaN / Infinity / no enteros y documentos
 * congelados en profundidad. Las propiedades usan la semilla de test/support/property.ts:
 *   SEED=12345 node --test test/edges-colorwork.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANCHORS,
  EDIT_LIMITS,
  LIMITS,
  NO_STITCH,
  addYarn,
  cellAt,
  dimensionsCm,
  fillRegion,
  fullRow,
  fullSize,
  migratePattern,
  motifCoord,
  newChartPattern,
  paintCells,
  readingDirection,
  removeYarn,
  reorderYarns,
  resizeMotif,
  rowFloats,
  rowStitchCount,
  rowStitchCounts,
  setRepeat,
  shaping,
  stitchTotal,
  validatePattern,
  wornOrientation,
  yarnTotals,
  type Anchor,
  type Chart,
  type ChartPattern,
} from "../src/index.ts";
import { yarnA, yarnB, yarnC } from "./support/fixtures.ts";
import { forAll, rng } from "./support/property.ts";

const BAD_NUMBERS: readonly unknown[] = [NaN, Infinity, -Infinity, 1.5, -0.5, "2", null, undefined, 2n];

function chart(over: Partial<Chart> = {}): Chart {
  return {
    width: 3,
    height: 2,
    cells: [0, 1, 0, 1, 0, 1],
    repeat: { x: 2, y: 2 },
    workedIn: "rows",
    renderAs: "flat",
    direction: "bottom_up",
    ...over,
  };
}

function pattern(c: Chart = chart(), yarns = [yarnA, yarnB, yarnC]): ChartPattern {
  return {
    schemaVersion: 1,
    id: "p",
    title: "Prueba",
    technique: "knit",
    kind: "chart",
    yarns: yarns.map((y) => structuredClone(y)),
    origin: { kind: "manual" },
    chart: c,
  };
}

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

const errorCodes = (p: unknown) =>
  validatePattern(p)
    .issues.filter((i) => i.severity === "error")
    .map((i) => i.code);

describe("bordes: motivo 1 × 1", () => {
  const one = chart({ width: 1, height: 1, cells: [0], repeat: { x: 1, y: 1 } });

  it("los derivados funcionan con una sola celda", () => {
    assert.deepEqual(fullSize(one), { width: 1, height: 1 });
    assert.deepEqual(rowStitchCounts(one), [1]);
    assert.equal(rowStitchCount(one, 0), 1);
    assert.equal(rowStitchCount(one, 1), 0);
    assert.deepEqual(shaping(one), [{ row: 0, stitches: 1, change: 0, perRepeat: 0 }]);
    assert.deepEqual(motifCoord(one, 7, -3), { x: 0, y: 0 });
    assert.deepEqual(wornOrientation({ ...one, direction: "top_down" }, 0, 0), { x: 0, y: 0 });
    assert.deepEqual(rowFloats(one, 0), []);
    assert.deepEqual(errorCodes(pattern(one)), []);
  });

  it("1 × 1 repetido R veces da R puntos por fila", () => {
    const c = chart({ width: 1, height: 1, cells: [1], repeat: { x: 7, y: 3 } });
    assert.deepEqual(rowStitchCounts(c), [7, 7, 7]);
    assert.equal(stitchTotal(c), 21);
  });

  it("editar un 1 × 1: pintar, rellenar, achicar a 1 × 1 y crecer desde 1 × 1", () => {
    assert.deepEqual(paintCells(one, [{ x: 0, y: 0 }], 2, 3).cells, [2]);
    assert.deepEqual(fillRegion(one, { x: 0, y: 0 }, 2, 3).cells, [2]);
    assert.equal(resizeMotif(one, 1, 1, "center", 0, 3), one);
    for (const anchor of ANCHORS) {
      const big = resizeMotif(one, 3, 3, anchor, NO_STITCH, 3);
      assert.equal(big.cells.filter((v) => v === 0).length, 1, anchor);
      assert.deepEqual(resizeMotif(big, 1, 1, anchor, NO_STITCH, 3), one, anchor);
    }
  });

  it("no se puede quitar la única lana", () => {
    const p = pattern(one, [yarnA]);
    assert.equal(removeYarn(p, 0, 0), p);
    assert.equal(reorderYarns(p, [0]), p);
  });
});

describe("bordes: motivo 200 × 200 y repeticiones máximas", () => {
  const W = EDIT_LIMITS.maxMotifWidth;
  const H = EDIT_LIMITS.maxMotifHeight;
  const R = LIMITS.maxRepeat;

  it("los límites de edición son 200 × 200 y LIMITS.maxRepeat", () => {
    assert.equal(W, 200);
    assert.equal(H, 200);
    assert.equal(EDIT_LIMITS.maxRepeat, R);
  });

  it("setRepeat acepta el máximo y rechaza uno más", () => {
    const c = chart();
    assert.deepEqual(setRepeat(c, R, R).repeat, { x: R, y: R });
    assert.equal(setRepeat(c, R + 1, 1), c);
    assert.equal(setRepeat(c, 1, R + 1), c);
  });

  it("resizeMotif llega a 200 × 200 y no pasa de ahí", () => {
    const c = chart();
    const big = resizeMotif(c, W, H, "bottom_left", 0, 3);
    assert.equal(big.cells.length, W * H);
    assert.equal(resizeMotif(big, W + 1, H, "bottom_left", 0, 3), big);
    assert.equal(resizeMotif(big, W, H + 1, "bottom_left", 0, 3), big);
  });

  it("200 × 200 con repeat máximo: conteos exactos y en tiempo razonable", () => {
    const cells = Array.from({ length: W * H }, (_v, i) => (i % 11 === 0 ? NO_STITCH : i % 3));
    const c = chart({ width: W, height: H, cells, repeat: { x: R, y: R }, workedIn: "rounds" });
    const t0 = performance.now();
    const counts = rowStitchCounts(c);
    const sh = shaping(c);
    const total = stitchTotal(c);
    const ms = performance.now() - t0;
    assert.equal(counts.length, H * R);
    assert.equal(sh.length, H * R);
    // 1e10 puntos como máximo: el total sigue siendo un entero exacto.
    assert.ok(Number.isSafeInteger(total));
    assert.equal(counts.reduce((a, b) => a + b, 0), total);
    assert.equal(rowStitchCount(c, H * R - 1), counts.at(-1));
    assert.equal(rowStitchCount(c, H * R), 0);
    for (const s of sh) assert.ok(Number.isInteger(s.perRepeat));
    assert.equal(fullRow(c, 0).length, counts[0]);
    // Holgado: es una guardia contra algoritmos cuadráticos, no un benchmark.
    assert.ok(ms < 1000, `tardó ${ms.toFixed(1)} ms`);
  });

  it("pintar en la última repetición del gráfico completo máximo escribe el motivo", () => {
    const c = chart({ width: W, height: H, cells: new Array<number>(W * H).fill(0), repeat: { x: R, y: R } });
    const out = paintCells(c, [{ x: W * R - 1, y: H * R - 1 }], 1, 3);
    assert.equal(out.cells[W * H - 1], 1);
    assert.equal(cellAt(out, W - 1, H - 1), 1);
    assert.equal(paintCells(c, [{ x: W * R, y: 0 }], 1, 3), c);
  });
});

describe("bordes: máscara completa (todo NO_STITCH)", () => {
  const masked = chart({ cells: new Array<number>(6).fill(NO_STITCH) });

  it("todos los conteos son 0 y la forma no tiene cambios", () => {
    assert.equal(stitchTotal(masked), 0);
    assert.deepEqual(rowStitchCounts(masked), [0, 0, 0, 0]);
    for (const s of shaping(masked)) assert.deepEqual({ change: s.change, perRepeat: s.perRepeat, stitches: s.stitches }, { change: 0, perRepeat: 0, stitches: 0 });
    assert.deepEqual(yarnTotals(masked, 3), [0, 0, 0]);
    assert.deepEqual(fullRow(masked, 0), []);
    assert.deepEqual(rowFloats(masked, 0), []);
  });

  it("el validador lo informa como CHART_EMPTY", () => {
    assert.ok(errorCodes(pattern(masked)).includes("CHART_EMPTY"));
  });

  it("rellenar la región sin punto con una lana recupera todo el motivo", () => {
    const out = fillRegion(masked, { x: 4, y: 3 }, 2, 3);
    assert.deepEqual(out.cells, [2, 2, 2, 2, 2, 2]);
    assert.deepEqual(errorCodes(pattern(out)), []);
  });

  it("una fila enmascarada en medio da una disminución y un aumento por repetición enteros", () => {
    const c = chart({ width: 2, height: 3, cells: [0, 0, NO_STITCH, NO_STITCH, 1, 1], repeat: { x: 4, y: 1 } });
    assert.deepEqual(
      shaping(c).map((s) => [s.stitches, s.change, s.perRepeat]),
      [[8, 0, 0], [0, -8, -2], [8, 8, 2]],
    );
  });
});

describe("bordes: índices negativos o fuera de rango", () => {
  const c = chart();
  const { width: FW, height: FH } = fullSize(c);

  it("rowStitchCount vale 0 fuera del gráfico completo y con y no entero", () => {
    for (const y of [-1, -100, FH, FH + 1, ...BAD_NUMBERS]) assert.equal(rowStitchCount(c, y as number), 0, String(y));
  });

  it("motifCoord lleva cualquier entero (negativo o muy grande) al motivo", () => {
    forAll(
      "motifCoord enteros",
      (r) => ({ x: r.int(-10_000, 10_000), y: r.int(-10_000, 10_000) }),
      ({ x, y }) => {
        const m = motifCoord(c, x, y);
        assert.ok(Number.isInteger(m.x) && m.x >= 0 && m.x < c.width);
        assert.ok(Number.isInteger(m.y) && m.y >= 0 && m.y < c.height);
        assert.ok(!Object.is(m.x, -0) && !Object.is(m.y, -0));
        assert.ok((x - m.x) % c.width === 0);
        assert.ok((y - m.y) % c.height === 0);
      },
    );
  });

  it("readingDirection en ida y vuelta sigue la paridad también con y negativo", () => {
    assert.equal(readingDirection(c, -1), "left_to_right");
    assert.equal(readingDirection(c, -2), "right_to_left");
    assert.equal(readingDirection({ ...c, workedIn: "rounds" }, -1), "right_to_left");
  });

  it("readingDirection nunca lanza y siempre devuelve uno de los dos valores", () => {
    // Sin BigInt: el tipo es number y JSON no puede producirlo.
    for (const y of [...BAD_NUMBERS.filter((v) => typeof v !== "bigint"), -1, 1e15]) {
      for (const mirror of [true, false, undefined]) {
        const d = readingDirection(c, y as number, mirror === undefined ? {} : { mirror });
        assert.ok(d === "right_to_left" || d === "left_to_right");
      }
    }
  });

  it("wornOrientation es involutiva incluso fuera del gráfico", () => {
    const td = { ...c, direction: "top_down" as const };
    for (const [x, y] of [[-1, -1], [FW, FH], [FW + 10, -7]] as const) {
      const once = wornOrientation(td, x, y);
      assert.deepEqual(wornOrientation(td, once.x, once.y), { x, y });
    }
  });

  it("paintCells y fillRegion ignoran coordenadas fuera del gráfico completo", () => {
    const outside = [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: FW, y: 0 }, { x: 0, y: FH }];
    assert.equal(paintCells(c, outside, 2, 3), c);
    for (const ref of outside) assert.equal(fillRegion(c, ref, 2, 3), c);
  });

  it("removeYarn y reorderYarns rechazan índices fuera de rango", () => {
    const p = pattern();
    for (const [i, w] of [[-1, 0], [0, -1], [3, 0], [0, 3]] as const) assert.equal(removeYarn(p, i, w), p);
    for (const order of [[0, 1], [0, 1, 2, 3], [0, 1, 3], [-1, 0, 1], [0, 0, 1]]) assert.equal(reorderYarns(p, order), p);
  });
});

describe("bordes: parámetros NaN, Infinity y no enteros", () => {
  const c = chart();
  const p = pattern();

  it("cada operación de edición devuelve el mismo objeto con un parámetro numérico inválido", () => {
    for (const bad of BAD_NUMBERS) {
      const b = bad as number;
      const label = String(bad);
      assert.equal(paintCells(c, [{ x: b, y: 0 }], 1, 3), c, `paintCells x=${label}`);
      assert.equal(paintCells(c, [{ x: 0, y: b }], 1, 3), c, `paintCells y=${label}`);
      assert.equal(paintCells(c, [{ x: 0, y: 0 }], b, 3), c, `paintCells value=${label}`);
      assert.equal(fillRegion(c, { x: b, y: 0 }, 1, 3), c, `fillRegion x=${label}`);
      assert.equal(fillRegion(c, { x: 0, y: 0 }, b, 3), c, `fillRegion value=${label}`);
      assert.equal(resizeMotif(c, b, 2, "center", 0, 3), c, `resizeMotif w=${label}`);
      assert.equal(resizeMotif(c, 4, b, "center", 0, 3), c, `resizeMotif h=${label}`);
      assert.equal(resizeMotif(c, 4, 4, "center", b, 3), c, `resizeMotif fill=${label}`);
      assert.equal(setRepeat(c, b, 1), c, `setRepeat x=${label}`);
      assert.equal(setRepeat(c, 1, b), c, `setRepeat y=${label}`);
      assert.equal(removeYarn(p, b, 0), p, `removeYarn index=${label}`);
      assert.equal(removeYarn(p, 1, b), p, `removeYarn replaceWith=${label}`);
      assert.equal(reorderYarns(p, [b, 1, 0]), p, `reorderYarns ${label}`);
      assert.equal(paintCells(c, [{ x: 0, y: 0 }], 1, b), c, `paintCells yarnCount=${label}`);
      assert.equal(fillRegion(c, { x: 0, y: 0 }, 2, b), c, `fillRegion yarnCount=${label}`);
      assert.equal(resizeMotif(c, 4, 4, "center", 0, b), c, `resizeMotif yarnCount=${label}`);
    }
  });

  it("valores de celda menores que NO_STITCH se rechazan", () => {
    assert.equal(paintCells(c, [{ x: 0, y: 0 }], NO_STITCH - 1, 3), c);
    assert.equal(fillRegion(c, { x: 0, y: 0 }, -2, 3), c);
    assert.equal(resizeMotif(c, 4, 4, "center", -2, 3), c);
  });

  it("anclaje desconocido, referencias nulas y entradas que no son arreglos no lanzan", () => {
    assert.equal(resizeMotif(c, 4, 4, "top" as Anchor, 0, 3), c);
    assert.equal(paintCells(c, "x" as never, 1, 3), c);
    assert.equal(fillRegion(c, null as never, 1, 3), c);
    assert.equal(reorderYarns(p, null as never), p);
    // Una referencia nula se salta y las demás se pintan.
    assert.equal(paintCells(c, [null as never, { x: 1, y: 0 }], 2, 3).cells[1], 2);
  });

  it("gráficos dañados (repeat 0, NaN, cells de otro largo) se devuelven sin tocar", () => {
    const broken: Chart[] = [
      chart({ repeat: { x: 0, y: 1 } }),
      chart({ repeat: { x: NaN, y: 1 } }),
      chart({ width: 2.5 }),
      chart({ cells: [0, 1] }),
      chart({ width: Infinity }),
    ];
    for (const b of broken) {
      assert.equal(paintCells(b, [{ x: 0, y: 0 }], 2, 3), b);
      assert.equal(fillRegion(b, { x: 0, y: 0 }, 2, 3), b);
      assert.equal(resizeMotif(b, 4, 4, "center", 0, 3), b);
      assert.equal(setRepeat(b, 3, 3), b);
    }
  });

  it("newChartPattern con tamaños o repeticiones inválidos no lanza y el validador lo informa", () => {
    const base = { id: "n", title: "N", workedIn: "rounds", renderAs: "flat", direction: "bottom_up", yarns: [yarnA] } as const;
    for (const bad of [NaN, Infinity, 1.5, 0, 201]) {
      const doc = newChartPattern({ ...base, yarns: [yarnA], width: bad, height: 2, repeat: { x: 1, y: 1 } });
      assert.deepEqual(doc.chart.cells, []);
      assert.ok(errorCodes(doc).length > 0, String(bad));
    }
    for (const bad of [NaN, Infinity, 1.5, 0, LIMITS.maxRepeat + 1]) {
      const doc = newChartPattern({ ...base, yarns: [yarnA], width: 2, height: 2, repeat: { x: bad, y: 1 } });
      assert.ok(errorCodes(doc).some((code) => code === "CHART_REPEAT" || code === "LIMIT"), String(bad));
    }
  });

  it("dimensionsCm no se calcula con una muestra inválida sin que el validador lo informe", () => {
    // dimensionsCm no valida: con muestra 0 da Infinity. El validador debe rechazar esa muestra.
    assert.equal(dimensionsCm(c, { stitchesPer10cm: 0, rowsPer10cm: 10 }).widthCm, Infinity);
    const doc = { ...pattern(), gauge: { stitchesPer10cm: 0, rowsPer10cm: 10 } };
    assert.ok(errorCodes(doc).length > 0, "una muestra de 0 puntos debe ser un error");
  });
});

describe("bordes: documentos congelados en profundidad", () => {
  it("derivados, validador y migración aceptan un documento congelado y no lo mutan", () => {
    forAll(
      "congelado",
      (r) => {
        const width = r.int(1, 8);
        const height = r.int(1, 6);
        const cells = Array.from({ length: width * height }, () => (r.bool(0.2) ? NO_STITCH : r.int(0, 2)));
        cells[0] = 0;
        return pattern(chart({ width, height, cells, repeat: { x: r.int(1, 5), y: r.int(1, 3) }, direction: r.pick(["bottom_up", "top_down"] as const) }));
      },
      (p) => {
        const snapshot = structuredClone(p);
        deepFreeze(p);
        const c = p.chart;
        rowStitchCounts(c);
        shaping(c);
        stitchTotal(c);
        yarnTotals(c, p.yarns.length);
        for (let y = 0; y < fullSize(c).height; y++) {
          rowFloats(c, y);
          readingDirection(c, y, { mirror: true });
          wornOrientation(c, 0, y);
        }
        validatePattern(p);
        const m = migratePattern(p);
        assert.equal(m.document, p);
        assert.deepEqual(p, snapshot);
      },
      150,
    );
  });

  it("todas las operaciones de edición con parámetros válidos funcionan sobre un documento congelado", () => {
    const p = deepFreeze(pattern(chart({ cells: [0, 1, 2, 1, 0, NO_STITCH] })));
    const snapshot = structuredClone(p);
    const outs: unknown[] = [
      paintCells(p.chart, [{ x: 5, y: 3 }], 2, 3),
      fillRegion(p.chart, { x: 0, y: 0 }, 2, 3),
      resizeMotif(p.chart, 5, 4, "center", NO_STITCH, 3),
      resizeMotif(p.chart, 1, 1, "bottom_right", 0, 3),
      setRepeat(p.chart, 9, 9),
      addYarn(p, { ...structuredClone(yarnA), id: "Z" }),
      removeYarn(p, 1, 2),
      reorderYarns(p, [2, 0, 1]),
    ];
    for (const o of outs) assert.notEqual(o, p.chart);
    assert.deepEqual(p, snapshot);
  });

  it("la salida no comparte el arreglo cells con la entrada cuando cambia", () => {
    const p = deepFreeze(pattern());
    const painted = paintCells(p.chart, [{ x: 0, y: 0 }], 2, 3);
    assert.notEqual(painted.cells, p.chart.cells);
    assert.equal(Object.isFrozen(painted.cells), false);
    const removed = removeYarn(p, 0, 1);
    assert.notEqual(removed.chart.cells, p.chart.cells);
    assert.notEqual(removed.yarns, p.yarns);
  });

  it("addYarn guarda una copia: mutar la lana original después no cambia el documento", () => {
    const y = { ...structuredClone(yarnA), id: "Z" };
    const out = addYarn(pattern(), y);
    const before = structuredClone(out.yarns.at(-1));
    (y as { id: string }).id = "cambiada";
    assert.deepEqual(out.yarns.at(-1), before);
  });
});

describe("bordes: migratePattern", () => {
  it("versiones límite", () => {
    assert.equal(migratePattern({ schemaVersion: 1.0 }).ok, true);
    for (const v of [0, -1, 0.5, 1.5, 2, NaN, Infinity, -Infinity, "1", null, true, 1n]) {
      const m = migratePattern({ schemaVersion: v });
      assert.equal(m.ok, false, String(v));
      assert.deepEqual(m.issues.map((i) => i.code), ["SCHEMA_VERSION"]);
    }
    // NaN e Infinity no son versiones: se informan como "no declara versión" (from y to null).
    assert.equal(migratePattern({ schemaVersion: NaN }).from, null);
    assert.equal(migratePattern({ schemaVersion: Infinity }).to, null);
  });

  it("nunca lanza con cualquier valor que pueda salir de JSON.parse", () => {
    const genJson = (r: ReturnType<typeof rng>, depth = 0): unknown => {
      switch (r.int(0, depth > 2 ? 3 : 5)) {
        case 0: return null;
        case 1: return r.int(-5, 5) / r.pick([1, 2]);
        case 2: return r.pick(["", "1", "chart", "schemaVersion"]);
        case 3: return r.bool();
        case 4: return Array.from({ length: r.int(0, 3) }, () => genJson(r, depth + 1));
        default: {
          const o: Record<string, unknown> = {};
          if (r.bool(0.7)) o.schemaVersion = genJson(r, depth + 1);
          if (r.bool()) o.kind = r.pick(["chart", "written", 3]);
          return o;
        }
      }
    };
    forAll("migrar JSON", (r) => genJson(r), (doc) => {
      const roundTrip = JSON.parse(JSON.stringify(doc ?? null));
      const m = migratePattern(roundTrip);
      assert.equal(m.document, roundTrip);
      assert.equal(m.ok, typeof roundTrip === "object" && roundTrip !== null && !Array.isArray(roundTrip) && roundTrip.schemaVersion === 1);
    });
  });

  it("un arreglo con schemaVersion no es un documento", () => {
    assert.equal(migratePattern(Object.assign([], { schemaVersion: 1 })).ok, false);
  });
});

describe("reproducibilidad de las propiedades", () => {
  it("rng con la misma semilla da la misma secuencia y con otra semilla, otra", () => {
    const seq = (s: number) => Array.from({ length: 20 }, ((r) => () => r.int(0, 1_000_000))(rng(s)));
    assert.deepEqual(seq(424242), seq(424242));
    assert.notDeepEqual(seq(424242), seq(424243));
  });

  it("forAll recorre las mismas entradas en dos corridas y las semillas son consecutivas", () => {
    const a: number[] = [];
    const b: number[] = [];
    forAll("a", (r) => r.int(0, 1e9), (v) => void a.push(v), 25);
    forAll("b", (r) => r.int(0, 1e9), (v) => void b.push(v), 25);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size > 1, true);
  });

  it("el mensaje de falla trae la semilla exacta del caso y reproduce el mismo caso", () => {
    let calls = 0;
    let failingValue = -1;
    let message = "";
    try {
      forAll("falla en el tercer caso", (r) => r.int(0, 1e9), (v) => {
        if (++calls === 3) {
          failingValue = v;
          throw new Error("falla");
        }
      }, 10);
    } catch (err) {
      message = (err as Error).message;
    }
    const m = /SEED=(-?\d+)/.exec(message);
    assert.ok(m, message);
    // Con esa semilla, el primer valor generado es el que falló.
    assert.equal(rng(Number(m[1])).int(0, 1e9), failingValue);
  });
});

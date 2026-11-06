/**
 * Pruebas de propiedades del estudio de colorwork: derivados (chart.ts), operaciones
 * de edición (edit.ts) y migraciones (migrate.ts). Generador con semilla (ADR 0002):
 *   SEED=12345 node --test test/property-colorwork.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANCHORS,
  NO_STITCH,
  addYarn,
  cellAt,
  fillRegion,
  fullRow,
  fullSize,
  migratePattern,
  paintCells,
  readingDirection,
  removeYarn,
  reorderYarns,
  resizeMotif,
  rowStitchCount,
  rowStitchCounts,
  setRepeat,
  shaping,
  stitchTotal,
  dimensionsCm,
  isDraftError,
  motifCoord,
  rowFloats,
  rowShapingColumns,
  validatePattern,
  wornOrientation,
  type ValidateOptions,
  type WeightCategory,
  yarnTotals,
  type Chart,
  type ChartPattern,
  type Yarn,
} from "../src/index.ts";
import { yarnA, yarnB, yarnC } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

const YARNS: readonly Yarn[] = [yarnA, yarnB, yarnC];

/** Documento de gráfico válido al azar: hasta 3 lanas, máscara opcional, todas las formas. */
function genPattern(r: Rng): ChartPattern {
  const nYarns = r.int(1, 3);
  const width = r.int(1, 12);
  const height = r.int(1, 10);
  const maskP = r.pick([0, 0.1, 0.4]);
  const cells = Array.from({ length: width * height }, () => (r.bool(maskP) ? NO_STITCH : r.int(0, nYarns - 1)));
  if (!cells.some((v) => v !== NO_STITCH)) cells[r.int(0, cells.length - 1)] = 0;
  return {
    schemaVersion: 1,
    id: "p",
    title: "Prueba",
    technique: r.pick(["knit", "crochet"] as const),
    kind: "chart",
    yarns: YARNS.slice(0, nYarns).map((y) => structuredClone(y)),
    origin: { kind: "manual" },
    ...(r.bool() ? { gauge: { stitchesPer10cm: r.int(6, 37), rowsPer10cm: r.int(8, 50) } } : {}),
    chart: {
      width,
      height,
      cells,
      repeat: { x: r.int(1, 8), y: r.int(1, 4) },
      workedIn: r.pick(["rounds", "rows"] as const),
      renderAs: r.pick(["flat", "tube", "circle", "yoke"] as const),
      direction: r.pick(["bottom_up", "top_down"] as const),
    },
  };
}

/** Como `genPattern`, pero sin filas vacías en el motivo: el documento es `valid` (E10). */
function genValidPattern(r: Rng): ChartPattern {
  const p = genPattern(r);
  const { width, height, cells } = p.chart;
  for (let y = 0; y < height; y++) {
    if (cells.slice(y * width, (y + 1) * width).every((v) => v === NO_STITCH)) cells[y * width + r.int(0, width - 1)] = r.int(0, p.yarns.length - 1);
  }
  return p;
}

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

const hasStitches = (c: Chart) => c.cells.some((v) => v !== NO_STITCH);
const errors = (p: unknown) => validatePattern(p).issues.filter((i) => i.severity === "error");

/** Valor de celda válido para el patrón: una lana existente o, a veces, sin punto. */
const genValue = (r: Rng, p: ChartPattern) => (r.bool(0.2) ? NO_STITCH : r.int(0, p.yarns.length - 1));

function genRef(r: Rng, c: Chart, outside = 0.1) {
  const { width, height } = fullSize(c);
  if (r.bool(outside)) return { x: r.pick([-1, width, width + 5]), y: r.int(-1, height) };
  return { x: r.int(0, width - 1), y: r.int(0, height - 1) };
}

describe("propiedades de los derivados", () => {
  it("la suma de rowStitchCounts es stitchTotal y cada fila coincide con recorrerla", () => {
    forAll("conteos por fila", genPattern, ({ chart }) => {
      const counts = rowStitchCounts(chart);
      assert.equal(counts.length, fullSize(chart).height);
      assert.equal(counts.reduce((a, b) => a + b, 0), stitchTotal(chart));
      counts.forEach((n, y) => {
        assert.equal(n, rowStitchCount(chart, y));
        assert.equal(n, fullRow(chart, y).length);
        assert.equal(n % chart.repeat.x, 0);
      });
    });
  });

  it("shaping es coherente con las diferencias de rowStitchCount", () => {
    forAll("forma", genPattern, ({ chart }) => {
      const sh = shaping(chart);
      assert.equal(sh.length, fullSize(chart).height);
      sh.forEach((s, y) => {
        assert.equal(s.row, y);
        assert.equal(s.stitches, rowStitchCount(chart, y));
        assert.equal(s.change, y === 0 ? 0 : rowStitchCount(chart, y) - rowStitchCount(chart, y - 1));
        assert.ok(Number.isInteger(s.perRepeat));
        assert.equal(s.perRepeat * chart.repeat.x, s.change);
      });
      // La fila 0 más la suma de los cambios da la última fila.
      const last = sh.at(-1)!;
      assert.equal(sh[0]!.stitches + sh.reduce((a, s) => a + s.change, 0), last.stitches);
    });
  });

  it("wornOrientation dos veces es la identidad y es una biyección del gráfico completo", () => {
    forAll("orientación", genPattern, ({ chart }) => {
      const { width, height } = fullSize(chart);
      const seen = new Set<number>();
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const once = wornOrientation(chart, x, y);
        assert.ok(once.x >= 0 && once.x < width && once.y >= 0 && once.y < height);
        assert.deepEqual(wornOrientation(chart, once.x, once.y), { x, y });
        if (chart.direction === "bottom_up") assert.deepEqual(once, { x, y });
        else assert.deepEqual(once, { x: width - 1 - x, y: height - 1 - y });
        seen.add(once.y * width + once.x);
      }
      assert.equal(seen.size, width * height);
    }, 150);
  });

  it("caso 4: readingDirection depende solo de workedIn, y y el espejo; el espejo la invierte", () => {
    forAll(
      "lectura",
      (r) => ({ a: genPattern(r).chart, b: genPattern(r).chart, y: r.int(0, 60) }),
      ({ a, b, y }) => {
        const flip = (d: string) => (d === "right_to_left" ? "left_to_right" : "right_to_left");
        assert.equal(readingDirection(a, y, { mirror: true }), flip(readingDirection(a, y)));
        assert.equal(readingDirection(a, y, { mirror: false }), readingDirection(a, y));
        // `b` difiere en todo salvo workedIn: misma lectura.
        const other = { ...b, workedIn: a.workedIn };
        for (const mirror of [false, true]) assert.equal(readingDirection(other, y, { mirror }), readingDirection(a, y, { mirror }));
        if (a.workedIn === "rounds") assert.equal(readingDirection(a, y), "right_to_left");
        else assert.equal(readingDirection(a, y), y % 2 === 0 ? "right_to_left" : "left_to_right");
      },
    );
  });

  it("caso 24: cambiar renderAs no cambia los conteos ni ningún otro campo", () => {
    forAll("renderAs", (r) => ({ p: genPattern(r), to: r.pick(["flat", "tube", "circle", "yoke"] as const) }), ({ p, to }) => {
      const q: ChartPattern = { ...p, chart: { ...p.chart, renderAs: to } };
      assert.equal(stitchTotal(q.chart), stitchTotal(p.chart));
      assert.deepEqual(rowStitchCounts(q.chart), rowStitchCounts(p.chart));
      assert.deepEqual(shaping(q.chart), shaping(p.chart));
      assert.deepEqual(yarnTotals(q.chart, q.yarns.length), yarnTotals(p.chart, p.yarns.length));
      const { renderAs: _a, ...restP } = p.chart;
      const { renderAs: _b, ...restQ } = q.chart;
      assert.deepEqual(restQ, restP);
    });
  });
});

describe("propiedades de las operaciones de edición", () => {
  type Op = { name: string; apply: (p: ChartPattern) => ChartPattern };

  function genOp(r: Rng, p: ChartPattern): Op {
    const c = p.chart;
    switch (r.int(0, 7)) {
      case 0: {
        const refs = Array.from({ length: r.int(0, 30) }, () => genRef(r, c));
        const v = genValue(r, p);
        return { name: "paintCells", apply: (q) => ({ ...q, chart: paintCells(q.chart, refs, v, q.yarns.length) }) };
      }
      case 1: {
        const start = genRef(r, c);
        const v = genValue(r, p);
        return { name: "fillRegion", apply: (q) => ({ ...q, chart: fillRegion(q.chart, start, v, q.yarns.length) }) };
      }
      case 2: {
        const w = r.int(0, 14);
        const h = r.int(0, 12);
        const anchor = r.pick(ANCHORS);
        const fill = genValue(r, p);
        return { name: "resizeMotif", apply: (q) => ({ ...q, chart: resizeMotif(q.chart, w, h, anchor, fill, q.yarns.length) }) };
      }
      case 3: {
        const x = r.int(0, 10);
        const y = r.int(0, 5);
        return { name: "setRepeat", apply: (q) => ({ ...q, chart: setRepeat(q.chart, x, y) }) };
      }
      case 4: {
        const id = r.pick(["A", "B", "C", "D", "E"]);
        const yarn: Yarn = { ...structuredClone(r.pick(YARNS)), id };
        return { name: "addYarn", apply: (q) => addYarn(q, yarn) };
      }
      case 5: {
        const i = r.int(0, p.yarns.length);
        const w = r.int(0, p.yarns.length);
        return { name: "removeYarn", apply: (q) => removeYarn(q, i, w) };
      }
      case 6: {
        const order = p.yarns.map((_y, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = r.int(0, i);
          [order[i], order[j]] = [order[j]!, order[i]!];
        }
        return { name: "reorderYarns", apply: (q) => reorderYarns(q, order) };
      }
      default: {
        // Parámetros inválidos: siempre devuelven el mismo objeto.
        return {
          name: "inválida",
          apply: (q) => {
            const out = [
              paintCells(q.chart, [{ x: 0, y: 0 }], -7, q.yarns.length),
              fillRegion(q.chart, { x: -3, y: 0 }, 0, q.yarns.length),
              resizeMotif(q.chart, 201, 1, "center", 0, q.yarns.length),
              setRepeat(q.chart, 0, 1),
            ];
            for (const o of out) assert.equal(o, q.chart);
            assert.equal(removeYarn(q, 0, 0), q);
            assert.equal(reorderYarns(q, [99]), q);
            return q;
          },
        };
      }
    }
  }

  it("C13: desde un documento valid, ninguna operación muta la entrada y toda secuencia deja uno savable", () => {
    forAll(
      "edición",
      (r) => {
        const p = genValidPattern(r);
        const ops: Op[] = [];
        let cur = p;
        for (let i = 0; i < 8; i++) {
          const op = genOp(r, cur);
          ops.push(op);
          cur = op.apply(cur);
        }
        return { p, ops };
      },
      ({ p, ops }) => {
        assert.equal(validatePattern(p).valid, true, "el generador debe dar un documento valid");
        let cur = p;
        for (const op of ops) {
          const snapshot = structuredClone(cur);
          deepFreeze(cur);
          const next = op.apply(cur); // con la entrada congelada, una mutación lanzaría
          assert.deepEqual(cur, snapshot, `${op.name} mutó la entrada`);
          // Las operaciones solo pueden producir errores de tejido (CHART_EMPTY,
          // CHART_ROW_EMPTY_FULL) y advertencias (CHART_SHAPING_IMPOSSIBLE…); nunca un error
          // estructural (E2 y E10). En particular, nunca CHART_CELL_VALUE.
          const res = validatePattern(next);
          const structural = res.issues.filter((i) => i.severity === "error" && !isDraftError(i));
          assert.deepEqual(structural, [], `${op.name} dejó un documento no guardable`);
          assert.equal(res.savable, true);
          if (!hasStitches(next.chart)) assert.deepEqual(errors(next).map((i) => i.code), ["CHART_EMPTY"]);
          cur = next;
        }
      },
      200,
    );
  });

  it("paintCells seguido de cellAt devuelve el valor pintado en todas las repeticiones", () => {
    forAll("pintar", (r) => {
      const p = genPattern(r);
      return { p, ref: genRef(r, p.chart, 0), v: genValue(r, p) };
    }, ({ p, ref, v }) => {
      const out = paintCells(p.chart, [ref], v, p.yarns.length);
      const mx = ref.x % p.chart.width;
      const my = ref.y % p.chart.height;
      for (let ry = 0; ry < p.chart.repeat.y; ry++) for (let rx = 0; rx < p.chart.repeat.x; rx++) {
        assert.equal(cellAt(out, rx * p.chart.width + mx, ry * p.chart.height + my), v);
      }
      // Ninguna otra celda del motivo cambia.
      const idx = my * p.chart.width + mx;
      out.cells.forEach((c, i) => i !== idx && assert.equal(c, p.chart.cells[i]));
    });
  });

  it("fillRegion cambia exactamente una región conexa del valor inicial", () => {
    forAll("relleno", (r) => {
      const p = genPattern(r);
      return { c: p.chart, start: genRef(r, p.chart, 0), v: genValue(r, p), n: p.yarns.length };
    }, ({ c, start, v, n }) => {
      const out = fillRegion(c, start, v, n);
      const w = c.width;
      const s = (start.y % c.height) * w + (start.x % w);
      const target = c.cells[s];
      if (target === v) return assert.equal(out, c);
      const changed = out.cells.map((x, i) => x !== c.cells[i]);
      assert.ok(changed[s]);
      changed.forEach((ch, i) => {
        if (!ch) return;
        assert.equal(c.cells[i], target);
        assert.equal(out.cells[i], v);
        // Cerrada: ningún vecino con el valor inicial queda sin rellenar.
        const x = i % w;
        const nbrs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].filter((j) => j >= 0 && j < c.cells.length);
        for (const j of nbrs) if (c.cells[j] === target) assert.ok(changed[j], `vecino ${j} sin rellenar`);
      });
    });
  });

  it("resizeMotif: agrandar y volver a la medida original devuelve el motivo; achicar y volver conserva la región común", () => {
    forAll("tamaño", (r) => {
      const p = genPattern(r);
      return { c: p.chart, dw: r.int(0, 7), dh: r.int(0, 7), anchor: r.pick(ANCHORS), fill: genValue(r, p), n: p.yarns.length };
    }, ({ c, dw, dh, anchor, fill, n }) => {
      const grown = resizeMotif(c, c.width + dw, c.height + dh, anchor, fill, n);
      assert.equal(grown.cells.length, (c.width + dw) * (c.height + dh));
      assert.deepEqual(resizeMotif(grown, c.width, c.height, anchor, fill, n), c);
      // Achicar (si se puede) y volver: las celdas comunes quedan iguales y el resto es `fill`.
      const sw = Math.max(1, c.width - dw);
      const sh = Math.max(1, c.height - dh);
      const back = resizeMotif(resizeMotif(c, sw, sh, anchor, fill, n), c.width, c.height, anchor, fill, n);
      assert.equal(back.cells.length, c.cells.length);
      let kept = 0;
      back.cells.forEach((v, i) => {
        if (v === c.cells[i]) kept++;
        else assert.equal(v, fill);
      });
      assert.ok(kept >= sw * sh);
    });
  });

  it("removeYarn nunca deja índices fuera de rango y suma los puntos en la lana de reemplazo", () => {
    forAll("quitar lana", (r) => {
      const p = genPattern(r);
      return { p, i: r.int(0, p.yarns.length - 1), w: r.int(0, p.yarns.length - 1) };
    }, ({ p, i, w }) => {
      const out = removeYarn(p, i, w);
      if (p.yarns.length < 2 || i === w) return assert.equal(out, p);
      assert.equal(out.yarns.length, p.yarns.length - 1);
      for (const v of out.chart.cells) assert.ok(v === NO_STITCH || (v >= 0 && v < out.yarns.length));
      const before = yarnTotals(p.chart, p.yarns.length);
      const after = yarnTotals(out.chart, out.yarns.length);
      const target = w > i ? w - 1 : w;
      assert.equal(after[target], before[w]! + before[i]!);
      assert.equal(stitchTotal(out.chart), stitchTotal(p.chart));
      assert.equal(out.yarns[target]!.id, p.yarns[w]!.id);
    });
  });

  it("reorderYarns con una permutación conserva yarnTotals permutado y su inversa lo deshace", () => {
    forAll("reordenar", (r) => {
      const p = genPattern(r);
      const order = p.yarns.map((_y, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = r.int(0, i);
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      return { p, order };
    }, ({ p, order }) => {
      const out = reorderYarns(p, order);
      const before = yarnTotals(p.chart, p.yarns.length);
      assert.deepEqual(yarnTotals(out.chart, out.yarns.length), order.map((o) => before[o]));
      assert.deepEqual(out.yarns.map((y) => y.id), order.map((o) => p.yarns[o]!.id));
      const inverse = new Array<number>(order.length);
      order.forEach((old, i) => (inverse[old] = i));
      assert.deepEqual(reorderYarns(out, inverse), p);
    });
  });
});

describe("propiedades de las migraciones", () => {
  it("migratePattern es idempotente con documentos válidos y con basura", () => {
    const junk: unknown[] = [null, undefined, 0, "x", [], {}, { schemaVersion: 2 }, { schemaVersion: "1" }, { schemaVersion: -1 }];
    forAll("migrar", (r) => (r.bool(0.7) ? genPattern(r) : r.pick(junk)), (doc) => {
      const once = migratePattern(doc);
      const twice = migratePattern(once.document);
      assert.deepEqual(twice.document, once.document);
      assert.equal(twice.ok, once.ok);
      assert.equal(twice.to, once.to);
      if (once.ok) {
        assert.equal(twice.from, twice.to);
        assert.equal(once.document, doc);
      }
    });
  });
});

describe("rendimiento", () => {
  it("un gráfico completo de 300 × 300 se valida y deriva en menos de 200 ms", () => {
    // Motivo de 100 × 100 repetido 3 × 3, con máscara y dos lanas.
    const r = (i: number) => ((i * 2654435761) >>> 0) % 7;
    const cells = Array.from({ length: 100 * 100 }, (_v, i) => (r(i) === 0 ? NO_STITCH : r(i) % 2));
    const p: ChartPattern = {
      ...genPattern({ next: () => 0, int: (a) => a, pick: (xs) => xs[0] as never, bool: () => false }),
      yarns: [structuredClone(yarnA), structuredClone(yarnB)],
      technique: "knit",
      chart: { width: 100, height: 100, cells, repeat: { x: 3, y: 3 }, workedIn: "rounds", renderAs: "circle", direction: "bottom_up" },
    };
    const t0 = performance.now();
    validatePattern(p);
    rowStitchCounts(p.chart);
    shaping(p.chart);
    const ms = performance.now() - t0;
    assert.ok(ms < 200, `tardó ${ms.toFixed(1)} ms`);
  });
});

// ------------------------------------------------- C14 y C15 (ADR 0003, E10)

/**
 * Documento de gráfico guardable al azar: puede quedar vacío (CHART_EMPTY), con filas sin
 * puntos (CHART_ROW_EMPTY_FULL) y con cuñas que dan CHART_SHAPING_IMPOSSIBLE.
 */
function genSavablePattern(r: Rng): ChartPattern {
  const p = genPattern(r);
  const { width, height, cells } = p.chart;
  const mode = r.int(0, 3);
  if (mode === 0) cells.fill(NO_STITCH);
  else if (mode === 1) for (let x = 0; x < width; x++) cells[r.int(0, height - 1) * width + x] = NO_STITCH;
  else if (mode === 2 && height > 1) {
    // Cuña que se cierra de golpe en la última fila: de `width` a 1 por repetición.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells[y * width + x] = y === height - 1 && x > 0 ? NO_STITCH : r.int(0, p.yarns.length - 1);
  }
  return p;
}

describe("C14: los derivados aceptan cualquier documento savable", () => {
  it("no lanzan, rowStitchCounts suma stitchTotal y shaping es consistente (incluye CHART_EMPTY, filas vacías e IMPOSSIBLE)", () => {
    let empty = 0;
    let emptyRows = 0;
    let impossible = 0;
    forAll(
      "derivados savable",
      genSavablePattern,
      (p) => {
        const res = validatePattern(p);
        assert.equal(res.savable, true, JSON.stringify(res.issues.filter((i) => i.severity === "error")));
        const codes = res.issues.map((i) => i.code);
        if (codes.includes("CHART_EMPTY")) empty++;
        if (codes.includes("CHART_ROW_EMPTY_FULL")) emptyRows++;
        if (codes.includes("CHART_SHAPING_IMPOSSIBLE")) impossible++;
        const c = p.chart;
        const { width, height } = fullSize(c);
        const counts = rowStitchCounts(c);
        assert.equal(counts.length, height);
        assert.equal(counts.reduce((a, b) => a + b, 0), stitchTotal(c));
        const sh = shaping(c);
        sh.forEach((s, y) => {
          assert.equal(s.stitches, counts[y]);
          assert.equal(s.change, y === 0 ? 0 : counts[y]! - counts[y - 1]!);
          assert.equal(s.perRepeat * c.repeat.x, s.change);
        });
        assert.equal(yarnTotals(c, p.yarns.length).reduce((a, b) => a + b, 0), stitchTotal(c));
        for (let y = 0; y < height; y++) {
          assert.equal(fullRow(c, y).length, counts[y]);
          rowFloats(c, y);
          const cols = rowShapingColumns(c, y);
          assert.ok(Array.isArray(cols.decreases) && Array.isArray(cols.increases));
          readingDirection(c, y);
        }
        for (const [x, y] of [[0, 0], [width - 1, height - 1]] as const) {
          motifCoord(c, x, y);
          wornOrientation(c, x, y);
          cellAt(c, x, y);
        }
        const d = dimensionsCm(c, p.gauge ?? { stitchesPer10cm: 20, rowsPer10cm: 28 });
        assert.ok(Number.isFinite(d.widthCm) && d.widthCm >= 0 && Number.isFinite(d.heightCm));
      },
      400,
    );
    // El generador cubre de verdad los tres casos.
    assert.ok(empty > 0 && emptyRows > 0 && impossible > 0, `vacíos ${empty}, filas ${emptyRows}, imposibles ${impossible}`);
  });
});

/** Opciones de validación al azar, válidas e inválidas. */
function genOptions(r: Rng): ValidateOptions {
  const o: ValidateOptions = {};
  if (r.bool()) o.fibers = new Set(r.pick([[], ["lana"], ["algodon", "lana"]]));
  if (r.bool()) o.paletteIds = new Set(r.pick([[], ["crudo"], ["crudo", "rojo", "azul-marino"]]));
  if (r.bool()) o.assumedGauge = r.pick([{ stitchesPer10cm: r.int(1, 40), rowsPer10cm: r.int(1, 50) }, { stitchesPer10cm: 0, rowsPer10cm: 0 }]);
  if (r.bool()) o.weightCat = r.pick([0, 3, 7, 8, -1, 2.5] as number[]) as WeightCategory;
  if (r.bool()) o.maxFloatCm = r.pick([0, -1, 0.1, 2.5, 10, Number.NaN]);
  if (r.bool()) o.maxFloatStitches = r.pick([0, -1, 1, 3, 4.5, 20, Number.NaN, Infinity]);
  return o;
}

describe("C15: ninguna opción de ValidateOptions cambia los errores (E10)", () => {
  const errorsOf = (p: unknown, opts?: ValidateOptions) => validatePattern(p, opts).issues.filter((i) => i.severity === "error");

  it("propiedad: mismos errores, mismo valid y mismo savable con y sin opciones", () => {
    forAll(
      "opciones",
      (r) => {
        const p: ChartPattern = r.bool(0.3) ? genSavablePattern(r) : genPattern(r);
        // A veces, una lana con fibra o color fuera de los catálogos, o un paletteId de tipo incorrecto.
        if (r.bool(0.3)) p.yarns[0] = { ...p.yarns[0]!, composition: [{ fiber: "yak", percent: 100 }], color: { hex: "#123456", paletteId: r.pick(["otro", 3 as unknown as string]) } };
        return { p, opts: genOptions(r) };
      },
      ({ p, opts }) => {
        const base = validatePattern(p);
        const withOpts = validatePattern(p, opts);
        assert.deepEqual(errorsOf(p, opts), errorsOf(p));
        assert.equal(withOpts.valid, base.valid);
        assert.equal(withOpts.savable, base.savable);
      },
      400,
    );
  });
});

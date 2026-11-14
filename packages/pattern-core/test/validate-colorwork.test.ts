/**
 * T2b y T2c: validaciones nuevas del colorwork (ADR 0003, sección 4, y ADR 0005), los
 * cambios de contrato C1 a C9 (enmiendas E1 a E9 del ADR 0003), `dimensionsCm` con
 * circunferencia y los casos de dominio 8 a 18 y 20 a 23 de
 * docs/casos-dominio-colorwork.md. Las propiedades usan la semilla de
 * test/support/property.ts:
 *   SEED=12345 node --test test/validate-colorwork.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANCHORS,
  DRAFT_ERROR_CODES,
  EDIT_LIMITS,
  LIMITS,
  NO_STITCH,
  SCHEMA_VERSION,
  addYarn,
  dimensionsCm,
  fillRegion,
  fullRow,
  isDraftError,
  migratePattern,
  motifCell,
  motifCoord,
  newChartPattern,
  paintCells,
  readingDirection,
  removeYarn,
  reorderYarns,
  resizeMotif,
  rowFloats,
  rowShapingColumns,
  shaping,
  validatePattern,
  validateYarn,
  wornOrientation,
  type Chart,
  type ChartPattern,
  type Issue,
  type MigrationResult,
  type ValidateOptions,
  type WeightCategory,
  type Yarn,
} from "../src/index.ts";
import { yarnA, yarnB, yarnC } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

const A = 0;
const B = 1;
const C = 2;
const _ = NO_STITCH;

/** Lanas del mismo grosor (3), para que YARNS_MIXED_WEIGHT no aparezca salvo que se pida. */
const Y3: Yarn[] = [yarnA, yarnB, { ...yarnC, weight: 3 }];

function chartOf(rows: number[][], over: Partial<Chart> = {}): Chart {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    cells: rows.flat(),
    repeat: { x: 1, y: 1 },
    workedIn: "rounds",
    renderAs: "flat",
    direction: "bottom_up",
    ...over,
  };
}

/** Documento de palillo, sin muestra salvo que se pase. */
function doc(chart: Chart, over: Partial<ChartPattern> = {}): ChartPattern {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "p",
    title: "Prueba",
    technique: "knit",
    kind: "chart",
    yarns: Y3.map((y) => structuredClone(y)),
    origin: { kind: "manual" },
    chart,
    ...over,
  };
}

/**
 * Gráfico cuyas vueltas completas suman `totals` con `R` repeticiones: la fila i del
 * motivo tiene `totals[i] / R` puntos alineados a la izquierda (lana A).
 */
function totalsChart(totals: number[], R: number, over: Partial<Chart> = {}): Chart {
  const per = totals.map((t) => {
    assert.equal(t % R, 0, `${t} no es múltiplo de ${R}`);
    return t / R;
  });
  const width = Math.max(...per);
  return chartOf(per.map((n) => Array.from({ length: width }, (_v, x) => (x < n ? A : _))), { repeat: { x: R, y: 1 }, ...over });
}

const issuesOf = (p: unknown, opts?: ValidateOptions) => validatePattern(p, opts).issues;
const codesOf = (p: unknown, opts?: ValidateOptions) => issuesOf(p, opts).map((i) => i.code);
const find = (p: unknown, code: string, opts?: ValidateOptions): Issue[] => issuesOf(p, opts).filter((i) => i.code === code);
const has = (p: unknown, code: string, opts?: ValidateOptions) => find(p, code, opts).length > 0;

// ------------------------------------------------------------- Forma (ADR 0005)

describe("caso 8: CHART_SHAPING_IMPOSSIBLE y CHART_SHAPING_TOO_FAST (todas las formas)", () => {
  for (const renderAs of ["flat", "tube", "circle"] as const) {
    it(`80 → 8 es IMPOSSIBLE (advertencia, E10), 80 → 40 nada y 80 → 30 TOO_FAST (${renderAs})`, () => {
      const impossible = find(doc(totalsChart([80, 8], 8, { renderAs })), "CHART_SHAPING_IMPOSSIBLE");
      assert.equal(impossible.length, 1);
      assert.equal(impossible[0]!.severity, "warning");
      assert.deepEqual(impossible[0]!.data, { row: 1, from: 80, to: 8, perRepeat: -9, min: 27 });
      assert.equal(
        impossible[0]!.message,
        "En la vuelta 2 se pasa de 80 a 8 puntos: disminuyendo de a 2 o 3 juntos quedan como mínimo 27. Para llegar a 8 hay que cerrar puntos, dejarlos en espera, tejer 4 o más juntos o pasar la hebra por todos.",
      );
      const r = validatePattern(doc(totalsChart([80, 8], 8, { renderAs })));
      assert.equal(r.valid, true);
      assert.equal(r.savable, true);
      assert.ok(!has(doc(totalsChart([80, 8], 8, { renderAs })), "CHART_SHAPING_TOO_FAST"));

      const half = doc(totalsChart([80, 40], 8, { renderAs }));
      assert.ok(!has(half, "CHART_SHAPING_IMPOSSIBLE") && !has(half, "CHART_SHAPING_TOO_FAST"));
      // Con R = 8 son −5 por repetición: en el círculo también da STEEP (otra regla).
      assert.equal(has(half, "CHART_SHAPING_STEEP"), renderAs === "circle");

      const fast = find(doc(totalsChart([80, 30], 10, { renderAs })), "CHART_SHAPING_TOO_FAST");
      assert.equal(fast.length, 1);
      assert.equal(fast[0]!.severity, "warning");
      assert.match(fast[0]!.message, /exige disminuir de a 3 juntos o más y la tela se frunce/);
      assert.ok(!has(doc(totalsChart([80, 30], 10, { renderAs })), "CHART_SHAPING_IMPOSSIBLE"));
    });
  }

  it("propiedad: advertencia IMPOSSIBLE si y solo si restantes < ceil(n/3); TOO_FAST si y solo si ceil(n/3) ≤ restantes < ceil(n/2); nunca error", () => {
    forAll(
      "disminución",
      (r) => {
        const n = r.int(2, 160);
        return { n, rest: r.int(1, n - 1), renderAs: r.pick(["flat", "tube", "circle", "yoke"] as const) };
      },
      ({ n, rest, renderAs }) => {
        const p = doc(totalsChart([n, rest], 1, { renderAs }));
        const imp = find(p, "CHART_SHAPING_IMPOSSIBLE");
        assert.equal(imp.length > 0, rest < Math.ceil(n / 3));
        assert.ok(imp.every((i) => i.severity === "warning"));
        assert.equal(has(p, "CHART_SHAPING_TOO_FAST"), Math.ceil(n / 3) <= rest && rest < Math.ceil(n / 2));
        assert.equal(validatePattern(p).valid, true);
      },
    );
  });

  it("propiedad: un aumento nunca es IMPOSSIBLE y es TOO_FAST si y solo si supera el doble", () => {
    forAll(
      "aumento",
      (r) => {
        const n = r.int(1, 60);
        return { n, next: r.int(n + 1, Math.min(200, n * 4)) };
      },
      ({ n, next }) => {
        const p = doc(totalsChart([n, next], 1));
        assert.ok(!has(p, "CHART_SHAPING_IMPOSSIBLE"));
        assert.equal(has(p, "CHART_SHAPING_TOO_FAST"), next > n * 2);
      },
    );
  });

  it("se mide también en el borde entre dos repeticiones verticales", () => {
    // Motivo de 9 a 3 por vuelta; repetido hacia arriba, la vuelta 3 pasa de 3 a 9 (más del doble).
    const p = doc(totalsChart([9, 6, 3], 1, { repeat: { x: 1, y: 2 } }));
    const fast = find(p, "CHART_SHAPING_TOO_FAST");
    assert.deepEqual(fast.map((i) => i.data?.row), [3]);
    assert.match(fast[0]!.message, /vuelta 4 se pasa de 3 a 9 puntos/);
  });

  it("no mide la forma contra una vuelta sin puntos (ya es error de tejido CHART_ROW_EMPTY_FULL)", () => {
    const p = doc(chartOf([[A, A, A, A, A, A], [_, _, _, _, _, _], [A, A, A, A, A, A]]));
    const codes = codesOf(p);
    assert.ok(!codes.includes("CHART_SHAPING_IMPOSSIBLE") && !codes.includes("CHART_SHAPING_TOO_FAST"));
    assert.ok(codes.includes("CHART_ROW_EMPTY_FULL"));
    const r = validatePattern(p);
    assert.equal(r.valid, false);
    assert.equal(r.savable, true);
  });
});

describe("caso 9: CHART_SHAPING_STEEP (círculo)", () => {
  it("−3 por repetición avisa, −2 no; lo mismo con aumentos; fuera del círculo nunca", () => {
    assert.ok(has(doc(totalsChart([80, 56], 8, { renderAs: "circle" })), "CHART_SHAPING_STEEP"));
    assert.ok(!has(doc(totalsChart([80, 64], 8, { renderAs: "circle" })), "CHART_SHAPING_STEEP"));
    const up = { renderAs: "circle", direction: "top_down" } as const;
    assert.ok(has(doc(totalsChart([40, 64], 8, up)), "CHART_SHAPING_STEEP"));
    assert.ok(!has(doc(totalsChart([40, 56], 8, up)), "CHART_SHAPING_STEEP"));
    for (const renderAs of ["flat", "tube"] as const) assert.ok(!has(doc(totalsChart([80, 56], 8, { renderAs })), "CHART_SHAPING_STEEP"));
    const steep = find(doc(totalsChart([80, 56], 8, { renderAs: "circle" })), "CHART_SHAPING_STEEP")[0]!;
    assert.equal(steep.severity, "warning");
    assert.equal(steep.data?.perRepeat, -3);
    assert.match(steep.message, /pierden 3 puntos por repetición/);
  });
});

describe("caso 10: CHART_CIRCLE_NOT_CLOSED (bottom_up, por el total)", () => {
  const close = (total: number, R: number) => find(doc(totalsChart([total], R, { renderAs: "circle" })), "CHART_CIRCLE_NOT_CLOSED");

  it("8 y 16: nada; 20: info; 30: advertencia", () => {
    assert.deepEqual(close(8, 8), []);
    assert.deepEqual(close(16, 8), []);
    assert.deepEqual(close(20, 10).map((i) => i.severity), ["info"]);
    assert.deepEqual(close(30, 6).map((i) => i.severity), ["warning"]);
    assert.equal(close(30, 6)[0]!.message, "La última vuelta deja 30 puntos. Lo habitual es cerrar con 8 a 16 puntos pasando la hebra por todos; con 30 puntos el cierre queda abultado.");
  });

  it("propiedad: depende solo del total, no de R; en top_down o fuera del círculo no aplica", () => {
    forAll(
      "cierre",
      (r) => ({ R: r.int(1, 12), k: r.int(1, 8) }),
      ({ R, k }) => {
        const total = R * k;
        const got = close(total, R).map((i) => i.severity);
        assert.deepEqual(got, total > 24 ? ["warning"] : total > 16 ? ["info"] : []);
        assert.ok(!has(doc(totalsChart([total], R, { renderAs: "circle", direction: "top_down" })), "CHART_CIRCLE_NOT_CLOSED"));
        assert.ok(!has(doc(totalsChart([total], R, { renderAs: "tube" })), "CHART_CIRCLE_NOT_CLOSED"));
      },
    );
  });

  it("usa la última vuelta del gráfico completo", () => {
    // Cuña de 80 a 8 (caso 7): cierra con 8, nada.
    assert.deepEqual(find(doc(totalsChart([80, 72, 64, 56, 48, 40, 32, 24, 16, 8], 8, { renderAs: "circle" })), "CHART_CIRCLE_NOT_CLOSED"), []);
  });
});

describe("caso 11: CHART_CIRCLE_REPEATS y CHART_WEDGE_TOO_NARROW (validar con tejedora)", () => {
  it("R = 3 o 14: info; R = 4, 6, 8, 12: nada", () => {
    // validar con tejedora
    for (const R of [3, 14, 1, 13]) {
      const i = find(doc(totalsChart([R * 4], R, { renderAs: "circle" })), "CHART_CIRCLE_REPEATS");
      assert.deepEqual(i.map((x) => x.severity), ["info"], String(R));
    }
    for (const R of [4, 6, 8, 12]) assert.ok(!has(doc(totalsChart([R * 4], R, { renderAs: "circle" })), "CHART_CIRCLE_REPEATS"), String(R));
    assert.ok(!has(doc(totalsChart([12], 3, { renderAs: "tube" })), "CHART_CIRCLE_REPEATS"));
  });

  it("máximo de puntos por cuña menor que 4: info; 4: nada", () => {
    // validar con tejedora
    const narrow = find(doc(totalsChart([24, 16, 8], 8, { renderAs: "circle" })), "CHART_WEDGE_TOO_NARROW");
    assert.deepEqual(narrow.map((i) => [i.severity, i.data?.max]), [["info", 3]]);
    assert.ok(!has(doc(totalsChart([32, 24], 8, { renderAs: "circle" })), "CHART_WEDGE_TOO_NARROW"));
    assert.ok(!has(doc(totalsChart([24], 8, { renderAs: "flat" })), "CHART_WEDGE_TOO_NARROW"));
  });
});

describe("caso 12: CHART_CIRCLE_REPEAT_Y solo con máscara", () => {
  it("círculo con repeat.y > 1 y NO_STITCH: advertencia; sin máscara o con repeat.y = 1: nada", () => {
    const masked = totalsChart([32, 24], 8, { renderAs: "circle", repeat: { x: 8, y: 2 } });
    assert.deepEqual(find(doc(masked), "CHART_CIRCLE_REPEAT_Y").map((i) => i.severity), ["warning"]);
    assert.ok(!has(doc({ ...masked, repeat: { x: 8, y: 1 } }), "CHART_CIRCLE_REPEAT_Y"));
    const full = chartOf([[A, B, A, B], [B, A, B, A]], { renderAs: "circle", repeat: { x: 8, y: 3 } });
    assert.ok(!has(doc(full), "CHART_CIRCLE_REPEAT_Y"));
    assert.ok(!has(doc({ ...masked, renderAs: "tube" }), "CHART_CIRCLE_REPEAT_Y"));
  });
});

describe("caso 13: CHART_SHAPING_UNEXPECTED (sentido de la forma)", () => {
  it("bottom_up con aumentos y top_down con disminuciones avisan", () => {
    const bu = find(doc(totalsChart([64, 72], 8, { renderAs: "circle", direction: "bottom_up" })), "CHART_SHAPING_UNEXPECTED");
    assert.deepEqual(bu.map((i) => i.severity), ["warning"]);
    const td = find(doc(totalsChart([72, 64], 8, { renderAs: "circle", direction: "top_down" })), "CHART_SHAPING_UNEXPECTED");
    assert.deepEqual(td.map((i) => i.severity), ["warning"]);
    assert.ok(!has(doc(totalsChart([72, 64], 8, { renderAs: "circle", direction: "bottom_up" })), "CHART_SHAPING_UNEXPECTED"));
    assert.ok(!has(doc(totalsChart([64, 72], 8, { renderAs: "flat" })), "CHART_SHAPING_UNEXPECTED"));
  });

  it("top_down de 8 a 16 con R = 8: sin STEEP, sin TOO_FAST y sin UNEXPECTED", () => {
    const codes = codesOf(doc(totalsChart([8, 16], 8, { renderAs: "circle", direction: "top_down" })));
    for (const code of ["CHART_SHAPING_STEEP", "CHART_SHAPING_TOO_FAST", "CHART_SHAPING_UNEXPECTED", "CHART_SHAPING_IMPOSSIBLE"]) assert.ok(!codes.includes(code), code);
  });
});

describe("caso 14: CHART_CIRCLE_START (top_down)", () => {
  const start = (total: number, R: number) =>
    find(doc(totalsChart([total, total], R, { renderAs: "circle", direction: "top_down" })), "CHART_CIRCLE_START").map((i) => i.severity);

  it("3: info; 8: nada; 18: info; 4 y 16: nada", () => {
    assert.deepEqual(start(3, 3), ["info"]);
    assert.deepEqual(start(8, 8), []);
    assert.deepEqual(start(18, 6), ["info"]);
    assert.deepEqual(start(4, 4), []);
    assert.deepEqual(start(16, 8), []);
  });

  it("en bottom_up no aplica", () => {
    assert.ok(!has(doc(totalsChart([3, 3], 3, { renderAs: "circle" })), "CHART_CIRCLE_START"));
  });
});

// ---------------------------------------------------- Hebras flotantes y lanas

describe("caso 15: hebra que cierra la vuelta en redondo", () => {
  const row = [A, B, A, A, A, A, A, A, A, A, A, A];
  const gauge = { stitchesPer10cm: 18, rowsPer10cm: 24 };

  it("en redondo la hebra de B mide 11 y avisa; de ida y vuelta, nada", () => {
    const f = find(doc(chartOf([row], { workedIn: "rounds" }), { gauge }), "CHART_FLOAT_LONG");
    assert.equal(f.length, 1);
    assert.deepEqual([f[0]!.data?.yarn, f[0]!.data?.length, f[0]!.data?.max], [B, 11, 4]);
    assert.match(f[0]!.message, /vuelta 1, la hebra flotante de la lana B \(#BA222C\) mide 11 puntos \(≈6,1 cm\)\. Conviene enganchar la hebra/);
    assert.deepEqual(find(doc(chartOf([row], { workedIn: "rows" }), { gauge }), "CHART_FLOAT_LONG"), []);
  });
});

describe("caso 16: B AAAAA B de ida y vuelta", () => {
  const p = (over: Partial<ChartPattern> = {}) => doc(chartOf([[B, A, A, A, A, A, B]], { workedIn: "rows" }), over);

  it("muestra de 18: advertencia; de 37: nada; sin muestra ni supuestos: nada", () => {
    const warn = find(p({ gauge: { stitchesPer10cm: 18, rowsPer10cm: 24 } }), "CHART_FLOAT_LONG");
    assert.deepEqual(warn.map((i) => [i.severity, i.data?.length, i.data?.max]), [["warning", 5, 4]]);
    assert.match(warn[0]!.message, /fila 1/);
    assert.deepEqual(find(p({ gauge: { stitchesPer10cm: 37, rowsPer10cm: 50 } }), "CHART_FLOAT_LONG"), []);
    assert.deepEqual(find(p(), "CHART_FLOAT_LONG"), []);
  });

  it("sin muestra el tope es 5 y no se informan cm", () => {
    const long = doc(chartOf([[B, A, A, A, A, A, A, B]], { workedIn: "rows" }));
    const f = find(long, "CHART_FLOAT_LONG");
    assert.deepEqual([f[0]!.data?.length, f[0]!.data?.max, f[0]!.data?.gauge], [6, 5, "none"]);
    assert.doesNotMatch(f[0]!.message, /cm/);
  });

  it("el tope de 5 se aplica también con una muestra fina", () => {
    const fine = doc(chartOf([[B, A, A, A, A, A, A, B]], { workedIn: "rows" }), { gauge: { stitchesPer10cm: 40, rowsPer10cm: 54 } });
    assert.equal(find(fine, "CHART_FLOAT_LONG")[0]?.data?.max, 5);
  });
});

describe("caso 17: máximo de hebra por categoría con la muestra supuesta", () => {
  // Una hebra de 20 puntos supera cualquier máximo, así `data.max` muestra el umbral.
  const long = doc(chartOf([[B, ...new Array<number>(20).fill(A), B]], { workedIn: "rows" }));
  const SUPUESTA = [37, 30, 25, 23, 18, 14, 9, 6];

  it("weightCat 0 a 7 da 5, 5, 5, 5, 4, 3, 2, 1; assumedGauge de la tabla da lo mismo", () => {
    const byCat = ([0, 1, 2, 3, 4, 5, 6, 7] as WeightCategory[]).map((weightCat) => find(long, "CHART_FLOAT_LONG", { weightCat })[0]?.data?.max);
    assert.deepEqual(byCat, [5, 5, 5, 5, 4, 3, 2, 1]);
    const byGauge = SUPUESTA.map((s) => find(long, "CHART_FLOAT_LONG", { assumedGauge: { stitchesPer10cm: s, rowsPer10cm: Math.round(s * 1.35) } })[0]?.data?.max);
    assert.deepEqual(byGauge, byCat);
  });

  it("propiedad: el máximo nunca crece con la categoría ni pasa de 5", () => {
    forAll(
      "umbral por grosor",
      (r) => ({ a: r.int(0, 7) as WeightCategory, b: r.int(0, 7) as WeightCategory }),
      ({ a, b }) => {
        const max = (weightCat: WeightCategory) => find(long, "CHART_FLOAT_LONG", { weightCat })[0]?.data?.max as number;
        if (a <= b) assert.ok(max(a) >= max(b));
        assert.ok(max(a) <= 5 && max(a) >= 1);
      },
      64,
    );
  });

  it("un weightCat inválido se ignora (tope de 5)", () => {
    for (const weightCat of [8, -1, 2.5, Number.NaN] as unknown as WeightCategory[]) assert.equal(find(long, "CHART_FLOAT_LONG", { weightCat })[0]?.data?.max, 5);
  });
});

describe("caso 18: documento sin gauge con weightCat o assumedGauge", () => {
  const row = [B, A, A, A, A, A, B]; // hebra de 5

  it("weightCat 4 usa 18 puntos (máximo 4) y el documento sigue sin gauge", () => {
    const p = doc(chartOf([row], { workedIn: "rows" }));
    const before = structuredClone(p);
    const f = find(p, "CHART_FLOAT_LONG", { weightCat: 4 });
    assert.deepEqual([f[0]?.data?.max, f[0]?.data?.gauge], [4, "weight"]);
    assert.match(f[0]!.message, /con la muestra supuesta/);
    assert.deepEqual(p, before);
    assert.ok(!("gauge" in p));
    const g = find(p, "CHART_FLOAT_LONG", { assumedGauge: { stitchesPer10cm: 18, rowsPer10cm: 24 } });
    assert.deepEqual([g[0]?.data?.max, g[0]?.data?.gauge], [4, "assumed"]);
  });

  it("prioridad: gauge del documento, después assumedGauge, después weightCat", () => {
    const withGauge = doc(chartOf([row], { workedIn: "rows" }), { gauge: { stitchesPer10cm: 37, rowsPer10cm: 50 } });
    assert.deepEqual(find(withGauge, "CHART_FLOAT_LONG", { assumedGauge: { stitchesPer10cm: 9, rowsPer10cm: 12 }, weightCat: 7 }), []);
    const noGauge = doc(chartOf([row], { workedIn: "rows" }));
    assert.deepEqual(find(noGauge, "CHART_FLOAT_LONG", { assumedGauge: { stitchesPer10cm: 37, rowsPer10cm: 50 }, weightCat: 7 }), []);
    // Un assumedGauge inválido se ignora y se usa weightCat.
    assert.equal(find(noGauge, "CHART_FLOAT_LONG", { assumedGauge: { stitchesPer10cm: 0, rowsPer10cm: 1 }, weightCat: 4 })[0]?.data?.max, 4);
  });
});

describe("caso 21: CHART_COLORS_PER_ROW", () => {
  it("3 lanas en una vuelta: info; 2: nada", () => {
    assert.deepEqual(find(doc(chartOf([[A, B, C, A]])), "CHART_COLORS_PER_ROW").map((i) => i.severity), ["info"]);
    assert.deepEqual(find(doc(chartOf([[A, B, B, A], [C, C, C, C]])), "CHART_COLORS_PER_ROW"), []);
  });
});

describe("caso 22: YARNS_MIXED_WEIGHT", () => {
  it("lanas de categorías 2 y 4: info; del mismo grosor: nada", () => {
    const mixed = doc(chartOf([[A, B]]), { yarns: [{ ...yarnA, weight: 2 }, { ...yarnB, weight: 4 }] });
    const i = find(mixed, "YARNS_MIXED_WEIGHT");
    assert.deepEqual(i.map((x) => [x.severity, x.data?.weights]), [["info", [2, 4]]]);
    assert.deepEqual(find(doc(chartOf([[A, B]]), { yarns: [yarnA, yarnB] }), "YARNS_MIXED_WEIGHT"), []);
  });
});

describe("caso 23: CHART_ROWS_SHAPE", () => {
  it("tubo o círculo de ida y vuelta: advertencia; plano de ida y vuelta o tubo en redondo: nada", () => {
    for (const renderAs of ["tube", "circle"] as const) {
      const i = find(doc(chartOf([[A, B, A, B]], { renderAs, workedIn: "rows", repeat: { x: 4, y: 1 } })), "CHART_ROWS_SHAPE");
      assert.equal(i.length, 1, renderAs);
      assert.equal(i[0]!.severity, "warning");
      assert.match(i[0]!.message, /se teje de ida y vuelta: la pieza queda abierta y hay que coserla/);
      assert.match(i[0]!.message, renderAs === "circle" ? /^La vista es de círculo/ : /^La vista es de tubo/);
    }
    assert.ok(!has(doc(chartOf([[A, B]], { renderAs: "flat", workedIn: "rows" })), "CHART_ROWS_SHAPE"));
    assert.ok(!has(doc(chartOf([[A, B]], { renderAs: "tube", workedIn: "rounds" })), "CHART_ROWS_SHAPE"));
  });
});

// --------------------------------------------------------------- Otras reglas

describe("TITLE_LENGTH", () => {
  it("de 1 a 120 caracteres (puntos de código, como char_length)", () => {
    const t = (title: string) => find(doc(chartOf([[A]]), { title }), "TITLE_LENGTH");
    assert.deepEqual(t("").map((i) => i.severity), ["error"]);
    assert.deepEqual(t("x"), []);
    assert.deepEqual(t("x".repeat(120)), []);
    assert.equal(t("x".repeat(121))[0]?.data?.length, 121);
    // 120 emojis son 240 unidades UTF-16, pero 120 caracteres para Postgres.
    assert.deepEqual(t("🧶".repeat(120)), []);
    assert.equal(t("🧶".repeat(121)).length, 1);
  });

  it("también en patrones escritos; un título que no es texto sigue siendo SHAPE", () => {
    const p = { ...doc(chartOf([[A]])), title: 3 };
    assert.ok(codesOf(p).includes("SHAPE") && !codesOf(p).includes("TITLE_LENGTH"));
  });
});

describe("CHART_RENDER_UNSUPPORTED", () => {
  it("yoke: info; las demás formas: nada", () => {
    assert.deepEqual(find(doc(chartOf([[A, B]], { renderAs: "yoke" })), "CHART_RENDER_UNSUPPORTED").map((i) => i.severity), ["info"]);
    for (const renderAs of ["flat", "tube", "circle"] as const) assert.ok(!has(doc(chartOf([[A, B]], { renderAs })), "CHART_RENDER_UNSUPPORTED"));
  });
});

describe("CHART_ROW_EMPTY_FULL", () => {
  it("un solo error de tejido con todas las vueltas vacías del gráfico completo; no se duplica con CHART_EMPTY_ROW", () => {
    const p = doc(chartOf([[A, A], [_, _], [B, B]], { repeat: { x: 2, y: 3 } }));
    const full = find(p, "CHART_ROW_EMPTY_FULL");
    assert.equal(full.length, 1);
    assert.equal(full[0]!.severity, "error");
    assert.deepEqual(full[0]!.data, { count: 3, rows: [1, 4, 7], motifRows: [1] });
    assert.match(full[0]!.message, /3 vueltas sin puntos \(la primera es la 2\)/);
    assert.equal(find(p, "CHART_EMPTY_ROW").length, 0);
    const r = validatePattern(p);
    assert.equal(r.valid, false);
    assert.equal(r.savable, true);
    assert.ok(r.issues.filter((i) => i.severity === "error").every(isDraftError));
    assert.deepEqual(find(doc(chartOf([[A, A], [B, B]])), "CHART_ROW_EMPTY_FULL"), []);
  });

  it("la lista de filas tiene a lo más 50", () => {
    const p = doc(chartOf([[A], [_]], { repeat: { x: 1, y: 100 } }));
    const i = find(p, "CHART_ROW_EMPTY_FULL")[0]!;
    assert.equal(i.data?.count, 100);
    assert.equal((i.data?.rows as number[]).length, 50);
  });
});

describe("C6: LIMITS.maxMotifSide y CHART_MOTIF_TOO_LARGE", () => {
  it("EDIT_LIMITS deriva de LIMITS", () => {
    assert.equal(LIMITS.maxMotifSide, 200);
    assert.equal(EDIT_LIMITS.maxMotifWidth, LIMITS.maxMotifSide);
    assert.equal(EDIT_LIMITS.maxMotifHeight, LIMITS.maxMotifSide);
    assert.equal(EDIT_LIMITS.maxRepeat, LIMITS.maxRepeat);
    assert.equal(EDIT_LIMITS.maxYarns, LIMITS.maxYarns);
  });

  it("201 de lado es error con el mensaje del ADR, sin CHART_CELLS_LENGTH; 200 × 200 es válido", () => {
    for (const [w, h] of [[201, 1], [1, 201], [300, 300]] as const) {
      const p = doc(chartOf(Array.from({ length: h }, () => new Array<number>(w).fill(A))));
      const codes = codesOf(p);
      assert.ok(codes.includes("CHART_MOTIF_TOO_LARGE"), `${w}×${h}`);
      assert.ok(!codes.includes("CHART_CELLS_LENGTH"));
      assert.equal(find(p, "CHART_MOTIF_TOO_LARGE")[0]!.message, `El motivo puede medir hasta 200 × 200 casillas; el tuyo mide ${w} × ${h}.`);
    }
    const ok = doc(chartOf(Array.from({ length: 200 }, () => new Array<number>(200).fill(A))));
    assert.deepEqual(issuesOf(ok).filter((i) => i.severity === "error"), []);
  });

  it("newChartPattern con 201 informa el motivo real (E6)", () => {
    const p = newChartPattern({ id: "n", title: "N", width: 201, height: 2, repeat: { x: 1, y: 1 }, workedIn: "rounds", renderAs: "flat", direction: "bottom_up", yarns: [yarnA] });
    assert.ok(codesOf(p).includes("CHART_MOTIF_TOO_LARGE"));
  });
});

// ------------------------------------------------------------ C1: migraciones

describe("C1: MigrationResult discriminado por ok", () => {
  it("ok: true trae to === SCHEMA_VERSION; ok: false trae to === from (incluido null)", () => {
    const good: MigrationResult = migratePattern(doc(chartOf([[A]])));
    assert.equal(good.ok, true);
    if (good.ok) {
      const from: number = good.from; // el tipo lo garantiza
      assert.equal(from, SCHEMA_VERSION);
      assert.equal(good.to, SCHEMA_VERSION);
    }
    for (const input of [{}, null, { schemaVersion: 7 }, { schemaVersion: "1" }, [], 3]) {
      const m = migratePattern(input);
      assert.equal(m.ok, false);
      assert.equal(m.to, m.from, JSON.stringify(input));
      assert.deepEqual(m.issues.map((i) => [i.code, i.severity]), [["SCHEMA_VERSION", "error"]]);
    }
    assert.equal(migratePattern({ schemaVersion: 7 }).to, 7);
    assert.equal(migratePattern({}).to, null);
  });

  it("propiedad: con ok false, to === from; con ok true, to === SCHEMA_VERSION e issues vacío", () => {
    forAll(
      "migración discriminada",
      (r) => r.pick<unknown>([null, 0, "x", [], {}, { schemaVersion: r.int(-3, 5) }, { schemaVersion: r.int(0, 4) / 2 }, doc(chartOf([[A]]))]),
      (input) => {
        const m = migratePattern(input);
        if (m.ok) {
          assert.equal(m.to, SCHEMA_VERSION);
          assert.deepEqual(m.issues, []);
        } else {
          assert.equal(m.to, m.from);
          assert.equal(m.issues.length, 1);
        }
      },
    );
  });

  it("O5: no lanza con getters que lanzan ni con un Proxy revocado", () => {
    const evil = Object.defineProperty({}, "schemaVersion", {
      get() {
        throw new Error("boom");
      },
    });
    const m = migratePattern(evil);
    assert.equal(m.ok, false);
    assert.equal(m.document, evil);
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    assert.equal(migratePattern(proxy).ok, false);
    assert.equal(validatePattern(evil).valid, false);
    assert.equal(validatePattern(proxy).valid, false);
  });
});

// ------------------------------------------------------- C2 a C4: yarnCount

describe("C2 a C4: yarnCount obligatorio", () => {
  const c = chartOf([[A, B, A], [B, A, B]], { repeat: { x: 2, y: 2 } });

  it("un valor ≥ yarnCount o un yarnCount inválido devuelven el mismo objeto", () => {
    assert.equal(paintCells(c, [{ x: 0, y: 0 }], 2, 2), c);
    assert.equal(fillRegion(c, { x: 0, y: 0 }, 2, 2), c);
    assert.equal(resizeMotif(c, 4, 2, "bottom_left", 2, 2), c);
    for (const n of [0, -1, 1.5, Number.NaN, Infinity, "2"] as unknown as number[]) {
      assert.equal(paintCells(c, [{ x: 0, y: 0 }], NO_STITCH, n), c, String(n));
      assert.equal(fillRegion(c, { x: 0, y: 0 }, NO_STITCH, n), c, String(n));
      assert.equal(resizeMotif(c, 4, 2, "bottom_left", NO_STITCH, n), c, String(n));
    }
    // El último índice válido sí escribe.
    assert.equal(paintCells(c, [{ x: 1, y: 0 }], 2, 3).cells[1], 2);
    assert.equal(paintCells(c, [{ x: 1, y: 0 }], NO_STITCH, 1).cells[1], NO_STITCH);
  });

  it("propiedad: con yarnCount = n, ninguna secuencia de paintCells, fillRegion y resizeMotif produce CHART_CELL_VALUE", () => {
    forAll(
      "yarnCount",
      (r: Rng) => {
        const n = r.int(1, 3);
        const width = r.int(1, 8);
        const height = r.int(1, 6);
        const cells = Array.from({ length: width * height }, () => r.int(0, n - 1));
        const steps = Array.from({ length: 12 }, () => ({
          op: r.int(0, 2),
          // Valores fuera de rango a propósito: de −3 a n + 2.
          v: r.int(-3, n + 2),
          x: r.int(-2, 20),
          y: r.int(-2, 20),
          w: r.int(0, 10),
          h: r.int(0, 8),
          anchor: r.pick(ANCHORS),
        }));
        return { n, chart: chartOf(Array.from({ length: height }, (_v, y) => cells.slice(y * width, (y + 1) * width)), { repeat: { x: r.int(1, 4), y: r.int(1, 3) } }), steps };
      },
      ({ n, chart, steps }) => {
        let cur = chart;
        for (const s of steps) {
          const before = cur;
          const valid = s.v === NO_STITCH || (s.v >= 0 && s.v < n);
          if (s.op === 0) cur = paintCells(cur, [{ x: s.x, y: s.y }], s.v, n);
          else if (s.op === 1) cur = fillRegion(cur, { x: s.x, y: s.y }, s.v, n);
          else cur = resizeMotif(cur, s.w, s.h, s.anchor, s.v, n);
          if (!valid) assert.equal(cur, before, "un valor fuera de rango debe devolver el mismo objeto");
          const p = doc(cur, { yarns: Y3.slice(0, n) });
          assert.ok(!codesOf(p).includes("CHART_CELL_VALUE"));
        }
      },
      200,
    );
  });
});

// --------------------------------------------------------------- C5 y C8

describe("C5: ANCHORS exportado", () => {
  it("lista los cuatro anclajes y no se puede modificar", () => {
    assert.deepEqual([...ANCHORS], ["bottom_left", "bottom_center", "bottom_right", "center"]);
    assert.ok(Object.isFrozen(ANCHORS));
    for (const a of ANCHORS) assert.notEqual(resizeMotif(chartOf([[A]]), 2, 2, a, A, 1).cells.length, 1);
  });
});

describe("C8: validateYarn", () => {
  it("una lana válida no tiene problemas; las rutas usan el prefijo", () => {
    assert.deepEqual(validateYarn(yarnA), []);
    const bad = validateYarn({ ...yarnA, composition: [{ fiber: "lana", percent: 50 }] });
    assert.deepEqual(bad.map((i) => [i.code, i.path]), [["YARN_COMPOSITION_SUM", "yarn.composition"]]);
    assert.match(bad[0]!.message, /La composición de la lana A suma 50 %/);
    const other = validateYarn({ ...yarnA, weight: 9 }, "yarns[3]");
    assert.deepEqual(other.map((i) => [i.code, i.path]), [["YARN_WEIGHT", "yarns[3].weight"]]);
  });

  it("acepta cualquier valor sin lanzar y con opciones avisa fibras desconocidas", () => {
    for (const junk of [null, 3, "A", [], {}, { id: "con espacio" }]) assert.ok(validateYarn(junk).some((i) => i.severity === "error"), JSON.stringify(junk));
    assert.match(validateYarn({})[0]!.message, /^La lana necesita un identificador/);
    const unknown = validateYarn(yarnA, "yarn", { fibers: new Set(["lana"]) });
    assert.deepEqual(unknown.map((i) => [i.code, i.severity]), [["YARN_FIBER_UNKNOWN", "warning"]]);
  });

  it("addYarn acepta una lana con solo advertencias y rechaza una con errores", () => {
    const base = doc(chartOf([[A]]), { yarns: [yarnA] });
    const dupFiber: Yarn = { ...yarnB, composition: [{ fiber: "lana", percent: 50 }, { fiber: "lana", percent: 50 }] };
    assert.ok(validateYarn(dupFiber).every((i) => i.severity !== "error"));
    assert.equal(addYarn(base, dupFiber).yarns.length, 2);
    assert.equal(addYarn(base, { ...yarnB, color: { hex: "rojo" } }), base);
  });

  it("addYarn no lanza con una lana que structuredClone no puede copiar", () => {
    const base = doc(chartOf([[A]]), { yarns: [yarnA] });
    // Un Proxy solo con claves del modelo: structuredClone lanza y se copia un nivel.
    const proxied = new Proxy({ ...yarnB, note: "x" }, {}) as Yarn;
    const out = addYarn(base, proxied);
    assert.equal(out.yarns.length, 2);
    assert.notEqual(out.yarns[1], proxied);
    assert.equal(validatePattern(out).savable, true);
    // Una clave fuera del modelo (aquí, una función) es error UNKNOWN_KEY (E16): no se agrega y no lanza.
    const odd = { ...yarnB, note: "x", extra: () => 1 } as unknown as Yarn;
    assert.deepEqual(validateYarn(odd).map((i) => [i.code, i.path]), [["UNKNOWN_KEY", "yarn.extra"]]);
    assert.equal(addYarn(base, odd), base);
  });
});

// ------------------------------------------------------------- C7 / E8

describe("C7: rowShapingColumns", () => {
  it("columnas del motivo donde se pierde o se gana un punto", () => {
    const c = chartOf([[A, A, A, A], [A, _, A, _], [A, A, _, _]], { repeat: { x: 8, y: 2 } });
    assert.deepEqual(rowShapingColumns(c, 0), { row: 0, decreases: [], increases: [] });
    assert.deepEqual(rowShapingColumns(c, 1), { row: 1, decreases: [1, 3], increases: [] });
    assert.deepEqual(rowShapingColumns(c, 2), { row: 2, decreases: [2], increases: [1] });
    // Borde entre repeticiones verticales: la fila 3 (fila 0 del motivo) se compara con la última del motivo.
    assert.deepEqual(rowShapingColumns(c, 3), { row: 3, decreases: [], increases: [2, 3] });
    for (const y of [-1, 6, 7, 1.5, Number.NaN, Infinity]) {
      const r = rowShapingColumns(c, y);
      assert.deepEqual([r.decreases, r.increases], [[], []], String(y));
    }
  });

  it("propiedad E8: shaping[y].change === repeat.x × (increases − decreases) y las columnas son ascendentes", () => {
    forAll(
      "columnas de forma",
      (r) => {
        const width = r.int(1, 10);
        const height = r.int(1, 8);
        const p = r.pick([0.1, 0.4, 0.7]);
        const cells = Array.from({ length: width * height }, () => (r.bool(p) ? NO_STITCH : r.int(0, 2)));
        return chartOf(Array.from({ length: height }, (_v, y) => cells.slice(y * width, (y + 1) * width)), { repeat: { x: r.int(1, 9), y: r.int(1, 4) } });
      },
      (c) => {
        const sh = shaping(c);
        sh.forEach((s, y) => {
          const cols = rowShapingColumns(c, y);
          assert.equal(cols.row, y);
          assert.equal(s.change, c.repeat.x * (cols.increases.length - cols.decreases.length));
          for (const list of [cols.decreases, cols.increases]) {
            list.forEach((x, i) => {
              assert.ok(Number.isInteger(x) && x >= 0 && x < c.width);
              if (i > 0) assert.ok(x > list[i - 1]!);
            });
          }
          for (const x of cols.decreases) {
            assert.equal(motifCell(c, x, y % c.height), NO_STITCH);
            assert.notEqual(motifCell(c, x, (y - 1) % c.height), NO_STITCH);
          }
        });
      },
    );
  });
});

// --------------------------------------------------------- T2c: dimensionsCm

describe("caso 20 completo: dimensionsCm con circunferencia", () => {
  const gauge = { stitchesPer10cm: 20, rowsPer10cm: 28 };
  const full = chartOf(Array.from({ length: 20 }, () => new Array<number>(20).fill(A)), { repeat: { x: 5, y: 1 } });

  it("20 × 20 con repeat 5 × 1 y muestra de 20 × 28 mide 50 × 7,14 cm en todas las formas", () => {
    for (const renderAs of ["flat", "tube", "circle", "yoke"] as const) {
      const d = dimensionsCm({ ...full, renderAs }, gauge);
      assert.ok(Math.abs(d.widthCm - 50) < 1e-9, renderAs);
      assert.equal(Math.round(d.heightCm * 100) / 100, 7.14);
      assert.equal(d.widthIsCircumference, renderAs !== "flat");
    }
  });

  it("en el círculo la circunferencia sale del máximo de rowStitchCount, no de width × repeat.x", () => {
    // Cuña de 12 a 1 por repetición en un motivo de 20 de ancho: la vuelta más ancha tiene 60 puntos.
    const rows = Array.from({ length: 12 }, (_v, i) => Array.from({ length: 20 }, (_w, x) => (x < 12 - i ? A : _)));
    const wedge = chartOf(rows, { repeat: { x: 5, y: 1 }, renderAs: "circle" });
    const d = dimensionsCm(wedge, gauge);
    assert.ok(Math.abs(d.widthCm - 30) < 1e-9, String(d.widthCm));
    assert.equal(d.widthIsCircumference, true);
    // En plano y tubo se mantiene width × repeat.x (ADR 0003): validar con experto-tejido para el tubo.
    assert.ok(Math.abs(dimensionsCm({ ...wedge, renderAs: "tube" }, gauge).widthCm - 50) < 1e-9);
    assert.equal(dimensionsCm({ ...wedge, renderAs: "flat" }, gauge).widthIsCircumference, false);
  });

  it("propiedad: la circunferencia del círculo nunca supera el ancho del gráfico y renderAs no cambia el alto", () => {
    forAll(
      "medidas",
      (r) => {
        const width = r.int(1, 12);
        const height = r.int(1, 8);
        const cells = Array.from({ length: width * height }, () => (r.bool(0.3) ? NO_STITCH : A));
        return chartOf(Array.from({ length: height }, (_v, y) => cells.slice(y * width, (y + 1) * width)), { repeat: { x: r.int(1, 8), y: r.int(1, 3) } });
      },
      (c) => {
        const g = { stitchesPer10cm: 22, rowsPer10cm: 30 };
        const flat = dimensionsCm({ ...c, renderAs: "flat" }, g);
        const circle = dimensionsCm({ ...c, renderAs: "circle" }, g);
        assert.ok(circle.widthCm <= flat.widthCm + 1e-9);
        assert.equal(circle.heightCm, flat.heightCm);
        const max = Math.max(...shaping(c).map((s) => s.stitches));
        assert.ok(Math.abs(circle.widthCm - (max / 22) * 10) < 1e-9);
      },
    );
  });
});

// ----------------------------------------------------- rowFloats sin fila completa

describe("rowFloats calculado sobre el motivo", () => {
  /** El algoritmo anterior, sobre la fila completa, como referencia. */
  function bruteFloats(chart: Chart, y: number) {
    const row = fullRow(chart, y);
    const positions = new Map<number, number[]>();
    row.forEach((v, i) => (positions.get(v)?.push(i) ?? positions.set(v, [i])));
    if (positions.size < 2) return [];
    return [...positions].map(([yarn, pos]) => {
      let longest = 0;
      for (let i = 1; i < pos.length; i++) longest = Math.max(longest, pos[i]! - pos[i - 1]! - 1);
      if (chart.workedIn === "rounds") longest = Math.max(longest, row.length - 1 - pos.at(-1)! + pos[0]!);
      return { row: y, yarn, length: longest };
    });
  }

  it("propiedad: da lo mismo que recorrer fullRow, en redondo y de ida y vuelta", () => {
    forAll(
      "hebras sobre el motivo",
      (r) => {
        const width = r.int(1, 12);
        const height = r.int(1, 4);
        const cells = Array.from({ length: width * height }, () => (r.bool(0.2) ? NO_STITCH : r.int(0, 2)));
        return chartOf(Array.from({ length: height }, (_v, y) => cells.slice(y * width, (y + 1) * width)), {
          repeat: { x: r.int(1, 5), y: r.int(1, 3) },
          workedIn: r.pick(["rounds", "rows"] as const),
        });
      },
      (c) => {
        for (let y = 0; y < c.height * c.repeat.y; y++) assert.deepEqual(rowFloats(c, y), bruteFloats(c, y));
      },
    );
  });
});

// ------------------------------------------------- O4, O5, O6: bordes y contrato

describe("O4: contrato de bordes con coordenadas no enteras", () => {
  const c = chartOf([[A, B, A], [B, A, B]], { repeat: { x: 2, y: 2 }, workedIn: "rows", direction: "top_down" });
  const BAD = [Number.NaN, Infinity, -Infinity, 1.5, -0.5];

  it("motifCoord y wornOrientation devuelven (−1, −1); leer esa casilla da NO_STITCH", () => {
    for (const bad of BAD) {
      assert.deepEqual(motifCoord(c, bad, 0), { x: -1, y: -1 }, String(bad));
      assert.deepEqual(motifCoord(c, 0, bad), { x: -1, y: -1 }, String(bad));
      for (const direction of ["bottom_up", "top_down"] as const) {
        assert.deepEqual(wornOrientation({ ...c, direction }, bad, 0), { x: -1, y: -1 });
        assert.deepEqual(wornOrientation({ ...c, direction }, 0, bad), { x: -1, y: -1 });
      }
      const m = motifCoord(c, bad, bad);
      assert.equal(motifCell(c, m.x, m.y), NO_STITCH);
    }
  });

  it("readingDirection trata un y no entero como fila por el derecho", () => {
    for (const bad of BAD) {
      assert.equal(readingDirection(c, bad), "right_to_left", String(bad));
      assert.equal(readingDirection(c, bad, { mirror: true }), "left_to_right");
    }
  });
});

describe("O5: newChartPattern nunca lanza", () => {
  it("con null, undefined, un número o campos faltantes devuelve un documento que el validador rechaza", () => {
    for (const input of [null, undefined, 42, "x", {}, { width: 2, height: 2, yarns: [null, 3] }] as unknown[]) {
      const p = newChartPattern(input as never);
      assert.equal(p.kind, "chart");
      assert.equal(validatePattern(p).valid, false, JSON.stringify(input));
    }
  });
});

describe("O6: removeYarn y reorderYarns comparten los objetos de lana", () => {
  it("las lanas que quedan son las mismas referencias", () => {
    const p = doc(chartOf([[A, B, C]]));
    const removed = removeYarn(p, 1, 0);
    assert.equal(removed.yarns[0], p.yarns[0]);
    assert.equal(removed.yarns[1], p.yarns[2]);
    const reordered = reorderYarns(p, [2, 0, 1]);
    assert.equal(reordered.yarns[0], p.yarns[2]);
  });
});

// ---------------------------------------------------------------- Rendimiento

describe("rendimiento con las reglas nuevas", () => {
  it("un motivo de 200 × 200 con 500 × 500 repeticiones se valida en tiempo acotado", () => {
    // Holgado: rowFloats ya no arma la fila completa (100.000 puntos por vuelta).
    const cells = Array.from({ length: 200 * 200 }, (_v, i) => (i % 13 === 0 ? NO_STITCH : i % 3));
    const p = doc({ width: 200, height: 200, cells, repeat: { x: 500, y: 500 }, workedIn: "rounds", renderAs: "circle", direction: "bottom_up" });
    const t0 = performance.now();
    validatePattern(p, { weightCat: 4 });
    const ms = performance.now() - t0;
    assert.ok(ms < 1000, `tardó ${ms.toFixed(1)} ms`);
  });
});

describe("O5: los derivados de conteo no lanzan con un gráfico dañado", () => {
  it("rowStitchCounts y shaping devuelven [] con repeticiones o alto no enteros", () => {
    for (const over of [{ repeat: { x: 1, y: Number.NaN } }, { repeat: { x: 1, y: 1.5 } }, { repeat: { x: 1, y: Infinity } }, { height: 0 }] as Partial<Chart>[]) {
      const c = { ...chartOf([[A, B]]), ...over };
      assert.deepEqual(shaping(c), [], JSON.stringify(over));
    }
  });
});

// ------------------------------------------------------------------ T2d

describe("C10: savable, DRAFT_ERROR_CODES e isDraftError (E10)", () => {
  it("la lista es cerrada, congelada y tiene los errores de tejido del gráfico y del patrón escrito (ADR 0011, sección 4)", () => {
    assert.deepEqual([...DRAFT_ERROR_CODES], ["CHART_EMPTY", "CHART_ROW_EMPTY_FULL", "ROUND_CONSUMPTION_MISMATCH", "ROUND_COUNT_MISMATCH", "ROUND_ZERO", "ROUND_RANGE_CHANGES", "ROUND_NUMBERING"]);
    assert.ok(Object.isFrozen(DRAFT_ERROR_CODES));
  });

  it("isDraftError exige severidad error y código de la lista", () => {
    const issue = (code: string, severity: Issue["severity"]): Issue => ({ code, severity, path: "", message: "x" });
    assert.equal(isDraftError(issue("CHART_EMPTY", "error")), true);
    assert.equal(isDraftError(issue("CHART_ROW_EMPTY_FULL", "error")), true);
    assert.equal(isDraftError(issue("CHART_ROW_EMPTY_FULL", "warning")), false);
    assert.equal(isDraftError(issue("CHART_CELL_VALUE", "error")), false);
    assert.equal(isDraftError(issue("CHART_SHAPING_IMPOSSIBLE", "warning")), false);
  });

  it("CHART_EMPTY y filas vacías: no valid, sí savable; un error estructural: ni lo uno ni lo otro", () => {
    const empty = validatePattern(doc(chartOf([[_, _], [_, _]])));
    assert.deepEqual([empty.valid, empty.savable], [false, true]);
    assert.deepEqual(empty.issues.filter((i) => i.severity === "error").map((i) => i.code), ["CHART_EMPTY"]);
    const rows = validatePattern(doc(chartOf([[A, A], [_, _]])));
    assert.deepEqual([rows.valid, rows.savable], [false, true]);
    const broken = doc(chartOf([[A, A], [_, _]]));
    broken.chart.cells[0] = 9;
    const r = validatePattern(broken);
    assert.deepEqual([r.valid, r.savable], [false, false]);
    const ok = validatePattern(doc(chartOf([[A, B]])));
    assert.deepEqual([ok.valid, ok.savable], [true, true]);
  });

  it("un error de tejido junto a uno estructural no es savable (título vacío y gráfico vacío)", () => {
    const r = validatePattern(doc(chartOf([[_]]), { title: "" }));
    assert.deepEqual(r.issues.filter((i) => i.severity === "error").map((i) => i.code).sort(), ["CHART_EMPTY", "TITLE_LENGTH"]);
    assert.equal(r.savable, false);
  });
});

describe("C11: validateYarn con opts acotado a fibers y paletteIds", () => {
  it("solo agrega advertencias; con la paleta avisa un color desconocido", () => {
    const yarn = { ...yarnA, color: { hex: "#000000", paletteId: "otro" } };
    assert.deepEqual(validateYarn(yarn), []);
    assert.deepEqual(validateYarn(yarn, "yarn", { paletteIds: new Set(["crudo"]) }).map((i) => [i.code, i.severity]), [["YARN_PALETTE_UNKNOWN", "warning"]]);
    // Un ValidateOptions completo sigue compilando y sus demás campos no influyen.
    const full: ValidateOptions = { fibers: new Set(["algodon"]), maxFloatStitches: 1, weightCat: 7 };
    assert.deepEqual(validateYarn(yarnA, "yarn", full), []);
  });
});

describe("T2d: textos y reglas de experto-tejido", () => {
  it("CHART_FLOAT_LONG nombra la lana por su letra en el documento y su color, no por su id", () => {
    const yarns = [{ ...yarnA, id: "fondo" }, { ...yarnB, id: "x9", note: "la roja de la feria" }];
    const f = find(doc(chartOf([[B, A, A, A, A, A, A, A, B]], { workedIn: "rows" }), { yarns }), "CHART_FLOAT_LONG");
    assert.match(f[0]!.message, /la hebra flotante de la lana B \(#BA222C\) mide 7 puntos/);
    assert.doesNotMatch(f[0]!.message, /fondo|x9|feria/);
  });

  it("CHART_CIRCLE_START cambia según la técnica", () => {
    const p = (technique: "knit" | "crochet") => find(doc(totalsChart([24, 24], 8, { renderAs: "circle", direction: "top_down" }), { technique }), "CHART_CIRCLE_START")[0]!.message;
    assert.equal(p("crochet"), "La primera vuelta tiene 24 puntos; en crochet se suele empezar con un anillo mágico de 6 a 12 puntos.");
    assert.equal(p("knit"), "La primera vuelta tiene 24 puntos; en palillo se suele empezar con un montaje inicial de 8 a 12 puntos.");
  });

  it("CHART_CIRCLE_NOT_CLOSED y CHART_CIRCLE_START miden contra la vuelta CON puntos más cercana al borde", () => {
    // bottom_up: la última fila está vacía; la anterior deja 40.
    const bu = doc(totalsChart([80, 40, 8], 8, { renderAs: "circle" }));
    bu.chart.cells.fill(_, 2 * bu.chart.width);
    assert.deepEqual(find(bu, "CHART_CIRCLE_NOT_CLOSED").map((i) => i.data?.stitches), [40]);
    // top_down: la primera fila está vacía; la siguiente empieza con 24.
    const td = doc(totalsChart([8, 24, 32], 8, { renderAs: "circle", direction: "top_down" }));
    td.chart.cells.fill(_, 0, td.chart.width);
    assert.deepEqual(find(td, "CHART_CIRCLE_START").map((i) => i.data?.stitches), [24]);
  });

  it("CHART_CIRCLE_REPEAT_Y explica que la repetición reabre la forma", () => {
    const i = find(doc(totalsChart([32, 24], 8, { renderAs: "circle", repeat: { x: 8, y: 2 } })), "CHART_CIRCLE_REPEAT_Y")[0]!;
    assert.match(i.message, /cada repetición vuelve a empezar desde la base de la cuña y el círculo se abre otra vez\. Si buscas una copa más alta, agranda el motivo en vez de repetirlo\./);
  });

  it("CHART_ROW_EMPTY_FULL lista las filas del motivo en data.motifRows", () => {
    const i = find(doc(chartOf([[_, _], [A, A], [_, _]], { repeat: { x: 1, y: 2 } })), "CHART_ROW_EMPTY_FULL")[0]!;
    assert.deepEqual(i.data, { count: 4, rows: [0, 2, 3, 5], motifRows: [0, 2] });
  });
});

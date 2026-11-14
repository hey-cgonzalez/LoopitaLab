/**
 * QA (T2b/T2c): umbrales exactos de cada regla nueva del validador en sus bordes,
 * revisión de los casos de dominio 8 a 18 y 20 a 23 que no tenían el borde exacto,
 * propiedad "validatePattern y migratePattern nunca lanzan" con documentos de
 * JSON.parse (mutaciones de documentos válidos) y rendimiento en el peor caso de las
 * reglas nuevas. Desde T2d también fija las correcciones F1 a F4 (números de vuelta
 * desmedidos, claves heredadas de Object.prototype, rangos sin tope y mensajes con
 * valores de tipo incorrecto). Las propiedades usan la semilla de test/support/property.ts:
 *   SEED=12345 node --test test/qa-bordes-colorwork.test.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  LIMITS,
  NO_STITCH,
  concreteRounds,
  formatPart,
  isDraftError,
  migratePattern,
  summarizePart,
  parsePattern,
  validatePattern,
  type Chart,
  type ChartPattern,
  type Issue,
  type ValidateOptions,
  SCHEMA_VERSION,
} from "../src/index.ts";
import { ballPattern, smallChart, yarnA, yarnB } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";

const A = 0;
const B = 1;
const _ = NO_STITCH;

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

function doc(chart: Chart, over: Partial<ChartPattern> = {}): ChartPattern {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "p",
    title: "Prueba",
    technique: "knit",
    kind: "chart",
    yarns: [structuredClone(yarnA), structuredClone(yarnB)],
    origin: { kind: "manual" },
    chart,
    ...over,
  };
}

/** Vueltas completas con `totals` puntos y `R` repeticiones (cada fila del motivo alineada a la izquierda). */
function totalsChart(totals: number[], R: number, over: Partial<Chart> = {}): Chart {
  const per = totals.map((t) => {
    assert.equal(t % R, 0, `${t} no es múltiplo de ${R}`);
    return t / R;
  });
  const width = Math.max(...per);
  return chartOf(per.map((n) => Array.from({ length: width }, (_v, x) => (x < n ? A : _))), { repeat: { x: R, y: 1 }, ...over });
}

const find = (p: unknown, code: string, opts?: ValidateOptions): Issue[] => validatePattern(p, opts).issues.filter((i) => i.code === code);
const has = (p: unknown, code: string, opts?: ValidateOptions) => find(p, code, opts).length > 0;
const sev = (p: unknown, code: string, opts?: ValidateOptions) => find(p, code, opts).map((i) => i.severity);

// ------------------------------------------------------- Forma: bordes exactos

describe("QA bordes: CHART_SHAPING_IMPOSSIBLE y CHART_SHAPING_TOO_FAST (disminuciones)", () => {
  it("exhaustivo n = 2..200: ceil(n/3) − 1 es IMPOSSIBLE (advertencia, E10), ceil(n/3) no; ceil(n/2) − 1 es TOO_FAST, ceil(n/2) nada", () => {
    for (let n = 2; n <= 200; n++) {
      const third = Math.ceil(n / 3);
      const half = Math.ceil(n / 2);
      for (const rest of new Set([third - 1, third, third + 1, half - 1, half, half + 1, n - 1])) {
        if (rest < 1 || rest >= n) continue;
        const p = doc(totalsChart([n, rest], 1));
        const imp = find(p, "CHART_SHAPING_IMPOSSIBLE");
        const fast = find(p, "CHART_SHAPING_TOO_FAST");
        const label = `${n} → ${rest}`;
        assert.equal(imp.length, rest < third ? 1 : 0, label);
        assert.equal(fast.length, rest >= third && rest < half ? 1 : 0, label);
        if (imp.length) {
          assert.equal(imp[0]!.severity, "warning");
          assert.equal(imp[0]!.data?.min, third, label);
          assert.equal(validatePattern(p).valid, true, label);
          assert.match(imp[0]!.message, new RegExp(`quedan como mínimo ${third}\\. Para llegar a ${rest} hay que cerrar puntos`), label);
        }
        if (fast.length) {
          assert.equal(fast[0]!.severity, "warning");
          assert.equal(fast[0]!.data?.min, half, label);
          assert.equal(validatePattern(p).valid, true, label);
        }
      }
    }
  });

  it("los umbrales usan el total de la vuelta (repeat.x incluido), no los puntos de la cuña", () => {
    // Cuña de 9 a 3 por repetición con R = 1: 9 → 3 es exactamente ceil(9/3) = 3, sin error.
    assert.ok(!has(doc(totalsChart([9, 3], 1)), "CHART_SHAPING_IMPOSSIBLE"));
    // La misma cuña con R = 7: 63 → 21 = ceil(63/3), sin error; 63 → 14 sí.
    assert.ok(!has(doc(totalsChart([63, 21], 7)), "CHART_SHAPING_IMPOSSIBLE"));
    assert.ok(has(doc(totalsChart([63, 14], 7)), "CHART_SHAPING_IMPOSSIBLE"));
    // ceil con n no múltiplo de 3: 100 → 34 (= ceil(100/3)) nada; 100 → 33 error.
    assert.ok(!has(doc(totalsChart([100, 34], 1)), "CHART_SHAPING_IMPOSSIBLE"));
    assert.ok(has(doc(totalsChart([100, 33], 1)), "CHART_SHAPING_IMPOSSIBLE"));
    // ceil con n impar: 99 → 50 (= ceil(99/2)) nada; 99 → 49 advertencia.
    assert.ok(!has(doc(totalsChart([99, 50], 1)), "CHART_SHAPING_TOO_FAST"));
    assert.ok(has(doc(totalsChart([99, 49], 1)), "CHART_SHAPING_TOO_FAST"));
  });

  it("propiedad: con R al azar, error y advertencia dependen solo de los totales", () => {
    forAll(
      "disminución con R",
      (r) => {
        const R = r.int(1, 12);
        const a = r.int(2, 16);
        const b = r.int(1, a - 1);
        return { R, from: a * R, to: b * R, renderAs: r.pick(["flat", "tube", "circle", "yoke"] as const) };
      },
      ({ R, from, to, renderAs }) => {
        const p = doc(totalsChart([from, to], R, { renderAs }));
        assert.equal(has(p, "CHART_SHAPING_IMPOSSIBLE"), to < Math.ceil(from / 3));
        assert.equal(has(p, "CHART_SHAPING_TOO_FAST"), to >= Math.ceil(from / 3) && to < Math.ceil(from / 2));
      },
    );
  });
});

describe("QA bordes: CHART_SHAPING_TOO_FAST (aumentos, ×2)", () => {
  it("exhaustivo n = 1..99: 2n es nada, 2n + 1 es advertencia con data.max = 2n", () => {
    // Hasta 99 para que 2n + 1 quepa en un motivo de 200 de ancho (R = 1).
    for (let n = 1; n <= 99; n++) {
      const exact = doc(totalsChart([n, 2 * n], 1));
      assert.ok(!has(exact, "CHART_SHAPING_TOO_FAST"), `${n} → ${2 * n}`);
      const over = find(doc(totalsChart([n, 2 * n + 1], 1)), "CHART_SHAPING_TOO_FAST");
      assert.deepEqual(over.map((i) => [i.severity, i.data?.max]), [["warning", 2 * n]], `${n} → ${2 * n + 1}`);
      assert.ok(!has(doc(totalsChart([n, 2 * n + 1], 1)), "CHART_SHAPING_IMPOSSIBLE"));
    }
  });
});

describe("QA bordes: CHART_SHAPING_STEEP (círculo, > 2 por repetición)", () => {
  it("para R = 1..12: ±2 por repetición nada, ±3 advertencia", () => {
    for (let R = 1; R <= 12; R++) {
      // Disminución: de 10 a 8 (−2) y de 10 a 7 (−3) por cuña; totales en R.
      assert.ok(!has(doc(totalsChart([10 * R, 8 * R], R, { renderAs: "circle" })), "CHART_SHAPING_STEEP"), `R=${R} −2`);
      assert.ok(has(doc(totalsChart([10 * R, 7 * R], R, { renderAs: "circle" })), "CHART_SHAPING_STEEP"), `R=${R} −3`);
      const up = { renderAs: "circle", direction: "top_down" } as const;
      assert.ok(!has(doc(totalsChart([8 * R, 10 * R], R, up)), "CHART_SHAPING_STEEP"), `R=${R} +2`);
      assert.ok(has(doc(totalsChart([7 * R, 10 * R], R, up)), "CHART_SHAPING_STEEP"), `R=${R} +3`);
    }
  });
});

// ------------------------------------------------------- Círculo: bordes exactos

describe("QA bordes: CHART_CIRCLE_REPEATS (4 a 12) y CHART_WEDGE_TOO_NARROW (< 4)", () => {
  it("R = 1..20: info si y solo si R < 4 o R > 12 (validar con tejedora)", () => {
    // validar con tejedora
    for (let R = 1; R <= 20; R++) {
      const got = sev(doc(totalsChart([R * 6], R, { renderAs: "circle" })), "CHART_CIRCLE_REPEATS");
      assert.deepEqual(got, R < 4 || R > 12 ? ["info"] : [], `R=${R}`);
    }
  });

  it("cuña más ancha de 1 a 6 puntos: info si y solo si es menor que 4; mensaje en singular con 1 (validar con tejedora)", () => {
    // validar con tejedora
    for (let w = 1; w <= 6; w++) {
      const i = find(doc(totalsChart([w * 8], 8, { renderAs: "circle" })), "CHART_WEDGE_TOO_NARROW");
      assert.deepEqual(i.map((x) => [x.severity, x.data?.max]), w < 4 ? [["info", w]] : [], `ancho ${w}`);
    }
    assert.match(find(doc(totalsChart([8], 8, { renderAs: "circle" })), "CHART_WEDGE_TOO_NARROW")[0]!.message, /como máximo 1 punto:/);
    // Cuenta la fila más ancha, no la primera ni la última.
    assert.ok(!has(doc(totalsChart([16, 32, 16], 8, { renderAs: "circle", direction: "top_down" })), "CHART_WEDGE_TOO_NARROW"));
  });
});

describe("QA bordes: CHART_CIRCLE_NOT_CLOSED (> 16 info, > 24 advertencia)", () => {
  it("totales 1..40 de la última vuelta (R = 1): 16 nada, 17 info, 24 info, 25 advertencia", () => {
    for (let t = 1; t <= 40; t++) {
      const got = sev(doc(totalsChart([t], 1, { renderAs: "circle" })), "CHART_CIRCLE_NOT_CLOSED");
      assert.deepEqual(got, t > 24 ? ["warning"] : t > 16 ? ["info"] : [], `total ${t}`);
    }
  });

  it("data trae los dos umbrales y el total", () => {
    assert.deepEqual(find(doc(totalsChart([25], 5, { renderAs: "circle" })), "CHART_CIRCLE_NOT_CLOSED")[0]!.data, { stitches: 25, info: 16, warning: 24 });
  });

  it("con repeat.y > 1 mide la última fila del motivo (la última del gráfico completo)", () => {
    const p = doc(totalsChart([40, 24, 8], 8, { renderAs: "circle", repeat: { x: 8, y: 2 } }));
    assert.ok(!has(p, "CHART_CIRCLE_NOT_CLOSED"));
  });
});

describe("QA bordes: CHART_CIRCLE_START (top_down, fila 0 < 4 o > 16)", () => {
  it("totales 1..30 en la fila 0 (R = 1): info si y solo si es menor que 4 o mayor que 16", () => {
    for (let t = 1; t <= 30; t++) {
      const got = sev(doc(totalsChart([t, t], 1, { renderAs: "circle", direction: "top_down" })), "CHART_CIRCLE_START");
      assert.deepEqual(got, t < 4 || t > 16 ? ["info"] : [], `total ${t}`);
    }
  });

  it("solo mira la fila 0: una segunda vuelta grande no cuenta", () => {
    assert.ok(!has(doc(totalsChart([8, 16], 8, { renderAs: "circle", direction: "top_down" })), "CHART_CIRCLE_START"));
    assert.ok(has(doc(totalsChart([24, 32], 8, { renderAs: "circle", direction: "top_down" })), "CHART_CIRCLE_START"));
  });
});

// ------------------------------------------------- Hebras flotantes: bordes

describe("QA bordes: umbral de CHART_FLOAT_LONG = max(1, min(floor(2,5 × puntos / 10), 5))", () => {
  /** Fila de ida y vuelta B + n × A + B: la hebra de B mide n. */
  const floatOf = (n: number) => chartOf([[B, ...new Array<number>(n).fill(A), B]], { workedIn: "rows" });

  it("para cada muestra entera de 4 a 40, una hebra del máximo no avisa y una de máximo + 1 sí", () => {
    for (let s = 4; s <= 40; s++) {
      const max = Math.max(1, Math.min(Math.floor((2.5 * s) / 10), 5));
      const gauge = { stitchesPer10cm: s, rowsPer10cm: 30 };
      assert.ok(!has(doc(floatOf(max), { gauge }), "CHART_FLOAT_LONG"), `muestra ${s}, hebra ${max}`);
      const f = find(doc(floatOf(max + 1), { gauge }), "CHART_FLOAT_LONG");
      assert.deepEqual(f.map((i) => [i.data?.length, i.data?.max, i.data?.gauge]), [[max + 1, max, "document"]], `muestra ${s}`);
    }
  });

  it("los saltos exactos (4, 8, 12, 16, 20 puntos en 10 cm) no pierden un punto por redondeo", () => {
    // Con menos de 4 puntos en 10 cm la fórmula da 0: el mínimo es 1 (experto-tejido, T2d).
    const cases: Array<[number, number]> = [[1, 1], [3.99, 1], [4, 1], [7.99, 1], [8, 2], [11.99, 2], [12, 3], [15.99, 3], [16, 4], [19.99, 4], [20, 5], [1e6, 5]];
    for (const [s, max] of cases) {
      const f = find(doc(floatOf(9), { gauge: { stitchesPer10cm: s, rowsPer10cm: 30 } }), "CHART_FLOAT_LONG");
      assert.equal(f[0]?.data?.max, max, `muestra ${s}`);
    }
  });

  it("maxFloatCm y maxFloatStitches cambian el umbral; valores inválidos se ignoran (C12: tope entero ≥ 1)", () => {
    const gauge = { stitchesPer10cm: 18, rowsPer10cm: 24 };
    const max = (opts: ValidateOptions, g: typeof gauge | null = gauge) =>
      find(doc(floatOf(30), g ? { gauge: g } : {}), "CHART_FLOAT_LONG", opts)[0]?.data?.max;
    assert.equal(max({}), 4);
    assert.equal(max({ maxFloatCm: 10 }), 5); // floor(18) recortado por el tope de 5
    assert.equal(max({ maxFloatCm: 10, maxFloatStitches: 20 }), 18);
    assert.equal(max({ maxFloatCm: 0 }), 4); // 0 no es válido: 2,5 por defecto
    assert.equal(max({ maxFloatCm: -1 }), 4);
    assert.equal(max({ maxFloatStitches: -1 }, null), 5);
    assert.equal(max({ maxFloatStitches: Number.NaN }, null), 5);
    assert.equal(max({ maxFloatStitches: 0 }, null), 5);
    assert.equal(max({ maxFloatStitches: 4.5 }, null), 5);
    assert.equal(max({ maxFloatStitches: 4.5 }), 4);
    assert.equal(max({ maxFloatStitches: Infinity }, null), 5);
    assert.equal(max({ maxFloatStitches: 1 }, null), 1);
    assert.equal(max({ maxFloatStitches: 3 }), 3);
    // El mínimo de 1 vale también cuando el umbral viene de opciones: con 0,1 cm la fórmula da 0.
    assert.equal(max({ maxFloatCm: 0.1 }), 1);
    assert.equal(max({ maxFloatCm: 0.1 }, { stitchesPer10cm: 1, rowsPer10cm: 2 }), 1);
  });

  it("en crochet no se miden hebras ni lanas por fila", () => {
    const p = doc(chartOf([[B, ...new Array<number>(12).fill(A), B]], { workedIn: "rows" }), { technique: "crochet" });
    assert.ok(!has(p, "CHART_FLOAT_LONG"));
  });
});

// --------------------------------------------- Casos de dominio: bordes faltantes

describe("QA casos de dominio: bordes que las pruebas existentes no fijaban", () => {
  it("caso 15: con dos repeticiones de ida y vuelta, la hebra entre repeticiones también cuenta", () => {
    // `A B A…A` de 12, R = 2, ida y vuelta: entre la última A de la primera repetición y la B de la segunda flotan 10 A.
    const row = [A, B, A, A, A, A, A, A, A, A, A, A];
    const f = find(doc(chartOf([row], { workedIn: "rows", repeat: { x: 2, y: 1 } }), { gauge: { stitchesPer10cm: 18, rowsPer10cm: 24 } }), "CHART_FLOAT_LONG");
    assert.deepEqual(f.map((i) => [i.data?.yarn, i.data?.length]), [[B, 11]]);
  });

  it("caso 16: hebra de exactamente 4 con muestra de 18 (máximo 4): nada", () => {
    const p = doc(chartOf([[B, A, A, A, A, B]], { workedIn: "rows" }), { gauge: { stitchesPer10cm: 18, rowsPer10cm: 24 } });
    assert.ok(!has(p, "CHART_FLOAT_LONG"));
  });

  it("caso 21: el aviso de lanas por fila sale una vez por fila con más de 2 lanas", () => {
    const yarns = [yarnA, yarnB, { ...yarnB, id: "C" }];
    const p = doc(chartOf([[A, B, 2, A], [A, B, A, B], [2, 2, A, B]]), { yarns });
    assert.deepEqual(find(p, "CHART_COLORS_PER_ROW").map((i) => [i.data?.row, i.data?.colors]), [[0, 3], [2, 3]]);
  });

  it("caso 22: tres grosores se listan ordenados y una lana de grosor inválido no cuenta", () => {
    const yarns = [{ ...yarnA, weight: 4 }, { ...yarnB, weight: 2 }, { ...yarnB, id: "C", weight: 3 }] as ChartPattern["yarns"];
    assert.deepEqual(find(doc(chartOf([[A, B, 2]]), { yarns }), "YARNS_MIXED_WEIGHT")[0]?.data?.weights, [2, 3, 4]);
    // El patrón escrito no es colorwork: no informa grosores mezclados.
    const w = ballPattern();
    w.yarns.push({ ...yarnB, weight: 6 });
    assert.ok(!has(w, "YARNS_MIXED_WEIGHT"));
  });

  it("caso 23: el aviso sale una sola vez aunque el gráfico tenga muchas filas", () => {
    const p = doc(chartOf([[A, B], [B, A], [A, B]], { renderAs: "circle", workedIn: "rows", repeat: { x: 8, y: 1 } }));
    assert.equal(find(p, "CHART_ROWS_SHAPE").length, 1);
    assert.equal(find(p, "CHART_ROWS_SHAPE")[0]!.data?.renderAs, "circle");
  });

  it("caso 20: con muestra de 20 × 28 el alto es 20 / 28 × 10 aunque haya filas vacías", () => {
    // (Este caso usa dimensionsCm, cubierto en validate-colorwork.test.ts; aquí solo se fija que
    // las filas sin puntos no cambian el alto.)
    const rows = Array.from({ length: 20 }, (_v, y) => new Array<number>(20).fill(y === 5 ? _ : A));
    assert.ok(has(doc(chartOf(rows, { repeat: { x: 5, y: 1 } })), "CHART_ROW_EMPTY_FULL"));
  });
});

// -------------------------------------------- Nunca lanza (JSON.parse arbitrario)

const POOL: unknown[] = [
  null, true, false, 0, -1, 1, 2, 3, 7, 8, 1.5, -0.5, 200, 201, 500, 501, 1e6, -1e6, 2 ** 31, Number.MAX_SAFE_INTEGER, 1e308,
  "", " ", "A", "B", "chart", "written", "knit", "crochet", "rounds", "rows", "circle", "yoke", "tube", "flat",
  "bottom_up", "top_down", "magic_ring", "chain", "spiral", "stitch", "group", "color", "sc", "inc", "dec", "#000000",
  "__proto__", "constructor", "toString", "🧶", "\u0000", [], {}, [0], [-1], { x: 1, y: 1 }, { x: 0 },
  { stitchesPer10cm: 0, rowsPer10cm: 0 }, { stitchesPer10cm: 18, rowsPer10cm: 24 }, { kind: "ai" },
];

/** Valor JSON al azar, a veces tomado de un grupo de valores frontera. */
function genJson(r: Rng, depth: number): unknown {
  const k = r.int(0, depth > 3 ? 2 : 5);
  if (k <= 1) return structuredClone(r.pick(POOL));
  if (k === 2) return r.int(-3, 10);
  if (k === 3) return Array.from({ length: r.int(0, 4) }, () => genJson(r, depth + 1));
  const o: Record<string, unknown> = {};
  for (let i = r.int(0, 4); i > 0; i--) o[r.pick(["id", "type", "count", "times", "items", "x", "y", "weight", "hex", "fiber", "percent", "number", "through", "kind", "__proto__"])] = genJson(r, depth + 1);
  return o;
}

/** Recorre un valor JSON y devuelve todas las rutas a objetos y arreglos (para mutarlos). */
function containers(v: unknown, out: Array<Record<string, unknown> | unknown[]> = []): Array<Record<string, unknown> | unknown[]> {
  if (Array.isArray(v)) {
    out.push(v);
    for (const x of v) containers(x, out);
  } else if (typeof v === "object" && v !== null) {
    out.push(v as Record<string, unknown>);
    for (const x of Object.values(v)) containers(x, out);
  }
  return out;
}

/** Documento válido (gráfico o escrito) con 1 a 6 mutaciones al azar, pasado por JSON. */
function genMutated(r: Rng): unknown {
  const base: unknown = r.pick([
    () => smallChart(),
    () => ballPattern(),
    () => doc(totalsChart([80, 72, 64, 40, 8], 8, { renderAs: "circle" })),
    () => doc(chartOf([[A, B, A, A, A, A, A, B]], { workedIn: "rows", renderAs: "tube", direction: "top_down", repeat: { x: 3, y: 2 } })),
  ])();
  const root = { doc: base } as Record<string, unknown>;
  for (let m = r.int(1, 6); m > 0; m--) {
    const all = containers(root);
    const target = r.pick(all);
    if (Array.isArray(target)) {
      const op = r.int(0, 2);
      if (op === 0 && target.length > 0) target[r.int(0, target.length - 1)] = genJson(r, 0);
      else if (op === 1) target.push(genJson(r, 0));
      else target.splice(r.int(0, target.length), 1);
    } else {
      const keys = Object.keys(target);
      const op = r.int(0, 2);
      if (op === 0 && keys.length > 0) target[r.pick(keys)] = genJson(r, 0);
      else if (op === 1 && keys.length > 0 && target !== root) delete target[r.pick(keys)];
      else target[r.pick([...keys, "extra", "__proto__", "through", "gauge"])] = genJson(r, 0);
    }
  }
  // `number` y `through` van sin acotar (hasta 1e308 y 2^53, del POOL): desde T2d (F1, F3) el
  // validador los rechaza antes de recorrer los rangos.
  return JSON.parse(JSON.stringify(root.doc ?? null));
}

const SEVERITIES = new Set(["error", "warning", "info"]);
/** Texto que delata un valor interpolado sin revisar su tipo (F4). */
const BAD_TEXT = /undefined|NaN|\[object Object\]/;

describe("QA: validatePattern y migratePattern nunca lanzan con JSON.parse arbitrario", () => {
  it("propiedad: documentos válidos mutados al azar", () => {
    forAll(
      "no lanza",
      (r) => genMutated(r),
      (input) => {
        const before = JSON.stringify(input);
        const m = migratePattern(input);
        // Un v1 se copia con la versión nueva (STEPS[1]); cualquier otra entrada vuelve sin tocar.
        if (m.ok && m.from !== SCHEMA_VERSION) assert.deepEqual(m.document, { ...(input as object), schemaVersion: SCHEMA_VERSION });
        else assert.equal(m.document, input);
        const res = validatePattern(m.document, { weightCat: 4, fibers: new Set(["lana"]), paletteIds: new Set(["crudo"]) });
        // El try/catch de respaldo de validatePattern no debe activarse con JSON: si lo hace, algo lanzó por dentro.
        assert.ok(!res.issues.some((i) => i.message === "El patrón no se pudo leer."), JSON.stringify(res.issues.slice(0, 3)));
        for (const i of res.issues) {
          assert.equal(typeof i.code, "string");
          assert.ok(SEVERITIES.has(i.severity), i.severity);
          assert.equal(typeof i.path, "string");
          assert.ok(typeof i.message === "string" && i.message.length > 0);
        }
        assert.equal(res.valid, !res.issues.some((i) => i.severity === "error"));
        assert.equal(res.savable, res.issues.every((i) => i.severity !== "error" || isDraftError(i)));
        if (res.valid) assert.ok(res.savable, "valid implica savable");
        // F4: ningún mensaje interpola un valor de tipo incorrecto.
        for (const i of res.issues) assert.doesNotMatch(i.message, BAD_TEXT, `${i.code}: ${i.message}`);
        // C15 con JSON arbitrario: las opciones no cambian los errores.
        const plain = validatePattern(m.document);
        assert.deepEqual(res.issues.filter((i) => i.severity === "error"), plain.issues.filter((i) => i.severity === "error"));
        // Pura: no muta la entrada y es determinista.
        assert.equal(JSON.stringify(input), before);
        assert.deepEqual(validatePattern(m.document, { weightCat: 4, fibers: new Set(["lana"]), paletteIds: new Set(["crudo"]) }), res);
        const parsed = parsePattern(input);
        assert.equal(parsed.ok, validatePattern(input).valid);
        if (!m.ok) assert.ok(!validatePattern(input).valid, "una versión desconocida nunca valida");
      },
      600,
    );
  });

  it("propiedad: valores JSON sueltos (no documentos)", () => {
    forAll(
      "no lanza sueltos",
      (r) => JSON.parse(JSON.stringify(genJson(r, 0) ?? null)),
      (input) => {
        const m = migratePattern(input);
        const res = validatePattern(input);
        assert.equal(res.valid, false);
        assert.ok(!res.issues.some((i) => i.message === "El patrón no se pudo leer."));
        for (const i of res.issues) assert.doesNotMatch(i.message, BAD_TEXT, `${i.code}: ${i.message}`);
        assert.equal(m.document, input);
      },
    );
  });

  it("claves __proto__ y constructor propias (como las crea JSON.parse) no lanzan ni contaminan", () => {
    const src = JSON.stringify(smallChart())
      .replace('"chart":{', '"chart":{"__proto__":{"width":999},"constructor":1,')
      .replace('"yarns":[{', '"yarns":[{"__proto__":null,"hasOwnProperty":3,');
    const input = JSON.parse(src);
    assert.ok(Object.hasOwn(input.chart, "__proto__"));
    const res = validatePattern(input, { weightCat: 3 });
    assert.ok(!res.issues.some((i) => i.message === "El patrón no se pudo leer."));
    assert.equal(({} as Record<string, unknown>).width, undefined);
    assert.equal(migratePattern(input).ok, true);
  });

  const INHERITED = ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"];

  it("F2: un punto con nombre de propiedad heredada (toString, constructor, __proto__) es STITCH_UNKNOWN", () => {
    for (const stitch of INHERITED) {
      const p = ballPattern();
      p.parts[0]!.rounds = [{ number: 1, items: [{ type: "stitch", stitch: stitch as "sc", count: 6 }] }];
      const res = validatePattern(JSON.parse(JSON.stringify(p)));
      assert.equal(res.valid, false, stitch);
      assert.ok(res.issues.some((i) => i.code === "STITCH_UNKNOWN"), stitch);
      for (const i of res.issues) assert.doesNotMatch(i.message, BAD_TEXT, `${stitch}: ${i.message}`);
    }
  });

  it("F2: lana inicial, cambio de color, fibra y paleta con nombres heredados no se confunden con datos", () => {
    for (const name of INHERITED) {
      const start = ballPattern();
      start.parts[0]!.startYarn = name;
      assert.ok(validatePattern(JSON.parse(JSON.stringify(start))).issues.some((i) => i.code === "PART_START_YARN"), name);
      const color = ballPattern();
      color.parts[0]!.rounds[1]!.items.unshift({ type: "color", yarn: name });
      assert.ok(validatePattern(JSON.parse(JSON.stringify(color))).issues.some((i) => i.code === "COLOR_UNKNOWN_YARN"), name);
      const fiber = ballPattern();
      fiber.yarns[0]!.composition = [{ fiber: name, percent: 100 }];
      assert.ok(validatePattern(JSON.parse(JSON.stringify(fiber)), { fibers: new Set(["lana"]) }).issues.some((i) => i.code === "YARN_FIBER_UNKNOWN"), name);
      const palette = ballPattern();
      palette.yarns[0]!.color = { hex: "#000000", paletteId: name };
      assert.ok(validatePattern(JSON.parse(JSON.stringify(palette)), { paletteIds: new Set(["crudo"]) }).issues.some((i) => i.code === "YARN_PALETTE_UNKNOWN"), name);
    }
  });

  it("F4: los mensajes nunca muestran undefined, NaN ni [object Object] (valores de tipo incorrecto)", () => {
    {
      const cases: Array<[string, (p: ReturnType<typeof ballPattern>) => void]> = [
        ["paletteId objeto", (p) => ((p.yarns[0]!.color as unknown as Record<string, unknown>).paletteId = {})],
        ["stitch objeto", (p) => ((p.parts[0]!.rounds[0]!.items[0] as unknown as Record<string, unknown>).stitch = {})],
        ["startYarn ausente", (p) => delete (p.parts[0] as Partial<typeof p.parts[0]>).startYarn],
        ["color sin yarn", (p) => p.parts[0]!.rounds[1]!.items.unshift({ type: "color" } as never)],
        ["expected objeto", (p) => ((p.parts[0]!.rounds[0] as unknown as Record<string, unknown>).expected = {})],
      ];
      for (const [name, mutate] of cases) {
        const p = ballPattern();
        mutate(p);
        const issues = validatePattern(JSON.parse(JSON.stringify(p)), { paletteIds: new Set(["crudo"]) }).issues;
        for (const i of issues) assert.doesNotMatch(i.message, BAD_TEXT, `${name}: ${i.code}: ${i.message}`);
      }
    }
  });

  it("F4: un paletteId que no es texto es error de tipo (con o sin paleta), no advertencia", () => {
    for (const paletteId of [{}, 3, null, true, ["crudo"]]) {
      const p = ballPattern();
      (p.yarns[0]!.color as unknown as Record<string, unknown>).paletteId = paletteId;
      for (const opts of [{}, { paletteIds: new Set(["crudo"]) }]) {
        const res = validatePattern(JSON.parse(JSON.stringify(p)), opts);
        const bad = res.issues.filter((i) => i.path === "yarns[0].color.paletteId");
        assert.deepEqual(bad.map((i) => [i.code, i.severity]), [["SHAPE", "error"]], JSON.stringify(paletteId));
        assert.equal(res.savable, false);
      }
    }
  });

  it("F4: un expected mal formado da ROUND_EXPECTED y no además ROUND_COUNT_MISMATCH", () => {
    for (const expected of [{}, "6", 6.5, -1, [6]]) {
      const p = ballPattern();
      (p.parts[0]!.rounds[0] as unknown as Record<string, unknown>).expected = expected;
      const codes = validatePattern(JSON.parse(JSON.stringify(p))).issues.map((i) => i.code);
      assert.ok(codes.includes("ROUND_EXPECTED"), JSON.stringify(expected));
      assert.ok(!codes.includes("ROUND_COUNT_MISMATCH"), JSON.stringify(expected));
    }
  });

  it("F1: un número de vuelta ≥ 2^53 o 1e308 (entero para Number.isInteger) no cuelga el validador ni los derivados", () => {
    // Se corre en un proceso hijo con tiempo límite para no colgar la suite si vuelve a fallar.
    const round = (number: number, through?: number) => ({ number, ...(through === undefined ? {} : { through }), items: [{ type: "stitch", stitch: "sc", count: 6 }] });
    const docs = [
      [round(2 ** 53)],
      [round(1e308)],
      [round(1, 2 ** 53)],
      [round(1, 1e308)],
      [round(-1e308, 1)],
      [round(2 ** 53 - 1, 2 ** 53 + 2)],
    ].map((rounds) => ({ ...ballPattern(), parts: [{ ...ballPattern().parts[0]!, rounds }] }));
    const code = `import { validatePattern, concreteRounds, summarizePart } from ${JSON.stringify(new URL("../src/index.ts", import.meta.url).href)};
      for (const d of JSON.parse(process.argv[1])) {
        const r = validatePattern(d);
        if (r.valid || !r.issues.some((i) => i.code === "LIMIT" || i.code === "ROUND_NUMBERING")) throw new Error(JSON.stringify(r.issues));
        concreteRounds(d.parts[0]); summarizePart(d.parts[0]);
      }
      console.log("ok");`;
    const r = spawnSync(process.execPath, ["--max-old-space-size=128", "--input-type=module", "-e", code, JSON.stringify(docs)], { timeout: 5000, encoding: "utf8" });
    assert.equal(r.stdout.trim(), "ok", `señal ${r.signal}; el validador no terminó. ${r.stderr.slice(0, 500)}`);
  });

  it("F1: number y through deben estar en 1..LIMITS.maxRounds; 1000 vale, 1001 es LIMIT", () => {
    const issuesFor = (rounds: unknown[]) => {
      const p = ballPattern();
      (p.parts[0] as unknown as Record<string, unknown>).rounds = rounds;
      return validatePattern(JSON.parse(JSON.stringify(p))).issues;
    };
    const sc = [{ type: "stitch", stitch: "sc", count: 6 }];
    const six = (number: number, through?: number) => ({ number, ...(through === undefined ? {} : { through }), items: sc, expected: 6 });
    const start = { number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 };
    assert.ok(!issuesFor([start, six(2, LIMITS.maxRounds)]).some((i) => i.severity === "error"));
    const over = issuesFor([start, six(2, LIMITS.maxRounds + 1)]);
    assert.deepEqual(over.filter((i) => i.severity === "error").map((i) => [i.code, i.path]), [["LIMIT", "parts[0].rounds[1].through"]]);
    assert.ok(issuesFor([six(LIMITS.maxRounds + 1)]).some((i) => i.code === "LIMIT" && i.path === "parts[0].rounds[0].number"));
    for (const n of [0, -1, -1e308]) assert.ok(issuesFor([six(n)]).some((i) => i.code === "ROUND_NUMBERING"), String(n));
    // Rangos que se pisan: cada uno cabe, pero juntos superan el tope.
    const overlap = issuesFor([start, six(2, 600), six(2, 600)]);
    assert.ok(overlap.some((i) => i.code === "LIMIT" && i.path === "parts[0].rounds"), JSON.stringify(overlap.map((i) => i.code)));
  });

  it("F1: concreteRounds y summarizePart nunca despliegan más de LIMITS.maxRounds vueltas", () => {
    const part = { ...ballPattern().parts[0]!, rounds: [{ number: 1, through: 10_000_000, items: [{ type: "stitch" as const, stitch: "sc" as const, count: 6 }] }] };
    const t0 = performance.now();
    assert.equal(concreteRounds(part).length, LIMITS.maxRounds);
    assert.equal(summarizePart(part).rounds, LIMITS.maxRounds);
    assert.ok(performance.now() - t0 < 200);
    const bad = { ...part, rounds: [{ number: 2 ** 53, items: part.rounds[0]!.items }] };
    assert.deepEqual(concreteRounds(bad), []);
  });

  it("F3: un rango de vueltas desmedido (through) se rechaza como LIMIT sin recorrer cada vuelta", () => {
    const p = ballPattern();
    const next = (p.parts[0]!.rounds.at(-1)!.through ?? p.parts[0]!.rounds.at(-1)!.number) + 1;
    p.parts[0]!.rounds.push({ number: next, through: 10_000_000, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 });
    const t0 = performance.now();
    const res = validatePattern(JSON.parse(JSON.stringify(p)));
    const ms = performance.now() - t0;
    assert.ok(res.issues.some((i) => i.code === "LIMIT"), "debería informar LIMIT");
    assert.ok(ms < 50, `tardó ${ms.toFixed(0)} ms`);
  });
});

// --------------------------------------------------------------- Rendimiento

describe("QA rendimiento: peor caso de las reglas nuevas", () => {
  it("200 × 200, círculo de ida y vuelta, cada vuelta cambia de puntos y tiene 3 lanas con hebras largas: < 100 ms", () => {
    // Cuña que alterna 200 y 120 puntos por fila: dispara forma (TOO_FAST/STEEP/UNEXPECTED) en
    // cada transición, CHART_COLORS_PER_ROW y CHART_FLOAT_LONG en cada fila y CHART_CIRCLE_REPEAT_Y.
    const W = 200;
    const cells: number[] = [];
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) cells.push(y % 2 === 1 && x >= 120 ? _ : x === 0 ? 1 : x === 1 ? 2 : 0);
    const yarns: ChartPattern["yarns"] = [yarnA, yarnB, { ...yarnB, id: "C", weight: 5 }];
    const p = doc({ width: W, height: W, cells, repeat: { x: 12, y: 500 }, workedIn: "rows", renderAs: "circle", direction: "bottom_up" }, { yarns });
    validatePattern(p, { weightCat: 4 }); // calentamiento del JIT
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = validatePattern(p, { weightCat: 4 });
      runs.push(performance.now() - t0);
      assert.ok(res.issues.length > 400);
    }
    const best = Math.min(...runs);
    if (process.env.QA_TIMING) console.log(`peor caso 200x200: ${runs.map((x) => x.toFixed(1)).join(", ")} ms`);
    assert.ok(best < 100, `mejor corrida ${best.toFixed(1)} ms (corridas: ${runs.map((x) => x.toFixed(1)).join(", ")})`);
  });

  it("la cantidad de issues está acotada por el alto del motivo, no por repeat.y", () => {
    const cells = Array.from({ length: 50 * 50 }, (_v, i) => ((i % 50) % 7 === 0 ? B : A));
    const base = (ry: number) => validatePattern(doc({ width: 50, height: 50, cells, repeat: { x: 1, y: ry }, workedIn: "rows", renderAs: "flat", direction: "bottom_up" })).issues.length;
    assert.equal(base(1), base(500));
  });
});

// F5 (pasada final de QA tras T2d): los campos de texto libre opcionales no se validan.
// Un documento con `finish: {}` o `name: {}` da valid: true, y formatPart escribe
// "Cierre: [object Object]". Queda como `todo` hasta que motor-patrones lo corrija;
// al corregirlo, quitar la opción `todo`.
describe("QA F5: tipo de los campos de texto libre", () => {
  it("un campo de texto con un valor que no es texto no es valid y el texto derivado nunca muestra [object Object]", () => {
    const written: Array<[string, (d: Record<string, any>) => void]> = [
      ["part.finish objeto", (d) => (d.parts[0].finish = {})],
      ["part.finish número", (d) => (d.parts[0].finish = 5)],
      ["part.name objeto", (d) => (d.parts[0].name = {})],
      ["round.note objeto", (d) => (d.parts[0].rounds[0].note = {})],
      ["assembly con objeto", (d) => (d.assembly = [{}])],
      ["assembly texto", (d) => (d.assembly = "x")],
      ["notes objeto", (d) => (d.notes = {})],
      ["notes con número", (d) => (d.notes = [5])],
      ["yarn.note objeto", (d) => (d.yarns[0].note = {})],
      ["origin.model objeto", (d) => (d.origin = { kind: "ai", model: {} })],
      ["origin.promptVersion número", (d) => (d.origin = { kind: "ai", model: "m", promptVersion: 3 })],
    ];
    const failures: string[] = [];
    for (const [name, mutate] of written) {
      const d = JSON.parse(JSON.stringify(ballPattern()));
      mutate(d);
      const res = validatePattern(d);
      if (res.valid) failures.push(`${name}: valid`);
      if (res.savable) {
        for (const dialect of ["es", "us"] as const) {
          const text = formatPart(d.parts[0], dialect);
          if (BAD_TEXT.test(text)) failures.push(`${name}: formatPart(${dialect}) contiene ${text.match(BAD_TEXT)![0]}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });
});

describe("QA F5: propiedad de los textos derivados", () => {
  /** Rutas de texto libre de un patrón escrito (y las comunes a cualquier patrón). */
  const TEXT_SLOTS: Array<(d: Record<string, any>, v: unknown) => void> = [
    (d, v) => (d.parts[0].name = v),
    (d, v) => (d.parts[0].finish = v),
    (d, v) => (d.parts[0].rounds[d.parts[0].rounds.length - 1].note = v),
    (d, v) => (d.assembly = v),
    (d, v) => (d.notes = v),
    (d, v) => (d.yarns[0].note = v),
    (d, v) => (d.origin = { kind: "ai", model: v, promptVersion: v }),
  ];

  it("propiedad: con JSON arbitrario, si es savable ningún texto derivado contiene [object Object], undefined ni NaN", () => {
    forAll(
      "textos derivados sanos",
      (r) => {
        if (r.bool(0.4)) return genMutated(r);
        const d = JSON.parse(JSON.stringify(ballPattern())) as Record<string, any>;
        for (let m = r.int(1, 4); m > 0; m--) r.pick(TEXT_SLOTS)(d, genJson(r, 0));
        return JSON.parse(JSON.stringify(d));
      },
      (input) => {
        const res = validatePattern(input);
        for (const i of res.issues) assert.doesNotMatch(i.message, BAD_TEXT, `${i.code}: ${i.message}`);
        if (!res.savable) return;
        const d = input as Record<string, any>;
        if (d.kind !== "written") return;
        for (const part of d.parts) {
          for (const dialect of ["es", "us"] as const) {
            const text = formatPart(part, dialect);
            assert.doesNotMatch(text, BAD_TEXT, text);
            assert.doesNotMatch(text, /^(?:Parte|Part|Cierre|Finish): *$/m, "encabezado vacío");
          }
        }
      },
      600,
    );
  });
});

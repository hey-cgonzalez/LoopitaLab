/**
 * Correcciones de la revisión de tejido T21 (fase 4, docs/revision-tejido-fase-4.md) en el núcleo:
 * - C1 (BUG-QA4-1): `gaugeYarnOf`, `gaugeWeightOf` y `ValidateOptions.assumedGaugeOf`.
 * - C7: el aviso `GROUP_COLOR_ONLY`.
 * Propiedades con el generador con semilla (ADR 0002): `SEED=… node --test test/t21-revision.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gaugeWeightOf,
  gaugeYarnOf,
  parsePart,
  validatePattern,
  type Gauge,
  type Issue,
  type Item,
  type Part,
  type ValidateOptions,
  type WrittenPattern,
  type Yarn,
} from "../src/index.ts";
import { writtenOf } from "./support/amigurumi.ts";
import { yarnA, yarnB } from "./support/fixtures.ts";
import { forAll, type Rng } from "./support/property.ts";
import { genWrittenV2 } from "./support/written-gen.ts";

const read = (text: string, id = "p"): Part => {
  const r = parsePart(text, { id });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  return r.value;
};
const yarn = (id: string, weight: number): Yarn => ({ ...structuredClone(yarnA), id, weight: weight as Yarn["weight"] });
const shape = (issues: Issue[]) => issues.filter((i) => i.code === "ROUND_GROWS_FAST" || i.code === "ROUND_SHRINKS_FAST");
const errors = (issues: Issue[]) => issues.filter((i) => i.severity === "error");

// ------------------------------------------------------------ C1: lana de la muestra

describe("T21 C1: gaugeYarnOf y gaugeWeightOf (lana de la muestra de una parte)", () => {
  const yarns = [yarn("A", 6), yarn("B", 1), yarn("C", 4)];

  it("usa la lana inicial de la parte, no la A", () => {
    assert.equal(gaugeYarnOf({ yarns }, { startYarn: "B" })?.id, "B");
    assert.equal(gaugeWeightOf({ yarns }, { startYarn: "B" }), 1);
    assert.equal(gaugeWeightOf({ yarns }, { startYarn: "C" }), 4);
  });

  it("si la lana inicial no existe, usa yarns[0]; sin lanas, undefined", () => {
    assert.equal(gaugeYarnOf({ yarns }, { startYarn: "Z" })?.id, "A");
    assert.equal(gaugeWeightOf({ yarns }, { startYarn: "" }), 6);
    assert.equal(gaugeYarnOf({ yarns: [] }, { startYarn: "A" }), undefined);
    assert.equal(gaugeWeightOf({ yarns: [] }, { startYarn: "A" }), undefined);
  });

  it("grosor no numérico o fuera de 0 a 7: undefined (no se inventa un grosor)", () => {
    for (const w of ["4", 4.5, -1, 8, NaN, null, undefined]) {
      const bad = [{ ...yarn("A", 3), weight: w } as unknown as Yarn];
      assert.equal(gaugeWeightOf({ yarns: bad }, { startYarn: "A" }), undefined, String(w));
    }
    assert.equal(gaugeWeightOf({ yarns: [yarn("A", 0)] }, { startYarn: "A" }), 0);
  });

  it("no lanza con documentos a medio validar", () => {
    const junk: unknown[] = [null, undefined, 1, "x", {}, { yarns: null }, { yarns: "A" }, { yarns: [null, 3] }, { yarns: [[], { id: "A" }] }];
    for (const p of junk) {
      for (const part of [null, undefined, {}, { startYarn: 3 }, { startYarn: "A" }]) {
        assert.doesNotThrow(() => gaugeYarnOf(p as WrittenPattern, part as Part));
        assert.doesNotThrow(() => gaugeWeightOf(p as WrittenPattern, part as Part));
      }
    }
    assert.equal(gaugeYarnOf({ yarns: [null, yarn("B", 2)] as unknown as Yarn[] }, { startYarn: "B" })?.id, "B");
    assert.equal(gaugeYarnOf({ yarns: [null, yarn("B", 2)] as unknown as Yarn[] }, { startYarn: "Z" }), undefined);
  });

  it("propiedad: es la lana inicial si existe, si no yarns[0]; el grosor es el de esa lana", () => {
    forAll(
      "T21-C1 gaugeYarnOf",
      (r: Rng) => {
        const n = r.int(0, 5);
        const ys = Array.from({ length: n }, (_, i) => yarn(String.fromCharCode(65 + i), r.int(0, 7)));
        return { ys, start: r.pick(["A", "B", "C", "D", "E", "Z"]) };
      },
      ({ ys, start }) => {
        const y = gaugeYarnOf({ yarns: ys }, { startYarn: start });
        const expected = ys.find((x) => x.id === start) ?? ys[0];
        assert.equal(y, expected);
        assert.equal(gaugeWeightOf({ yarns: ys }, { startYarn: start }), expected?.weight);
      },
    );
  });
});

// ------------------------------------------------------------ C1: muestra por parte en el validador

/** V2 de 6 aumentos: Δr/s = 6ρ/2π. Avisa con ρ = 2 (10 × 20) y no con ρ = 1,2 (20 × 24). */
const WIDE: Gauge = { stitchesPer10cm: 10, rowsPer10cm: 20 };
const NARROW: Gauge = { stitchesPer10cm: 20, rowsPer10cm: 24 };
const disc = (id: string, startYarn: string): Part => ({ ...read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3: 12 pb (12)", id), name: id, startYarn });

function twoParts(): WrittenPattern {
  const d = writtenOf([disc("cuerpo", "A"), disc("ojo", "B")], { yarns: [yarn("A", 6), yarn("B", 1)] });
  delete d.gauge;
  return d;
}
type GaugeOf = NonNullable<ValidateOptions["assumedGaugeOf"]>;
const byWeight = (d: WrittenPattern): GaugeOf => (part) => (gaugeWeightOf(d, part) === 1 ? { gauge: WIDE } : { gauge: NARROW });

describe("T21 C1: ValidateOptions.assumedGaugeOf (BUG-QA4-1)", () => {
  it("cada parte usa la muestra de su lana inicial", () => {
    const d = twoParts();
    const v = validatePattern(d, { assumedGaugeOf: byWeight(d) });
    assert.deepEqual(shape(v.issues).map((i) => [i.code, i.path]), [["ROUND_GROWS_FAST", "parts[1].rounds[1]"]]);
    // Con una sola muestra global (la de la A), ninguna avisa: era el bug.
    assert.deepEqual(shape(validatePattern(d, { assumedGauge: NARROW }).issues), []);
  });

  it("recibe la parte y su índice", () => {
    const d = twoParts();
    const seen: Array<[string, number]> = [];
    validatePattern(d, { assumedGaugeOf: (p, i) => (seen.push([p.id, i]), undefined) });
    assert.deepEqual(seen, [["cuerpo", 0], ["ojo", 1]]);
  });

  it("prioridad: la muestra del documento manda y assumedGaugeOf no se consulta", () => {
    const d = twoParts();
    d.gauge = { ...NARROW };
    let calls = 0;
    const v = validatePattern(d, { assumedGaugeOf: () => (calls++, { gauge: WIDE }) });
    assert.equal(calls, 0);
    assert.deepEqual(shape(v.issues), []);
  });

  it("prioridad: assumedGaugeOf prevalece sobre assumedGauge y weightCat; undefined cae a ellos", () => {
    const d = twoParts();
    const onlyEye: GaugeOf = (p) => (p.id === "ojo" ? { gauge: NARROW } : undefined);
    const v = validatePattern(d, { assumedGaugeOf: onlyEye, assumedGauge: WIDE });
    assert.deepEqual(shape(v.issues).map((i) => i.path), ["parts[0].rounds[1]"]);
    // weightCat 7 (6 × 7): ρ ≈ 1,17, no avisa; assumedGaugeOf con WIDE para el ojo sí.
    const w = validatePattern(d, { assumedGaugeOf: (p) => (p.id === "ojo" ? { gauge: WIDE } : undefined), weightCat: 7 });
    assert.deepEqual(shape(w.issues).map((i) => i.path), ["parts[1].rounds[1]"]);
  });

  it("una muestra inválida o una excepción equivalen a no darla; el validador no lanza", () => {
    const d = twoParts();
    const base = validatePattern(d, { assumedGauge: WIDE });
    const bad: GaugeOf[] = [
      () => {
        throw new Error("x");
      },
      () => ({ gauge: { stitchesPer10cm: 0, rowsPer10cm: 10 } }),
      () => ({ gauge: { stitchesPer10cm: NaN, rowsPer10cm: 10 } }),
      () => null as unknown as undefined,
      () => 3 as unknown as undefined,
      () => ({}) as unknown as undefined,
      () =>
        ({
          get gauge() {
            throw new Error("getter");
          },
        }) as unknown as undefined,
    ];
    for (const f of bad) assert.deepEqual(validatePattern(d, { assumedGauge: WIDE, assumedGaugeOf: f }), base);
    assert.deepEqual(validatePattern(d, { assumedGauge: WIDE, assumedGaugeOf: 5 as unknown as GaugeOf }), base);
  });

  it("stitch: el punto de la muestra cambia el alto de la vuelta de pb (dc la reduce a la mitad)", () => {
    const d = twoParts();
    // 20 × 24 en pa: la vuelta de pb mide la mitad y ρ efectiva se duplica, así que avisa.
    const v = validatePattern(d, { assumedGaugeOf: () => ({ gauge: NARROW, stitch: "dc" }) });
    assert.equal(shape(v.issues).length, 2);
    const s = validatePattern(d, { assumedGaugeOf: () => ({ gauge: NARROW, stitch: "zz" as "sc" }) });
    assert.equal(shape(s.issues).length, 0);
  });

  it("las hileras (flat) no tienen avisos de forma y no consultan assumedGaugeOf", () => {
    const panel = { ...read("Inicio: cad 11\nConstrucción: hileras\nH1: 10 pb (10)\nH2: 10 pb (10)", "panel"), name: "Panel" };
    const d = writtenOf([panel]);
    delete d.gauge;
    let calls = 0;
    validatePattern(d, { assumedGaugeOf: () => (calls++, { gauge: WIDE }) });
    assert.equal(calls, 0);
  });

  it("propiedad (E10): assumedGaugeOf nunca cambia los errores ni valid ni savable", () => {
    forAll(
      "T21-C1 E10",
      (r: Rng) => {
        const d = genWrittenV2(r);
        if (r.bool(0.7)) delete (d as Partial<WrittenPattern>).gauge;
        const gauges = Array.from({ length: 8 }, () => ({ stitchesPer10cm: r.int(5, 40), rowsPer10cm: r.int(5, 50) }));
        return { d, gauges, stitch: r.pick(["sc", "hdc", "dc", "tr"] as const) };
      },
      ({ d, gauges, stitch }) => {
        const plain = validatePattern(d);
        const per = validatePattern(d, { assumedGaugeOf: (_p, i) => ({ gauge: gauges[i % gauges.length]!, stitch }) });
        assert.equal(per.valid, plain.valid);
        assert.equal(per.savable, plain.savable);
        assert.deepEqual(errors(per.issues), errors(plain.issues));
      },
      150,
    );
  });

  it("propiedad: con assumedGaugeOf, los avisos de forma de cada parte son los de validarla sola con su muestra", () => {
    forAll(
      "T21-C1 por parte",
      (r: Rng) => {
        const n = r.int(1, 4);
        const parts: Part[] = [];
        const gauges: Gauge[] = [];
        for (let k = 0; k < n; k++) {
          const counts = [6];
          const lines = ["Inicio: AM", "V1: 6 pb en AM (6)"];
          for (let v = 2; v <= r.int(2, 6); v++) {
            const prev = counts.at(-1)!;
            const inc = r.int(0, Math.min(prev, 12));
            lines.push(inc === 0 ? `V${v}: ${prev} pb (${prev})` : inc === prev ? `V${v}: aum x${inc} (${prev + inc})` : `V${v}: aum x${inc}, ${prev - inc} pb (${prev + inc})`);
            counts.push(prev + inc);
          }
          parts.push({ ...read(lines.join("\n"), `p${k}`), name: `P${k}` });
          gauges.push({ stitchesPer10cm: r.int(8, 30), rowsPer10cm: r.int(8, 40) });
        }
        return { parts, gauges };
      },
      ({ parts, gauges }) => {
        const d = writtenOf(parts);
        delete d.gauge;
        const all = shape(validatePattern(d, { assumedGaugeOf: (_p, i) => ({ gauge: gauges[i]! }) }).issues);
        const alone = parts.flatMap((p, i) => {
          const one = writtenOf([p]);
          delete one.gauge;
          return shape(validatePattern(one, { assumedGauge: gauges[i]! }).issues).map((x) => ({ ...x, path: x.path.replace(/^parts\[0\]/, `parts[${i}]`) }));
        });
        assert.deepEqual(all, alone);
      },
      150,
    );
  });
});

// ------------------------------------------------------------ C7: GROUP_COLOR_ONLY

const COLOR_ONLY_TEXT = "este grupo solo cambia de lana y no teje ningún punto; solo cuenta el último cambio. Quita el grupo o agrega puntos.";
const st = (count = 1): Item => ({ type: "stitch", stitch: "sc", count });
const col = (y: string): Item => ({ type: "color", yarn: y });
const grp = (times: number, ...items: Item[]): Item => ({ type: "group", times, items });

/** Patrón de una parte con V1 de 6 pb y V2 = 6 pb seguidos de `extra`. */
function withV2(extra: Item[]): WrittenPattern {
  const part: Part = {
    id: "p",
    name: "Bolita",
    construction: "spiral",
    start: { type: "magic_ring" },
    startYarn: "A",
    rounds: [
      { number: 1, items: [st(6)], expected: 6 },
      { number: 2, items: [st(6), ...extra], expected: 6 },
    ],
  };
  return writtenOf([part], { yarns: [structuredClone(yarnA), structuredClone(yarnB)] });
}
const colorOnly = (d: WrittenPattern) => validatePattern(d).issues.filter((i) => i.code === "GROUP_COLOR_ONLY");

/** Referencia independiente: rutas de los grupos más externos con times ≥ 2 y sin puntos en su subárbol. */
function refColorOnly(items: Item[], path: string): string[] {
  const hasStitch = (xs: Item[]): boolean => xs.some((x) => x.type === "stitch" || (x.type === "group" && hasStitch(x.items)));
  const out: string[] = [];
  items.forEach((it, i) => {
    if (it.type !== "group") return;
    const p = `${path}[${i}]`;
    if (it.times >= 2 && !hasStitch(it.items)) out.push(p);
    else out.push(...refColorOnly(it.items, `${p}.items`));
  });
  return out;
}

describe("T21 C7: GROUP_COLOR_ONLY (grupo que solo cambia de lana)", () => {
  it("[@B] x5: advertencia con el texto de la revisión; el patrón sigue válido", () => {
    const d = withV2([grp(5, col("B"))]);
    const v = validatePattern(d);
    assert.equal(v.valid, true);
    const w = v.issues.filter((i) => i.code === "GROUP_COLOR_ONLY");
    assert.equal(w.length, 1);
    assert.equal(w[0]!.severity, "warning");
    assert.equal(w[0]!.path, "parts[0].rounds[1].items[1]");
    assert.equal(w[0]!.message, `Bolita, vuelta 2: ${COLOR_ONLY_TEXT}`);
  });

  it("no avisa con un @B suelto, un grupo de times 1 ni un grupo con puntos", () => {
    assert.deepEqual(colorOnly(withV2([col("B")])), []);
    assert.deepEqual(colorOnly(withV2([grp(1, col("B"))])), []);
    assert.equal(colorOnly(withV2([grp(3, col("B"), col("A"))])).length, 1);
    const d = withV2([]);
    d.parts[0]!.rounds[1]!.items = [grp(3, col("B"), st(2))];
    assert.deepEqual(colorOnly(d), []);
    d.parts[0]!.rounds[1]!.items = [grp(3, grp(1, col("B")), st(2))];
    assert.deepEqual(colorOnly(d), []);
  });

  it("anidados: un solo aviso, el del grupo más externo repetido", () => {
    assert.deepEqual(colorOnly(withV2([grp(3, grp(2, col("B")))])).map((i) => i.path), ["parts[0].rounds[1].items[1]"]);
    assert.deepEqual(colorOnly(withV2([grp(1, grp(2, col("B")))])).map((i) => i.path), ["parts[0].rounds[1].items[1].items[0]"]);
  });

  it("convive con errores de la vuelta (lana inexistente) sin cambiar valid", () => {
    const d = withV2([grp(4, col("Z"))]);
    const v = validatePattern(d);
    assert.equal(v.valid, false);
    assert.ok(v.issues.some((i) => i.code === "COLOR_UNKNOWN_YARN"));
    assert.equal(v.issues.filter((i) => i.code === "GROUP_COLOR_ONLY").length, 1);
  });

  it("propiedad: los avisos coinciden con la referencia y son advertencias", () => {
    const genItems = (r: Rng, depth: number): Item[] =>
      Array.from({ length: r.int(1, 3) }, (): Item => {
        const k = r.int(0, depth >= 3 ? 1 : 2);
        if (k === 0) return st(r.int(1, 2));
        if (k === 1) return col(r.pick(["A", "B"]));
        return grp(r.int(1, 3), ...genItems(r, depth + 1));
      });
    forAll(
      "T21-C7",
      (r: Rng) => genItems(r, 1),
      (items) => {
        const d = withV2([]);
        d.parts[0]!.rounds[1]!.items = items;
        delete d.parts[0]!.rounds[1]!.expected;
        const v = validatePattern(d);
        const got = v.issues.filter((i) => i.code === "GROUP_COLOR_ONLY");
        assert.deepEqual(got.map((i) => i.path), refColorOnly(items, "parts[0].rounds[1].items"));
        for (const i of got) assert.equal(i.severity, "warning");
        // Es solo una advertencia: valid depende únicamente de los errores.
        assert.equal(v.valid, v.issues.every((i) => i.severity !== "error"));
      },
    );
  });
});

/**
 * Perfil de las partes (T5 de la fase 4; ADR 0010, secciones 1 y 2, enmiendas C-2 a C-8 y
 * C-12): `shapeMetrics`, `roundHeightFactor`, `partProfile`, `partDimensions`, los avisos
 * `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST`, las propiedades G1, G2, G3, G10 y la parte del
 * perfil de G11, y los casos F4-36 a F4-43 y F4-46 a F4-51 de docs/casos-dominio-fase-4.md.
 * Los valores de STITCH_HEIGHT_FACTOR, PROFILE_RADIAL_TOLERANCE y ρ = 1,2 son los actuales,
 * no reglas físicas. // validar con tejedora
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROFILE_RADIAL_TOLERANCE,
  STITCH_HEIGHT_FACTOR,
  concreteRounds,
  parsePart,
  partDimensions,
  partProfile,
  roundHeightFactor,
  shapeMetrics,
  validatePattern,
  type Gauge,
  type Issue,
  type Part,
  type PartProfile,
  type ProfileRing,
  type RevolutionProfile,
  type Round,
  type ValidateOptions,
  type WeightCategory,
} from "../src/index.ts";
import { FIXTURE_GAUGE, fixtureAPart, fixtureBPart, writtenOf } from "./support/amigurumi.ts";
import { forAll, type Rng } from "./support/property.ts";
import { genWrittenV2 } from "./support/written-gen.ts";

const EPS = 1e-6;
const SC = shapeMetrics(FIXTURE_GAUGE, { assumed: false, gaugeStitch: "sc" });
const read = (text: string, id = "p"): Part => {
  const r = parsePart(text, { id });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  return r.value;
};
const only = (issues: Issue[], code: string) => issues.filter((i) => i.code === code);
const shapeIssues = (issues: Issue[]) => issues.filter((i) => i.code === "ROUND_GROWS_FAST" || i.code === "ROUND_SHRINKS_FAST");
const revolution = (p: PartProfile): RevolutionProfile => {
  assert.equal(p.kind, "revolution");
  return p as RevolutionProfile;
};
const round = (number: number, items: Round["items"], expected?: number): Round => (expected === undefined ? { number, items } : { number, items, expected });

/** Disco de punto bajo con anillo mágico: V1 de `start` y `rounds − 1` vueltas de +`perRound`, con aumentos repartidos. */
function disc(start: number, perRound: number, rounds: number): Part {
  const rs: Round[] = [round(1, [{ type: "stitch", stitch: "sc", count: start }], start)];
  let n = start;
  for (let k = 2; k <= rounds; k++) {
    // `perRound` aumentos y el resto en pb (perRound ≤ n).
    const items: Round["items"] = [{ type: "stitch", stitch: "inc", count: perRound }];
    if (n - perRound > 0) items.push({ type: "stitch", stitch: "sc", count: n - perRound });
    n += perRound;
    rs.push(round(k, items, n));
  }
  return { id: "disco", name: "Disco", construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds: rs };
}

/** Muestra de 20 puntos en 10 cm con `ρ` vueltas por punto (de punto bajo). */
const gaugeRho = (rho: number): Gauge => ({ stitchesPer10cm: 20, rowsPer10cm: 20 * rho });

describe("Constantes y métricas (sección 1; C-3, C-5)", () => {
  it("STITCH_HEIGHT_FACTOR: sc 1, hdc 1,5, dc 2, tr 2,5, inc/inc3/dec 1; slst, ch y sk sin valor", () => {
    // validar con tejedora
    assert.deepEqual({ ...STITCH_HEIGHT_FACTOR }, { sc: 1, hdc: 1.5, dc: 2, tr: 2.5, inc: 1, inc3: 1, dec: 1 });
    for (const code of ["slst", "ch", "sk"]) assert.equal(Object.hasOwn(STITCH_HEIGHT_FACTOR, code), false, code);
    assert.ok(Object.isFrozen(STITCH_HEIGHT_FACTOR));
  });

  it("PROFILE_RADIAL_TOLERANCE es 1,25", () => {
    // validar con tejedora
    assert.equal(PROFILE_RADIAL_TOLERANCE, 1.25);
  });

  it("shapeMetrics con la muestra de referencia (20 × 24): w = 0,5 cm, s = 0,41667 cm", () => {
    assert.deepEqual(SC, { stitchWidthCm: 0.5, roundHeightCm: 10 / 24, gaugeStitch: "sc", assumed: false });
  });

  it("shapeMetrics convierte el alto desde el punto de la muestra (divide por el factor)", () => {
    const g = { stitchesPer10cm: 20, rowsPer10cm: 12 };
    for (const [st, f] of [["sc", 1], ["hdc", 1.5], ["dc", 2], ["tr", 2.5]] as const) {
      const m = shapeMetrics(g, { assumed: true, gaugeStitch: st });
      assert.equal(m.stitchWidthCm, 0.5);
      assert.ok(Math.abs(m.roundHeightCm - 10 / 12 / f) < 1e-12, st);
      assert.equal(m.gaugeStitch, st);
      assert.equal(m.assumed, true);
    }
  });

  it("F4-43: la muestra supuesta de la categoría 0 (37 × 22 en pa) no sale el doble de alta", () => {
    // suggestedGauge(0, "crochet") = { 37, 22, "crochet-pa" }: la aplicación pasa gaugeStitch "dc".
    const g = { stitchesPer10cm: 37, rowsPer10cm: 22 };
    const asDc = shapeMetrics(g, { assumed: true, gaugeStitch: "dc" });
    const asSc = shapeMetrics(g, { assumed: true, gaugeStitch: "sc" });
    assert.ok(Math.abs(asDc.roundHeightCm - 10 / 22 / 2) < 1e-12);
    assert.ok(Math.abs(asSc.roundHeightCm / asDc.roundHeightCm - 2) < 1e-12, "leerla como pb la haría el doble de alta");
    // Vueltas de pb por punto: 2 × 22 / 37 = 1,19, cerca del 1,2 del resto de las categorías.
    assert.ok(Math.abs(asDc.stitchWidthCm / asDc.roundHeightCm - (2 * 22) / 37) < 1e-12);
  });

  it("roundHeightFactor: promedio ponderado por lo que produce cada punto; slst y ch fuera; solo slst o ch → 1", () => {
    const f = (items: Round["items"]) => roundHeightFactor(round(1, items));
    assert.equal(f([{ type: "stitch", stitch: "sc", count: 6 }]), 1);
    assert.equal(f([{ type: "stitch", stitch: "dc", count: 6 }]), 2);
    assert.equal(f([{ type: "stitch", stitch: "sc", count: 2 }, { type: "stitch", stitch: "dc", count: 2 }]), 1.5);
    assert.equal(f([{ type: "stitch", stitch: "dc", count: 4 }, { type: "stitch", stitch: "ch", count: 3 }, { type: "stitch", stitch: "slst", count: 1 }]), 2);
    assert.equal(f([{ type: "stitch", stitch: "slst", count: 6 }]), 1);
    assert.equal(f([{ type: "stitch", stitch: "ch", count: 6 }, { type: "stitch", stitch: "sk", count: 2 }]), 1);
    // inc produce 2 (factor 1) frente a 1 tr (2,5): (2 + 2,5) / 3.
    assert.equal(f([{ type: "stitch", stitch: "inc", count: 1 }, { type: "stitch", stitch: "tr", count: 1 }]), 4.5 / 3);
    // Grupos: [pb, pa] x3 + pa 2 = (3 + 6 + 4) / 8.
    assert.equal(f([{ type: "group", times: 3, items: [{ type: "stitch", stitch: "sc", count: 1 }, { type: "stitch", stitch: "dc", count: 1 }] }, { type: "stitch", stitch: "dc", count: 2 }]), 13 / 8);
    // Cambios de lana y hebra no cambian el alto (C-7).
    assert.equal(f([{ type: "color", yarn: "B" }, { type: "stitch", stitch: "hdc", count: 3, loop: "back" }]), 1.5);
  });
});

describe("partProfile: los tres tramos del paso radial (C-4) y la V1 sobre anillo mágico", () => {
  it("V1 sobre anillo mágico: radio r*₁ sin acotar y Δz = √max(s² − r*₁², 0); el anillo 0 es el centro cerrado", () => {
    const s = SC.roundHeightCm;
    for (const n of [3, 6, 8, 12, 20]) {
      const p = revolution(partProfile(read(`Inicio: AM\nV1: ${n} pb en AM (${n})`), SC));
      assert.deepEqual(p.rings[0], { round: 0, stitches: 0, radiusCm: 0, zCm: 0, heightCm: 0, strain: 1 });
      const r1 = (n * 0.5) / (2 * Math.PI);
      assert.ok(Math.abs(p.rings[1]!.radiusCm - r1) < EPS, `V1 de ${n}`);
      assert.ok(Math.abs(p.rings[1]!.zCm - Math.sqrt(Math.max(s * s - r1 * r1, 0))) < EPS);
      assert.equal(p.rings[1]!.strain, 1);
    }
  });

  it("conteo constante: sube s por vuelta, radio igual (cilindro)", () => {
    const p = revolution(partProfile(read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3-12: 12 pb (12)"), SC));
    for (let i = 3; i <= 12; i++) {
      assert.ok(Math.abs(p.rings[i]!.zCm - p.rings[i - 1]!.zCm - SC.roundHeightCm) < EPS);
      assert.equal(p.rings[i]!.radiusCm, p.rings[2]!.radiusCm);
    }
  });

  it("una vuelta de pa sube el doble que una de pb (factor 2)", () => {
    const p = revolution(partProfile(read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3: 12 pb (12)\nV4: 12 pa (12)"), SC));
    assert.ok(Math.abs(p.rings[4]!.heightCm - 2 * SC.roundHeightCm) < EPS);
    assert.ok(Math.abs(p.rings[4]!.zCm - p.rings[3]!.zCm - 2 * SC.roundHeightCm) < EPS);
  });

  it("cadeneta en aro: el anillo 0 es un aro de `count` puntos y la V1 se evalúa", () => {
    const p = revolution(partProfile(read("Inicio: cad 12\nConstrucción: cerrada\nV1: 12 pb (12)"), SC));
    assert.equal(p.spiral, false);
    assert.equal(p.rings[0]!.stitches, 12);
    assert.ok(Math.abs(p.rings[0]!.radiusCm - 6 / (2 * Math.PI)) < EPS);
    assert.ok(Math.abs(p.rings[1]!.zCm - SC.roundHeightCm) < EPS, "un punto en cada cadeneta sube s");
    // aum3 x6 sobre cad 6: Δr/s = 12 × 0,5 / 2π / s = 2,29 > 1,25 → acotado.
    const q = revolution(partProfile(read("Inicio: cad 6\nV1: aum3 x6 (18)"), SC));
    assert.ok(Math.abs(q.rings[1]!.radiusCm - q.rings[0]!.radiusCm - SC.roundHeightCm * 1.25) < EPS);
    assert.ok(q.rings[1]!.strain > 1);
  });

  it("borde exacto |Δr| = s × tolerancia (después de un acotado): no se acota por redondeo", () => {
    // Caso encontrado por G3 (SEED=290 con SEED=7): 6 → 12 (acotado) → 6 vuelve justo al borde.
    const m = shapeMetrics({ stitchesPer10cm: 15, rowsPer10cm: 43 }, { assumed: false, gaugeStitch: "dc" });
    const part = read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3: dism x6 (6)");
    const p = revolution(partProfile(part, m));
    assert.ok(p.rings[2]!.strain > 1, "la V2 se acota");
    assert.equal(p.rings[3]!.strain, 1);
    assert.equal(p.rings[3]!.radiusCm, (6 * m.stitchWidthCm) / (2 * Math.PI));
    const doc = writtenOf([part], { gauge: { stitchesPer10cm: 15, rowsPer10cm: 43 } });
    // La muestra del documento se lee en pb, así que el validador usa otra s; con assumedGauge en pa, la misma del perfil.
    delete doc.gauge;
    const v = validatePattern(doc, { assumedGauge: { stitchesPer10cm: 15, rowsPer10cm: 43 }, assumedGaugeStitch: "dc" });
    assert.deepEqual(shapeIssues(v.issues).map((i) => [i.code, i.data?.round]), [["ROUND_GROWS_FAST", 2]]);
  });

  it("hileras: panel con fila de ancho n × w a la altura acumulada", () => {
    const p = partProfile(read("Inicio: cad 11\nConstrucción: hileras\nH1: 10 pb (10)\nH2: 10 pa (10)\nH3: 8 pb, saltar 2 (8)"), SC);
    assert.equal(p.kind, "panel");
    if (p.kind !== "panel") return;
    const s = SC.roundHeightCm;
    assert.deepEqual(p.rows.map((r) => [r.row, r.stitches, r.widthCm]), [[1, 10, 5], [2, 10, 5], [3, 8, 4]]);
    assert.deepEqual(p.rows.map((r) => r.heightCm), [s, 2 * s, s]);
    assert.ok(Math.abs(p.rows[2]!.yCm - 4 * s) < EPS);
    assert.ok(Math.abs(p.heightCm - 4 * s) < EPS);
    assert.equal(p.maxWidthCm, 5);
    assert.deepEqual(partDimensions(p), { heightCm: p.heightCm, widthCm: 5 });
  });

  it("borrador: funciona con vueltas que no cuadran y usa el conteo producido", () => {
    const part = read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: 20 pb (20)\nV3: 3 pb (3)");
    const d = writtenOf([part]);
    const v = validatePattern(d);
    assert.equal(v.valid, false);
    assert.equal(v.savable, true);
    const p = revolution(partProfile(part, SC));
    assert.deepEqual(p.rings.map((r) => r.stitches), [0, 6, 20, 3]);
  });
});

describe("F4-36 a F4-41: calibración del disco plano", () => {
  it("F4-36: 6 aumentos por vuelta (6 … 60), ρ = 1,2: plano (Δz = 0), strain 1 y sin ROUND_GROWS_FAST", () => {
    // validar con tejedora: que 6 aumentos de pb queden realmente planos con la tensión de amigurumi.
    const part = disc(6, 6, 10);
    const p = revolution(partProfile(part, SC));
    for (const r of p.rings) {
      assert.equal(r.zCm, 0, `V${r.round}`);
      assert.equal(r.strain, 1);
    }
    assert.deepEqual(shapeIssues(validatePattern(writtenOf([part])).issues), []);
    // Δr/s = (6 / 2π) / (s / w) = 6 × 1,2 / 2π = 1,146.
    const ratio = (6 * 0.5) / (2 * Math.PI) / SC.roundHeightCm;
    assert.equal(Math.round(ratio * 1000) / 1000, 1.146);
  });

  it("F4-37: 7 aumentos por vuelta: ROUND_GROWS_FAST informativo con Δr/s = 1,337 desde la V2", () => {
    const part = disc(7, 7, 6);
    const r = validatePattern(writtenOf([part]));
    assert.equal(r.valid, true, "solo informa");
    const grows = only(r.issues, "ROUND_GROWS_FAST");
    assert.deepEqual(grows.map((i) => i.data?.round), [2, 3, 4, 5, 6]);
    for (const i of grows) assert.equal(i.severity, "info");
    assert.deepEqual(grows[0]!.data, { round: 2, change: 7, ratio: 1.337, tolerance: 1.25 });
    assert.equal(grows[0]!.path, "parts[0].rounds[1]");
    assert.equal(
      grows[0]!.message,
      "Disco, vuelta 2: esta vuelta aumenta más de lo que la tela puede abrir en plano (+7 puntos; una vuelta de pb queda plana con unos 6). Si la tejes así, la pieza tiende a ondularse. Puede ser lo que buscas.",
    );
    // Umbral: con 1,25, el máximo plano es 6,54 puntos por vuelta.
    assert.equal(Math.round(((1.25 * SC.roundHeightCm * 2 * Math.PI) / 0.5) * 100) / 100, 6.54);
  });

  it("F4-38: 12 aumentos por vuelta: ROUND_GROWS_FAST, radio acotado a r(i−1) + 1,25·s y strain > 1", () => {
    const rs: Round[] = [round(1, [{ type: "stitch", stitch: "sc", count: 12 }], 12)];
    for (let k = 2, n = 12; k <= 5; k++, n *= 2) rs.push(round(k, [{ type: "stitch", stitch: "inc", count: n }], 2 * n));
    const part: Part = { id: "o", name: "Volante", construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds: rs };
    const p = revolution(partProfile(part, SC));
    for (let i = 2; i <= 5; i++) {
      assert.ok(Math.abs(p.rings[i]!.radiusCm - p.rings[i - 1]!.radiusCm - 1.25 * SC.roundHeightCm) < EPS, `V${i}`);
      assert.equal(p.rings[i]!.zCm, 0);
      assert.ok(p.rings[i]!.strain > 1);
    }
    const grows = only(validatePattern(writtenOf([part])).issues, "ROUND_GROWS_FAST");
    assert.equal(grows.length, 4);
    assert.equal(grows[0]!.data?.ratio, 2.292);
  });

  it("F4-40: 12 disminuciones sobre 24 avisa ROUND_SHRINKS_FAST; el cierre dism x6 sobre 12 no", () => {
    const fast = read("Parte: Copa\nInicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3: [pb, aum] x6 (18)\nV4: [pb 2, aum] x6 (24)\nV5: dism x12 (12)");
    const r = validatePattern(writtenOf([fast]));
    const shrinks = only(r.issues, "ROUND_SHRINKS_FAST");
    assert.equal(shrinks.length, 1);
    assert.equal(shrinks[0]!.severity, "info");
    assert.equal(shrinks[0]!.data?.round, 5);
    assert.equal(shrinks[0]!.data?.change, -12);
    assert.equal(
      shrinks[0]!.message,
      "Copa, vuelta 5: esta vuelta disminuye más de lo que la pieza puede cerrarse en curva (−12 puntos). Si la tejes así, la pieza se frunce o se cierra en copa. Puede ser lo que buscas (por ejemplo, el remate).",
    );
    const usual = read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3-5: 12 pb (12)\nV6: dism x6 (6)");
    assert.deepEqual(shapeIssues(validatePattern(writtenOf([usual])).issues), []);
  });

  it("F4-41: sensibilidad a ρ (6 aumentos de pb): 0,955, 1,05, 1,146, 1,24, 1,34; avisa desde ρ ≥ 1,31", () => {
    // validar con tejedora: medir ρ en 5 piezas reales (podría estar cerca de 1,05).
    const expected: [number, number][] = [[1.0, 0.955], [1.1, 1.05], [1.2, 1.146], [1.3, 1.24], [1.4, 1.34]];
    for (const [rho, ratio] of expected) {
      const v = validatePattern(writtenOf([disc(6, 6, 4)], { gauge: gaugeRho(rho) }));
      const grows = only(v.issues, "ROUND_GROWS_FAST");
      const actual = (6 * rho) / (2 * Math.PI);
      assert.ok(Math.abs(actual - ratio) < 0.005, `ρ = ${rho}: ${actual}`);
      assert.equal(grows.length > 0, actual > 1.25, `ρ = ${rho}`);
      if (grows.length > 0) assert.equal(grows[0]!.data?.ratio, Math.round(actual * 1000) / 1000);
    }
    assert.equal(only(validatePattern(writtenOf([disc(6, 6, 4)], { gauge: gaugeRho(1.3) })).issues, "ROUND_GROWS_FAST").length, 0);
    assert.ok(only(validatePattern(writtenOf([disc(6, 6, 4)], { gauge: gaugeRho(1.31) })).issues, "ROUND_GROWS_FAST").length > 0);
  });

  it("C-6: la V1 sobre anillo mágico no se evalúa (una V1 de 8 daría Δr/s = 1,53)", () => {
    for (const n of [8, 10, 12]) {
      const part = read(`Inicio: AM\nV1: ${n} pb en AM (${n})\nV2: ${n} pb (${n})`);
      assert.deepEqual(shapeIssues(validatePattern(writtenOf([part])).issues), [], `V1 de ${n}`);
    }
    // Sobre cadeneta en aro sí se evalúa.
    const chain = read("Inicio: cad 6\nV1: aum3 x6 (18)");
    assert.deepEqual(only(validatePattern(writtenOf([chain])).issues, "ROUND_GROWS_FAST").map((i) => i.data?.round), [1]);
  });

  it("con otro punto el texto no da cifra (C-12); en hileras no hay avisos de forma", () => {
    const hdc = read("Parte: Flor\nInicio: AM\nV1: 6 pb en AM (6)\nV2: aum3 x6 (18)\nV3: 18 mpa (18)\nV4: [mpa, aum] x9 (27)");
    const v = only(validatePattern(writtenOf([hdc])).issues, "ROUND_GROWS_FAST");
    assert.equal(v[0]!.data?.round, 2);
    assert.match(v[0]!.message, /unos 6/);
    assert.deepEqual(v.map((i) => i.data?.round), [2, 4], "la V3 mantiene el conteo");
    assert.match(v[1]!.message, /\(\+9 puntos\)\. Si la tejes así/);
    assert.doesNotMatch(v[1]!.message, /unos 6/);
    const flat = read("Inicio: cad 7\nConstrucción: hileras\nH1: 6 pb (6)\nH2: aum3 x6 (18)");
    assert.deepEqual(shapeIssues(validatePattern(writtenOf([flat])).issues), []);
  });

  it("no avisa a una vuelta que mantiene el conteo después de una acotada (+0 puntos)", () => {
    const part = read("Inicio: AM\nV1: 12 pb en AM (12)\nV2: aum x12 (24)\nV3: aum x24 (48)\nV4-6: 48 pb (48)");
    const grows = only(validatePattern(writtenOf([part])).issues, "ROUND_GROWS_FAST");
    assert.deepEqual(grows.map((i) => i.data?.round), [2, 3]);
    // El perfil sí sigue abriéndose en la V4 (acotado), como dice la sección 2.
    const p = revolution(partProfile(part, SC));
    assert.ok(p.rings[4]!.radiusCm > p.rings[3]!.radiusCm);
  });

  it("sin muestra (documento ni opciones) no hay avisos de forma; las opciones solo agregan información", () => {
    const part = disc(7, 7, 4);
    const doc = writtenOf([part]);
    delete doc.gauge;
    assert.deepEqual(shapeIssues(validatePattern(doc).issues), []);
    const opts: ValidateOptions[] = [
      { weightCat: 4 },
      { weightCat: 0 },
      { assumedGauge: FIXTURE_GAUGE },
      { assumedGauge: { stitchesPer10cm: 37, rowsPer10cm: 22 }, assumedGaugeStitch: "dc" },
    ];
    const base = validatePattern(doc);
    for (const o of opts) {
      const r = validatePattern(doc, o);
      assert.ok(shapeIssues(r.issues).length > 0, JSON.stringify(o));
      assert.equal(r.valid, base.valid);
      assert.deepEqual(r.issues.filter((i) => i.severity !== "info"), base.issues.filter((i) => i.severity !== "info"));
    }
    // weightCat 0 se lee en pa, como assumedGauge de la categoría 0 con "dc".
    const cat0 = shapeIssues(validatePattern(doc, { weightCat: 0 }).issues);
    const viaGauge = shapeIssues(validatePattern(doc, { assumedGauge: { stitchesPer10cm: 37, rowsPer10cm: 22 }, assumedGaugeStitch: "dc" }).issues);
    assert.deepEqual(cat0, viaGauge);
    // La muestra del documento manda sobre las opciones.
    assert.deepEqual(shapeIssues(validatePattern(writtenOf([part]), { weightCat: 7 }).issues), shapeIssues(validatePattern(writtenOf([part])).issues));
  });
});

describe("Fixtures A y B: forma (F4-46, F4-47, F4-50, F4-51)", () => {
  const a = () => revolution(partProfile(fixtureAPart(), SC));
  const b = () => revolution(partProfile(fixtureBPart(), SC));

  it("F4-46: fixture A es un tambor de tapas planas: diámetro 9,55 cm y alto ≈ 8,33 cm (razón ≈ 0,87)", () => {
    const p = a();
    const d = partDimensions(p);
    assert.ok(Math.abs(d.widthCm - (60 * 0.5) / Math.PI) < EPS);
    assert.equal(Math.round(d.widthCm * 100) / 100, 9.55);
    assert.ok(Math.abs(d.heightCm - 20 * (10 / 24)) < EPS, `alto ${d.heightCm}`);
    assert.equal(Math.round(d.heightCm * 100) / 100, 8.33);
    assert.equal(Math.round((d.heightCm / d.widthCm) * 100) / 100, 0.87);
    // V1 a V10 y V31 a V39 planas; la meseta sube s por vuelta.
    for (const r of p.rings) {
      if (r.round <= 10) assert.equal(r.zCm, 0, `V${r.round}`);
      if (r.round >= 31) assert.ok(Math.abs(r.zCm - d.heightCm) < EPS, `V${r.round}`);
    }
  });

  it("F4-47: strain = 1 en todos los anillos del fixture A y ningún ROUND_GROWS_FAST ni ROUND_SHRINKS_FAST", () => {
    for (const r of a().rings) assert.equal(r.strain, 1, `V${r.round}`);
    assert.deepEqual(validatePattern(writtenOf([fixtureAPart()])).issues, []);
  });

  it("F4-50: fixture B es una esfera aproximada: diámetro 9,55 cm, alto ≈ 10,1 cm, alto/diámetro entre 0,95 y 1,15", () => {
    // validar con tejedora: que una pieza real con estos conteos, rellena, sea redonda.
    const p = b();
    const d = partDimensions(p);
    assert.equal(Math.round(d.widthCm * 100) / 100, 9.55);
    assert.ok(Math.abs(d.heightCm - 10.1) <= 0.1, `alto ${d.heightCm}`);
    const ratio = d.heightCm / d.widthCm;
    assert.ok(ratio >= 0.95 && ratio <= 1.15, `razón ${ratio}`);
    for (const r of p.rings) assert.equal(r.strain, 1, `V${r.round}`);
    assert.deepEqual(validatePattern(writtenOf([fixtureBPart()])).issues, []);
  });

  it("F4-51: la razón alto/diámetro de B es mayor que la de A con la misma circunferencia máxima", () => {
    const [da, db] = [partDimensions(a()), partDimensions(b())];
    assert.equal(da.widthCm, db.widthCm);
    assert.ok(db.heightCm / db.widthCm > da.heightCm / da.widthCm);
    assert.ok(db.heightCm > 9.9 && da.heightCm < 8.5, `${db.heightCm} frente a ${da.heightCm}`);
  });

  it("los dos cierran arriba y abajo hasta el anillo de 6", () => {
    for (const p of [a(), b()]) {
      assert.equal(p.rings[0]!.radiusCm, 0);
      assert.equal(p.rings[1]!.stitches, 6);
      assert.equal(p.rings.at(-1)!.stitches, 6);
      assert.ok(Math.abs(p.rings.at(-1)!.radiusCm - 3 / (2 * Math.PI)) < EPS);
    }
  });

  it("guardia de rendimiento: concreteRounds y partProfile del fixture A en menos de 3 ms (presupuesto del ADR 0010, sección 6)", () => {
    const part = fixtureAPart();
    for (let i = 0; i < 20; i++) partProfile(part, SC); // calentamiento
    const runs = 200;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      concreteRounds(part);
      partProfile(part, SC);
    }
    const avg = (performance.now() - t0) / runs;
    assert.ok(avg < 3, `promedio ${avg.toFixed(3)} ms`);
  });
});

// ------------------------------------------------------------------ Propiedades

/** Muestra al azar razonable: 6 a 40 puntos y 5 a 50 vueltas en 10 cm, en cualquier punto. */
function genMetrics(r: Rng) {
  const g = { stitchesPer10cm: r.int(6, 40), rowsPer10cm: r.int(5, 50) };
  return shapeMetrics(g, { assumed: r.bool(), gaugeStitch: r.pick(["sc", "hdc", "dc", "tr"] as const) });
}

describe("Propiedades G1, G2, G3, G10 y G11 (parte del perfil)", () => {
  const gen = (r: Rng) => ({ doc: genWrittenV2(r), metrics: genMetrics(r) });

  it("G1: un anillo por vuelta concreta más el inicio (o una fila por hilera) con el conteo del motor", () => {
    forAll("G1", gen, ({ doc, metrics }) => {
      for (const part of doc.parts) {
        const concrete = concreteRounds(part);
        const p = partProfile(part, metrics);
        if (p.kind === "revolution") {
          assert.equal(p.rings.length, concrete.length + 1);
          concrete.forEach((c, i) => {
            assert.equal(p.rings[i + 1]!.stitches, c.count.produced);
            assert.equal(p.rings[i + 1]!.round, c.number);
          });
          assert.equal(p.spiral, part.construction === "spiral");
        } else {
          assert.equal(part.construction, "flat");
          assert.equal(p.rows.length, concrete.length);
          concrete.forEach((c, i) => assert.equal(p.rows[i]!.stitches, c.count.produced));
        }
      }
    });
  });

  it("G2: zCm no decreciente, radiusCm ≥ 0 y, con anillo mágico, rings[0].radiusCm === 0", () => {
    forAll("G2", gen, ({ doc, metrics }) => {
      for (const part of doc.parts) {
        const p = partProfile(part, metrics);
        if (p.kind !== "revolution") {
          for (let i = 1; i < p.rows.length; i++) assert.ok(p.rows[i]!.yCm >= p.rows[i - 1]!.yCm);
          continue;
        }
        for (let i = 0; i < p.rings.length; i++) {
          assert.ok(p.rings[i]!.radiusCm >= 0);
          if (i > 0) assert.ok(p.rings[i]!.zCm >= p.rings[i - 1]!.zCm);
        }
        if (part.start.type === "magic_ring") assert.equal(p.rings[0]!.radiusCm, 0);
      }
    });
  });

  it("G3: los tres tramos del paso radial; la V1 sobre anillo mágico no se acota", () => {
    const tol = PROFILE_RADIAL_TOLERANCE;
    forAll("G3", gen, ({ doc, metrics }) => {
      for (const part of doc.parts) {
        const profile = partProfile(part, metrics);
        if (profile.kind !== "revolution") continue;
        const rings: ProfileRing[] = profile.rings;
        for (let i = 1; i < rings.length; i++) {
          const prev: ProfileRing = rings[i - 1]!;
          const ring: ProfileRing = rings[i]!;
          const s = ring.heightCm;
          const target = (ring.stitches * metrics.stitchWidthCm) / (2 * Math.PI);
          const dz: number = ring.zCm - prev.zCm;
          if (i === 1 && part.start.type === "magic_ring") {
            assert.ok(Math.abs(ring.radiusCm - target) < EPS);
            assert.ok(Math.abs(dz - Math.sqrt(Math.max(s * s - target * target, 0))) < EPS);
            assert.equal(ring.strain, 1);
            continue;
          }
          const dr = target - prev.radiusCm;
          if (Math.abs(dr) <= s) {
            assert.ok(Math.abs(Math.hypot(ring.radiusCm - prev.radiusCm, dz) - s) < EPS, `V${ring.round}: distancia sobre el meridiano`);
            assert.equal(ring.strain, 1);
          } else if (Math.abs(dr) - s * tol <= 1e-9 * s * tol) {
            // Segundo tramo (con el margen relativo de redondeo del perfil en el borde).
            assert.equal(dz, 0);
            assert.equal(ring.radiusCm, target);
            assert.equal(ring.strain, 1);
          } else {
            assert.equal(dz, 0);
            const clampedToZero = ring.radiusCm === 0;
            assert.ok(clampedToZero || Math.abs(Math.abs(ring.radiusCm - prev.radiusCm) - s * tol) < EPS);
            assert.notEqual(ring.strain, 1);
          }
        }
      }
    });
  });

  it("G10: no lanza con documentos savable y no hay NaN ni infinitos", () => {
    forAll("G10", gen, ({ doc, metrics }) => {
      if (!validatePattern(doc).savable) return;
      for (const part of doc.parts) {
        const p = partProfile(part, metrics);
        const nums = p.kind === "revolution" ? p.rings.flatMap((r) => [r.radiusCm, r.zCm, r.heightCm, r.strain]) : p.rows.flatMap((r) => [r.widthCm, r.yCm, r.heightCm]);
        nums.push(...Object.values(partDimensions(p)));
        for (const n of nums) assert.ok(Number.isFinite(n), String(n));
      }
    });
  });

  it("G11 (perfil): partDimensions es el alto final y el diámetro (o ancho) máximo del perfil", () => {
    forAll("G11", gen, ({ doc, metrics }) => {
      for (const part of doc.parts) {
        const p = partProfile(part, metrics);
        const d = partDimensions(p);
        if (p.kind === "revolution") {
          assert.equal(d.heightCm, p.rings.at(-1)!.zCm);
          assert.equal(d.widthCm, 2 * Math.max(...p.rings.map((r) => r.radiusCm)));
        } else {
          assert.equal(d.heightCm, p.rows.reduce((s, r) => s + r.heightCm, 0) || 0);
          assert.ok(Math.abs(d.heightCm - (p.rows.at(-1)?.yCm ?? 0)) < EPS);
          assert.equal(d.widthCm, Math.max(0, ...p.rows.map((r) => r.widthCm)));
        }
      }
    });
  });

  it("los avisos de forma salen justo donde el perfil acota el radio (strain ≠ 1) y la vuelta cambia el conteo en ese sentido", () => {
    forAll("avisos = acotado", (r) => genWrittenV2(r), (doc) => {
      const withGauge = { ...doc, gauge: { ...FIXTURE_GAUGE } };
      const v = validatePattern(withGauge);
      if (!v.savable) return;
      const issues = shapeIssues(v.issues);
      doc.parts.forEach((part, pi) => {
        const mine = issues.filter((i) => i.path.startsWith(`parts[${pi}].`));
        if (part.construction === "flat") return assert.deepEqual(mine, []);
        const p = revolution(partProfile(part, SC));
        const concrete = concreteRounds(part);
        const expected: string[] = [];
        const seen = new Set<number>();
        for (let i = 1; i < p.rings.length; i++) {
          const c = concrete[i - 1]!;
          const ring = p.rings[i]!;
          // Evaluado y acotado ⟺ strain ≠ 1 (la V1 sobre anillo mágico siempre da 1).
          if (seen.has(c.sourceIndex) || ring.strain === 1) continue;
          const change = ring.stitches - p.rings[i - 1]!.stitches;
          if (change > 0 && ring.strain > 1) expected.push(`G${c.number}`);
          else if (change < 0 && ring.strain < 1) expected.push(`S${c.number}`);
          else continue;
          seen.add(c.sourceIndex);
        }
        assert.deepEqual(mine.map((i) => `${i.code === "ROUND_GROWS_FAST" ? "G" : "S"}${i.data?.round}`), expected);
        for (const i of mine) assert.equal(i.severity, "info");
      });
    }, 200);
  });

  it("las opciones no cambian errores ni advertencias, solo la información (invariante E10)", () => {
    forAll("opciones", (r) => ({ doc: genWrittenV2(r), cat: r.int(0, 7) }), ({ doc, cat }) => {
      const base = validatePattern(doc);
      const r = validatePattern(doc, { weightCat: cat as WeightCategory });
      assert.equal(r.valid, base.valid);
      assert.equal(r.savable, base.savable);
      assert.deepEqual(r.issues.filter((i) => i.severity !== "info"), base.issues.filter((i) => i.severity !== "info"));
    }, 150);
  });
});

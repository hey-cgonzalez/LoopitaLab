/**
 * Topes de la revisión de seguridad T20 (fase 4; enmiendas T20-x del ADR 0011):
 *
 * - T20-A1: trabajo de expansión por vuelta (`LIMITS.maxRoundStitches`) y por documento
 *   (`LIMITS.maxExpansionWork`), calculado de forma aritmética; `walk` recorre una sola vez
 *   un grupo sin puntos.
 * - T20-M1: cada vuelta escrita se cuenta a lo más dos veces (validador y `concreteRounds`).
 * - Hueco 1 (T20-B1, B2): `expected` y `start.count` hasta `LIMITS.maxRoundStitches`.
 * - Hueco 2 (T20-B3): `LIMITS.maxRoundItems` nodos por vuelta y el texto canónico de la parte
 *   hasta `PARSE_LIMITS.maxTextLength` (`formattedPartLength`).
 * - Hueco 3 (T20-B4): los textos de `layout` entran en el tope de 20 por código.
 * - T20-B5: tope de 20 por código y por parte en los ítems, con `data.omitted`.
 * - Guardia de tiempos: los documentos hostiles de la revisión se validan y perfilan en < 50 ms.
 *
 * Semilla: `SEED=… node --test test/t20-topes.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIALECTS,
  LIMITS,
  PARSE_LIMITS,
  concreteRounds,
  countRound,
  exceedsExpansionLimits,
  expandRound,
  formatPart,
  formattedPartLength,
  insertItem,
  normalizePart,
  parsePart,
  partExpansionWork,
  partProfile,
  readingModeFor,
  replaceRound,
  roundExpansionWork,
  shapeMetrics,
  validatePattern,
  type ExpandedStitch,
  type Issue,
  type Item,
  type Part,
  type Round,
  type StitchCode,
  type WrittenPattern,
} from "../src/index.ts";
import { STITCHES } from "../src/stitches.ts";
import { hostileDocuments } from "./support/hostile.ts";
import { forAll, type Rng } from "./support/property.ts";

// ------------------------------------------------------------ Ayudas

const yarn = (id: string) => ({ id, weight: 4 as const, composition: [{ fiber: "wool", percent: 100 }], color: { hex: "#ff0000" } });
const Y16 = "Y".repeat(16);

function doc(parts: Part[], extra: Partial<WrittenPattern> = {}): WrittenPattern {
  return {
    schemaVersion: 2,
    id: "x",
    title: "t",
    technique: "crochet",
    kind: "written",
    origin: { kind: "manual" },
    yarns: [yarn("A"), yarn("B"), yarn(Y16)],
    parts,
    ...extra,
  } as WrittenPattern;
}

const part = (rounds: Round[], extra: Partial<Part> = {}): Part => ({ id: "p", name: "p", construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds, ...extra }) as Part;
const sc = (count: number): Item => ({ type: "stitch", stitch: "sc", count });
const color = (y: string): Item => ({ type: "color", yarn: y });
const group = (times: number, items: Item[]): Item => ({ type: "group", times, items });
const V1: Round = { number: 1, items: [sc(6)] };

/** Grupo de solo color anidado `depth` veces con `times` repeticiones por nivel. */
function colorBomb(times: number, depth: number): Item {
  let g: Item = color("A");
  for (let i = 0; i < depth; i++) g = group(times, [g]);
  return g;
}

const limitsOf = (issues: Issue[], limit: string) => issues.filter((i) => i.code === "LIMIT" && i.data?.limit === limit);
const errors = (issues: Issue[]) => issues.filter((i) => i.severity === "error");

/** Mejor de `runs` corridas (después de una de calentamiento), en ms. */
function best(fn: () => unknown, runs = 3): number {
  fn();
  let min = Infinity;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    fn();
    min = Math.min(min, performance.now() - t);
  }
  return min;
}

/**
 * Presupuesto de la guardia de tiempos (T20): 50 ms, el criterio de la revisión, medido como la
 * mejor de 3 corridas después de calentar. En CI (variable `CI`) se dobla, como el factor de
 * CA4-P6, para que un runner lento no dé falsos negativos (T20-I5); `T20_TIME_FACTOR` lo ajusta.
 */
const BUDGET_MS = 50 * Number(process.env.T20_TIME_FACTOR ?? (process.env.CI ? 2 : 1));

// Referencias ingenuas, sin atajos: repiten cada grupo `times` veces.
function naiveExpand(items: Item[], start: string): { stitches: ExpandedStitch[]; endYarn: string } {
  const stitches: ExpandedStitch[] = [];
  const go = (list: Item[], y: string): string => {
    let cur = y;
    for (const it of list) {
      if (it.type === "color") cur = it.yarn;
      else if (it.type === "stitch") for (let i = 0; i < it.count; i++) stitches.push({ stitch: it.stitch, yarn: cur, loop: it.loop ?? "both" });
      else for (let i = 0; i < it.times; i++) cur = go(it.items, cur);
    }
    return cur;
  };
  const endYarn = go(items, start);
  return { stitches, endYarn };
}

function naiveVisits(items: Item[]): number {
  let n = 0;
  for (const it of items) {
    n++;
    if (it.type === "group") for (let i = 0; i < it.times; i++) n += naiveVisits(it.items);
  }
  return n;
}

function nodesOf(items: Item[]): number {
  let n = 0;
  for (const it of items) n += 1 + (it.type === "group" ? nodesOf(it.items) : 0);
  return n;
}

const CODES = Object.keys(STITCHES) as StitchCode[];
const YARNS = ["A", "B", Y16];

/** Ítems al azar con muchos grupos de solo color (también anidados) y repeticiones chicas. */
function genItems(r: Rng, depth: number, colorOnly = false): Item[] {
  const n = r.int(1, 4);
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const roll = r.next();
    if (colorOnly || roll < 0.25) items.push(color(r.pick(YARNS)));
    else if (roll < 0.55 && depth < LIMITS.maxNesting - 1) items.push(group(r.int(1, 5), genItems(r, depth + 1, r.bool(0.4))));
    else {
      const it: Item = { type: "stitch", stitch: r.pick(CODES), count: r.int(1, 9) };
      if (r.bool(0.2)) it.loop = r.pick(["front", "back"] as const);
      items.push(it);
    }
  }
  if (colorOnly && depth < LIMITS.maxNesting - 1 && r.bool(0.5)) items.push(group(r.int(1, 5), genItems(r, depth + 1, true)));
  return items;
}

function genPart(r: Rng): Part {
  const rounds: Round[] = [];
  let n = 1;
  const k = r.int(1, 5);
  for (let i = 0; i < k; i++) {
    const round: Round = { number: n, items: genItems(r, 1) };
    if (r.bool(0.3)) round.through = n + r.int(1, 4);
    if (r.bool(0.5)) round.expected = r.int(0, LIMITS.maxRoundStitches);
    if (r.bool(0.3)) round.note = r.pick(["Coloca un marcador.", "línea 1\nlínea 2", "\nñandú  \n\n", "emoji 🧶 y más"]);
    rounds.push(round);
    n = (round.through ?? n) + 1;
  }
  const construction = r.pick(["spiral", "joined", "flat"] as const);
  const p: Part = {
    id: "p",
    name: r.pick(["Cuerpo", "Oreja izquierda", "Ñ", "  con espacios  "]),
    construction,
    start: r.bool(0.5) ? { type: "magic_ring" } : { type: "chain", count: r.int(2, LIMITS.maxRoundStitches) },
    startYarn: r.pick(YARNS),
    rounds,
  };
  if (r.bool(0.3)) p.copies = r.int(1, LIMITS.maxCopies);
  if (r.bool(0.3)) p.finish = r.pick(["rellenar y cerrar", "Rellenar.\nCerrar con la hebra.", "  "]);
  return p;
}

// ------------------------------------------------------------ T20-A1

describe("T20-A1: tope del trabajo de expansión", () => {
  it("la bomba de la revisión (5 grupos de solo color x500) es LIMIT estructural, no valid", () => {
    const d = doc([part([V1, { number: 2, items: [colorBomb(500, 5), sc(6)] }])]);
    const r = validatePattern(d);
    assert.equal(r.savable, false);
    const [limit, ...rest] = limitsOf(r.issues, "maxRoundWork");
    assert.equal(rest.length, 0);
    assert.equal(limit?.path, "parts[0].rounds[1]");
    assert.equal(limit?.data?.work, roundExpansionWork({ number: 2, items: [colorBomb(500, 5), sc(6)] }));
    assert.match(limit?.message ?? "", /vuelta 2: los grupos \[ … \] xN anidados se despliegan en demasiados pasos/);
    // La vuelta que pasa su tope ya tiene su LIMIT: no suma también al del documento.
    assert.deepEqual(limitsOf(r.issues, "maxExpansionWork"), []);
  });

  it("el trabajo de una vuelta es Σ sobre los nodos del producto de los times que los envuelven", () => {
    assert.equal(roundExpansionWork({ number: 1, items: [sc(6)] }), 1);
    assert.equal(roundExpansionWork({ number: 1, items: [group(6, [sc(1), { type: "stitch", stitch: "inc", count: 1 }])] }), 1 + 12);
    // 5 grupos (1, 500, 500², 500³ y 500⁴ pasadas), el color (500⁵) y el punto (1).
    assert.equal(roundExpansionWork({ number: 1, items: [colorBomb(500, 5), sc(6)] }), 1 + 500 + 500 ** 2 + 500 ** 3 + 500 ** 4 + 500 ** 5 + 1);
    // Datos sin validar: nunca lanza ni recorre sin tope.
    assert.equal(roundExpansionWork({ number: 1, items: [{ type: "group", times: 0, items: [sc(1)] }] } as Round), Infinity);
    const cyc = { type: "group", times: 2, items: [] as unknown[] };
    cyc.items.push(cyc);
    assert.equal(roundExpansionWork({ number: 1, items: [cyc] } as unknown as Round), Infinity);
  });

  it(`en el borde: una vuelta con trabajo ${LIMITS.maxRoundStitches} es valid; con uno más, LIMIT`, () => {
    // [[@A] x b] x a, 6 pb: 2 + a + a·b nodos visitados.
    const round = (a: number, b: number): Round => ({ number: 2, items: [group(a, [group(b, [color("A")])]), sc(6)] });
    const pad = (n: number): Item[] => Array.from({ length: n }, () => color("A"));
    // 2 + 100 + 100 · 498 = 49.902; faltan 98 para el tope.
    const base = round(100, 498);
    assert.equal(roundExpansionWork(base), 49_902);
    const edge: Round = { number: 2, items: [group(2, pad(49)), ...base.items] }; // + 1 + 98 = 50.001
    assert.equal(roundExpansionWork(edge), 50_001);
    const ok: Round = { number: 2, items: [group(2, pad(48)), color("A"), ...base.items] }; // + 1 + 96 + 1 = 50.000
    assert.equal(roundExpansionWork(ok), LIMITS.maxRoundStitches);
    const rOk = validatePattern(doc([part([V1, ok])]));
    assert.equal(rOk.valid, true, JSON.stringify(errors(rOk.issues)));
    const rOver = validatePattern(doc([part([V1, edge])]));
    assert.equal(limitsOf(rOver.issues, "maxRoundWork").length, 1);
    assert.equal(rOver.savable, false);
  });

  it(`en el borde: un documento con trabajo ${LIMITS.maxExpansionWork} es valid; con uno más, LIMIT en "parts"`, () => {
    // V2-1000: [[@A] x49] x40, 6 pb → 2 + 40 + 1.960 = 2.002 por vuelta, por 999 vueltas = 1.999.998.
    const v2: Round = { number: 2, through: 1000, items: [group(40, [group(49, [color("A")])]), sc(6)] };
    assert.equal(roundExpansionWork(v2), 2002);
    const atEdge = doc([part([{ number: 1, items: [color("A"), sc(6)] }, v2])]);
    assert.equal(partExpansionWork(atEdge.parts[0]!), LIMITS.maxExpansionWork);
    const r = validatePattern(atEdge);
    assert.equal(r.valid, true, JSON.stringify(errors(r.issues)));
    assert.equal(exceedsExpansionLimits(atEdge.parts[0]!), false);

    const over = doc([part([{ number: 1, items: [color("A"), color("A"), sc(6)] }, v2])]);
    const ro = validatePattern(over);
    const [limit, ...rest] = limitsOf(ro.issues, "maxExpansionWork");
    assert.equal(rest.length, 0);
    assert.equal(limit?.path, "parts");
    assert.deepEqual(limit?.data, { work: LIMITS.maxExpansionWork + 1, max: LIMITS.maxExpansionWork, limit: "maxExpansionWork" });
    assert.equal(ro.savable, false);
    assert.equal(exceedsExpansionLimits(over.parts[0]!), true);
  });

  it("el tope del documento suma las partes (las copias no suman: comparten malla)", () => {
    const v2: Round = { number: 2, through: 1000, items: [group(40, [group(49, [color("A")])]), sc(6)] };
    const half = (id: string): Part => ({ ...part([V1, { ...v2, through: 500 }]), id, name: id, copies: 10 });
    // 2 partes × (1 + 499 × 2.002) = 1.998.000: valid. Una tercera lo pasa.
    assert.equal(validatePattern(doc([half("a"), half("b")])).valid, true);
    const r = validatePattern(doc([half("a"), half("b"), half("c")]));
    assert.equal(limitsOf(r.issues, "maxExpansionWork").length, 1);
  });

  it("expandRound recorre una sola vez un grupo sin puntos (la bomba se expande al instante)", () => {
    const round: Round = { number: 2, items: [colorBomb(500, 5), sc(6)] };
    const t = performance.now();
    const e = expandRound(round, "B");
    assert.ok(performance.now() - t < 50);
    assert.deepEqual(e, { stitches: Array.from({ length: 6 }, () => ({ stitch: "sc", yarn: "A", loop: "both" })), endYarn: "A" });
    assert.deepEqual(countRound(round, "B"), { consumed: 6, produced: 6, producedByYarn: { A: 6 }, endYarn: "A" });
  });

  it("propiedad: con grupos de solo color, expandRound y countRound coinciden con la expansión ingenua", () => {
    let colorOnly = 0;
    forAll("T20-A1 expandRound", (r) => genItems(r, 1), (items) => {
      if (JSON.stringify(items).includes('"items":[{"type":"color"')) colorOnly++;
      const start = "B";
      const round: Round = { number: 1, items };
      const naive = naiveExpand(items, start);
      const e = expandRound(round, start);
      assert.deepEqual(e, naive);
      const byYarn: Record<string, number> = {};
      let consumed = 0;
      let produced = 0;
      for (const s of naive.stitches) {
        consumed += STITCHES[s.stitch].consumes;
        const p = STITCHES[s.stitch].produces;
        produced += p;
        if (p > 0) byYarn[s.yarn] = (byYarn[s.yarn] ?? 0) + p;
      }
      assert.deepEqual(countRound(round, start), { consumed, produced, producedByYarn: byYarn, endYarn: naive.endYarn });
      assert.equal(roundExpansionWork(round), naiveVisits(items), "trabajo aritmético = nodos que recorre la expansión ingenua");
    }, 400);
    assert.ok(colorOnly > 50, `${colorOnly} casos con grupos de solo color`);
  });

  it("propiedad: el validador da LIMIT de trabajo exactamente cuando la expansión ingenua pasa el tope", () => {
    forAll("T20-A1 validador", (r) => {
      // Un nivel con times grande para cruzar el tope a veces.
      const inner = genItems(r, 2, r.bool(0.5));
      return { times: r.int(1, LIMITS.maxGroupTimes), inner, outer: r.int(1, 200) };
    }, ({ times, inner, outer }) => {
      const items = [group(outer, [group(times, inner)]), sc(1)];
      if (nodesOf(items) > LIMITS.maxRoundItems) return;
      // Grupo de afuera (1), el de adentro (outer), su contenido (outer · times · visitas de una pasada) y el punto (1).
      const work = 1 + outer + outer * times * naiveVisits(inner) + 1;
      assert.equal(roundExpansionWork({ number: 1, items }), work);
      const r = validatePattern(doc([part([{ number: 1, items }])]));
      const limit = r.issues.some((i) => i.code === "LIMIT" && i.path === "parts[0].rounds[0]");
      const count = countRound({ number: 1, items }, "A");
      const over = count.produced > LIMITS.maxRoundStitches || count.consumed > LIMITS.maxRoundStitches || work > LIMITS.maxRoundStitches;
      assert.equal(limit, over);
    }, 300);
  });
});

// ------------------------------------------------------------ T20-M1

describe("T20-M1: cada vuelta escrita se cuenta a lo más dos veces", () => {
  it("propiedad: concreteRounds coincide con contar cada vuelta concreta desde cero", () => {
    forAll("T20-M1 concreteRounds", genPart, (p) => {
      const got = concreteRounds(p);
      let y = p.startYarn;
      const want: unknown[] = [];
      p.rounds.forEach((round, sourceIndex) => {
        for (let n = round.number; n <= (round.through ?? round.number); n++) {
          const count = countRound(round, y);
          want.push({ number: n, sourceIndex, round, startYarn: y, count });
          y = count.endYarn;
        }
      });
      assert.deepEqual(got, want);
    }, 300);
  });

  it("las vueltas de un rango que empiezan con la misma lana comparten el conteo (solo lectura)", () => {
    // V2 empieza en A y termina en B; V3 a V6 empiezan en B: un conteo para V2 y otro para el resto.
    const p = part([V1, { number: 2, through: 6, items: [color("B"), sc(6)] }]);
    const c = concreteRounds(p);
    assert.equal(c.length, 6);
    assert.deepEqual(c.map((x) => x.startYarn), ["A", "A", "B", "B", "B", "B"]);
    assert.notEqual(c[2]!.count, c[1]!.count);
    for (const k of [3, 4, 5]) assert.equal(c[k]!.count, c[2]!.count);
    assert.deepEqual(c[2]!.count, countRound(p.rounds[1]!, "B"));
  });
});

// ------------------------------------------------------------ Hueco 1

describe("Hueco 1 (T20-B1, B2): expected y start.count hasta maxRoundStitches", () => {
  it(`expected ${LIMITS.maxRoundStitches} es un desajuste de tejido; ${LIMITS.maxRoundStitches + 1} y 1e20 son LIMIT`, () => {
    const at = validatePattern(doc([part([{ ...V1, expected: LIMITS.maxRoundStitches }])]));
    assert.equal(at.savable, true);
    assert.ok(at.issues.some((i) => i.code === "ROUND_COUNT_MISMATCH"));
    for (const expected of [LIMITS.maxRoundStitches + 1, 1e20, Number.MAX_SAFE_INTEGER * 4]) {
      const r = validatePattern(doc([part([{ ...V1, expected }])]));
      assert.equal(r.savable, false, String(expected));
      const [limit] = limitsOf(r.issues, "maxRoundStitches");
      assert.equal(limit?.path, "parts[0].rounds[0].expected");
      assert.match(limit?.message ?? "", /el conteo declarado .* pasa el máximo de 50\.000 puntos por vuelta/);
      assert.ok(!r.issues.some((i) => i.code === "ROUND_COUNT_MISMATCH"), "no se compara un conteo que nunca cuadra");
    }
  });

  it(`start.count ${LIMITS.maxRoundStitches} se acepta; ${LIMITS.maxRoundStitches + 1} y 1e300 son LIMIT (ya no valid)`, () => {
    const at = validatePattern(doc([part([V1], { start: { type: "chain", count: LIMITS.maxRoundStitches } })]));
    assert.equal(at.savable, true);
    for (const count of [LIMITS.maxRoundStitches + 1, 1e300]) {
      const r = validatePattern(doc([part([V1], { start: { type: "chain", count } })]));
      assert.equal(r.valid, false);
      assert.equal(r.savable, false);
      const [limit] = limitsOf(r.issues, "maxRoundStitches");
      assert.equal(limit?.path, "parts[0].start.count");
      assert.match(limit?.message ?? "", /la cadeneta inicial puede tener hasta 50\.000 cadenetas/);
    }
  });

  it("RT1 en el borde: expected y cadeneta de 50.000 hacen la ida y vuelta en los tres dialectos", () => {
    const p = normalizePart(part([{ number: 1, items: [sc(5000)], expected: LIMITS.maxRoundStitches }], { construction: "joined", start: { type: "chain", count: LIMITS.maxRoundStitches } }));
    assert.equal(validatePattern(doc([p])).savable, true);
    for (const d of DIALECTS) {
      const back = parsePart(formatPart(p, d), { id: p.id, mode: readingModeFor(d) });
      assert.ok(back.ok, d);
      assert.deepEqual(back.value, p, d);
    }
  });
});

// ------------------------------------------------------------ Hueco 2

/**
 * La peor vuelta `savable` para el largo de la línea: nodos que alternan "1000 saltar ht" (mide
 * lo mismo que el "5000 saltar ht" de la revisión, pero 50 × 1.000 trabaja justo el tope) y un
 * cambio a una lana de 16 caracteres.
 */
const worst = (n: number): Item[] => Array.from({ length: n }, (_, i) => (i % 2 ? color(Y16) : { type: "stitch", stitch: "sk", count: 1000, loop: "back" }));

describe("Hueco 2 (T20-B3): nodos por vuelta y texto por parte", () => {
  it(`${LIMITS.maxRoundItems} nodos se aceptan (en todos los niveles); ${LIMITS.maxRoundItems + 1} son LIMIT`, () => {
    const flat = (n: number): Round => ({ number: 1, items: [...Array.from({ length: n - 1 }, () => color("A")), sc(6)] });
    assert.ok(!limitsOf(validatePattern(doc([part([flat(LIMITS.maxRoundItems)])])).issues, "maxRoundItems").length);
    const r = validatePattern(doc([part([flat(LIMITS.maxRoundItems + 1)])]));
    const [limit] = limitsOf(r.issues, "maxRoundItems");
    assert.equal(limit?.path, "parts[0].rounds[0]");
    assert.deepEqual(limit?.data, { nodes: LIMITS.maxRoundItems + 1, max: LIMITS.maxRoundItems, limit: "maxRoundItems" });
    assert.match(limit?.message ?? "", /tiene demasiados elementos \(101\); una vuelta puede tener hasta 100 entre puntos, cambios de lana y grupos/);
    assert.equal(r.savable, false);
    // Grupos y su contenido cuentan: 1 grupo con 99 ítems y 1 punto = 101.
    const nested: Round = { number: 1, items: [group(1, Array.from({ length: LIMITS.maxRoundItems - 1 }, () => color("A"))), sc(6)] };
    assert.equal(limitsOf(validatePattern(doc([part([nested])])).issues, "maxRoundItems").length, 1);
  });

  it("RT1 en el borde: la peor vuelta de 100 nodos cabe en una línea y hace la ida y vuelta", () => {
    const p = normalizePart(part([{ number: 1, items: [sc(6)] }, { number: 2, through: 3, items: worst(LIMITS.maxRoundItems), expected: LIMITS.maxRoundStitches }]));
    const v = validatePattern(doc([p]));
    assert.ok(!v.issues.some((i) => i.code === "LIMIT"), JSON.stringify(v.issues.filter((i) => i.code === "LIMIT")));
    assert.equal(v.savable, true);
    for (const d of DIALECTS) {
      const text = formatPart(p, d);
      assert.ok(Math.max(...text.split("\n").map((l) => l.length)) <= PARSE_LIMITS.maxLineLength, d);
      const back = parsePart(text, { id: p.id, mode: readingModeFor(d) });
      assert.ok(back.ok, `${d}: ${back.ok ? "" : back.issues[0]?.code}`);
      assert.deepEqual(back.value, p, d);
    }
  });

  it("propiedad: formattedPartLength es el largo exacto de formatPart en cada dialecto, y sin dialecto el mayor", () => {
    forAll("T20 formattedPartLength", genPart, (p) => {
      let max = 0;
      for (const d of DIALECTS) {
        const len = formatPart(p, d).length;
        assert.equal(formattedPartLength(p, d), len, d);
        max = Math.max(max, len);
      }
      assert.equal(formattedPartLength(p), max);
    }, 300);
  });

  it(`texto de la parte: hasta ${PARSE_LIMITS.maxTextLength} caracteres se acepta y se relee; uno más es LIMIT`, () => {
    // Vueltas de 6 pb con notas de 500; la nota de la última se ajusta para que el texto mida
    // exactamente `target` (cada carácter de la nota suma uno al texto).
    const build = (target: number): Part => {
      const rounds: Round[] = [];
      for (let n = 1; ; n++) {
        rounds.push({ number: n, items: [sc(6)], note: "n" });
        const missing = target - formattedPartLength(part(rounds));
        if (missing < LIMITS.maxRoundNoteLength) {
          rounds[n - 1]!.note = "n".repeat(1 + missing);
          return part(rounds);
        }
        rounds[n - 1]!.note = "n".repeat(LIMITS.maxRoundNoteLength);
      }
    };
    const at = build(PARSE_LIMITS.maxTextLength);
    assert.equal(formattedPartLength(at), PARSE_LIMITS.maxTextLength);
    const v = validatePattern(doc([at]));
    assert.ok(!limitsOf(v.issues, "maxTextLength").length);
    for (const d of DIALECTS) assert.ok(parsePart(formatPart(at, d), { id: at.id, mode: readingModeFor(d) }).ok, d);

    const over = build(PARSE_LIMITS.maxTextLength + 1);
    assert.equal(formattedPartLength(over), PARSE_LIMITS.maxTextLength + 1);
    const r = validatePattern(doc([over]));
    const [limit] = limitsOf(r.issues, "maxTextLength");
    assert.equal(limit?.path, "parts[0]");
    assert.match(limit?.message ?? "", /escrita como texto mediría 100\.001 caracteres y el editor de texto lee hasta 100\.000/);
    assert.equal(r.savable, false);
  });

  it("la parte de la revisión (1.000 vueltas con nota de 500) ya no es savable", () => {
    const rounds = Array.from({ length: 1000 }, (_, i) => ({ number: i + 1, items: [sc(6)], note: "n".repeat(500) }));
    const r = validatePattern(doc([part(rounds)]));
    assert.equal(r.savable, false);
    assert.equal(limitsOf(r.issues, "maxTextLength").length, 1);
  });
});

// ------------------------------------------------------------ Hueco 3 y T20-B5

describe("Hueco 3 (T20-B4) y T20-B5: topes de 20 por código", () => {
  it("2.500 ubicaciones con identificadores malos dan a lo más 20 LIMIT y 20 TEXT_CONTROL_CHAR", () => {
    const placements = Array.from({ length: 2500 }, (_, i) => ({
      target: { part: "x".repeat(65) + i, copy: 0 },
      at: { type: "surface", host: { part: "\u0001" + i, copy: 0 }, round: 1, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] },
    }));
    const r = validatePattern(doc([part([V1])], { layout: { placements } } as Partial<WrittenPattern>));
    const layoutIssues = r.issues.filter((i) => i.path.startsWith("layout"));
    assert.equal(layoutIssues.filter((i) => i.code === "LIMIT").length, 20);
    assert.equal(layoutIssues.filter((i) => i.code === "TEXT_CONTROL_CHAR").length, 20);
    assert.ok(r.issues.length <= 45, `${r.issues.length} problemas`);
  });

  it("40.000 ítems malos dan 20 por código y por parte, con data.omitted en el último", () => {
    const bad = Array.from({ length: 40_000 }, () => ({ type: "stitch", stitch: "zz", count: 0 }));
    const p = (id: string) => ({ ...part([{ number: 1, items: bad as unknown as Item[] }]), id, name: id });
    const r = validatePattern(doc([p("a"), p("b")]));
    assert.equal(r.savable, false);
    for (const [pi, prefix] of [[0, "parts[0]"], [1, "parts[1]"]] as const) {
      for (const code of ["STITCH_UNKNOWN", "ITEM_COUNT"]) {
        const list = r.issues.filter((i) => i.code === code && i.path.startsWith(prefix));
        assert.equal(list.length, 20, `${code} en la parte ${pi}`);
        assert.equal(list.at(-1)?.data?.omitted, 40_000 - 20);
        assert.ok(list.slice(0, -1).every((i) => i.data?.omitted === undefined));
      }
    }
    // El nodo 101 ya es LIMIT de la vuelta, pero no se informa: la vuelta no pasó la revisión de ítems.
    assert.ok(r.issues.length <= 90, `${r.issues.length} problemas`);
  });

  it("con 20 o menos de un código no se agrega data.omitted", () => {
    const bad = Array.from({ length: 20 }, () => ({ type: "stitch", stitch: "zz", count: 1 }));
    const r = validatePattern(doc([part([{ number: 1, items: bad as unknown as Item[] }])]));
    const list = r.issues.filter((i) => i.code === "STITCH_UNKNOWN");
    assert.equal(list.length, 20);
    assert.ok(list.every((i) => i.data === undefined));
  });
});

// ------------------------------------------------------------ Edición (topes duros)

describe("T20: las operaciones de edición no cruzan los topes nuevos", () => {
  it(`insertItem no agrega el nodo ${LIMITS.maxRoundItems + 1} ni pasa el trabajo de una vuelta`, () => {
    const full = doc([part([{ number: 1, items: [...Array.from({ length: LIMITS.maxRoundItems - 1 }, () => color("A")), sc(6)] }])]);
    assert.equal(validatePattern(full).savable, true);
    assert.equal(insertItem(full, "p", 0, [0], color("B")), full);
    const one = doc([part([V1, { number: 2, items: [group(500, [group(98, [color("A")])]), sc(6)] }])]);
    assert.equal(validatePattern(one).savable, true);
    assert.equal(insertItem(one, "p", 1, [0, 0, 0], color("B")), one, "49.502 más 500 · 98 pasan los 50.000");
  });

  it("replaceRound no lleva el documento sobre maxExpansionWork (tope que depende de varias partes)", () => {
    const v2: Round = { number: 2, through: 500, items: [group(40, [group(49, [color("A")])]), sc(6)] };
    const p = (id: string, r: Round = v2): Part => ({ ...part([V1, r]), id, name: id });
    const small: Round = { number: 2, through: 500, items: [sc(6)] };
    const d = doc([p("a"), p("b"), p("c", small)]);
    assert.equal(validatePattern(d).valid, true);
    assert.equal(replaceRound(d, "c", 1, v2), d, "con la tercera parte se pasarían los 2.000.000");
    const ok = replaceRound(d, "c", 1, { ...small, items: [color("B"), sc(6)] });
    assert.notEqual(ok, d);
    assert.equal(validatePattern(ok).savable, true);
  });
});

// ------------------------------------------------------------ Guardia de tiempos

describe(`Guardia de tiempos (T20): documentos hostiles en menos de ${BUDGET_MS} ms`, () => {
  const metrics = shapeMetrics({ stitchesPer10cm: 13, rowsPer10cm: 16 }, { assumed: false, gaugeStitch: "sc" });
  for (const { name, doc: d } of hostileDocuments()) {
    it(`${name}: validatePattern (también con weightCat) y partProfile`, (t) => {
      const v = best(() => validatePattern(d));
      const w = best(() => validatePattern(d, { weightCat: 4 }));
      const p = best(() => d.parts.forEach((x) => partProfile(x, metrics)));
      t.diagnostic(`validatePattern ${v.toFixed(2)} ms · con weightCat ${w.toFixed(2)} ms · partProfile ${p.toFixed(2)} ms`);
      assert.equal(validatePattern(d).savable, false, "ningún documento hostil es savable");
      assert.ok(v < BUDGET_MS, `validatePattern tardó ${v.toFixed(1)} ms`);
      assert.ok(w < BUDGET_MS, `validatePattern con weightCat tardó ${w.toFixed(1)} ms`);
      assert.ok(p < BUDGET_MS, `partProfile tardó ${p.toFixed(1)} ms`);
    });
  }
});

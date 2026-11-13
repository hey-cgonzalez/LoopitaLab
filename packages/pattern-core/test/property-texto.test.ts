/**
 * Propiedades de la ida y vuelta por texto (T6; ADR 0011, sección 7; CA4-M5, parte RT):
 *
 * - RT1: `parsePart(formatPart(p, d), { id, mode: readingModeFor(d) })` es `p` para toda parte
 *   normalizada de un documento `savable` y todo dialecto (es, us, uk).
 * - RT2: la forma canónica es estable: leer, escribir y volver a leer da lo mismo.
 * - RT3: toda secuencia de operaciones de bloques deja un documento `savable` que cumple RT1,
 *   **a toda la profundidad de `LIMITS.maxNesting`** (rutas de hasta 6 índices, `moveItem`
 *   entre niveles), no solo a 2.
 * - RT4: `countRound` de una vuelta y de su ida y vuelta dan lo mismo.
 * - RT5: en todo modo, ningún alias corresponde a dos puntos (también en `text-v2.test.ts`).
 * - RT6: el lector nunca lanza, con cualquier texto de hasta `PARSE_LIMITS.maxTextLength`.
 *
 * Más las propiedades de la sección 6: toda operación deja un documento `savable` si la
 * entrada lo era, y `removePart` y `setCopies` nunca dejan referencias colgando en `layout`.
 * Semilla: `SEED=… node --test test/property-texto.test.ts`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIALECTS,
  LIMITS,
  PARSE_LIMITS,
  READING_MODES,
  STITCHES,
  addYarn,
  clearPlacement,
  countRound,
  formatPart,
  formatPartLines,
  insertItem,
  insertRound,
  moveItem,
  movePart,
  normalizePart,
  parsePart,
  parseRound,
  parseWrittenParts,
  readingModeFor,
  removeItem,
  removePart,
  removeRound,
  removeYarn,
  renamePart,
  reorderYarns,
  replacePartRounds,
  replaceRound,
  setAssembly,
  setCopies,
  setPartConstruction,
  setPartFinish,
  setPartStart,
  setPartStartYarn,
  setPlacement,
  stitchAliases,
  unwrapGroup,
  updateItem,
  validatePattern,
  wrapInGroup,
  type Issue,
  type Item,
  type Part,
  type ReadingMode,
  type Round,
  type StitchCode,
  type WrittenPattern,
} from "../src/index.ts";
import { yarnC } from "./support/fixtures.ts";
import { forAll, rng as rngFrom, type Rng } from "./support/property.ts";
import { genWrittenV2 } from "./support/written-gen.ts";

const CODES = Object.keys(STITCHES) as StitchCode[];
const YARNS = ["A", "B", "C"];
const savable = (d: unknown) => validatePattern(d).savable;

// ------------------------------------------------------------ Generadores

const NOTE_CHARS = ["a", "b", "ñ", "é", " ", " ", "  ", "\t", ">", "#", "[", "]", ":", ",", "@", "(6)", "x6", "V2:", "🧶", " "];

function genLine(r: Rng, max: number): string {
  let s = "";
  for (let i = r.int(0, max); i > 0; i--) s += r.pick(NOTE_CHARS);
  return s;
}

function genMultiline(r: Rng): string {
  return Array.from({ length: r.int(1, 4) }, () => genLine(r, 12)).join(r.bool(0.1) ? "\r\n" : "\n");
}

function genStitch(r: Rng): Item {
  const it: Item = { type: "stitch", stitch: r.pick(CODES), count: r.bool(0.3) ? 1 : r.int(1, 30) };
  if (r.bool(0.25)) it.loop = r.pick(["front", "back", "both"] as const);
  return it;
}

/** Ítems con grupos hasta `levels` niveles de listas (1 = sin grupos). */
function genItems(r: Rng, levels: number): Item[] {
  const items: Item[] = [];
  for (let i = r.int(1, 3); i > 0; i--) {
    const roll = r.next();
    if (roll < 0.12) items.push({ type: "color", yarn: r.pick(YARNS) });
    else if (roll < 0.45 && levels > 1) items.push({ type: "group", times: r.int(1, 3), items: genItems(r, levels - 1) });
    else items.push(genStitch(r));
  }
  return items;
}

/** Documento `savable` con partes normalizadas, notas, cierres de varias líneas y grupos hasta `LIMITS.maxNesting`. */
function genDoc(r: Rng): WrittenPattern {
  for (;;) {
    const d = genWrittenV2(r);
    d.parts = d.parts.map((p) => {
      const q: Part = { ...p, rounds: p.rounds.map((x) => ({ ...x })) };
      if (r.bool(0.3)) q.name = r.pick(["Cabeza", "  Oreja izq. ", "Ala: derecha", "Pata #2", "Brazo > mano", "Ñandú", "x"]);
      for (const round of q.rounds) {
        if (r.bool(0.25)) round.note = genMultiline(r);
        if (r.bool(0.08)) round.items = genItems(r, r.int(2, LIMITS.maxNesting));
      }
      if (r.bool(0.3)) q.finish = genMultiline(r);
      return normalizePart(q);
    });
    if (savable(d)) return d;
  }
}

// ------------------------------------------------------------ Ayudas

function okParse(text: string, id: string, mode: ReadingMode): Part {
  const r = parsePart(text, { id, mode });
  if (!r.ok) throw new Error(`No se leyó (${mode}):\n${text}\n${r.issues.map((i) => `${i.path} ${i.code}: ${i.message}`).join("\n")}`);
  return r.value;
}

/** RT1 y RT4 para una parte, en los tres dialectos. */
function roundTrip(p: Part): void {
  for (const d of DIALECTS) {
    const { text, roundLine } = formatPartLines(p, d);
    const back = okParse(text, p.id, readingModeFor(d));
    assert.deepEqual(back, p, `RT1 (${d}):\n${text}`);
    const lines = text.split("\n");
    let yarn = p.startYarn;
    p.rounds.forEach((round, j) => {
      assert.match(lines[(roundLine[j] as number) - 1] as string, new RegExp(`^[VR]${round.number}[-:]`), `roundLine ${j}`);
      const a = countRound(round, yarn);
      assert.deepEqual(countRound(back.rounds[j] as Round, yarn), a, "RT4");
      yarn = a.endYarn;
    });
  }
}

function depthOf(items: Item[], level = 1): number {
  let max = level;
  for (const it of items) if (it.type === "group") max = Math.max(max, depthOf(it.items, level + 1));
  return max;
}

const docDepth = (d: WrittenPattern) => Math.max(...d.parts.flatMap((p) => p.rounds.map((r) => depthOf(r.items))));

/** Rutas de todos los ítems de una lista (a cualquier profundidad). */
function itemPaths(items: Item[], prefix: number[] = []): number[][] {
  const out: number[][] = [];
  items.forEach((it, i) => {
    const p = [...prefix, i];
    out.push(p);
    if (it.type === "group") out.push(...itemPaths(it.items, p));
  });
  return out;
}

/** Rutas de inserción: cada posición de cada lista (la de la vuelta y la de cada grupo). */
function insertPaths(items: Item[], prefix: number[] = []): number[][] {
  const out: number[][] = [];
  for (let i = 0; i <= items.length; i++) out.push([...prefix, i]);
  items.forEach((it, i) => {
    if (it.type === "group") out.push(...insertPaths(it.items, [...prefix, i]));
  });
  return out;
}

/** Listas con su ruta de grupo (`[]` es la vuelta). */
function lists(items: Item[], prefix: number[] = []): Array<{ at: number[]; list: Item[] }> {
  const out = [{ at: prefix, list: items }];
  items.forEach((it, i) => {
    if (it.type === "group") out.push(...lists(it.items, [...prefix, i]));
  });
  return out;
}

/** Quita el ítem de `path` sin guardas (para calcular el árbol después de quitar en `moveItem`). */
function without(items: Item[], path: readonly number[]): Item[] {
  const [k, ...rest] = path as [number, ...number[]];
  if (rest.length === 0) return items.filter((_, i) => i !== k);
  return items.map((it, i) => (i === k && it.type === "group" ? { ...it, items: without(it.items, rest) } : it));
}

// ------------------------------------------------------------ RT1, RT4

describe("RT1 y RT4: ida y vuelta por texto sin pérdida (tres dialectos)", () => {
  it("propiedad: toda parte normalizada de un documento savable vuelve igual, con sus conteos", () => {
    let notes = 0;
    let finishes = 0;
    let copies = 0;
    forAll("RT1", genDoc, (d) => {
      for (const p of d.parts) {
        roundTrip(p);
        notes += p.rounds.filter((x) => x.note).length;
        if (p.finish?.includes("\n")) finishes++;
        if (p.copies) copies++;
      }
    }, 300);
    assert.ok(notes > 100 && finishes > 30 && copies > 30, `${notes} notas, ${finishes} cierres de varias líneas, ${copies} con cantidad`);
  });
});

// ------------------------------------------------------------ RT2

const PREFIXES = ["V", "v", "Vta ", "Vuelta ", "R", "Rnd ", "Round ", "H", "Fila ", "Row "];
const SYNTAX: Array<(r: Rng, mode: ReadingMode) => string> = [
  (r) => `${r.int(1, 12)} ${r.pick(["pb", "aum", "dism", "pd", "cad", "pa", "mpa", "pad", "saltar", "aum3"])}`,
  (r) => `${r.pick(["pb", "aum", "dism"])} ${r.int(1, 12)}`,
  (r) => `${r.pick(["pb", "aum", "dism"])} x${r.int(1, 12)}`,
  (r) => `${r.pick(["pb", "pa"])} ${r.pick(["ht", "hd", "en ht"])}`,
  (r, m) => (m === "es-uk" ? r.pick(["dc", "htr", "tr", "dtr", "ss", "miss", "dc2tog", "6 dc blo", "dec"]) : r.pick(["sc", "hdc", "dc", "tr", "sl st", "slst", "sk", "sc2tog", "invdec", "6 sc flo", "blo sc"])),
  (r) => `@${r.pick(YARNS)}`,
  (r) => `6 pb ${r.pick(["en AM", "in MR", "en el anillo mágico"])}`,
  (r) => `[pb, aum] ${r.pick(["x6", "6 veces", "x 2", "*3"])}`,
  (r) => `[pb, [pb 2, aum] x2] x${r.int(1, 3)}`,
  (r) => r.pick(["zz", "", "[pb", "pb]", "0 pb", "PB", "  pb  "]),
];

function genRoundLine(r: Rng, mode: ReadingMode, n: number): string {
  const items = Array.from({ length: r.int(1, 4) }, () => r.pick(SYNTAX)(r, mode)).join(r.pick([", ", ",", " , "]));
  const range = r.bool(0.15) ? r.pick(["-", " a ", " to ", "–"]) + (n + r.int(0, 3)) : "";
  const expected = r.bool(0.4) ? r.pick([` (${r.int(0, 60)})`, ` (${r.int(0, 60)} pts)`, "(6)"]) : "";
  return `${r.pick(PREFIXES)}${n}${range}: ${items}${expected}`;
}

function genText(r: Rng, mode: ReadingMode): string {
  const lines: string[] = [];
  let n = 1;
  for (let i = r.int(1, 14); i > 0; i--) {
    const roll = r.next();
    if (roll < 0.45) lines.push(genRoundLine(r, mode, n++));
    else if (roll < 0.6) lines.push(`${r.pick([">", "> ", " >", ">  "])}${genLine(r, 10)}`);
    else if (roll < 0.66) lines.push(r.pick(["", "   ", "# comentario", "  #x"]));
    else
      lines.push(
        r.pick([
          "Parte: Cuerpo",
          "parte:  Oreja ",
          "Part: Arm",
          `Cantidad: ${r.int(0, 4)}`,
          `Hacer ${r.int(1, 4)}`,
          `Piezas: ${r.int(1, 4)}`,
          `tejer:${r.int(1, 4)}`,
          "Make 2",
          "Inicio: AM",
          `Inicio: cad ${r.int(1, 12)}`,
          "Start: MR",
          `Start: ch ${r.int(2, 9)}`,
          "Inicio: óvalo 7",
          "Construcción: cerrada",
          "Construcción: hileras",
          "Construction: spiral",
          `Lana: ${r.pick(["A", "@B", "C"])}`,
          `Cierre: ${genLine(r, 8)}`,
          "Cierre:",
          "Relleno: sí",
          "hola",
        ]),
      );
  }
  return lines.join(r.bool(0.1) ? "\r\n" : "\n");
}

describe("RT2: la forma canónica es estable", () => {
  it("propiedad: si un texto se lee, escribirlo y volver a leerlo da la misma parte (cada modo con sus dialectos)", () => {
    let read = 0;
    forAll(
      "RT2",
      (r) => {
        const mode = r.pick(READING_MODES);
        return { mode, text: genText(r, mode) };
      },
      ({ mode, text }) => {
        const first = parsePart(text, { id: "t", mode });
        if (!first.ok) return;
        read++;
        for (const d of DIALECTS.filter((x) => readingModeFor(x) === mode)) {
          const out = formatPart(first.value, d);
          assert.deepEqual(okParse(out, "t", mode), first.value, `RT2 (${d}):\n--- texto\n${text}\n--- canónico\n${out}`);
          // La forma canónica es un punto fijo.
          assert.equal(formatPart(okParse(out, "t", mode), d), out);
        }
      },
      600,
    );
    assert.ok(read > 120, `${read} textos leídos`);
  });
});

// ------------------------------------------------------------ RT3

type Op = { name: string; apply: (d: WrittenPattern) => WrittenPattern; crossLevel?: boolean; deepen?: boolean };

function genBlockOp(r: Rng, d: WrittenPattern): Op {
  const part = r.pick(d.parts);
  const id = part.id;
  const ri = r.int(0, part.rounds.length - 1);
  const items = (part.rounds[ri] as Round).items;
  const paths = itemPaths(items);
  const all = lists(items);
  // La mitad de las veces se trabaja en la lista más profunda, para llegar a LIMITS.maxNesting.
  const deepest = all.reduce((a, b) => (b.at.length > a.at.length ? b : a));
  const pickList = () => (r.bool(0.5) ? deepest : r.pick(all));
  const roll = r.int(0, 10);
  if (roll <= 2) {
    const { at, list } = pickList();
    const a = r.int(0, list.length - 1);
    const b = r.int(a, list.length - 1);
    return { name: "wrapInGroup", deepen: true, apply: (x) => wrapInGroup(x, id, ri, [...at, a], [...at, b], r.int(1, 3)) };
  }
  if (roll === 3) {
    const groups = paths.filter((p) => getAt(items, p)?.type === "group");
    const p = groups.length > 0 ? r.pick(groups) : r.pick(paths);
    return { name: "unwrapGroup", apply: (x) => unwrapGroup(x, id, ri, p) };
  }
  if (roll === 4) {
    const to = r.pick(insertPaths(items));
    const item = r.bool(0.2) ? { type: "group" as const, times: r.int(1, 3), items: [genStitch(r)] } : r.bool(0.15) ? { type: "color" as const, yarn: r.pick(YARNS) } : genStitch(r);
    return { name: "insertItem", apply: (x) => insertItem(x, id, ri, to, item) };
  }
  if (roll === 5) {
    const p = r.pick(paths);
    const old = getAt(items, p) as Item;
    const item: Item = old.type === "group" ? { ...old, times: r.int(1, 4) } : old.type === "stitch" ? { ...old, ...genStitch(r) } : { type: "color", yarn: r.pick(YARNS) };
    return { name: "updateItem", apply: (x) => updateItem(x, id, ri, p, item) };
  }
  if (roll === 6) {
    const p = r.pick(paths);
    return { name: "removeItem", apply: (x) => removeItem(x, id, ri, p) };
  }
  if (roll <= 8) {
    const from = r.pick(paths);
    // `to` sale del árbol después de quitar el ítem; "subir" y "bajar" también se prueban.
    const after = without(items, from);
    const to = r.bool(0.3)
      ? [...from.slice(0, -1), Math.max(0, (from[from.length - 1] as number) + r.pick([-1, 1]))]
      : insertPaths(after).length > 0
        ? r.pick(insertPaths(after))
        : [0];
    return { name: "moveItem", crossLevel: to.length !== from.length, apply: (x) => moveItem(x, id, ri, from, to) };
  }
  const round: Round = { number: 1, items: genItems(r, r.int(1, LIMITS.maxNesting)) };
  if (r.bool(0.2)) round.through = 1 + r.int(1, 3);
  if (r.bool(0.3)) round.note = genMultiline(r);
  if (roll === 9) return { name: "insertRound", apply: (x) => insertRound(x, id, r.int(0, part.rounds.length), round) };
  return r.bool(0.5)
    ? { name: "replaceRound", apply: (x) => replaceRound(x, id, ri, round) }
    : { name: "removeRound", apply: (x) => removeRound(x, id, ri) };
}

function getAt(items: Item[], path: readonly number[]): Item | undefined {
  let list = items;
  for (let k = 0; k < path.length; k++) {
    const it = list[path[k] as number];
    if (k === path.length - 1) return it;
    if (!it || it.type !== "group") return undefined;
    list = it.items;
  }
  return undefined;
}

describe("RT3: operaciones de bloques a profundidad completa (decisión 2)", () => {
  it(`propiedad: toda secuencia deja un documento savable que cumple RT1, con rutas hasta ${LIMITS.maxNesting} niveles y movimientos entre niveles`, () => {
    let maxDepth = 0;
    let atMax = 0;
    let crossLevelMoves = 0;
    let rejectedDeepen = 0;
    const applied = new Map<string, number>();
    forAll(
      "RT3",
      (r) => {
        const d = genDoc(r);
        return { d, seed: r.int(0, 2 ** 31), steps: r.int(5, 30) };
      },
      ({ d, seed, steps }) => {
        const r = rngFrom(seed);
        let doc = d;
        for (let s = 0; s < steps; s++) {
          const op = genBlockOp(r, doc);
          const next = op.apply(doc);
          assert.ok(savable(next), `${op.name} dejó un documento no savable`);
          if (next !== doc) {
            applied.set(op.name, (applied.get(op.name) ?? 0) + 1);
            if (op.crossLevel) crossLevelMoves++;
          } else if (op.deepen && docDepth(doc) === LIMITS.maxNesting) rejectedDeepen++;
          doc = next;
          const depth = docDepth(doc);
          maxDepth = Math.max(maxDepth, depth);
          if (depth === LIMITS.maxNesting) atMax++;
        }
        for (const p of doc.parts) roundTrip(p);
      },
      250,
    );
    assert.equal(maxDepth, LIMITS.maxNesting, "RT3 llega a toda la profundidad del núcleo");
    assert.ok(atMax > 100, `${atMax} pasos con documentos a ${LIMITS.maxNesting} niveles`);
    assert.ok(crossLevelMoves > 50, `${crossLevelMoves} movimientos entre niveles`);
    assert.ok(rejectedDeepen > 0, "agrupar más allá del tope se rechaza");
    for (const name of ["wrapInGroup", "unwrapGroup", "insertItem", "updateItem", "removeItem", "moveItem", "insertRound", "replaceRound", "removeRound"]) {
      assert.ok((applied.get(name) ?? 0) > 20, `${name}: ${applied.get(name) ?? 0} aplicadas`);
    }
  });
});

// ------------------------------------------------------------ Sección 6

const LAYOUT_DANGLING = ["LAYOUT_TARGET_UNKNOWN", "LAYOUT_HOST_UNKNOWN", "LAYOUT_COPY_RANGE"];

describe("operaciones de documento (ADR 0011, sección 6)", () => {
  it("propiedad: removePart y setCopies nunca dejan referencias colgando y avisan cada pieza que quedó sin ubicar", () => {
    let unplaced = 0;
    forAll("sin referencias colgando", genDoc, (d) => {
      const r = rngFrom(d.parts.length * 7919 + (d.layout?.placements.length ?? 0));
      const part = r.pick(d.parts);
      const res = r.bool(0.5) ? setCopies(d, part.id, r.int(1, 12)) : removePart(d, part.id);
      const v = validatePattern(res.pattern);
      assert.ok(v.savable);
      assert.deepEqual(v.issues.filter((i) => LAYOUT_DANGLING.includes(i.code)), []);
      const placed = new Set((res.pattern.layout?.placements ?? []).map((p) => `${p.target.part}#${p.target.copy}`));
      for (const u of res.unplaced) {
        unplaced++;
        assert.ok(res.pattern.parts.some((p) => p.id === u.part && u.copy < (p.copies ?? 1)), "la pieza sin ubicar existe");
        assert.equal(placed.has(`${u.part}#${u.copy}`), false, "y ya no tiene ubicación");
      }
      // Si la operación tocó `layout` y no quedó ninguna ubicación, `layout` se omite.
      if (res.pattern.layout && res.pattern.layout !== d.layout) assert.ok(res.pattern.layout.placements.length > 0, "layout vacío se omite");
    }, 300);
    assert.ok(unplaced > 10, `${unplaced} piezas sin ubicar informadas`);
  });

  it("propiedad: toda operación de partes, posición, armado y lanas deja un documento savable si la entrada lo era", () => {
    const ops: Array<(r: Rng, d: WrittenPattern) => WrittenPattern> = [
      (r, d) => renamePart(d, r.pick(d.parts).id, r.pick(["Cabeza", "", "a\nb", " x ", "y".repeat(90)])),
      (r, d) => movePart(d, r.pick(d.parts).id, r.int(0, d.parts.length)),
      (r, d) => setPartConstruction(d, r.pick(d.parts).id, r.pick(["spiral", "joined", "flat"] as const)),
      (r, d) => setPartStart(d, r.pick(d.parts).id, r.bool(0.5) ? { type: "magic_ring" } : { type: "chain", count: r.int(0, 8) }),
      (r, d) => setPartStartYarn(d, r.pick(d.parts).id, r.pick(["A", "B", "C", "Z"])),
      (r, d) => setPartFinish(d, r.pick(d.parts).id, r.bool(0.2) ? undefined : genMultiline(r)),
      (r, d) => setCopies(d, r.pick(d.parts).id, r.int(0, LIMITS.maxCopies + 1)).pattern,
      (r, d) => removePart(d, r.pick(d.parts).id).pattern,
      (r, d) => {
        const p = r.pick(d.parts);
        const text = formatPart(p, r.pick(DIALECTS));
        const back = parsePart(text, { id: p.id });
        return back.ok ? replacePartRounds(d, p.id, back.value.rounds) : d;
      },
      (r, d) => {
        const a = r.pick(d.parts);
        const b = r.pick(d.parts);
        return setPlacement(d, { target: { part: a.id, copy: r.int(0, 2) }, at: { type: "surface", host: { part: b.id, copy: r.int(0, 2) }, round: r.int(1, 20), stitch: r.int(0, 30), attach: "end", rotationDeg: [0, 0, 0] } });
      },
      (r, d) => clearPlacement(d, { part: r.pick(d.parts).id, copy: r.int(0, 3) }),
      (r, d) => setAssembly(d, Array.from({ length: r.int(0, 4) }, () => genMultiline(r))),
      (_r, d) => addYarn(d, yarnC),
      (r, d) => removeYarn(d, r.int(0, 2), r.int(0, 2)),
      (r, d) => reorderYarns(d, r.bool(0.5) ? [2, 0, 1] : [1, 0, 2]),
    ];
    forAll("operaciones savable", (r) => ({ d: genDoc(r), seed: r.int(0, 2 ** 31) }), ({ d, seed }) => {
      const r = rngFrom(seed);
      let doc = d;
      for (let s = r.int(1, 12); s > 0; s--) {
        doc = r.pick(ops)(r, doc);
        assert.ok(savable(doc));
      }
      for (const p of doc.parts) roundTrip(p);
    }, 200);
  });
});

// ------------------------------------------------------------ RT5, RT6

describe("RT5: alias por modo", () => {
  it("en todo modo, ningún alias corresponde a dos puntos", () => {
    for (const mode of READING_MODES) {
      const seen = new Map<string, StitchCode>();
      for (const [a, code] of stitchAliases(mode)) {
        assert.ok(!seen.has(a) || seen.get(a) === code, `${mode}: ${a}`);
        seen.set(a, code);
      }
    }
  });
});

const NOISE = ["V", "R", "1", "12", "-", ":", " ", "  ", "\t", "\n", "\r\n", "\r", "[", "]", ",", "x", "×", "*", "(", ")", "@", "#", ">", "pb", "sc", "dc", "aum", "veces", "en AM", "Parte:", "Hacer", "Cantidad:", "Inicio:", "óvalo", "cad", "Cierre:", "Lana:", "\u0000", " ", "\ud800", "🧶", "ñ", "é", "́", "9".repeat(20), "toString", "__proto__"];

function genNoise(r: Rng, max: number): string {
  let s = "";
  const n = r.int(0, max);
  while (s.length < n) s += r.pick(NOISE);
  return s.slice(0, max);
}

function assertIssues(list: Issue[] | undefined): void {
  if (list === undefined) return;
  for (const i of list) {
    assert.equal(typeof i.code, "string");
    assert.ok(["error", "warning", "info"].includes(i.severity));
    assert.match(i.path, /^texto:\d+:\d+$/);
    assert.equal(typeof i.message, "string");
  }
}

describe("RT6: el lector nunca lanza", () => {
  it(`propiedad: parsePart, parseRound y parseWrittenParts con cualquier texto de hasta ${PARSE_LIMITS.maxTextLength} caracteres`, () => {
    forAll(
      "RT6",
      (r) => ({ text: genNoise(r, r.bool(0.05) ? PARSE_LIMITS.maxTextLength : 3_000), mode: r.pick(READING_MODES) }),
      ({ text, mode }) => {
        const a = parsePart(text, { id: "x", mode });
        const b = parseRound(text, 1, mode);
        const c = parseWrittenParts(text, { partId: (i) => `p${i}`, mode });
        for (const res of [a, b, c]) {
          assert.equal(typeof res.ok, "boolean");
          if (!res.ok) {
            assert.ok(res.issues.length > 0);
            assertIssues(res.issues);
          }
          assertIssues(res.warnings);
        }
      },
      400,
    );
  });

  it("textos al tope y por encima, y valores que no son texto, no lanzan", () => {
    const fill = "V1: 6 pb\n".repeat(PARSE_LIMITS.maxTextLength / 9);
    assert.ok(fill.length <= PARSE_LIMITS.maxTextLength);
    assert.doesNotThrow(() => parsePart(fill, { id: "x" }));
    const over = parsePart(fill + "x".repeat(PARSE_LIMITS.maxTextLength), { id: "x" });
    assert.equal(over.ok, false);
    for (const bad of [null, undefined, 5, {}, []]) {
      assert.doesNotThrow(() => parsePart(bad as unknown as string, { id: "x" }));
      assert.doesNotThrow(() => parseRound(bad as unknown as string));
      assert.doesNotThrow(() => parseWrittenParts(bad as unknown as string, { partId: () => "x" }));
      assert.doesNotThrow(() => parsePart("V1: 6 pb", bad as never));
    }
  });
});

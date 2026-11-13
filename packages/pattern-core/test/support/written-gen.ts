/**
 * Generadores con semilla de patrones escritos (ADR 0002) para las propiedades de la v2:
 * migración (M1 a M4), borradores y límites recomendados.
 */
import { SCHEMA_VERSION, STITCHES, type Item, type Part, type PartV1, type Placement, type Round, type StitchCode, type WrittenPattern, type WrittenPatternV1 } from "../../src/index.ts";
import { yarnA, yarnB, yarnC } from "./fixtures.ts";
import type { Rng } from "./property.ts";

const CODES = Object.keys(STITCHES) as StitchCode[];
const YARN_IDS = ["A", "B", "C"];

/** Pieza redonda (bolita, cabeza, cuerpo): base b, m vueltas de +b, meseta y cierre simétrico. */
function genRoundPiece(r: Rng, id: string): PartV1 {
  const b = r.int(4, 8);
  const m = r.int(1, 6);
  const plateau = r.int(0, 5);
  const ring = r.bool(0.75);
  const construction = r.pick(["spiral", "spiral", "joined"] as const);
  const rounds: Round[] = [];
  const color = (): Item[] => (r.bool(0.2) ? [{ type: "color", yarn: r.pick(YARN_IDS) }] : []);
  let n = 1;
  // Con cadeneta en aro, la V1 trabaja un punto en cada cadeneta (F4-4).
  rounds.push({ number: n++, items: [...color(), { type: "stitch", stitch: "sc", count: b }], expected: b });
  for (let i = 2; i <= m; i++) {
    const items: Item[] = i === 2 ? [{ type: "stitch", stitch: "inc", count: b }] : [{ type: "group", times: b, items: [{ type: "stitch", stitch: "sc", count: i - 2 }, { type: "stitch", stitch: "inc", count: 1 }] }];
    rounds.push({ number: n++, items: [...color(), ...items], expected: b * i });
  }
  if (plateau > 0) {
    const round: Round = { number: n, items: [{ type: "stitch", stitch: "sc", count: b * m }], expected: b * m };
    if (plateau > 1) round.through = n + plateau - 1;
    rounds.push(round);
    n += plateau;
  }
  for (let i = m; i >= 2; i--) {
    const items: Item[] = i === 2 ? [{ type: "stitch", stitch: "dec", count: b }] : [{ type: "group", times: b, items: [{ type: "stitch", stitch: "sc", count: i - 2 }, { type: "stitch", stitch: "dec", count: 1 }] }];
    rounds.push({ number: n++, items, expected: b * (i - 1) });
  }
  const part: PartV1 = { id, name: `Pieza ${id}`, construction, start: ring ? { type: "magic_ring" } : { type: "chain", count: b }, startYarn: r.pick(YARN_IDS), rounds };
  if (r.bool(0.3)) part.finish = "rellenar y cerrar";
  return part;
}

/** Panel en hileras de punto bajo sobre una cadeneta base de w + 1 (F4-5). */
function genPanel(r: Rng, id: string): PartV1 {
  const w = r.int(2, 30);
  const rows = r.int(1, 12);
  const rounds: Round[] = [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: w }], expected: w }];
  if (rows > 1) rounds.push({ number: 2, ...(rows > 2 ? { through: rows } : {}), items: [{ type: "stitch", stitch: "sc", count: w }], expected: w });
  return { id, name: `Panel ${id}`, construction: "flat", start: { type: "chain", count: w + 1 }, startYarn: r.pick(YARN_IDS), rounds };
}

function genItems(r: Rng, depth: number): Item[] {
  const n = r.int(1, 4);
  const items: Item[] = [];
  for (let i = 0; i < n; i++) {
    const roll = r.next();
    if (roll < 0.1) items.push({ type: "color", yarn: r.pick(YARN_IDS) });
    else if (roll < 0.3 && depth < 3) items.push({ type: "group", times: r.int(1, 6), items: genItems(r, depth + 1) });
    else {
      const it: Item = { type: "stitch", stitch: r.pick(CODES), count: r.int(1, 12) };
      if (r.bool(0.15)) it.loop = r.pick(["front", "back", "both"] as const);
      items.push(it);
    }
  }
  return items;
}

/** Parte arbitraria (estructura sana, conteos al azar): casi nunca cuadra. */
function genRandomPart(r: Rng, id: string): PartV1 {
  const k = r.int(1, 6);
  const rounds: Round[] = [];
  let n = 1;
  for (let i = 0; i < k; i++) {
    const round: Round = { number: n, items: genItems(r, 0) };
    if (r.bool(0.25)) round.through = n + r.int(1, 3);
    if (r.bool(0.6)) round.expected = r.int(0, 80);
    rounds.push(round);
    n = (round.through ?? n) + 1;
  }
  const construction = r.pick(["spiral", "joined", "flat"] as const);
  const start = r.bool(0.5) ? { type: "magic_ring" as const } : { type: "chain" as const, count: r.int(construction === "flat" ? 2 : 1, 14) };
  return { id, name: `Parte ${id}`, construction, start, startYarn: r.pick(YARN_IDS), rounds };
}

/** Cambios de dominio sobre una parte que cuadra (F4-2 a F4-12). */
function perturb(r: Rng, part: PartV1): void {
  const roll = r.int(0, 9);
  const first = part.rounds[0] as Round;
  if (roll === 0) part.start = { type: "chain", count: r.int(part.construction === "flat" ? 2 : 1, 3) }; // cadeneta corta o V1 libre (C-9)
  else if (roll === 1) part.start = { type: "magic_ring" }; // en hileras, PART_START_FLAT_RING
  else if (roll === 2) {
    const n = r.pick([1, 2, 3, 12, 13, 15]);
    first.items = [{ type: "stitch", stitch: "sc", count: n }]; // MAGIC_RING_UNUSUAL
    first.expected = n;
  } else if (roll === 3) {
    const round = r.pick(part.rounds);
    if (round.expected !== undefined) round.expected += r.pick([-2, -1, 1, 2]); // pista de subida y unión
  } else if (roll === 4) {
    const round = r.pick(part.rounds);
    round.items = [...round.items, r.pick<Item>([{ type: "stitch", stitch: "slst", count: 1 }, { type: "stitch", stitch: "ch", count: 1 }])];
  } else if (roll === 5) {
    const round = r.pick(part.rounds);
    delete round.expected;
  } else if (roll === 6 && (part.start.type === "magic_ring" || part.start.count >= 2)) part.construction = r.pick(["spiral", "joined", "flat"] as const);
  // 7 a 9: sin cambios.
}

/** Documento v1 escrito al azar: válido, con desajustes de conteo o con los casos de T1. */
export function genWrittenV1(r: Rng): WrittenPatternV1 {
  const count = r.int(1, 4);
  const parts: PartV1[] = [];
  for (let i = 0; i < count; i++) {
    const id = `p${i}`;
    const kind = r.int(0, 9);
    const part = kind < 5 ? genRoundPiece(r, id) : kind < 8 ? genPanel(r, id) : genRandomPart(r, id);
    if (r.bool(0.5)) perturb(r, part);
    parts.push(part);
  }
  const doc: WrittenPatternV1 = {
    schemaVersion: 1,
    id: "p-gen",
    title: "Generado",
    technique: "crochet",
    kind: "written",
    yarns: [structuredClone(yarnA), structuredClone(yarnB), structuredClone(yarnC)],
    origin: { kind: "manual" },
    parts,
  };
  if (r.bool(0.3)) doc.assembly = ["Coser la cabeza al cuerpo."];
  return doc;
}

/**
 * Documento v2 `savable` al azar (puede tener errores de conteo, que son de tejido):
 * copias de 1 a 12 y una ubicación sin ciclos, con anclas dentro o fuera del anfitrión.
 */
export function genWrittenV2(r: Rng): WrittenPattern {
  const v1 = genWrittenV1(r);
  const parts: Part[] = v1.parts.map((p) => {
    const part: Part = { ...p };
    if (r.bool(0.4)) part.copies = r.int(1, 12);
    return part;
  });
  const doc: WrittenPattern = { ...v1, schemaVersion: SCHEMA_VERSION, parts };
  if (r.bool(0.7)) {
    // Todas las copias en un orden al azar; cada pieza cosida se ancla a una anterior (sin ciclos).
    const refs = parts.flatMap((p) => Array.from({ length: p.copies ?? 1 }, (_, copy) => ({ part: p.id, copy })));
    for (let i = refs.length - 1; i > 0; i--) {
      const j = r.int(0, i);
      [refs[i], refs[j]] = [refs[j]!, refs[i]!];
    }
    const placed = refs.slice(0, Math.min(refs.length, r.int(0, 16)));
    const placements: Placement[] = placed.map((target, i) => {
      if (i === 0 || r.bool(0.3)) {
        return { target, at: { type: "free", positionCm: [r.int(-50, 50), r.int(-50, 50), r.int(-50, 50)], rotationDeg: [r.int(-180, 180), 0, r.int(-180, 180)] } };
      }
      const host = placed[r.int(0, i - 1)]!;
      const at: Placement["at"] = { type: "surface", host, round: r.int(1, 40), stitch: r.int(0, 70), attach: r.pick(["end", "start"] as const), rotationDeg: [0, r.int(-90, 90), 0] };
      if (r.bool(0.3)) at.offsetCm = r.int(-10, 10) / 10;
      return { target, at };
    });
    doc.layout = { placements };
  }
  return doc;
}

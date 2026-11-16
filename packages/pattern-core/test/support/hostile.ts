/**
 * Documentos hostiles de la revisión de seguridad T20 (fase 4), los de los scripts de
 * reproducción (`bomb.ts`, `bomb3d.ts`, `cost.ts`, `scene.ts`, `hostile.ts` y `rt.ts`). Los
 * usan las guardias de tiempos de `pattern-core` (`t20-topes.test.ts`) y de `viewer-3d`
 * (`t20-hostiles.test.ts`): ninguno es `savable` y todos se validan, perfilan y arman en < 50 ms.
 */
import type { Item, Part, Round, WrittenPattern } from "../../src/index.ts";

const yarn = (id: string) => ({ id, weight: 4 as const, composition: [{ fiber: "wool", percent: 100 }], color: { hex: "#ff0000" } });

function doc(parts: Part[], extra: Partial<WrittenPattern> = {}): WrittenPattern {
  return { schemaVersion: 2, id: "x", title: "t", technique: "crochet", kind: "written", origin: { kind: "manual" }, yarns: [yarn("A"), yarn("B")], parts, ...extra } as WrittenPattern;
}

const part = (rounds: Round[]): Part => ({ id: "p", name: "p", construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds }) as Part;
const sc = (count: number): Item => ({ type: "stitch", stitch: "sc", count });
const color = (y: string): Item => ({ type: "color", yarn: y });
const group = (times: number, items: Item[]): Item => ({ type: "group", times, items });
const V1: Round = { number: 1, items: [sc(6)] };

/** Grupo de solo color anidado `depth` veces con `times` repeticiones por nivel (T20-A1). */
export function colorBomb(times: number, depth: number): Item {
  let g: Item = color("A");
  for (let i = 0; i < depth; i++) g = group(times, [g]);
  return g;
}

/** Documentos hostiles de la revisión T20 (`bomb.ts`, `cost.ts`, `scene.ts`, `hostile.ts`). */
export function hostileDocuments(): Array<{ name: string; doc: WrittenPattern }> {
  const out: Array<{ name: string; doc: WrittenPattern }> = [];
  out.push({ name: "bomba 500^5 (bomb.ts)", doc: doc([part([V1, { number: 2, items: [colorBomb(500, 5), sc(6)] }])]) });
  out.push({ name: "bomba 40^5 en V2-10 (bomb3d.ts)", doc: doc([part([V1, { number: 2, through: 10, items: [colorBomb(40, 5), sc(6)] }])]) });
  for (const [N, depth, alternate] of [[25000, 0, false], [25000, 5, false], [5000, 5, false], [25000, 5, true]] as const) {
    let items: Item[] = Array.from({ length: N }, (_, i) => color(alternate ? (i % 2 ? "A" : "B") : "A"));
    items.push(sc(6));
    for (let i = 0; i < depth; i++) items = [group(2, items)];
    out.push({ name: `${N} colores en ${depth} grupos x2, V2-1000${alternate ? ", A y B (scene.ts)" : " (cost.ts)"}`, doc: doc([part([V1, { number: 2, through: 1000, items }])]) });
  }
  const bad = Array.from({ length: 40_000 }, () => ({ type: "stitch", stitch: "zz", count: 0 }));
  out.push({ name: "40.000 ítems malos (hostile.ts)", doc: doc([part([{ number: 1, items: bad as unknown as Item[] }])]) });
  const wide = Array.from({ length: 20_000 }, () => sc(1));
  out.push({ name: "V2-1000 con 20.000 ítems (hostile.ts)", doc: doc([part([{ number: 1, items: [sc(5000)] }, { number: 2, through: 1000, items: wide }])]) });
  const placements = Array.from({ length: 2500 }, (_, i) => ({ target: { part: "x".repeat(65) + i, copy: 0 }, at: { type: "surface", host: { part: "\u0001" + i, copy: 0 }, round: 1, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } }));
  out.push({ name: "layout con 2.500 identificadores malos (hostile.ts)", doc: doc([part([V1])], { layout: { placements } } as Partial<WrittenPattern>) });
  const notes = Array.from({ length: 1000 }, (_, i) => ({ number: i + 1, items: [sc(6)], note: "n".repeat(500) }));
  out.push({ name: "1.000 vueltas con nota de 500 (rt.ts)", doc: doc([part(notes)]) });
  return out.map(({ name, doc: d }) => ({ name, doc: JSON.parse(JSON.stringify(d)) as WrittenPattern }));
}


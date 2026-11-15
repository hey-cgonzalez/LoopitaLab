/**
 * Malla de una parte (ADR 0010, sección 3). Topología por punto: se recorre `expandRound` de
 * cada vuelta concreta con un cursor sobre lo **consumido** (anillo de abajo) y otro sobre lo
 * **producido** (anillo de arriba). Cuánto ocupa cada punto abajo y arriba sale de `STITCHES`
 * (la tabla del motor): la malla no decide cuántos puntos hay (regla de oro 2).
 *
 * Cada punto producido es una pieza con vértices propios (color nítido por punto):
 * - `sc`, `hdc`, `dc`, `tr`, `slst`: un cuadrilátero (1 abajo, 1 arriba);
 * - `inc` (de punto bajo, C-12): abanico de 1 posición abajo a 2 arriba, como dos
 *   cuadriláteros que comparten el punto medio de la base; `inc3`, de 1 a 3;
 * - `dec`: 2 posiciones abajo y 1 arriba, con un vértice en la posición intermedia de abajo
 *   para que no quede una grieta contra la vuelta anterior;
 * - `ch` dentro de la vuelta: base de ancho 0 (un triángulo);
 * - `sk`: no produce, así que no tiene punto ni geometría: deja un hueco y solo avanza el
 *   cursor de abajo (F4-28).
 * Con un desajuste de consumo (borradores), las posiciones de abajo se reparten en proporción
 * a lo consumido: la malla siempre cierra y el validador informa el error.
 */
import { STITCHES, concreteRounds, expandRound, type ExpandedStitch, type Item, type Part, type PartProfile, type Round } from "@loopitalab/pattern-core";
import { TWO_PI, panelGeometry, panelX, revolutionGeometry, ringZ, type PanelGeometry, type RingGeometry } from "./geometry.ts";
import { LOOP_BACK, LOOP_BOTH, LOOP_FRONT, type PartMesh, type PartMeshOptions, type Vec3 } from "./types.ts";

// ------------------------------------------------------------------ topología

const floorDiv = (x: number, y: number): number => Math.floor(x / y);
const ceilDiv = (x: number, y: number): number => Math.ceil(x / y);

/**
 * Vértices de la base de la pieza `j` (0 … b − 1) de un punto que consume `a` y produce `b`:
 * los dos extremos más las posiciones enteras de abajo que caen dentro; 1 si la base tiene
 * ancho 0 (`ch`). El cursor de abajo es siempre entero al empezar un punto.
 */
function bottomPointCount(a: number, b: number, j: number): number {
  if (a <= 0) return 1;
  return ceilDiv(a * (j + 1), b) - 1 - floorDiv(a * j, b) + 2;
}

const hasStitch = (code: string): boolean => Object.hasOwn(STITCHES, code);

const loopCode = (s: ExpandedStitch): number => (s.loop === "back" ? LOOP_BACK : s.loop === "front" ? LOOP_FRONT : LOOP_BOTH);

function yarnIndexer(yarnIds: readonly string[]): (id: string) => number {
  const map = new Map<string, number>();
  const ids = Array.isArray(yarnIds) ? yarnIds : [];
  ids.forEach((id, i) => {
    if (!map.has(id)) map.set(id, Math.min(i, 255));
  });
  return (id) => map.get(id) ?? 0;
}

// ------------------------------------------------------------------ firma de forma

function itemsSignature(items: readonly Item[]): string {
  let out = "";
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.type === "stitch") out += `${item.stitch}*${item.count}${item.loop === "back" ? "b" : item.loop === "front" ? "f" : ""},`;
    else if (item?.type === "group") out += `(${itemsSignature(item.items)})x${item.times},`;
    // Los cambios de lana no son forma.
  }
  return out;
}

/**
 * Firma de la forma: construcción, inicio, y puntos y hebras de cada vuelta (con su rango),
 * sin lanas. Si no cambia (con la misma muestra), la malla es la misma y basta con
 * `colorizePartMesh`. Es conservadora: "pb, pb" y "2 pb" dan firmas distintas.
 */
export function shapeSignature(part: Part): string {
  const start = part?.start?.type === "chain" ? `ch${part.start.count}` : "mr";
  const rounds = Array.isArray(part?.rounds) ? part.rounds : [];
  let out = `${part?.construction}|${start}|`;
  for (const round of rounds) out += `${round?.number}-${round?.through ?? ""}:${itemsSignature(round?.items)};`;
  return out;
}

// ------------------------------------------------------------------ metadatos para `reuse`

interface MeshMeta {
  kind: "revolution" | "panel";
  startKey: string;
  yarnKey: string;
  /** Clave de contenido de cada vuelta concreta completa (puntos, hebras y lanas). */
  roundKeys: string[];
  /** Valores del perfil de los que depende la geometría (radio y z, o ancho, tope y base). */
  ringA: Float64Array;
  ringB: Float64Array;
  ringC: Float64Array | null;
  ringCount: number;
  roundVertexStart: Uint32Array;
  roundIndexStart: Uint32Array;
  /** Vueltas incluidas completas (con `limit`, la vuelta cortada no cuenta). */
  fullRounds: number;
  /** Vueltas copiadas de la malla de `reuse` al armar esta. */
  reused: number;
}

/** Privado: así `PartMesh` queda con la forma del ADR y se puede clonar (sin metadatos, `reuse` se ignora). */
const META = new WeakMap<PartMesh, MeshMeta>();

/** Vueltas que `buildPartMesh` copió de `reuse` al armar `mesh` (0 sin `reuse` o si no se aplicó). Uso interno. */
export function reusedRoundsOf(mesh: PartMesh): number {
  return META.get(mesh)?.reused ?? 0;
}

function ringEqual(a: MeshMeta, b: MeshMeta, j: number): boolean {
  const inA = j < a.ringCount;
  const inB = j < b.ringCount;
  if (inA !== inB) return false;
  if (!inA) return true;
  if (a.ringA[j] !== b.ringA[j] || a.ringB[j] !== b.ringB[j]) return false;
  return a.ringC === null || b.ringC === null ? a.ringC === b.ringC : a.ringC[j] === b.ringC[j];
}

/**
 * Vueltas que se pueden copiar tal cual. La vuelta `c` usa los anillos `c` y `c + 1`; en
 * espiral también la subida del anillo `c` (anillo `c − 1`) y la normal del anillo `c + 1`,
 * que mira al anillo `c + 2`. En hileras, la fila `c` usa las filas `c − 1` y `c`.
 */
function reusableRounds(old: MeshMeta, now: MeshMeta, cap: number): number {
  if (old.kind !== now.kind || old.startKey !== now.startKey || old.yarnKey !== now.yarnKey) return 0;
  const ahead = now.kind === "revolution" ? 2 : 0;
  const limit = Math.min(cap, old.fullRounds, now.roundKeys.length);
  let c = 0;
  while (c < limit && old.roundKeys[c] === now.roundKeys[c]) {
    let ok = true;
    for (let j = Math.max(0, c - 1); j <= c + ahead && ok; j++) ok = ringEqual(old, now, j);
    if (!ok) break;
    c++;
  }
  return c;
}

// ------------------------------------------------------------------ armado

const clampInt = (x: unknown, lo: number, hi: number): number => {
  const n = typeof x === "number" && Number.isFinite(x) ? Math.floor(x) : lo;
  return n < lo ? lo : n > hi ? hi : n;
};

interface RoundPlan {
  stitches: ExpandedStitch[];
  consumed: number;
  produced: number;
}

/**
 * Malla de una parte a partir de su perfil (`partProfile` de `pattern-core`). Funciona con todo
 * documento `savable`, también con vueltas que no cuadran, y nunca lanza (G10).
 */
export function buildPartMesh(part: Part, yarnIds: readonly string[], profile: PartProfile, opts: PartMeshOptions = {}): PartMesh {
  const concrete = concreteRounds(part);
  const plans: RoundPlan[] = concrete.map((c) => ({ stitches: expandRound(c.round, c.startYarn).stitches, consumed: c.count.consumed, produced: c.count.produced }));
  const R = plans.length;

  // Corte (fase 6): en `roundStart[roundsDone] + stitchesDone`, en puntos producidos.
  let roundsDone = R;
  let stitchesDone = 0;
  if (opts.limit) {
    roundsDone = clampInt(opts.limit.roundsDone, 0, R);
    stitchesDone = roundsDone < R ? clampInt(opts.limit.stitchesDone, 0, plans[roundsDone]!.produced) : 0;
  }
  const included = roundsDone + (stitchesDone > 0 ? 1 : 0);

  // Tamaños por vuelta, con las mismas reglas que el llenado.
  const roundVertexStart = new Uint32Array(included + 1);
  const roundIndexStart = new Uint32Array(included + 1);
  const roundStart = new Uint32Array(included + 1);
  let vCount = 0;
  let iCount = 0;
  let sCount = 0;
  for (let c = 0; c < included; c++) {
    roundVertexStart[c] = vCount;
    roundIndexStart[c] = iCount;
    roundStart[c] = sCount;
    const cap = c < roundsDone ? Infinity : stitchesDone;
    let local = 0;
    outer: for (const s of plans[c]!.stitches) {
      if (!hasStitch(s.stitch)) continue;
      const { consumes: a, produces: b } = STITCHES[s.stitch];
      for (let j = 0; j < b; j++) {
        if (local >= cap) break outer;
        const bp = bottomPointCount(a, b, j);
        vCount += bp + 2;
        iCount += bp * 3;
        local++;
      }
    }
    sCount += local;
  }
  roundVertexStart[included] = vCount;
  roundIndexStart[included] = iCount;
  roundStart[included] = sCount;

  // Giro de cada anillo: alinea en promedio la base y el tope de los puntos de cada vuelta, para
  // que una vuelta con los aumentos juntos ("aum x5, 8 pb") no se tuerza. Depende solo de las
  // vueltas anteriores y se calcula sobre la vuelta entera aunque haya `limit` (G7).
  const ringPhase = new Float64Array(R + 1);
  const revolution = profile?.kind !== "panel";
  if (revolution) {
    for (let c = 0; c < R; c++) {
      const { stitches, consumed: C, produced: N } = plans[c]!;
      let sum = 0;
      let n = 0;
      if (C > 0 && N > 0) {
        let B = 0;
        let T = 0;
        for (const s of stitches) {
          if (!hasStitch(s.stitch)) continue;
          const { consumes: a, produces: b } = STITCHES[s.stitch];
          for (let j = 0; j < b; j++) {
            sum += (B + (a * (j + 0.5)) / b) / C - (T + j + 0.5) / N;
            n++;
          }
          B += a;
          T += b;
        }
      }
      const turn = ringPhase[c]! + (n > 0 ? sum / n : 0);
      ringPhase[c + 1] = turn - Math.floor(turn);
    }
  }

  // Geometría del perfil y metadatos de esta malla.
  const rg: RingGeometry | null = revolution ? revolutionGeometry(profile as Extract<PartProfile, { kind: "revolution" }>) : null;
  const pg: PanelGeometry | null = revolution ? null : panelGeometry(profile as Extract<PartProfile, { kind: "panel" }>);
  const yarnOf = yarnIndexer(yarnIds);
  const sourceKeys = new Map<Round, string>();
  const roundKeys = concrete.slice(0, roundsDone).map((c) => {
    let k = sourceKeys.get(c.round);
    if (k === undefined) {
      k = JSON.stringify(c.round.items ?? null);
      sourceKeys.set(c.round, k);
    }
    return `${c.startYarn}\u0001${k}`;
  });
  const meta: MeshMeta = {
    kind: revolution ? "revolution" : "panel",
    startKey: `${part?.construction}|${part?.start?.type}|${part?.start?.type === "chain" ? part.start.count : ""}`,
    yarnKey: (Array.isArray(yarnIds) ? yarnIds : []).join("\u0000"),
    roundKeys,
    ringA: rg ? rg.r : pg!.width,
    ringB: rg ? rg.z : pg!.top,
    ringC: rg ? null : pg!.bottom,
    ringCount: rg ? rg.count : pg!.count,
    roundVertexStart,
    roundIndexStart,
    fullRounds: roundsDone,
    reused: 0,
  };

  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const yarn = new Uint8Array(vCount);
  const loop = new Uint8Array(vCount);
  const indices = new Uint32Array(iCount);
  const faceStitch = new Uint32Array(iCount / 3);

  // Prefijo reutilizado (sección 6c, G12).
  let firstRound = 0;
  const old = opts.reuse?.mesh ? META.get(opts.reuse.mesh) : undefined;
  if (old && opts.reuse) {
    const cap = typeof opts.reuse.fromRound === "number" && !Number.isNaN(opts.reuse.fromRound) ? Math.max(0, opts.reuse.fromRound) : 0;
    firstRound = reusableRounds(old, meta, Math.min(cap, roundsDone));
    if (firstRound > 0) {
      const src = opts.reuse.mesh;
      const v = roundVertexStart[firstRound]!;
      const ix = roundIndexStart[firstRound]!;
      // Con la misma clave de vueltas y el mismo perfil, los tamaños coinciden; si no, no se copia.
      if (old.roundVertexStart[firstRound] !== v || old.roundIndexStart[firstRound] !== ix || src.vertexCount < v || src.indexCount < ix) firstRound = 0;
      else {
        positions.set(src.positions.subarray(0, v * 3));
        normals.set(src.normals.subarray(0, v * 3));
        uvs.set(src.uvs.subarray(0, v * 2));
        yarn.set(src.yarn.subarray(0, v));
        loop.set(src.loop.subarray(0, v));
        indices.set(src.indices.subarray(0, ix));
        faceStitch.set(src.faceStitch.subarray(0, ix / 3));
      }
    }
  }

  // Llenado.
  let v = roundVertexStart[firstRound]!;
  let ix = roundIndexStart[firstRound]!;
  let global = roundStart[firstRound]!;
  const ringLast = rg ? rg.count - 1 : pg!.count - 1;

  const putRing = (j: number, f: number, u: number, w: number, y: number, lp: number): number => {
    const k3 = v * 3;
    if (ringLast < 0) {
      normals[k3 + 2] = 1;
    } else {
      const jj = j > ringLast ? ringLast : j;
      const g = rg!;
      const angle = TWO_PI * (f + (ringPhase[j] ?? 0));
      const cs = Math.cos(angle);
      const sn = Math.sin(angle);
      const r = g.r[jj]!;
      positions[k3] = r * cs;
      positions[k3 + 1] = r * sn;
      positions[k3 + 2] = ringZ(g, jj, f);
      normals[k3] = g.nr[jj]! * cs;
      normals[k3 + 1] = g.nr[jj]! * sn;
      normals[k3 + 2] = g.nz[jj]!;
    }
    uvs[v * 2] = u;
    uvs[v * 2 + 1] = w;
    yarn[v] = y;
    loop[v] = lp;
    return v++;
  };

  /** `edge` 0 = borde de abajo de la fila `i`, 1 = borde de arriba. */
  const putRow = (i: number, edge: 0 | 1, f: number, u: number, w: number, y: number, lp: number): number => {
    const k3 = v * 3;
    if (ringLast >= 0) {
      const g = pg!;
      const ii = i > ringLast ? ringLast : i;
      const width = edge === 1 || ii === 0 ? g.width[ii]! : g.width[ii - 1]!;
      positions[k3] = panelX(width, f, ii % 2 === 1);
      positions[k3 + 2] = edge === 1 ? g.top[ii]! : g.bottom[ii]!;
    }
    // El panel mira hacia −y (con el orden de los triángulos de abajo).
    normals[k3 + 1] = -1;
    uvs[v * 2] = u;
    uvs[v * 2 + 1] = w;
    yarn[v] = y;
    loop[v] = lp;
    return v++;
  };

  for (let c = firstRound; c < included; c++) {
    roundStart[c] = global;
    const plan = plans[c]!;
    const C = plan.consumed;
    const N = plan.produced;
    const cap = c < roundsDone ? Infinity : stitchesDone;
    const flip = !revolution && c % 2 === 1;
    let B = 0;
    let T = 0;
    let local = 0;
    outer: for (const s of plan.stitches) {
      if (!hasStitch(s.stitch)) continue;
      const { consumes: a, produces: b } = STITCHES[s.stitch];
      const y = yarnOf(s.yarn);
      const lp = loopCode(s);
      for (let j = 0; j < b; j++) {
        if (local >= cap) break outer;
        const lo = B + (a * j) / b;
        const hi = B + (a * (j + 1)) / b;
        const tf0 = N > 0 ? (T + j) / N : 0;
        const tf1 = N > 0 ? (T + j + 1) / N : 0;
        const base = v;
        // Base: extremos y posiciones enteras intermedias.
        if (a <= 0) {
          const f = C > 0 ? lo / C : (tf0 + tf1) / 2;
          if (revolution) putRing(c, f, 0.5, 0, y, lp);
          else putRow(c, 0, f, 0.5, 0, y, lp);
        } else {
          const first = floorDiv(a * j, b) + 1;
          const last = ceilDiv(a * (j + 1), b) - 1;
          const span = hi - lo;
          const put = (pt: number) => {
            const f = C > 0 ? pt / C : (tf0 + tf1) / 2;
            const u = span > 0 ? (pt - lo) / span : 0.5;
            if (revolution) putRing(c, f, u, 0, y, lp);
            else putRow(c, 0, f, u, 0, y, lp);
          };
          put(lo);
          for (let k = first; k <= last; k++) put(B + k);
          put(hi);
        }
        const t0 = revolution ? putRing(c + 1, tf0, 0, 1, y, lp) : putRow(c, 1, tf0, 0, 1, y, lp);
        const t1 = revolution ? putRing(c + 1, tf1, 1, 1, y, lp) : putRow(c, 1, tf1, 1, 1, y, lp);
        // Abanico desde el vértice de arriba a la izquierda (antihorario visto desde afuera).
        const m = t0 - base - 1;
        for (let k = 0; k <= m; k++) {
          const p = base + k;
          const q = k < m ? base + k + 1 : t1;
          indices[ix] = t0;
          indices[ix + 1] = flip ? q : p;
          indices[ix + 2] = flip ? p : q;
          faceStitch[ix / 3] = global;
          ix += 3;
        }
        global++;
        local++;
      }
      B += a;
      T += b;
    }
  }
  roundStart[included] = global;
  meta.reused = firstRound;

  const mesh: PartMesh = {
    positions,
    normals,
    uvs,
    yarn,
    loop,
    indices,
    faceStitch,
    roundStart,
    ringPhase,
    vertexCount: vCount,
    indexCount: iCount,
    bounds: boundsOf(positions, vCount),
  };
  META.set(mesh, meta);
  return mesh;
}

function boundsOf(p: Float32Array, n: number): { min: Vec3; max: Vec3 } {
  if (n === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n * 3; i += 3) {
    for (let k = 0; k < 3; k++) {
      const x = p[i + k]!;
      if (x < min[k]!) min[k] = x;
      if (x > max[k]!) max[k] = x;
    }
  }
  return { min, max };
}

// ------------------------------------------------------------------ recolorear

/**
 * Reescribe `mesh.yarn` en el lugar, sin tocar posiciones, para una parte con la misma
 * `shapeSignature` que la que armó la malla. Devuelve el rango de vértices que cambiaron,
 * `[from, to)` (vacío si ninguno), para subir solo ese tramo del atributo.
 */
export function colorizePartMesh(mesh: PartMesh, part: Part, yarnIds: readonly string[]): { from: number; to: number } {
  const yarnOf = yarnIndexer(yarnIds);
  const total = mesh.roundStart[mesh.roundStart.length - 1] ?? 0;
  const out = mesh.yarn;
  const vMax = Math.min(mesh.vertexCount, out.length);
  let from = Infinity;
  let to = 0;
  let g = 0;
  let v = 0;
  const concrete = concreteRounds(part);
  const rounds = Math.min(concrete.length, mesh.roundStart.length - 1);
  done: for (let c = 0; c < rounds; c++) {
    const cr = concrete[c]!;
    for (const s of expandRound(cr.round, cr.startYarn).stitches) {
      if (!hasStitch(s.stitch)) continue;
      const { consumes: a, produces: b } = STITCHES[s.stitch];
      const y = yarnOf(s.yarn);
      for (let j = 0; j < b; j++) {
        if (g >= total) break done;
        const nv = bottomPointCount(a, b, j) + 2;
        if (v + nv > vMax) break done;
        for (let k = v; k < v + nv; k++) {
          if (out[k] !== y) {
            out[k] = y;
            if (k < from) from = k;
            to = k + 1;
          }
        }
        v += nv;
        g++;
      }
    }
  }
  return from === Infinity ? { from: 0, to: 0 } : { from, to };
}

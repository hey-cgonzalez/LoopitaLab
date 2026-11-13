/**
 * Malla sintética del prototipo T3b (fase 4). NO es `buildPartMesh` (eso es T11, en `packages/viewer-3d`): aquí no se
 * lee ningún patrón ni se cuenta nada del modelo canónico. Solo reproduce la forma de los datos que fija el ADR 0010
 * (sección 3) para medir el costo de llenar y subir atributos:
 *
 * - vértices propios por punto (un `sc` = 4 vértices y 2 triángulos; un aumento o una disminución = 5 y 3);
 * - `position`, `normal` (analítica, del perfil de revolución), `uv` (0 a 1 dentro del punto) y `yarn` (Uint8);
 * - índices Uint32.
 *
 * La "pieza" es una esfera de punto bajo: anillo de `start`, aumentos parejos hasta `max`, `flat + 1` vueltas rectas y
 * disminuciones parejas hasta `start`. Con start 6, max 72 y 22: 45 vueltas, 2.448 puntos y 9.660 vértices (un poco
 * más pesada que el cuerpo del escenario de referencia del ADR 0010, sección 6, que tiene unos 1.900 puntos).
 */

export interface SphereSpec {
  start: number;
  max: number;
  flat: number;
  /** Ancho y alto del punto en cm (supuestos; la muestra real la resuelve `shapeMetrics` en T5). */
  widthCm: number;
  heightCm: number;
}

export const REFERENCE_SPHERE: SphereSpec = { start: 6, max: 72, flat: 22, widthCm: 0.5, heightCm: 0.45 };

/** Conteos por vuelta de la esfera (lo que en T5 sale de `concreteRounds`). */
export function sphereCounts(spec: SphereSpec): number[] {
  const counts: number[] = [];
  for (let n = spec.start; n < spec.max; n += spec.start) counts.push(n);
  for (let k = 0; k <= spec.flat; k++) counts.push(spec.max);
  for (let n = spec.max - spec.start; n >= spec.start; n -= spec.start) counts.push(n);
  return counts;
}

/** Cuántos vértices e índices hace falta reservar para estos conteos (inicio con anillo de `counts[0]`). */
export function meshSize(counts: readonly number[]): { stitches: number; vertices: number; indices: number } {
  let stitches = 0;
  let vertices = 0;
  let indices = 0;
  let prev = counts[0] ?? 0;
  for (const n of counts) {
    const changes = Math.abs(n - prev);
    const plain = Math.min(n, prev) - changes;
    stitches += n;
    vertices += plain * 4 + changes * 5;
    indices += plain * 6 + changes * 9;
    prev = n;
  }
  return { stitches, vertices, indices };
}

export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  yarn: Uint8Array;
  indices: Uint32Array;
}

export interface FillResult {
  vertexCount: number;
  indexCount: number;
  stitches: number;
  /** Primer vértice de cada vuelta (largo = vueltas + 1), para recolorear un rango. */
  roundVertexStart: number[];
  radius: number;
  height: number;
}

export function allocBuffers(vertices: number, indices: number): MeshBuffers {
  return {
    positions: new Float32Array(vertices * 3),
    normals: new Float32Array(vertices * 3),
    uvs: new Float32Array(vertices * 2),
    yarn: new Uint8Array(vertices),
    indices: new Uint32Array(indices),
  };
}

/**
 * Llena `out` en el lugar (sin crear arreglos) con la malla de los conteos dados.
 * `yarnOf(round, stitch)` da la lana de cada punto. `offset` desplaza la pieza (para escenas de varias piezas en una
 * sola geometría, como la prueba de 40.000 y 60.000 puntos).
 */
export function fillMesh(
  out: MeshBuffers,
  counts: readonly number[],
  spec: SphereSpec,
  yarnOf: (round: number, stitch: number) => number,
  offset: readonly [number, number, number] = [0, 0, 0],
  base: { vertex: number; index: number } = { vertex: 0, index: 0 },
): FillResult {
  const { positions: P, normals: N, uvs: U, yarn: Y, indices: I } = out;
  const rings = counts.length + 1;
  // Perfil (lo que en T5 es `partProfile`): radio por circunferencia y z con el alto del punto sobre el meridiano.
  const r = new Float64Array(rings);
  const z = new Float64Array(rings);
  r[0] = 0; // anillo mágico
  for (let i = 1; i < rings; i++) {
    const n = counts[i - 1] ?? 0;
    r[i] = (n * spec.widthCm) / (2 * Math.PI);
    const dr = r[i]! - r[i - 1]!;
    z[i] = z[i - 1]! + Math.sqrt(Math.max(spec.heightCm * spec.heightCm - dr * dr, spec.heightCm * spec.heightCm * 0.04));
  }
  // Normal del meridiano por anillo (promedio de los dos tramos vecinos).
  const nr = new Float64Array(rings);
  const nz = new Float64Array(rings);
  for (let i = 0; i < rings; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(rings - 1, i + 1);
    const tr = r[b]! - r[a]!;
    const tz = z[b]! - z[a]!;
    const len = Math.hypot(tr, tz) || 1;
    nr[i] = tz / len;
    nz[i] = -tr / len;
  }
  let v = base.vertex;
  let ix = base.index;
  let stitches = 0;
  const roundVertexStart: number[] = [];
  const [ox, oy, oz] = offset;

  const put = (ring: number, angle: number, u: number, vv: number, yarn: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const k3 = v * 3;
    P[k3] = ox + r[ring]! * c;
    P[k3 + 1] = oy + r[ring]! * s;
    P[k3 + 2] = oz + z[ring]!;
    N[k3] = nr[ring]! * c;
    N[k3 + 1] = nr[ring]! * s;
    N[k3 + 2] = nz[ring]!;
    U[v * 2] = u;
    U[v * 2 + 1] = vv;
    Y[v] = yarn;
    return v++;
  };

  let prev = counts[0] ?? 0;
  for (let round = 0; round < counts.length; round++) {
    roundVertexStart.push(v);
    const n = counts[round]!;
    const lo = round; // anillo de abajo
    const hi = round + 1; // anillo de arriba
    const incs = Math.max(0, n - prev);
    const decs = Math.max(0, prev - n);
    // Secuencia de la vuelta: puntos que consumen 1 o 2 abajo y producen 1 o 2 arriba, repartidos parejos.
    const total = n - incs; // puntos de trabajo (cada aumento cuenta como uno que produce 2)
    let bottom = 0;
    let top = 0;
    let doneChanges = 0;
    const changes = incs + decs;
    for (let k = 0; k < total; k++) {
      const isChange = changes > 0 && Math.floor(((k + 1) * changes) / total) > doneChanges;
      if (isChange) doneChanges++;
      const consumes = isChange && decs > 0 ? 2 : 1;
      const produces = isChange && incs > 0 ? 2 : 1;
      const yarn = yarnOf(round, top);
      const a0 = (2 * Math.PI * bottom) / prev;
      const a2 = (2 * Math.PI * (bottom + consumes)) / prev;
      const b0 = (2 * Math.PI * top) / n;
      const b2 = (2 * Math.PI * (top + produces)) / n;
      if (consumes === 1 && produces === 1) {
        const p0 = put(lo, a0, 0, 0, yarn);
        const p1 = put(lo, a2, 1, 0, yarn);
        const p2 = put(hi, b2, 1, 1, yarn);
        const p3 = put(hi, b0, 0, 1, yarn);
        I[ix++] = p0; I[ix++] = p1; I[ix++] = p2;
        I[ix++] = p0; I[ix++] = p2; I[ix++] = p3;
      } else if (produces === 2) {
        // Aumento: abanico de 1 posición abajo a 2 arriba.
        const p0 = put(lo, a0, 0, 0, yarn);
        const p1 = put(lo, a2, 1, 0, yarn);
        const p2 = put(hi, b2, 1, 1, yarn);
        const p3 = put(hi, (b0 + b2) / 2, 0.5, 1, yarn);
        const p4 = put(hi, b0, 0, 1, yarn);
        I[ix++] = p0; I[ix++] = p1; I[ix++] = p2;
        I[ix++] = p0; I[ix++] = p2; I[ix++] = p3;
        I[ix++] = p0; I[ix++] = p3; I[ix++] = p4;
      } else {
        // Disminución: 2 posiciones abajo a 1 arriba.
        const p0 = put(lo, a0, 0, 0, yarn);
        const p1 = put(lo, (a0 + a2) / 2, 0.5, 0, yarn);
        const p2 = put(lo, a2, 1, 0, yarn);
        const p3 = put(hi, b2, 1, 1, yarn);
        const p4 = put(hi, b0, 0, 1, yarn);
        I[ix++] = p0; I[ix++] = p1; I[ix++] = p4;
        I[ix++] = p1; I[ix++] = p3; I[ix++] = p4;
        I[ix++] = p1; I[ix++] = p2; I[ix++] = p3;
      }
      bottom += consumes;
      top += produces;
    }
    stitches += n;
    prev = n;
  }
  roundVertexStart.push(v);
  return { vertexCount: v - base.vertex, indexCount: ix - base.index, stitches, roundVertexStart, radius: Math.max(...r), height: z[rings - 1]! };
}

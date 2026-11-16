/**
 * Geometría compartida por la malla (`mesh.ts`) y el marco de superficie (`frame.ts`), para
 * que un ancla caiga exactamente sobre la malla del anfitrión. Todo sale del perfil de
 * `pattern-core` (`partProfile`): aquí no se cuenta nada (regla de oro 2).
 */
import type { PanelProfile, RevolutionProfile } from "@loopitalab/pattern-core";

export const TWO_PI = Math.PI * 2;

/** Anillos de una superficie de revolución con la normal del meridiano ya calculada. */
export interface RingGeometry {
  count: number;
  r: Float64Array;
  z: Float64Array;
  /** Subida de cada anillo respecto del anterior (0 en el anillo 0). En espiral, la hélice. */
  dz: Float64Array;
  /** Normal del meridiano: componente radial y vertical (unitaria). */
  nr: Float64Array;
  nz: Float64Array;
  spiral: boolean;
}

const finite = (x: number): number => (Number.isFinite(x) ? x : 0);

/**
 * Normal analítica por anillo: perpendicular a la tangente del meridiano (diferencia central
 * entre los anillos vecinos; en los extremos, hacia un lado). Con `tangent × meridian` hacia
 * afuera: un cilindro mira en sentido radial, el disco del inicio hacia −z y el cierre hacia +z.
 */
export function revolutionGeometry(profile: RevolutionProfile): RingGeometry {
  const rings = Array.isArray(profile.rings) ? profile.rings : [];
  const n = rings.length;
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const dz = new Float64Array(n);
  const nr = new Float64Array(n);
  const nz = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const ring = rings[j];
    r[j] = Math.max(0, finite(ring?.radiusCm ?? 0));
    z[j] = finite(ring?.zCm ?? 0);
    dz[j] = j === 0 ? 0 : z[j]! - z[j - 1]!;
  }
  for (let j = 0; j < n; j++) {
    let [tr, tz] = tangentBetween(r, z, Math.max(0, j - 1), Math.min(n - 1, j + 1));
    if (tr === 0 && tz === 0) [tr, tz] = tangentBetween(r, z, j, Math.min(n - 1, j + 1));
    if (tr === 0 && tz === 0) [tr, tz] = tangentBetween(r, z, Math.max(0, j - 1), j);
    if (tr === 0 && tz === 0) {
      // Anillos coincidentes (vueltas vacías): normal radial, sin NaN.
      nr[j] = 1;
      nz[j] = 0;
    } else {
      nr[j] = tz;
      nz[j] = -tr;
    }
  }
  return { count: n, r, z, dz, nr, nz, spiral: profile.spiral === true };
}

function tangentBetween(r: Float64Array, z: Float64Array, a: number, b: number): [number, number] {
  const tr = r[b]! - r[a]!;
  const tz = z[b]! - z[a]!;
  const len = Math.hypot(tr, tz);
  return len > 1e-12 ? [tr / len, tz / len] : [0, 0];
}

/**
 * Altura de un punto del anillo `j` en la fracción `f` (0 a 1) de la vuelta. En espiral el
 * anillo es una hélice que sube desde el anillo anterior (`f = 0`) hasta el suyo (`f = 1`):
 * el punto `k` sube `Δz × k / n` (sección 3) y la hélice es continua de una vuelta a la
 * siguiente (con el radio y el giro de `ringPoint`); el único escalón es el final de la última
 * vuelta, que queda abierta. En vueltas unidas, plano.
 */
export function ringZ(g: RingGeometry, j: number, f: number): number {
  return g.spiral ? g.z[j]! - g.dz[j]! * (1 - f) : g.z[j]!;
}

/** Punto del anillo `j` en la fracción `f`: radio, ángulo (rad), altura y normal del meridiano (unitaria). */
export interface RingPoint {
  r: number;
  angle: number;
  z: number;
  nr: number;
  nz: number;
}

/** Diferencia de giro entre dos anillos, en vueltas, llevada a [−0,5; 0,5) (el giro se guarda módulo 1). */
const phaseStep = (a: number, b: number): number => {
  const d = b - a;
  return d - Math.round(d);
};

/**
 * Punto del anillo `j` en la fracción `f` (0 a 1) de la vuelta, con el giro por anillo `phase`
 * (`ringPhase` de la malla; sin él, 0). Lo usan la malla y el marco de las anclas, así un ancla
 * cae sobre la malla.
 *
 * En espiral el anillo es una **hélice continua** (corrección T21, la "lengüeta" de la esfera):
 * desde el anillo 2, el radio, la altura, el giro y la normal van del anillo anterior (`f = 0`)
 * al suyo (`f = 1`), así que el final de cada vuelta coincide con el inicio de la siguiente. Antes
 * solo subía la altura y el radio quedaba fijo: en la línea de inicio de vuelta quedaba una
 * ranura de ancho |Δr| por vuelta, que en los cierres (Δr cercano al alto de la vuelta) se veía
 * como una tira plana. El anillo 1 (la V1, sobre el anillo mágico o la cadeneta) no interpola el
 * radio: sus puntos están todos en el inicio. En vueltas unidas, anillos planos. `out` se
 * reutiliza si se pasa (la malla no crea un objeto por vértice).
 */
export function ringPoint(g: RingGeometry, phase: ArrayLike<number> | undefined, j: number, f: number, out?: RingPoint): RingPoint {
  const p = out ?? { r: 0, angle: 0, z: 0, nr: 0, nz: 0 };
  p.angle = TWO_PI * ringTurn(g, phase, j, f);
  p.z = ringZ(g, j, f);
  if (!g.spiral || j < 2) {
    p.r = g.r[j]!;
    p.nr = g.nr[j]!;
    p.nz = g.nz[j]!;
    return p;
  }
  const t = 1 - f;
  p.r = g.r[j]! - (g.r[j]! - g.r[j - 1]!) * t;
  const nr = g.nr[j]! - (g.nr[j]! - g.nr[j - 1]!) * t;
  const nz = g.nz[j]! - (g.nz[j]! - g.nz[j - 1]!) * t;
  const len = Math.sqrt(nr * nr + nz * nz);
  if (len > 1e-12) {
    p.nr = nr / len;
    p.nz = nz / len;
  } else {
    p.nr = g.nr[j]!;
    p.nz = g.nz[j]!;
  }
  return p;
}

/** Ángulo del punto del anillo `j` en la fracción `f`, en vueltas (sin reducir módulo 1). Ver `ringPoint`. */
export function ringTurn(g: RingGeometry, phase: ArrayLike<number> | undefined, j: number, f: number): number {
  const pj = finite(phase?.[j] ?? 0);
  if (!g.spiral || j < 2) return f + pj;
  return f + pj - phaseStep(finite(phase?.[j - 1] ?? 0), pj) * (1 - f);
}

/** Filas de un panel (`construction: "flat"`). */
export interface PanelGeometry {
  count: number;
  /** Ancho de cada fila y del borde inferior de la fila 0 (la base es la propia fila 0). */
  width: Float64Array;
  top: Float64Array;
  bottom: Float64Array;
}

export function panelGeometry(profile: PanelProfile): PanelGeometry {
  const rows = Array.isArray(profile.rows) ? profile.rows : [];
  const n = rows.length;
  const width = new Float64Array(n);
  const top = new Float64Array(n);
  const bottom = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const row = rows[i];
    width[i] = Math.max(0, finite(row?.widthCm ?? 0));
    top[i] = finite(row?.yCm ?? 0);
    bottom[i] = top[i]! - Math.max(0, finite(row?.heightCm ?? 0));
  }
  return { count: n, width, top, bottom };
}

/**
 * x de la fracción `f` de un borde de ancho `w`, centrado. Las filas impares (índice 0-based)
 * se tejen de derecha a izquierda (sección 2, hileras): así el color queda donde se tejió.
 */
export function panelX(w: number, f: number, reversed: boolean): number {
  return reversed ? w / 2 - f * w : -w / 2 + f * w;
}

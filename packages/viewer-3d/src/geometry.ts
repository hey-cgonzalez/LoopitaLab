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
 * siguiente; el escalón se ve en la línea de inicio de vuelta. En vueltas unidas, plano.
 */
export function ringZ(g: RingGeometry, j: number, f: number): number {
  return g.spiral ? g.z[j]! - g.dz[j]! * (1 - f) : g.z[j]!;
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

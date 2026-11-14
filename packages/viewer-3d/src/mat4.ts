/**
 * Matrices 4 × 4 en columna mayor (como `three` y WebGL), en Float64 mientras se componen.
 * Solo lo que necesita la escena: traslación, rotaciones de Euler y producto.
 */
export type Mat4 = Float64Array;

export function identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

const RAD = Math.PI / 180;

export function rotationX(deg: number): Mat4 {
  const m = identity();
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function rotationY(deg: number): Mat4 {
  const m = identity();
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function rotationZ(deg: number): Mat4 {
  const m = identity();
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/** Euler XYZ como `THREE.Euler` con orden "XYZ": Rx · Ry · Rz. */
export function eulerXYZ(x: number, y: number, z: number): Mat4 {
  return multiply(multiply(rotationX(x), rotationY(y)), rotationZ(z));
}

/** Base con columnas x, y, z dadas (vectores unitarios ortogonales). */
export function basis(x: readonly number[], y: readonly number[], z: readonly number[]): Mat4 {
  const m = identity();
  m[0] = x[0]!; m[1] = x[1]!; m[2] = x[2]!;
  m[4] = y[0]!; m[5] = y[1]!; m[6] = y[2]!;
  m[8] = z[0]!; m[9] = z[1]!; m[10] = z[2]!;
  return m;
}

export function transformPoint(m: Mat4, p: readonly number[]): [number, number, number] {
  const x = p[0]!, y = p[1]!, z = p[2]!;
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}

export const finiteOr = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);

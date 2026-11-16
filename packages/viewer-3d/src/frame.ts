/**
 * Marco de la superficie de una parte en una vuelta y un punto (ADR 0010, sección 3; ADR 0011,
 * `SurfaceAt`). Usa la misma geometría que `buildPartMesh`, así que el ancla cae sobre la malla.
 */
import type { PartProfile } from "@loopitalab/pattern-core";
import { panelGeometry, panelX, revolutionGeometry, ringPoint } from "./geometry.ts";
import type { Frame, PartMesh, Vec3 } from "./types.ts";

/** Índice del anillo o fila con ese número visible; si no existe, el más cercano (acotado). */
function pickIndex(numbers: readonly number[], round: number): { index: number; clamped: boolean } {
  if (numbers.length === 0) return { index: -1, clamped: true };
  if (!Number.isFinite(round)) return { index: 0, clamped: true };
  const exact = numbers.indexOf(round);
  if (exact >= 0) return { index: exact, clamped: false };
  let best = 0;
  let bestD = Infinity;
  numbers.forEach((n, i) => {
    const d = Math.abs(n - round);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { index: best, clamped: true };
}

function pickStitch(stitch: number, count: number): { stitch: number; clamped: boolean } {
  const max = Math.max(0, count - 1);
  if (!Number.isFinite(stitch)) return { stitch: 0, clamped: true };
  const s = Math.floor(stitch);
  const k = s < 0 ? 0 : s > max ? max : s;
  return { stitch: k, clamped: k !== stitch };
}

const DEFAULT_FRAME = (round: number): Frame => ({
  position: [0, 0, 0],
  normal: [0, 0, -1],
  tangent: [1, 0, 0],
  meridian: [0, -1, 0],
  round,
  stitch: 0,
  clamped: true,
});

/**
 * Superficie en la vuelta `round` (número visible, como en el texto: V10 es 10; 0 es el
 * inicio) y el punto `stitch` (0-based desde el inicio de la vuelta). La posición es el centro
 * del borde superior del punto, es decir, "entre la V10 y la V11". En hileras, `round` es la
 * fila. Acota la vuelta y el punto fuera de rango sin lanzar (G9) y lo informa en `clamped`.
 *
 * Con `opts.mesh` (la malla armada con este perfil) se usa su giro por anillo (`ringPhase`), así
 * el marco cae sobre el punto `stitch` de la malla. Sin ella, el giro es 0: la posición sigue
 * sobre la superficie de revolución, pero el ángulo puede no coincidir con ese punto.
 */
export function surfaceFrame(profile: PartProfile, round: number, stitch: number, opts: { mesh?: PartMesh } = {}): Frame {
  if (profile?.kind === "panel") return panelFrame(profile, round, stitch);
  const rings = Array.isArray(profile?.rings) ? profile.rings : [];
  const picked = pickIndex(rings.map((r) => r.round), round);
  if (picked.index < 0) return DEFAULT_FRAME(0);
  const g = revolutionGeometry(profile);
  const j = picked.index;
  const n = rings[j]!.stitches;
  const s = pickStitch(stitch, n);
  const f = n > 0 ? (s.stitch + 0.5) / n : 0;
  // La misma hélice que la malla (`ringPoint`): en espiral, radio, altura y giro van del anillo anterior al suyo.
  // El ángulo es el del centro del borde de arriba del punto en la malla (promedio de sus dos vértices de
  // tope): en espiral el radio cambia a lo largo de la vuelta y ese centro no cae justo en el ángulo de `f`.
  const phase = opts?.mesh?.ringPhase;
  const p = ringPoint(g, phase, j, f);
  const a = n > 0 ? ringPoint(g, phase, j, s.stitch / n) : p;
  const b = n > 0 ? ringPoint(g, phase, j, (s.stitch + 1) / n) : p;
  const mx = a.r * Math.cos(a.angle) + b.r * Math.cos(b.angle);
  const my = a.r * Math.sin(a.angle) + b.r * Math.sin(b.angle);
  const angle = Math.hypot(mx, my) > 1e-12 ? Math.atan2(my, mx) : p.angle;
  const cs = Math.cos(angle);
  const sn = Math.sin(angle);
  // Meridiano: la tangente del perfil (nz, −nr rotada) hacia las vueltas siguientes.
  const mr = -p.nz;
  const mz = p.nr;
  const normal: Vec3 = [p.nr * cs, p.nr * sn, p.nz];
  const tangent: Vec3 = [-sn, cs, 0];
  const meridian: Vec3 = [mr * cs, mr * sn, mz];
  return {
    position: [p.r * cs, p.r * sn, p.z],
    normal,
    tangent,
    meridian,
    round: rings[j]!.round,
    stitch: s.stitch,
    clamped: picked.clamped || s.clamped,
  };
}

function panelFrame(profile: Extract<PartProfile, { kind: "panel" }>, round: number, stitch: number): Frame {
  const rows = Array.isArray(profile.rows) ? profile.rows : [];
  if (rows.length === 0) return DEFAULT_FRAME(0);
  // La fila 0 es el borde de abajo (la cadeneta base), como el anillo 0 en redondo.
  const numbers = [0, ...rows.map((r) => r.row)];
  const picked = pickIndex(numbers, round);
  const g = panelGeometry(profile);
  const i = Math.max(0, picked.index - 1);
  const onBase = picked.index === 0;
  const n = rows[i]!.stitches;
  const s = pickStitch(stitch, n);
  const f = n > 0 ? (s.stitch + 0.5) / n : 0.5;
  // El punto se ubica donde se tejió (las filas impares van de derecha a izquierda), pero el
  // marco no se da vuelta con la fila: una pieza cosida no gira 180° al cambiar de fila.
  const reversed = i % 2 === 1;
  return {
    position: [panelX(g.width[i]!, f, reversed), 0, onBase ? g.bottom[0]! : g.top[i]!],
    normal: [0, -1, 0],
    // tangent × meridian = normal: tangente +x, meridiano +z, normal −y.
    tangent: [1, 0, 0],
    meridian: [0, 0, 1],
    round: numbers[picked.index]!,
    stitch: s.stitch,
    clamped: picked.clamped || s.clamped,
  };
}

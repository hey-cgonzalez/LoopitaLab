/**
 * Silueta de una parte como SVG (ADR 0010, secciones 3, 6b y 8): para cuando no hay WebGL2,
 * con el contexto perdido o sobre `SCENE_HARD_STITCH_CAP`. Cuesta lo que las vueltas, no lo que
 * los puntos. Se rellena con un color plano (la lana inicial de la parte, que pasa la aplicación);
 * el aspecto por fibra no se muestra aquí.
 */
import type { PartProfile } from "@loopitalab/pattern-core";

/** Gris medio cuando el color no es #RRGGBB (mismo valor que `FALLBACK_HEX` de `stitch-render`). */
export const SILHOUETTE_FALLBACK_HEX = "#8C8C8C";

export interface ProfileSvgOptions {
  /** Ancho del SVG en px. Por omisión, 160. El alto sale de la proporción de la pieza (como mucho, el ancho). */
  widthPx?: number;
  /** Color de relleno #RRGGBB. Otro valor usa `SILHOUETTE_FALLBACK_HEX`. */
  fill?: string;
  /** Texto accesible (`<title>`), por ejemplo "Cuerpo: ≈ 12 cm de alto". Se escapa. */
  title?: string;
}

const MARGIN_PX = 4;

const escapeXml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const num = (x: number): string => {
  const v = Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
  return Object.is(v, -0) ? "0" : String(v);
};

/** Contorno en cm, con x centrado y z hacia arriba. */
function outline(profile: PartProfile): Array<[number, number]> {
  const right: Array<[number, number]> = [];
  if (profile?.kind === "panel") {
    const rows = Array.isArray(profile.rows) ? profile.rows : [];
    rows.forEach((row) => {
      const w = Math.max(0, row.widthCm) / 2;
      right.push([w, row.yCm - row.heightCm], [w, row.yCm]);
    });
  } else {
    const rings = Array.isArray(profile?.rings) ? profile.rings : [];
    for (const ring of rings) right.push([Math.max(0, ring.radiusCm), ring.zCm]);
  }
  const left = right.map(([x, z]) => [-x, z] as [number, number]).reverse();
  return [...right, ...left];
}

export function profileToSvg(profile: PartProfile, opts: ProfileSvgOptions = {}): string {
  const widthPx = typeof opts.widthPx === "number" && Number.isFinite(opts.widthPx) && opts.widthPx >= 16 ? Math.min(opts.widthPx, 4096) : 160;
  const fill = typeof opts.fill === "string" && /^#[0-9a-fA-F]{6}$/.test(opts.fill) ? opts.fill.toUpperCase() : SILHOUETTE_FALLBACK_HEX;
  const pts = outline(profile).filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z));
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;
  for (const [x, z] of pts) {
    if (Math.abs(x) > maxX) maxX = Math.abs(x);
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const w = 2 * maxX;
  const h = maxZ - minZ;
  const inner = widthPx - 2 * MARGIN_PX;
  const scale = Math.max(w, h) > 0 ? inner / Math.max(w, h) : 0;
  const heightPx = Math.max(2 * MARGIN_PX, Math.round(h * scale + 2 * MARGIN_PX));
  const cx = widthPx / 2;
  const title = typeof opts.title === "string" && opts.title !== "" ? `<title>${escapeXml(opts.title)}</title>` : "";
  let path = "";
  if (scale > 0 && pts.length >= 3) {
    path = pts.map(([x, z], i) => `${i === 0 ? "M" : "L"}${num(cx + x * scale)} ${num(heightPx - MARGIN_PX - (z - minZ) * scale)}`).join(" ") + " Z";
  }
  const shape = path ? `<path d="${path}" fill="${fill}" stroke="rgba(0,0,0,0.35)" stroke-width="1" stroke-linejoin="round"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" role="img">${title}${shape}</svg>`;
}

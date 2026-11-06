/** Color de la letra de una lana sobre su casilla (CA-A2): negro o blanco, el que dé más contraste (WCAG, mínimo 4,5:1). */

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa WCAG de un `#RRGGBB`; un valor mal formado cuenta como gris medio. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return 0.2;
  return 0.2126 * channel(parseInt(m[1] as string, 16)) + 0.7152 * channel(parseInt(m[2] as string, 16)) + 0.0722 * channel(parseInt(m[3] as string, 16));
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function inkFor(hex: string): "#000000" | "#FFFFFF" {
  return contrastRatio(hex, "#000000") >= contrastRatio(hex, "#FFFFFF") ? "#000000" : "#FFFFFF";
}

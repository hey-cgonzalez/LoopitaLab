/**
 * Utilidades de texto para los derivados: escape XML, colores seguros y números en
 * español (la letra de cada lana es `yarnLetter` de `pattern-core`). Funciones puras, sin I/O.
 *
 * Seguridad: el SVG se inserta en la web. Todo texto que viene del documento (título,
 * notas, identificadores, colores, mensajes del validador) pasa por `escapeXml` antes de
 * llegar al SVG, y todo color pasa por `safeHex` antes de llegar a un atributo.
 */

/**
 * Caracteres que XML 1.0 no admite ni escapados (controles C0 salvo tab y saltos de
 * línea, U+FFFE, U+FFFF) y sustitutos UTF-16 sueltos. Se quitan: dejarían el SVG mal
 * formado y el navegador no lo dibujaría.
 */
const XML_INVALID_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Escapa texto para el contenido de un elemento o el valor de un atributo entre comillas dobles. */
export function escapeXml(value: unknown): string {
  const s = typeof value === "string" ? value : String(value);
  return s
    .replace(XML_INVALID_RE, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Gris neutro que reemplaza cualquier color que no sea `#RRGGBB`. */
export const FALLBACK_HEX = "#808080";

/** Devuelve el color en mayúsculas si es `#RRGGBB`; si no, `FALLBACK_HEX`. Nunca devuelve texto del documento sin revisar. */
export function safeHex(value: unknown): string {
  return typeof value === "string" && HEX_RE.test(value) ? value.toUpperCase() : FALLBACK_HEX;
}

/** true si el valor es un color `#RRGGBB`. */
export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/**
 * Entero en español: sin separador hasta 9999 y con punto de miles desde 10 000
 * ("12.500"), como recomienda la RAE para números de cuatro cifras. No depende de la
 * configuración regional del entorno, para que el resultado sea igual en todas partes.
 */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const sign = n < 0 ? "-" : "";
  const digits = String(Math.round(Math.abs(n)));
  if (digits.length <= 4) return sign + digits;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Número con hasta un decimal y coma decimal ("7,1"; "50"). */
export function formatDecimal(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * 10) / 10;
  if (Number.isInteger(r)) return formatInt(r);
  const [int = "0", dec = "0"] = Math.abs(r).toFixed(1).split(".");
  return `${r < 0 ? "-" : ""}${formatInt(Number(int))},${dec}`;
}

/** Luminancia relativa (WCAG) de un color `#RRGGBB`. */
function luminance(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
}

/** Negro o blanco, el que contraste más con el fondo `#RRGGBB` (para las letras por lana). */
export function contrastInk(hex: string): "#000000" | "#FFFFFF" {
  const l = luminance(safeHex(hex));
  // Contraste con negro: (l + 0,05) / 0,05; con blanco: 1,05 / (l + 0,05).
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#FFFFFF";
}

/** Hash FNV-1a de 32 bits en hexadecimal: prefijo estable para los `id` del SVG. */
export function hash32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

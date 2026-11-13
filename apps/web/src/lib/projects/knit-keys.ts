/*
 * Teclado de la pantalla "Tejiendo" (T12). Lógica pura, sin DOM.
 *
 * Avanzar: flecha derecha o abajo, Espacio, Enter y Av Pág. Retroceder: flecha izquierda o arriba, Retroceso y Re Pág.
 * Los pasapáginas Bluetooth envían flechas (izquierda/derecha o arriba/abajo) o Re Pág/Av Pág, así que cubren las dos
 * familias. Con Mayús, las flechas mueven por repetición horizontal en vez de por fila.
 * No se interpreta nada con Ctrl, Alt o Cmd, ni con el foco en un campo de texto (lo decide quien llama).
 */

export type KnitKeyAction = "next-row" | "prev-row" | "next-repeat" | "prev-repeat";

const NEXT = new Set(["ArrowRight", "ArrowDown", " ", "Spacebar", "Enter", "PageDown"]);
const PREV = new Set(["ArrowLeft", "ArrowUp", "Backspace", "PageUp"]);
const ARROWS = new Set(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]);

export function knitKeyAction(key: string, mods: { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean } = {}): KnitKeyAction | null {
  if (mods.ctrl || mods.alt || mods.meta) return null;
  const byRepeat = mods.shift === true && ARROWS.has(key);
  if (NEXT.has(key)) return byRepeat ? "next-repeat" : "next-row";
  if (PREV.has(key)) return byRepeat ? "prev-repeat" : "prev-row";
  return null;
}

/** ¿El foco está en un campo donde las teclas escriben? Ahí no se avanza. */
export function isTextTarget(tag: string | undefined, editable: boolean): boolean {
  if (editable) return true;
  const t = (tag ?? "").toUpperCase();
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
}

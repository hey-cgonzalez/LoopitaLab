/*
 * Mano para los botones de "Tejiendo" (T13): preferencia local del dispositivo (`loopitalab:tejiendo:mano`, "left" o
 * "right") que, si existe, manda sobre `profiles.dominant_hand`. Sin valor se usa la mano de la cuenta. No lleva datos
 * personales.
 */

export const HAND_STORAGE_KEY = "loopitalab:tejiendo:mano";

export type Hand = "right" | "left";

interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Mano guardada en este dispositivo o `null` si no hay (o el valor no se reconoce). */
export function readHandPreference(storage: PrefStorage | null | undefined): Hand | null {
  try {
    const v = storage?.getItem(HAND_STORAGE_KEY);
    return v === "left" || v === "right" ? v : null;
  } catch {
    return null;
  }
}

export function writeHandPreference(storage: PrefStorage | null | undefined, hand: Hand): void {
  try {
    storage?.setItem(HAND_STORAGE_KEY, hand);
  } catch {
    /* sin almacenamiento: vale solo en esta visita */
  }
}

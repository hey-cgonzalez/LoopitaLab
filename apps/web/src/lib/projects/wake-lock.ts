/*
 * Pantalla encendida en "Tejiendo" (decisión 6 de la fase 3): Wake Lock API activada por defecto, con interruptor y
 * recuerdo en `localStorage` (`loopitalab:tejiendo:pantalla`). Si el navegador no la soporta, se degrada en silencio.
 * La preferencia es de este dispositivo (no de la cuenta) y no lleva datos personales.
 */

export const WAKE_LOCK_STORAGE_KEY = "loopitalab:tejiendo:pantalla";

interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Preferencia guardada; sin valor (o sin almacenamiento) es `true`. */
export function readWakeLockPreference(storage: PrefStorage | null | undefined): boolean {
  try {
    const v = storage?.getItem(WAKE_LOCK_STORAGE_KEY);
    return v === null || v === undefined ? true : v !== "0";
  } catch {
    return true;
  }
}

export function writeWakeLockPreference(storage: PrefStorage | null | undefined, on: boolean): void {
  try {
    storage?.setItem(WAKE_LOCK_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* sin almacenamiento: vale solo en esta visita */
  }
}

export interface WakeLockSentinelLike {
  released?: boolean;
  release(): Promise<void>;
  addEventListener?(type: "release", cb: () => void): void;
}
export interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

export function wakeLockSupported(nav: { wakeLock?: unknown } | undefined): boolean {
  return !!nav && typeof nav.wakeLock === "object" && nav.wakeLock !== null && typeof (nav.wakeLock as WakeLockLike).request === "function";
}

/**
 * Pide el bloqueo de pantalla. Devuelve el centinela o `null` si no se pudo (sin soporte, página oculta, batería
 * baja, política del navegador). Nunca lanza.
 */
export async function requestWakeLock(nav: { wakeLock?: unknown } | undefined): Promise<WakeLockSentinelLike | null> {
  if (!wakeLockSupported(nav)) return null;
  try {
    return await (nav!.wakeLock as WakeLockLike).request("screen");
  } catch {
    return null;
  }
}

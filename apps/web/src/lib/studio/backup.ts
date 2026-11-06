import { MAX_DOCUMENT_BYTES } from "@/lib/designs/limits.ts";

/*
 * Almacenamiento del respaldo local del estudio, sin dependencias del motor: lo usan también el cierre de sesión y
 * la eliminación de la cuenta, que no deben cargar el motor de patrones.
 */

export interface BackupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalBackup {
  v: 2;
  /** `user.id` de la dueña. Un respaldo de otra cuenta nunca se ofrece y se borra al abrir el estudio. */
  ownerId: string;
  /** `updated_at` del servidor sobre el que se hizo la edición. */
  baseUpdatedAt: string;
  /** Cuándo se escribió (ms). Pasado `BACKUP_TTL_MS` caduca: no se ofrece y se borra. */
  savedAt: number;
  document: unknown;
}

/*
 * Respaldo local (seguridad, ALTO-1 y MEDIO-1). No está cifrado: vive en `localStorage` del navegador y puede
 * contener notas privadas del diseño (ver docs/seguridad.md). Por eso:
 *  - la clave y el contenido llevan el `user.id` de la dueña (`loopitalab:<uid>:diseno:<id>`);
 *  - al abrir el estudio se borran los respaldos de otra cuenta, los de formato viejo y los caducados;
 *  - caduca a los 14 días (`savedAt`);
 *  - se rechaza un texto mayor que el tope del servidor antes de `JSON.parse`;
 *  - cerrar sesión y eliminar la cuenta borran todos (`clearAllBackups`).
 */

/** Prefijo común de todos los formatos de respaldo. */
const NS = "loopitalab:";
/** Formato viejo (v1, sin dueña). Solo se reconoce para borrarlo. */
export const LEGACY_BACKUP_PREFIX = `${NS}diseno:`;
export const BACKUP_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/**
 * Tope del texto del respaldo. El documento admite `MAX_DOCUMENT_BYTES` bytes; en caracteres de JavaScript nunca
 * mide más que en bytes UTF-8, y el sobre (`v`, `ownerId`, fechas) agrega menos de 1 KB.
 */
export const MAX_BACKUP_CHARS = MAX_DOCUMENT_BYTES + 1024;

/** `<uid>` sin `:` (así la clave se separa sin ambigüedad). */
const OWNER_RE = /^[A-Za-z0-9-]{1,64}$/;
export const isValidOwnerId = (ownerId: string): boolean => OWNER_RE.test(ownerId);
/** Clave de cualquier formato: `loopitalab:diseno:<id>` (v1) o `loopitalab:<uid>:diseno:<id>` (v2). */
const KEY_RE = /^loopitalab:(?:([^:]+):)?diseno:(.+)$/;

export const backupKey = (ownerId: string, id: string) => `${NS}${ownerId}:diseno:${id}`;

/** ¿Es una clave de respaldo de diseño (de cualquier formato)? */
export function isBackupKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Almacenamiento con enumeración, como `localStorage`. */
export interface EnumerableStorage extends BackupStorage {
  readonly length: number;
  key(index: number): string | null;
}

function backupKeys(storage: EnumerableStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && isBackupKey(k)) keys.push(k);
  }
  return keys;
}

/**
 * Borra todos los respaldos locales de diseños, de cualquier cuenta y formato (al cerrar sesión o eliminar la
 * cuenta: en un equipo compartido no deben quedar diseños de otra persona). Devuelve cuántos borró. Nunca lanza.
 */
export function clearAllBackups(storage: EnumerableStorage | null | undefined): number {
  if (!storage) return 0;
  try {
    const keys = backupKeys(storage);
    for (const k of keys) storage.removeItem(k);
    return keys.length;
  } catch {
    return 0;
  }
}

/** `clearAllBackups` sobre el `localStorage` del navegador (cerrar sesión, eliminar la cuenta). Nunca lanza. */
export function clearBrowserBackups(): number {
  try {
    return typeof window === "undefined" ? 0 : clearAllBackups(window.localStorage as EnumerableStorage);
  } catch {
    return 0; // sin acceso al almacenamiento: no hay nada que borrar
  }
}

/** Interpreta el texto de un respaldo de `ownerId`; null si no sirve (grande, dañado, de otra cuenta, caducado). */
function parseBackup(raw: string | null, ownerId: string, now: number): LocalBackup | null {
  if (!raw || raw.length > MAX_BACKUP_CHARS) return null; // antes de JSON.parse
  try {
    const b = JSON.parse(raw) as Partial<LocalBackup> | null;
    if (!b || typeof b !== "object" || b.v !== 2 || b.ownerId !== ownerId) return null;
    if (typeof b.baseUpdatedAt !== "string" || typeof b.savedAt !== "number" || !Number.isFinite(b.savedAt)) return null;
    if (now - b.savedAt > BACKUP_TTL_MS || b.savedAt - now > BACKUP_TTL_MS) return null; // caducado o con fecha absurda
    if (typeof b.document !== "object" || b.document === null || Array.isArray(b.document)) return null;
    return b as LocalBackup;
  } catch {
    return null;
  }
}

/**
 * Lee el respaldo de `id` de la dueña `ownerId` sin lanzar. El llamador debe migrar y validar `document` antes de
 * usarlo (`decideRecovery`).
 */
export function readBackup(storage: BackupStorage | null | undefined, ownerId: string, id: string, now: number = Date.now()): LocalBackup | null {
  if (!storage || !OWNER_RE.test(ownerId)) return null;
  try {
    return parseBackup(storage.getItem(backupKey(ownerId, id)), ownerId, now);
  } catch {
    return null;
  }
}

/**
 * Limpieza al abrir el estudio: borra los respaldos de otra cuenta, los de formato viejo, los caducados y los que
 * no se pueden leer. Conserva solo los vigentes de `ownerId`. Devuelve cuántos borró. Nunca lanza.
 */
export function pruneBackups(storage: EnumerableStorage | null | undefined, ownerId: string, now: number = Date.now()): number {
  if (!storage) return 0;
  try {
    const remove: string[] = [];
    for (const k of backupKeys(storage)) {
      const owner = KEY_RE.exec(k)?.[1];
      if (!owner || owner !== ownerId || !OWNER_RE.test(ownerId) || !parseBackup(storage.getItem(k), ownerId, now)) remove.push(k);
    }
    for (const k of remove) storage.removeItem(k);
    return remove.length;
  } catch {
    return 0;
  }
}

export function clearBackup(storage: BackupStorage | null | undefined, ownerId: string, id: string): void {
  try {
    storage?.removeItem(backupKey(ownerId, id));
  } catch {
    /* sin acceso al almacenamiento: no es grave, es solo una red de seguridad */
  }
}


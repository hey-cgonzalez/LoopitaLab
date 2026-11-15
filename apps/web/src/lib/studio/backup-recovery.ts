import { migratePattern, validatePattern, type ChartPattern, type Pattern } from "@loopitalab/pattern-core";
import { pendingTextOf, type LocalBackup } from "./backup.ts";

export interface Recovery<P extends Pattern = ChartPattern> {
  document: P;
  savedAt: number;
  /** El servidor tiene una versión más nueva que la que se estaba editando cuando se hizo el respaldo. */
  serverIsNewer: boolean;
  /**
   * Estudio amigurumi: texto sin leer por parte (CA4-E9), solo de partes que existen en `document`. Se devuelve al
   * editor al recuperar; nunca entra al documento.
   */
  pendingText?: Record<string, string>;
}

/**
 * Qué hacer con un respaldo local al abrir un diseño (función pura; la usa `useStudioSession`).
 *  - `none`: no hay respaldo (o `readBackup` lo rechazó: grande, de otra cuenta, caducado).
 *  - `discard`: hay uno, pero no se ofrece: no migra, es de otro tipo o de otro diseño, no es guardable, o es igual a
 *    lo que ya tiene el servidor y no trae texto sin leer. El llamador lo borra.
 *  - `offer`: se ofrece recuperarlo; la usuaria decide.
 */
export type RecoveryDecision<P extends Pattern = ChartPattern> = { kind: "none" } | { kind: "discard" } | { kind: "offer"; recovery: Recovery<P> };

export function decideRecovery<P extends Pattern = ChartPattern>(backup: LocalBackup | null, server: P, serverUpdatedAt: string): RecoveryDecision<P> {
  if (!backup) return { kind: "none" };
  const m = migratePattern(backup.document);
  const doc = m.ok ? (m.document as P) : null;
  if (!doc || doc.kind !== server.kind || doc.id !== server.id || !validatePattern(doc).savable) return { kind: "discard" };
  const pending = doc.kind === "written" ? pendingFor(backup.pendingText, doc.parts.map((p) => p.id)) : null;
  if (!pending && JSON.stringify(doc) === JSON.stringify(server)) return { kind: "discard" };
  const recovery: Recovery<P> = { document: doc, savedAt: backup.savedAt, serverIsNewer: backup.baseUpdatedAt !== serverUpdatedAt };
  if (pending) recovery.pendingText = pending;
  return { kind: "offer", recovery };
}

/** Texto sin leer de las partes que existen en el documento recuperado; null si no queda ninguno. */
function pendingFor(raw: unknown, partIds: readonly string[]): Record<string, string> | null {
  const all = pendingTextOf(raw);
  if (!all) return null;
  const ids = new Set(partIds);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) if (ids.has(k)) out[k] = v;
  return Object.keys(out).length > 0 ? out : null;
}

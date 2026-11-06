import { migratePattern, validatePattern, type ChartPattern } from "@loopitalab/pattern-core";
import type { LocalBackup } from "./backup.ts";

export interface Recovery {
  document: ChartPattern;
  savedAt: number;
  /** El servidor tiene una versión más nueva que la que se estaba editando cuando se hizo el respaldo. */
  serverIsNewer: boolean;
}

/**
 * Qué hacer con un respaldo local al abrir un diseño (función pura; la usa `useStudioSession`).
 *  - `none`: no hay respaldo (o `readBackup` lo rechazó: grande, de otra cuenta, caducado).
 *  - `discard`: hay uno, pero no se ofrece: no migra, no es un gráfico, es de otro diseño, no es guardable o es
 *    igual a lo que ya tiene el servidor. El llamador lo borra.
 *  - `offer`: se ofrece recuperarlo; la usuaria decide.
 */
export type RecoveryDecision = { kind: "none" } | { kind: "discard" } | { kind: "offer"; recovery: Recovery };

export function decideRecovery(backup: LocalBackup | null, server: ChartPattern, serverUpdatedAt: string): RecoveryDecision {
  if (!backup) return { kind: "none" };
  const m = migratePattern(backup.document);
  const doc = m.ok ? (m.document as ChartPattern) : null;
  if (!doc || doc.kind !== "chart" || doc.id !== server.id || !validatePattern(doc).savable) return { kind: "discard" };
  if (JSON.stringify(doc) === JSON.stringify(server)) return { kind: "discard" };
  return { kind: "offer", recovery: { document: doc, savedAt: backup.savedAt, serverIsNewer: backup.baseUpdatedAt !== serverUpdatedAt } };
}

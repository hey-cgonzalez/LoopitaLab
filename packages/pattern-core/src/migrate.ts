/**
 * Migraciones del modelo canónico (ADR 0003, sección 5).
 *
 * **Camino obligatorio de lectura**: todo documento que se lee (propio o ajeno, de la
 * base, de un archivo o de la IA) pasa primero por `migratePattern` y luego por
 * `validatePattern`:
 *
 * ```ts
 * const m = migratePattern(json);
 * const r = validatePattern(m.document);
 * ```
 *
 * Un documento migrado se reescribe en la base solo cuando la usuaria guarda; no hay
 * migraciones masivas silenciosas.
 */
import { SCHEMA_VERSION, type Issue } from "./types.ts";

export interface MigrationResult {
  /** Documento en la versión actual, o el original sin tocar si no se pudo migrar. */
  document: unknown;
  /** Versión declarada por la entrada; `null` si no declara una versión numérica. */
  from: number | null;
  /**
   * Versión del documento devuelto. Si se pudo migrar es `SCHEMA_VERSION`; si no, es
   * igual a `from`, o 0 si la entrada no declara versión.
   */
  to: number;
  /** true si `document` quedó en `SCHEMA_VERSION`. */
  ok: boolean;
  /** Vacío si `ok`; si no, un error `SCHEMA_VERSION` en español. */
  issues: Issue[];
}

/**
 * Pasos de migración: `STEPS[n]` lleva un documento de la versión `n` a la `n + 1`.
 * Hoy no hay ninguno: la v1 es la primera versión.
 */
const STEPS: Readonly<Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>> = {};

/**
 * Lleva un documento a la versión actual del esquema. Es pura y nunca lanza.
 * - `schemaVersion: 1`: identidad (devuelve el mismo objeto).
 * - Versión desconocida (futura, no entera o ausente): devuelve el documento sin
 *   tocar con un error `SCHEMA_VERSION`; `validatePattern` también lo informa.
 * Es idempotente: migrar un resultado migrado no lo cambia.
 */
export function migratePattern(input: unknown): MigrationResult {
  const isRec = typeof input === "object" && input !== null && !Array.isArray(input);
  const raw = isRec ? (input as Record<string, unknown>).schemaVersion : undefined;
  const from = typeof raw === "number" && Number.isFinite(raw) ? raw : null;

  if (from === SCHEMA_VERSION) return { document: input, from, to: SCHEMA_VERSION, ok: true, issues: [] };

  if (isRec && from !== null && Number.isInteger(from) && from >= 1 && from < SCHEMA_VERSION) {
    let doc = input as Record<string, unknown>;
    for (let v = from; v < SCHEMA_VERSION; v++) {
      const step = STEPS[v];
      if (!step) return unknown(input, from);
      doc = step(doc);
    }
    return { document: doc, from, to: SCHEMA_VERSION, ok: true, issues: [] };
  }
  return unknown(input, from);
}

function unknown(input: unknown, from: number | null): MigrationResult {
  const message =
    from === null
      ? `El documento no declara su versión de esquema; esta versión de LoopitaLab lee la ${SCHEMA_VERSION}.`
      : `El documento usa la versión de esquema ${from}, que esta versión de LoopitaLab no conoce (lee la ${SCHEMA_VERSION}).`;
  return {
    document: input,
    from,
    to: from ?? 0,
    ok: false,
    issues: [{ code: "SCHEMA_VERSION", severity: "error", path: "schemaVersion", message, data: { found: from, supported: SCHEMA_VERSION } }],
  };
}

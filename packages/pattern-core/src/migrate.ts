/**
 * Migraciones del modelo canónico (ADR 0003, sección 5).
 *
 * **Camino obligatorio de lectura**: todo documento que se lee (propio o ajeno, de la
 * base, de un archivo o de la IA) pasa primero por `migratePattern` y luego por
 * `validatePattern`:
 *
 * ```ts
 * const m = migratePattern(json);
 * if (!m.ok) return m.issues; // versión desconocida: error SCHEMA_VERSION
 * const r = validatePattern(m.document);
 * ```
 *
 * Un documento migrado se reescribe en la base solo cuando la usuaria guarda; no hay
 * migraciones masivas silenciosas.
 */
import { SCHEMA_VERSION, type Issue } from "./types.ts";

/**
 * Resultado de `migratePattern`, discriminado por `ok` (ADR 0003, enmienda E1). Quien
 * llama decide por `ok`, nunca por `to`.
 * - `ok: true`: `document` está en `SCHEMA_VERSION`, `to === SCHEMA_VERSION` e `issues` va vacío.
 * - `ok: false`: `document` es la entrada sin tocar, `to === from` (la versión que traía, o
 *   `null` si no declara una versión numérica) e `issues` trae un error `SCHEMA_VERSION`.
 */
export type MigrationResult =
  | { ok: true; document: unknown; from: number; to: number; issues: Issue[] }
  | { ok: false; document: unknown; from: number | null; to: number | null; issues: Issue[] };

/**
 * Pasos de migración: `STEPS[n]` lleva un documento de la versión `n` a la `n + 1`.
 * Hoy no hay ninguno: la v1 es la primera versión.
 */
const STEPS: Readonly<Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>> = {};

/**
 * Lleva un documento a la versión actual del esquema. Es pura y nunca lanza, tampoco
 * con `null`, valores primitivos, arreglos ni objetos con getters que lanzan.
 * - `schemaVersion: 1`: identidad (devuelve el mismo objeto).
 * - Versión desconocida (futura, no entera o ausente): devuelve el documento sin
 *   tocar con un error `SCHEMA_VERSION`; `validatePattern` también lo informa.
 * Es idempotente: migrar un resultado migrado no lo cambia.
 */
export function migratePattern(input: unknown): MigrationResult {
  // Una entrada de JSON.parse nunca lanza aquí. El try/catch acotado cubre objetos
  // armados a mano con getters o Proxy que lanzan al leer `schemaVersion`.
  let raw: unknown;
  let isRec = false;
  try {
    isRec = typeof input === "object" && input !== null && !Array.isArray(input);
    raw = isRec ? (input as Record<string, unknown>).schemaVersion : undefined;
  } catch {
    return unknown(input, null);
  }
  const from = typeof raw === "number" && Number.isFinite(raw) ? raw : null;

  if (from === SCHEMA_VERSION) return { ok: true, document: input, from, to: SCHEMA_VERSION, issues: [] };

  if (isRec && from !== null && Number.isInteger(from) && from >= 1 && from < SCHEMA_VERSION) {
    let doc = input as Record<string, unknown>;
    try {
      for (let v = from; v < SCHEMA_VERSION; v++) {
        const step = STEPS[v];
        if (!step) return unknown(input, from);
        doc = step(doc);
      }
    } catch {
      return unknown(input, from);
    }
    return { ok: true, document: doc, from, to: SCHEMA_VERSION, issues: [] };
  }
  return unknown(input, from);
}

function unknown(input: unknown, from: number | null): MigrationResult {
  const message =
    from === null
      ? `El documento no declara su versión de esquema; esta versión de LoopitaLab lee la ${SCHEMA_VERSION}.`
      : `El documento usa la versión de esquema ${from}, que esta versión de LoopitaLab no conoce (lee la ${SCHEMA_VERSION}).`;
  return {
    ok: false,
    document: input,
    from,
    to: from,
    issues: [{ code: "SCHEMA_VERSION", severity: "error", path: "schemaVersion", message, data: { found: from, supported: SCHEMA_VERSION } }],
  };
}

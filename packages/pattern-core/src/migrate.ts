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
import { SCHEMA_VERSION, type ChartPattern, type Issue, type Part, type WrittenPattern } from "./types.ts";

/*
 * Tipos de la v1 (ADR 0011, sección 2), solo para las pruebas de migración. La v1 no
 * tiene `layout` ni `Part.copies`; el resto es igual a la v2.
 */
export type PartV1 = Omit<Part, "copies">;
export type ChartPatternV1 = Omit<ChartPattern, "schemaVersion"> & { schemaVersion: 1 };
export type WrittenPatternV1 = Omit<WrittenPattern, "schemaVersion" | "layout" | "parts"> & { schemaVersion: 1; parts: PartV1[] };
export type PatternV1 = ChartPatternV1 | WrittenPatternV1;

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
 * Cada paso devuelve una copia y nunca muta la entrada.
 */
const STEPS: Readonly<Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>> = Object.freeze({
  /*
   * v1 → v2 (ADR 0011, sección 5): solo sube la versión. Los campos nuevos (`layout`,
   * `Part.copies`) son opcionales y su omisión equivale a la v1 (una copia por parte,
   * ubicación automática). No transforma datos: notas y cierres de varias líneas se
   * conservan tal cual. Copia superficial: los objetos internos se comparten con la
   * entrada (el modelo es inmutable por convención, como en `edit.ts`).
   */
  1: (doc) => ({ ...doc, schemaVersion: 2 }),
});

/**
 * Lleva un documento a la versión actual del esquema. Es pura y nunca lanza, tampoco
 * con `null`, valores primitivos, arreglos ni objetos con getters que lanzan.
 * - `schemaVersion: 2` (la actual): identidad (devuelve el mismo objeto).
 * - `schemaVersion: 1`: devuelve una copia con `schemaVersion: 2` (`STEPS[1]`).
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

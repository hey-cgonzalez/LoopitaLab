import "server-only";
import { migratePattern, validatePattern, type ChartPattern, type Issue, type Pattern } from "@loopitalab/pattern-core";
import { designMessage, type DesignErrorCode } from "./messages.ts";
import type { DesignFailure } from "./types.ts";

/**
 * Tamaño máximo del documento serializado (bytes de JSON compacto) que acepta el servidor.
 *
 * Peor documento válido medido (T4, 2026-11-06): 200 x 200, 32 lanas con nota de 500 caracteres,
 * repeticiones máximas, 50 notas de 2000 caracteres. Cada cifra mide algo distinto:
 *  - JSON compacto del cliente (lo que mide este tope): 228 573 bytes con ASCII y 576 933 con
 *    caracteres de 4 bytes (el peor caso en bytes);
 *  - texto de jsonb en la base (`document::text`, lo que mide `patterns_document_text_size`):
 *    269 235 bytes con ASCII y 617 595 con caracteres de 4 bytes (supabase/checks/10_rls_check.sql).
 * La base limita el texto de jsonb a 1 000 000 bytes. El texto de jsonb mide hasta ~1,5 veces el JSON
 * compacto (agrega un espacio tras cada `:` y `,`; el máximo se da con muchas claves y valores cortos),
 * así que el servidor corta antes, en 750 000, para dar siempre un error claro (TOO_LARGE) y no uno de
 * la base. También cabe en el límite por defecto del cuerpo de una Server Action de Next.js (1 MB).
 */
export const MAX_DOCUMENT_BYTES = 750_000;

/** Etiqueta de una versión, igual que `pattern_versions.label`. */
export const MAX_VERSION_LABEL = 80;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `updated_at` tal como lo devuelve PostgREST (microsegundos). No se pasa por Date: perdería precisión. */
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
export const isTimestamp = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && TIMESTAMP_RE.test(v);

export function failure(code: DesignErrorCode, extra: Partial<Omit<DesignFailure, "ok" | "code" | "error">> = {}): DesignFailure {
  return { ok: false, code, error: designMessage(code), ...extra };
}

/** Bytes del JSON compacto, o null si no se puede serializar (ciclos, BigInt). */
export function jsonBytes(value: unknown): number | null {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : Buffer.byteLength(text, "utf8");
  } catch {
    return null;
  }
}

export type Prepared = { ok: true; document: Pattern; valid: boolean; issues: Issue[] } | DesignFailure;

/**
 * Decide si un documento recibido del cliente se puede guardar (ADR 0006, E10). Nunca confía en el
 * cliente: acota el tamaño, migra y valida SIN opciones (el invariante de E10 garantiza que las opciones
 * no cambian los errores, así que servidor y cliente llegan al mismo `savable`).
 * Rechaza solo si `savable` es falso; `valid` falso es un borrador (`draft: true`).
 */
export function prepareDocument(raw: unknown): Prepared {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return failure("INVALID_REQUEST");
  const bytes = jsonBytes(raw);
  if (bytes === null) return failure("INVALID_REQUEST");
  if (bytes > MAX_DOCUMENT_BYTES) return failure("TOO_LARGE");

  const migrated = migratePattern(raw);
  if (!migrated.ok) return failure("NOT_SAVABLE", { issues: migrated.issues });

  const result = validatePattern(migrated.document);
  if (!result.savable) {
    return failure("NOT_SAVABLE", { issues: result.issues.filter((i) => i.severity === "error") });
  }
  return { ok: true, document: migrated.document as Pattern, valid: result.valid, issues: result.issues };
}

/** Columnas que acompañan al documento. kind/technique/origin los fija la base por consistencia: no se envían. */
export function documentColumns(document: Pattern) {
  return { title: document.title, schema_version: document.schemaVersion, document };
}

export type { ChartPattern };

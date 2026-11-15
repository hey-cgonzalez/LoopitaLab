import "server-only";
import { migratePattern, SCHEMA_VERSION, validatePattern, type ChartPattern, type Issue, type Pattern } from "@loopitalab/pattern-core";
import { designMessage, type DesignErrorCode } from "./messages.ts";
import type { DesignFailure } from "./types.ts";

import { MAX_DOCUMENT_BYTES } from "./limits.ts";

/** Tope del documento serializado (ver `limits.ts`; también lo usa el respaldo local del navegador). */
export { MAX_DOCUMENT_BYTES };

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
  return { title: document.title, schema_version: SCHEMA_VERSION, document };
}

export type { ChartPattern };

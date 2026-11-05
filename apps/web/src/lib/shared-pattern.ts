import "server-only";
import { validatePattern, type Issue, type Pattern } from "@loopitalab/pattern-core";
import { createClient } from "@/lib/supabase/server";

/**
 * Patrones ajenos (compartidos por enlace o públicos), validados antes de usarse (B1).
 * Todo `document` que viene de otra persona pasa por `validatePattern`: si no valida,
 * no se devuelve como utilizable.
 *
 * Uso en una página del servidor:
 *   const r = await getSharedPattern(id);
 *   if (!r.ok) return r.reason === "not_found" ? notFound() : <Aviso />;
 *   // r.pattern es un Pattern validado; r.meta trae título, autora (nombre visible), etc.
 */

export interface SharedPatternMeta {
  id: string;
  title: string;
  technique: string;
  kind: string;
  origin: string;
  authorName: string;
  updatedAt: string;
}

export type SharedPatternResult =
  | { ok: true; pattern: Pattern; meta: SharedPatternMeta; warnings: Issue[] }
  | { ok: false; reason: "invalid_id" | "not_found" | "invalid_document" | "error"; issues?: Issue[] };

export type PublicPatternItem = { id: string; ok: true; pattern: Pattern; meta: SharedPatternMeta; warnings: Issue[] } | { id: string; ok: false; reason: "invalid_document"; issues: Issue[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

interface SharedRow {
  id: string;
  title: string;
  technique: string;
  kind: string;
  schema_version: number;
  origin: string;
  document: unknown;
  author_name: string;
  updated_at: string;
}

/** Valida una fila de la RPC. Exportada para poder probarla sin base de datos. */
export function checkSharedRow(row: SharedRow): PublicPatternItem {
  const r = validatePattern(row.document);
  if (!r.valid) return { id: row.id, ok: false, reason: "invalid_document", issues: r.issues };
  return {
    id: row.id,
    ok: true,
    pattern: row.document as Pattern,
    warnings: r.issues,
    meta: {
      id: row.id,
      title: row.title,
      technique: row.technique,
      kind: row.kind,
      origin: row.origin,
      authorName: row.author_name,
      updatedAt: row.updated_at,
    },
  };
}

export async function getSharedPattern(id: string): Promise<SharedPatternResult> {
  if (!isUuid(id)) return { ok: false, reason: "invalid_id" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_shared_pattern", { p_pattern_id: id });
  if (error) return { ok: false, reason: "error" };
  const row = (data as SharedRow[] | null)?.[0];
  if (!row) return { ok: false, reason: "not_found" };
  const item = checkSharedRow(row);
  return item.ok ? item : { ok: false, reason: "invalid_document", issues: item.issues };
}

/** Lista de patrones públicos. Los que no validan vienen marcados y sin `pattern`. */
export async function listPublicPatterns(limit = 24, offset = 0): Promise<{ ok: true; items: PublicPatternItem[] } | { ok: false; reason: "error" }> {
  const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 24;
  const safeOffset = Number.isInteger(offset) ? Math.max(offset, 0) : 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_public_patterns", { p_limit: safeLimit, p_offset: safeOffset });
  if (error) return { ok: false, reason: "error" };
  return { ok: true, items: ((data as SharedRow[] | null) ?? []).map(checkSharedRow) };
}

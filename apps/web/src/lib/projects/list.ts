import "server-only";
import { totalRowsOf } from "@loopitalab/follow";
import { columnsToRawPointer } from "./progress-codec.ts";
import { dbFailure, type SessionClient } from "./server.ts";
import type { ProjectFailure, WorkedIn } from "./messages.ts";
import type { ProjectListItem } from "./types.ts";

/*
 * "Tus proyectos" (ADR 0009, enmienda T1-2): `workedIn` y el tamaño se leen desde las rutas JSON de la versión fijada,
 * sin traer los documentos completos. El total de filas lo da `totalRowsOf` de `follow` (misma cuenta que `planChart`);
 * aquí no se cuenta nada. Lectura con el cliente de la sesión (RLS) y filtro por dueña (defensa en profundidad).
 */

const LIST_LIMIT = 500;

/** Lo que PostgREST devuelve con la consulta de abajo (las relaciones uno a uno llegan como objeto o como lista de uno). */
interface Row {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  pattern_id: string | null;
  pattern_version_id: string | null;
  pattern: { title: string; updated_at: string } | { title: string; updated_at: string }[] | null;
  version: VersionRow | VersionRow[] | null;
  progress: ProgressRow | ProgressRow[] | null;
}
interface VersionRow {
  version: number;
  created_at: string;
  worked_in: string | null;
  height: string | null;
  repeat_y: string | null;
}
interface ProgressRow {
  round_number: number | null;
  stitch_index: number | null;
  updated_at: string;
}

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const toInt = (v: string | null | undefined): number => (v !== null && v !== undefined && /^\d{1,6}$/.test(v) ? Number(v) : 0);
const STATUSES = new Set(["planned", "in_progress", "paused", "finished"]);
/** Comparación de `timestamptz` tal como salen de PostgREST (ISO con microsegundos y desfase); `Date` basta para "después". */
const after = (a: string, b: string): boolean => {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb;
};

export async function listProjects(supabase: SessionClient, userId: string): Promise<{ ok: true; projects: ProjectListItem[] } | ProjectFailure> {
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, title, status, updated_at, pattern_id, pattern_version_id, pattern:patterns(title, updated_at), version:pattern_versions!projects_pattern_version_id_fkey(version, created_at, worked_in:document->chart->>workedIn, height:document->chart->>height, repeat_y:document->chart->repeat->>y), progress:project_progress(round_number, stitch_index, updated_at)",
    )
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) return dbFailure("listar los proyectos", error);

  const projects: ProjectListItem[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const version = one(r.version);
    const pattern = one(r.pattern);
    const progress = one(r.progress);
    const status = STATUSES.has(r.status) ? (r.status as ProjectListItem["status"]) : "planned";
    if (!r.pattern_version_id || !version) return { id: r.id, title: r.title, status, updatedAt: r.updated_at, design: null };
    const workedIn: WorkedIn = version.worked_in === "rows" ? "rows" : "rounds";
    const totalRows = totalRowsOf(toInt(version.height), toInt(version.repeat_y));
    const raw = columnsToRawPointer(progress);
    const pointer = { rowsDone: Math.min(raw.rowsDone, totalRows), stitchesDone: raw.stitchesDone };
    const mayHaveNewer = !!pattern && after(pattern.updated_at, version.created_at) && after(pattern.updated_at, r.updated_at);
    return {
      id: r.id,
      title: r.title,
      status,
      updatedAt: r.updated_at,
      design: { patternId: r.pattern_id, patternTitle: pattern?.title ?? null, version: version.version, workedIn, totalRows, pointer, progressUpdatedAt: progress?.updated_at ?? null, mayHaveNewer },
    };
  });
  return { ok: true, projects };
}

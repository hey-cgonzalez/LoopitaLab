import "server-only";
import type { ChartPlan, ChartPointer } from "@loopitalab/follow";
import { migratePattern, validatePattern, type ChartPattern, type Pattern } from "@loopitalab/pattern-core";
import { createClient } from "@/lib/supabase/server";
import { columnsToPointer } from "./progress-codec.ts";
import { mapDbError, projectFailure, type DbError, type ProjectFailure } from "./messages.ts";

/*
 * Lecturas de servidor compartidas por las acciones de proyectos (app/proyectos/actions.ts). Todas usan el cliente de
 * la sesión (RLS) y además filtran por `owner_id`: defensa en profundidad. Ninguna usa la clave secreta.
 */

export type SessionClient = Awaited<ReturnType<typeof createClient>>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
/** `updated_at` como lo devuelve PostgREST (microsegundos). No se pasa por Date: perdería precisión. */
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
export const isTimestamp = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && TIMESTAMP_RE.test(v);

export async function session(): Promise<{ supabase: SessionClient; user: { id: string } | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user: user ? { id: user.id } : null };
}

/** Solo el código: el mensaje de la base puede traer nombres internos. */
export function logDb(action: string, error: { code?: string } | null | undefined): void {
  console.error(`proyectos: ${action} falló`, error?.code ?? "sin código");
}

/** Falla de una consulta: se registra el código y se traduce con el mapa de errores. */
export function dbFailure(action: string, error: DbError): ProjectFailure {
  logDb(action, error);
  return mapDbError(error);
}

export type ChartForKnit = { ok: true; document: ChartPattern; updatedAt: string; raw: unknown } | ProjectFailure;

/**
 * Lee un diseño propio desde la base y exige que se pueda tejer (ADR 0006, E10): `migratePattern` y `validatePattern`
 * SIN opciones, y `valid`. El cliente nunca aporta el documento. `updatedAt` es el de la fila leída: es el que se pasa a
 * `start_chart_project` / `repin_project`, así lo fijado es exactamente lo validado.
 */
export async function readKnittableDesign(supabase: SessionClient, userId: string, patternId: string): Promise<ChartForKnit> {
  const { data, error } = await supabase
    .from("patterns")
    .select("id, kind, updated_at, document")
    .eq("id", patternId)
    .eq("owner_id", userId)
    .maybeSingle<{ id: string; kind: string; updated_at: string; document: unknown }>();
  if (error) return dbFailure("leer el diseño", error);
  if (!data) return projectFailure("NOT_FOUND");
  if (data.kind !== "chart") return projectFailure("NOT_A_CHART");

  const migrated = migratePattern(data.document);
  if (!migrated.ok) return projectFailure("NOT_SAVABLE", { issues: migrated.issues });
  const document = migrated.document as Pattern;
  if (document.kind !== "chart") return projectFailure("NOT_A_CHART");

  const result = validatePattern(document);
  if (!result.savable) return projectFailure("NOT_SAVABLE", { issues: result.issues.filter((i) => i.severity === "error"), ...(document.chart?.workedIn === "rows" || document.chart?.workedIn === "rounds" ? { workedIn: document.chart.workedIn } : {}) });
  if (!result.valid) return projectFailure("NOT_KNITTABLE", { issues: result.issues.filter((i) => i.severity === "error") });
  return { ok: true, document, updatedAt: data.updated_at, raw: data.document };
}

export interface PinnedVersion {
  projectId: string;
  title: string;
  status: string;
  patternId: string | null;
  versionId: string;
  version: number;
  /** Documento migrado de la versión fijada (puede no ser `valid` por una regla posterior; sí `savable`). */
  document: ChartPattern;
  valid: boolean;
  issues: ReturnType<typeof validatePattern>["issues"];
  /** Documento tal como salió de la base, para comparar con el diseño actual. */
  raw: unknown;
}

export type PinnedResult = { ok: true; pinned: PinnedVersion } | ProjectFailure;

/** Lee un proyecto propio y su versión fijada. Sin `savable` no se devuelve (ADR 0009, sección 5). */
export async function readPinnedVersion(supabase: SessionClient, userId: string, projectId: string): Promise<PinnedResult> {
  const p = await supabase
    .from("projects")
    .select("id, title, status, pattern_id, pattern_version_id")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle<{ id: string; title: string; status: string; pattern_id: string | null; pattern_version_id: string | null }>();
  if (p.error) return dbFailure("leer el proyecto", p.error);
  if (!p.data) return projectFailure("NOT_FOUND");
  if (!p.data.pattern_id || !p.data.pattern_version_id) return projectFailure("NO_DESIGN");

  const v = await supabase
    .from("pattern_versions")
    .select("id, version, document")
    .eq("id", p.data.pattern_version_id)
    .eq("pattern_id", p.data.pattern_id)
    .maybeSingle<{ id: string; version: number; document: unknown }>();
  if (v.error) return dbFailure("leer la versión fijada", v.error);
  if (!v.data) return projectFailure("NOT_FOUND");

  const migrated = migratePattern(v.data.document);
  if (!migrated.ok) return projectFailure("NOT_SAVABLE", { issues: migrated.issues });
  const document = migrated.document as Pattern;
  if (document.kind !== "chart") return projectFailure("NOT_A_CHART");
  const result = validatePattern(document);
  if (!result.savable) return projectFailure("NOT_SAVABLE", { issues: result.issues.filter((i) => i.severity === "error"), ...(document.chart?.workedIn === "rows" || document.chart?.workedIn === "rounds" ? { workedIn: document.chart.workedIn } : {}) });

  return {
    ok: true,
    pinned: {
      projectId: p.data.id,
      title: p.data.title,
      status: p.data.status,
      patternId: p.data.pattern_id,
      versionId: v.data.id,
      version: v.data.version,
      document,
      valid: result.valid,
      issues: result.issues.filter((i) => i.severity === "error"),
      raw: v.data.document,
    },
  };
}

export interface ProgressRow {
  round_number: number | null;
  stitch_index: number | null;
  updated_at: string;
}

/** Fila de avance del proyecto (`null` si no tiene: proyecto anterior a la fase 3). */
export async function readProgress(supabase: SessionClient, projectId: string): Promise<{ ok: true; row: ProgressRow | null } | ProjectFailure> {
  const { data, error } = await supabase
    .from("project_progress")
    .select("round_number, stitch_index, updated_at")
    .eq("project_id", projectId)
    .maybeSingle<ProgressRow>();
  if (error) return dbFailure("leer el avance", error);
  return { ok: true, row: data ?? null };
}

/** Preferencia `mirror_knitting` del perfil; ante cualquier fallo, falso (solo cambia la numeración de lectura). */
export async function readMirror(supabase: SessionClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("mirror_knitting").eq("id", userId).maybeSingle<{ mirror_knitting: boolean | null }>();
  if (error) return false;
  return data?.mirror_knitting === true;
}

/** Plan y puntero acotado de una versión fijada, con la fila de avance (o el inicio si no hay). */
export function pointerOf(plan: ChartPlan, row: ProgressRow | null): ChartPointer {
  return columnsToPointer(plan, row);
}

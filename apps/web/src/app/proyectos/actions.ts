"use server";

import { revalidatePath } from "next/cache";
import { planChart, remapPointer, type ChartPlan, type ChartPointer } from "@loopitalab/follow";
import type { ChartPattern } from "@loopitalab/pattern-core";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { projectErrorMessage } from "@/lib/project-messages";
import { buildKnitPreview, knitDocument } from "@/lib/projects/knit-preview";
import {
  progressConflictMessage,
  patternConflict,
  projectFailure,
  versionChangedMessage,
  type ProjectFailure,
} from "@/lib/projects/messages";
import { MAX_ROW_NUMBER, MAX_STITCH_INDEX, columnsToPointer, columnsToRawPointer, parseClientPointer, pointerToColumns } from "@/lib/projects/progress-codec";
import {
  dbFailure,
  isTimestamp,
  isUuid,
  logDb,
  readKnittableDesign,
  readMirror,
  readPinnedVersion,
  readProgress,
  type PinnedVersion,
  session,
  type SessionClient,
} from "@/lib/projects/server";
import type {
  DeleteProjectResult,
  GetProgressResult,
  KnitPreviewResult,
  LoadProjectResult,
  RepinPreviewResult,
  RepinResult,
  SaveProgressResult,
  StartProjectResult,
} from "@/lib/projects/types";

export interface ProjectFormState {
  error?: string;
}

export async function createProject(_prev: ProjectFormState, form: FormData): Promise<ProjectFormState> {
  const raw = form.get("title");
  const title = cleanTitle(typeof raw === "string" ? raw.toWellFormed() : raw);
  if (title === undefined) return { error: "Ponle un nombre al proyecto." };
  if (title === null) return { error: "El nombre puede tener hasta 120 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({ title });
  if (error) return { error: projectErrorMessage(error, "project") };
  revalidatePath("/proyectos");
  return {};
}

const STATUSES = ["planned", "in_progress", "paused", "finished"] as const;

export async function setProjectStatus(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!isUuid(id) || !STATUSES.includes(status as (typeof STATUSES)[number])) return;
  // T17, I2: sesión con `auth.getUser()` y filtro por dueña además de RLS (defensa en profundidad).
  const { supabase, user } = await session();
  if (!user) return;
  const { error } = await supabase.from("projects").update({ status }).eq("id", id).eq("owner_id", user.id);
  if (error) logDb("cambiar el estado del proyecto", error);
  revalidatePath("/proyectos");
}

/**
 * Borra un proyecto propio (T12). Irreversible: el avance se va con él (`project_progress` en cascada); la versión
 * fijada del diseño queda (es del diseño, no del proyecto). RLS limita a los propios; el filtro por dueña es defensa
 * en profundidad. Es lo que `HAS_PROJECTS` de los diseños pide hacer antes de borrar un diseño (ADR 0009, D1).
 */
export async function deleteProject(projectId: string): Promise<DeleteProjectResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  if (!isUuid(projectId)) return projectFailure("INVALID_REQUEST");
  const { data, error } = await supabase.from("projects").delete().eq("id", projectId).eq("owner_id", user.id).select("id");
  if (error) return dbFailure("borrar el proyecto", error);
  if (!data || data.length === 0) return projectFailure("NOT_FOUND");
  revalidatePath("/proyectos");
  return { ok: true };
}

/*
 * "Tejer este diseño" y el avance (ADR 0009, secciones 2 a 5, con las enmiendas T1 y T7). Reglas de todas las acciones:
 *  - sesión con `auth.getUser()` antes de cualquier otra cosa; sin sesión no se toca la base ni se crea el cliente admin;
 *  - el documento se lee SIEMPRE desde la base (nunca lo envía el cliente) y se exige `valid` con `migratePattern` +
 *    `validatePattern` sin opciones (E10 del ADR 0006);
 *  - `start_chart_project` y `repin_project` solo las ejecuta `service_role`: se llaman con el cliente admin DESPUÉS de
 *    validar, con `p_owner_id` = id de la sesión (nunca un valor del cliente) y el `updated_at` leído junto con el
 *    documento validado (cierra la carrera entre validar y fijar);
 *  - el cliente de la sesión (RLS) hace todas las lecturas y la escritura del puntero; los errores se traducen con
 *    lib/projects/messages.ts y nunca se devuelve el texto de la base.
 */

const TITLE_MAX = 120;

/** Admin solo en el momento de llamar; si faltan las variables del servidor, falla sin detalles. */
function admin() {
  try {
    return createAdminClient();
  } catch {
    console.error("proyectos: no se pudo crear el cliente de servidor");
    return null;
  }
}

/** Título opcional: sin caracteres de control, recortado, de 1 a 120 puntos de código. `undefined` = usar el del diseño; `null` = inválido. */
function cleanTitle(title: unknown): string | undefined | null {
  if (title === undefined || title === null) return undefined;
  if (typeof title !== "string") return null;
  const t = title.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  if (t === "") return undefined;
  return [...t].length <= TITLE_MAX ? t : null;
}

/** Primera fila de lo que devuelve un `rpc` de función con `returns table`. */
function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data;
  return typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null;
}

/**
 * Pantalla previa a "Tejer este diseño" (caso F3-39): muestra usada o supuesta, metraje por lana (solo palillo),
 * advertencias que no bloquean y forma de trabajo. Todo del documento que se leyó ahora; `patternUpdatedAt` dice cuál.
 * Con errores de tejido responde NOT_KNITTABLE (el botón ya está deshabilitado con el motivo).
 */
export async function getKnitPreview(patternId: string): Promise<KnitPreviewResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  if (!isUuid(patternId)) return projectFailure("INVALID_REQUEST");
  const design = await readKnittableDesign(supabase, user.id, patternId);
  if (!design.ok) return design;
  return { ok: true, ...buildKnitPreview(design.document, design.updatedAt) };
}

/**
 * Empieza un proyecto con la versión actual del diseño fijada. Atómico en la base (`start_chart_project`).
 * `expectedUpdatedAt` es el `patternUpdatedAt` de `getKnitPreview`: si el diseño ya es otro, CONFLICT (pattern).
 * Respuestas: `{ ok, projectId, version, reused }`, o NOT_KNITTABLE (con los errores), CONFLICT (el diseño cambió),
 * QUOTA / MAX_VERSIONS / VERSIONS_QUOTA, NOT_FOUND, NOT_A_CHART, INVALID_REQUEST, REJECTED (título).
 */
export async function startProjectFromDesign(patternId: string, expectedUpdatedAt: string, title?: string): Promise<StartProjectResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  if (!isUuid(patternId) || !isTimestamp(expectedUpdatedAt)) return projectFailure("INVALID_REQUEST");
  const cleaned = cleanTitle(title);
  if (cleaned === null) return projectFailure("REJECTED");

  const design = await readKnittableDesign(supabase, user.id, patternId);
  if (!design.ok) return design;
  // Lo que se fija es lo que mostró la pantalla previa (ADR 0009, T1-7): si el diseño cambió desde entonces, CONFLICT
  // sin tocar admin. Misma cadena que devolvió `getKnitPreview` (ambas salen de la misma lectura de PostgREST).
  if (design.updatedAt !== expectedUpdatedAt) return patternConflict();

  const client = admin();
  if (!client) return projectFailure("DATABASE");
  const { data, error } = await client.rpc("start_chart_project", {
    p_owner_id: user.id,
    p_pattern_id: patternId,
    p_expected_updated_at: design.updatedAt,
    p_title: cleaned ?? null,
  });
  if (error) return dbFailure("empezar el proyecto", error);
  const row = firstRow(data);
  if (!row || typeof row.project_id !== "string" || typeof row.version !== "number" || typeof row.reused !== "boolean") {
    logDb("empezar el proyecto (respuesta inesperada)", undefined);
    return projectFailure("DATABASE");
  }
  revalidatePath("/proyectos");
  return { ok: true, projectId: row.project_id, version: row.version, reused: row.reused };
}

/**
 * Abre un proyecto propio: la versión fijada (migrada; sin `savable` no se muestra, sin `valid` se muestra con aviso),
 * el puntero acotado al plan y si el diseño actual ya es otro (`newerVersionAvailable`).
 */
export async function loadProject(projectId: string): Promise<LoadProjectResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  if (!isUuid(projectId)) return projectFailure("INVALID_REQUEST");

  const found = await readPinnedVersion(supabase, user.id, projectId);
  if (!found.ok) return found;
  const pinned = found.pinned;

  const [progress, mirror, newer] = await Promise.all([
    readProgress(supabase, projectId),
    readMirror(supabase, user.id),
    isNewerDesign(supabase, user.id, pinned.patternId, pinned.raw),
  ]);
  if (!progress.ok) return progress;
  if (newer === "error") return projectFailure("DATABASE");

  const plan = planChart(pinned.document, { mirror });
  return {
    ok: true,
    project: { id: pinned.projectId, title: pinned.title, status: pinned.status, patternId: pinned.patternId ?? "", versionId: pinned.versionId, version: pinned.version },
    // T17, B3: sin notas privadas que Tejiendo y la ficha no muestran.
    document: knitDocument(pinned.document),
    valid: pinned.valid,
    issues: pinned.issues,
    mirror,
    pointer: columnsToPointer(plan, progress.row),
    progressUpdatedAt: progress.row?.updated_at ?? null,
    newerVersionAvailable: newer,
  };
}

/**
 * Relectura ligera del avance (T17, I4) para cuando "Tejiendo" vuelve a primer plano: sesión, dueña y solo el puntero
 * (sin acotar: lo acota la pantalla con su plan), su `updated_at` y la versión fijada. No lee ni valida documentos.
 */
export async function getProgress(projectId: string): Promise<GetProgressResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  if (!isUuid(projectId)) return projectFailure("INVALID_REQUEST");
  const project = await supabase.from("projects").select("pattern_version_id").eq("id", projectId).eq("owner_id", user.id).maybeSingle<{ pattern_version_id: string | null }>();
  if (project.error) return dbFailure("leer el avance (proyecto)", project.error);
  if (!project.data) return projectFailure("NOT_FOUND");
  if (project.data.pattern_version_id === null) return projectFailure("NO_DESIGN");
  const progress = await readProgress(supabase, projectId);
  if (!progress.ok) return progress;
  const raw = columnsToRawPointer(progress.row);
  return {
    ok: true,
    versionId: project.data.pattern_version_id,
    pointer: { rowsDone: Math.min(raw.rowsDone, MAX_ROW_NUMBER), stitchesDone: Math.min(raw.stitchesDone, MAX_STITCH_INDEX) },
    progressUpdatedAt: progress.row?.updated_at ?? null,
  };
}

/** ¿El diseño actual es distinto de la versión fijada? Compara los jsonb tal como salen de la base (mismo orden de claves). */
async function isNewerDesign(supabase: SessionClient, userId: string, patternId: string | null, pinnedRaw: unknown): Promise<boolean | "error"> {
  if (!patternId) return false;
  const { data, error } = await supabase.from("patterns").select("document").eq("id", patternId).eq("owner_id", userId).maybeSingle<{ document: unknown }>();
  if (error) {
    logDb("comparar con el diseño actual", error);
    return "error";
  }
  if (!data) return false;
  return JSON.stringify(data.document) !== JSON.stringify(pinnedRaw);
}

/**
 * Guarda el puntero con concurrencia optimista (S2): `update … where updated_at = $esperado`. Nunca pisa en silencio:
 *  - 0 filas -> CONFLICT con la posición y la hora del servidor (`currentPointer`, `currentUpdatedAt`) y la tuya;
 *  - la versión fijada cambió -> VERSION_CHANGED con la versión actual (el puntero era de otro plan).
 * `expectedUpdatedAt` es el `updated_at` del avance que recibió la pantalla (`null` si el proyecto no tenía fila).
 * Solo valida el puntero con las cotas generales; el recorte exacto lo hace `clampPointer` al leer. No exige nada del
 * documento (ADR 0009, sección 5).
 */
export async function saveProgress(projectId: string, pinnedVersionId: string, pointer: unknown, expectedUpdatedAt: string | null): Promise<SaveProgressResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  const ptr = parseClientPointer(pointer);
  if (!isUuid(projectId) || !isUuid(pinnedVersionId) || !ptr || !(expectedUpdatedAt === null || isTimestamp(expectedUpdatedAt))) {
    return projectFailure("INVALID_REQUEST");
  }

  const project = await supabase
    .from("projects")
    .select("pattern_version_id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle<{ pattern_version_id: string | null }>();
  if (project.error) return dbFailure("guardar el avance (proyecto)", project.error);
  if (!project.data) return projectFailure("NOT_FOUND");
  if (project.data.pattern_version_id === null) return projectFailure("NO_DESIGN");
  if (project.data.pattern_version_id !== pinnedVersionId) return versionChanged(supabase, user.id, projectId);

  const columns = { part_id: null, ...pointerToColumns(ptr) };
  const written =
    expectedUpdatedAt === null
      ? await supabase.from("project_progress").insert({ project_id: projectId, ...columns }).select("updated_at")
      : await supabase.from("project_progress").update(columns).eq("project_id", projectId).eq("updated_at", expectedUpdatedAt).select("updated_at");
  // 23505: otro dispositivo creó la fila de avance primero (el proyecto no tenía): es un conflicto, no un error.
  if (written.error && written.error.code !== "23505") return dbFailure("guardar el avance", written.error);
  const rows = written.error ? [] : ((written.data ?? []) as { updated_at: string }[]);
  if (rows.length > 0 && rows[0]) return { ok: true, updatedAt: rows[0].updated_at };

  return progressConflict(supabase, user.id, projectId, ptr);
}

/** 0 filas: el avance cambió (o el proyecto ya no existe). Lee lo que tiene el servidor para que la pantalla pregunte. */
async function progressConflict(supabase: SessionClient, userId: string, projectId: string, yours: ChartPointer): Promise<SaveProgressResult> {
  const found = await readPinnedVersion(supabase, userId, projectId);
  const progress = await readProgress(supabase, projectId);
  if (!progress.ok) return progress;
  if (!found.ok) {
    // La versión no se pudo leer (por ejemplo, dejó de ser `savable`): el conflicto se da con las posiciones sin plan.
    if (found.code === "NOT_FOUND") return found;
    return conflictFailure(found.workedIn, 0, columnsToRawPointer(progress.row), progress.row?.updated_at ?? null, yours);
  }
  const plan = planChart(found.pinned.document, { mirror: await readMirror(supabase, userId) });
  const theirs = columnsToPointer(plan, progress.row);
  return conflictFailure(plan.workedIn, plan.totalRows, theirs, progress.row?.updated_at ?? null, yours);
}

function conflictFailure(
  workedIn: "rounds" | "rows" | undefined,
  totalRows: number,
  theirs: ChartPointer,
  at: string | null,
  yours: ChartPointer | undefined,
): ProjectFailure {
  return {
    ok: false,
    code: "CONFLICT",
    conflictOn: "progress",
    error: progressConflictMessage(workedIn, totalRows, theirs, yours),
    currentPointer: theirs,
    currentUpdatedAt: at,
    ...(workedIn ? { workedIn, totalRows } : {}),
  };
}

/** La versión fijada ya no es la que la pantalla creía: se devuelve la actual y dónde va el avance según el servidor. */
async function versionChanged(supabase: SessionClient, userId: string, projectId: string): Promise<ProjectFailure> {
  const found = await readPinnedVersion(supabase, userId, projectId);
  if (!found.ok) return found;
  const progress = await readProgress(supabase, projectId);
  if (!progress.ok) return progress;
  const plan = planChart(found.pinned.document, { mirror: await readMirror(supabase, userId) });
  const current = columnsToPointer(plan, progress.row);
  return {
    ok: false,
    code: "VERSION_CHANGED",
    error: versionChangedMessage(plan.workedIn, plan.totalRows, current),
    currentPointer: current,
    currentUpdatedAt: progress.row?.updated_at ?? null,
    currentVersion: found.pinned.version,
    currentVersionId: found.pinned.versionId,
    workedIn: plan.workedIn,
    totalRows: plan.totalRows,
  };
}

type RepinContext =
  | {
      ok: true;
      patternId: string;
      pinned: PinnedVersion;
      current: { document: ChartPattern; updatedAt: string; raw: unknown };
      progressUpdatedAt: string | null;
      currentPointer: ChartPointer;
      fromPlan: ChartPlan;
      toPlan: ChartPlan;
      remap: ReturnType<typeof remapPointer>;
    }
  | ProjectFailure;

/** Lo común de "ver qué cambia" y "pasar a la versión actual": lee, exige `valid` del diseño nuevo y reubica el puntero. */
async function prepareRepin(supabase: SessionClient, userId: string, projectId: string): Promise<RepinContext> {
  const found = await readPinnedVersion(supabase, userId, projectId);
  if (!found.ok) return found;
  const pinned = found.pinned;
  if (!pinned.patternId) return projectFailure("NO_DESIGN");

  const design = await readKnittableDesign(supabase, userId, pinned.patternId);
  if (!design.ok) return design;
  const progress = await readProgress(supabase, projectId);
  if (!progress.ok) return progress;

  const mirror = await readMirror(supabase, userId);
  const fromPlan = planChart(pinned.document, { mirror });
  const toPlan = planChart(design.document, { mirror });
  const currentPointer = columnsToPointer(fromPlan, progress.row);
  return {
    ok: true,
    patternId: pinned.patternId,
    pinned,
    current: { document: design.document, updatedAt: design.updatedAt, raw: design.raw },
    progressUpdatedAt: progress.row?.updated_at ?? null,
    currentPointer,
    fromPlan,
    toPlan,
    remap: remapPointer(fromPlan, toPlan, currentPointer),
  };
}

/** Qué cambiaría "Pasar a la versión actual" (puntero reubicado con `remapPointer`), para mostrarlo antes de confirmar. */
export async function getRepinPreview(projectId: string): Promise<RepinPreviewResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  if (!isUuid(projectId)) return projectFailure("INVALID_REQUEST");
  const ctx = await prepareRepin(supabase, user.id, projectId);
  if (!ctx.ok) return ctx;
  return {
    ok: true,
    sameDocument: JSON.stringify(ctx.pinned.raw) === JSON.stringify(ctx.current.raw),
    from: { version: ctx.pinned.version, workedIn: ctx.fromPlan.workedIn, totalRows: ctx.fromPlan.totalRows },
    to: { workedIn: ctx.toPlan.workedIn, totalRows: ctx.toPlan.totalRows },
    currentPointer: ctx.currentPointer,
    pointer: ctx.remap.pointer,
    clamped: ctx.remap.clamped,
    rowChanged: ctx.remap.rowChanged,
    progressUpdatedAt: ctx.progressUpdatedAt,
  };
}

/**
 * "Pasar a la versión actual". Igual que empezar: lee el diseño desde la base, exige `valid` y llama a `repin_project`
 * con el cliente admin (`p_owner_id` de la sesión). El puntero reubicado lo calcula el servidor con `remapPointer`
 * desde el avance guardado (el cliente no manda ningún puntero) y se escribe en la misma transacción.
 * `expectedProgressUpdatedAt` es el `updated_at` del avance que vio la pantalla (`null` si no tenía fila): si otro
 * dispositivo avanzó, CONFLICT en vez de pisarlo. La pantalla vacía sus escrituras pendientes antes de llamar.
 */
export async function repinProject(projectId: string, expectedProgressUpdatedAt: string | null): Promise<RepinResult> {
  const { supabase, user } = await session();
  if (!user) return projectFailure("UNAUTHENTICATED");
  if (!isUuid(projectId) || !(expectedProgressUpdatedAt === null || isTimestamp(expectedProgressUpdatedAt))) return projectFailure("INVALID_REQUEST");

  const ctx = await prepareRepin(supabase, user.id, projectId);
  if (!ctx.ok) return ctx;

  if (ctx.progressUpdatedAt !== expectedProgressUpdatedAt) {
    return conflictFailure(ctx.fromPlan.workedIn, ctx.fromPlan.totalRows, ctx.currentPointer, ctx.progressUpdatedAt, undefined);
  }

  const client = admin();
  if (!client) return projectFailure("DATABASE");
  const cols = pointerToColumns(ctx.remap.pointer);
  const { data, error } = await client.rpc("repin_project", {
    p_owner_id: user.id,
    p_project_id: projectId,
    p_expected_updated_at: ctx.current.updatedAt,
    p_expected_progress_updated_at: ctx.progressUpdatedAt,
    p_round_number: cols.round_number,
    p_stitch_index: cols.stitch_index,
  });
  if (error) {
    const failure = dbFailure("pasar a la versión actual", error);
    // Conflicto de avance en la base: se completa con lo que tiene el servidor, como en saveProgress.
    if (failure.code === "CONFLICT" && failure.conflictOn === "progress") {
      const latest = await readProgress(supabase, projectId);
      if (latest.ok) {
        const theirs = columnsToPointer(ctx.fromPlan, latest.row);
        return conflictFailure(ctx.fromPlan.workedIn, ctx.fromPlan.totalRows, theirs, latest.row?.updated_at ?? null, undefined);
      }
    }
    return failure;
  }
  const row = firstRow(data);
  if (!row || typeof row.version !== "number" || typeof row.reused !== "boolean" || typeof row.progress_updated_at !== "string") {
    logDb("pasar a la versión actual (respuesta inesperada)", undefined);
    return projectFailure("DATABASE");
  }
  revalidatePath("/proyectos");
  return {
    ok: true,
    version: row.version,
    reused: row.reused,
    pointer: ctx.remap.pointer,
    progressUpdatedAt: row.progress_updated_at,
    clamped: ctx.remap.clamped,
    rowChanged: ctx.remap.rowChanged,
    workedIn: ctx.toPlan.workedIn,
    totalRows: ctx.toPlan.totalRows,
  };
}

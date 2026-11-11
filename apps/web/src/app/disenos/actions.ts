"use server";

import { randomUUID } from "node:crypto";
import { migratePattern, newChartPattern, LIMITS, type NewChartInput, type Pattern } from "@loopitalab/pattern-core";
import { dbErrorCode } from "@/lib/designs/messages";
import {
  documentColumns,
  failure,
  isTimestamp,
  isUuid,
  jsonBytes,
  MAX_DOCUMENT_BYTES,
  MAX_VERSION_LABEL,
  prepareDocument,
} from "@/lib/designs/prepare";
import type {
  CreateDesignResult,
  DeleteDesignResult,
  DesignListItem,
  DuplicateDesignResult,
  ListDesignsResult,
  SaveDesignResult,
  SaveVersionResult,
} from "@/lib/designs/types";
import { createClient } from "@/lib/supabase/server";

/*
 * Diseños de colorwork del estudio (ADR 0006, enmienda E10). Cada acción:
 *  - exige sesión (getUser valida el token con Supabase Auth, no solo lo lee);
 *  - valida en el servidor, sin confiar en el cliente;
 *  - deja que RLS limite todo a los diseños propios. Además se filtra por owner_id: defensa en profundidad.
 * Los errores devuelven { ok: false, code, error } con el texto en español de lib/designs/messages.ts.
 */

/** Cuántos diseños devuelve "Mis diseños" por ahora (paginación en una fase posterior). */
const LIST_LIMIT = 200;

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function logDb(action: string, error: { code?: string } | null | undefined) {
  // Solo el código: el mensaje puede traer nombres internos.
  console.error(`diseños: ${action} falló`, error?.code ?? "sin código");
}

/**
 * Crea un diseño de colorwork a palillo (kind chart, knit, manual, privado).
 * `id` y origen los fija el servidor. Rechaza si el documento no es `savable`.
 */
export async function createChartPattern(input: Omit<NewChartInput, "id">): Promise<CreateDesignResult> {
  const { supabase, user } = await session();
  if (!user) return failure("UNAUTHENTICATED");

  // Tamaño de la entrada ANTES de construir el documento (la lista de lanas se clona).
  const inputBytes = jsonBytes(input);
  if (inputBytes === null || typeof input !== "object" || input === null) return failure("INVALID_REQUEST");
  if (inputBytes > MAX_DOCUMENT_BYTES) return failure("TOO_LARGE");
  if (Array.isArray(input.yarns) && input.yarns.length > LIMITS.maxYarns) return failure("TOO_LARGE");

  const id = randomUUID();
  const prepared = prepareDocument(newChartPattern({ ...input, id }));
  if (!prepared.ok) return prepared;

  const { data, error } = await supabase
    .from("patterns")
    .insert({ id, ...documentColumns(prepared.document), technique: "knit", kind: "chart", origin: "manual" })
    .select("id, updated_at")
    .single<{ id: string; updated_at: string }>();
  if (error || !data) {
    logDb("crear", error);
    return failure(error ? dbErrorCode(error, "create") : "DATABASE");
  }
  return { ok: true, id: data.id, updatedAt: data.updated_at, draft: !prepared.valid };
}

/**
 * Autoguardado con concurrencia optimista. `expectedUpdatedAt` es el `updated_at` que la interfaz recibió
 * al abrir o al guardar por última vez. Si otra pestaña o dispositivo guardó antes, no se escribe nada y
 * se devuelve CONFLICT con el `updated_at` actual. Sobrescribir es una acción explícita de la interfaz:
 * vuelve a llamar con ese `currentUpdatedAt`.
 */
export async function savePattern(id: string, document: unknown, expectedUpdatedAt: string): Promise<SaveDesignResult> {
  const { supabase, user } = await session();
  if (!user) return failure("UNAUTHENTICATED");
  if (!isUuid(id) || !isTimestamp(expectedUpdatedAt)) return failure("INVALID_REQUEST");

  const prepared = prepareDocument(document);
  if (!prepared.ok) return prepared;
  // El documento es el de este diseño: evita guardar encima el contenido de otro por un error del cliente.
  if (prepared.document.id !== id) return failure("INVALID_REQUEST");

  const { data, error } = await supabase
    .from("patterns")
    .update(documentColumns(prepared.document))
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at");
  if (error) {
    logDb("guardar", error);
    return failure(dbErrorCode(error));
  }
  if (data && data.length > 0) {
    return { ok: true, updatedAt: (data[0] as { updated_at: string }).updated_at, draft: !prepared.valid };
  }

  // Ninguna fila cambió: o no existe (o no es suyo), o `updated_at` ya no coincide.
  const current = await supabase.from("patterns").select("updated_at").eq("id", id).eq("owner_id", user.id).maybeSingle<{ updated_at: string }>();
  if (current.error) {
    logDb("guardar (consulta de conflicto)", current.error);
    return failure("DATABASE");
  }
  if (!current.data) return failure("NOT_FOUND");
  return failure("CONFLICT", { currentUpdatedAt: current.data.updated_at });
}

/**
 * "Guardar versión": instantánea del diseño tal como está guardado (snapshot_pattern, tope de 200).
 * Nunca se llama desde el autoguardado. Guarda también los borradores con errores de tejido (E10).
 */
export async function savePatternVersion(id: string, label?: string): Promise<SaveVersionResult> {
  const { supabase, user } = await session();
  if (!user) return failure("UNAUTHENTICATED");
  if (!isUuid(id)) return failure("INVALID_REQUEST");
  if (label !== undefined && typeof label !== "string") return failure("INVALID_REQUEST");
  // El mismo corte que hace la función SQL (left(…, 80)), pero explícito y por puntos de código.
  // Sin caracteres de control (\p{Cc}: U+0000 rompe jsonb/text; saltos y tabulaciones no van en una etiqueta de una línea).
  const clean = label === undefined ? null : [...label.replace(/\p{Cc}/gu, "").trim()].slice(0, MAX_VERSION_LABEL).join("") || null;

  const { data, error } = await supabase.rpc("snapshot_pattern", { p_pattern_id: id, p_label: clean });
  if (error || typeof data !== "number") {
    logDb("guardar versión", error);
    return failure(error ? dbErrorCode(error) : "DATABASE");
  }
  return { ok: true, version: data };
}

/** Diseños propios para "Mis diseños": título, forma, tamaño y fecha, sin leer los documentos completos. */
export async function listPatterns(): Promise<ListDesignsResult> {
  const { supabase, user } = await session();
  if (!user) return failure("UNAUTHENTICATED");

  const { data, error } = await supabase
    .from("patterns")
    .select("id, title, technique, kind, origin, visibility, updated_at, width:document->chart->>width, height:document->chart->>height, render_as:document->chart->>renderAs")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) {
    logDb("listar", error);
    return failure(dbErrorCode(error));
  }
  type Row = {
    id: string;
    title: string;
    technique: string;
    kind: string;
    origin: string;
    visibility: string;
    updated_at: string;
    width: string | null;
    height: string | null;
    render_as: string | null;
  };
  const toInt = (v: string | null) => (v !== null && /^\d{1,4}$/.test(v) ? Number(v) : null);
  const designs: DesignListItem[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    technique: r.technique,
    kind: r.kind,
    origin: r.origin,
    visibility: r.visibility,
    updatedAt: r.updated_at,
    width: toInt(r.width),
    height: toInt(r.height),
    renderAs: r.render_as,
  }));
  return { ok: true, designs };
}

/**
 * Duplica un diseño propio como copia privada y manual, con id y título nuevos.
 * Los diseños generados con IA no se duplican todavía: la copia tendría que conservar la etiqueta "IA"
 * y la base solo deja asignarla al servidor (service_role). Se resuelve con el pipeline de IA (fase 5).
 */
export async function duplicatePattern(id: string): Promise<DuplicateDesignResult> {
  const { supabase, user } = await session();
  if (!user) return failure("UNAUTHENTICATED");
  if (!isUuid(id)) return failure("INVALID_REQUEST");

  const source = await supabase
    .from("patterns")
    .select("document, origin")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle<{ document: unknown; origin: string }>();
  if (source.error) {
    logDb("duplicar (lectura)", source.error);
    return failure(dbErrorCode(source.error));
  }
  if (!source.data) return failure("NOT_FOUND");
  if (source.data.origin !== "manual") return failure("AI_DUPLICATE_UNSUPPORTED");

  // Todo documento que se abre pasa por migratePattern y validatePattern (ADR 0006, lectura).
  const m = migratePattern(source.data.document);
  if (!m.ok) return failure("NOT_SAVABLE", { issues: m.issues });
  const original = m.document as Pattern;

  const newId = randomUUID();
  const copyTitle = [...`Copia de ${original.title}`].slice(0, LIMITS.maxTitleLength).join("");
  const prepared = prepareDocument({ ...original, id: newId, title: copyTitle });
  if (!prepared.ok) return prepared;

  const { data, error } = await supabase
    .from("patterns")
    .insert({ id: newId, ...documentColumns(prepared.document), technique: prepared.document.technique, kind: prepared.document.kind, origin: "manual" })
    .select("id, updated_at")
    .single<{ id: string; updated_at: string }>();
  if (error || !data) {
    logDb("duplicar", error);
    return failure(error ? dbErrorCode(error, "create") : "DATABASE");
  }
  return { ok: true, id: data.id, updatedAt: data.updated_at, draft: !prepared.valid };
}

/**
 * Mensaje de "este diseño tiene proyectos". Cuenta los proyectos propios que lo tejen (RLS + filtro por dueña) para
 * decir cuántos; si la cuenta falla, el mensaje sale sin el número. Nunca devuelve el texto de la base.
 */
async function hasProjectsFailure(supabase: Awaited<ReturnType<typeof createClient>>, patternId: string) {
  const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("pattern_id", patternId);
  if (typeof count !== "number" || count < 1) return failure("HAS_PROJECTS");
  const n = count === 1 ? "1 proyecto" : `${count} proyectos`;
  return { ...failure("HAS_PROJECTS"), error: `Este diseño tiene ${n}. Bórralos antes de borrar el diseño.` };
}

/**
 * Borra un diseño propio. Sus versiones se van con él (cascada), salvo que un proyecto las esté tejiendo: entonces la
 * base lo impide (23503) y se pide borrar antes los proyectos (ADR 0009, D1).
 */
export async function deletePattern(id: string): Promise<DeleteDesignResult> {
  const { supabase, user } = await session();
  if (!user) return failure("UNAUTHENTICATED");
  if (!isUuid(id)) return failure("INVALID_REQUEST");

  const { data, error } = await supabase.from("patterns").delete().eq("id", id).eq("owner_id", user.id).select("id");
  if (error) {
    logDb("borrar", error);
    // 23503: algún proyecto teje una versión de este diseño (projects.pattern_version_id, ADR 0009, D1).
    if (error.code === "23503") return hasProjectsFailure(supabase, id);
    return failure(dbErrorCode(error));
  }
  if (!data || data.length === 0) return failure("NOT_FOUND");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prepareUserYarn, savedYarnFromRow, type SavedYarn } from "@/lib/yarns/saved";
import {
  yarnDbFailure,
  yarnFailure,
  type DeleteYarnResult,
  type ListYarnsResult,
  type SaveYarnResult,
  type YarnFailure,
} from "@/lib/yarns/messages";

/*
 * Lanas guardadas (`user_yarns`, ADR 0008, sección 5). Sin clave secreta: todo va con el cliente de la sesión (RLS "lanas:
 * todo en las propias") y además se filtra por `owner_id`. Cada acción exige sesión (`auth.getUser()`), valida en el servidor
 * con `validateYarn` y las reglas de la base, y traduce 54000 (tope de 500) a un mensaje. La nota es privada: no se
 * incluye en ningún diseño desde aquí (la copia al diseño es una decisión explícita de la interfaz: `yarnFromSaved`).
 */

const COLUMNS = "id, weight, composition, color_hex, palette_id, note, created_at";
const LIST_LIMIT = 500;

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user: user ? { id: user.id } : null };
}

function logDb(action: string, error: { code?: string } | null | undefined) {
  console.error(`lanas: ${action} falló`, error?.code ?? "sin código");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSaved(row: unknown): SavedYarn | null {
  return savedYarnFromRow(row);
}

/** Lanas guardadas de la usuaria, de la más nueva a la más antigua. */
export async function listUserYarns(): Promise<ListYarnsResult> {
  const { supabase, user } = await session();
  if (!user) return yarnFailure("UNAUTHENTICATED");
  const { data, error } = await supabase.from("user_yarns").select(COLUMNS).eq("owner_id", user.id).order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) {
    logDb("listar", error);
    return yarnDbFailure(error);
  }
  const yarns = ((data ?? []) as unknown[]).map(toSaved).filter((y): y is SavedYarn => y !== null);
  return { ok: true, yarns };
}

function invalidFailure(p: Extract<ReturnType<typeof prepareUserYarn>, { ok: false }>): YarnFailure {
  return yarnFailure(p.code, { issues: p.issues, ...(p.reason ? { reason: p.reason } : {}) });
}

/**
 * Guarda una lana (copia por valor: "Guardar en mis lanas"). `truncateNote: true` solo cuando la usuaria confirmó que
 * se recorte una nota de más de 200 caracteres.
 */
export async function saveUserYarn(input: unknown, opts?: { truncateNote?: boolean }): Promise<SaveYarnResult> {
  const { supabase, user } = await session();
  if (!user) return yarnFailure("UNAUTHENTICATED");
  const prepared = prepareUserYarn(input, { truncateNote: opts?.truncateNote === true });
  if (!prepared.ok) return invalidFailure(prepared);

  const { data, error } = await supabase
    .from("user_yarns")
    .insert({ owner_id: user.id, ...prepared.row })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    logDb("guardar", error);
    return error ? yarnDbFailure(error) : yarnFailure("DATABASE");
  }
  const yarn = toSaved(data);
  if (!yarn) return yarnFailure("DATABASE");
  revalidatePath("/lanas");
  return { ok: true, yarn, warnings: prepared.warnings };
}

/** Edita una lana guardada. No cambia ningún diseño (la copia es por valor). */
export async function updateUserYarn(id: string, input: unknown, opts?: { truncateNote?: boolean }): Promise<SaveYarnResult> {
  const { supabase, user } = await session();
  if (!user) return yarnFailure("UNAUTHENTICATED");
  if (typeof id !== "string" || !UUID_RE.test(id)) return yarnFailure("INVALID_REQUEST");
  const prepared = prepareUserYarn(input, { truncateNote: opts?.truncateNote === true });
  if (!prepared.ok) return invalidFailure(prepared);

  const { data, error } = await supabase.from("user_yarns").update(prepared.row).eq("id", id).eq("owner_id", user.id).select(COLUMNS);
  if (error) {
    logDb("editar", error);
    return yarnDbFailure(error);
  }
  const row = (data ?? [])[0];
  if (!row) return yarnFailure("NOT_FOUND");
  const yarn = toSaved(row);
  if (!yarn) return yarnFailure("DATABASE");
  revalidatePath("/lanas");
  return { ok: true, yarn, warnings: prepared.warnings };
}

/** Borra una lana guardada. */
export async function deleteUserYarn(id: string): Promise<DeleteYarnResult> {
  const { supabase, user } = await session();
  if (!user) return yarnFailure("UNAUTHENTICATED");
  if (typeof id !== "string" || !UUID_RE.test(id)) return yarnFailure("INVALID_REQUEST");
  const { data, error } = await supabase.from("user_yarns").delete().eq("id", id).eq("owner_id", user.id).select("id");
  if (error) {
    logDb("borrar", error);
    return yarnDbFailure(error);
  }
  if (!data || data.length === 0) return yarnFailure("NOT_FOUND");
  revalidatePath("/lanas");
  return { ok: true };
}

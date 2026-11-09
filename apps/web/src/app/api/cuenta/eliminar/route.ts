import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, UPLOADS_BUCKET } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { consumeReauthIntent } from "../../_lib/reauth";
import { isSameSite, jsonError, jsonOk, readBody } from "../../_lib/request";

/**
 * Eliminar mi cuenta (Ley 21.719: derecho de supresión).
 * POST con JSON o formulario: { confirm: "ELIMINAR" }.
 *
 * 1. Solo desde este mismo sitio y con sesión.
 * 2. Re-autenticación atada a la acción (_lib/reauth.ts): el navegador pidió un intento con
 *    POST /api/cuenta/reautenticar y luego la usuaria volvió a autenticarse (contraseña con
 *    signInWithPassword y CAPTCHA, para que Supabase Auth vea la IP real, o Google/Microsoft
 *    si la cuenta no tiene contraseña). Aquí se consume el intento; este servidor nunca llama
 *    a signInWithPassword.
 * 3. Bloquea a la usuaria (ban) y cierra todas sus sesiones, para que no pueda subir nada
 *    mientras se borra.
 * 4. Borra los archivos de Storage (Storage no tiene cascada desde auth.users).
 * 5. Borra la usuaria con la clave secreta; la base borra el resto en cascada
 *    (ver supabase/migrations/20261105133225_denuncias_y_derechos.sql).
 * 6. Vuelve a listar la carpeta y borra lo que haya quedado (una subida que terminó a mitad).
 * 7. Borra las cookies de sesión.
 */

const MAX_BODY = 16 * 1024;
const CONFIRM_TEXT = "ELIMINAR";
/** Un ban de ~100 años: la cuenta se borra enseguida, esto solo cubre el intervalo. */
const BAN_DURATION = "876000h";

type Admin = SupabaseClient;

async function readConfirm(request: NextRequest): Promise<string | "too_large" | "timeout" | null> {
  const raw = await readBody(request, MAX_BODY, 10_000);
  if (raw === "too_large" || raw === "timeout") return raw;
  if (!raw) return null;
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body: unknown = JSON.parse(new TextDecoder().decode(raw));
      if (!body || typeof body !== "object") return null;
      const { confirm } = body as Record<string, unknown>;
      return typeof confirm === "string" ? confirm : null;
    }
    if (type.includes("application/x-www-form-urlencoded")) {
      return new URLSearchParams(new TextDecoder().decode(raw)).get("confirm");
    }
  } catch {
    return null;
  }
  return null;
}

/** Lista recursivamente todos los objetos bajo una carpeta del bucket. */
async function listFolder(admin: Admin, folder: string): Promise<string[]> {
  const paths: string[] = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await admin.storage.from(UPLOADS_BUCKET).list(folder, { limit, offset });
    if (error) throw new Error(`storage list: ${error.message}`);
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      // Las "carpetas" vienen sin id.
      if (item.id === null) paths.push(...(await listFolder(admin, path)));
      else paths.push(path);
    }
    if (data.length < limit) return paths;
  }
}

async function removePaths(admin: Admin, userId: string, paths: Iterable<string>): Promise<void> {
  const all = [...new Set(paths)].filter((p) => p.startsWith(`${userId}/`));
  for (let i = 0; i < all.length; i += 1000) {
    const { error } = await admin.storage.from(UPLOADS_BUCKET).remove(all.slice(i, i + 1000));
    if (error) throw new Error(`storage remove: ${error.message}`);
  }
}

async function deleteUserFiles(admin: Admin, userId: string): Promise<void> {
  const paths = await listFolder(admin, userId);
  // También las rutas registradas en public.uploads, por si alguna quedó fuera del listado.
  const { data: rows, error } = await admin.from("uploads").select("storage_path").eq("owner_id", userId);
  if (error) throw new Error(`uploads: ${error.message}`);
  for (const row of rows as { storage_path: string }[]) paths.push(row.storage_path);
  await removePaths(admin, userId, paths);
}

export async function POST(request: NextRequest) {
  if (!isSameSite(request)) return jsonError(403, "cross_site");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthenticated");

  const confirm = await readConfirm(request);
  if (confirm === "too_large") return jsonError(413, "too_large");
  if (confirm === "timeout") return jsonError(408, "body_timeout");
  if (confirm?.trim() !== CONFIRM_TEXT) return jsonError(400, "confirm_required");

  let admin: Admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("eliminar: falta configuración", e instanceof Error ? e.message : e);
    return jsonError(500, "server_misconfigured");
  }

  if (!(await consumeReauthIntent(supabase, admin, "delete_account"))) return jsonError(403, "reauth_required");

  // Bloquear antes de borrar: sin sesiones nuevas ni renovadas mientras se borra.
  const { error: banError } = await admin.auth.admin.updateUserById(user.id, { ban_duration: BAN_DURATION });
  if (banError) {
    console.error("eliminar: no se pudo bloquear a la usuaria", banError.message);
    return jsonError(500, "delete_failed");
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const { error: signOutError } = await admin.auth.admin.signOut(session.access_token, "global");
    if (signOutError) console.error("eliminar: no se pudieron cerrar las sesiones", signOutError.message);
  }

  /** Si algo falla antes de borrar la usuaria, se le devuelve el acceso para que reintente. */
  const unban = async () => {
    const { error } = await admin.auth.admin.updateUserById(user.id, { ban_duration: "none" });
    if (error) console.error("eliminar: no se pudo quitar el bloqueo", error.message);
  };

  try {
    await deleteUserFiles(admin, user.id);
  } catch (e) {
    console.error("eliminar: no se pudieron borrar los archivos", e instanceof Error ? e.message : e);
    await unban();
    return jsonError(500, "storage_delete_failed");
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("eliminar: no se pudo borrar la usuaria", deleteError.message);
    await unban();
    return jsonError(500, "delete_failed");
  }

  // Segunda pasada: lo que una subida en curso alcanzó a guardar entre el listado y el borrado.
  try {
    await removePaths(admin, user.id, await listFolder(admin, user.id));
  } catch (e) {
    // Sin el uid ni rutas (empiezan con el uid): solo el tipo de error.
    console.error("eliminar: quedaron archivos sin borrar tras eliminar la cuenta", e instanceof Error ? e.name : "error");
  }

  // La sesión ya no existe en el servidor; signOut local borra las cookies de todos modos.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token")) cookieStore.delete(cookie.name);
  }

  return jsonOk({ ok: true });
}

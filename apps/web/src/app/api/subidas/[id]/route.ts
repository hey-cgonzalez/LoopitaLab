import type { NextRequest } from "next/server";
import { createAdminClient, UPLOADS_BUCKET } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { notFound, uploadsEnabled } from "../enabled";
import { isSameSite, jsonError, jsonOk } from "../../_lib/request";

/**
 * Borra una imagen subida: el archivo de Storage y su fila en public.uploads, juntos.
 * El cliente ya no puede borrar ninguno de los dos directamente (F2-M1). Borrar no devuelve
 * cupo: el tope diario cuenta en public.rate_events.
 * Respuestas: 200 { ok: true }, 400 id inválido, 401 sin sesión, 403 otro sitio, 404 no existe
 * o no es suya (no se distinguen).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!uploadsEnabled()) return notFound();
  if (!isSameSite(request)) return jsonError(403, "cross_site");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthenticated");

  const { id } = await params;
  if (!UUID_RE.test(id)) return jsonError(400, "invalid_id");

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("subidas: falta configuración", e instanceof Error ? e.message : e);
    return jsonError(500, "server_misconfigured");
  }

  // Siempre acotado a la dueña de la sesión: la clave secreta se salta RLS.
  const { data: row, error } = await admin
    .from("uploads")
    .select("id, storage_path")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle<{ id: string; storage_path: string }>();
  if (error) {
    console.error("subidas: error al buscar la subida", error.message);
    return jsonError(500, "lookup_failed");
  }
  if (!row || !row.storage_path.startsWith(`${user.id}/`)) return jsonError(404, "not_found");

  // Primero el archivo: si falla, la fila sigue apuntando a él y se puede reintentar.
  const { error: removeError } = await admin.storage.from(UPLOADS_BUCKET).remove([row.storage_path]);
  if (removeError) {
    console.error("subidas: no se pudo borrar el archivo (sin ruta: lleva el uid)", removeError.name);
    return jsonError(500, "storage_delete_failed");
  }
  const { error: deleteError } = await admin.from("uploads").delete().eq("id", row.id).eq("owner_id", user.id);
  if (deleteError) {
    console.error("subidas: archivo borrado pero la fila quedó", row.id, deleteError.message);
    return jsonError(500, "delete_failed");
  }
  return jsonOk({ ok: true });
}

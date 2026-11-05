import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { beginOperation, endOperation, renewOperation } from "../../_lib/operations";
import { isSameSite, jsonError } from "../../_lib/request";

/**
 * Exportar mis datos (Ley 21.719: derecho de acceso y portabilidad).
 *
 * - Los datos se leen con el cliente de la sesión, NO con la clave secreta: RLS limita todo a lo
 *   propio. Los filtros por dueña de cada consulta son una segunda capa.
 * - La clave secreta solo se usa para el candado y el tope (public.begin_operation): una
 *   exportación a la vez (409) y 5 por día (429), contadas en la base.
 * - La respuesta se genera en streaming, tabla por tabla y página por página, sin indentación,
 *   para no tener toda la exportación en memoria. Patrones y versiones van en páginas chicas
 *   porque cada documento puede pesar hasta 2 MB.
 * - El candado se renueva cada minuto mientras se envía (latido); si se pierde, se aborta.
 * - Si una tabla falla a mitad, el stream se aborta con error: la descarga queda cortada (JSON
 *   inválido), nunca como un JSON válido pero incompleto.
 */

interface Section {
  key: string;
  table: string;
  orderBy: string;
  page: number;
  columns?: string;
  /** Filtro por la usuaria, además de RLS. */
  column?: string;
}

/** Latido del candado (vence a los 5 minutos en la base). */
const HEARTBEAT_MS = 60_000;

const SECTIONS: readonly Section[] = [
  { key: "patterns", table: "patterns", orderBy: "id", page: 10, column: "owner_id" },
  { key: "pattern_versions", table: "pattern_versions", orderBy: "id", page: 10 },
  { key: "projects", table: "projects", orderBy: "id", page: 1000, column: "owner_id" },
  { key: "project_progress", table: "project_progress", orderBy: "project_id", page: 1000 },
  { key: "project_notes", table: "project_notes", orderBy: "id", page: 1000 },
  { key: "user_yarns", table: "user_yarns", orderBy: "id", page: 1000, column: "owner_id" },
  // Solo metadatos; las imágenes se ven en la aplicación con URLs firmadas.
  { key: "uploads", table: "uploads", orderBy: "id", page: 1000, column: "owner_id" },
  // Columnas que la denunciante puede leer (la instantánea interna queda para la moderación).
  {
    key: "pattern_reports",
    table: "pattern_reports",
    orderBy: "id",
    page: 1000,
    columns: "id, pattern_id, reporter_id, reason, details, status, pattern_title, created_at",
    column: "reporter_id",
  },
  { key: "ai_jobs", table: "ai_jobs", orderBy: "id", page: 1000, column: "owner_id" },
];

async function readPage(supabase: SupabaseClient, s: Section, userId: string, from: number): Promise<unknown[]> {
  let query = supabase
    .from(s.table)
    .select(s.columns ?? "*")
    .order(s.orderBy, { ascending: true })
    .range(from, from + s.page - 1);
  if (s.column) query = query.eq(s.column, userId);
  const { data, error } = await query;
  if (error) throw new Error(`${s.table}: ${error.message}`);
  return data as unknown[];
}

/** El documento JSON en trozos: encabezado, luego cada tabla página por página. */
async function* exportChunks(
  supabase: SupabaseClient,
  head: Record<string, unknown>,
  userId: string,
  heartbeat: () => Promise<void>,
): AsyncGenerator<string> {
  const headJson = JSON.stringify(head);
  yield headJson.slice(0, -1); // sin la llave de cierre
  for (const s of SECTIONS) {
    yield `,${JSON.stringify(s.key)}:[`;
    let first = true;
    for (let from = 0; ; from += s.page) {
      await heartbeat();
      const rows = await readPage(supabase, s, userId, from);
      let chunk = "";
      for (const row of rows) {
        chunk += (first ? "" : ",") + JSON.stringify(row);
        first = false;
      }
      if (chunk) yield chunk;
      if (rows.length < s.page) break;
    }
    yield "]";
  }
  yield "}";
}

export async function GET(request: NextRequest) {
  if (!isSameSite(request, { allowNavigation: true })) return jsonError(403, "cross_site");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthenticated");

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("exportar: falta configuración", e instanceof Error ? e.message : e);
    return jsonError(500, "server_misconfigured");
  }

  const lock = await beginOperation(admin, user.id, "export");
  if (lock instanceof Response) return lock;

  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    await endOperation(admin, lock);
  };
  let lastBeat = Date.now();
  const heartbeat = async () => {
    if (Date.now() - lastBeat < HEARTBEAT_MS) return;
    lastBeat = Date.now();
    // Si el candado venció y otro proceso lo tomó, esta exportación ya no vale: se aborta.
    if (!(await renewOperation(admin, lock))) throw new Error("export lock lost");
  };

  // El perfil se lee antes de empezar: si la base no responde, todavía se puede contestar 500.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .order("id", { ascending: true })
    .range(0, 0);
  if (profileError) {
    console.error("exportar: error al leer el perfil", profileError.message);
    await finish();
    return jsonError(500, "export_failed");
  }

  const head = {
    format: "loopitalab-export",
    version: 1,
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
    },
    profile: (profile as unknown[])[0] ?? null,
  };

  const chunks = exportChunks(supabase, head, user.id, heartbeat);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) {
          controller.close();
          await finish();
        } else {
          controller.enqueue(encoder.encode(value));
        }
      } catch (e) {
        // Nunca se entrega una exportación incompleta como si fuera completa.
        console.error("exportar: error a mitad de la exportación", e instanceof Error ? e.message : e);
        controller.error(e instanceof Error ? e : new Error("export_failed"));
        await finish();
      }
    },
    async cancel() {
      await chunks.return(undefined);
      await finish();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="loopitalab-mis-datos.json"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

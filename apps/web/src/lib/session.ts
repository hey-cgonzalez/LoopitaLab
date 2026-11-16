import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { weightLabel } from "@/lib/yarn";

export interface Profile {
  display_name: string | null;
  units: "metric" | "imperial";
  dominant_hand: "right" | "left";
  mirror_knitting: boolean;
}

/** Texto de grosor por defecto para los estudios (uso real de yarn-catalog en el servidor). */
export const DEFAULT_WEIGHT_LABEL = weightLabel(4);

/** Usuaria con sesión y su perfil. Si no hay sesión, envía a ingresar. */
export async function requireUser(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/ingresar?next=${encodeURIComponent(nextPath)}`);

  // Si la migración de "tejer en espejo" aún no está aplicada, el select con mirror_knitting
  // falla con "columna inexistente" (Postgres 42703, o PGRST204 si PostgREST tiene la caché del
  // esquema vieja). SOLO en ese caso se relee sin la columna y se usa false, para no tumbar
  // /cuenta. Cualquier otro error (timeout, sesión vencida) se registra y deja el perfil en null:
  // no se inventa un false que luego se guardaría encima del valor real (QA F1).
  const full = await supabase
    .from("profiles")
    .select("display_name, units, dominant_hand, mirror_knitting")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  let profile: Profile | null = full.data;
  if (full.error) {
    if (isMissingColumn(full.error)) {
      const base = await supabase
        .from("profiles")
        .select("display_name, units, dominant_hand")
        .eq("id", user.id)
        .maybeSingle<Omit<Profile, "mirror_knitting">>();
      if (base.error) console.error("perfil: no se pudo releer sin mirror_knitting", base.error.code ?? "sin código");
      profile = base.data ? { ...base.data, mirror_knitting: false } : null;
    } else {
      console.error("perfil: no se pudo leer", full.error.code ?? "sin código");
      profile = null;
    }
  }

  const name = profile?.display_name || user.email?.split("@")[0] || "Tejedora";
  return { supabase, user, profile, name };
}

/** ¿El error de PostgREST es "columna inexistente"? (migración pendiente o caché de esquema vieja). */
export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

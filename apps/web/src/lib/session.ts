import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Usuaria con sesión y su perfil. Si no hay sesión, envía a ingresar. */
export async function requireUser(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/ingresar?next=${encodeURIComponent(nextPath)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, terminology, units, dominant_hand")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null; terminology: "es" | "us" | "uk"; units: "metric" | "imperial"; dominant_hand: "right" | "left" }>();

  const name = profile?.display_name || user.email?.split("@")[0] || "Tejedora";
  return { supabase, user, profile, name };
}

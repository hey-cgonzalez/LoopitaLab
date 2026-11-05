"use server";

import { isMissingColumn } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ProfileFormState {
  error?: string;
  ok?: string;
}

const ALLOWED = {
  terminology: ["es", "us", "uk"],
  units: ["metric", "imperial"],
  dominant_hand: ["right", "left"],
} as const;

/** Checkbox: ausente = false, "on" = true. Cualquier otro valor se rechaza. */
function parseMirror(v: FormDataEntryValue | null): boolean | null {
  if (v === null) return false;
  return v === "on" ? true : null;
}

export async function updateProfile(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  const display_name = String(form.get("display_name") ?? "").trim().slice(0, 80) || null;
  const values: Record<string, string> = {};
  for (const [key, options] of Object.entries(ALLOWED)) {
    const v = String(form.get(key) ?? "");
    if (!(options as readonly string[]).includes(v)) return { error: "Hay una opción que no reconocemos. Recarga la página e intenta de nuevo." };
    values[key] = v;
  }

  const mirror = parseMirror(form.get("mirror_knitting"));
  if (mirror === null) return { error: "Hay una opción que no reconocemos. Recarga la página e intenta de nuevo." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión terminó. Vuelve a ingresar." };

  let { error } = await supabase.from("profiles").update({ display_name, ...values, mirror_knitting: mirror }).eq("id", user.id);
  // Migración de "tejer en espejo" pendiente (QA O1): se guarda el resto de las preferencias.
  if (error && isMissingColumn(error)) {
    ({ error } = await supabase.from("profiles").update({ display_name, ...values }).eq("id", user.id));
  }
  if (error) return { error: "No pudimos guardar tus preferencias. Intenta de nuevo." };
  revalidatePath("/", "layout");
  return { ok: "Preferencias guardadas." };
}

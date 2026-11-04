"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ProjectFormState {
  error?: string;
}

export async function createProject(_prev: ProjectFormState, form: FormData): Promise<ProjectFormState> {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Ponle un nombre al proyecto." };
  if (title.length > 120) return { error: "El nombre puede tener hasta 120 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").insert({ title });
  if (error) return { error: "No pudimos crear el proyecto. Revisa tu conexión e intenta de nuevo." };
  revalidatePath("/proyectos");
  return {};
}

const STATUSES = ["planned", "in_progress", "paused", "finished"] as const;

export async function setProjectStatus(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;
  const supabase = await createClient();
  // RLS garantiza que solo se actualice si el proyecto es de la usuaria.
  await supabase.from("projects").update({ status }).eq("id", id);
  revalidatePath("/proyectos");
}

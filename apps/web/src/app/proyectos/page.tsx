import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { requireUser } from "@/lib/session";
import { NewProjectForm } from "./NewProjectForm";
import { ProjectList, type ProjectRow } from "./ProjectList";

export const metadata: Metadata = { title: "Proyectos" };

export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { supabase, name } = await requireUser("/proyectos");
  const { aviso } = await searchParams;
  const { data, error } = await supabase.from("projects").select("id, title, status, updated_at").order("updated_at", { ascending: false });
  const projects = (data ?? []) as ProjectRow[];

  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <FormMessage message={aviso === "clave" ? "Tu contraseña quedó actualizada." : undefined} tone="ok" />
        <div className="grid items-end gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Tus proyectos</h1>
            <p className="mt-1 text-tinta-suave">Cada proyecto guarda su estado. Pronto podrás asociarle un patrón y seguirlo vuelta a vuelta.</p>
          </div>
          <NewProjectForm />
        </div>

        {error ? (
          <FormMessage message="No pudimos cargar tus proyectos. Recarga la página para intentarlo de nuevo." tone="error" />
        ) : projects.length === 0 ? (
          <p className="max-w-2xl rounded-2xl border-2 border-dashed border-linea px-6 py-8 text-tinta-suave">
            Todavía no tienes proyectos. Crea el primero con el nombre de lo que quieres tejer.
          </p>
        ) : (
          <ProjectList projects={projects} />
        )}
      </main>
    </>
  );
}

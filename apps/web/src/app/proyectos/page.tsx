import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { requireUser } from "@/lib/session";
import { NewProjectForm } from "./NewProjectForm";
import { listProjects } from "@/lib/projects/list";
import { PROJECT_TEXTS } from "@/lib/projects/texts";
import { ProjectList } from "./ProjectList";

export const metadata: Metadata = { title: "Proyectos" };

export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { supabase, user, name } = await requireUser("/proyectos");
  const { aviso } = await searchParams;
  const result = await listProjects(supabase, user.id);
  const projects = result.ok ? result.projects : [];
  const error = !result.ok;

  return (
    <>
      <AppHeader name={name} ownerId={user.id} />
      <main className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <FormMessage message={aviso === "clave" ? "Tu contraseña quedó actualizada." : undefined} tone="ok" />
        <div className="grid items-end gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{PROJECT_TEXTS.proyectos.titulo}</h1>
            <p className="mt-1 text-tinta-suave">{PROJECT_TEXTS.proyectos.subtitulo}</p>
          </div>
          <NewProjectForm />
        </div>

        {error ? (
          <FormMessage message={PROJECT_TEXTS.proyectos.errorCarga} tone="error" />
        ) : projects.length === 0 ? (
          <p className="max-w-2xl rounded-2xl border-2 border-dashed border-linea px-6 py-8 text-tinta-suave">
            {PROJECT_TEXTS.proyectos.vacio}
          </p>
        ) : (
          <ProjectList projects={projects} />
        )}
      </main>
    </>
  );
}

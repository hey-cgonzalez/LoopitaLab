import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { requireUser } from "@/lib/session";
import { setProjectStatus } from "./actions";
import { NewProjectForm } from "./NewProjectForm";

export const metadata: Metadata = { title: "Proyectos" };

interface ProjectRow {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "paused" | "finished";
  updated_at: string;
}

const STATUS_LABEL: Record<ProjectRow["status"], string> = {
  planned: "Por empezar",
  in_progress: "Tejiendo",
  paused: "En pausa",
  finished: "Terminado",
};

const dateFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" });

export default async function Page({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { supabase, name } = await requireUser("/proyectos");
  const { aviso } = await searchParams;
  const { data, error } = await supabase.from("projects").select("id, title, status, updated_at").order("updated_at", { ascending: false });
  const projects = (data ?? []) as ProjectRow[];

  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto grid max-w-5xl gap-10 px-6 py-10">
        <FormMessage message={aviso === "clave" ? "Tu contraseña quedó actualizada." : undefined} tone="ok" />
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-bold tracking-tight">Tus proyectos</h1>
          <p className="mt-2 text-tinta-suave">Cada proyecto guarda su estado. Pronto podrás asociarle un patrón y seguirlo vuelta a vuelta.</p>
        </div>

        <div className="max-w-2xl">
          <NewProjectForm />
        </div>

        {error ? (
          <FormMessage message="No pudimos cargar tus proyectos. Recarga la página para intentarlo de nuevo." tone="error" />
        ) : projects.length === 0 ? (
          <p className="max-w-2xl rounded-2xl border-2 border-dashed border-linea px-6 py-8 text-tinta-suave">
            Todavía no tienes proyectos. Crea el primero con el nombre de lo que quieres tejer.
          </p>
        ) : (
          <ul className="grid max-w-3xl divide-y-2 divide-linea border-y-2 border-linea">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-semibold">{p.title}</p>
                  <p className="text-sm text-tinta-suave">Actualizado el {dateFmt.format(new Date(p.updated_at))}</p>
                </div>
                <form action={setProjectStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <label htmlFor={`estado-${p.id}`} className="sr-only">
                    Estado de {p.title}
                  </label>
                  <select id={`estado-${p.id}`} name="status" defaultValue={p.status} className="rounded-xl border-2 border-linea bg-superficie px-3 py-2">
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-full border-2 border-marino px-4 py-2 font-bold hover:bg-marino hover:text-white">
                    Guardar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

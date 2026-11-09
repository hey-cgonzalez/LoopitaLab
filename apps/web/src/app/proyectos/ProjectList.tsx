import { setProjectStatus } from "./actions";

export interface ProjectRow {
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

/** Lista de proyectos en tarjetas: una columna en móvil, dos en tableta y tres en escritorio. */
export function ProjectList({ projects }: { projects: ProjectRow[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <li key={p.id} className="flex flex-col gap-3 rounded-2xl border-2 border-linea bg-superficie p-4">
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-semibold">{p.title}</p>
            <p className="text-sm text-tinta-suave">Actualizado el {dateFmt.format(new Date(p.updated_at))}</p>
          </div>
          <form action={setProjectStatus} className="mt-auto flex items-center gap-2">
            <input type="hidden" name="id" value={p.id} />
            <label htmlFor={`estado-${p.id}`} className="sr-only">
              Estado de {p.title}
            </label>
            <select id={`estado-${p.id}`} name="status" defaultValue={p.status} className="min-w-0 flex-1 rounded-xl border-2 border-borde bg-superficie px-3 py-2">
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
  );
}

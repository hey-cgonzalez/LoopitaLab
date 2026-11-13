import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { planChart } from "@loopitalab/follow";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { PROJECT_TEXTS } from "@/lib/projects/texts";
import { requireUser } from "@/lib/session";
import { loadProject, setProjectStatus } from "../actions";
import { STATUS_LABEL } from "@/lib/projects/texts";
import { ProjectSheet } from "./ProjectSheet";
import { ProjectSheetDelete } from "./ProjectSheetDelete";

export const metadata: Metadata = { title: "Proyecto", robots: { index: false, follow: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ficha de un proyecto (T12). Con diseño: `loadProject`; sin diseño: el flujo de estado de siempre. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase, user, name } = await requireUser(`/proyectos/${id}`);

  const base = await supabase.from("projects").select("id, title, status, pattern_id").eq("id", id).eq("owner_id", user.id).maybeSingle<{ id: string; title: string; status: string; pattern_id: string | null }>();
  if (base.error) {
    console.error("proyectos: abrir falló", base.error.code ?? "sin código");
    return (
      <Shell name={name} title="No pudimos abrir el proyecto">
        <FormMessage message="Revisa tu conexión y recarga la página en unos minutos." tone="error" />
      </Shell>
    );
  }
  if (!base.data) notFound();

  const r = await loadProject(id);
  if (!r.ok) {
    if (r.code === "NOT_FOUND") notFound();
    const noDesign = r.code === "NO_DESIGN";
    return (
      <Shell name={name} title={base.data.title}>
        {noDesign ? (
          <p className="text-tinta-suave">{PROJECT_TEXTS.proyectos.sinDiseno}. {PROJECT_TEXTS.proyectos.soloEstado}</p>
        ) : (
          <>
            <FormMessage message={r.code === "NOT_SAVABLE" ? PROJECT_TEXTS.proyectos.noSavable : r.error} tone="error" />
            {r.issues && r.issues.length > 0 ? (
              <ul className="list-disc pl-6">
                {r.issues.slice(0, 8).map((i, k) => (
                  <li key={`${i.code}-${i.path}-${k}`}>{i.message}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
        <form action={setProjectStatus} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={base.data.id} />
          <label htmlFor="estado" className="font-bold">
            {PROJECT_TEXTS.proyectos.estado}
          </label>
          <select id="estado" name="status" defaultValue={base.data.status} className="rounded-xl border-2 border-borde bg-superficie px-3 py-2">
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-full border-2 border-marino px-4 py-2 font-bold hover:bg-marino hover:text-white">
            {PROJECT_TEXTS.proyectos.guardarEstado}
          </button>
        </form>
        <ProjectSheetDelete id={base.data.id} title={base.data.title} />
      </Shell>
    );
  }

  const plan = planChart(r.document, { mirror: r.mirror });
  return (
    <Shell name={name} title={r.project.title}>
      <ProjectSheet
        project={{ id: r.project.id, title: r.project.title, status: r.project.status, patternId: r.project.patternId, version: r.project.version }}
        designTitle={r.document.title}
        workedIn={plan.workedIn}
        totalRows={plan.totalRows}
        pointer={r.pointer}
        progressUpdatedAt={r.progressUpdatedAt}
        valid={r.valid}
        newerVersionAvailable={r.newerVersionAvailable}
      />
      <form action={setProjectStatus} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={r.project.id} />
        <label htmlFor="estado" className="font-bold">
          {PROJECT_TEXTS.proyectos.estado}
        </label>
        <select id="estado" name="status" defaultValue={r.project.status} className="rounded-xl border-2 border-borde bg-superficie px-3 py-2">
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-full border-2 border-marino px-4 py-2 font-bold hover:bg-marino hover:text-white">
          {PROJECT_TEXTS.proyectos.guardarEstado}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto grid w-full max-w-3xl content-start gap-5 px-4 py-6 sm:px-6 lg:py-8">
        <p>
          <Link href="/proyectos" className="text-sm underline underline-offset-4">
            ← {PROJECT_TEXTS.proyectos.titulo}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {children}
      </main>
    </>
  );
}

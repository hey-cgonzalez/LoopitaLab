"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROJECT_TEXTS, STATUS_LABEL, progressSummaryText } from "@/lib/projects/texts.ts";
import type { ProjectListItem } from "@/lib/projects/types.ts";
import { deleteProject, setProjectStatus } from "./actions";

export { STATUS_LABEL };
export type ProjectRow = ProjectListItem;

const T = PROJECT_TEXTS.proyectos;
const dateFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" });

/**
 * Lista de proyectos en tarjetas. Con diseño: avance ("Vuelta 12 de 60" o "Fila…", "Gráfico terminado"), versión
 * fijada, aviso si el diseño cambió después, enlace a tejer y a la ficha. Sin diseño: el flujo de estado de siempre.
 * Borrar pide confirmación: es irreversible y se pierde el avance.
 */
export function ProjectList({ projects: initial }: { projects: ProjectListItem[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onDelete(p: ProjectListItem) {
    setBusy(p.id);
    setMessage(null);
    try {
      const r = await deleteProject(p.id);
      if (r.ok || r.code === "NOT_FOUND") {
        setProjects((list) => list.filter((x) => x.id !== p.id));
        setConfirming(null);
        setMessage({ tone: "ok", text: T.borrado(p.title) });
        router.refresh();
      } else setMessage({ tone: "error", text: r.error });
    } catch {
      setMessage({ tone: "error", text: PROJECT_TEXTS.tejer.sinRed });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <p role={message?.tone === "error" ? "alert" : "status"} className={`empty:hidden font-bold ${message?.tone === "error" ? "text-error" : "text-exito"}`}>
        {message?.text}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const d = p.design;
          const started = d ? d.pointer.rowsDone > 0 || d.pointer.stitchesDone > 0 : false;
          return (
            <li key={p.id} className="flex flex-col gap-3 rounded-2xl border-2 border-linea bg-superficie p-4" data-testid="project-card">
              <div className="min-w-0">
                <p className="truncate font-display text-xl font-semibold">
                  <Link href={`/proyectos/${p.id}`} className="underline-offset-4 hover:underline">
                    {p.title}
                  </Link>
                </p>
                <p className="text-sm text-tinta-suave">
                  {STATUS_LABEL[p.status]} · actualizado el {dateFmt.format(new Date(p.updatedAt))}
                </p>
              </div>
              {d ? (
                <div className="grid gap-1">
                  <p className="text-lg font-bold" data-testid="project-progress">
                    {d.totalRows > 0 ? progressSummaryText(d.workedIn, d.totalRows, d.pointer) : T.noSavable}
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {d.patternTitle ?? T.diseno} · {T.versionCorta(d.version)}
                  </p>
                  {d.mayHaveNewer ? (
                    <p className="text-sm font-bold" data-testid="project-newer">
                      {T.hayMasNuevaCorta}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-tinta-suave">{T.sinDiseno}</p>
              )}
              {confirming === p.id ? (
                <div role="group" aria-label={`Confirmar borrado de ${p.title}`} className="mt-auto grid gap-2">
                  <p className="font-bold">{T.borrarPregunta(p.title)}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onDelete(p)} disabled={busy === p.id} className="rounded-full bg-error px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60">
                      {T.borrarConfirmar}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded-full border-2 border-marino px-4 py-2 font-bold hover:bg-marino hover:text-white">
                      {PROJECT_TEXTS.tejer.cancelar}
                    </button>
                  </div>
                </div>
              ) : d ? (
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  <Link href={`/proyectos/${p.id}/tejer`} aria-label={`${started ? T.seguirTejiendo : T.empezarATejer}: ${p.title}`} className="rounded-full bg-marino px-4 py-2 font-bold text-white hover:bg-indigo">
                    {started ? T.seguirTejiendo : T.empezarATejer}
                  </Link>
                  <button type="button" onClick={() => setConfirming(p.id)} aria-label={`Borrar ${p.title}`} className="rounded-full border-2 border-error px-4 py-2 font-bold text-error hover:bg-error hover:text-white">
                    Borrar
                  </button>
                </div>
              ) : (
                <div className="mt-auto grid gap-2">
                  <form action={setProjectStatus} className="flex items-center gap-2">
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
                      {T.guardarEstado}
                    </button>
                  </form>
                  <button type="button" onClick={() => setConfirming(p.id)} aria-label={`Borrar ${p.title}`} className="justify-self-start rounded-full border-2 border-error px-4 py-2 font-bold text-error hover:bg-error hover:text-white">
                    Borrar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

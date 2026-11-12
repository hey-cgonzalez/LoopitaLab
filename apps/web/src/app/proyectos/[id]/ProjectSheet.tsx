"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChartPointer } from "@loopitalab/follow";
import { deleteProject, getRepinPreview, repinProject } from "@/app/proyectos/actions";
import { PROJECT_TEXTS, positionText, progressSummaryText, relativeTimeText, rowCountText } from "@/lib/projects/texts.ts";
import type { RepinPreview, WorkedIn } from "@/lib/projects/types.ts";
import { STUDIO_TEXTS, workedInName } from "@/lib/studio-texts.ts";

const T = PROJECT_TEXTS;

export interface ProjectSheetProps {
  project: { id: string; title: string; status: string; patternId: string; version: number };
  designTitle: string;
  workedIn: WorkedIn;
  totalRows: number;
  pointer: ChartPointer;
  progressUpdatedAt: string | null;
  valid: boolean;
  newerVersionAvailable: boolean;
}

type Repin = { kind: "idle" } | { kind: "loading" } | { kind: "preview"; preview: RepinPreview } | { kind: "working"; preview: RepinPreview } | { kind: "done"; version: number } | { kind: "error"; message: string };

/**
 * Ficha del proyecto (T12): diseño, versión fijada, avance, Tejer, "Pasar a la versión actual" (con `getRepinPreview`
 * antes de confirmar: si la fila cambió, si el puntero se reubicó o se acotó; F3-12) y borrar con confirmación.
 */
export function ProjectSheet(p: ProjectSheetProps) {
  const router = useRouter();
  const [repin, setRepin] = useState<Repin>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const finished = p.totalRows > 0 && p.pointer.rowsDone >= p.totalRows;
  const deleteButton = useRef<HTMLButtonElement>(null);
  const repinTitle = useRef<HTMLHeadingElement>(null);
  const repinWasOpen = useRef(false);

  // Foco (WCAG 2.4.3): al abrir el panel de cambio de versión va a su título; al cerrarlo, de vuelta al botón que lo abrió.
  useEffect(() => {
    if (repin.kind === "loading") {
      repinWasOpen.current = true;
      repinTitle.current?.focus();
    } else if (repin.kind === "idle" && repinWasOpen.current) {
      repinWasOpen.current = false;
      document.querySelector<HTMLElement>('[data-testid="repin-open"]')?.focus();
    }
  }, [repin.kind]);

  async function openRepin() {
    setRepin({ kind: "loading" });
    try {
      const r = await getRepinPreview(p.project.id);
      if (r.ok) {
        const { ok: _ok, ...preview } = r;
        void _ok;
        setRepin({ kind: "preview", preview });
      } else setRepin({ kind: "error", message: r.error });
    } catch {
      setRepin({ kind: "error", message: T.tejer.sinRed });
    }
  }

  async function confirmRepin() {
    if (repin.kind !== "preview") return;
    const preview = repin.preview;
    setRepin({ kind: "working", preview });
    try {
      const r = await repinProject(p.project.id, preview.progressUpdatedAt);
      if (r.ok) {
        setRepin({ kind: "done", version: r.version });
        router.refresh();
        return;
      }
      setRepin({ kind: "error", message: r.code === "CONFLICT" && r.conflictOn === "progress" ? T.repin.conflicto : r.error });
    } catch {
      setRepin({ kind: "error", message: T.tejer.sinRed });
    }
  }

  async function onDelete() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await deleteProject(p.project.id);
      if (r.ok || r.code === "NOT_FOUND") {
        router.push("/proyectos");
        router.refresh();
        return;
      }
      setMessage({ tone: "error", text: r.error });
    } catch {
      setMessage({ tone: "error", text: T.tejer.sinRed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <p role="alert" className="empty:hidden font-bold text-error">
        {message?.tone === "error" ? message.text : null}
      </p>

      <dl className="grid gap-x-6 gap-y-2 rounded-2xl border-2 border-linea bg-superficie p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="font-bold">{T.proyectos.diseno}</dt>
        <dd>
          <Link href={`/disenos/${p.project.patternId}`} className="underline underline-offset-4">
            {p.designTitle}
          </Link>{" "}
          <span className="text-tinta-suave">· {workedInName(p.workedIn).toLowerCase()}</span>
        </dd>
        <dt className="font-bold">{T.proyectos.version}</dt>
        <dd data-testid="project-version">
          {T.proyectos.versionCorta(p.project.version)}
          {p.newerVersionAvailable ? <span className="ml-2 rounded-full border-2 border-mostaza px-2 py-0.5 text-sm font-bold">{T.proyectos.hayMasNuevaCorta}</span> : null}
        </dd>
        <dt className="font-bold">{T.proyectos.avance}</dt>
        <dd data-testid="project-progress">
          {progressSummaryText(p.workedIn, p.totalRows, p.pointer)}
          {p.progressUpdatedAt ? <span className="text-tinta-suave"> · {relativeTimeText(p.progressUpdatedAt)}</span> : null}
        </dd>
      </dl>

      {!p.valid ? (
        <p role="status" className="rounded-xl border-2 border-mostaza px-3 py-2 text-sm" data-testid="project-invalid-version">
          {T.proyectos.versionNoValida}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href={`/proyectos/${p.project.id}/tejer`} className="inline-flex min-h-12 items-center rounded-full bg-marino px-6 py-2.5 font-bold text-white hover:bg-indigo" data-testid="project-knit">
          {finished ? T.tejiendo.titulo : p.pointer.rowsDone === 0 && p.pointer.stitchesDone === 0 ? T.proyectos.empezarATejer : T.proyectos.seguirTejiendo}
        </Link>
        {p.newerVersionAvailable && repin.kind === "idle" ? (
          <button type="button" onClick={openRepin} className="min-h-12 rounded-full border-2 border-marino px-5 py-2 font-bold hover:bg-marino hover:text-white" data-testid="repin-open">
            {T.repin.boton}
          </button>
        ) : null}
        <button ref={deleteButton} type="button" onClick={() => setConfirming(true)} disabled={busy || confirming} className="min-h-12 rounded-full border-2 border-error px-5 py-2 font-bold text-error hover:bg-error hover:text-white disabled:opacity-60" data-testid="project-delete">
          {T.proyectos.borrar}
        </button>
      </div>

      {confirming ? (
        <div role="group" aria-label={T.proyectos.confirmarBorradoDe(p.project.title)} className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-error p-4">
          <p className="min-w-0 flex-1 font-bold">{T.proyectos.borrarPregunta(p.project.title)}</p>
          <button type="button" onClick={onDelete} disabled={busy} className="min-h-12 rounded-full bg-error px-5 font-bold text-white hover:opacity-90 disabled:opacity-60">
            {T.proyectos.borrarConfirmar}
          </button>
          {/* El foco empieza en «Cancelar» (acción irreversible) y vuelve a «Borrar proyecto» al cancelar. */}
          <button
            type="button"
            autoFocus
            onClick={() => {
              setConfirming(false);
              setTimeout(() => deleteButton.current?.focus(), 0);
            }}
            disabled={busy}
            className="min-h-12 rounded-full border-2 border-marino px-5 font-bold hover:bg-marino hover:text-white"
          >
            {T.tejer.cancelar}
          </button>
        </div>
      ) : null}

      {repin.kind !== "idle" ? (
        <section aria-labelledby="repin-title" className="grid gap-3 rounded-2xl border-2 border-marino bg-superficie p-4" data-testid="repin-panel">
          <h2 id="repin-title" ref={repinTitle} tabIndex={-1} className="font-display text-xl font-bold">
            {T.repin.titulo}
          </h2>
          {repin.kind === "loading" ? <p role="status">{T.repin.revisando}</p> : null}
          {repin.kind === "error" ? (
            <p role="alert" className="font-bold text-error">
              {repin.message}
            </p>
          ) : null}
          {repin.kind === "done" ? (
            <p role="status" className="font-bold text-exito" data-testid="repin-done">
              {T.repin.listo(repin.version)}
            </p>
          ) : null}
          {repin.kind === "preview" || repin.kind === "working" ? <RepinDetails preview={repin.preview} /> : null}
          <div className="flex flex-wrap gap-3">
            {repin.kind === "preview" || repin.kind === "working" ? (
              repin.preview.sameDocument ? null : (
                <button type="button" onClick={confirmRepin} disabled={repin.kind === "working"} className="min-h-12 rounded-full bg-marino px-5 font-bold text-white hover:bg-indigo disabled:opacity-60" data-testid="repin-confirm">
                  {T.repin.confirmar}
                </button>
              )
            ) : null}
            <button type="button" onClick={() => setRepin({ kind: "idle" })} disabled={repin.kind === "working"} className="min-h-12 rounded-full border-2 border-marino px-5 font-bold hover:bg-marino hover:text-white disabled:opacity-60">
              {repin.kind === "done" ? T.repin.cerrar : T.tejer.cancelar}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Qué cambia al pasar a la versión actual: lo calculó el servidor con `remapPointer` (ADR 0007 §5). */
export function RepinDetails({ preview }: { preview: RepinPreview }) {
  const R = T.repin;
  if (preview.sameDocument) return <p data-testid="repin-same">{R.igual}</p>;
  const from = preview.from;
  const to = preview.to;
  const items: string[] = [];
  items.push(R.versiones(from.version, rowCountText(from.workedIn, from.totalRows), rowCountText(to.workedIn, to.totalRows)));
  items.push(R.avanceAntesDespues(positionText(from.workedIn, from.totalRows, preview.currentPointer), positionText(to.workedIn, to.totalRows, preview.pointer)));
  if (preview.clamped) items.push(R.acotado);
  else if (preview.rowChanged) items.push(R.filaCambio(from.workedIn));
  else items.push(R.conservaFila(from.workedIn));
  if (preview.currentPointer.stitchesDone > 0 && preview.pointer.stitchesDone === 0) items.push(R.casillasACero(from.workedIn));
  return (
    <ul className="grid list-disc gap-1 pl-5" data-testid="repin-details">
      {items.map((t) => (
        <li key={t} className={t === R.filaCambio(from.workedIn) || t === R.acotado ? "font-bold" : ""}>
          {t}
        </li>
      ))}
      <li className="text-sm text-tinta-suave">{STUDIO_TEXTS.prototipo.ayudaMuestra}</li>
    </ul>
  );
}

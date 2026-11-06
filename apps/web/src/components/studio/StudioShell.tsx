"use client";

import type { ChartPattern, Issue } from "@loopitalab/pattern-core";
import Link from "next/link";
import { useId, useState } from "react";
import { savePatternVersion } from "@/app/disenos/actions";
import { SaveIndicator } from "./SaveIndicator";
import { useStudioSession } from "./useStudioSession";

interface Props {
  document: ChartPattern;
  updatedAt: string;
  /** Errores de tejido con que se abrió el diseño (borrador). T9 los muestra en el panel de validación. */
  draftIssues: Issue[];
}

const timeFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });

/**
 * Esqueleto del estudio de colorwork (T8). Monta el almacén, el autoguardado y el estado del guardado.
 * Las zonas con `data-zone` son los puntos de montaje que T9 llena (herramientas, lanas, editor, vista previa, panel).
 */
export function StudioShell({ document: initial, updatedAt, draftIssues }: Props) {
  const session = useStudioSession({ document: initial, updatedAt, openedAsDraft: draftIssues.length > 0 });
  const { store, autosave, state, status, recovery } = session;
  const doc = state.doc;

  const titleId = useId();
  const [titleText, setTitleText] = useState(doc.title);
  const [titleProblems, setTitleProblems] = useState<string[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionMsg, setVersionMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);
  const [overwriting, setOverwriting] = useState(false);

  function onTitle(raw: string) {
    setTitleText(raw);
    // El texto vive en el campo hasta que es válido: un título inválido bloquearía el guardado (ADR 0006, E10).
    const r = store.setTitle(raw);
    setTitleProblems(r.ok ? [] : r.problems);
  }

  async function onSaveVersion() {
    setVersionBusy(true);
    setVersionMsg(null);
    try {
      const upToDate = await autosave.saveNow();
      if (!upToDate) {
        setVersionMsg({ tone: "error", text: "Antes de guardar una versión hay que guardar los cambios, y todavía no se pudo. Revisa el estado del guardado." });
        return;
      }
      const r = await savePatternVersion(doc.id, versionLabel);
      setVersionMsg(r.ok ? { tone: "ok", text: `Versión ${r.version} guardada.` } : { tone: "error", text: r.error });
      if (r.ok) setVersionLabel("");
    } catch {
      setVersionMsg({ tone: "error", text: "No pudimos guardar la versión. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setVersionBusy(false);
    }
  }

  function reloadFromServer() {
    autosave.stop();
    autosave.discardBackup();
    window.location.reload();
  }

  async function overwrite() {
    setOverwriting(true);
    try {
      await autosave.overwrite();
    } finally {
      setOverwriting(false);
    }
  }

  const isAi = doc.origin.kind !== "manual";

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <div className="border-b-2 border-linea bg-superficie">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/disenos" className="py-2 text-sm underline underline-offset-4">
            ← Mis diseños
          </Link>
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={titleId} className="sr-only">
              Nombre del diseño
            </label>
            <input
              id={titleId}
              value={titleText}
              onChange={(e) => onTitle(e.target.value)}
              aria-invalid={titleProblems.length > 0 ? true : undefined}
              aria-describedby={titleProblems.length > 0 ? `${titleId}-error` : undefined}
              className="w-full rounded-xl border-2 border-linea bg-superficie px-3 py-2 font-display text-xl font-bold aria-invalid:border-error"
            />
            {titleProblems.length > 0 ? (
              <p id={`${titleId}-error`} className="mt-1 text-sm font-bold text-error">
                {titleProblems[0]} No se guarda hasta que lo corrijas.
              </p>
            ) : null}
          </div>
          {isAi ? (
            <span className="rounded-full border-2 border-marino px-3 py-1 text-sm font-bold" data-testid="ai-label">
              Generado con IA
            </span>
          ) : null}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => store.undo()} disabled={!state.canUndo} className="rounded-full border-2 border-marino px-4 py-2 font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40">
              Deshacer
            </button>
            <button type="button" onClick={() => store.redo()} disabled={!state.canRedo} className="rounded-full border-2 border-marino px-4 py-2 font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40">
              Rehacer
            </button>
          </div>
          <SaveIndicator status={status} />
        </div>
      </div>

      {recovery ? (
        <section aria-label="Cambios sin guardar de una sesión anterior" className="border-b-2 border-mostaza bg-superficie px-4 py-3">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1">
              Encontramos cambios sin guardar de {timeFmt.format(new Date(recovery.savedAt))}, de la última vez que abriste este diseño en este equipo.
              {recovery.serverIsNewer ? " Ojo: el diseño se guardó después desde otro lugar; si los recuperas, reemplazan esa versión." : ""}
            </p>
            <button type="button" onClick={session.acceptRecovery} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo">
              Recuperar cambios
            </button>
            <button type="button" onClick={session.dismissRecovery} className="rounded-full border-2 border-marino px-5 py-2 font-bold hover:bg-marino hover:text-white">
              Descartar
            </button>
          </div>
        </section>
      ) : null}

      {status.kind === "conflict" ? (
        <section role="alert" aria-label="Conflicto al guardar" className="border-b-2 border-error bg-superficie px-4 py-3">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1">
              Este diseño se guardó desde otra pestaña o dispositivo mientras lo editabas. No guardamos nada encima: elige qué versión conservar.
            </p>
            <button type="button" onClick={reloadFromServer} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo">
              Recargar la versión guardada
            </button>
            <button type="button" onClick={overwrite} disabled={overwriting} className="rounded-full border-2 border-error px-5 py-2 font-bold text-error hover:bg-error hover:text-white disabled:opacity-60">
              {overwriting ? "Sobrescribiendo…" : "Sobrescribir con mi versión"}
            </button>
          </div>
          <p className="mx-auto mt-1 max-w-[1600px] text-sm text-tinta-suave">Recargar descarta lo que cambiaste aquí. Sobrescribir reemplaza lo guardado desde el otro lugar.</p>
        </section>
      ) : null}

      {status.kind === "blocked" ? (
        <section role="alert" aria-label="No se puede guardar" className="border-b-2 border-error bg-superficie px-4 py-3">
          <p className="mx-auto max-w-[1600px] font-bold text-error">No se puede guardar el diseño con estos errores:</p>
          <ul className="mx-auto max-w-[1600px] list-disc pl-6">
            {status.issues.slice(0, 5).map((i) => (
              <li key={`${i.code}-${i.path}`}>{i.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {draftIssues.length > 0 && status.kind === "saved" && status.draft ? (
        <p className="border-b-2 border-linea bg-superficie px-4 py-2 text-sm">
          <span className="mx-auto block max-w-[1600px]">Borrador con errores de tejido: {draftIssues[0]?.message}</span>
        </p>
      ) : null}

      {/* Zonas que llena T9. */}
      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 p-4 lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)]" data-testid="studio-skeleton">
        <aside aria-label="Panel lateral" data-zone="sidebar" className="rounded-2xl border-2 border-dashed border-linea p-4 lg:row-span-3">
          <h2 className="font-display text-lg font-bold">Panel lateral</h2>
          <p className="text-sm text-tinta-suave">Diseño, cuadrícula, muestra y validación llegan con el editor.</p>
          <dl className="mt-3 text-sm">
            <dt className="font-bold">Motivo</dt>
            <dd>
              {doc.chart.width} × {doc.chart.height}, repetido {doc.chart.repeat.x} × {doc.chart.repeat.y}
            </dd>
            <dt className="mt-2 font-bold">Muestra</dt>
            <dd>{doc.gauge ? `${doc.gauge.stitchesPer10cm} puntos y ${doc.gauge.rowsPer10cm} filas en 10 cm` : "Sin muestra: las medidas son un supuesto."}</dd>
          </dl>
          <div className="mt-4 grid gap-2 border-t-2 border-linea pt-4">
            <label htmlFor={`${titleId}-version`} className="font-bold">
              Nombre de la versión (opcional)
            </label>
            <input
              id={`${titleId}-version`}
              value={versionLabel}
              maxLength={80}
              onChange={(e) => setVersionLabel(e.target.value)}
              className="rounded-xl border-2 border-linea bg-superficie px-3 py-2"
            />
            <button type="button" onClick={onSaveVersion} disabled={versionBusy} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo disabled:opacity-60">
              {versionBusy ? "Guardando versión…" : "Guardar versión"}
            </button>
            <p role="status" className={versionMsg?.tone === "error" ? "text-sm font-bold text-error" : "text-sm text-exito"}>
              {versionMsg?.text}
            </p>
            <p className="text-sm text-tinta-suave">Una versión es una copia del diseño tal como está guardado, a la que puedes volver. El autoguardado no crea versiones.</p>
          </div>
        </aside>
        <section aria-label="Herramientas" data-zone="toolbar" className="rounded-2xl border-2 border-dashed border-linea p-4 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Herramientas</h2>
          <p className="text-sm text-tinta-suave">Pincel, relleno, selección y zoom.</p>
        </section>
        <section aria-label="Lanas" data-zone="yarns" className="rounded-2xl border-2 border-dashed border-linea p-4 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Lanas</h2>
          <ul className="mt-2 flex flex-wrap gap-3">
            {doc.yarns.map((y) => (
              <li key={y.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="inline-block size-5 rounded border-2 border-marino" style={{ backgroundColor: y.color.hex }} />
                Lana {y.id}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="Editor del gráfico" data-zone="editor" className="min-h-64 rounded-2xl border-2 border-dashed border-linea p-4">
          <h2 className="font-display text-lg font-bold">Gráfico</h2>
          <p className="text-sm text-tinta-suave">Aquí va el editor de celdas.</p>
        </section>
        <section aria-label="Vista previa" data-zone="preview" className="min-h-64 rounded-2xl border-2 border-dashed border-linea p-4">
          <h2 className="font-display text-lg font-bold">Vista previa</h2>
          <p className="text-sm text-tinta-suave">Aquí va la vista previa de los puntos.</p>
        </section>
      </div>

      <p data-zone="prototype-notice" className="sticky bottom-0 border-t-2 border-mostaza bg-superficie px-4 py-2 text-sm">
        <span className="mx-auto block max-w-[1600px]">
          <strong>Prototipo digital.</strong> El dibujo es una aproximación: teje una muestra para comprobar tu tensión y las proporciones.
        </span>
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Issue } from "@loopitalab/pattern-core";
import { getKnitPreview, startProjectFromDesign } from "@/app/proyectos/actions";
import { PROJECT_TEXTS } from "@/lib/projects/texts.ts";
import type { KnitPreview } from "@/lib/projects/types.ts";
import { KnitPreviewView } from "./KnitPreviewView";

const T = PROJECT_TEXTS.tejer;

type Phase =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "preview"; preview: KnitPreview; notice: string | null }
  | { kind: "not-knittable"; issues: Issue[]; message: string }
  | { kind: "error"; message: string }
  | { kind: "starting"; preview: KnitPreview }
  | { kind: "done" };

interface Props {
  patternId: string;
  designTitle: string;
  /** Se ejecuta antes de leer el diseño (el estudio vacía el autoguardado). `false` cancela con el mensaje dado. */
  beforeOpen?: () => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Enlace al estudio en NOT_KNITTABLE (fuera del estudio). */
  studioHref?: string;
  disabled?: boolean;
  /** Botón compacto (lista de diseños). */
  compact?: boolean;
  className?: string;
}

/**
 * "Tejer este diseño" (T12): abre la pantalla previa (F3-39) con lo que devuelve `getKnitPreview` y, al confirmar,
 * llama `startProjectFromDesign` y lleva a `/proyectos/<id>/tejer`. Si el diseño cambió mientras la pantalla estaba
 * abierta (`CONFLICT` de diseño), se recalcula y se pide confirmar de nuevo. `NOT_KNITTABLE` (F3-38) explica qué lo
 * impide. El diálogo es modal (`<dialog>` nativo): Esc lo cierra y el foco vuelve al botón.
 */
export function KnitStartButton({ patternId, designTitle, beforeOpen, studioHref, disabled = false, compact = false, className }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const [title, setTitle] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const uid = useId();

  const open = phase.kind !== "closed";
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function load(notice: string | null = null) {
    try {
      const r = await getKnitPreview(patternId);
      if (r.ok) {
        const { ok: _ok, ...preview } = r;
        void _ok;
        setPhase({ kind: "preview", preview, notice });
      } else if (r.code === "NOT_KNITTABLE" || r.code === "NOT_SAVABLE") {
        setPhase({ kind: "not-knittable", issues: r.issues ?? [], message: r.error });
      } else {
        setPhase({ kind: "error", message: r.error });
      }
    } catch {
      setPhase({ kind: "error", message: T.sinRed });
    }
  }

  async function onOpen() {
    setPhase({ kind: "loading" });
    setTitle("");
    if (beforeOpen) {
      const r = await beforeOpen();
      if (!r.ok) {
        setPhase({ kind: "error", message: r.message });
        return;
      }
    }
    await load();
  }

  function close() {
    setPhase({ kind: "closed" });
    buttonRef.current?.focus();
  }

  async function confirm() {
    if (phase.kind !== "preview") return;
    const preview = phase.preview;
    setPhase({ kind: "starting", preview });
    try {
      // Lo que se fija debe ser lo que se mostró (ADR 0009, T1-7): `startProjectFromDesign` relee el diseño, así que
      // un cambio hecho en otra pestaña con esta pantalla abierta no daría CONFLICT. Se compara aquí el `updated_at`
      // del diseño con el de la pantalla; si cambió, se recalcula y se pide confirmar de nuevo. La carrera que queda
      // entre esta lectura y la creación la cierra el servidor (`start_chart_project` con `updated_at` exacto).
      const fresh = await getKnitPreview(patternId);
      if (!fresh.ok) {
        if (fresh.code === "NOT_KNITTABLE" || fresh.code === "NOT_SAVABLE") setPhase({ kind: "not-knittable", issues: fresh.issues ?? [], message: fresh.error });
        else setPhase({ kind: "error", message: fresh.error });
        return;
      }
      if (fresh.patternUpdatedAt !== preview.patternUpdatedAt) {
        const { ok: _ok, ...next } = fresh;
        void _ok;
        setPhase({ kind: "preview", preview: next, notice: T.cambioMientras });
        return;
      }
      const r = await startProjectFromDesign(patternId, title.trim() === "" ? undefined : title);
      if (r.ok) {
        setPhase({ kind: "done" });
        router.push(`/proyectos/${r.projectId}/tejer`);
        return;
      }
      if (r.code === "CONFLICT") {
        // El diseño cambió entre la pantalla previa y la confirmación: se recalcula todo (ADR 0009, T1-7).
        setPhase({ kind: "loading" });
        await load(T.cambioMientras);
        return;
      }
      if (r.code === "NOT_KNITTABLE" || r.code === "NOT_SAVABLE") {
        setPhase({ kind: "not-knittable", issues: r.issues ?? [], message: r.error });
        return;
      }
      setPhase({ kind: "error", message: r.error });
    } catch {
      setPhase({ kind: "error", message: T.sinRedCrear });
    }
  }

  const busy = phase.kind === "loading" || phase.kind === "starting" || phase.kind === "done";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        disabled={disabled || busy}
        aria-label={compact ? `${T.botonCorto} ${designTitle}` : undefined}
        className={className ?? (compact ? "rounded-full bg-marino px-4 py-2 font-bold text-white hover:bg-indigo disabled:opacity-60" : "rounded-full bg-marino px-5 py-2.5 font-bold text-white hover:bg-indigo disabled:opacity-60")}
        data-testid="knit-start"
      >
        {phase.kind === "loading" ? T.abriendo : compact ? T.botonCorto : T.boton}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-title`}
        onClose={() => {
          if (phase.kind !== "done") close();
        }}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        className="m-auto w-[min(100vw-1rem,42rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl border-2 border-linea bg-superficie p-0 text-marino backdrop:bg-marino/50"
      >
        {open ? (
          <div className="grid gap-4 p-5" data-testid="knit-dialog">
            <h2 id={`${uid}-title`} className="font-display text-2xl font-bold">
              {phase.kind === "not-knittable" ? T.noSePuede : T.tituloDialogo}
            </h2>
            <p className="text-tinta-suave">{designTitle}</p>

            {phase.kind === "loading" ? <p role="status">{T.abriendo}</p> : null}

            {phase.kind === "error" ? (
              <p role="alert" className="font-bold text-error">
                {phase.message}
              </p>
            ) : null}

            {phase.kind === "not-knittable" ? (
              <div className="grid gap-2" data-testid="knit-not-knittable">
                <p role="alert" className="font-bold text-error">
                  {phase.message}
                </p>
                <p>{T.noSePuedeAyuda}</p>
                <ul className="grid list-disc gap-1 pl-5">
                  {phase.issues.slice(0, 8).map((i, k) => (
                    <li key={`${i.code}-${i.path}-${k}`}>{i.message}</li>
                  ))}
                </ul>
                {studioHref ? (
                  <Link href={studioHref} className="justify-self-start rounded-full border-2 border-marino px-5 py-2 font-bold hover:bg-marino hover:text-white">
                    {T.irAlEstudio}
                  </Link>
                ) : null}
              </div>
            ) : null}

            {phase.kind === "preview" || phase.kind === "starting" ? (
              <>
                {phase.kind === "preview" && phase.notice ? (
                  <p role="alert" className="rounded-xl border-2 border-mostaza px-3 py-2 font-bold" data-testid="knit-recalculated">
                    {phase.notice}
                  </p>
                ) : null}
                <KnitPreviewView preview={phase.preview} />
                <div className="grid gap-1">
                  <label htmlFor={`${uid}-name`} className="font-bold">
                    {T.tituloProyecto}
                  </label>
                  <input id={`${uid}-name`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={designTitle} className="rounded-xl border-2 border-borde bg-superficie px-3 py-2" />
                  <p className="text-sm text-tinta-suave">{T.tituloProyectoAyuda}</p>
                </div>
              </>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={close} disabled={busy} className="min-h-12 rounded-full border-2 border-marino px-5 py-2 font-bold hover:bg-marino hover:text-white disabled:opacity-60">
                {T.cancelar}
              </button>
              {phase.kind === "preview" || phase.kind === "starting" ? (
                <button type="button" onClick={confirm} disabled={busy} className="min-h-12 rounded-full bg-marino px-6 py-2 font-bold text-white hover:bg-indigo disabled:opacity-60" data-testid="knit-confirm">
                  {phase.kind === "starting" ? T.empezando : T.confirmar}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

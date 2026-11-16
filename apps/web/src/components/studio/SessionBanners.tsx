"use client";

import type { Pattern } from "@loopitalab/pattern-core";
import { useState, type ReactNode } from "react";
import { APP_TIME_ZONE } from "@/lib/time-zone";
import type { Autosave, SaveStatus } from "@/lib/studio/autosave.ts";
import type { Recovery } from "@/lib/studio/backup-recovery.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";

const T = STUDIO_TEXTS;
const timeFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: APP_TIME_ZONE });

/**
 * Avisos del guardado comunes a los dos estudios (ADR 0006, E10): recuperar cambios de una sesión anterior, conflicto
 * con otra pestaña o dispositivo (recargar o sobrescribir; nunca en silencio) y errores que impiden guardar.
 */
export function SessionBanners<P extends Pattern>({
  status,
  autosave,
  recovery,
  edited,
  onAccept,
  onDismiss,
  recoveryExtra,
}: {
  status: SaveStatus;
  autosave: Autosave<P>;
  recovery: Recovery<P> | null;
  /** Ya se editó en esta sesión (recuperar reemplaza lo editado). */
  edited: boolean;
  onAccept(): void;
  onDismiss(): void;
  /** Texto extra del aviso de recuperación (por ejemplo, las líneas sin leer del amigurumi). */
  recoveryExtra?: ReactNode;
}) {
  const [overwriting, setOverwriting] = useState(false);

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

  return (
    <>
      {recovery ? (
        <section aria-label="Cambios sin guardar de una sesión anterior" className="max-h-[40%] shrink-0 overflow-y-auto border-b-2 border-mostaza bg-superficie px-4 py-2" data-testid="recovery-banner">
          <div className="mx-auto flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1">
              Encontramos cambios sin guardar de {timeFmt.format(new Date(recovery.savedAt))}, de la última vez que abriste este diseño en este equipo.
              {recovery.serverIsNewer ? " Ojo: el diseño se guardó después desde otro lugar; si los recuperas, reemplazan esa versión." : ""}
              {edited ? ` ${T.respaldo.recuperacionEditando}` : ""}
              {recoveryExtra ? <> {recoveryExtra}</> : null}
            </p>
            <button type="button" onClick={onAccept} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo">
              Recuperar cambios
            </button>
            <button type="button" onClick={onDismiss} className="rounded-full border-2 border-marino px-5 py-2 font-bold hover:bg-marino hover:text-white">
              Descartar
            </button>
          </div>
        </section>
      ) : null}

      {status.kind === "conflict" ? (
        <section role="alert" aria-label="Conflicto al guardar" className="max-h-[40%] shrink-0 overflow-y-auto border-b-2 border-error bg-superficie px-4 py-2">
          <div className="mx-auto flex flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1">{T.guardado.conflicto}</p>
            <button type="button" onClick={reloadFromServer} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo">
              Recargar la versión guardada
            </button>
            <button type="button" onClick={overwrite} disabled={overwriting} className="rounded-full border-2 border-error px-5 py-2 font-bold text-error hover:bg-error hover:text-white disabled:opacity-60">
              {overwriting ? "Sobrescribiendo…" : "Sobrescribir con mi versión"}
            </button>
          </div>
          <p className="mx-auto mt-1 text-sm text-tinta-suave">Recargar descarta lo que cambiaste aquí. Sobrescribir reemplaza lo guardado desde el otro lugar.</p>
        </section>
      ) : null}

      {status.kind === "blocked" ? (
        <section role="alert" aria-label="No se puede guardar" className="max-h-[40%] shrink-0 overflow-y-auto border-b-2 border-error bg-superficie px-4 py-2">
          <p className="mx-auto font-bold text-error">No se puede guardar el diseño con estos errores:</p>
          <ul className="mx-auto list-disc pl-6">
            {status.issues.slice(0, 5).map((i) => (
              <li key={`${i.code}-${i.path}`}>{i.message}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

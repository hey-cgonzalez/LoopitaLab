"use client";

import { useEffect, useRef, useState } from "react";
import type { SaveStatus } from "@/lib/studio/autosave.ts";
import { describeStatus, saveAnnouncement, type SpokenSave } from "@/lib/studio/save-status.ts";

const TONE: Record<string, string> = {
  ok: "text-exito",
  info: "text-tinta-suave",
  warn: "text-marino",
  error: "text-error",
};

const MARK: Record<string, string> = { ok: "✓", info: "…", warn: "!", error: "×" };

/**
 * Estado del guardado. El texto visible no es una región viva: cambia en cada pausa de edición ("Guardando…",
 * "Guardado") y un lector de pantalla lo repetiría todo el rato. Lo que se anuncia sale de `saveAnnouncement`
 * (T11, CA-A3) en una región aparte: el guardado cada tanto, y siempre el borrador, el trabajo sin conexión y los fallos.
 * El conflicto y el bloqueo tienen su propia alerta en el estudio.
 */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const [now, setNow] = useState(() => Date.now());
  const [spoken, setSpoken] = useState("");
  const last = useRef<SpokenSave | null>(null);

  useEffect(() => {
    if (status.kind !== "offline") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    const a = saveAnnouncement(status, last.current, Date.now());
    if (!a) return;
    last.current = a.spoken;
    // El mismo texto otra vez ("Guardado" un minuto después) no cambiaría la región viva y no se leería:
    // un espacio duro alternado la hace cambiar sin cambiar lo que se oye.
    setSpoken((prev) => (prev === a.text ? `${a.text} ` : a.text));
  }, [status]);

  const view = describeStatus(status, now);
  return (
    <div data-save-status={status.kind} className="min-w-0">
      <p className={`font-bold ${TONE[view.tone]}`}>
        <span aria-hidden="true" className="mr-1.5 inline-block w-4 text-center">
          {MARK[view.tone]}
        </span>
        {view.label}
      </p>
      {view.detail ? <p className="text-sm text-tinta-suave">{view.detail}</p> : null}
      <p role="status" aria-live="polite" className="sr-only" data-testid="save-announcement">
        {spoken}
      </p>
    </div>
  );
}

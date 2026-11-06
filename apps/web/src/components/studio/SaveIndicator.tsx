"use client";

import { useEffect, useState } from "react";
import type { SaveStatus } from "@/lib/studio/autosave.ts";
import { describeStatus } from "@/lib/studio/save-status.ts";

const TONE: Record<string, string> = {
  ok: "text-exito",
  info: "text-tinta-suave",
  warn: "text-marino",
  error: "text-error",
};

const MARK: Record<string, string> = { ok: "✓", info: "…", warn: "!", error: "×" };

/** Estado del guardado. Solo la etiqueta se anuncia (aria-live polite); el detalle trae una cuenta regresiva y no debe repetirse cada segundo. */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (status.kind !== "offline") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status]);

  const view = describeStatus(status, now);
  return (
    <div data-save-status={status.kind} className="min-w-0">
      <p role="status" aria-live="polite" className={`font-bold ${TONE[view.tone]}`}>
        <span aria-hidden="true" className="mr-1.5 inline-block w-4 text-center">
          {MARK[view.tone]}
        </span>
        {view.label}
      </p>
      {view.detail ? <p className="text-sm text-tinta-suave">{view.detail}</p> : null}
    </div>
  );
}

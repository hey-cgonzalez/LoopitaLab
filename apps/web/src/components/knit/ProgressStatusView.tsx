import type { QueueState } from "@/lib/projects/progress-queue.ts";
import { PROJECT_TEXTS } from "@/lib/projects/texts.ts";

const T = PROJECT_TEXTS.avance;

export interface StatusView {
  label: string;
  tone: "ok" | "info" | "warn" | "error";
  detail?: string;
}

/** Texto del estado del avance (ADR 0009 §4: el estado se ve siempre). */
export function describeQueueState(s: QueueState, now: number = Date.now()): StatusView {
  switch (s.kind) {
    case "saved":
      return { label: T.guardado, tone: "ok" };
    case "pending":
      return { label: T.pendiente, tone: "info" };
    case "saving":
      return { label: T.guardando, tone: "info" };
    case "offline": {
      const seconds = Math.max(0, Math.ceil((s.retryAt - now) / 1000));
      return { label: s.reason === "network" ? T.sinConexion : T.reintentando, tone: "warn", detail: `Reintentando en ${seconds} s.` };
    }
    case "conflict":
      return { label: T.conflicto, tone: "error" };
    case "version-changed":
      return { label: PROJECT_TEXTS.tejiendo.versionCambio, tone: "error" };
    case "failed":
      return { label: T.fallo, tone: "error", detail: s.message };
  }
}

const TONE: Record<StatusView["tone"], string> = { ok: "text-exito", info: "text-tinta-suave", warn: "text-marino", error: "text-error" };
const MARK: Record<StatusView["tone"], string> = { ok: "✓", info: "…", warn: "!", error: "×" };

/** Indicador visible del avance. No es región viva (cambia en cada toque); lo importante se anuncia aparte. */
export function ProgressStatusView({ state, now }: { state: QueueState; now?: number }) {
  const v = describeQueueState(state, now);
  return (
    <div data-progress-status={state.kind} className="min-w-0 text-sm">
      <p className={`font-bold ${TONE[v.tone]}`}>
        <span aria-hidden="true" className="mr-1 inline-block w-3 text-center">
          {MARK[v.tone]}
        </span>
        {v.label}
      </p>
      {v.detail ? <p className="text-tinta-suave">{v.detail}</p> : null}
    </div>
  );
}

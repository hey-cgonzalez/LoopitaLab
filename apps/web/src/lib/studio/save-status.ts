import { STUDIO_TEXTS } from "../studio-texts.ts";
import type { SaveStatus } from "./autosave.ts";

/** Texto del indicador de guardado (propio del estudio; el resto de textos del estudio vive en studio-texts.ts). */
export interface StatusView {
  /** Texto corto, siempre visible. */
  label: string;
  tone: "ok" | "info" | "warn" | "error";
  /** Explicación más larga, si hace falta. */
  detail?: string;
}

export function describeStatus(s: SaveStatus, now: number = Date.now()): StatusView {
  switch (s.kind) {
    case "saved":
      return s.draft
        ? { label: "Guardado como borrador", tone: "warn", detail: STUDIO_TEXTS.guardado.borrador }
        : { label: STUDIO_TEXTS.guardado.guardado, tone: "ok" };
    case "pending":
      return { label: "Cambios sin guardar", tone: "info", detail: "Se guardan solos en unos segundos." };
    case "saving":
      return { label: STUDIO_TEXTS.guardado.guardando, tone: "info" };
    case "offline": {
      const seconds = Math.max(0, Math.ceil((s.retryAt - now) / 1000));
      return {
        label: s.reason === "network" ? STUDIO_TEXTS.guardado.sinConexionEtiqueta : "No se pudo guardar",
        tone: "warn",
        detail: `Tus cambios están a salvo en este equipo. Reintentando en ${seconds} s.`,
      };
    }
    case "conflict":
      return {
        label: "Conflicto al guardar",
        tone: "error",
        detail: STUDIO_TEXTS.guardado.conflicto,
      };
    case "blocked": {
      const first = s.issues[0]?.message;
      return {
        label: "No se puede guardar",
        tone: "error",
        detail: first ? `${first} Tus cambios siguen en este equipo.` : "El diseño tiene errores que impiden guardarlo.",
      };
    }
    case "failed":
      return { label: "No se pudo guardar", tone: "error", detail: s.message };
  }
}

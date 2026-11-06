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
        ? { label: "Guardado como borrador", tone: "warn", detail: "El diseño tiene errores que impiden tejerlo, pero tus cambios están guardados." }
        : { label: "Guardado", tone: "ok" };
    case "pending":
      return { label: "Cambios sin guardar", tone: "info", detail: "Se guardan solos en unos segundos." };
    case "saving":
      return { label: "Guardando…", tone: "info" };
    case "offline": {
      const seconds = Math.max(0, Math.ceil((s.retryAt - now) / 1000));
      return {
        label: s.reason === "network" ? "Sin conexión" : "No se pudo guardar",
        tone: "warn",
        detail: `Tus cambios están a salvo en este equipo. Reintentando en ${seconds} s.`,
      };
    }
    case "conflict":
      return {
        label: "Conflicto al guardar",
        tone: "error",
        detail: "Este diseño se guardó desde otra pestaña o dispositivo. Elige qué versión conservar.",
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

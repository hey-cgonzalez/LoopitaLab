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

/** Lo último que se le dijo a la persona sobre el guardado. */
export interface SpokenSave {
  key: string;
  at: number;
}

/** Entre dos "Guardado" seguidos pasa al menos esto: el autoguardado corre tras cada pausa y no debe hablar cada vez. */
export const SAVED_SPEAK_GAP_MS = 60_000;

/**
 * Qué anuncia el lector de pantalla sobre el guardado (CA-A3), o `null` si calla.
 * Calla en "Cambios sin guardar" y "Guardando…" (pasan en cada pausa), no repite "Sin conexión" en cada reintento y
 * deja el conflicto y los errores que bloquean el guardado a sus propias alertas (ya se anuncian).
 * Dice "Guardado" una vez por minuto como máximo y siempre dice si quedó como borrador o si falló.
 */
export function saveAnnouncement(s: SaveStatus, last: SpokenSave | null, now: number): { text: string; spoken: SpokenSave } | null {
  let key = "";
  let text = "";
  switch (s.kind) {
    case "pending":
    case "saving":
    case "conflict":
    case "blocked":
      return null;
    case "saved":
      if (s.draft) {
        key = "draft";
        text = `${describeStatus(s).label}. ${STUDIO_TEXTS.guardado.borrador}`;
      } else {
        key = "saved";
        text = STUDIO_TEXTS.guardado.guardado;
        if (last && last.key === "saved" && now - last.at < SAVED_SPEAK_GAP_MS) return null;
      }
      break;
    case "offline":
      key = "offline";
      text = STUDIO_TEXTS.guardado.sinConexion;
      break;
    case "failed":
      key = `failed:${s.code}`;
      text = `No se pudo guardar. ${s.message}`;
      break;
  }
  if (last && last.key === key && key !== "saved") return null;
  return { text, spoken: { key, at: now } };
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

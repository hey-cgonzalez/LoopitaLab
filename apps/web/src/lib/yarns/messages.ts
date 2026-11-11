import type { Issue } from "@loopitalab/pattern-core";
import { SAVED_NOTE_MAX, SAVED_YARNS_LIMIT } from "./saved.ts";
import type { SavedYarn } from "./saved.ts";

/*
 * Mensajes de las lanas guardadas (Server Actions de app/lanas/actions.ts). Nunca se devuelve el texto de Postgres ni de
 * PostgREST. 54000 es el tope de 500 lanas (`user_yarns_quota`).
 */

export type YarnErrorCode = "UNAUTHENTICATED" | "INVALID_REQUEST" | "INVALID_YARN" | "NOTE_TOO_LONG" | "NOT_FOUND" | "QUOTA" | "DATABASE";

export const YARN_MESSAGES: Record<YarnErrorCode, string> = {
  UNAUTHENTICATED: "Tu sesión terminó. Vuelve a ingresar para ver tus lanas.",
  INVALID_REQUEST: "No pudimos leer lo que enviaste. Recarga la página e intenta de nuevo.",
  INVALID_YARN: "La lana tiene datos que no son válidos. Revisa el grosor, la composición (debe sumar 100 %) y el color.",
  NOTE_TOO_LONG: `La nota de una lana guardada admite hasta ${SAVED_NOTE_MAX} caracteres. Acórtala o confirma que se recorte.`,
  NOT_FOUND: "No encontramos esa lana. Puede que la hayas borrado desde otro dispositivo.",
  QUOTA: `Llegaste al tope de ${SAVED_YARNS_LIMIT} lanas guardadas. Borra alguna que ya no uses para guardar otra.`,
  DATABASE: "No pudimos completar la operación. Revisa tu conexión e intenta de nuevo en unos minutos.",
};

export interface YarnFailure {
  ok: false;
  code: YarnErrorCode;
  error: string;
  /** INVALID_YARN: los errores del validador (sin citar la nota). */
  issues?: Issue[];
  /** INVALID_YARN: el motivo cuando no viene del validador. */
  reason?: string;
}

export const yarnFailure = (code: YarnErrorCode, extra: Partial<Omit<YarnFailure, "ok" | "code" | "error">> = {}): YarnFailure => ({
  ok: false,
  code,
  error: YARN_MESSAGES[code],
  ...extra,
});

/** Traduce un error de PostgREST: solo mira `code`. */
export function yarnDbFailure(error: { code?: string } | null | undefined): YarnFailure {
  switch (error?.code) {
    case "54000":
      return yarnFailure("QUOTA");
    case "42501":
    case "PGRST116":
      return yarnFailure("NOT_FOUND");
    case "23514":
    case "23503":
    case "22P02":
      return yarnFailure("INVALID_YARN");
    default:
      return yarnFailure("DATABASE");
  }
}

export type ListYarnsResult = { ok: true; yarns: SavedYarn[] } | YarnFailure;
export type SaveYarnResult = { ok: true; yarn: SavedYarn; warnings: Issue[] } | YarnFailure;
export type DeleteYarnResult = { ok: true } | YarnFailure;

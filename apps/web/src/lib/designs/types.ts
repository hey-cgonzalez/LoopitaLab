import type { Issue } from "@loopitalab/pattern-core";
import type { DesignErrorCode } from "./messages.ts";

/** Fallo de una acción. `error` es el texto para mostrar; `code` decide qué hace la interfaz. */
export interface DesignFailure {
  ok: false;
  code: DesignErrorCode;
  error: string;
  /** Solo en NOT_SAVABLE: los errores estructurales que impiden guardar. */
  issues?: Issue[];
  /** Solo en CONFLICT: el `updated_at` actual, para que "sobrescribir" sea una acción explícita. */
  currentUpdatedAt?: string;
}

export type CreateDesignResult = { ok: true; id: string; updatedAt: string; draft: boolean } | DesignFailure;
export type SaveDesignResult = { ok: true; updatedAt: string; draft: boolean } | DesignFailure;
export type SaveVersionResult = { ok: true; version: number } | DesignFailure;
export type DuplicateDesignResult = { ok: true; id: string; updatedAt: string; draft: boolean } | DesignFailure;
export type DeleteDesignResult = { ok: true } | DesignFailure;

/** Fila de "Mis diseños": sin leer el documento completo (ADR 0006, miniaturas). */
export interface DesignListItem {
  id: string;
  title: string;
  technique: string;
  kind: string;
  origin: string;
  visibility: string;
  updatedAt: string;
  /** Tamaño del motivo; null si el diseño no es un gráfico. */
  width: number | null;
  height: number | null;
  renderAs: string | null;
}

export type ListDesignsResult = { ok: true; designs: DesignListItem[] } | DesignFailure;

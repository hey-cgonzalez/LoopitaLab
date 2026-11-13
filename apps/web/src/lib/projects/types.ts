import type { ChartPointer } from "@loopitalab/follow";
import type { ChartPattern, Issue } from "@loopitalab/pattern-core";
import type { LengthEstimate } from "@loopitalab/yarn-catalog";
import type { ProjectFailure, WorkedIn } from "./messages.ts";

export type { ProjectFailure, ProjectErrorCode, WorkedIn } from "./messages.ts";

export type StartProjectResult = { ok: true; projectId: string; version: number; reused: boolean } | ProjectFailure;

/** Lo que el gráfico no incluye (ADR 0009, T1-7; T18, M1). Palillo y crochet tienen listas distintas (`notInChartFor`). */
export type NotInChartKey = "cast_on" | "edging" | "bind_off" | "foundation" | "turning_chain" | "fasten_off" | "prior_shaping" | "assembly";

/** Muestra que se usó para las cifras: la del documento o la supuesta por grosor (rotulada "supuesto"). */
export interface KnitPreviewGauge {
  stitchesPer10cm: number;
  rowsPer10cm: number;
  assumed: boolean;
  lowConfidence: boolean;
}

export interface KnitPreviewYarn {
  id: string;
  hex: string;
  weight: number;
  stitches: number;
  floatStitches: number;
  /** Metraje estimado (solo palillo). `null`: sin estimación (crochet o sin muestra utilizable). */
  length: LengthEstimate | null;
}

/** Lo que muestra la pantalla previa a "Tejer este diseño" (F3-39). Todo viene del motor, del secuenciador y del catálogo. */
export interface KnitPreview {
  /** `updated_at` del diseño leído: es el que `startProjectFromDesign` vuelve a leer y `start_chart_project` compara. */
  patternUpdatedAt: string;
  title: string;
  technique: "knit" | "crochet";
  gauge: KnitPreviewGauge | null;
  shape: {
    workedIn: WorkedIn;
    renderAs: string;
    direction: "bottom_up" | "top_down";
    /** Filas o vueltas del gráfico completo (`plan.totalRows`). */
    totalRows: number;
    totalStitches: number;
    motif: { width: number; height: number };
    repeat: { x: number; y: number };
    /** Vista de tubo o círculo con `workedIn: "rows"` (`CHART_ROWS_SHAPE`): se teje de ida y vuelta y se cose. */
    flatAndSewn: boolean;
  };
  yarns: KnitPreviewYarn[];
  /** Constante: el metraje es solo del gráfico (enmienda T1-6 del ADR 0008). */
  lengthScope: "chart_only";
  /** Advertencias que no bloquean (por ejemplo `CHART_FLOAT_LONG`). */
  warnings: Issue[];
  info: Issue[];
  /** Lo que el gráfico no incluye, según la técnica (T18, M1); la interfaz lo redacta con el glosario. */
  notInChart: readonly NotInChartKey[];
}

export type KnitPreviewResult = ({ ok: true } & KnitPreview) | ProjectFailure;

export interface LoadedProject {
  id: string;
  title: string;
  status: string;
  patternId: string;
  /** Id y número de la versión fijada. La pantalla manda `versionId` en cada `saveProgress`. */
  versionId: string;
  version: number;
}

export type LoadProjectResult =
  | {
      ok: true;
      project: LoadedProject;
      /** La versión fijada, ya migrada. */
      document: ChartPattern;
      /** Falso si una regla nueva del validador la marca con errores de tejido: se muestra con aviso. */
      valid: boolean;
      /** Errores de tejido de la versión fijada (vacío si `valid`). */
      issues: Issue[];
      /** Preferencia `mirror_knitting` del perfil: la pantalla arma su plan con ella. */
      mirror: boolean;
      /** Puntero acotado al plan (inicio si el proyecto no tiene fila de avance). */
      pointer: ChartPointer;
      /** `updated_at` del avance; `null` si el proyecto no tiene fila de avance todavía. */
      progressUpdatedAt: string | null;
      /** El diseño actual difiere de la versión fijada (se ofrece "Pasar a la versión actual"). */
      newerVersionAvailable: boolean;
    }
  | ProjectFailure;

/** Relectura ligera del avance (T17, I4): puntero sin acotar al plan, su `updated_at` y la versión fijada. */
export type GetProgressResult = { ok: true; versionId: string; pointer: ChartPointer; progressUpdatedAt: string | null } | ProjectFailure;

export type SaveProgressResult = { ok: true; updatedAt: string } | ProjectFailure;

/** Qué cambiaría "Pasar a la versión actual": el puntero reubicado con `remapPointer`, para mostrarlo antes. */
export interface RepinPreview {
  /** El diseño actual es idéntico a la versión fijada: no hay nada que pasar. */
  sameDocument: boolean;
  from: { version: number; workedIn: WorkedIn; totalRows: number };
  to: { workedIn: WorkedIn; totalRows: number };
  currentPointer: ChartPointer;
  /** Puntero reubicado (`remapPointer`). */
  pointer: ChartPointer;
  clamped: boolean;
  rowChanged: boolean;
  progressUpdatedAt: string | null;
}

export type RepinPreviewResult = ({ ok: true } & RepinPreview) | ProjectFailure;

export type RepinResult =
  | { ok: true; version: number; reused: boolean; pointer: ChartPointer; progressUpdatedAt: string; clamped: boolean; rowChanged: boolean; workedIn: WorkedIn; totalRows: number }
  | ProjectFailure;

export type DeleteProjectResult = { ok: true } | ProjectFailure;

/** Fila de "Tus proyectos" (ADR 0009, T1-2): el avance y el tamaño salen de las rutas JSON de la versión fijada. */
export interface ProjectListItem {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "paused" | "finished";
  updatedAt: string;
  /** `null` en los proyectos sueltos (sin diseño): conservan el flujo de estado. */
  design: {
    patternId: string | null;
    /** Título actual del diseño (`null` si el diseño ya no existe). */
    patternTitle: string | null;
    version: number;
    workedIn: WorkedIn;
    /** `totalRowsOf(height, repeat.y)` de `follow`; 0 si la versión no se pudo leer. */
    totalRows: number;
    /** Puntero sin acotar al plan completo (solo `rowsDone` acotado a `totalRows`). */
    pointer: ChartPointer;
    progressUpdatedAt: string | null;
    /**
     * Pista de que el diseño cambió después de fijar la versión: `patterns.updated_at` posterior a la versión y al
     * proyecto. Es una heurística para la lista (sin leer documentos); la ficha compara los documentos (exacto).
     */
    mayHaveNewer: boolean;
  } | null;
}

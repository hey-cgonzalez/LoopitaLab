import { recommendedLimitUsage, type WrittenPattern } from "@loopitalab/pattern-core";
import { buildScene, type SceneCache, type SceneNote, type SurfaceLook } from "@loopitalab/viewer-3d";
import { viewerMode, type AmigurumiRenderer, type ViewerMode, type ViewerPolicy } from "@loopitalab/viewer-3d/three";
import type { PreviewTarget, YarnCandidate } from "@/components/studio/preview-controls.ts";
import { LookCache, surfaceLookOf } from "./looks.ts";
import { metricsResolver, partSummaries, type PartSummary } from "./metrics.ts";

/*
 * Conexión del documento con el renderer 3D (ADR 0010, secciones 4, 5, 6b y 6c), fuera de React: el componente la
 * crea, le da el renderer al montar el lienzo y le pasa cada versión del documento. Ninguna edición vuelve a
 * renderizar un árbol de React proporcional a los puntos.
 *
 * - **Puntos de la escena** con `recommendedLimitUsage` del motor (igual a `buildScene().stitchCount`, G13): el
 *   visor no cuenta nada propio y decide el modo antes de armar mallas.
 * - **Dentro del límite recomendado**: `buildScene` y `setScene` en el mismo turno.
 * - **Sobre el límite recomendado**: como mucho una reconstrucción en curso. La edición solo deja el documento
 *   pendiente y "Actualizando 3D…"; la tarea programada toma el último pendiente (la siguiente edición reemplaza a
 *   las anteriores, sin cola). El editor nunca espera al 3D.
 * - **Sobre `SCENE_HARD_STITCH_CAP`**: no se arma la malla; el componente muestra las siluetas.
 * - **Solo cambió el aspecto** (color, composición, "Colores planos", vista previa): `setLooks` o
 *   `setPreviewOverride`. Sin `buildScene`, sin atributos y sin recompilar.
 */

export type Schedule = (task: () => void) => () => void;

/** Tarea en un turno nuevo (después de pintar el editor): `MessageChannel`, sin el tope de 4 ms de `setTimeout`. */
export const nextTask: Schedule = (task) => {
  if (typeof MessageChannel === "undefined") {
    const t = setTimeout(task, 0);
    return () => clearTimeout(t);
  }
  const ch = new MessageChannel();
  let cancelled = false;
  ch.port1.onmessage = () => {
    ch.port1.close();
    if (!cancelled) task();
  };
  ch.port2.postMessage(0);
  return () => {
    cancelled = true;
    ch.port1.close();
  };
};

export interface ViewerStatus {
  mode: ViewerMode;
  /** "Actualizando 3D…": hay una reconstrucción pendiente (solo sobre el límite recomendado). */
  updating: boolean;
  /** Puntos de la escena, del motor. */
  stitches: number;
  notes: SceneNote[];
  parts: PartSummary[];
  policy: ViewerPolicy | null;
  flatColors: boolean;
}

export interface ControllerCounters {
  buildScene: number;
  partsBuilt: number;
  partsRecolored: number;
  partsKept: number;
  looksOnly: number;
  deferred: number;
  /** Reconstrucciones descartadas porque llegó una edición más nueva antes de armarlas. */
  superseded: number;
}

type RendererPort = Pick<AmigurumiRenderer, "setScene" | "setLooks" | "setPreviewOverride">;

const sceneStitches = (pattern: WrittenPattern): number => recommendedLimitUsage(pattern).find((u) => u.limit === "sceneStitches")?.value ?? 0;

const sameIds = (a: WrittenPattern, b: WrittenPattern): boolean => a.yarns.length === b.yarns.length && a.yarns.every((y, i) => y.id === b.yarns[i]?.id);

export class ViewerController implements PreviewTarget {
  #renderer: RendererPort | null = null;
  #schedule: Schedule;
  #onStatus: (s: ViewerStatus) => void;
  #pattern: WrittenPattern | null = null;
  /** Último documento dibujado con geometría (para saber si una versión nueva solo cambia aspectos). */
  #drawn: WrittenPattern | null = null;
  #cache: SceneCache | undefined;
  #pending: WrittenPattern | null = null;
  #cancel: (() => void) | null = null;
  #looks = new LookCache();
  #flat = false;
  #preview: { index: number; candidate: YarnCandidate } | null = null;
  #status: ViewerStatus = { mode: "full", updating: false, stitches: 0, notes: [], parts: [], policy: null, flatColors: false };
  readonly counters: ControllerCounters = { buildScene: 0, partsBuilt: 0, partsRecolored: 0, partsKept: 0, looksOnly: 0, deferred: 0, superseded: 0 };

  constructor(opts: { schedule?: Schedule; onStatus?: (s: ViewerStatus) => void; flatColors?: boolean } = {}) {
    this.#schedule = opts.schedule ?? nextTask;
    this.#onStatus = opts.onStatus ?? (() => {});
    this.#flat = opts.flatColors === true;
    this.#status.flatColors = this.#flat;
  }

  get status(): ViewerStatus {
    return this.#status;
  }

  /** El renderer se conecta al montar el lienzo (y se desconecta con `null`). Redibuja el documento actual. */
  attach(renderer: RendererPort | null): void {
    this.#renderer = renderer;
    this.#drawn = null;
    this.#cache = undefined;
    if (renderer && this.#pattern) this.#apply(this.#pattern);
  }

  update(pattern: WrittenPattern): void {
    if (pattern === this.#pattern) return;
    this.#pattern = pattern;
    this.#apply(pattern);
  }

  setFlatColors(flat: boolean): void {
    if (flat === this.#flat) return;
    this.#flat = flat;
    this.#emit({ flatColors: flat });
    if (!this.#pattern || !this.#renderer) return;
    const { looks, changed } = this.#looks.update(this.#pattern.yarns, flat);
    if (changed) {
      this.counters.looksOnly++;
      this.#renderer.setLooks(looks);
    }
    this.#syncPreview();
  }

  previewYarn(index: number, candidate: YarnCandidate | null): void {
    this.#preview = candidate && Number.isInteger(index) && index >= 0 ? { index, candidate } : null;
    this.#syncPreview();
  }

  dispose(): void {
    this.#cancel?.();
    this.#cancel = null;
    this.#renderer = null;
  }

  #syncPreview(): void {
    if (!this.#renderer) return;
    const p = this.#preview;
    const base = p ? this.#pattern?.yarns[p.index] : undefined;
    if (!p) return this.#renderer.setPreviewOverride(null);
    const look: SurfaceLook = surfaceLookOf({ ...base, color: p.candidate.color, composition: p.candidate.composition ?? base?.composition ?? [] }, this.#flat);
    this.#renderer.setPreviewOverride({ yarn: p.index, look });
  }

  #emit(patch: Partial<ViewerStatus>): void {
    this.#status = { ...this.#status, ...patch };
    this.#onStatus(this.#status);
  }

  #apply(pattern: WrittenPattern): void {
    const renderer = this.#renderer;
    const stitches = sceneStitches(pattern);
    const mode = viewerMode(stitches);
    if (!renderer) {
      this.#emit({ mode, stitches, parts: partSummaries(pattern) });
      return;
    }
    const drawn = this.#drawn;
    // Solo aspectos: las mismas partes, posiciones y muestra, y las mismas lanas en el mismo orden.
    if (drawn && drawn.parts === pattern.parts && drawn.layout === pattern.layout && drawn.gauge === pattern.gauge && sameIds(drawn, pattern) && !this.#pending) {
      const { looks, changed } = this.#looks.update(pattern.yarns, this.#flat);
      this.#drawn = pattern;
      if (changed) {
        this.counters.looksOnly++;
        renderer.setLooks(looks);
      }
      this.#syncPreview();
      return;
    }
    if (mode === "silhouettes") {
      this.#cancelPending();
      this.#cache = undefined;
      this.#drawn = null;
      const { looks } = this.#looks.update(pattern.yarns, this.#flat);
      const policy = renderer.setScene({ instances: [], stitchCount: stitches }, looks);
      this.#emit({ mode, stitches, updating: false, notes: [], parts: partSummaries(pattern), policy });
      return;
    }
    if (mode === "degraded") {
      if (this.#pending) this.counters.superseded++;
      this.#pending = pattern;
      this.counters.deferred++;
      this.#emit({ mode, stitches, updating: true });
      this.#cancel ??= this.#schedule(() => {
        this.#cancel = null;
        const next = this.#pending;
        this.#pending = null;
        if (next && this.#renderer) this.#build(next, stitches);
      });
      return;
    }
    this.#cancelPending();
    this.#build(pattern, stitches);
  }

  #cancelPending(): void {
    if (this.#pending) this.counters.superseded++;
    this.#cancel?.();
    this.#cancel = null;
    this.#pending = null;
  }

  #build(pattern: WrittenPattern, fallbackStitches: number): void {
    const renderer = this.#renderer;
    if (!renderer) return;
    const metrics = metricsResolver(pattern);
    const scene = buildScene({ pattern, metrics, ...(this.#cache ? { previous: this.#cache } : {}) });
    this.counters.buildScene++;
    for (const u of scene.updates) {
      if (u.kind === "built") this.counters.partsBuilt++;
      else if (u.kind === "recolored") this.counters.partsRecolored++;
      else this.counters.partsKept++;
    }
    this.#cache = scene.cache;
    this.#drawn = pattern;
    const { looks } = this.#looks.update(pattern.yarns, this.#flat);
    const policy = renderer.setScene(scene, looks);
    this.#syncPreview();
    this.#emit({
      mode: policy.mode,
      stitches: Number.isFinite(scene.stitchCount) ? scene.stitchCount : fallbackStitches,
      updating: this.#pending !== null,
      notes: scene.notes,
      parts: partSummaries(pattern, metrics),
      policy,
    });
  }
}

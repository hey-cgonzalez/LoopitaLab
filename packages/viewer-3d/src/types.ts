/**
 * Tipos públicos de la parte pura de `viewer-3d` (ADR 0010, secciones 3, 4, 5 y 6b).
 * Sin dependencias de terceros: solo tipos de `@loopitalab/pattern-core`.
 */
import type { Part, ShapeMetrics, WrittenPattern } from "@loopitalab/pattern-core";

export type Vec3 = [number, number, number];

/**
 * Aspecto de una lana en el 3D (ADR 0010, secciones 5 y 6b). **Misma forma que `YarnLook`
 * de `stitch-render`**, sin importarlo: la aplicación calcula `yarnLook(...)` y lo pasa tal
 * cual. Una prueba de tipos en `apps/web` vigila que los dos sigan siendo asignables en los
 * dos sentidos.
 */
export interface SurfaceLook {
  /** #RRGGBB. */
  hex: string;
  /** 0 a 1. */
  halo: number;
  /** 0 a 1. */
  sheen: number;
  /** 0 a 1. */
  definition: number;
}

/** Nivel de detalle (sección 6). La malla pura es la misma en los dos: lo decide el backend. */
export type Lod = "smooth" | "relief";

export interface PartMeshOptions {
  /**
   * Hasta dónde se construye, para el 3D parcial del modo tejiendo (fase 6). Omitido = la
   * parte completa. La malla se corta en `roundStart[roundsDone] + stitchesDone`, contando
   * puntos **producidos** (un `aum` son 2). Valores fuera de rango se acotan.
   */
  limit?: { roundsDone: number; stitchesDone: number };
  /** Se acepta por contrato (ADR 0010, sección 3); la geometría no cambia con el nivel de detalle. */
  lod?: Lod;
  /**
   * Reutiliza el prefijo de una malla anterior de la misma parte (sección 6c, G12).
   * `fromRound` es el índice 0-based de la vuelta **concreta** editada (el mismo índice de
   * `roundStart`). Es una cota: la función verifica qué vueltas siguen iguales y copia solo
   * esas; si nada coincide, arma desde cero. El resultado es siempre igual a armar desde cero.
   */
  reuse?: { mesh: PartMesh; fromRound: number };
}

/** Valores de `PartMesh.loop` (hebra por la que se trabaja cada punto). */
export const LOOP_BOTH = 0;
export const LOOP_FRONT = 1;
export const LOOP_BACK = 2;

export interface PartMesh {
  /** xyz por vértice, en cm, con el inicio de la parte en el origen y la pieza creciendo hacia +z. */
  positions: Float32Array;
  /** Normal analítica del perfil, unitaria. */
  normals: Float32Array;
  /** uv por vértice: 0 a 1 dentro de cada punto, para el relieve (v = 0 abajo, 1 arriba). */
  uvs: Float32Array;
  /** Índice de la lana (en `pattern.yarns`) de cada vértice. `colorizePartMesh` lo reescribe. */
  yarn: Uint8Array;
  /**
   * Hebra de cada vértice (`LOOP_BOTH`, `LOOP_FRONT`, `LOOP_BACK`). No cambia la forma
   * (enmienda C-7): el backend dibuja con ella la línea de borde en el relieve.
   */
  loop: Uint8Array;
  indices: Uint32Array;
  /** Punto global (0 … puntos − 1) de cada triángulo, para elegir con el puntero. */
  faceStitch: Uint32Array;
  /** Primer punto global de cada vuelta concreta incluida (largo = vueltas incluidas + 1). */
  roundStart: Uint32Array;
  /**
   * Giro de cada anillo del perfil, en vueltas (0 a 1; largo = vueltas concretas + 1; ceros en
   * hileras). Alinea en promedio la base y el tope de los puntos de cada vuelta, así una vuelta
   * con los aumentos juntos no se tuerce; como en la tela, el inicio de vuelta se corre.
   * `surfaceFrame` lo recibe con `{ mesh }` para que un ancla caiga sobre el punto de la malla.
   */
  ringPhase: Float64Array;
  vertexCount: number;
  indexCount: number;
  bounds: { min: Vec3; max: Vec3 };
}

/** Marco de la superficie en una vuelta y un punto (ADR 0011, `SurfaceAt`). */
export interface Frame {
  /** Centro del borde superior del punto, en cm, en coordenadas de la parte. */
  position: Vec3;
  /** Normal hacia afuera de la tela (unitaria). */
  normal: Vec3;
  /** Tangente a la vuelta (unitaria): en redondo, en el sentido en que se teje; en hileras, siempre +x. */
  tangent: Vec3;
  /** Dirección del meridiano hacia las vueltas siguientes (unitaria). `tangent × meridian = normal`. */
  meridian: Vec3;
  /** Vuelta (número visible) y punto (0-based) usados, ya acotados. */
  round: number;
  stitch: number;
  /** true si la vuelta o el punto pedidos no existían y se acotaron. */
  clamped: boolean;
}

export interface SceneInput {
  pattern: WrittenPattern;
  /** La aplicación resuelve la muestra real o supuesta de cada parte (ADR 0010, sección 1). */
  metrics: (part: Part) => ShapeMetrics;
  /** Caché de la escena anterior, para reconstruir solo lo que cambió. Se consume: no reutilizarla dos veces. */
  previous?: SceneCache;
}

export interface SceneInstance {
  partId: string;
  copy: number;
  /** Compartida entre las copias de una misma parte. */
  mesh: PartMesh;
  /** 4 × 4, en cm, columna mayor. */
  matrix: Float32Array;
  /** false = ubicación automática (no tiene posición en el documento o no se pudo resolver). */
  placed: boolean;
}

/** Opaca: perfiles y mallas por parte, con su firma. */
export interface SceneCache {
  readonly __sceneCache: true;
}

export type SceneNoteCode =
  | "ANCHOR_CLAMPED"
  | "ANCHOR_UNRESOLVED"
  | "GAUGE_ASSUMED"
  | "SHAPE_RUFFLES"
  | "SHAPE_GATHERS"
  /** La parte pasa los topes de expansión del motor (T20-A1) y se arma vacía. Solo con documentos que no son `savable`. */
  | "PART_TOO_LARGE";

/** Lo que la escena aproximó. La interfaz lo muestra como aviso, nunca como error. */
export interface SceneNote {
  code: SceneNoteCode;
  /** Mensaje en español, en lenguaje de tejedora. */
  message: string;
  partId?: string;
  copy?: number;
  data?: Record<string, unknown>;
}

/**
 * Qué pasó con la malla de cada parte (para el backend y para la guardia CA4-P6):
 * - `kept`: misma referencia, misma muestra y mismas lanas; no se tocó;
 * - `recolored`: misma forma; `colorizePartMesh` reescribió `yarn` en el lugar, en `[from, to)`;
 * - `built`: malla nueva (`reusedRounds` vueltas copiadas de la anterior).
 */
export type SceneUpdate =
  | { partId: string; kind: "kept" }
  | { partId: string; kind: "recolored"; from: number; to: number }
  | { partId: string; kind: "built"; reusedRounds: number };

export interface SceneResult {
  instances: SceneInstance[];
  cache: SceneCache;
  notes: SceneNote[];
  /** Puntos de la escena: Σ `roundStart.at(-1)` de la malla de cada instancia (G13). */
  stitchCount: number;
  updates: SceneUpdate[];
}

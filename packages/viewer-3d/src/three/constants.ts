/**
 * Constantes con nombre del backend `three` (ADR 0010, secciones 6, 6b y 6c; enmiendas V-1 y V-4).
 *
 * Los valores de rendimiento son la primera calibración de T3b, **confirmada por T12 en el M1** (2026-11-15,
 * `apps/web/e2e/medir-visor-3d.ts`, cifras en `docs/qa-fase-4.md`); la medición en el equipo de referencia decide
 * (como enmiendas del ADR). Los del aspecto por fibra son valores iniciales razonables:
 * **T11c los calibra** con capturas 2D y 3D de las mismas lanas, revisadas por `catalogo-lanas` y
 * `experto-tejido`. Ninguno cambia el documento ni lo que se puede guardar.
 */
import { LIMITS, RECOMMENDED_WRITTEN_LIMITS } from "@loopitalab/pattern-core";

// ---------------------------------------------------------------- Rendimiento (sección 6 y 6c)

/**
 * Por encima de esta cantidad de puntos visibles, el nivel de detalle pasa a `"smooth"` (enmienda V-4).
 * Regla: ≥ 30 fps en `"relief"` con razón de píxeles 2 en el equipo de referencia; si no, 10.000. T12, en el M1
 * (GPU real, CPU ×4): 19.800 puntos en `"relief"` con el aspecto por fibra giran a 60 fps (el tope de la pantalla).
 */
export const LOD_STITCH_BUDGET = 20_000;

/**
 * Límite recomendado de puntos de la escena (sección 6c). Es el de `pattern-core`: el visor no lo
 * redefine. Por encima: `"smooth"` forzado, razón de píxeles 1 y "Actualizando 3D…".
 */
export const RECOMMENDED_SCENE_STITCHES: number = RECOMMENDED_WRITTEN_LIMITS.sceneStitches;

/**
 * Tope del visor (enmienda V-1): por encima no se arma la malla y se muestran las siluetas. Regla: la escena más
 * grande que se arma completa (escena, subir y primer frame) en ≤ 1 s con CPU ×4. T12, en el M1: unos 700.000
 * puntos con 50 partes distintas (el peor caso; con copias, mucho más), pero **queda en 200.000**: el tope también
 * acota la parte más grande que se rearma en el hilo principal con cada edición (R4-20; una parte de 120.000 puntos
 * tarda unos 150 ms con CPU ×4). Subirlo necesita armar la malla en un *worker* (ADR 0010, sección 6c).
 */
export const SCENE_HARD_STITCH_CAP = 200_000;

/** Razón de píxeles máxima fuera de los límites recomendados (sección 6c). */
export const DEGRADED_PIXEL_RATIO = 1;

/** Factor con que crece la capacidad reservada de los atributos cuando una malla no cabe (sección 5). */
export const RESERVE_GROWTH = 1.5;

/** Largo de la tabla por lana: `LIMITS.maxYarns` del núcleo (32). */
export const MAX_YARNS: number = LIMITS.maxYarns;

// ---------------------------------------------------------------- Aspecto por fibra (sección 6b). Calibrar en T11c.

/** Rugosidad del material base (aspecto neutro). */
export const ROUGHNESS_BASE = 0.85;
/** Cuánto baja la rugosidad con `sheen = 1`: `roughness = ROUGHNESS_BASE − FIBER_SHEEN_ROUGHNESS × sheen`. */
export const FIBER_SHEEN_ROUGHNESS = 0.4;
/** Cuánto se aclara la luz especular directa con `sheen = 1` (factor `1 + FIBER_SHEEN_SPECULAR × sheen`). */
export const FIBER_SHEEN_SPECULAR = 0.6;
/** Intensidad del borde difuso (Fresnel) con `halo = 1`: `color += FIBER_HALO_RIM × halo × fresnel × (blanco − color)`. */
export const FIBER_HALO_RIM = 0.35;
/** Cuánto suaviza el relieve el halo: `normalScale × (1 − FIBER_HALO_SOFTEN × halo)`. */
export const FIBER_HALO_SOFTEN = 0.7;
/** Cuánto marca el relieve la definición: `normalScale × (1 + FIBER_DEFINITION_RELIEF × definition)`. */
export const FIBER_DEFINITION_RELIEF = 1.0;
/** Exponente del término de Fresnel del halo. */
export const FIBER_HALO_FRESNEL_POWER = 3;

// ---------------------------------------------------------------- Relieve y resaltado

/** Intensidad base del mapa de normales del punto en `"relief"`. */
export const RELIEF_NORMAL_SCALE = 0.9;
/** Lado de la textura procedural del punto, en texeles (sin archivos de imagen). */
export const STITCH_NORMAL_MAP_SIZE = 64;
/** Oscurecimiento de la línea de borde de una vuelta en hebra delantera o trasera (C-7), solo en `"relief"`. */
export const LOOP_EDGE_SHADE = 0.35;
/** Fracción del alto del punto (desde abajo) que ocupa esa línea de borde. */
export const LOOP_EDGE_WIDTH = 0.14;
/** Luz propia (lineal) de los puntos resaltados (selección, vuelta actual del modo tejiendo). */
export const HIGHLIGHT_EMISSIVE: readonly [number, number, number] = [0.22, 0.16, 0.02];

/** Claves de caché de programa explícitas, una por nivel de detalle (enmienda V-2). */
export const PROGRAM_CACHE_KEYS = Object.freeze({ relief: "loopita-fiber-relief", smooth: "loopita-fiber-smooth" } as const);

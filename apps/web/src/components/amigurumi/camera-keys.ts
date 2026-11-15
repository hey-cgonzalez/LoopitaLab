/*
 * Controles con teclado del visor (ADR 0010, secciones 5 y 8): las flechas giran alrededor del centro, `+` y `−`
 * acercan y alejan, `0` vuelve a la vista inicial. Matemática pura sobre el vector cámara − centro, para probarla
 * sin GPU; el componente la aplica a la cámara y a los controles orbitales.
 */

export type Vec3 = [number, number, number];

/** Paso de giro por tecla, en radianes (15°). */
export const KEY_ROTATE_STEP = Math.PI / 12;
/** Factor de acercamiento por tecla. */
export const KEY_ZOOM_FACTOR = 1.2;
/** Elevación máxima (evita pasar por el polo, donde la vista se da vuelta). */
const MAX_POLAR = Math.PI - 0.05;
const MIN_POLAR = 0.05;

export type CameraKeyAction = { type: "orbit"; azimuth: number; polar: number } | { type: "zoom"; factor: number } | { type: "reset" };

/** Acción de una tecla, o `null` si la tecla no es del visor. */
export function cameraKeyAction(key: string): CameraKeyAction | null {
  switch (key) {
    case "ArrowLeft":
      return { type: "orbit", azimuth: -KEY_ROTATE_STEP, polar: 0 };
    case "ArrowRight":
      return { type: "orbit", azimuth: KEY_ROTATE_STEP, polar: 0 };
    case "ArrowUp":
      return { type: "orbit", azimuth: 0, polar: -KEY_ROTATE_STEP };
    case "ArrowDown":
      return { type: "orbit", azimuth: 0, polar: KEY_ROTATE_STEP };
    case "+":
    case "=":
    case "Add":
      return { type: "zoom", factor: 1 / KEY_ZOOM_FACTOR };
    case "-":
    case "−":
    case "_":
    case "Subtract":
      return { type: "zoom", factor: KEY_ZOOM_FACTOR };
    case "0":
      return { type: "reset" };
    default:
      return null;
  }
}

/**
 * Nuevo vector cámara − centro (eje vertical +y). `minDistance` y `maxDistance` acotan el acercamiento.
 * `reset` no se resuelve aquí (lo hace el componente con el encuadre inicial).
 */
export function applyCameraAction(offset: Vec3, action: Exclude<CameraKeyAction, { type: "reset" }>, limits: { minDistance: number; maxDistance: number }): Vec3 {
  const [x, y, z] = offset;
  const r = Math.hypot(x, y, z);
  if (!(r > 0)) return offset;
  if (action.type === "zoom") {
    const next = Math.min(limits.maxDistance, Math.max(limits.minDistance, r * action.factor));
    const k = next / r;
    return [x * k, y * k, z * k];
  }
  const theta = Math.atan2(x, z) + action.azimuth;
  const phi = Math.min(MAX_POLAR, Math.max(MIN_POLAR, Math.acos(Math.min(1, Math.max(-1, y / r))) + action.polar));
  return [r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.cos(theta)];
}

/** Encuadre inicial: distancia para que una esfera de `radius` quepa con `fovDeg` vertical, un poco desde arriba. */
export function framing(center: Vec3, radius: number, fovDeg: number): { position: Vec3; near: number; far: number; distance: number } {
  const r = radius > 0 && Number.isFinite(radius) ? radius : 5;
  const distance = (r / Math.sin((fovDeg * Math.PI) / 360)) * 1.08;
  const dir: Vec3 = [0, 0.3, 1];
  const n = Math.hypot(...dir);
  return {
    position: [center[0] + (dir[0] / n) * distance, center[1] + (dir[1] / n) * distance, center[2] + (dir[2] / n) * distance],
    near: Math.max(0.01, distance / 100),
    far: distance * 20,
    distance,
  };
}

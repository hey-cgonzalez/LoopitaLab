/*
 * Piezas puras de accesibilidad del estudio (T11): teclado de las pestañas, desplazamiento para no perder el foco y
 * espacio reservado para el aviso fijo. Sin DOM ni React, para poder probarlas.
 */

/**
 * Pestañas en tableta y móvil (patrón de pestañas del APG): flechas izquierda y derecha, Inicio y Fin.
 * Devuelve el `id` al que pasa el foco, o `null` si la tecla no mueve. Da la vuelta en los extremos.
 */
export function nextTabId<T extends string>(ids: readonly T[], current: T, key: string): T | null {
  const i = ids.indexOf(current);
  if (i < 0 || ids.length === 0) return null;
  switch (key) {
    case "ArrowRight":
      return ids[(i + 1) % ids.length] ?? null;
    case "ArrowLeft":
      return ids[(i - 1 + ids.length) % ids.length] ?? null;
    case "Home":
      return ids[0] ?? null;
    case "End":
      return ids[ids.length - 1] ?? null;
    default:
      return null;
  }
}

/**
 * Nuevo desplazamiento (en una dimensión) para que el tramo `[start, start + len]` quede dentro de la ventana
 * visible, con `margin` de holgura. Si ya se ve, devuelve el mismo desplazamiento.
 */
export function revealOffset(scroll: number, viewLen: number, start: number, len: number, margin = 8): number {
  if (!Number.isFinite(scroll) || !Number.isFinite(viewLen) || !Number.isFinite(start) || !Number.isFinite(len)) return scroll;
  const m = Math.min(margin, Math.max(0, (viewLen - len) / 2));
  if (start - m < scroll) return Math.max(0, start - m);
  if (start + len + m > scroll + viewLen) return Math.max(0, start + len + m - viewLen);
  return scroll;
}

/** Valor en px de `--aviso-alto` (la hoja de estilos le suma 1 rem de holgura): el alto medido del aviso; un valor no válido no reserva nada. */
export function noticeReserve(heightPx: number): string {
  return `${Number.isFinite(heightPx) && heightPx > 0 ? Math.ceil(heightPx) : 0}px`;
}

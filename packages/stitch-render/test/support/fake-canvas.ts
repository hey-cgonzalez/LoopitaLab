/**
 * Doble de prueba de un canvas 2D: registra las llamadas que hace el backend.
 * Implementa la interfaz mínima `Surface` / `Ctx2D` de `src/canvas.ts`.
 */
import type { Ctx2D, Surface } from "../../src/index.ts";

export interface Call {
  op: string;
  args: number[];
}

export interface FakeSurface extends Surface {
  calls: Call[];
  ctx: Ctx2D;
  reset(): void;
}

export function fakeSurface(width = 800, height = 600): FakeSurface {
  const calls: Call[] = [];
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args: args.filter((a): a is number => typeof a === "number") });
    };
  const ctx: Ctx2D = {
    fillStyle: "#000",
    strokeStyle: "#000",
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    shadowBlur: 0,
    shadowColor: "transparent",
    imageSmoothingEnabled: true,
    save: record("save"),
    restore: record("restore"),
    setTransform: record("setTransform"),
    fillRect: record("fillRect"),
    clearRect: record("clearRect"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    quadraticCurveTo: record("quadraticCurveTo"),
    rect: record("rect"),
    fill: record("fill"),
    stroke: record("stroke"),
    clip: record("clip"),
    drawImage: record("drawImage"),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const s: FakeSurface = {
    width,
    height,
    calls,
    ctx,
    getContext: () => ctx,
    convertToBlob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    reset() {
      calls.length = 0;
    },
  };
  return s;
}

/** Programador manual de frames: `run()` ejecuta lo pendiente. */
export function manualSchedule() {
  const queue: (() => void)[] = [];
  return {
    schedule: (cb: () => void) => {
      queue.push(cb);
    },
    get pending() {
      return queue.length;
    },
    run() {
      const q = queue.splice(0);
      for (const cb of q) cb();
    },
  };
}

export const count = (calls: readonly Call[], op: string) => calls.filter((c) => c.op === op).length;

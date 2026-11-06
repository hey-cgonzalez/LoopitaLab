/*
 * Compuerta "después del frame" (T10, CA-P7).
 *
 * Entre una edición y el frame que la pinta no debe correr trabajo diferido pesado (validación, respaldo). Los
 * antirrebotes ya lo alejan, pero un temporizador puede vencer justo entre el manejador de la entrada y el
 * `requestAnimationFrame`. La vista previa avisa cuando encola un cambio (`editQueued`) y cuando termina el frame
 * (`painted`); `run(fn)` ejecuta `fn` de inmediato si no hay una edición en vuelo o, si la hay, en la tarea siguiente
 * al frame. Con un tope (`MAX_HOLD_MS`): si el frame no llega (pestaña oculta, vista desmontada), la compuerta se abre
 * sola y el trabajo corre igual; nunca se pierde un guardado.
 */

export const MAX_HOLD_MS = 250;

export interface GateDeps {
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export class PaintGate {
  readonly #d: GateDeps;
  #inFlight = false;
  #waiting: (() => void)[] = [];
  #safety: unknown = null;

  constructor(deps: GateDeps) {
    this.#d = deps;
  }

  get inFlight(): boolean {
    return this.#inFlight;
  }

  editQueued(): void {
    if (this.#inFlight) return;
    this.#inFlight = true;
    this.#safety = this.#d.setTimeout(() => {
      this.#safety = null;
      this.#open(false);
    }, MAX_HOLD_MS);
  }

  /** Terminó un frame de la vista previa (dentro del `requestAnimationFrame`). */
  painted(): void {
    if (this.#safety !== null) this.#d.clearTimeout(this.#safety);
    this.#safety = null;
    this.#open(true);
  }

  run(fn: () => void): void {
    if (this.#inFlight) this.#waiting.push(fn);
    else fn();
  }

  #open(afterFrame: boolean): void {
    if (!this.#inFlight) return;
    this.#inFlight = false;
    const w = this.#waiting;
    this.#waiting = [];
    if (w.length === 0) return;
    const go = () => {
      for (const f of w) f();
    };
    // Dentro del frame se espera a la tarea siguiente (después de pintar); por el tope, se corre ya.
    if (afterFrame) this.#d.setTimeout(go, 0);
    else go();
  }
}

/** Compuerta del estudio (una por página: hay un solo estudio montado). */
export const paintGate = new PaintGate({
  setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
});

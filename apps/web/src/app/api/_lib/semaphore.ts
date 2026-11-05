/**
 * Semáforo en memoria (por instancia del servidor). Limita cuántas tareas pesadas corren a la
 * vez y cuántas pueden esperar; pasado ese límite, `acquire` devuelve null y la ruta responde
 * 503 en vez de acumular memoria.
 */
export class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly max: number,
    private readonly maxWaiting: number,
  ) {}

  get running(): number {
    return this.active;
  }

  get waiting(): number {
    return this.queue.length;
  }

  /** Espera un lugar. Devuelve la función para soltarlo, o null si la cola está llena. */
  async acquire(): Promise<(() => void) | null> {
    if (this.active >= this.max) {
      if (this.queue.length >= this.maxWaiting) return null;
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      // El lugar pasa directo a la siguiente: `active` no cambia.
      if (next) next();
      else this.active--;
    };
  }
}

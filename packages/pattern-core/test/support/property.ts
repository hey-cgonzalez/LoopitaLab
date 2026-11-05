/**
 * Pruebas de propiedades mínimas, sin dependencias (ADR 0002).
 * Cada caso usa una semilla derivada; si falla, el error indica la semilla para reproducirlo:
 *   SEED=12345 node --test test/property.test.ts
 */
export type Rng = {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  bool(p?: number): boolean;
};

export function rng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)] as never,
    bool: (p = 0.5) => next() < p,
  };
}

export function forAll<T>(name: string, gen: (r: Rng) => T, prop: (value: T) => void, runs = 300): void {
  const base = process.env.SEED ? Number(process.env.SEED) : 20261103;
  // Una semilla no entera (SEED=abc da NaN) haría que todas las corridas generen el mismo caso.
  if (!Number.isSafeInteger(base)) throw new Error(`SEED debe ser un entero; se recibió "${process.env.SEED}".`);
  for (let i = 0; i < runs; i++) {
    const seed = base + i;
    const value = gen(rng(seed));
    try {
      prop(value);
    } catch (err) {
      const detail = JSON.stringify(value).slice(0, 2000);
      throw new Error(`Propiedad "${name}" falló con SEED=${seed}.\nCaso: ${detail}\n${(err as Error).message}`);
    }
  }
}

import { LIMITS } from "./limits.ts";
import { STITCHES } from "./stitches.ts";
import type { Item, Loop, Part, Round, StitchCode } from "./types.ts";

/** Un punto concreto, ya expandido, tal como se teje. */
export interface ExpandedStitch {
  stitch: StitchCode;
  yarn: string;
  loop: Loop;
}

export interface RoundCount {
  /** Puntos que consume de la vuelta anterior. */
  consumed: number;
  /** Puntos que deja para la vuelta siguiente (el conteo de la vuelta). */
  produced: number;
  /** Puntos producidos por lana. */
  producedByYarn: Record<string, number>;
  /** Lana activa al terminar la vuelta. */
  endYarn: string;
}

/**
 * Recorre los ítems en orden de tejido sin construir listas. `state.visits` cuenta los puntos
 * visitados (con cantidad positiva).
 *
 * Defensa ante la bomba de expansión (T20-A1): un grupo cuyo subárbol no visita ningún punto
 * (solo cambios de lana) se recorre una sola vez. Es exacto: todos los ítems de un grupo se
 * recorren siempre, así que la lana con que termina una pasada es la del último cambio de
 * lana del grupo, o la de entrada si no tiene ninguno; desde la segunda pasada ya no cambia.
 * El validador además acota el trabajo de expansión (`LIMITS.maxExpansionWork`).
 * Decisión T21: aviso, no error. Un grupo con `times` ≥ 2 sin ningún punto en su subárbol es
 * válido y el validador avisa con `GROUP_COLOR_ONLY` (advertencia).
 */
function walk(items: Item[], yarn: string, visit: (code: StitchCode, count: number, yarn: string, loop: Loop) => void, state: { visits: number }): string {
  let current = yarn;
  for (const item of items) {
    if (item.type === "color") {
      current = item.yarn;
    } else if (item.type === "stitch") {
      if (item.count > 0) {
        visit(item.stitch, item.count, current, item.loop ?? "both");
        state.visits++;
      }
    } else {
      const before = state.visits;
      current = walk(item.items, current, visit, state);
      if (state.visits === before) continue; // sin puntos: las demás pasadas no cambian nada
      for (let i = 1; i < item.times; i++) current = walk(item.items, current, visit, state);
    }
  }
  return current;
}

/**
 * Trabajo de expansión de unos ítems (T20-A1): Σ sobre los nodos (puntos, cambios de lana y
 * grupos) del producto de los `times` que los envuelven, multiplicado por `mult`. Aritmético:
 * no repite los grupos. Es una cota de lo que recorre `walk` sin la defensa de los grupos sin
 * puntos. Con datos sin validar (un `times` que no es un entero positivo, ítems que no son
 * objetos, anidación más allá de `LIMITS.maxNesting`) devuelve `Infinity`, nunca lanza por
 * recursión sin tope.
 */
function itemsWork(items: unknown, mult: number, depth: number): number {
  if (!Array.isArray(items) || depth > LIMITS.maxNesting) return Infinity;
  let work = 0;
  for (const item of items as unknown[]) {
    if (typeof item !== "object" || item === null) return Infinity;
    const it = item as { type?: unknown; times?: unknown; items?: unknown };
    work += mult;
    if (it.type === "group") {
      const times = it.times;
      if (typeof times !== "number" || !Number.isInteger(times) || times < 1) return Infinity;
      work += itemsWork(it.items, mult * times, depth + 1);
    }
    if (!(work <= Number.MAX_VALUE)) return Infinity;
  }
  return work;
}

/** Trabajo de expansión de una vuelta (lo que recorre `expandRound` una vez). Ver `itemsWork`. */
export function roundExpansionWork(round: Round): number {
  return itemsWork((round as { items?: unknown } | null)?.items, 1, 1);
}

/**
 * Trabajo de expansión de una parte: Σ sobre sus vueltas concretas (cada vuelta de un rango
 * cuenta) de `roundExpansionWork`. Lineal en el tamaño de la parte. `Infinity` si una vuelta
 * no se puede medir (documento sin validar).
 */
export function partExpansionWork(part: Part): number {
  const rounds = (part as { rounds?: unknown } | null)?.rounds;
  if (!Array.isArray(rounds)) return 0;
  let total = 0;
  for (const round of rounds as Round[]) {
    if (typeof round !== "object" || round === null) return Infinity;
    const first = round.number;
    const last = round.through ?? first;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) continue; // como `concreteRounds`
    if (last < first) continue;
    total += roundExpansionWork(round) * Math.min(last - first + 1, LIMITS.maxRounds);
  }
  return total;
}

/** Nodos de unos ítems en todos los niveles; `Infinity` en cuanto pasa `max` o con datos sin forma. */
function itemsNodes(items: unknown, max: number, depth: number): number {
  if (!Array.isArray(items) || depth > LIMITS.maxNesting) return Infinity;
  let n = 0;
  for (const item of items as unknown[]) {
    n++;
    if (typeof item === "object" && item !== null && (item as { type?: unknown }).type === "group") n += itemsNodes((item as { items?: unknown }).items, max - n, depth + 1);
    if (!(n <= max)) return Infinity;
  }
  return n;
}

/**
 * true si la parte pasa los topes de tamaño del validador: más de `LIMITS.maxRoundItems` nodos
 * en una vuelta, el trabajo de una vuelta sobre `LIMITS.maxRoundStitches` o el de la parte
 * sobre `LIMITS.maxExpansionWork`. Un documento `savable` nunca los pasa; los derivados (3D)
 * lo usan como defensa con datos sin validar. Lineal y sin recursión sin tope.
 */
export function exceedsExpansionLimits(part: Part): boolean {
  const rounds = (part as { rounds?: unknown } | null)?.rounds;
  if (!Array.isArray(rounds)) return false;
  for (const round of rounds as Round[]) {
    const items = (round as { items?: unknown } | null)?.items;
    if (!(itemsNodes(items, LIMITS.maxRoundItems, 1) <= LIMITS.maxRoundItems)) return true;
    if (!(roundExpansionWork(round) <= LIMITS.maxRoundStitches)) return true;
  }
  return !(partExpansionWork(part) <= LIMITS.maxExpansionWork);
}

function addInto(target: RoundCount, src: RoundCount, times: number): void {
  target.consumed += src.consumed * times;
  target.produced += src.produced * times;
  for (const [y, n] of Object.entries(src.producedByYarn)) {
    target.producedByYarn[y] = (target.producedByYarn[y] ?? 0) + n * times;
  }
}

/**
 * Cuenta ítems sin iterar las repeticiones: el costo depende del tamaño del texto,
 * no de cuántas veces se repite un grupo. Funciona porque cada pasada de un grupo
 * depende solo de la lana con que empieza, y desde la segunda pasada esa lana ya no cambia.
 */
function countItems(items: Item[], startYarn: string): RoundCount {
  const total: RoundCount = { consumed: 0, produced: 0, producedByYarn: {}, endYarn: startYarn };
  for (const item of items) {
    if (item.type === "color") {
      total.endYarn = item.yarn;
    } else if (item.type === "stitch") {
      // Object.hasOwn: un código fuera de la tabla (documento sin validar) no cuenta, en vez de dar NaN.
      if (!Object.hasOwn(STITCHES, item.stitch)) continue;
      const def = STITCHES[item.stitch];
      total.consumed += def.consumes * item.count;
      const p = def.produces * item.count;
      total.produced += p;
      if (p > 0) total.producedByYarn[total.endYarn] = (total.producedByYarn[total.endYarn] ?? 0) + p;
    } else {
      const first = countItems(item.items, total.endYarn);
      addInto(total, first, 1);
      if (item.times > 1) {
        // Si la primera pasada termina en la lana con que empezó, las demás son iguales (T20-M1).
        const rest = first.endYarn === total.endYarn ? first : countItems(item.items, first.endYarn);
        addInto(total, rest, item.times - 1);
        total.endYarn = rest.endYarn;
      } else {
        total.endYarn = first.endYarn;
      }
    }
  }
  return total;
}

/** Cuenta una vuelta sin expandirla. `startYarn` es la lana activa al comenzar. */
export function countRound(round: Round, startYarn: string): RoundCount {
  return countItems(round.items, startYarn);
}

/** Expande una vuelta en la lista de puntos que se tejen, en orden. */
export function expandRound(round: Round, startYarn: string): { stitches: ExpandedStitch[]; endYarn: string } {
  const stitches: ExpandedStitch[] = [];
  const endYarn = walk(round.items, startYarn, (stitch, count, yarn, loop) => {
    for (let i = 0; i < count; i++) stitches.push({ stitch, yarn, loop });
  }, { visits: 0 });
  return { stitches, endYarn };
}

/** Una vuelta concreta: los rangos "V5–8" se convierten en vueltas individuales. */
export interface ConcreteRound {
  number: number;
  /** Índice en `part.rounds` de la vuelta que la define. */
  sourceIndex: number;
  round: Round;
  startYarn: string;
  /**
   * Conteo de la vuelta. Solo lectura: las vueltas de un rango que empiezan con la misma lana
   * comparten el mismo objeto (T20-M1).
   */
  count: RoundCount;
}

/**
 * Despliega las vueltas de una parte (rangos incluidos) con su lana inicial y su conteo.
 * La lana pasa de una vuelta a la siguiente: si una vuelta termina en B, la siguiente empieza en B.
 * Termina siempre en tiempo acotado: una vuelta cuyo `number` o `through` no es un entero
 * seguro se omite y nunca se despliegan más de `LIMITS.maxRounds` vueltas (el validador
 * rechaza esos documentos, así que con uno válido no cambia nada).
 */
export function concreteRounds(part: Part): ConcreteRound[] {
  const out: ConcreteRound[] = [];
  let yarn = part.startYarn;
  part.rounds.forEach((round, sourceIndex) => {
    const first = round.number;
    const last = round.through ?? first;
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return;
    // El conteo solo depende de la lana inicial, y desde la segunda vuelta del rango esa lana
    // ya no cambia: cada vuelta escrita se cuenta a lo más dos veces (T20-M1).
    let cachedYarn: string | null = null;
    let count: RoundCount | null = null;
    for (let n = first; n <= last && out.length < LIMITS.maxRounds; n++) {
      if (count === null || cachedYarn !== yarn) {
        count = countRound(round, yarn);
        cachedYarn = yarn;
      }
      out.push({ number: n, sourceIndex, round, startYarn: yarn, count });
      yarn = count.endYarn;
    }
  });
  return out;
}

/** Puntos disponibles para la primera vuelta según cómo empieza la parte. */
export function startAvailable(part: Part): number | null {
  if (part.start.type === "magic_ring") return null; // el anillo admite cualquier cantidad
  // En hileras, la primera cadeneta desde el ganchillo no se trabaja (convención de punto bajo).
  return part.construction === "flat" ? part.start.count - 1 : part.start.count;
}

export interface PartSummary {
  rounds: number;
  /** Total de puntos producidos en la parte. */
  totalStitches: number;
  /** Puntos por lana en toda la parte. */
  stitchesByYarn: Record<string, number>;
  /** Conteo de la última vuelta. */
  finalCount: number;
}

export function summarizePart(part: Part): PartSummary {
  const rounds = concreteRounds(part);
  const stitchesByYarn: Record<string, number> = {};
  let totalStitches = 0;
  for (const r of rounds) {
    totalStitches += r.count.produced;
    for (const [y, n] of Object.entries(r.count.producedByYarn)) stitchesByYarn[y] = (stitchesByYarn[y] ?? 0) + n;
  }
  return { rounds: rounds.length, totalStitches, stitchesByYarn, finalCount: rounds.at(-1)?.count.produced ?? 0 };
}

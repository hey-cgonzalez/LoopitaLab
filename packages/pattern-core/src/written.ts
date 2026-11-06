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

/** Recorre los ítems en orden de tejido sin construir listas (eficiente para conteos). */
function walk(items: Item[], yarn: string, visit: (code: StitchCode, count: number, yarn: string, loop: Loop) => void): string {
  let current = yarn;
  for (const item of items) {
    if (item.type === "color") {
      current = item.yarn;
    } else if (item.type === "stitch") {
      visit(item.stitch, item.count, current, item.loop ?? "both");
    } else {
      for (let i = 0; i < item.times; i++) current = walk(item.items, current, visit);
    }
  }
  return current;
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
        const rest = countItems(item.items, first.endYarn);
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
  });
  return { stitches, endYarn };
}

/** Una vuelta concreta: los rangos "V5–8" se convierten en vueltas individuales. */
export interface ConcreteRound {
  number: number;
  /** Índice en `part.rounds` de la vuelta que la define. */
  sourceIndex: number;
  round: Round;
  startYarn: string;
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
    for (let n = first; n <= last && out.length < LIMITS.maxRounds; n++) {
      const count = countRound(round, yarn);
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

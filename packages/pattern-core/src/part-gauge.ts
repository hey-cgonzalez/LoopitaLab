/**
 * Lana de la muestra de una parte (revisión T21, C1; BUG-QA4-1). Una pieza mide lo que mide
 * por la lana con que se teje: un cuerpo en grosor 6 y unos ojos en grosor 1 no tienen la
 * misma muestra. Esta es la única regla para elegir esa lana; la usan el validador (avisos de
 * forma, vía `ValidateOptions.assumedGaugeOf`), `describeWritten` y la forma 3D de la web.
 *
 * Funciones puras: aceptan documentos a medio validar (cualquier JSON) sin lanzar.
 */
import type { Part, WeightCategory, WrittenPattern, Yarn } from "./types.ts";

type YarnsOf = Pick<WrittenPattern, "yarns">;
type StartOf = Pick<Part, "startYarn">;

/**
 * Lana con que se mide la muestra supuesta de `part`: su lana inicial (`startYarn`); si esa
 * lana no está en `pattern.yarns`, la primera lana del patrón (`yarns[0]`, convención de
 * respaldo). `undefined` si el patrón no tiene lanas.
 */
export function gaugeYarnOf(pattern: YarnsOf, part: StartOf): Yarn | undefined {
  const yarns: unknown = pattern?.yarns;
  if (!Array.isArray(yarns)) return undefined;
  const start: unknown = part?.startYarn;
  const isYarn = (y: unknown): y is Yarn => typeof y === "object" && y !== null && !Array.isArray(y);
  const found = yarns.find((y: unknown) => isYarn(y) && (y as { id?: unknown }).id === start);
  if (isYarn(found)) return found;
  const first: unknown = yarns[0];
  return isYarn(first) ? first : undefined;
}

/**
 * Grosor CYC (0 a 7) de la lana de la muestra de `part` (`gaugeYarnOf`). Si esa lana no
 * existe o su grosor no es un entero de 0 a 7, `undefined`: el núcleo no inventa un grosor
 * (regla de oro 6) y el llamador decide el respaldo (la web usa el grosor 4, marcado como supuesto).
 */
export function gaugeWeightOf(pattern: YarnsOf, part: StartOf): WeightCategory | undefined {
  const w: unknown = gaugeYarnOf(pattern, part)?.weight;
  return typeof w === "number" && Number.isInteger(w) && w >= 0 && w <= 7 ? (w as WeightCategory) : undefined;
}

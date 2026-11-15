import { concreteRounds, type Part } from "@loopitalab/pattern-core";

/*
 * Traducción entre las vueltas del documento (`part.rounds[j]`, que puede ser un rango "V5–8"), las vueltas
 * concretas del visor (`roundIndex`, 0-based, una por vuelta tejida) y los números visibles (ADR 0010, T11-1 y T11-8).
 * Todo con `concreteRounds` del motor: un error de uno movería el resaltado una vuelta.
 */

/** Índice concreto (0-based) de la PRIMERA vuelta tejida de `part.rounds[sourceIndex]`; null si no existe. */
export function concreteIndexOf(part: Part, sourceIndex: number): number | null {
  const i = concreteRounds(part).findIndex((c) => c.sourceIndex === sourceIndex);
  return i < 0 ? null : i;
}

/** De la vuelta concreta del visor a la del documento y su número visible ("V7" dentro de "V5–8"). */
export function sourceOfConcrete(part: Part, roundIndex: number): { sourceIndex: number; number: number } | null {
  const c = concreteRounds(part)[roundIndex];
  return c ? { sourceIndex: c.sourceIndex, number: c.number } : null;
}

/** Índice en `part.rounds` de la vuelta que cubre el número visible `n` (rangos incluidos); null si ninguna. */
export function sourceIndexOfNumber(part: Part, n: number): number | null {
  const c = concreteRounds(part).find((x) => x.number === n);
  return c ? c.sourceIndex : null;
}

/** "V5" o "V5–8" (con la palabra corta de la construcción: "H" en hileras). */
export function roundLabel(part: Part, sourceIndex: number): string {
  const r = part.rounds[sourceIndex];
  if (!r) return "";
  const prefix = part.construction === "flat" ? "H" : "V";
  return r.through !== undefined && r.through !== r.number ? `${prefix}${r.number}–${r.through}` : `${prefix}${r.number}`;
}

/**
 * Operaciones puras de edición de patrones escritos (ADR 0011, sección 6).
 *
 * Reglas comunes (las mismas de `edit.ts`):
 * - Devuelven un objeto nuevo y nunca mutan la entrada.
 * - Nunca lanzan excepciones.
 * - Con una entrada fuera de rango, un parámetro no válido o una operación que no cambia
 *   nada, devuelven el mismo objeto (misma referencia).
 * - La salida sale normalizada (`normalizePart`).
 * - **Topes duros**: una operación que dejaría un error estructural que la entrada no tenía
 *   (por ejemplo, pasar de `LIMITS.maxNesting`, `LIMITS.maxItemCount`,
 *   `LIMITS.maxRoundStitches`, `LIMITS.maxRounds` o `LIMITS.maxParts`) devuelve el documento
 *   sin cambios. Así, si la entrada era `savable`, la salida también lo es. **Nunca** miran
 *   los límites recomendados (`RECOMMENDED_WRITTEN_LIMITS`): superarlos lo decide la usuaria.
 *   Los errores de tejido (conteos que no cuadran, numeración) sí se permiten: son borradores.
 * - **Profundidad completa** (decisión 2): las rutas de ítems (`ItemPath`) llegan a
 *   cualquier nivel hasta `LIMITS.maxNesting`. El tope de 2 niveles del editor de bloques
 *   v1 vive solo en la interfaz (`BlockEditPolicy`), nunca aquí.
 */
import { LIMITS } from "./limits.ts";
import { normalizePart } from "./text.ts";
import { SCHEMA_VERSION, type Gauge, type Issue, type Item, type Part, type PartRef, type Placement, type Round, type WrittenPattern, type Yarn } from "./types.ts";
import { isDraftError, validatePattern } from "./validate.ts";

/**
 * Ruta de un ítem dentro de una vuelta: `[i]` es `round.items[i]`; `[i, j]`, el ítem `j`
 * del grupo `round.items[i]`, y así hasta `LIMITS.maxNesting` niveles.
 */
export type ItemPath = readonly number[];

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isWritten(p: unknown): p is WrittenPattern {
  return isObj(p) && p.kind === "written" && Array.isArray(p.parts) && Array.isArray(p.yarns);
}

/** Errores estructurales (no de tejido) con ruta bajo `prefix`. */
function hasStructural(issues: Issue[], prefix?: string): boolean {
  return issues.some((i) => {
    if (i.severity !== "error" || isDraftError(i)) return false;
    if (prefix === undefined) return true;
    return i.path === prefix || i.path.startsWith(`${prefix}.`) || i.path.startsWith(`${prefix}[`);
  });
}

function validates(doc: unknown): Issue[] {
  try {
    return validatePattern(doc).issues;
  } catch {
    return [{ code: "SHAPE", severity: "error", path: "", message: "" }];
  }
}

/** La parte, sola en el documento, no tiene errores estructurales propios. */
function partSound(pattern: WrittenPattern, part: Part): boolean {
  const { layout: _layout, ...rest } = pattern;
  return !hasStructural(validates({ ...rest, parts: [part] }), "parts[0]");
}

/**
 * Reemplaza la parte `index` por `next` (normalizada). Devuelve la entrada si no cambia
 * nada o si la parte nueva tiene errores estructurales que la anterior no tenía.
 */
function commitPart(pattern: WrittenPattern, index: number, next: Part): WrittenPattern {
  const prev = pattern.parts[index] as Part;
  const part = normalizePart(next);
  if (sameJson(part, prev)) return pattern;
  if (!partSound(pattern, part) && partSound(pattern, prev)) return pattern;
  const parts = pattern.parts.slice();
  parts[index] = part;
  return { ...pattern, parts };
}

/** Acepta `next` salvo que agregue errores estructurales que `prev` no tenía. */
function commitDoc(prev: WrittenPattern, next: WrittenPattern): WrittenPattern {
  if (hasStructural(validates(next)) && !hasStructural(validates(prev))) return prev;
  return next;
}

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function findPart(pattern: WrittenPattern, partId: string): number {
  return typeof partId === "string" ? pattern.parts.findIndex((p) => isObj(p) && p.id === partId) : -1;
}

/** Copia que no lanza (con `structuredClone`; si falla, un nivel). */
function clone<T>(v: T): T {
  try {
    return structuredClone(v);
  } catch {
    return (Array.isArray(v) ? [...v] : isObj(v) ? { ...v } : v) as T;
  }
}

// ------------------------------------------------------------ Documento

export interface NewWrittenInput {
  id: string;
  title: string;
  /** La primera es la lana inicial de la parte por omisión. */
  yarns: Yarn[];
  gauge?: Gauge;
  /** Partes iniciales. Si se omite, una parte `{ id: partId, name: partName }` con una V1 de 6 pb en anillo mágico. */
  parts?: Part[];
  partId?: string;
  partName?: string;
}

/**
 * Documento nuevo de amigurumi (crochet escrito) con origen manual. No inventa la
 * muestra: solo la incluye si viene. Nunca lanza; con datos inválidos devuelve un
 * documento que `validatePattern` rechaza con el motivo real.
 */
export function newWrittenPattern(input: NewWrittenInput): WrittenPattern {
  const i: Partial<NewWrittenInput> = isObj(input) ? input : {};
  const yarns = Array.isArray(i.yarns) ? i.yarns.map((y) => clone(y)) : [];
  const first = isObj(yarns[0]) ? (yarns[0] as Yarn).id : "A";
  const parts: Part[] = Array.isArray(i.parts)
    ? i.parts.map((p) => normalizePart(clone(p)))
    : [
        {
          id: typeof i.partId === "string" ? i.partId : "p1",
          name: typeof i.partName === "string" && i.partName.trim() !== "" ? i.partName.trim() : "Parte 1",
          construction: "spiral",
          start: { type: "magic_ring" },
          startYarn: first,
          rounds: [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 }],
        },
      ];
  const pattern: WrittenPattern = {
    schemaVersion: SCHEMA_VERSION,
    id: i.id as string,
    title: i.title as string,
    technique: "crochet",
    kind: "written",
    yarns,
    origin: { kind: "manual" },
    parts,
  };
  if (i.gauge !== undefined) pattern.gauge = isObj(i.gauge) ? { ...i.gauge } : i.gauge;
  return pattern;
}

// --------------------------------------------------------------- Lanas

function replaceYarnInItems(items: Item[], from: string, to: string): Item[] {
  return items.map((it) => {
    if (!isObj(it)) return it;
    if (it.type === "color") return it.yarn === from ? { ...it, yarn: to } : it;
    if (it.type === "group" && Array.isArray(it.items)) return { ...it, items: replaceYarnInItems(it.items, from, to) };
    return it;
  });
}

/**
 * Reemplaza la lana `from` por `to` en todas las partes (`startYarn` y cambios `@id`).
 * La usa `removeYarn` de `edit.ts` con los patrones escritos.
 */
export function replaceYarnRefs(parts: Part[], from: string, to: string): Part[] {
  return parts.map((p) => {
    if (!isObj(p)) return p;
    const out: Part = { ...p };
    if (out.startYarn === from) out.startYarn = to;
    if (Array.isArray(out.rounds)) out.rounds = out.rounds.map((r) => (isObj(r) && Array.isArray(r.items) ? { ...r, items: replaceYarnInItems(r.items, from, to) } : r));
    return out;
  });
}

// --------------------------------------------------------------- Partes

/** Resultado de las operaciones que pueden dejar piezas sin ubicar. */
export interface UnplaceResult {
  pattern: WrittenPattern;
  /** Copias de otras partes que perdieron su ubicación porque se cosían a una copia que ya no existe. */
  unplaced: PartRef[];
}

/** Agrega una parte en `index` (por omisión, al final). Rechaza ids repetidos, más de `LIMITS.maxParts` y partes con errores estructurales. */
export function addPart(pattern: WrittenPattern, part: Part, index?: number): WrittenPattern {
  if (!isWritten(pattern) || !isObj(part) || typeof part.id !== "string" || part.id === "") return pattern;
  if (pattern.parts.length >= LIMITS.maxParts || findPart(pattern, part.id) >= 0) return pattern;
  const at = index === undefined ? pattern.parts.length : index;
  if (!isInt(at) || at < 0 || at > pattern.parts.length) return pattern;
  const p = normalizePart(clone(part));
  if (!partSound(pattern, p)) return pattern;
  const parts = pattern.parts.slice();
  parts.splice(at, 0, p);
  return commitDoc(pattern, { ...pattern, parts });
}

/** Cambia el nombre (se recorta; una línea, no vacío, hasta `LIMITS.maxPartNameLength`). */
export function renamePart(pattern: WrittenPattern, partId: string, name: string): WrittenPattern {
  if (!isWritten(pattern) || typeof name !== "string") return pattern;
  const i = findPart(pattern, partId);
  if (i < 0) return pattern;
  return commitPart(pattern, i, { ...(pattern.parts[i] as Part), name });
}

/** Mueve la parte a la posición `toIndex` (de 0 a `parts.length − 1`). */
export function movePart(pattern: WrittenPattern, partId: string, toIndex: number): WrittenPattern {
  if (!isWritten(pattern)) return pattern;
  const i = findPart(pattern, partId);
  if (i < 0 || !isInt(toIndex) || toIndex < 0 || toIndex >= pattern.parts.length || toIndex === i) return pattern;
  const parts = pattern.parts.slice();
  const [p] = parts.splice(i, 1);
  parts.splice(toIndex, 0, p as Part);
  return { ...pattern, parts };
}

export function setPartConstruction(pattern: WrittenPattern, partId: string, construction: Part["construction"]): WrittenPattern {
  if (!isWritten(pattern) || !["spiral", "joined", "flat"].includes(construction)) return pattern;
  const i = findPart(pattern, partId);
  if (i < 0) return pattern;
  return commitPart(pattern, i, { ...(pattern.parts[i] as Part), construction });
}

/** Anillo mágico o cadeneta de `count` (entero ≥ 1; ≥ 2 en hileras). */
export function setPartStart(pattern: WrittenPattern, partId: string, start: Part["start"]): WrittenPattern {
  if (!isWritten(pattern) || !isObj(start)) return pattern;
  const s: Part["start"] | null =
    start.type === "magic_ring" ? { type: "magic_ring" } : start.type === "chain" && isInt(start.count) ? { type: "chain", count: start.count } : null;
  if (!s) return pattern;
  const i = findPart(pattern, partId);
  if (i < 0) return pattern;
  return commitPart(pattern, i, { ...(pattern.parts[i] as Part), start: s });
}

/** Lana con que empieza la parte: el `id` de una lana del documento. */
export function setPartStartYarn(pattern: WrittenPattern, partId: string, yarnId: string): WrittenPattern {
  if (!isWritten(pattern) || typeof yarnId !== "string") return pattern;
  const i = findPart(pattern, partId);
  if (i < 0) return pattern;
  return commitPart(pattern, i, { ...(pattern.parts[i] as Part), startYarn: yarnId });
}

/** Cierre de la parte (varias líneas). `undefined` o un texto en blanco lo quitan. */
export function setPartFinish(pattern: WrittenPattern, partId: string, finish: string | undefined): WrittenPattern {
  if (!isWritten(pattern) || (finish !== undefined && typeof finish !== "string")) return pattern;
  const i = findPart(pattern, partId);
  if (i < 0) return pattern;
  const next: Part = { ...(pattern.parts[i] as Part) };
  if (finish === undefined) delete next.finish;
  else next.finish = finish;
  return commitPart(pattern, i, next);
}

const sameRef = (a: PartRef, b: PartRef) => a.part === b.part && a.copy === b.copy;

/**
 * Quita del `layout` las ubicaciones de las copias que dejan de existir (`gone`) y las de
 * las piezas cosidas a ellas, que quedan sin ubicar. Sin ubicaciones, quita `layout`.
 */
function dropPlacements(pattern: WrittenPattern, gone: (ref: PartRef) => boolean): UnplaceResult {
  const placements = pattern.layout?.placements;
  if (!Array.isArray(placements)) return { pattern, unplaced: [] };
  const unplaced: PartRef[] = [];
  const kept = placements.filter((pl) => {
    if (!isObj(pl) || !isObj(pl.target)) return true;
    if (gone(pl.target)) return false;
    if (isObj(pl.at) && pl.at.type === "surface" && isObj(pl.at.host) && gone(pl.at.host)) {
      unplaced.push({ part: pl.target.part, copy: pl.target.copy });
      return false;
    }
    return true;
  });
  if (kept.length === placements.length) return { pattern, unplaced };
  const next: WrittenPattern = { ...pattern };
  if (kept.length === 0) delete next.layout;
  else next.layout = { ...pattern.layout, placements: kept };
  return { pattern: next, unplaced };
}

/**
 * Cuántas veces se teje la parte (entero de 1 a `LIMITS.maxCopies`; 1 omite `copies`).
 * Quita las posiciones de las copias que dejan de existir y las anclas que apuntaban a
 * ellas; `unplaced` dice qué piezas quedaron sin ubicar (CA4-E8, F4-62).
 */
export function setCopies(pattern: WrittenPattern, partId: string, n: number): UnplaceResult {
  if (!isWritten(pattern) || !isInt(n) || n < 1 || n > LIMITS.maxCopies) return { pattern, unplaced: [] };
  const i = findPart(pattern, partId);
  if (i < 0) return { pattern, unplaced: [] };
  const prev = pattern.parts[i] as Part;
  if ((prev.copies ?? 1) === n) return { pattern, unplaced: [] };
  const part: Part = { ...prev, copies: n };
  const parts = pattern.parts.slice();
  parts[i] = normalizePart(part);
  const r = dropPlacements({ ...pattern, parts }, (ref) => ref.part === partId && isInt(ref.copy) && ref.copy >= n);
  const next = commitDoc(pattern, r.pattern);
  return next === pattern ? { pattern, unplaced: [] } : { pattern: next, unplaced: r.unplaced };
}

/**
 * Quita la parte, sus posiciones y las anclas que dependían de ella. No quita la única
 * parte (el patrón necesita al menos una).
 */
export function removePart(pattern: WrittenPattern, partId: string): UnplaceResult {
  if (!isWritten(pattern) || pattern.parts.length <= 1) return { pattern, unplaced: [] };
  const i = findPart(pattern, partId);
  if (i < 0) return { pattern, unplaced: [] };
  const parts = pattern.parts.filter((_, k) => k !== i);
  const r = dropPlacements({ ...pattern, parts }, (ref) => ref.part === partId);
  const next = commitDoc(pattern, r.pattern);
  return next === pattern ? { pattern, unplaced: [] } : { pattern: next, unplaced: r.unplaced };
}

// --------------------------------------------------------------- Vueltas

/** Última vuelta concreta que cubre `r` (su `through` o su `number`). */
const lastOf = (r: Round) => (isInt(r.through) && r.through >= r.number ? r.through : r.number);

/** Renumera desde `from`: cada vuelta sigue a la anterior y conserva su rango. */
function renumber(rounds: Round[], from: number): Round[] {
  const out = rounds.slice();
  for (let k = Math.max(0, from); k < out.length; k++) {
    const r = out[k] as Round;
    const start = k === 0 ? 1 : lastOf(out[k - 1] as Round) + 1;
    const span = isInt(r.number) ? lastOf(r) - r.number : 0;
    const next: Round = { ...r, number: start };
    if (span > 0) next.through = start + span;
    else delete next.through;
    out[k] = next;
  }
  return out;
}

function withRounds(pattern: WrittenPattern, partId: string, fn: (rounds: Round[]) => Round[] | null): WrittenPattern {
  if (!isWritten(pattern)) return pattern;
  const i = findPart(pattern, partId);
  if (i < 0) return pattern;
  const part = pattern.parts[i] as Part;
  if (!Array.isArray(part.rounds)) return pattern;
  const rounds = fn(part.rounds);
  if (!rounds) return pattern;
  return commitPart(pattern, i, { ...part, rounds });
}

const isRound = (r: unknown): r is Round => isObj(r) && Array.isArray(r.items);

/**
 * Reemplaza todas las vueltas de la parte. La usa el editor de texto: conserva los números
 * que escribió la usuaria (no renumera).
 */
export function replacePartRounds(pattern: WrittenPattern, partId: string, rounds: readonly Round[]): WrittenPattern {
  if (!Array.isArray(rounds) || !rounds.every(isRound)) return pattern;
  return withRounds(pattern, partId, () => rounds.map((r) => clone(r)));
}

/** Inserta una vuelta en `index` (0 a `rounds.length`) y renumera desde ahí. El `number` recibido se ignora; el rango (`through − number`) se conserva. */
export function insertRound(pattern: WrittenPattern, partId: string, index: number, round: Round): WrittenPattern {
  if (!isRound(round)) return pattern;
  return withRounds(pattern, partId, (rounds) => {
    if (!isInt(index) || index < 0 || index > rounds.length) return null;
    const out = rounds.slice();
    out.splice(index, 0, clone(round));
    return renumber(out, index);
  });
}

/** Quita la vuelta `index` y renumera las siguientes. No quita la única vuelta. */
export function removeRound(pattern: WrittenPattern, partId: string, index: number): WrittenPattern {
  return withRounds(pattern, partId, (rounds) => {
    if (!isInt(index) || index < 0 || index >= rounds.length || rounds.length <= 1) return null;
    const out = rounds.slice();
    out.splice(index, 1);
    return renumber(out, index);
  });
}

/** Reemplaza la vuelta `index`: toma el número de la anterior en esa posición, conserva el rango de la nueva y renumera las siguientes. */
export function replaceRound(pattern: WrittenPattern, partId: string, index: number, round: Round): WrittenPattern {
  if (!isRound(round)) return pattern;
  return withRounds(pattern, partId, (rounds) => {
    if (!isInt(index) || index < 0 || index >= rounds.length) return null;
    const out = rounds.slice();
    const prev = out[index] as Round;
    const r = clone(round);
    const span = isInt(r.number) ? lastOf(r) - r.number : 0;
    const next: Round = { ...r, number: prev.number };
    if (span > 0) next.through = prev.number + span;
    else delete next.through;
    out[index] = next;
    return renumber(out, index + 1);
  });
}

// ------------------------------------------------------------------ Ítems

const isPath = (p: unknown): p is ItemPath => Array.isArray(p) && p.length >= 1 && p.every((k) => isInt(k) && k >= 0);

/**
 * Aplica `fn` a la lista de ítems que contiene la ruta (la de la vuelta o la de un grupo)
 * y devuelve la vuelta nueva, o `null` si la ruta no existe.
 */
function editList(items: Item[], parent: readonly number[], fn: (list: Item[]) => Item[] | null): Item[] | null {
  if (parent.length === 0) return fn(items);
  const [k, ...rest] = parent as [number, ...number[]];
  const g = items[k];
  if (!isObj(g) || g.type !== "group" || !Array.isArray(g.items)) return null;
  const inner = editList(g.items, rest, fn);
  if (!inner) return null;
  const out = items.slice();
  out[k] = { ...g, items: inner };
  return out;
}

function getItem(items: Item[], path: ItemPath): Item | undefined {
  let list: Item[] = items;
  for (let d = 0; d < path.length; d++) {
    const it = list[path[d] as number];
    if (d === path.length - 1) return it;
    if (!isObj(it) || it.type !== "group" || !Array.isArray(it.items)) return undefined;
    list = it.items;
  }
  return undefined;
}

function withItems(pattern: WrittenPattern, partId: string, roundIndex: number, fn: (items: Item[]) => Item[] | null): WrittenPattern {
  return withRounds(pattern, partId, (rounds) => {
    if (!isInt(roundIndex) || roundIndex < 0 || roundIndex >= rounds.length) return null;
    const r = rounds[roundIndex];
    if (!isRound(r)) return null;
    const items = fn(r.items);
    if (!items) return null;
    const out = rounds.slice();
    out[roundIndex] = { ...r, items };
    return out;
  });
}

const isItem = (it: unknown): it is Item => isObj(it) && (it.type === "stitch" || it.type === "group" || it.type === "color");

/** Inserta `item` en `path` (el último índice va de 0 al largo de la lista; los anteriores son grupos). */
export function insertItem(pattern: WrittenPattern, partId: string, roundIndex: number, path: ItemPath, item: Item): WrittenPattern {
  if (!isPath(path) || !isItem(item)) return pattern;
  const idx = path[path.length - 1] as number;
  return withItems(pattern, partId, roundIndex, (items) =>
    editList(items, path.slice(0, -1), (list) => {
      if (idx > list.length) return null;
      const out = list.slice();
      out.splice(idx, 0, clone(item));
      return out;
    }),
  );
}

/** Reemplaza el ítem de `path` (por ejemplo, otro punto, otra cantidad o las veces de un grupo). */
export function updateItem(pattern: WrittenPattern, partId: string, roundIndex: number, path: ItemPath, item: Item): WrittenPattern {
  if (!isPath(path) || !isItem(item)) return pattern;
  const idx = path[path.length - 1] as number;
  return withItems(pattern, partId, roundIndex, (items) =>
    editList(items, path.slice(0, -1), (list) => {
      if (idx >= list.length) return null;
      const out = list.slice();
      out[idx] = clone(item);
      return out;
    }),
  );
}

/** Quita el ítem de `path`. No deja un grupo ni una vuelta vacíos (devuelve la entrada). */
export function removeItem(pattern: WrittenPattern, partId: string, roundIndex: number, path: ItemPath): WrittenPattern {
  if (!isPath(path)) return pattern;
  const idx = path[path.length - 1] as number;
  return withItems(pattern, partId, roundIndex, (items) =>
    editList(items, path.slice(0, -1), (list) => {
      if (idx >= list.length) return null;
      const out = list.slice();
      out.splice(idx, 1);
      return out;
    }),
  );
}

/**
 * Mueve un ítem entre posiciones, grupos y niveles. `to` es la ruta que tendrá el ítem
 * **después** de moverlo: se quita de `from` y se inserta en `to` sobre la vuelta ya sin
 * él. "Subir" es `to = from` con el último índice − 1; "bajar", + 1. Devuelve la entrada
 * si alguna ruta no existe, si el grupo de origen quedaría vacío o si se pasaría de
 * `LIMITS.maxNesting`.
 */
export function moveItem(pattern: WrittenPattern, partId: string, roundIndex: number, from: ItemPath, to: ItemPath): WrittenPattern {
  if (!isPath(from) || !isPath(to)) return pattern;
  if (from.length === to.length && from.every((k, i) => k === to[i])) return pattern;
  return withItems(pattern, partId, roundIndex, (items) => {
    const item = getItem(items, from);
    if (!isItem(item)) return null;
    const fromIdx = from[from.length - 1] as number;
    const removed = editList(items, from.slice(0, -1), (list) => {
      const out = list.slice();
      out.splice(fromIdx, 1);
      return out;
    });
    if (!removed) return null;
    const toIdx = to[to.length - 1] as number;
    return editList(removed, to.slice(0, -1), (list) => {
      if (toIdx > list.length) return null;
      const out = list.slice();
      out.splice(toIdx, 0, item);
      return out;
    });
  });
}

/**
 * Agrupa los ítems hermanos de `from` a `to` (inclusive, misma lista) en un grupo que se
 * repite `times` veces (entero de 1 a `LIMITS.maxGroupTimes`). El grupo queda en `from`.
 */
export function wrapInGroup(pattern: WrittenPattern, partId: string, roundIndex: number, from: ItemPath, to: ItemPath, times: number): WrittenPattern {
  if (!isPath(from) || !isPath(to) || from.length !== to.length || !isInt(times) || times < 1) return pattern;
  const parent = from.slice(0, -1);
  if (!parent.every((k, i) => k === to[i])) return pattern;
  const a = from[from.length - 1] as number;
  const b = to[to.length - 1] as number;
  if (b < a) return pattern;
  return withItems(pattern, partId, roundIndex, (items) =>
    editList(items, parent, (list) => {
      if (b >= list.length) return null;
      const out = list.slice();
      const group: Item = { type: "group", items: out.slice(a, b + 1), times };
      out.splice(a, b - a + 1, group);
      return out;
    }),
  );
}

/**
 * Deshace el grupo de `path`: sus ítems quedan en su lugar, repetidos `times` veces, así
 * la vuelta teje lo mismo (`countRound` y `expandRound` no cambian).
 */
export function unwrapGroup(pattern: WrittenPattern, partId: string, roundIndex: number, path: ItemPath): WrittenPattern {
  if (!isPath(path)) return pattern;
  const idx = path[path.length - 1] as number;
  return withItems(pattern, partId, roundIndex, (items) =>
    editList(items, path.slice(0, -1), (list) => {
      const g = list[idx];
      if (!isObj(g) || g.type !== "group" || !Array.isArray(g.items) || !isInt(g.times) || g.times < 1) return null;
      if (g.times * g.items.length > LIMITS.maxItemCount * 10) return null; // acota la copia antes de validar
      const inner: Item[] = [];
      for (let t = 0; t < g.times; t++) inner.push(...g.items);
      const out = list.slice();
      out.splice(idx, 1, ...inner);
      return out;
    }),
  );
}

// ------------------------------------------------------------ Posición

/** Copia una ubicación con solo las claves del esquema. */
function copyPlacement(p: Placement): Placement | null {
  if (!isObj(p) || !isObj(p.target) || !isObj(p.at)) return null;
  const ref = (r: PartRef): PartRef => ({ part: r.part, copy: r.copy });
  const vec = (v: unknown) => (Array.isArray(v) ? (v.slice(0, 3) as Placement["at"]["rotationDeg"]) : (v as Placement["at"]["rotationDeg"]));
  const target = ref(p.target);
  if (p.at.type === "free") return { target, at: { type: "free", positionCm: vec(p.at.positionCm), rotationDeg: vec(p.at.rotationDeg) } };
  if (p.at.type === "surface" && isObj(p.at.host)) {
    const at: Placement["at"] = { type: "surface", host: ref(p.at.host), round: p.at.round, stitch: p.at.stitch, attach: p.at.attach, rotationDeg: vec(p.at.rotationDeg) };
    if (p.at.offsetCm !== undefined) at.offsetCm = p.at.offsetCm;
    return { target, at };
  }
  return null;
}

/**
 * Ubica una copia (reemplaza su ubicación anterior, si tenía). Devuelve la entrada si la
 * ubicación deja un error estructural en `layout` (parte o copia inexistente, ciclo,
 * cadena de más de `LIMITS.maxLayoutDepth`, números fuera de rango).
 */
export function setPlacement(pattern: WrittenPattern, placement: Placement): WrittenPattern {
  if (!isWritten(pattern)) return pattern;
  const p = copyPlacement(placement);
  if (!p) return pattern;
  const prev = Array.isArray(pattern.layout?.placements) ? pattern.layout.placements : [];
  const i = prev.findIndex((pl) => isObj(pl) && isObj(pl.target) && sameRef(pl.target, p.target));
  if (i >= 0 && sameJson(prev[i], p)) return pattern;
  if (i < 0 && prev.length >= LIMITS.maxPlacements) return pattern;
  const placements = prev.slice();
  if (i >= 0) placements[i] = p;
  else placements.push(p);
  return commitDoc(pattern, { ...pattern, layout: { ...pattern.layout, placements } });
}

/** Quita la ubicación de la copia (pasa a ubicarse sola). Las piezas cosidas a ella siguen cosidas. */
export function clearPlacement(pattern: WrittenPattern, ref: PartRef): WrittenPattern {
  if (!isWritten(pattern) || !isObj(ref)) return pattern;
  const prev = pattern.layout?.placements;
  if (!Array.isArray(prev)) return pattern;
  const placements = prev.filter((pl) => !(isObj(pl) && isObj(pl.target) && sameRef(pl.target, ref)));
  if (placements.length === prev.length) return pattern;
  const next: WrittenPattern = { ...pattern };
  if (placements.length === 0) delete next.layout;
  else next.layout = { ...pattern.layout, placements };
  return next;
}

// --------------------------------------------------------------- Armado

/**
 * Pasos de armado: cada uno se normaliza como una nota (`\r\n` → `\n`, sin espacios al
 * final de cada línea ni al inicio o al final del paso) y los vacíos se quitan. Sin
 * pasos, quita `assembly`. Hasta `LIMITS.maxNotes` pasos de `LIMITS.maxNoteLength`.
 */
export function setAssembly(pattern: WrittenPattern, steps: readonly string[]): WrittenPattern {
  if (!isWritten(pattern) || !Array.isArray(steps) || !steps.every((s) => typeof s === "string")) return pattern;
  const clean = steps
    .map((s) =>
      s
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .trim(),
    )
    .filter((s) => s !== "");
  const next: WrittenPattern = { ...pattern };
  if (clean.length === 0) delete next.assembly;
  else next.assembly = clean;
  if (sameJson(next.assembly, pattern.assembly)) return pattern;
  return commitDoc(pattern, next);
}

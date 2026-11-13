import type { ChartPointer } from "@loopitalab/follow";
import type { ProjectFailure, WorkedIn } from "./messages.ts";
import type { SaveProgressResult } from "./types.ts";

/*
 * Cola local del avance del modo tejiendo (ADR 0009 §4, decisión 8 de la fase 3: solo cortes con la página abierta).
 *
 *  - La interfaz es optimista: `set(pointer)` guarda el puntero deseado al instante en `localStorage`
 *    (`loopitalab:<uid>:avance:<projectId>`) y lo envía `debounceMs` después del último toque (800 ms, bajo el tope de
 *    2 s). Una sola escritura en vuelo por proyecto; si el puntero cambió mientras tanto, se envía el último.
 *  - Cada respuesta trae el `updatedAt` nuevo: un mismo dispositivo nunca entra en conflicto consigo mismo.
 *  - Sin red (la acción lanza) o con un fallo del servidor, reintenta con espera creciente y de inmediato con
 *    `retryNow()` (evento `online`). El estado se ve siempre (`QueueState`).
 *  - CONFLICT: si el servidor tiene el mismo puntero que el deseado, se adopta su `updatedAt` en silencio; si no, se
 *    expone `conflict` y la pantalla pregunta con cuál seguir (`keepMine` reintenta con el `updatedAt` del servidor,
 *    acción explícita; `takeTheirs` adopta el puntero del servidor). Nunca se pisa en silencio.
 *  - VERSION_CHANGED: el puntero era de otro plan; la pantalla se recarga.
 *  - Al abrir la pantalla, una entrada local vigente de esta cuenta, proyecto y versión (un corte anterior que no
 *    alcanzó a enviarse) se adopta y se envía con su `updatedAt` base; si el servidor cambió, es un conflicto normal.
 *
 * Seguridad (como el respaldo del estudio, ALTO-1 y MEDIO-1): la clave y el contenido llevan la dueña; se descarta
 * lo de otra cuenta, lo dañado, lo caducado (14 días) y lo que pasa de un tamaño máximo; se borra al confirmarse la
 * escritura, al cerrar sesión y al eliminar la cuenta (`clearAllProgressQueues`). Sin dependencias del DOM: todo
 * (reloj, temporizadores, red, almacenamiento) se inyecta, así se prueba con Vitest.
 */

export const PROGRESS_DEBOUNCE_MS = 800;
export const PROGRESS_RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000, 8_000, 16_000, 30_000];
export const PROGRESS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Tope del texto guardado: dos enteros, ids y fechas caben de sobra en 1 KB. */
export const MAX_PROGRESS_ENTRY_CHARS = 1024;

const NS = "loopitalab:";
const OWNER_RE = /^[A-Za-z0-9-]{1,64}$/;
const KEY_RE = /^loopitalab:([^:]+):avance:(.+)$/;

export const progressKey = (ownerId: string, projectId: string) => `${NS}${ownerId}:avance:${projectId}`;
export const isProgressKey = (key: string): boolean => KEY_RE.test(key);

export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface EnumerableProgressStorage extends ProgressStorage {
  readonly length: number;
  key(index: number): string | null;
}

export interface StoredProgress {
  v: 1;
  ownerId: string;
  projectId: string;
  versionId: string;
  pointer: ChartPointer;
  /** `updated_at` del avance sobre el que se hizo el cambio (`null`: el proyecto no tenía fila). */
  baseUpdatedAt: string | null;
  savedAt: number;
}

/** Tope de `rowsDone` y `stitchesDone` guardados (T17, B2): las mismas cotas generales de la base (`progress-codec.ts`). */
export const MAX_STORED_POINTER = 100_000;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_STORED_POINTER;
/** `updated_at` como lo devuelve PostgREST (misma forma que `isTimestamp` del servidor). */
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Valida una entrada de `ownerId` sin mirar proyecto ni versión. `null` si no sirve. */
function parseEntry(raw: string | null, ownerId: string, now: number): StoredProgress | null {
  if (!raw || raw.length > MAX_PROGRESS_ENTRY_CHARS) return null;
  try {
    const e = JSON.parse(raw) as Partial<StoredProgress> | null;
    if (!e || typeof e !== "object" || e.v !== 1 || e.ownerId !== ownerId) return null;
    if (typeof e.projectId !== "string" || !ID_RE.test(e.projectId) || typeof e.versionId !== "string" || !ID_RE.test(e.versionId)) return null;
    if (typeof e.savedAt !== "number" || !Number.isFinite(e.savedAt) || now - e.savedAt > PROGRESS_TTL_MS || e.savedAt - now > PROGRESS_TTL_MS) return null;
    if (!(e.baseUpdatedAt === null || (typeof e.baseUpdatedAt === "string" && e.baseUpdatedAt.length <= 40 && TIMESTAMP_RE.test(e.baseUpdatedAt)))) return null;
    const p = e.pointer;
    if (!p || typeof p !== "object" || !isInt(p.rowsDone) || !isInt(p.stitchesDone)) return null;
    return { v: 1, ownerId, projectId: e.projectId, versionId: e.versionId, pointer: { rowsDone: p.rowsDone, stitchesDone: p.stitchesDone }, baseUpdatedAt: e.baseUpdatedAt, savedAt: e.savedAt };
  } catch {
    return null;
  }
}

/** Interpreta una entrada guardada; `null` si no sirve (grande, dañada, de otra cuenta o versión, caducada, fuera de cotas). */
export function parseStoredProgress(raw: string | null, ownerId: string, projectId: string, versionId: string, now: number): StoredProgress | null {
  const e = parseEntry(raw, ownerId, now);
  return e && e.projectId === projectId && e.versionId === versionId ? e : null;
}

function progressKeys(storage: EnumerableProgressStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && isProgressKey(k)) keys.push(k);
  }
  return keys;
}

/**
 * Limpieza al abrir "Tejiendo" o el estudio (T17, B1; como `pruneBackups`): borra las entradas de avance de otra cuenta,
 * las caducadas, las de más de 1 KB, las dañadas y las cuya clave no coincide con su contenido. Conserva solo las
 * vigentes de `ownerId`. Devuelve cuántas borró. Nunca lanza.
 */
export function pruneProgressQueues(storage: EnumerableProgressStorage | null | undefined, ownerId: string, now: number = Date.now()): number {
  if (!storage) return 0;
  try {
    const remove: string[] = [];
    for (const k of progressKeys(storage)) {
      const m = KEY_RE.exec(k);
      const owner = m?.[1];
      const e = owner === ownerId && OWNER_RE.test(ownerId) ? parseEntry(storage.getItem(k), ownerId, now) : null;
      if (!e || e.projectId !== m?.[2]) remove.push(k);
    }
    for (const k of remove) storage.removeItem(k);
    return remove.length;
  } catch {
    return 0;
  }
}

/** Quita la entrada de avance de un proyecto, de cualquier cuenta (tras borrarlo; T17, B1). Nunca lanza. */
export function clearProjectProgress(storage: EnumerableProgressStorage | null | undefined, projectId: string): number {
  if (!storage) return 0;
  try {
    const keys = progressKeys(storage).filter((k) => KEY_RE.exec(k)?.[2] === projectId);
    for (const k of keys) storage.removeItem(k);
    return keys.length;
  } catch {
    return 0;
  }
}

/** `localStorage` del navegador como almacenamiento enumerable, o `null`. Nunca lanza. */
export function browserProgressStorage(): EnumerableProgressStorage | null {
  try {
    return typeof window === "undefined" ? null : (window.localStorage as EnumerableProgressStorage);
  } catch {
    return null;
  }
}

/** Borra todas las entradas de avance pendientes, de cualquier cuenta (cerrar sesión, eliminar la cuenta). Nunca lanza. */
export function clearAllProgressQueues(storage: EnumerableProgressStorage | null | undefined): number {
  if (!storage) return 0;
  try {
    const keys = progressKeys(storage);
    for (const k of keys) storage.removeItem(k);
    return keys.length;
  } catch {
    return 0;
  }
}

/** `clearAllProgressQueues` sobre el `localStorage` del navegador. Nunca lanza. */
export function clearBrowserProgressQueues(): number {
  try {
    return typeof window === "undefined" ? 0 : clearAllProgressQueues(window.localStorage as EnumerableProgressStorage);
  } catch {
    return 0;
  }
}

export type QueueState =
  | { kind: "saved" }
  | { kind: "pending" }
  | { kind: "saving" }
  /** No se pudo llegar al servidor (`network`) o respondió con un fallo transitorio (`server`); reintenta solo. */
  | { kind: "offline"; attempt: number; retryAt: number; reason: "network" | "server" }
  /** El servidor tiene otro puntero. La pantalla pregunta con cuál seguir. */
  | { kind: "conflict"; theirs: ChartPointer; theirsAt: string | null; yours: ChartPointer; workedIn?: WorkedIn; totalRows?: number; message: string }
  /** La versión fijada cambió en otro dispositivo: hay que recargar. */
  | { kind: "version-changed"; message: string }
  /** Falla que reintentar no arregla (sesión vencida, proyecto borrado…). */
  | { kind: "failed"; code: ProjectFailure["code"]; message: string };

export interface ProgressQueueDeps {
  projectId: string;
  ownerId: string;
  versionId: string;
  initialPointer: ChartPointer;
  initialUpdatedAt: string | null;
  save(projectId: string, versionId: string, pointer: ChartPointer, expectedUpdatedAt: string | null): Promise<SaveProgressResult>;
  storage?: ProgressStorage | null;
  now?: () => number;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
  /** Acota un puntero al plan de la pantalla (`clampPointer`) al adoptar uno local o del servidor (T17, B2). */
  clamp?: (p: ChartPointer) => ChartPointer;
}

type Listener = () => void;

const samePointer = (a: ChartPointer, b: ChartPointer) => a.rowsDone === b.rowsDone && a.stitchesDone === b.stitchesDone;
const RETRYABLE: ReadonlySet<ProjectFailure["code"]> = new Set(["DATABASE"]);
/** Fallas que dicen que lo local no sirve (T17, B2): se descarta la entrada y se vuelve al puntero del servidor. */
const DISCARD: ReadonlySet<ProjectFailure["code"]> = new Set(["INVALID_REQUEST", "NOT_FOUND", "NO_DESIGN"]);

export class ProgressQueue {
  readonly #d: Required<Pick<ProgressQueueDeps, "now" | "setTimer" | "clearTimer" | "debounceMs" | "retryDelaysMs">> & ProgressQueueDeps;
  #desired: ChartPointer;
  #lastSaved: ChartPointer;
  #base: string | null;
  #state: QueueState = { kind: "saved" };
  #inFlight = false;
  #again = false;
  #timer: unknown = null;
  #retryTimer: unknown = null;
  #attempt = 0;
  #stopped = false;
  #listeners = new Set<Listener>();
  /** Avisa cuando el puntero cambia por decisión de la cola (entrada local adoptada, "seguir con la otra"). */
  onPointer: ((p: ChartPointer) => void) | null = null;

  constructor(deps: ProgressQueueDeps) {
    this.#d = {
      now: () => Date.now(),
      setTimer: (cb, ms) => setTimeout(cb, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      debounceMs: PROGRESS_DEBOUNCE_MS,
      retryDelaysMs: PROGRESS_RETRY_DELAYS_MS,
      ...deps,
    };
    this.#desired = { ...deps.initialPointer };
    this.#lastSaved = { ...deps.initialPointer };
    this.#base = deps.initialUpdatedAt;
  }

  // ------------------------------------------------------------ lectura

  subscribe = (l: Listener): (() => void) => {
    this.#listeners.add(l);
    return () => {
      this.#listeners.delete(l);
    };
  };
  getState = (): QueueState => this.#state;
  get pointer(): ChartPointer {
    return this.#desired;
  }
  get baseUpdatedAt(): string | null {
    return this.#base;
  }
  /** Hay un cambio que todavía no confirmó el servidor. */
  get hasPending(): boolean {
    return !samePointer(this.#desired, this.#lastSaved) || this.#inFlight;
  }

  // ------------------------------------------------------------ ciclo de vida

  /**
   * Adopta una entrada local vigente (un corte anterior) y la envía. Devuelve `true` si adoptó un puntero distinto
   * del inicial (la pantalla debe mostrarlo).
   */
  start(): boolean {
    this.#stopped = false;
    const read = this.#read();
    if (!read) return false;
    const stored = { ...read, pointer: this.#clamp(read.pointer) };
    this.#desired = stored.pointer;
    this.#base = stored.baseUpdatedAt;
    const changed = !samePointer(stored.pointer, this.#lastSaved);
    if (changed) {
      this.#set({ kind: "pending" });
      this.#schedule();
      this.onPointer?.(stored.pointer);
    } else {
      this.#clearStored();
    }
    return changed;
  }

  stop(): void {
    this.#stopped = true;
    this.#cancelTimers();
  }

  // ------------------------------------------------------------ cambios

  /** Nuevo puntero deseado: se guarda al instante y se envía tras la pausa. */
  set(pointer: ChartPointer): void {
    const next = { rowsDone: pointer.rowsDone, stitchesDone: pointer.stitchesDone };
    if (samePointer(next, this.#desired)) return;
    this.#desired = next;
    // Proyecto borrado, sin diseño o pedido inválido: no se vuelve a guardar nada en este dispositivo (T17, B2).
    if (this.#state.kind === "failed" && DISCARD.has(this.#state.code)) return;
    this.#write();
    const k = this.#state.kind;
    if (k === "conflict" || k === "version-changed" || k === "failed") return; // la pantalla resuelve primero
    if (k !== "offline") this.#set({ kind: "pending" });
    this.#schedule();
  }

  /** Envía ahora lo pendiente (al ocultarse la página, antes de cambiar de versión). */
  flushNow(): Promise<void> {
    this.#cancelTimers();
    return this.#flush();
  }

  /** Volvió la conexión (o la usuaria pidió reintentar). */
  retryNow(): Promise<void> {
    if (this.#state.kind !== "offline" && this.#state.kind !== "pending") return Promise.resolve();
    this.#attempt = 0;
    return this.flushNow();
  }

  /** Conflicto: seguir con la posición de aquí (reintento explícito con el `updatedAt` del servidor). */
  keepMine(): Promise<void> {
    if (this.#state.kind !== "conflict") return Promise.resolve();
    this.#base = this.#state.theirsAt;
    this.#set({ kind: "pending" });
    return this.flushNow();
  }

  /** Conflicto: seguir con la posición del otro dispositivo. */
  takeTheirs(): void {
    if (this.#state.kind !== "conflict") return;
    const { theirsAt } = this.#state;
    const theirs = this.#clamp(this.#state.theirs);
    this.#desired = { ...theirs };
    this.#lastSaved = { ...theirs };
    this.#base = theirsAt;
    this.#clearStored();
    this.#set({ kind: "saved" });
    this.onPointer?.(this.#desired);
  }

  /** El servidor avanzó mientras la pantalla estaba oculta y no había nada pendiente: se adopta. */
  adoptServer(pointer: ChartPointer, updatedAt: string | null): boolean {
    if (this.hasPending || this.#state.kind !== "saved") return false;
    this.#base = updatedAt;
    const p = this.#clamp(pointer);
    if (samePointer(p, this.#desired)) return false;
    this.#desired = { ...p };
    this.#lastSaved = { ...p };
    this.onPointer?.(this.#desired);
    return true;
  }

  // ------------------------------------------------------------ interno

  #clamp(p: ChartPointer): ChartPointer {
    const q = this.#d.clamp ? this.#d.clamp(p) : p;
    return { rowsDone: q.rowsDone, stitchesDone: q.stitchesDone };
  }

  #set(s: QueueState): void {
    this.#state = s;
    for (const l of this.#listeners) l();
  }

  #schedule(): void {
    if (this.#stopped) return;
    if (this.#timer !== null) this.#d.clearTimer(this.#timer);
    this.#timer = this.#d.setTimer(() => {
      this.#timer = null;
      void this.#flush();
    }, this.#d.debounceMs);
  }

  #cancelTimers(): void {
    if (this.#timer !== null) this.#d.clearTimer(this.#timer);
    if (this.#retryTimer !== null) this.#d.clearTimer(this.#retryTimer);
    this.#timer = null;
    this.#retryTimer = null;
  }

  async #flush(): Promise<void> {
    if (this.#stopped) return;
    if (this.#inFlight) {
      this.#again = true;
      return;
    }
    if (samePointer(this.#desired, this.#lastSaved)) {
      this.#clearStored();
      if (this.#state.kind === "pending" || this.#state.kind === "offline") this.#set({ kind: "saved" });
      return;
    }
    const sent = this.#desired;
    const base = this.#base;
    this.#inFlight = true;
    this.#again = false;
    this.#set({ kind: "saving" });
    let result: SaveProgressResult | null = null;
    try {
      result = await this.#d.save(this.#d.projectId, this.#d.versionId, sent, base);
    } catch {
      result = null; // sin red (la Server Action no se pudo llamar)
    }
    this.#inFlight = false;
    if (this.#stopped) return;

    if (result === null) return this.#retryLater("network");
    if (result.ok) {
      this.#attempt = 0;
      this.#base = result.updatedAt;
      this.#lastSaved = sent;
      if (this.#again || !samePointer(this.#desired, sent)) return this.#flush();
      this.#clearStored();
      this.#set({ kind: "saved" });
      return;
    }
    const f = result;
    if (f.code === "CONFLICT" && f.conflictOn === "progress" && f.currentPointer) {
      if (samePointer(f.currentPointer, this.#desired)) {
        // No es un conflicto real: el servidor ya tiene este puntero (otro dispositivo o una escritura anterior).
        this.#base = f.currentUpdatedAt ?? null;
        this.#lastSaved = { ...this.#desired };
        this.#clearStored();
        this.#set({ kind: "saved" });
        return;
      }
      this.#set({
        kind: "conflict",
        theirs: f.currentPointer,
        theirsAt: f.currentUpdatedAt ?? null,
        yours: this.#desired,
        message: f.error,
        ...(f.workedIn ? { workedIn: f.workedIn } : {}),
        ...(typeof f.totalRows === "number" ? { totalRows: f.totalRows } : {}),
      });
      return;
    }
    if (f.code === "VERSION_CHANGED") {
      this.#set({ kind: "version-changed", message: f.error });
      return;
    }
    if (RETRYABLE.has(f.code) || f.code === "CONFLICT") return this.#retryLater("server");
    if (DISCARD.has(f.code)) {
      // Lo local no sirve (dañado, de un proyecto borrado o sin diseño): no se reintenta ni se guarda; la pantalla
      // vuelve al último puntero que confirmó el servidor.
      this.#clearStored();
      this.#desired = { ...this.#lastSaved };
      this.#again = false;
      this.onPointer?.(this.#desired);
    }
    this.#set({ kind: "failed", code: f.code, message: f.error });
  }

  #retryLater(reason: "network" | "server"): void {
    const delays = this.#d.retryDelaysMs;
    const delay = delays[Math.min(this.#attempt, delays.length - 1)] ?? 30_000;
    this.#attempt += 1;
    this.#set({ kind: "offline", attempt: this.#attempt, retryAt: this.#d.now() + delay, reason });
    if (this.#retryTimer !== null) this.#d.clearTimer(this.#retryTimer);
    this.#retryTimer = this.#d.setTimer(() => {
      this.#retryTimer = null;
      void this.#flush();
    }, delay);
  }

  #key(): string | null {
    return OWNER_RE.test(this.#d.ownerId) ? progressKey(this.#d.ownerId, this.#d.projectId) : null;
  }

  #write(): void {
    const key = this.#key();
    const s = this.#d.storage;
    if (!key || !s) return;
    const entry: StoredProgress = { v: 1, ownerId: this.#d.ownerId, projectId: this.#d.projectId, versionId: this.#d.versionId, pointer: this.#desired, baseUpdatedAt: this.#base, savedAt: this.#d.now() };
    try {
      s.setItem(key, JSON.stringify(entry));
    } catch {
      /* sin almacenamiento: la cola sigue en memoria */
    }
  }

  #read(): StoredProgress | null {
    const key = this.#key();
    const s = this.#d.storage;
    if (!key || !s) return null;
    try {
      const e = parseStoredProgress(s.getItem(key), this.#d.ownerId, this.#d.projectId, this.#d.versionId, this.#d.now());
      if (!e) s.removeItem(key);
      return e;
    } catch {
      return null;
    }
  }

  #clearStored(): void {
    const key = this.#key();
    try {
      if (key) this.#d.storage?.removeItem(key);
    } catch {
      /* nada */
    }
  }
}

import { validatePattern, type ChartPattern, type Issue, type Pattern } from "@loopitalab/pattern-core";
import type { DesignErrorCode } from "@/lib/designs/messages.ts";
import type { SaveDesignResult } from "@/lib/designs/types.ts";
import { backupKey, clearBackup, isSigningOut, isValidOwnerId, MAX_BACKUP_CHARS, MAX_PENDING_TOTAL, pendingTextOf, pendingTextSize, type BackupStorage, type LocalBackup } from "./backup.ts";
import { paintGate } from "./paint-gate.ts";
import { perfSpan } from "./perf.ts";

/*
 * Autoguardado del estudio (ADR 0006, E10; CA-F6, CA-F7).
 *
 *  - Espera `debounceMs` (1,5 s, bajo el tope de 2 s de CA-F6) tras la última edición y recién entonces valida.
 *    La validación nunca corre entre la edición y el dibujo (CA-P7): sale del camino caliente.
 *  - Envía solo si `validatePattern(doc).savable` (sin opciones). Los errores de tejido se guardan como borrador.
 *  - `savePattern(id, doc, expectedUpdatedAt)`: la concurrencia es optimista. Un CONFLICT detiene el autoguardado
 *    hasta que la usuaria elija recargar o sobrescribir; nunca se sobrescribe en silencio.
 *  - Sin conexión: reintento con espera creciente. Respaldo en localStorage solo como red ante cierre o caída.
 */

export {
  BACKUP_TTL_MS,
  backupKey,
  clearAllBackups,
  clearBackup,
  clearBrowserBackups,
  isBackupKey,
  LEGACY_BACKUP_PREFIX,
  announceSignOut,
  isSigningOut,
  MAX_BACKUP_CHARS,
  MAX_PENDING_TOTAL,
  pendingTextOf,
  pruneBackups,
  readBackup,
  type BackupStorage,
  type EnumerableStorage,
  type LocalBackup,
} from "./backup.ts";

export const AUTOSAVE_DEBOUNCE_MS = 1500;
/**
 * Espera máxima desde el primer cambio sin guardar. Con ediciones continuas el debounce se reiniciaría en cada
 * trazo y nunca guardaría; a los 10 s se guarda igual (pendiente de T8).
 */
export const AUTOSAVE_MAX_WAIT_MS = 10_000;
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000, 8_000, 16_000, 30_000];
/** Espera antes de escribir en el respaldo el texto sin leer del estudio amigurumi (no se escribe en cada tecla). */
export const PENDING_TEXT_BACKUP_MS = 400;

/**
 * Lo que el autoguardado necesita del almacén: el documento actual y el aviso de cambios. Lo cumplen el almacén del
 * colorwork (`DocumentStore`) y el del amigurumi (`WrittenStore`).
 */
export interface AutosaveStore<P extends Pattern = ChartPattern> {
  readonly doc: P;
  subscribe(listener: () => void): () => void;
}

export type SaveStatus =
  /** Todo guardado. `draft`: se guardó, pero con errores de tejido que impiden tejerlo. */
  | { kind: "saved"; draft: boolean; at: number }
  /** Hay cambios que aún no se envían (esperando el debounce). */
  | { kind: "pending" }
  | { kind: "saving" }
  /** No se pudo llegar al servidor; reintenta solo. `retryAt` es una marca de tiempo. */
  | { kind: "offline"; attempt: number; retryAt: number; reason: "network" | "server" }
  /** Otra pestaña o dispositivo guardó antes. El autoguardado está detenido. */
  | { kind: "conflict"; currentUpdatedAt: string }
  /** Errores estructurales: no se envía. `issues` son solo los errores. */
  | { kind: "blocked"; issues: Issue[] }
  /** Falla que reintentar no arregla (sesión vencida, tamaño, cuota…). */
  | { kind: "failed"; code: DesignErrorCode; message: string };

export interface AutosaveDeps<P extends Pattern = ChartPattern> {
  patternId: string;
  /** `user.id` de la dueña: va en la clave y en el contenido del respaldo local. */
  ownerId: string;
  /** `updated_at` que recibió la interfaz al abrir. */
  initialUpdatedAt: string;
  /** Server Action `savePattern`. */
  save: (id: string, document: unknown, expectedUpdatedAt: string) => Promise<SaveDesignResult>;
  validate?: (doc: P) => { savable: boolean; issues: Issue[] };
  storage?: BackupStorage | null;
  debounceMs?: number;
  maxWaitMs?: number;
  retryDelaysMs?: readonly number[];
  now?: () => number;
  /**
   * Corre el envío (que valida) cuando no hay una edición esperando su frame (CA-P7). Por defecto, la compuerta del
   * estudio (`paintGate`), que lo ejecuta de inmediato si no hay edición en vuelo.
   */
  afterPaint?: (fn: () => void) => void;
}

type Listener = () => void;

export class Autosave<P extends Pattern = ChartPattern> {
  #deps: Required<Pick<AutosaveDeps<P>, "debounceMs" | "maxWaitMs" | "retryDelaysMs" | "now">> & AutosaveDeps<P>;
  /** Desde cuándo hay cambios sin enviar (para `maxWaitMs`); null si no hay. */
  #pendingSince: number | null = null;
  /** Mientras la usuaria no decide sobre un respaldo ofrecido, no se escribe ni se borra el respaldo (T8, c). */
  #backupHeld = false;
  /** Texto sin leer por parte (estudio amigurumi): va en el respaldo, nunca en el documento. */
  #pendingText: Record<string, string> | null = null;
  #pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /** El texto sin leer no cupo en el respaldo y se dejó fuera de él (T20-B6): el estudio lo avisa. */
  #pendingDropped = false;
  #noticeListeners = new Set<Listener>();
  #store: AutosaveStore<P>;
  #status: SaveStatus;
  #updatedAt: string;
  /** Documento que ya está en el servidor. Se compara por referencia: deshacer hasta ahí vuelve a "guardado". */
  #savedDoc: P;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #inflight: Promise<void> | null = null;
  #attempt = 0;
  #listeners = new Set<Listener>();
  #unsubscribe: (() => void) | null = null;
  #disposed = true;

  constructor(store: AutosaveStore<P>, deps: AutosaveDeps<P>) {
    this.#store = store;
    this.#deps = { debounceMs: AUTOSAVE_DEBOUNCE_MS, maxWaitMs: AUTOSAVE_MAX_WAIT_MS, retryDelaysMs: RETRY_DELAYS_MS, now: Date.now, ...deps };
    this.#updatedAt = deps.initialUpdatedAt;
    this.#savedDoc = store.doc;
    this.#status = { kind: "saved", draft: false, at: this.#deps.now() };
  }

  /** Empieza a escuchar el almacén. Se puede llamar de nuevo tras `stop()` (React StrictMode monta dos veces). */
  start(): void {
    if (!this.#disposed) return;
    this.#disposed = false;
    this.#unsubscribe = this.#store.subscribe(() => this.#onChange());
  }

  getStatus = (): SaveStatus => this.#status;

  subscribe = (l: Listener): (() => void) => {
    this.#listeners.add(l);
    return () => {
      this.#listeners.delete(l);
    };
  };

  /** ¿El texto sin leer quedó fuera del respaldo por no caber? (T20-B6) */
  getPendingDropped = (): boolean => this.#pendingDropped;

  subscribeNotice = (l: Listener): (() => void) => {
    this.#noticeListeners.add(l);
    return () => {
      this.#noticeListeners.delete(l);
    };
  };

  /** `updated_at` conocido (para la barra de estado y las pruebas). */
  get updatedAt(): string {
    return this.#updatedAt;
  }

  /** Marca el estado inicial como borrador (el diseño se abrió con errores de tejido). */
  markOpenedAsDraft(draft: boolean): void {
    if (this.#status.kind === "saved") this.#set({ ...this.#status, draft });
  }

  /** ¿Hay ediciones que el servidor aún no tiene? */
  get hasUnsaved(): boolean {
    return this.#store.doc !== this.#savedDoc;
  }

  /** Reintenta ya (por ejemplo, al volver la conexión). No hace nada si hay un conflicto abierto. */
  retryNow(): void {
    if (this.#disposed || this.#status.kind === "conflict" || this.#status.kind === "saving") return;
    if (!this.hasUnsaved) return;
    this.#clearTimer();
    void this.#flush();
  }

  /**
   * Guarda ahora lo que haya (para "Guardar versión") y espera el resultado.
   * Devuelve true si al terminar el servidor tiene la versión actual del documento.
   */
  async saveNow(): Promise<boolean> {
    if (this.#disposed) return false;
    this.#clearTimer();
    if (this.#inflight) await this.#inflight;
    if (this.hasUnsaved && this.#status.kind !== "conflict") await this.#flush();
    return !this.hasUnsaved && (this.#status.kind === "saved");
  }

  /**
   * Decisión explícita de la usuaria tras un conflicto: guardar encima de la versión del servidor.
   * Vuelve a llamar con el `updated_at` actual que informó el servidor.
   */
  async overwrite(): Promise<void> {
    if (this.#status.kind !== "conflict") return;
    this.#updatedAt = this.#status.currentUpdatedAt;
    this.#clearTimer();
    await this.#flush();
  }

  /**
   * Congela el respaldo local: no se escribe ni se borra. Se usa mientras el banner de recuperación espera una decisión,
   * para que editar no pise el respaldo ofrecido ni un guardado lo borre sin aviso.
   */
  holdBackup(held: boolean): void {
    this.#backupHeld = held;
  }

  /** Quita el respaldo local (al recargar la versión del servidor o al aceptar la recuperación). */
  discardBackup(): void {
    clearBackup(this.#deps.storage, this.#deps.ownerId, this.#deps.patternId);
  }

  /** Escribe el respaldo ahora (síncrono). Se llama al cerrar o ocultar la pestaña. */
  writeBackupNow(): void {
    this.#clearPendingTimer();
    if (this.hasUnsaved || this.#pendingText) this.#writeBackup(this.#store.doc);
  }

  /** Texto sin leer que el respaldo conserva (para las pruebas). */
  get pendingText(): Readonly<Record<string, string>> | null {
    return this.#pendingText;
  }

  /**
   * Texto de las partes que no se pudo leer (CA4-E9). No es parte del documento ni cuenta como cambio sin guardar:
   * solo se conserva en el respaldo local, que se escribe poco después (no en cada tecla). `null` o `{}` lo quitan.
   */
  setPendingText(map: Readonly<Record<string, string>> | null): void {
    // Sin el tope total: en memoria se conserva todo; `#writeBackup` decide si cabe en el respaldo (T20-B6).
    const next = map && Object.keys(map).length > 0 ? pendingTextOf(map, { total: false }) : null;
    if (JSON.stringify(next) === JSON.stringify(this.#pendingText)) return;
    this.#pendingText = next;
    if (this.#disposed) return;
    this.#clearPendingTimer();
    this.#pendingTimer = setTimeout(() => {
      this.#pendingTimer = null;
      if (this.#pendingText || this.hasUnsaved) this.#writeBackup(this.#store.doc);
      else if (!this.#backupHeld) clearBackup(this.#deps.storage, this.#deps.ownerId, this.#deps.patternId);
    }, PENDING_TEXT_BACKUP_MS);
  }

  /** Deja de escuchar y cancela los temporizadores. Un envío en curso termina, pero ya no actualiza el estado. */
  stop(): void {
    this.#disposed = true;
    this.#clearTimer();
    this.#clearPendingTimer();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  // ------------------------------------------------------------------ interno

  #onChange(): void {
    if (this.#disposed) return;
    if (!this.hasUnsaved) {
      // Deshacer hasta el punto ya guardado.
      this.#clearTimer();
      this.#pendingSince = null;
      if (this.#status.kind === "pending") this.#set({ kind: "saved", draft: false, at: this.#deps.now() });
      return;
    }
    // Un conflicto abierto detiene el envío, pero las ediciones siguen en el almacén y en el respaldo.
    if (this.#status.kind === "conflict") {
      this.#clearTimer();
      this.#timer = setTimeout(() => this.#writeBackup(this.#store.doc), this.#deps.debounceMs);
      return;
    }
    this.#clearTimer();
    // Se conserva "sin conexión" (más informativo); durante un envío en curso se conserva "guardando".
    if (this.#status.kind === "saved" || this.#status.kind === "blocked" || this.#status.kind === "failed") this.#set({ kind: "pending" });
    const now = this.#deps.now();
    this.#pendingSince ??= now;
    // Debounce, pero sin pasar de `maxWaitMs` desde el primer cambio sin guardar.
    const delay = Math.max(0, Math.min(this.#deps.debounceMs, this.#pendingSince + this.#deps.maxWaitMs - now));
    this.#timer = setTimeout(() => {
      this.#timer = null;
      (this.#deps.afterPaint ?? paintGate.run.bind(paintGate))(() => void this.#flush());
    }, delay);
  }

  #flush(): Promise<void> {
    if (this.#inflight) return this.#inflight;
    const run = this.#send().finally(() => {
      this.#inflight = null;
    });
    this.#inflight = run;
    return run;
  }

  async #send(): Promise<void> {
    if (this.#disposed) return;
    const doc = this.#store.doc;
    if (doc === this.#savedDoc) {
      this.#pendingSince = null;
      return;
    }
    this.#pendingSince = null; // lo que se edite durante el envío empieza una espera nueva

    // Validación diferida: corre ahora, no entre la edición y el dibujo (CA-P7).
    const result = perfSpan("validate:autosave", () => (this.#deps.validate ?? validatePattern)(doc));
    this.#writeBackup(doc);
    if (!result.savable) {
      this.#set({ kind: "blocked", issues: result.issues.filter((i) => i.severity === "error") });
      return;
    }

    this.#set({ kind: "saving" });
    let outcome: SaveDesignResult;
    try {
      outcome = await this.#deps.save(this.#deps.patternId, doc, this.#updatedAt);
    } catch {
      // La Server Action no respondió (sin red, servidor caído): se reintenta.
      this.#scheduleRetry("network");
      return;
    }
    if (this.#disposed) return;

    if (outcome.ok) {
      this.#updatedAt = outcome.updatedAt;
      this.#savedDoc = doc;
      this.#attempt = 0;
      if (this.#store.doc !== doc) {
        // Hubo ediciones mientras se guardaba: otra vuelta.
        this.#clearTimer();
        this.#set({ kind: "pending" });
        this.#timer = setTimeout(() => {
          this.#timer = null;
          void this.#flush();
        }, this.#deps.debounceMs);
        return;
      }
      if (!this.#backupHeld) {
        // El texto sin leer sigue fuera del documento: el respaldo queda solo con él (y el documento ya guardado).
        if (this.#pendingText) this.#writeBackup(doc);
        else clearBackup(this.#deps.storage, this.#deps.ownerId, this.#deps.patternId);
      }
      this.#set({ kind: "saved", draft: outcome.draft, at: this.#deps.now() });
      return;
    }

    switch (outcome.code) {
      case "CONFLICT":
        this.#attempt = 0;
        this.#set({ kind: "conflict", currentUpdatedAt: outcome.currentUpdatedAt ?? this.#updatedAt });
        return;
      case "DATABASE":
        this.#scheduleRetry("server");
        return;
      case "UNAUTHENTICATED":
        // La sesión venció: el respaldo (con la clave de esta dueña) queda para la próxima vez que entre.
        this.#writeBackup(doc);
        this.#set({ kind: "failed", code: outcome.code, message: outcome.error });
        return;
      case "NOT_SAVABLE":
        this.#set({ kind: "blocked", issues: (outcome.issues ?? []).filter((i) => i.severity === "error") });
        return;
      default:
        this.#set({ kind: "failed", code: outcome.code, message: outcome.error });
    }
  }

  #scheduleRetry(reason: "network" | "server"): void {
    this.#attempt += 1;
    const delays = this.#deps.retryDelaysMs;
    const delay = delays[Math.min(this.#attempt - 1, delays.length - 1)] ?? 30_000;
    this.#set({ kind: "offline", attempt: this.#attempt, retryAt: this.#deps.now() + delay, reason });
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      (this.#deps.afterPaint ?? paintGate.run.bind(paintGate))(() => void this.#flush());
    }, delay);
  }

  #writeBackup(doc: P): void {
    const storage = this.#deps.storage;
    if (!storage || this.#backupHeld) return;
    const { ownerId, patternId } = this.#deps;
    if (!isValidOwnerId(ownerId)) return; // sin dueña conocida no se respalda
    if (isSigningOut()) return; // T20-M2: cerrando sesión, nada se respalda
    const backup: LocalBackup = { v: 2, ownerId, baseUpdatedAt: this.#updatedAt, savedAt: this.#deps.now(), document: doc };
    // T20-B6: el texto sin leer tiene tope propio; si no cabe se quita primero él y se conserva el documento.
    const pending = this.#pendingText;
    const pendingFits = pending !== null && pendingTextSize(pending) <= MAX_PENDING_TOTAL;
    if (pending && pendingFits) backup.pendingText = pending;
    try {
      let text = JSON.stringify(backup);
      let dropped = pending !== null && !pendingFits;
      if (text.length > MAX_BACKUP_CHARS && backup.pendingText) {
        delete backup.pendingText;
        text = JSON.stringify(backup);
        dropped = true;
      }
      this.#setPendingDropped(dropped);
      // Solo si ni el documento solo cabe (no debería pasar: el servidor lo rechaza antes) se quita el respaldo: uno que
      // no se podría leer de vuelta no se escribe, y no se deja uno viejo que lo contradiga.
      if (text.length > MAX_BACKUP_CHARS) storage.removeItem(backupKey(ownerId, patternId));
      else storage.setItem(backupKey(ownerId, patternId), text);
    } catch {
      /* cuota llena o modo privado: el respaldo es solo una red de seguridad */
    }
  }

  #setPendingDropped(v: boolean): void {
    if (this.#pendingDropped === v) return;
    this.#pendingDropped = v;
    for (const l of [...this.#noticeListeners]) l();
  }

  #clearPendingTimer(): void {
    if (this.#pendingTimer !== null) clearTimeout(this.#pendingTimer);
    this.#pendingTimer = null;
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #set(status: SaveStatus): void {
    this.#status = status;
    for (const l of [...this.#listeners]) l();
  }
}

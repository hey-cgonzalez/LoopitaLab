import { validatePattern, type ChartPattern, type Issue } from "@loopitalab/pattern-core";
import type { DesignErrorCode } from "@/lib/designs/messages.ts";
import type { SaveDesignResult } from "@/lib/designs/types.ts";
import type { DocumentStore } from "./store.ts";

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

export const AUTOSAVE_DEBOUNCE_MS = 1500;
export const RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000, 8_000, 16_000, 30_000];

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

export interface BackupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AutosaveDeps {
  patternId: string;
  /** `updated_at` que recibió la interfaz al abrir. */
  initialUpdatedAt: string;
  /** Server Action `savePattern`. */
  save: (id: string, document: unknown, expectedUpdatedAt: string) => Promise<SaveDesignResult>;
  validate?: (doc: ChartPattern) => { savable: boolean; issues: Issue[] };
  storage?: BackupStorage | null;
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
  now?: () => number;
}

export interface LocalBackup {
  v: 1;
  /** `updated_at` del servidor sobre el que se hizo la edición. */
  baseUpdatedAt: string;
  savedAt: number;
  document: unknown;
}

export const backupKey = (id: string) => `loopitalab:diseno:${id}`;

/** Lee el respaldo local sin lanzar. El llamador debe migrar y validar `document` antes de usarlo. */
export function readBackup(storage: BackupStorage | null | undefined, id: string): LocalBackup | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(backupKey(id));
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<LocalBackup> | null;
    if (!b || b.v !== 1 || typeof b.baseUpdatedAt !== "string" || typeof b.savedAt !== "number" || typeof b.document !== "object" || b.document === null) return null;
    return b as LocalBackup;
  } catch {
    return null;
  }
}

export function clearBackup(storage: BackupStorage | null | undefined, id: string): void {
  try {
    storage?.removeItem(backupKey(id));
  } catch {
    /* sin acceso al almacenamiento: no es grave, es solo una red de seguridad */
  }
}

type Listener = () => void;

export class Autosave {
  #deps: Required<Pick<AutosaveDeps, "debounceMs" | "retryDelaysMs" | "now">> & AutosaveDeps;
  #store: DocumentStore;
  #status: SaveStatus;
  #updatedAt: string;
  /** Documento que ya está en el servidor. Se compara por referencia: deshacer hasta ahí vuelve a "guardado". */
  #savedDoc: ChartPattern;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #inflight: Promise<void> | null = null;
  #attempt = 0;
  #listeners = new Set<Listener>();
  #unsubscribe: (() => void) | null = null;
  #disposed = true;

  constructor(store: DocumentStore, deps: AutosaveDeps) {
    this.#store = store;
    this.#deps = { debounceMs: AUTOSAVE_DEBOUNCE_MS, retryDelaysMs: RETRY_DELAYS_MS, now: Date.now, ...deps };
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

  /** Quita el respaldo local (al recargar la versión del servidor o al aceptar la recuperación). */
  discardBackup(): void {
    clearBackup(this.#deps.storage, this.#deps.patternId);
  }

  /** Escribe el respaldo ahora (síncrono). Se llama al cerrar o ocultar la pestaña. */
  writeBackupNow(): void {
    if (this.hasUnsaved) this.#writeBackup(this.#store.doc);
  }

  /** Deja de escuchar y cancela los temporizadores. Un envío en curso termina, pero ya no actualiza el estado. */
  stop(): void {
    this.#disposed = true;
    this.#clearTimer();
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  // ------------------------------------------------------------------ interno

  #onChange(): void {
    if (this.#disposed) return;
    if (!this.hasUnsaved) {
      // Deshacer hasta el punto ya guardado.
      this.#clearTimer();
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
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#flush();
    }, this.#deps.debounceMs);
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
    if (doc === this.#savedDoc) return;

    // Validación diferida: corre ahora, no entre la edición y el dibujo (CA-P7).
    const result = (this.#deps.validate ?? validatePattern)(doc);
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
      clearBackup(this.#deps.storage, this.#deps.patternId);
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
      void this.#flush();
    }, delay);
  }

  #writeBackup(doc: ChartPattern): void {
    const storage = this.#deps.storage;
    if (!storage) return;
    const backup: LocalBackup = { v: 1, baseUpdatedAt: this.#updatedAt, savedAt: this.#deps.now(), document: doc };
    try {
      storage.setItem(backupKey(this.#deps.patternId), JSON.stringify(backup));
    } catch {
      /* cuota llena o modo privado: el respaldo es solo una red de seguridad */
    }
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

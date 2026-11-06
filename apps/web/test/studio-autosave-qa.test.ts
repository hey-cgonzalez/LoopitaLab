import { newChartPattern, type ChartPattern } from "@loopitalab/pattern-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Autosave,
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  BACKUP_TTL_MS,
  backupKey,
  clearAllBackups,
  isBackupKey,
  LEGACY_BACKUP_PREFIX,
  MAX_BACKUP_CHARS,
  pruneBackups,
  readBackup,
  type AutosaveDeps,
  type BackupStorage,
  type EnumerableStorage,
} from "@/lib/studio/autosave.ts";
import { decideRecovery } from "@/lib/studio/backup-recovery.ts";
import { DocumentStore } from "@/lib/studio/store.ts";
import type { SaveDesignResult } from "@/lib/designs/types";

/*
 * QA de T8 (fase 2): casos del autoguardado que no cubría studio-autosave.test.ts.
 * Conflicto con ediciones posteriores, recuperación de respaldo (la decisión que toma useStudioSession),
 * tope de espera (maxWait) exacto, y cierre de sesión (clearAllBackups contra respaldos reales del autoguardado).
 */

const ID = "aaaaaaaa-0000-4000-8000-0000000000a1";
const OWNER = "11111111-0000-4000-8000-0000000000a1";
const OTHER = "22222222-0000-4000-8000-0000000000b2";
const T0 = "2026-11-06T10:00:00.000000+00:00";
const T1 = "2026-11-06T10:00:05.000000+00:00";
const T2 = "2026-11-06T10:00:09.000000+00:00";
const T3 = "2026-11-06T10:01:00.000000+00:00";

function doc(): ChartPattern {
  return newChartPattern({
    id: ID,
    title: "Gorro",
    width: 4,
    height: 3,
    repeat: { x: 2, y: 1 },
    workedIn: "rounds",
    renderAs: "tube",
    direction: "bottom_up",
    yarns: [
      { id: "A", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } },
      { id: "B", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
    ],
  });
}

/** Como localStorage: `key(i)` sigue el orden de inserción y se corre al borrar. */
function localStorageLike(): EnumerableStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const ok = (updatedAt: string, draft = false): SaveDesignResult => ({ ok: true, updatedAt, draft });
const conflict = (currentUpdatedAt: string): SaveDesignResult => ({ ok: false, code: "CONFLICT", error: "conflicto", currentUpdatedAt }) as SaveDesignResult;

function setup(save: ReturnType<typeof vi.fn>, storage: BackupStorage = localStorageLike(), initial: ChartPattern = doc(), updatedAt = T0) {
  const store = new DocumentStore(initial);
  const autosave = new Autosave(store, { patternId: ID, ownerId: OWNER, initialUpdatedAt: updatedAt, save: save as unknown as AutosaveDeps["save"], storage });
  autosave.start();
  return { store, autosave, storage };
}
const paint = (store: DocumentStore, x: number, value = 1, y = 0) => store.dispatch({ type: "paint", refs: [{ x, y }], value });

/** La decisión que toma useStudioSession al montar (`decideRecovery`), con el formato del test anterior. */
function recoveryDecision(storage: BackupStorage, server: ChartPattern, serverUpdatedAt: string) {
  const d = decideRecovery(readBackup(storage, OWNER, server.id), server, serverUpdatedAt);
  return d.kind === "none" ? null : d.kind === "discard" ? ("discard" as const) : d.recovery;
}
/** Texto de un respaldo v2 de OWNER escrito ahora. */
const backupText = (document: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ v: 2, ownerId: OWNER, baseUpdatedAt: T0, savedAt: Date.now(), document, ...extra });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("QA autoguardado: conflicto con ediciones posteriores", () => {
  it("durante el conflicto las ediciones nuevas van al respaldo (con la base original), nunca al servidor", async () => {
    const save = vi.fn().mockResolvedValue(conflict(T2));
    const { store, autosave, storage } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.getStatus().kind).toBe("conflict");
    paint(store, 1);
    paint(store, 2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    const b = readBackup(storage, OWNER, ID);
    expect(b?.document).toEqual(store.doc); // incluye las ediciones posteriores al conflicto
    expect(b?.baseUpdatedAt).toBe(T0); // la base sigue siendo la que se editó, no la del otro lugar
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.hasUnsaved).toBe(true);
  });

  it("saveNow() durante un conflicto no envía y responde false", async () => {
    const save = vi.fn().mockResolvedValue(conflict(T2));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    paint(store, 1);
    await expect(autosave.saveNow()).resolves.toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("sobrescribir envía la versión más reciente (con lo editado durante el conflicto) y limpia el respaldo", async () => {
    const save = vi.fn().mockResolvedValueOnce(conflict(T2)).mockResolvedValue(ok(T3));
    const { store, autosave, storage } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    paint(store, 3, 1, 2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(readBackup(storage, OWNER, ID)).not.toBeNull();
    await autosave.overwrite();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(ID, store.doc, T2);
    expect(autosave.getStatus().kind).toBe("saved");
    expect(autosave.updatedAt).toBe(T3);
    expect(readBackup(storage, OWNER, ID)).toBeNull();
    // Y el autoguardado vuelve a funcionar normal con el updated_at nuevo.
    paint(store, 1, 1, 1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenLastCalledWith(ID, store.doc, T3);
  });

  it("si al sobrescribir hay otro conflicto, se vuelve a detener (sin bucle)", async () => {
    const save = vi.fn().mockResolvedValueOnce(conflict(T2)).mockResolvedValueOnce(conflict(T3));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    await autosave.overwrite();
    expect(autosave.getStatus()).toEqual({ kind: "conflict", currentUpdatedAt: T3 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("QA autoguardado: maxWait exacto", () => {
  it("con ediciones cada segundo, el primer envío sale justo a los 10 s del primer cambio, no antes", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store } = setup(save);
    for (let i = 0; i < 10; i++) {
      paint(store, i % 4, Math.floor(i / 4) % 2 === 0 ? 1 : 0, 1); // cada paso cambia una casilla
      await vi.advanceTimersByTimeAsync(i < 9 ? 1000 : AUTOSAVE_MAX_WAIT_MS - 9000 - 1);
    }
    expect(save).not.toHaveBeenCalled(); // 9.999 ms
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(ID, store.doc, T0);
  });

  it("tras un envío, la ráfaga siguiente cuenta su propia espera máxima desde su primer cambio", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000); // pausa larga: no debe heredar un pendingSince viejo
    paint(store, 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1); // el debounce manda: no se adelanta por el maxWait
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("deshacer hasta lo guardado reinicia la espera máxima", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(1000);
    store.undo(); // vuelve al documento del servidor
    await vi.advanceTimersByTimeAsync(8000);
    paint(store, 1);
    await vi.advanceTimersByTimeAsync(1000);
    // Si el pendingSince viejo siguiera vivo (t=0), a t=10 s ya se habría enviado antes del debounce.
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("QA autoguardado: recuperación de un respaldo (sesión siguiente)", () => {
  it("un respaldo escrito sin conexión se ofrece al reabrir, sin 'servidor más nuevo' si nadie guardó después", async () => {
    const storage = localStorageLike();
    const server = doc();
    const s1 = setup(vi.fn().mockRejectedValue(new Error("sin red")), storage, server);
    paint(s1.store, 0);
    paint(s1.store, 1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(s1.autosave.getStatus().kind).toBe("offline");
    s1.autosave.writeBackupNow(); // pagehide
    s1.autosave.stop();
    const edited = s1.store.doc;

    const r = recoveryDecision(storage, server, T0);
    expect(r).not.toBeNull();
    expect(r).not.toBe("discard");
    if (r && r !== "discard") {
      expect(r.document).toEqual(edited);
      expect(r.serverIsNewer).toBe(false);
    }
  });

  it("si otro dispositivo guardó después, se marca serverIsNewer", async () => {
    const storage = localStorageLike();
    const server = doc();
    const s1 = setup(vi.fn().mockRejectedValue(new Error("sin red")), storage, server);
    paint(s1.store, 0);
    s1.autosave.writeBackupNow();
    s1.autosave.stop();
    const r = recoveryDecision(storage, server, T2);
    expect(r && r !== "discard" && r.serverIsNewer).toBe(true);
  });

  it("tras guardar parcialmente, el respaldo de lo editado después usa la base nueva (no se marca 'más nuevo' en falso)", async () => {
    const storage = localStorageLike();
    const save = vi.fn().mockResolvedValueOnce(ok(T1)).mockRejectedValue(new Error("sin red"));
    const s1 = setup(save, storage);
    paint(s1.store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(s1.autosave.updatedAt).toBe(T1);
    const serverAfter = s1.store.doc;
    paint(s1.store, 1);
    s1.autosave.writeBackupNow();
    s1.autosave.stop();
    expect(readBackup(storage, OWNER, ID)?.baseUpdatedAt).toBe(T1);
    const r = recoveryDecision(storage, serverAfter, T1);
    expect(r && r !== "discard" && r.serverIsNewer).toBe(false);
  });

  it("un respaldo igual al servidor, de otro diseño o no guardable se descarta", () => {
    const storage = localStorageLike();
    const server = doc();
    storage.setItem(backupKey(OWNER, ID), backupText(server));
    expect(recoveryDecision(storage, server, T0)).toBe("discard");
    storage.setItem(backupKey(OWNER, ID), backupText({ ...server, id: "bbbbbbbb-0000-4000-8000-000000000002" }));
    expect(recoveryDecision(storage, server, T0)).toBe("discard");
    storage.setItem(backupKey(OWNER, ID), backupText({ ...server, chart: { ...server.chart, cells: [] } }));
    expect(recoveryDecision(storage, server, T0)).toBe("discard");
  });

  it("aceptar la recuperación es un solo paso de deshacer y el autoguardado la envía con el updated_at del servidor", async () => {
    const storage = localStorageLike();
    const server = doc();
    const s1 = setup(vi.fn().mockRejectedValue(new Error("sin red")), storage, server);
    paint(s1.store, 2, 1, 2);
    s1.autosave.writeBackupNow();
    s1.autosave.stop();
    const r = recoveryDecision(storage, server, T2);
    if (!r || r === "discard") throw new Error("debía ofrecer recuperar");

    const save = vi.fn().mockResolvedValue(ok(T3));
    const s2 = setup(save, storage, server, T2);
    s2.autosave.holdBackup(true);
    // Mientras se decide, editar y guardar no pisa el respaldo.
    paint(s2.store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(readBackup(storage, OWNER, ID)?.document).toEqual(r.document);
    // acceptRecovery
    s2.autosave.holdBackup(false);
    s2.store.replace(r.document);
    expect(s2.store.doc).toEqual(r.document);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenLastCalledWith(ID, s2.store.doc, T3); // el primer guardado (T3) dejó ese updated_at
    expect(readBackup(storage, OWNER, ID)).toBeNull();
    s2.store.undo();
    expect(s2.store.doc.chart.cells).not.toEqual(r.document.chart.cells);
  });

  it("descartar quita el respaldo", () => {
    const storage = localStorageLike();
    const s = setup(vi.fn(), storage);
    paint(s.store, 0);
    s.autosave.writeBackupNow();
    expect(readBackup(storage, OWNER, ID)).not.toBeNull();
    s.autosave.holdBackup(false);
    s.autosave.discardBackup();
    expect(readBackup(storage, OWNER, ID)).toBeNull();
  });
});

describe("QA autoguardado: cierre de sesión borra los respaldos", () => {
  it("los respaldos que escribe el autoguardado usan el prefijo que borra clearAllBackups", async () => {
    const storage = localStorageLike();
    storage.setItem("supabase.auth.token", "x");
    const s = setup(vi.fn().mockRejectedValue(new Error("sin red")), storage);
    paint(s.store, 0);
    s.autosave.writeBackupNow();
    expect(isBackupKey(backupKey(OWNER, ID))).toBe(true);
    expect(storage.data.has(backupKey(OWNER, ID))).toBe(true);
    expect(clearAllBackups(storage)).toBe(1);
    expect(readBackup(storage, OWNER, ID)).toBeNull();
    expect(storage.getItem("supabase.auth.token")).toBe("x");
  });

  it("borra todos aunque estén intercalados con otras claves (los índices se corren al borrar)", () => {
    const storage = localStorageLike();
    for (let i = 0; i < 20; i++) {
      storage.setItem(i % 2 ? `${LEGACY_BACKUP_PREFIX}${i}` : backupKey(i % 4 ? OWNER : OTHER, `${i}`), "{}");
      storage.setItem(`otra-${i}`, "1");
    }
    expect(clearAllBackups(storage)).toBe(20);
    expect([...storage.data.keys()].filter(isBackupKey)).toEqual([]);
    expect(storage.data.size).toBe(20);
  });

  it("un almacenamiento que falla al enumerar no lanza", () => {
    const broken: EnumerableStorage = {
      get length() {
        return 3;
      },
      key: () => {
        throw new Error("SecurityError");
      },
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(() => clearAllBackups(broken)).not.toThrow();
    expect(clearAllBackups(broken)).toBe(0);
    expect(clearAllBackups(undefined)).toBe(0);
  });

  it("un autoguardado detenido (al salir) no vuelve a escribir el respaldo después del borrado", async () => {
    const storage = localStorageLike();
    const s = setup(vi.fn().mockRejectedValue(new Error("sin red")), storage);
    paint(s.store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); // sin conexión: queda reintentando y respaldado
    s.autosave.stop();
    clearAllBackups(storage);
    await vi.advanceTimersByTimeAsync(120_000); // los reintentos ya no corren
    expect(storage.data.size).toBe(0);
  });
});

describe("QA autoguardado: stop() con un envío en curso", () => {
  it("el envío termina pero no cambia el estado ni borra/escribe nada después", async () => {
    let release: (r: SaveDesignResult) => void = () => undefined;
    const save = vi.fn().mockImplementation(() => new Promise<SaveDesignResult>((r) => (release = r)));
    const { store, autosave, storage } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.getStatus().kind).toBe("saving");
    autosave.stop();
    release(ok(T1));
    await vi.advanceTimersByTimeAsync(0);
    expect(autosave.getStatus().kind).toBe("saving");
    expect(readBackup(storage, OWNER, ID)).not.toBeNull(); // el respaldo previo al envío se conserva
  });
});

describe("QA autoguardado: respaldo por dueña, caducidad y tamaño (seguridad ALTO-1, MEDIO-1)", () => {
  it("la clave y el contenido llevan el uid de la dueña", async () => {
    const storage = localStorageLike();
    const s = setup(vi.fn().mockRejectedValue(new Error("sin red")), storage);
    paint(s.store, 0);
    s.autosave.writeBackupNow();
    expect(backupKey(OWNER, ID)).toBe(`loopitalab:${OWNER}:diseno:${ID}`);
    expect(JSON.parse(storage.getItem(backupKey(OWNER, ID))!).ownerId).toBe(OWNER);
    expect(readBackup(storage, OTHER, ID)).toBeNull();
  });

  it("un respaldo con el uid de otra cuenta en el contenido no se ofrece aunque esté bajo mi clave", () => {
    const storage = localStorageLike();
    storage.setItem(backupKey(OWNER, ID), backupText(doc(), { ownerId: OTHER }));
    expect(readBackup(storage, OWNER, ID)).toBeNull();
  });

  it("pruneBackups borra los de otra cuenta, los de formato viejo, los caducados y los dañados; conserva los míos vigentes", () => {
    const storage = localStorageLike();
    const now = Date.now();
    storage.setItem("supabase.auth.token", "x");
    storage.setItem(backupKey(OWNER, ID), backupText(doc()));
    storage.setItem(backupKey(OWNER, "viejo"), backupText(doc(), { savedAt: now - BACKUP_TTL_MS - 1 }));
    storage.setItem(backupKey(OWNER, "danado"), "{no es json");
    storage.setItem(backupKey(OTHER, ID), JSON.stringify({ v: 2, ownerId: OTHER, baseUpdatedAt: T0, savedAt: now, document: doc() }));
    storage.setItem(`${LEGACY_BACKUP_PREFIX}${ID}`, JSON.stringify({ v: 1, baseUpdatedAt: T0, savedAt: now, document: doc() }));
    expect(pruneBackups(storage, OWNER, now)).toBe(4);
    expect([...storage.data.keys()].sort()).toEqual([backupKey(OWNER, ID), "supabase.auth.token"].sort());
  });

  it("un respaldo caducado (más de 14 días) no se ofrece", () => {
    const storage = localStorageLike();
    const now = Date.now();
    storage.setItem(backupKey(OWNER, ID), backupText({ ...doc(), title: "Otro" }, { savedAt: now - BACKUP_TTL_MS - 1 }));
    expect(readBackup(storage, OWNER, ID, now)).toBeNull();
    storage.setItem(backupKey(OWNER, ID), backupText({ ...doc(), title: "Otro" }, { savedAt: now - BACKUP_TTL_MS + 1000 }));
    expect(readBackup(storage, OWNER, ID, now)).not.toBeNull();
  });

  it("un texto mayor que el tope se rechaza sin interpretarlo", () => {
    const storage = localStorageLike();
    const parse = vi.spyOn(JSON, "parse");
    storage.setItem(backupKey(OWNER, ID), backupText({ ...doc(), notes: "x".repeat(MAX_BACKUP_CHARS) }));
    expect(readBackup(storage, OWNER, ID)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("si la sesión venció (UNAUTHENTICATED), el respaldo queda con la clave de la dueña", async () => {
    const storage = localStorageLike();
    const save = vi.fn().mockResolvedValue({ ok: false, code: "UNAUTHENTICATED", error: "Tu sesión terminó." } as SaveDesignResult);
    const s = setup(save, storage);
    paint(s.store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(s.autosave.getStatus().kind).toBe("failed");
    expect([...storage.data.keys()]).toEqual([backupKey(OWNER, ID)]);
    expect(readBackup(storage, OWNER, ID)?.document).toEqual(s.store.doc);
  });

  it("clearAllBackups borra todos los formatos y cuentas, y nada más", () => {
    const storage = localStorageLike();
    storage.setItem(backupKey(OWNER, ID), "1");
    storage.setItem(backupKey(OTHER, ID), "2");
    storage.setItem(`${LEGACY_BACKUP_PREFIX}${ID}`, "3");
    storage.setItem("loopitalab:preferencia", "4");
    expect(clearAllBackups(storage)).toBe(3);
    expect([...storage.data.keys()]).toEqual(["loopitalab:preferencia"]);
  });
});

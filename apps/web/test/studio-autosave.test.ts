import { NO_STITCH, newChartPattern, type ChartPattern, type Issue } from "@loopitalab/pattern-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosave, AUTOSAVE_DEBOUNCE_MS, type AutosaveDeps, backupKey, readBackup, type BackupStorage } from "@/lib/studio/autosave.ts";
import { describeStatus } from "@/lib/studio/save-status.ts";
import { DocumentStore } from "@/lib/studio/store.ts";
import type { SaveDesignResult } from "@/lib/designs/types";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const OWNER = "11111111-0000-4000-8000-000000000001";
const T0 = "2026-11-06T10:00:00.000000+00:00";
const T1 = "2026-11-06T10:00:05.000000+00:00";
const T2 = "2026-11-06T10:00:09.000000+00:00";

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

function memoryStorage(): BackupStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const ok = (updatedAt: string, draft = false): SaveDesignResult => ({ ok: true, updatedAt, draft });
const fail = (code: string, extra: Record<string, unknown> = {}): SaveDesignResult =>
  ({ ok: false, code, error: `error ${code}`, ...extra }) as SaveDesignResult;

function setup(save: ReturnType<typeof vi.fn>, extra: { validate?: (d: ChartPattern) => { savable: boolean; issues: Issue[] } } = {}) {
  const store = new DocumentStore(doc());
  const storage = memoryStorage();
  const autosave = new Autosave(store, { patternId: ID, ownerId: OWNER, initialUpdatedAt: T0, save: save as unknown as AutosaveDeps["save"], storage, ...extra });
  autosave.start();
  return { store, storage, autosave };
}
const paint = (store: DocumentStore, x: number, value = 1) => store.dispatch({ type: "paint", refs: [{ x, y: 0 }], value });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autoguardado: tiempos", () => {
  it("el debounce es de 2 s o menos (CA-F6)", () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBeLessThanOrEqual(2000);
  });

  it("envía una sola vez, después del debounce, con el documento y el updated_at esperados", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store, autosave } = setup(save);
    paint(store, 0);
    paint(store, 1);
    expect(autosave.getStatus().kind).toBe("pending");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(ID, store.doc, T0);
    expect(autosave.getStatus().kind).toBe("saved");
    expect(autosave.updatedAt).toBe(T1);
    // La siguiente edición usa el updated_at nuevo.
    paint(store, 2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenLastCalledWith(ID, store.doc, T1);
  });

  it("cada edición reinicia la espera", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(1000);
    paint(store, 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("no valida entre la edición y el dibujo: la validación corre diferida (CA-P7)", async () => {
    const validate = vi.fn().mockReturnValue({ savable: true, issues: [] });
    const { store } = setup(vi.fn().mockResolvedValue(ok(T1)), { validate });
    paint(store, 0);
    expect(validate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("sin cambios no envía; deshacer hasta lo guardado cancela el envío", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store, autosave } = setup(save);
    paint(store, 0);
    store.undo();
    expect(autosave.getStatus().kind).toBe("saved");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("un no-op no dispara guardado", async () => {
    const save = vi.fn();
    const { store } = setup(save);
    paint(store, 0, 0); // ya era 0
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("las ediciones durante un envío provocan otra vuelta", async () => {
    let release: (r: SaveDesignResult) => void = () => undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<SaveDesignResult>((r) => (release = r)))
      .mockResolvedValue(ok(T2));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.getStatus().kind).toBe("saving");
    paint(store, 1);
    release(ok(T1));
    await vi.advanceTimersByTimeAsync(0);
    expect(autosave.getStatus().kind).toBe("pending");
    expect(autosave.hasUnsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(ID, store.doc, T1);
    expect(autosave.getStatus().kind).toBe("saved");
  });

  it("stop() cancela lo pendiente", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store, autosave } = setup(save);
    paint(store, 0);
    autosave.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("autoguardado: qué se envía (savable)", () => {
  it("un error de tejido (todo sin punto) se envía y queda como borrador", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1, true));
    const { store, autosave } = setup(save);
    store.dispatch({ type: "paint", refs: Array.from({ length: 8 }, (_, i) => ({ x: i % 4, y: Math.floor(i / 4) })), value: NO_STITCH });
    store.dispatch({ type: "paint", refs: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }], value: NO_STITCH });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.getStatus()).toMatchObject({ kind: "saved", draft: true });
    expect(describeStatus(autosave.getStatus()).label).toBe("Guardado como borrador");
  });

  it("un error estructural no se envía: queda bloqueado con el motivo y el respaldo local", async () => {
    const issue: Issue = { code: "GAUGE", severity: "error", path: "gauge", message: "La muestra debe indicar puntos y filas en 10 cm, mayores que cero." };
    const save = vi.fn();
    const { store, autosave, storage } = setup(save, { validate: () => ({ savable: false, issues: [issue] }) });
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).not.toHaveBeenCalled();
    expect(autosave.getStatus()).toEqual({ kind: "blocked", issues: [issue] });
    expect(describeStatus(autosave.getStatus()).detail).toContain("La muestra debe indicar");
    expect(storage.data.has(backupKey(OWNER, ID))).toBe(true);
  });

  it("si el servidor rechaza por NOT_SAVABLE también queda bloqueado", async () => {
    const issue: Issue = { code: "UNKNOWN_KEY", severity: "error", path: "x", message: "Clave desconocida." };
    const { store, autosave } = setup(vi.fn().mockResolvedValue(fail("NOT_SAVABLE", { issues: [issue] })));
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.getStatus()).toEqual({ kind: "blocked", issues: [issue] });
  });
});

describe("autoguardado: conflicto", () => {
  it("un CONFLICT detiene el autoguardado y nunca sobrescribe en silencio", async () => {
    const save = vi.fn().mockResolvedValue(fail("CONFLICT", { currentUpdatedAt: T2 }));
    const { store, autosave, storage } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.getStatus()).toEqual({ kind: "conflict", currentUpdatedAt: T2 });
    expect(save).toHaveBeenCalledTimes(1);
    // Más ediciones y más tiempo: no vuelve a enviar.
    paint(store, 1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.getStatus().kind).toBe("conflict");
    autosave.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    // Las ediciones siguen respaldadas localmente.
    expect(readBackup(storage, OWNER, ID)).not.toBeNull();
  });

  it("sobrescribir es explícito: vuelve a llamar con el currentUpdatedAt", async () => {
    const save = vi.fn().mockResolvedValueOnce(fail("CONFLICT", { currentUpdatedAt: T2 })).mockResolvedValue(ok("2026-11-06T10:01:00.000000+00:00"));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    await autosave.overwrite();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(ID, store.doc, T2);
    expect(autosave.getStatus().kind).toBe("saved");
  });

  it("overwrite() fuera de un conflicto no hace nada", async () => {
    const save = vi.fn();
    const { autosave } = setup(save);
    await autosave.overwrite();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("autoguardado: sin conexión y otras fallas", () => {
  it("reintenta con espera creciente y se recupera", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("red")).mockRejectedValueOnce(new Error("red")).mockResolvedValue(ok(T1));
    const { store, autosave, storage } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.getStatus()).toMatchObject({ kind: "offline", attempt: 1, reason: "network" });
    expect(describeStatus(autosave.getStatus()).label).toBe("Sin conexión");
    expect(storage.data.has(backupKey(OWNER, ID))).toBe(true);
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.getStatus()).toMatchObject({ kind: "offline", attempt: 2 });
    await vi.advanceTimersByTimeAsync(3999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(autosave.getStatus().kind).toBe("saved");
    expect(storage.data.has(backupKey(OWNER, ID))).toBe(false); // respaldo limpio tras guardar
  });

  it("la espera tiene tope", async () => {
    const save = vi.fn().mockRejectedValue(new Error("red"));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(30_000);
    const s = autosave.getStatus();
    expect(s.kind).toBe("offline");
    if (s.kind === "offline") expect(s.retryAt - Date.now()).toBeLessThanOrEqual(30_000);
  });

  it("retryNow() reintenta de inmediato (evento 'online')", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("red")).mockResolvedValue(ok(T1));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    autosave.retryNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.getStatus().kind).toBe("saved");
  });

  it("un error de base de datos también se reintenta", async () => {
    const save = vi.fn().mockResolvedValueOnce(fail("DATABASE")).mockResolvedValue(ok(T1));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(autosave.getStatus()).toMatchObject({ kind: "offline", reason: "server" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosave.getStatus().kind).toBe("saved");
  });

  it("las fallas que reintentar no arregla (sesión, tamaño, cuota) se muestran y no se reintentan", async () => {
    for (const code of ["UNAUTHENTICATED", "TOO_LARGE", "QUOTA", "NOT_FOUND", "REJECTED_BY_DATABASE"]) {
      const save = vi.fn().mockResolvedValue(fail(code));
      const { store, autosave } = setup(save);
      paint(store, 0);
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
      expect(autosave.getStatus(), code).toMatchObject({ kind: "failed", code, message: `error ${code}` });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(save, code).toHaveBeenCalledTimes(1);
      autosave.stop();
    }
  });
});

describe("autoguardado: respaldo local y guardar ahora", () => {
  it("el respaldo guarda el documento y el updated_at base, y se borra al guardar", async () => {
    let release: (r: SaveDesignResult) => void = () => undefined;
    const save = vi.fn().mockImplementation(() => new Promise<SaveDesignResult>((r) => (release = r)));
    const { store, autosave, storage } = setup(save);
    paint(store, 0);
    expect(storage.data.size).toBe(0); // no se serializa en cada edición
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    const b = readBackup(storage, OWNER, ID);
    expect(b?.baseUpdatedAt).toBe(T0);
    expect(b?.document).toEqual(store.doc);
    release(ok(T1));
    await vi.advanceTimersByTimeAsync(0);
    expect(readBackup(storage, OWNER, ID)).toBeNull();
    expect(autosave.getStatus().kind).toBe("saved");
  });

  it("writeBackupNow() respalda al cerrar la pestaña, solo si hay cambios", () => {
    const { store, autosave, storage } = setup(vi.fn());
    autosave.writeBackupNow();
    expect(storage.data.size).toBe(0);
    paint(store, 0);
    autosave.writeBackupNow();
    expect(readBackup(storage, OWNER, ID)?.document).toEqual(store.doc);
  });

  it("un respaldo dañado o un almacenamiento que falla no rompen nada", () => {
    const storage = memoryStorage();
    storage.data.set(backupKey(OWNER, ID), "{no es json");
    expect(readBackup(storage, OWNER, ID)).toBeNull();
    storage.data.set(backupKey(OWNER, ID), JSON.stringify({ v: 2 }));
    storage.data.set(backupKey(OWNER, ID), JSON.stringify({ v: 1, baseUpdatedAt: T0, savedAt: Date.now(), document: {} }));
    expect(readBackup(storage, OWNER, ID)).toBeNull(); // formato viejo, sin dueña
    expect(readBackup(storage, OWNER, ID)).toBeNull();
    const store = new DocumentStore(doc());
    const broken: BackupStorage = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("cuota"); }, removeItem: () => { throw new Error("x"); } };
    const a = new Autosave(store, { patternId: ID, ownerId: OWNER, initialUpdatedAt: T0, save: vi.fn().mockResolvedValue(ok(T1)) as unknown as AutosaveDeps["save"], storage: broken });
    a.start();
    paint(store, 0);
    expect(() => a.writeBackupNow()).not.toThrow();
    expect(readBackup(broken, OWNER, ID)).toBeNull();
  });

  it("saveNow() envía de inmediato y responde si quedó todo guardado", async () => {
    const save = vi.fn().mockResolvedValue(ok(T1));
    const { store, autosave } = setup(save);
    paint(store, 0);
    await expect(autosave.saveNow()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saveNow() responde false si hay conflicto o falla", async () => {
    const { store, autosave } = setup(vi.fn().mockResolvedValue(fail("CONFLICT", { currentUpdatedAt: T2 })));
    paint(store, 0);
    await expect(autosave.saveNow()).resolves.toBe(false);
  });
});

describe("texto del estado de guardado", () => {
  it("describe cada estado con una etiqueta", () => {
    const labels = [
      describeStatus({ kind: "saved", draft: false, at: 0 }).label,
      describeStatus({ kind: "pending" }).label,
      describeStatus({ kind: "saving" }).label,
      describeStatus({ kind: "offline", attempt: 1, retryAt: 5000, reason: "network" }, 0).label,
      describeStatus({ kind: "conflict", currentUpdatedAt: T2 }).label,
      describeStatus({ kind: "blocked", issues: [] }).label,
      describeStatus({ kind: "failed", code: "QUOTA", message: "x" }).label,
    ];
    expect(new Set(labels).size).toBe(labels.length);
    expect(describeStatus({ kind: "offline", attempt: 1, retryAt: 5000, reason: "network" }, 0).detail).toContain("5 s");
  });
});

describe("pendientes de T8 (T9)", () => {
  it("maxWait: ediciones continuas se guardan a los 10 s aunque el debounce se reinicie", async () => {
    const save = vi.fn(async () => ok(T1));
    const { store } = setup(save);
    for (let i = 0; i < 12; i++) {
      paint(store, i % 4, (i % 2) + 0);
      store.dispatch({ type: "paint", refs: [{ x: i % 4, y: 1 }], value: i % 2 });
      await vi.advanceTimersByTimeAsync(1000); // siempre menos que el debounce de 1,5 s
    }
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
  it("holdBackup: editar y guardar no pisa ni borra el respaldo ofrecido", async () => {
    const save = vi.fn(async () => ok(T1));
    const { store, storage, autosave } = setup(save);
    storage.data.set(backupKey(OWNER, ID), JSON.stringify({ v: 2, ownerId: OWNER, baseUpdatedAt: T0, savedAt: Date.now(), document: { marca: "respaldo" } }));
    autosave.holdBackup(true);
    paint(store, 1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 10);
    expect(save).toHaveBeenCalled();
    expect(JSON.parse(storage.data.get(backupKey(OWNER, ID))!).document).toEqual({ marca: "respaldo" });
    autosave.holdBackup(false);
  });
  it("clearAllBackups borra solo los respaldos de diseños", async () => {
    const { clearAllBackups } = await import("@/lib/studio/autosave.ts");
    const data = new Map<string, string>([["loopitalab:diseno:a", "1"], [`loopitalab:${OWNER}:diseno:b`, "2"], ["otra", "3"], ["loopitalab:preferencia", "4"]]);
    const storage = { get length() { return data.size; }, key: (i: number) => [...data.keys()][i] ?? null, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    expect(clearAllBackups(storage)).toBe(2);
    expect([...data.keys()]).toEqual(["otra", "loopitalab:preferencia"]);
    expect(clearAllBackups(null)).toBe(0);
  });
});

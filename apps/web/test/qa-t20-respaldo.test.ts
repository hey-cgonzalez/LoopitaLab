import { newChartPattern, type ChartPattern } from "@loopitalab/pattern-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Autosave, backupKey, MAX_BACKUP_CHARS, MAX_PENDING_TOTAL, pendingTextOf, readBackup, type BackupStorage } from "@/lib/studio/autosave.ts";
import { announceSignOut, resetSignOutForTests, SIGN_OUT_EVENT } from "@/lib/studio/backup.ts";
import { MAX_DOCUMENT_BYTES } from "@/lib/designs/limits.ts";

// T20-B6 (tope del texto sin leer y respaldo que no se borra entero) y T20-M2 (señal de cierre de sesión).

const ID = "aaaaaaaa-0000-4000-8000-0000000000a1";
const OWNER = "11111111-0000-4000-8000-0000000000a1";
const T0 = "2026-11-06T10:00:00.000000+00:00";

const doc = (notes: string[] = []): ChartPattern =>
  ({ ...newChartPattern({ id: ID, title: "Gorro", width: 4, height: 3, repeat: { x: 2, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns: [{ id: "A", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } }] }), notes }) as ChartPattern;

function memory(): BackupStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

function make(storage: BackupStorage, d = doc()) {
  const store = { doc: d, subscribe: () => () => {} };
  const a = new Autosave(store, { patternId: ID, ownerId: OWNER, initialUpdatedAt: T0, save: async () => ({ ok: true, updatedAt: T0, draft: false }), storage });
  a.start();
  return { a, store };
}

afterEach(() => {
  resetSignOutForTests();
  vi.useRealTimers();
});

describe("T20-B6: tope total del texto sin leer", () => {
  it("el respaldo admite el documento máximo más el texto sin leer máximo", () => {
    expect(MAX_PENDING_TOTAL).toBe(200_000);
    expect(MAX_BACKUP_CHARS).toBe(MAX_DOCUMENT_BYTES + MAX_PENDING_TOTAL + 1024);
  });

  it("pendingTextOf rechaza más de MAX_PENDING_TOTAL en total y acepta justo el tope", () => {
    expect(pendingTextOf({ a: "x".repeat(100_000), b: "x".repeat(100_000) })).not.toBeNull();
    expect(pendingTextOf({ a: "x".repeat(100_000), b: "x".repeat(100_000), c: "y" })).toBeNull();
  });

  it("si el texto sin leer no cabe se quita solo él, se conserva el documento y se avisa", () => {
    const storage = memory();
    const { a, store } = make(storage);
    store.doc = doc(["n"]);
    const many: Record<string, string> = {};
    for (let i = 0; i < 8; i++) many[`p${i}`] = "z".repeat(100_000);
    a.setPendingText(many);
    expect(a.getPendingDropped()).toBe(false);
    a.writeBackupNow();
    const b = readBackup(storage, OWNER, ID);
    expect(b).not.toBeNull();
    expect(b?.pendingText).toBeUndefined();
    expect((b?.document as { notes: string[] }).notes).toEqual(["n"]);
    expect(a.getPendingDropped()).toBe(true);
  });

  it("con texto dentro del tope lo conserva y no avisa", () => {
    const storage = memory();
    const { a, store } = make(storage);
    store.doc = doc(["n"]);
    a.setPendingText({ p1: "V2: zzz" });
    a.writeBackupNow();
    expect(readBackup(storage, OWNER, ID)?.pendingText).toEqual({ p1: "V2: zzz" });
    expect(a.getPendingDropped()).toBe(false);
  });
});

describe("T20-M2: señal de cierre de sesión", () => {
  it("tras la señal ya no se escribe respaldo (beforeunload y pagehide)", () => {
    const storage = memory();
    const { a } = make(storage);
    a.setPendingText({ p1: "V2: zzz" });
    announceSignOut();
    a.writeBackupNow();
    expect(storage.data.size).toBe(0);
  });

  it("el temporizador del texto sin leer tampoco escribe tras la señal", () => {
    vi.useFakeTimers();
    const storage = memory();
    const { a } = make(storage);
    a.setPendingText({ p1: "V2: zzz" });
    announceSignOut();
    vi.advanceTimersByTime(5000);
    expect(storage.data.has(backupKey(OWNER, ID))).toBe(false);
  });

  it("emite el evento loopitalab:salir", () => {
    const seen = vi.fn();
    const w = { dispatchEvent: (e: Event) => seen(e.type) };
    vi.stubGlobal("window", w);
    announceSignOut();
    vi.unstubAllGlobals();
    expect(seen).toHaveBeenCalledWith(SIGN_OUT_EVENT);
  });
});

describe("T20-B5: errores que devuelve prepareDocument", () => {
  it("el tope es de 100", async () => {
    const { MAX_RETURNED_ISSUES } = await import("@/lib/designs/prepare.ts");
    expect(MAX_RETURNED_ISSUES).toBe(100);
  });
});

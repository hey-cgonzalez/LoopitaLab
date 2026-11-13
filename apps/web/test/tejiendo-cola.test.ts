import { describe, expect, it, vi } from "vitest";
import {
  MAX_PROGRESS_ENTRY_CHARS,
  PROGRESS_DEBOUNCE_MS,
  PROGRESS_TTL_MS,
  ProgressQueue,
  MAX_STORED_POINTER,
  clearAllProgressQueues,
  clearProjectProgress,
  isProgressKey,
  parseStoredProgress,
  progressKey,
  pruneProgressQueues,
  type EnumerableProgressStorage,
  type ProgressQueueDeps,
} from "@/lib/projects/progress-queue.ts";
import type { SaveProgressResult } from "@/lib/projects/types.ts";

/*
 * Cola local del avance (T12; ADR 0009 §4): debounce, una escritura en vuelo, reintentos, conflicto explícito,
 * VERSION_CHANGED y almacenamiento local con las reglas del respaldo del estudio.
 */

const OWNER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "aaaaaaaa-0000-4000-8000-000000000001";
const VERSION = "bbbbbbbb-0000-4000-8000-000000000002";
const T0 = "2026-11-11T10:00:00.000001+00:00";
const T1 = "2026-11-11T10:00:00.000002+00:00";
const T2 = "2026-11-11T10:00:00.000003+00:00";
const ptr = (rowsDone: number, stitchesDone = 0) => ({ rowsDone, stitchesDone });

function memoryStorage(): EnumerableProgressStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

type Save = ProgressQueueDeps["save"];
function setup(over: Partial<ProgressQueueDeps> = {}, save?: Save) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  const storage = memoryStorage();
  let n = 0;
  const saveFn = vi.fn<Save>(save ?? (async () => ({ ok: true, updatedAt: `2026-11-11T10:00:01.${String(++n).padStart(6, "0")}+00:00` })));
  const queue = new ProgressQueue({ projectId: PROJECT, ownerId: OWNER, versionId: VERSION, initialPointer: ptr(0), initialUpdatedAt: T0, save: saveFn, storage, ...over });
  const states: string[] = [];
  queue.subscribe(() => states.push(queue.getState().kind));
  return { queue, saveFn, storage, states, key: progressKey(OWNER, PROJECT) };
}
const conflict = (theirs: { rowsDone: number; stitchesDone: number }, at: string | null = T1): SaveProgressResult => ({ ok: false, code: "CONFLICT", conflictOn: "progress", error: "conflicto", currentPointer: theirs, currentUpdatedAt: at, workedIn: "rows", totalRows: 60 });

describe("cola del avance: guardado local y debounce", () => {
  it("guarda al instante en localStorage y envía el último puntero tras la pausa (≤ 2 s)", async () => {
    const { queue, saveFn, storage, key } = setup();
    queue.set(ptr(1));
    queue.set(ptr(2));
    queue.set(ptr(3));
    expect(JSON.parse(storage.map.get(key)!)).toMatchObject({ v: 1, ownerId: OWNER, projectId: PROJECT, versionId: VERSION, pointer: ptr(3), baseUpdatedAt: T0 });
    expect(queue.getState().kind).toBe("pending");
    expect(saveFn).not.toHaveBeenCalled();
    expect(PROGRESS_DEBOUNCE_MS).toBeLessThanOrEqual(2000);
    await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith(PROJECT, VERSION, ptr(3), T0);
    expect(queue.getState().kind).toBe("saved");
    expect(storage.map.has(key), "se borra al confirmarse").toBe(false);
    expect(queue.hasPending).toBe(false);
    vi.useRealTimers();
  });

  it("una sola escritura en vuelo: lo que cambia mientras tanto se envía después con el updatedAt nuevo", async () => {
    let release!: (r: SaveProgressResult) => void;
    const calls: unknown[][] = [];
    const { queue, saveFn } = setup({}, async (...a) => {
      calls.push(a);
      if (calls.length === 1) return new Promise<SaveProgressResult>((r) => (release = r));
      return { ok: true, updatedAt: T2 };
    });
    queue.set(ptr(1));
    await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
    expect(queue.getState().kind).toBe("saving");
    queue.set(ptr(2));
    await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
    expect(saveFn, "no hay dos en vuelo").toHaveBeenCalledTimes(1);
    release({ ok: true, updatedAt: T1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[1]).toEqual([PROJECT, VERSION, ptr(2), T1]);
    expect(queue.getState().kind).toBe("saved");
    expect(queue.baseUpdatedAt).toBe(T2);
    vi.useRealTimers();
  });

  it("flushNow envía sin esperar (página oculta); volver al puntero guardado no envía nada", async () => {
    const { queue, saveFn } = setup();
    queue.set(ptr(4));
    await queue.flushNow();
    expect(saveFn).toHaveBeenCalledTimes(1);
    queue.set(ptr(5));
    queue.set(ptr(4));
    await queue.flushNow();
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(queue.getState().kind).toBe("saved");
    vi.useRealTimers();
  });
});

describe("cola del avance: sin conexión", () => {
  it("si la acción lanza, queda «sin conexión», reintenta con espera creciente y conserva la entrada local", async () => {
    let online = false;
    const { queue, saveFn, storage, key } = setup({ retryDelaysMs: [2000, 4000] }, async () => {
      if (!online) throw new TypeError("fetch failed");
      return { ok: true, updatedAt: T1 };
    });
    queue.set(ptr(7));
    await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
    expect(queue.getState()).toMatchObject({ kind: "offline", attempt: 1, reason: "network" });
    expect(storage.map.has(key)).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(queue.getState()).toMatchObject({ kind: "offline", attempt: 2 });
    queue.set(ptr(8)); // sigue tejiendo sin red: el estado no vuelve a "pendiente"
    expect(queue.getState().kind).toBe("offline");
    online = true;
    await queue.retryNow(); // evento `online`
    expect(saveFn).toHaveBeenLastCalledWith(PROJECT, VERSION, ptr(8), T0);
    expect(queue.getState().kind).toBe("saved");
    expect(storage.map.has(key)).toBe(false);
    vi.useRealTimers();
  });

  it("un fallo DATABASE reintenta; UNAUTHENTICATED no (queda en «failed»)", async () => {
    const a = setup({}, async () => ({ ok: false, code: "DATABASE", error: "x" }));
    a.queue.set(ptr(1));
    await a.queue.flushNow();
    expect(a.queue.getState()).toMatchObject({ kind: "offline", reason: "server" });
    a.queue.stop();
    const b = setup({}, async () => ({ ok: false, code: "UNAUTHENTICATED", error: "Tu sesión terminó." }));
    b.queue.set(ptr(1));
    await b.queue.flushNow();
    expect(b.queue.getState()).toMatchObject({ kind: "failed", code: "UNAUTHENTICATED", message: "Tu sesión terminó." });
    vi.useRealTimers();
  });
});

describe("cola del avance: conflicto entre dispositivos (F3-41)", () => {
  it("si el servidor ya tiene el mismo puntero, adopta su updatedAt en silencio", async () => {
    const { queue, states } = setup({}, async () => conflict(ptr(5), T2));
    queue.set(ptr(5));
    await queue.flushNow();
    expect(queue.getState().kind).toBe("saved");
    expect(queue.baseUpdatedAt).toBe(T2);
    expect(states).not.toContain("conflict");
    vi.useRealTimers();
  });

  it("punteros distintos: expone el conflicto y no pisa; «seguir con la de aquí» reintenta con el updatedAt del servidor", async () => {
    let first = true;
    const { queue, saveFn } = setup({}, async () => {
      if (first) {
        first = false;
        return conflict(ptr(39), T1);
      }
      return { ok: true, updatedAt: T2 };
    });
    queue.set(ptr(35));
    await queue.flushNow();
    expect(queue.getState()).toMatchObject({ kind: "conflict", theirs: ptr(39), theirsAt: T1, yours: ptr(35), workedIn: "rows", totalRows: 60 });
    expect(saveFn).toHaveBeenCalledTimes(1);
    queue.set(ptr(36)); // mientras pregunta, no se envía nada
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveFn).toHaveBeenCalledTimes(1);
    await queue.keepMine();
    expect(saveFn).toHaveBeenLastCalledWith(PROJECT, VERSION, ptr(36), T1);
    expect(queue.getState().kind).toBe("saved");
    vi.useRealTimers();
  });

  it("«seguir con la otra» adopta el puntero del servidor, avisa a la pantalla y limpia la entrada local", async () => {
    const { queue, saveFn, storage, key } = setup({}, async () => conflict(ptr(39), T1));
    const seen: unknown[] = [];
    queue.onPointer = (p) => seen.push(p);
    queue.set(ptr(35));
    await queue.flushNow();
    queue.takeTheirs();
    expect(seen).toEqual([ptr(39)]);
    expect(queue.pointer).toEqual(ptr(39));
    expect(queue.baseUpdatedAt).toBe(T1);
    expect(queue.getState().kind).toBe("saved");
    expect(storage.map.has(key)).toBe(false);
    expect(saveFn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("VERSION_CHANGED: la pantalla debe recargar; no reintenta", async () => {
    const { queue, saveFn } = setup({}, async () => ({ ok: false, code: "VERSION_CHANGED", error: "cambió de versión" }));
    queue.set(ptr(2));
    await queue.flushNow();
    expect(queue.getState()).toEqual({ kind: "version-changed", message: "cambió de versión" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(saveFn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("adoptServer: solo sin pendientes; con un cambio local no adopta", async () => {
    const { queue } = setup();
    const seen: unknown[] = [];
    queue.onPointer = (p) => seen.push(p);
    expect(queue.adoptServer(ptr(9), T2)).toBe(true);
    expect(seen).toEqual([ptr(9)]);
    expect(queue.adoptServer(ptr(9), T2), "mismo puntero: nada que avisar").toBe(false);
    queue.set(ptr(10));
    expect(queue.adoptServer(ptr(20), T2)).toBe(false);
    expect(queue.pointer).toEqual(ptr(10));
    queue.stop();
    vi.useRealTimers();
  });
});

describe("cola del avance: entrada local al abrir la pantalla", () => {
  const entry = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, ownerId: OWNER, projectId: PROJECT, versionId: VERSION, pointer: ptr(12), baseUpdatedAt: T0, savedAt: Date.parse("2026-11-11T11:00:00Z"), ...over });

  it("un corte anterior se adopta y se envía con su updatedAt base", async () => {
    const { queue, saveFn, storage, key } = setup();
    storage.map.set(key, entry());
    const seen: unknown[] = [];
    queue.onPointer = (p) => seen.push(p);
    expect(queue.start()).toBe(true);
    expect(seen).toEqual([ptr(12)]);
    await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
    expect(saveFn).toHaveBeenCalledWith(PROJECT, VERSION, ptr(12), T0);
    expect(storage.map.has(key)).toBe(false);
    vi.useRealTimers();
  });

  it("descarta y borra lo de otra cuenta, otra versión, caducado, dañado o demasiado grande", () => {
    const now = Date.parse("2026-11-11T12:00:00Z");
    const bad = [
      entry({ ownerId: "33333333-3333-4333-8333-333333333333" }),
      entry({ versionId: "cccccccc-0000-4000-8000-000000000003" }),
      entry({ projectId: "dddddddd-0000-4000-8000-000000000004" }),
      entry({ savedAt: now - PROGRESS_TTL_MS - 1 }),
      entry({ savedAt: now + PROGRESS_TTL_MS + 1 }),
      entry({ pointer: { rowsDone: -1, stitchesDone: 0 } }),
      entry({ pointer: { rowsDone: 1.5, stitchesDone: 0 } }),
      entry({ pointer: null }),
      entry({ v: 2 }),
      entry({ baseUpdatedAt: 5 }),
      "{no es json",
      `"${"x".repeat(MAX_PROGRESS_ENTRY_CHARS)}"`,
    ];
    for (const raw of bad) {
      expect(parseStoredProgress(raw, OWNER, PROJECT, VERSION, now), raw.slice(0, 60)).toBeNull();
      const { queue, storage, key, saveFn } = setup();
      storage.map.set(key, raw);
      expect(queue.start()).toBe(false);
      expect(storage.map.has(key), "se borra").toBe(false);
      expect(saveFn).not.toHaveBeenCalled();
      vi.useRealTimers();
    }
    expect(parseStoredProgress(entry({ baseUpdatedAt: null }), OWNER, PROJECT, VERSION, now)?.baseUpdatedAt).toBeNull();
  });

  it("un ownerId con «:» no escribe ninguna clave; el almacenamiento que lanza no rompe la cola", async () => {
    const a = setup({ ownerId: "a:b" });
    a.queue.set(ptr(1));
    expect(a.storage.map.size).toBe(0);
    a.queue.stop();
    const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    const b = setup({ storage: throwing });
    expect(b.queue.start()).toBe(false);
    b.queue.set(ptr(1));
    await b.queue.flushNow();
    expect(b.queue.getState().kind).toBe("saved");
    vi.useRealTimers();
  });

  it("clearAllProgressQueues borra solo las claves de avance, de cualquier cuenta (cerrar sesión)", () => {
    const s = memoryStorage();
    s.setItem(progressKey(OWNER, PROJECT), "{}");
    s.setItem(progressKey("otra", "p2"), "{}");
    s.setItem(`loopitalab:${OWNER}:diseno:x`, "{}");
    s.setItem("loopitalab:tejiendo:pantalla", "1");
    expect(isProgressKey(progressKey(OWNER, PROJECT))).toBe(true);
    expect(isProgressKey("loopitalab:tejiendo:pantalla")).toBe(false);
    expect(clearAllProgressQueues(s)).toBe(2);
    expect([...s.map.keys()].sort()).toEqual([`loopitalab:${OWNER}:diseno:x`, "loopitalab:tejiendo:pantalla"]);
    expect(clearAllProgressQueues(null)).toBe(0);
  });
});

// ---------------------------------------------------------------- T17 (revisor-seguridad): B1 y B2

describe("T17, B1: limpieza del avance local", () => {
  const BEA = "33333333-3333-4333-8333-333333333333";
  const OTHER_PROJECT = "aaaaaaaa-0000-4000-8000-000000000009";
  const now = Date.parse("2026-11-11T12:00:00Z");
  const entry = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, ownerId: OWNER, projectId: PROJECT, versionId: VERSION, pointer: ptr(3, 1), baseUpdatedAt: T0, savedAt: now, ...over });

  it("pruneProgressQueues borra lo de otra dueña, lo caducado, lo grande, lo dañado y lo que no coincide con su clave", () => {
    const st = memoryStorage();
    st.setItem(progressKey(OWNER, PROJECT), entry());
    st.setItem(progressKey(BEA, PROJECT), entry({ ownerId: BEA }));
    st.setItem(progressKey(OWNER, OTHER_PROJECT), entry({ projectId: OTHER_PROJECT, savedAt: now - PROGRESS_TTL_MS - 1 }));
    st.setItem(`loopitalab:${OWNER}:avance:grande`, entry({ projectId: "grande", pad: "x".repeat(MAX_PROGRESS_ENTRY_CHARS) }));
    st.setItem(`loopitalab:${OWNER}:avance:roto`, "{no es json");
    st.setItem(`loopitalab:${OWNER}:avance:${OTHER_PROJECT}x`, entry({ projectId: OTHER_PROJECT })); // clave y contenido distintos
    st.setItem("loopitalab:tejiendo:pantalla", "0"); // no es una entrada de avance: no se toca
    expect(pruneProgressQueues(st, OWNER, now)).toBe(5);
    expect([...st.map.keys()].sort()).toEqual([progressKey(OWNER, PROJECT), "loopitalab:tejiendo:pantalla"].sort());
    expect(pruneProgressQueues(null, OWNER, now)).toBe(0);
  });

  it("clearProjectProgress quita la entrada del proyecto borrado (de cualquier cuenta) y nada más", () => {
    const st = memoryStorage();
    st.setItem(progressKey(OWNER, PROJECT), entry());
    st.setItem(progressKey(BEA, PROJECT), entry({ ownerId: BEA }));
    st.setItem(progressKey(OWNER, OTHER_PROJECT), entry({ projectId: OTHER_PROJECT }));
    expect(clearProjectProgress(st, PROJECT)).toBe(2);
    expect([...st.map.keys()]).toEqual([progressKey(OWNER, OTHER_PROJECT)]);
  });
});

describe("T17, B2: entradas fuera de cotas y fallas que descartan lo local", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const raw = (over: Record<string, unknown>) => JSON.stringify({ v: 1, ownerId: OWNER, projectId: PROJECT, versionId: VERSION, pointer: ptr(3, 1), baseUpdatedAt: T0, savedAt: now, ...over });

  it("parseStoredProgress exige punteros ≤ 100000 y baseUpdatedAt con forma de timestamp", () => {
    expect(MAX_STORED_POINTER).toBe(100_000);
    expect(parseStoredProgress(raw({ pointer: ptr(100_000, 100_000) }), OWNER, PROJECT, VERSION, now)).not.toBeNull();
    expect(parseStoredProgress(raw({ pointer: ptr(100_001, 0) }), OWNER, PROJECT, VERSION, now)).toBeNull();
    expect(parseStoredProgress(raw({ pointer: ptr(1, 100_001) }), OWNER, PROJECT, VERSION, now)).toBeNull();
    expect(parseStoredProgress(raw({ baseUpdatedAt: "ayer" }), OWNER, PROJECT, VERSION, now)).toBeNull();
    expect(parseStoredProgress(raw({ baseUpdatedAt: `${T0}${"0".repeat(40)}` }), OWNER, PROJECT, VERSION, now)).toBeNull();
    expect(parseStoredProgress(raw({ baseUpdatedAt: null }), OWNER, PROJECT, VERSION, now)).not.toBeNull();
  });

  it("al adoptar una entrada local se acota con clamp", async () => {
    const { storage, key } = setup();
    storage.setItem(key, raw({ pointer: ptr(90_000, 7), savedAt: Date.now() }));
    const seen: unknown[] = [];
    const queue = new ProgressQueue({ projectId: PROJECT, ownerId: OWNER, versionId: VERSION, initialPointer: ptr(0), initialUpdatedAt: T0, save: async () => ({ ok: true, updatedAt: T1 }), storage, clamp: (p) => ({ rowsDone: Math.min(p.rowsDone, 8), stitchesDone: 0 }) });
    queue.onPointer = (p) => seen.push(p);
    expect(queue.start()).toBe(true);
    expect(queue.pointer).toEqual(ptr(8));
    expect(seen).toEqual([ptr(8)]);
    expect(queue.adoptServer(ptr(50), T2)).toBe(false); // hay pendiente: no adopta
    vi.useRealTimers();
  });

  for (const code of ["INVALID_REQUEST", "NOT_FOUND", "NO_DESIGN"] as const) {
    it(`${code}: descarta la entrada local, vuelve al puntero del servidor y no vuelve a guardar`, async () => {
      const { queue, storage, key, saveFn } = setup({ initialPointer: ptr(2) }, async () => ({ ok: false, code, error: "x" }));
      const seen: unknown[] = [];
      queue.onPointer = (p) => seen.push(p);
      queue.set(ptr(5));
      expect(storage.map.has(key)).toBe(true);
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
      expect(saveFn).toHaveBeenCalledTimes(1);
      expect(storage.map.has(key)).toBe(false);
      expect(queue.pointer).toEqual(ptr(2));
      expect(seen).toEqual([ptr(2)]);
      expect(queue.getState()).toMatchObject({ kind: "failed", code });
      queue.set(ptr(6));
      expect(storage.map.has(key)).toBe(false);
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS * 4);
      expect(saveFn).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  }
});

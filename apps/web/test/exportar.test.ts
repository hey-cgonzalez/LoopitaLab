import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query, USER, type Result } from "./support/supabase-mock.ts";

const TOKEN = "bbbbbbbb-0000-4000-8000-000000000002";
const state = {
  user: USER as typeof USER | null,
  rows: {} as Record<string, number>,
  failing: null as string | null,
  /** La tabla falla solo desde esta página (from) en adelante: error a mitad del stream. */
  failingFrom: 0,
  begin: { data: TOKEN, error: null } as Result,
  renew: { data: true, error: null } as Result,
  adminThrows: false,
};
const getUser = vi.fn(async () => ({ data: { user: state.user } }));

/** Cada tabla devuelve `rows[tabla]` filas en total, paginadas según range(from, to). */
const from = vi.fn((table: string) =>
  query((calls): Result => {
    const range = calls.find(([m]) => m === "range")![1] as [number, number];
    if (state.failing === table && range[0] >= state.failingFrom) return { data: null, error: { message: "permiso" } };
    const total = state.rows[table] ?? 0;
    const n = Math.max(0, Math.min(total, range[1] + 1) - range[0]);
    return { data: Array.from({ length: n }, (_, i) => ({ id: `${table}-${range[0] + i}` })), error: null };
  }),
);
const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) =>
  fn === "begin_operation" ? state.begin : fn === "renew_operation" ? state.renew : { error: null },
);
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser }, from }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (state.adminThrows) throw new Error("Faltan variables");
    // El cliente admin no lee datos: solo candado y tope.
    return { rpc, from: () => { throw new Error("la exportación no lee con la clave secreta"); } };
  },
}));

const { GET } = await import("@/app/api/cuenta/exportar/route");

const get = (headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
  new NextRequest("http://localhost:3000/api/cuenta/exportar", { headers });

beforeEach(() => {
  state.user = USER;
  state.rows = { profiles: 1, patterns: 3 };
  state.failing = null;
  state.failingFrom = 0;
  state.begin = { data: TOKEN, error: null };
  state.renew = { data: true, error: null };
  state.adminThrows = false;
  from.mockClear();
  rpc.mockClear();
  getUser.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/cuenta/exportar", () => {
  it.each([
    [{ "sec-fetch-site": "same-origin" }, 200],
    [{ "sec-fetch-site": "none" }, 200], // la usuaria escribió la URL o abrió un marcador
    [{}, 200], // navegador antiguo sin Origin en un GET
    [{ "sec-fetch-site": "cross-site" }, 403],
    [{ "sec-fetch-site": "same-site" }, 403],
    [{ origin: "https://evil.test" }, 403],
  ])("encabezados %j: %i", async (headers, status) => {
    expect((await GET(get(headers))).status).toBe(status);
  });

  it("sin sesión: 401 sin consultar tablas", async () => {
    state.user = null;
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("entrega un adjunto JSON con todas las secciones", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="loopitalab-mis-datos\.json"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      format: "loopitalab-export",
      version: 1,
      account: { id: USER.id, email: USER.email, created_at: USER.created_at, last_sign_in_at: USER.last_sign_in_at },
      profile: { id: "profiles-0" },
    });
    for (const k of ["patterns", "pattern_versions", "projects", "project_progress", "project_notes", "user_yarns", "uploads", "pattern_reports", "ai_jobs"]) {
      expect(Array.isArray(body[k]), k).toBe(true);
    }
    expect((body.patterns as unknown[]).length).toBe(3);
  });

  it("usa la sesión (RLS) y además filtra por la usuaria donde hay columna de dueña", async () => {
    await (await GET(get())).text(); // las tablas se leen a medida que se consume el stream
    const filters = Object.fromEntries(
      from.mock.calls.map(([table], i) => {
        const q = from.mock.results[i]!.value as ReturnType<typeof query>;
        return [table, q.calls.filter(([m]) => m === "eq").map(([, a]) => a)];
      }),
    );
    expect(filters.profiles).toEqual([["id", USER.id]]);
    for (const t of ["patterns", "projects", "user_yarns", "uploads", "ai_jobs"]) expect(filters[t]).toEqual([["owner_id", USER.id]]);
    expect(filters.pattern_reports).toEqual([["reporter_id", USER.id]]);
  });

  it("patrones en páginas de 10 (documentos grandes) hasta el final", async () => {
    state.rows.patterns = 25;
    const body = (await (await GET(get())).json()) as { patterns: { id: string }[] };
    expect(body.patterns.length).toBe(25);
    expect(new Set(body.patterns.map((p) => p.id)).size).toBe(25);
    const ranges = from.mock.calls
      .map(([t], i) => [t, (from.mock.results[i]!.value as ReturnType<typeof query>).calls.find(([m]) => m === "range")![1]])
      .filter(([t]) => t === "patterns")
      .map(([, r]) => r);
    expect(ranges).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it("las demás tablas en páginas de 1000", async () => {
    state.rows.project_notes = 2345;
    const body = (await (await GET(get())).json()) as { project_notes: unknown[] };
    expect(body.project_notes.length).toBe(2345);
  });

  it("exactamente una página llena: pide una más y termina", async () => {
    state.rows.patterns = 10;
    const body = (await (await GET(get())).json()) as { patterns: unknown[] };
    expect(body.patterns.length).toBe(10);
  });

  it("JSON sin indentación", async () => {
    const text = await (await GET(get())).text();
    expect(text).not.toMatch(/\n/);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it("denuncias con columnas explícitas (sin la instantánea interna)", async () => {
    await GET(get()).then((r) => r.text());
    const i = from.mock.calls.findIndex(([t]) => t === "pattern_reports");
    const q = from.mock.results[i]!.value as ReturnType<typeof query>;
    expect(q.calls.find(([m]) => m === "select")![1][0]).toBe("id, pattern_id, reporter_id, reason, details, status, pattern_title, created_at");
  });

  it("si falla el perfil antes de empezar: 500 sin adjunto, y suelta el candado", async () => {
    state.failing = "profiles";
    const res = await GET(get());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "export_failed" });
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(rpc.mock.calls.at(-1)).toEqual(["end_operation", { p_owner: USER.id, p_operation: "export", p_token: TOKEN }]);
  });

  it("si una tabla falla a mitad, el stream se aborta: nunca un JSON válido incompleto", async () => {
    state.rows.patterns = 35;
    state.failing = "patterns";
    state.failingFrom = 20; // las dos primeras páginas ya se enviaron
    const res = await GET(get());
    expect(res.status).toBe(200); // ya había empezado
    await expect(res.text()).rejects.toThrow();
    expect(rpc.mock.calls.at(-1)).toEqual(["end_operation", { p_owner: USER.id, p_operation: "export", p_token: TOKEN }]);
  });

  it("tope diario: 429 daily_limit sin leer datos", async () => {
    state.begin = { error: { message: "tope", code: "54000" } };
    const res = await GET(get());
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_limit" });
    expect(from).not.toHaveBeenCalled();
  });

  it("otra exportación en curso: 409", async () => {
    state.begin = { error: { message: "en curso", code: "55P03" } };
    expect((await GET(get())).status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });

  it("cobra la exportación a la usuaria de la sesión y suelta el candado al terminar", async () => {
    await (await GET(get())).text();
    expect(rpc.mock.calls[0]).toEqual(["begin_operation", { p_owner: USER.id, p_operation: "export" }]);
    expect(rpc.mock.calls.at(-1)).toEqual(["end_operation", { p_owner: USER.id, p_operation: "export", p_token: TOKEN }]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("latido: renueva el candado cada minuto y aborta si lo perdió (F2-B11)", async () => {
    state.rows.patterns = 30;
    const realNow = Date.now;
    let t = realNow();
    vi.spyOn(Date, "now").mockImplementation(() => (t += 30_000)); // cada lectura avanza 30 s
    const ok = await (await GET(get())).text();
    expect(() => JSON.parse(ok)).not.toThrow();
    const renews = rpc.mock.calls.filter(([f]) => f === "renew_operation");
    expect(renews.length).toBeGreaterThan(0);
    expect(renews[0]![1]).toEqual({ p_owner: USER.id, p_operation: "export", p_token: TOKEN });

    rpc.mockClear();
    state.renew = { data: false, error: null };
    const res = await GET(get());
    await expect(res.text()).rejects.toThrow();
    expect(rpc.mock.calls.at(-1)![0]).toBe("end_operation");
  });

  it("sin clave secreta: 500", async () => {
    state.adminThrows = true;
    expect((await GET(get())).status).toBe(500);
  });

  it("sin perfil: profile es null", async () => {
    state.rows.profiles = 0;
    const body = (await (await GET(get())).json()) as { profile: unknown };
    expect(body.profile).toBeNull();
  });
});

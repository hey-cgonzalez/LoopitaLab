import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query, USER, type Result } from "./support/supabase-mock.ts";

// ---------------------------------------------------------------- simulación

type Item = { name: string; id: string | null };
const state = {
  user: USER as { id: string; email?: string } | null,
  /** Resultado de consumir el intento de re-autenticación (ver test/reauth.test.ts). */
  reauthOk: true,
  folders: {} as Record<string, Item[]>,
  /** Lo que aparece en la carpeta después de borrar la usuaria (subida que terminó a mitad). */
  foldersAfterDelete: null as Record<string, Item[]> | null,
  listError: null as string | null,
  uploadsRows: [] as { storage_path: string }[],
  removeError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  banError: null as { message: string } | null,
  adminThrows: false,
};

const getUser = vi.fn(async () => ({ data: { user: state.user } }));
const getSession = vi.fn(async () => ({ data: { session: { access_token: "jwt-de-bea" } } }));
const sessionSignOut = vi.fn(async (..._a: unknown[]) => ({ error: null }));
const consumeReauthIntent = vi.fn(async (..._a: unknown[]) => state.reauthOk);
const list = vi.fn(async (folder: string, opts: { limit: number; offset: number }) => {
  if (state.listError) return { data: null, error: { message: state.listError } };
  const all = state.folders[folder] ?? [];
  return { data: all.slice(opts.offset, opts.offset + opts.limit), error: null };
});
const remove = vi.fn(async (_paths: string[]) => ({ error: state.removeError }));
const deleteUser = vi.fn(async (_id: string) => {
  if (!state.deleteError && state.foldersAfterDelete) state.folders = state.foldersAfterDelete;
  return { error: state.deleteError };
});
const updateUserById = vi.fn(async (_id: string, _attrs: Record<string, unknown>) => ({ error: state.banError }));
const adminSignOut = vi.fn(async (..._a: unknown[]) => ({ error: null }));
const adminFrom = vi.fn(() => query((): Result => ({ data: state.uploadsRows, error: null })));
const cookieDelete = vi.fn();
const cookieList = [
  { name: "sb-abc-auth-token", value: "x" },
  { name: "sb-abc-auth-token.0", value: "x" },
  { name: "tema", value: "claro" },
];
const signInWithPassword = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => cookieList, delete: cookieDelete }),
}));
vi.mock("@/app/api/_lib/reauth", () => ({ consumeReauthIntent }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser, getSession, signOut: sessionSignOut, signInWithPassword } }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  UPLOADS_BUCKET: "uploads",
  createAdminClient: () => {
    if (state.adminThrows) throw new Error("Faltan variables");
    return {
      storage: { from: () => ({ list, remove }) },
      from: adminFrom,
      auth: { admin: { deleteUser, updateUserById, signOut: adminSignOut } },
    };
  },
}));

const { POST } = await import("@/app/api/cuenta/eliminar/route");

beforeEach(() => {
  Object.assign(state, {
    user: USER,
    reauthOk: true,
    folders: {},
    foldersAfterDelete: null,
    listError: null,
    uploadsRows: [],
    removeError: null,
    deleteError: null,
    banError: null,
    adminThrows: false,
  });
  for (const f of [getUser, getSession, sessionSignOut, consumeReauthIntent, list, remove, deleteUser, updateUserById, adminSignOut, adminFrom, cookieDelete, signInWithPassword]) f.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

function post(body: BodyInit | null, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/cuenta/eliminar", {
    method: "POST",
    body,
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json", ...headers },
  });
}
const json = (v: unknown) => post(JSON.stringify(v));
const OK_BODY = { confirm: "ELIMINAR" };
const errorOf = async (res: Response) => ((await res.json()) as { error?: string }).error;

// ---------------------------------------------------------------- casos

describe("POST /api/cuenta/eliminar: antes de borrar nada", () => {
  it("otro sitio: 403 sin mirar la sesión", async () => {
    const res = await POST(post(JSON.stringify(OK_BODY), { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("navegación directa (none) no basta para un POST", async () => {
    const res = await POST(post(JSON.stringify(OK_BODY), { "sec-fetch-site": "none" }));
    expect(res.status).toBe(403);
  });

  it("sin sesión: 401", async () => {
    state.user = null;
    expect((await POST(json(OK_BODY))).status).toBe(401);
  });

  it.each([
    ["sin confirmación", JSON.stringify({}), "application/json"],
    ["confirmación incorrecta", JSON.stringify({ confirm: "eliminar ya" }), "application/json"],
    ["confirmación no texto", JSON.stringify({ confirm: 1 }), "application/json"],
    ["JSON inválido", "{confirm:", "application/json"],
    ["JSON null", "null", "application/json"],
    ["tipo no admitido", "confirm=ELIMINAR", "text/plain"],
  ])("%s: 400 confirm_required", async (_n, body, type) => {
    const res = await POST(post(body, { "content-type": type }));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("confirm_required");
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("cuerpo declarado mayor a 16 KB: 413", async () => {
    const res = await POST(post(JSON.stringify(OK_BODY), { "content-length": String(16 * 1024 + 1) }));
    expect(res.status).toBe(413);
  });

  it("cuerpo real mayor a 16 KB aunque no lo declare: 413 (F2-B5)", async () => {
    const big = JSON.stringify({ confirm: "ELIMINAR", relleno: "x".repeat(20 * 1024) });
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new NextRequest("http://localhost:3000/api/cuenta/eliminar", {
      method: "POST",
      body: stream,
      headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" },
      duplex: "half",
    } as unknown as ConstructorParameters<typeof NextRequest>[1]);
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("sin re-autenticación atada a la acción: 403 reauth_required, sin bloquear ni borrar", async () => {
    state.reauthOk = false;
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe("reauth_required");
    expect(updateUserById).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("el servidor nunca verifica la contraseña por su cuenta (F2-M4)", async () => {
    await POST(json({ ...OK_BODY, password: "buena123" }));
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(consumeReauthIntent).toHaveBeenCalledWith(expect.anything(), expect.anything(), "delete_account");
  });

  it("sin clave secreta: 500 sin borrar", async () => {
    state.adminThrows = true;
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toBe("server_misconfigured");
  });

  it("si no se puede bloquear: 500 sin borrar", async () => {
    state.banError = { message: "x" };
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(500);
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/cuenta/eliminar: borrado", () => {
  const uid = USER.id;

  it("bloquea y cierra sesiones, borra archivos, luego la usuaria y las cookies", async () => {
    state.folders = {
      [uid]: [
        { name: "a.webp", id: "1" },
        { name: "sub", id: null },
      ],
      [`${uid}/sub`]: [{ name: "b.webp", id: "2" }],
    };
    state.uploadsRows = [
      { storage_path: `${uid}/a.webp` }, // repetida: no se duplica
      { storage_path: `${uid}/huerfana.webp` },
      { storage_path: `11111111-1111-4111-8111-111111111111/ajena.webp` }, // nunca se toca lo ajeno
    ];
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(updateUserById).toHaveBeenCalledWith(uid, { ban_duration: "876000h" });
    expect(adminSignOut).toHaveBeenCalledWith("jwt-de-bea", "global");
    expect(updateUserById.mock.invocationCallOrder[0]!).toBeLessThan(remove.mock.invocationCallOrder[0]!);

    expect([...remove.mock.calls[0]![0]].sort()).toEqual([`${uid}/a.webp`, `${uid}/huerfana.webp`, `${uid}/sub/b.webp`]);
    const uploadsQuery = adminFrom.mock.results[0]!.value as ReturnType<typeof query>;
    expect(uploadsQuery.calls).toContainEqual(["eq", ["owner_id", uid]]);

    expect(deleteUser).toHaveBeenCalledWith(uid);
    expect(remove.mock.invocationCallOrder[0]!).toBeLessThan(deleteUser.mock.invocationCallOrder[0]!);
    expect(sessionSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookieDelete.mock.calls.map(([n]) => n)).toEqual(["sb-abc-auth-token", "sb-abc-auth-token.0"]);
  });

  it("después de deleteUser vuelve a listar y borra lo que quedó (F2-B1)", async () => {
    state.folders = { [uid]: [{ name: "a.webp", id: "1" }] };
    state.foldersAfterDelete = { [uid]: [{ name: "tardia.webp", id: "9" }] };
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(200);
    expect(remove.mock.calls.map(([p]) => p)).toEqual([[`${uid}/a.webp`], [`${uid}/tardia.webp`]]);
    expect(deleteUser.mock.invocationCallOrder[0]!).toBeLessThan(remove.mock.invocationCallOrder[1]!);
  });

  it("sin archivos: no llama a remove y borra la usuaria", async () => {
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(200);
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith(uid);
  });

  it("acepta formulario urlencoded", async () => {
    const res = await POST(post(new URLSearchParams(OK_BODY).toString(), { "content-type": "application/x-www-form-urlencoded" }));
    expect(res.status).toBe(200);
  });

  it("pagina el listado y borra en lotes de 1000", async () => {
    state.folders = { [uid]: Array.from({ length: 2500 }, (_, i) => ({ name: `f${i}.webp`, id: String(i) })) };
    state.foldersAfterDelete = {};
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(200);
    expect(list.mock.calls.slice(0, 3).map(([, o]) => o.offset)).toEqual([0, 1000, 2000]);
    expect(remove.mock.calls.map(([p]) => p.length)).toEqual([1000, 1000, 500]);
  });

  it("si falla el listado de Storage, la cuenta queda intacta y se quita el bloqueo", async () => {
    state.listError = "storage caído";
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toBe("storage_delete_failed");
    expect(deleteUser).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenLastCalledWith(uid, { ban_duration: "none" });
  });

  it("si falla el borrado de archivos, la cuenta queda intacta y se quita el bloqueo", async () => {
    state.folders = { [uid]: [{ name: "a.webp", id: "1" }] };
    state.removeError = { message: "x" };
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenLastCalledWith(uid, { ban_duration: "none" });
  });

  it("si falla deleteUser: 500, se quita el bloqueo y no se cierran las cookies", async () => {
    state.deleteError = { message: "x" };
    const res = await POST(json(OK_BODY));
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toBe("delete_failed");
    expect(cookieDelete).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenLastCalledWith(uid, { ban_duration: "none" });
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query, USER, type Result } from "./support/supabase-mock.ts";

const ID = "aaaaaaaa-0000-4000-8000-000000000001";
const state = {
  user: USER as typeof USER | null,
  row: { data: { id: ID, storage_path: `${USER.id}/x.webp` }, error: null } as Result,
  removeError: null as { message: string } | null,
  deleteResult: { error: null } as Result,
};
const getUser = vi.fn(async () => ({ data: { user: state.user } }));
const remove = vi.fn(async (_p: string[]) => ({ error: state.removeError }));
const adminFrom = vi.fn((_t: string) =>
  query((calls) => (calls.some(([m]) => m === "delete") ? state.deleteResult : state.row)),
);
// supabase-mock no trae maybeSingle: se agrega encima.
const withMaybeSingle = (q: ReturnType<typeof query>) => Object.assign(q, { maybeSingle: vi.fn(() => q) });

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  UPLOADS_BUCKET: "uploads",
  createAdminClient: () => ({ storage: { from: () => ({ remove }) }, from: (t: string) => withMaybeSingle(adminFrom(t)) }),
}));

const { DELETE } = await import("@/app/api/subidas/[id]/route");

const del = (id: string, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
  DELETE(new NextRequest(`http://localhost:3000/api/subidas/${id}`, { method: "DELETE", headers }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.user = USER;
  state.row = { data: { id: ID, storage_path: `${USER.id}/x.webp` }, error: null };
  state.removeError = null;
  state.deleteResult = { error: null };
  for (const f of [getUser, remove, adminFrom]) f.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("DELETE /api/subidas/[id]", () => {
  it("otro sitio: 403", async () => expect((await del(ID, { "sec-fetch-site": "cross-site" })).status).toBe(403));

  it("sin sesión: 401", async () => {
    state.user = null;
    expect((await del(ID)).status).toBe(401);
  });

  it("id que no es uuid: 400", async () => expect((await del("../otra"))).toHaveProperty("status", 400));

  it("ajena o inexistente: 404 sin borrar", async () => {
    state.row = { data: null, error: null };
    expect((await del(ID)).status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });

  it("busca siempre acotado a la dueña de la sesión", async () => {
    await del(ID);
    const q = adminFrom.mock.results[0]!.value as ReturnType<typeof query>;
    expect(q.calls).toContainEqual(["eq", ["id", ID]]);
    expect(q.calls).toContainEqual(["eq", ["owner_id", USER.id]]);
  });

  it("borra el archivo y luego la fila: 200", async () => {
    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith([`${USER.id}/x.webp`]);
    const q = adminFrom.mock.results[1]!.value as ReturnType<typeof query>;
    expect(q.calls.map(([m]) => m)).toContain("delete");
    expect(q.calls).toContainEqual(["eq", ["owner_id", USER.id]]);
  });

  it("si falla Storage, la fila se conserva: 500", async () => {
    state.removeError = { message: "x" };
    expect((await del(ID)).status).toBe(500);
    expect(adminFrom).toHaveBeenCalledTimes(1);
  });

  it("una fila con ruta fuera de la carpeta propia no se toca", async () => {
    state.row = { data: { id: ID, storage_path: "11111111-1111-4111-8111-111111111111/x.webp" }, error: null };
    expect((await del(ID)).status).toBe(404);
    expect(remove).not.toHaveBeenCalled();
  });
});

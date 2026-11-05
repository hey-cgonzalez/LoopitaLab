import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { USER } from "./support/supabase-mock.ts";

const state = { user: USER as typeof USER | null, result: "ok" as string };
const getUser = vi.fn(async () => ({ data: { user: state.user } }));
const issueReauthIntent = vi.fn(async (..._a: unknown[]) => state.result);
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/app/api/_lib/reauth", () => ({ issueReauthIntent }));

const { POST } = await import("@/app/api/cuenta/reautenticar/route");

const post = (body: unknown, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
  POST(new NextRequest("http://localhost:3000/api/cuenta/reautenticar", { method: "POST", body: JSON.stringify(body), headers }));

beforeEach(() => {
  state.user = USER;
  state.result = "ok";
  issueReauthIntent.mockClear();
});

describe("POST /api/cuenta/reautenticar", () => {
  it("otro sitio: 403", async () => expect((await post({ action: "delete_account" }, { "sec-fetch-site": "cross-site" })).status).toBe(403));
  it("sin sesión: 401", async () => {
    state.user = null;
    expect((await post({ action: "delete_account" })).status).toBe(401);
  });
  it.each([{}, { action: "borrar_todo" }, { action: 1 }, null])("acción inválida %j: 400", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(issueReauthIntent).not.toHaveBeenCalled();
  });
  it.each(["delete_account", "change_password"])("%s: 201", async (action) => {
    const res = await post({ action });
    expect(res.status).toBe(201);
    expect(issueReauthIntent).toHaveBeenCalledWith(expect.anything(), expect.anything(), action);
  });
  it("tope: 429", async () => {
    state.result = "rate_limited";
    expect((await post({ action: "delete_account" })).status).toBe(429);
  });
  it("error: 500", async () => {
    state.result = "error";
    expect((await post({ action: "delete_account" })).status).toBe(500);
  });
});

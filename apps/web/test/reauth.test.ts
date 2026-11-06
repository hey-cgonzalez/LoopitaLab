import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Re-autenticación atada a la acción (F2-M5). Las reglas de tiempo, sesión y uso único las
 * aplica public.consume_reauth y se prueban en supabase/checks/10_rls_check.sql; aquí, que el
 * servidor pase los datos correctos, use la cookie una sola vez y no confíe en nada más.
 */

const NONCE = "cccccccc-0000-4000-8000-000000000001";
const jar = new Map<string, string>();
const cookieSet = vi.fn((name: string, value: string, _opts: Record<string, unknown>) => void jar.set(name, value));
const cookieDelete = vi.fn((name: string) => void jar.delete(name));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined), set: cookieSet, delete: cookieDelete }),
}));

const proof = { value: { userId: "u-1", sessionId: "sesion-b", passwordAuthAt: 1_800_000_000, oauthAuthAt: null, amr: [] } as unknown };
vi.mock("@/lib/recovery", () => ({ readSessionProof: async () => proof.value }));
/** Resultado de public.user_has_password (lib/password-status.ts): true, false o null (error). */
const withPassword = { value: true as boolean | null };
const hasPassword = vi.fn(async (_admin: unknown, _userId: string) => withPassword.value);
vi.mock("@/lib/password-status", () => ({ hasPassword }));

const { issueReauthIntent, consumeReauthIntent, reauthCookieName } = await import("@/app/api/_lib/reauth");

const rpcResult = { value: { data: NONCE, error: null } as { data: unknown; error: { code?: string; message: string } | null } };
const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => rpcResult.value);
const admin = { rpc } as unknown as SupabaseClient;
const supabase = {} as SupabaseClient;

beforeEach(() => {
  jar.clear();
  rpc.mockClear();
  cookieSet.mockClear();
  cookieDelete.mockClear();
  proof.value = { userId: "u-1", sessionId: "sesion-b", passwordAuthAt: 1_800_000_000, oauthAuthAt: null, amr: [] };
  withPassword.value = true;
  hasPassword.mockClear();
  rpcResult.value = { data: NONCE, error: null };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("issueReauthIntent", () => {
  it("registra usuaria, sesión y acción, y deja el nonce en una cookie httpOnly SameSite=Strict de 5 min", async () => {
    proof.value = { userId: "u-1", sessionId: "sesion-a", passwordAuthAt: null, oauthAuthAt: null, amr: [] };
    expect(await issueReauthIntent(supabase, admin, "delete_account")).toBe("ok");
    expect(rpc).toHaveBeenCalledWith("begin_reauth", { p_owner: "u-1", p_session: "sesion-a", p_action: "delete_account" });
    const [name, value, opts] = cookieSet.mock.calls[0]!;
    expect(name).toBe(reauthCookieName("delete_account"));
    expect(value).toBe(NONCE);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 300 });
  });

  it("sin sesión: unauthenticated, sin intento", async () => {
    proof.value = null;
    expect(await issueReauthIntent(supabase, admin, "delete_account")).toBe("unauthenticated");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sin session_id en el token: error, sin intento ni cookie (falla cerrado)", async () => {
    proof.value = { userId: "u-1", sessionId: null, passwordAuthAt: null, oauthAuthAt: null, amr: [] };
    expect(await issueReauthIntent(supabase, admin, "delete_account")).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("tope (54000): rate_limited, sin cookie", async () => {
    rpcResult.value = { data: null, error: { code: "54000", message: "tope" } };
    expect(await issueReauthIntent(supabase, admin, "change_password")).toBe("rate_limited");
    expect(cookieSet).not.toHaveBeenCalled();
  });
});

describe("consumeReauthIntent", () => {
  it("sesión recién ingresada sin intento (sin cookie): no basta, y no consulta la base", async () => {
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("intento sin re-autenticación posterior (sin password ni oauth en el token): no basta", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    proof.value = { userId: "u-1", sessionId: "sesion-a", passwordAuthAt: null, oauthAuthAt: null, amr: [] };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
    expect(jar.has(reauthCookieName("delete_account"))).toBe(false); // igual se gasta
  });

  it("cambiar contraseña con solo oauth: nunca vale, ni en cuentas sin contraseña, y no consulta la base", async () => {
    for (const pw of [true, false]) {
      withPassword.value = pw;
      jar.set(reauthCookieName("change_password"), NONCE);
      proof.value = { userId: "u-1", sessionId: "sesion-c", passwordAuthAt: null, oauthAuthAt: 1_800_000_100, amr: [] };
      rpcResult.value = { data: true, error: null };
      expect(await consumeReauthIntent(supabase, admin, "change_password")).toBe(false);
      expect(jar.has(reauthCookieName("change_password"))).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("cambiar contraseña: usa la hora del password aunque haya un oauth más reciente, sin consultar user_has_password", async () => {
    jar.set(reauthCookieName("change_password"), NONCE);
    proof.value = { userId: "u-1", sessionId: "sesion-c", passwordAuthAt: 1_800_000_000, oauthAuthAt: 1_800_000_100, amr: [] };
    rpcResult.value = { data: true, error: null };
    expect(await consumeReauthIntent(supabase, admin, "change_password")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_reauth", expect.objectContaining({ p_auth_time: new Date(1_800_000_000 * 1000).toISOString() }));
    expect(hasPassword).not.toHaveBeenCalled();
  });

  it("eliminar cuenta CON contraseña y solo oauth: no vale y no consume en la base", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    withPassword.value = true;
    proof.value = { userId: "u-1", sessionId: "sesion-c", passwordAuthAt: null, oauthAuthAt: 1_800_000_100, amr: [] };
    rpcResult.value = { data: true, error: null };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
    expect(hasPassword).toHaveBeenCalledWith(admin, "u-1");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("eliminar cuenta CON contraseña, password y oauth más reciente: pasa la hora del password, no la máxima", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    proof.value = { userId: "u-1", sessionId: "sesion-c", passwordAuthAt: 1_800_000_000, oauthAuthAt: 1_800_000_100, amr: [] };
    rpcResult.value = { data: true, error: null };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_reauth", expect.objectContaining({ p_auth_time: new Date(1_800_000_000 * 1000).toISOString() }));
  });

  it("eliminar cuenta SIN contraseña con oauth: pasa a la base la hora de ese ingreso", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    withPassword.value = false;
    proof.value = { userId: "u-1", sessionId: "sesion-c", passwordAuthAt: null, oauthAuthAt: 1_800_000_100, amr: [] };
    rpcResult.value = { data: true, error: null };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_reauth", expect.objectContaining({ p_session: "sesion-c", p_auth_time: new Date(1_800_000_100 * 1000).toISOString() }));
  });

  it("eliminar cuenta SIN contraseña con password y oauth: usa la más reciente", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    withPassword.value = false;
    proof.value = { userId: "u-1", sessionId: "sesion-c", passwordAuthAt: 1_800_000_200, oauthAuthAt: 1_800_000_100, amr: [] };
    rpcResult.value = { data: true, error: null };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_reauth", expect.objectContaining({ p_auth_time: new Date(1_800_000_200 * 1000).toISOString() }));
  });

  it("eliminar cuenta sin poder saber si tiene contraseña (null): falla cerrado, también con password", async () => {
    withPassword.value = null;
    for (const p of [
      { passwordAuthAt: 1_800_000_000, oauthAuthAt: null },
      { passwordAuthAt: null, oauthAuthAt: 1_800_000_100 },
    ]) {
      jar.set(reauthCookieName("delete_account"), NONCE);
      proof.value = { userId: "u-1", sessionId: "sesion-c", ...p, amr: [] };
      rpcResult.value = { data: true, error: null };
      expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pasa a la base la sesión actual y la hora de la autenticación password", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    rpcResult.value = { data: true, error: null };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_reauth", {
      p_owner: "u-1",
      p_nonce: NONCE,
      p_action: "delete_account",
      p_session: "sesion-b",
      p_auth_time: new Date(1_800_000_000 * 1000).toISOString(),
    });
  });

  it("el nonce reutilizado falla: la cookie se borra en el primer uso y la base lo rechaza", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    rpcResult.value = { data: true, error: null };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(true);
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false); // sin cookie
    // Aunque alguien reponga la cookie, la base ya lo consumió.
    jar.set(reauthCookieName("delete_account"), NONCE);
    rpcResult.value = { data: false, error: null };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
  });

  it("la cookie de otra acción no sirve", async () => {
    jar.set(reauthCookieName("change_password"), NONCE);
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("nonce que no es uuid: false sin consultar", async () => {
    jar.set(reauthCookieName("delete_account"), "'; drop table x; --");
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("error de la base: false", async () => {
    jar.set(reauthCookieName("delete_account"), NONCE);
    rpcResult.value = { data: null, error: { message: "x" } };
    expect(await consumeReauthIntent(supabase, admin, "delete_account")).toBe(false);
  });
});

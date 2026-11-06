import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Re-autenticación con proveedor (Google/Microsoft) de punta a punta en el servidor: token real
 * decodificado por lib/recovery.ts y lib/password-status.ts reales (sin mock), con imitaciones de
 * public.user_has_password (migración 20261105231613) y public.consume_reauth (mismas reglas de
 * la migración 20261105133225: intento previo, otra sesión, < 5 min, uso único).
 * Las reglas SQL reales se prueban en supabase/checks/10_rls_check.sql.
 * Política (A1/M1): "oauth" solo vale para eliminar una cuenta SIN contraseña.
 */

const NONCE = "dddddddd-0000-4000-8000-000000000002";
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const { consumeReauthIntent, reauthCookieName } = await import("@/app/api/_lib/reauth");

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: unknown) => `${b64({ alg: "HS256" })}.${b64(payload)}.firma`;
const nowS = () => Math.floor(Date.now() / 1000);

function session(sessionId: string, amr: { method: string; timestamp: number }[]) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "u-1" } } }),
      getSession: async () => ({ data: { session: { access_token: jwt({ sub: "u-1", session_id: sessionId, amr }) } } }),
    },
  } as unknown as SupabaseClient;
}

/** Intento emitido por la sesión "sesion-a" hace 60 s, sin consumir. */
const intent = { createdAt: 0, session: "sesion-a", action: "delete_account", consumed: false };
/** Estado de public.user_has_password para u-1; "error" imita una falla de la base. */
const account = { password: false as boolean | "error" };
const rpc = vi.fn(async (fn: string, a: Record<string, string>) => {
  if (fn === "user_has_password") {
    if (account.password === "error") return { data: null, error: { code: "XX000", message: "caída" } };
    return { data: a.p_user === "u-1" ? account.password : false, error: null };
  }
  if (intent.consumed || a.p_nonce !== NONCE || a.p_owner !== "u-1") return { data: false, error: null };
  intent.consumed = true;
  const auth = Date.parse(a.p_auth_time!) / 1000;
  const ok =
    a.p_action === intent.action &&
    intent.createdAt > nowS() - 300 &&
    a.p_session !== intent.session &&
    auth >= intent.createdAt &&
    auth <= nowS() + 60;
  return { data: ok, error: null };
});
const admin = { rpc } as unknown as SupabaseClient;

beforeEach(() => {
  jar.clear();
  jar.set(reauthCookieName("delete_account"), NONCE);
  Object.assign(intent, { createdAt: nowS() - 60, consumed: false, action: "delete_account" });
  account.password = false;
  rpc.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("consumeReauthIntent con proveedor (oauth), cuenta sin contraseña", () => {
  it("ingreso oauth posterior al intento, en sesión nueva: vale", async () => {
    expect(await consumeReauthIntent(session("sesion-b", [{ method: "oauth", timestamp: nowS() - 10 }]), admin, "delete_account")).toBe(true);
  });

  it("ingreso oauth anterior al intento: no vale", async () => {
    expect(await consumeReauthIntent(session("sesion-b", [{ method: "oauth", timestamp: nowS() - 120 }]), admin, "delete_account")).toBe(false);
    expect(rpc.mock.calls.filter(([f]) => f === "consume_reauth")).toHaveLength(1);
  });

  it("oauth posterior pero en la misma sesión que pidió el intento: no vale", async () => {
    expect(await consumeReauthIntent(session("sesion-a", [{ method: "oauth", timestamp: nowS() - 10 }]), admin, "delete_account")).toBe(false);
  });

  it("solo recovery u otp (aunque sean recientes): no vale y no consulta la base", async () => {
    for (const method of ["recovery", "otp", "magiclink"]) {
      jar.set(reauthCookieName("delete_account"), NONCE);
      expect(await consumeReauthIntent(session("sesion-b", [{ method, timestamp: nowS() - 5 }]), admin, "delete_account")).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("oauth antiguo más recovery reciente: se usa la hora del oauth (anterior al intento) y no vale", async () => {
    const amr = [{ method: "oauth", timestamp: nowS() - 600 }, { method: "recovery", timestamp: nowS() - 5 }];
    expect(await consumeReauthIntent(session("sesion-b", amr), admin, "delete_account")).toBe(false);
  });

  it("uso único también con oauth", async () => {
    const s = session("sesion-b", [{ method: "oauth", timestamp: nowS() - 10 }]);
    expect(await consumeReauthIntent(s, admin, "delete_account")).toBe(true);
    jar.set(reauthCookieName("delete_account"), NONCE);
    expect(await consumeReauthIntent(s, admin, "delete_account")).toBe(false);
  });
});

const consumed = () => rpc.mock.calls.filter(([f]) => f === "consume_reauth").length;

describe("consumeReauthIntent: oauth en cuentas con contraseña y al cambiar la contraseña (A1/M1)", () => {
  it("cuenta CON contraseña y solo oauth posterior: eliminar no vale y el intento no llega a la base", async () => {
    account.password = true;
    expect(await consumeReauthIntent(session("sesion-b", [{ method: "oauth", timestamp: nowS() - 10 }]), admin, "delete_account")).toBe(false);
    expect(consumed()).toBe(0);
  });

  it("cuenta CON contraseña: password anterior al intento más oauth posterior no vale (se usa la hora del password)", async () => {
    account.password = true;
    const amr = [{ method: "password", timestamp: nowS() - 600 }, { method: "oauth", timestamp: nowS() - 10 }];
    expect(await consumeReauthIntent(session("sesion-b", amr), admin, "delete_account")).toBe(false);
    expect(consumed()).toBe(1);
  });

  it("cuenta CON contraseña y password posterior al intento: vale", async () => {
    account.password = true;
    expect(await consumeReauthIntent(session("sesion-b", [{ method: "password", timestamp: nowS() - 10 }]), admin, "delete_account")).toBe(true);
  });

  it("cambiar la contraseña con solo oauth posterior: no vale, tenga o no contraseña la cuenta", async () => {
    intent.action = "change_password";
    for (const pw of [true, false]) {
      account.password = pw;
      intent.consumed = false;
      jar.set(reauthCookieName("change_password"), NONCE);
      expect(await consumeReauthIntent(session("sesion-b", [{ method: "oauth", timestamp: nowS() - 10 }]), admin, "change_password")).toBe(false);
    }
    expect(consumed()).toBe(0);
  });

  it("cambiar la contraseña con password posterior: vale", async () => {
    intent.action = "change_password";
    account.password = true;
    jar.set(reauthCookieName("change_password"), NONCE);
    expect(await consumeReauthIntent(session("sesion-b", [{ method: "password", timestamp: nowS() - 10 }]), admin, "change_password")).toBe(true);
  });

  it("si no se puede saber si la cuenta tiene contraseña: eliminar falla cerrado", async () => {
    account.password = "error";
    expect(await consumeReauthIntent(session("sesion-b", [{ method: "oauth", timestamp: nowS() - 10 }]), admin, "delete_account")).toBe(false);
    jar.set(reauthCookieName("delete_account"), NONCE);
    expect(await consumeReauthIntent(session("sesion-b", [{ method: "password", timestamp: nowS() - 10 }]), admin, "delete_account")).toBe(false);
    expect(consumed()).toBe(0);
  });
});

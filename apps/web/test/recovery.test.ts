import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasRecentEmailProof, readSessionProof } from "@/lib/recovery";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: unknown) => `${b64({ alg: "HS256" })}.${b64(payload)}.firma`;
const now = () => Math.floor(Date.now() / 1000);

function client(payload: Record<string, unknown>, user: unknown = { id: "u" }) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: jwt({ sub: "u", ...payload }) } } })),
    },
  } as unknown as SupabaseClient;
}

describe("readSessionProof", () => {
  it("lee session_id y la autenticación password más reciente", async () => {
    const p = await readSessionProof(
      client({ session_id: "s-1", amr: [{ method: "password", timestamp: 100 }, { method: "otp", timestamp: 300 }, { method: "password", timestamp: 200 }] }),
    );
    expect(p).toMatchObject({ userId: "u", sessionId: "s-1", passwordAuthAt: 200, oauthAuthAt: null });
  });

  it("ingreso con proveedor (oauth): queda en oauthAuthAt, no en passwordAuthAt", async () => {
    const p = await readSessionProof(client({ session_id: "s-2", amr: [{ method: "oauth", timestamp: 500 }] }));
    expect(p).toMatchObject({ passwordAuthAt: null, oauthAuthAt: 500 });
  });

  it("password y oauth: cada método conserva su propia hora (un oauth más reciente no pisa la de password)", async () => {
    const amr = [{ method: "oauth", timestamp: 400 }, { method: "password", timestamp: 300 }, { method: "oauth", timestamp: 350 }];
    expect(await readSessionProof(client({ amr }))).toMatchObject({ passwordAuthAt: 300, oauthAuthAt: 400 });
    const amr2 = [{ method: "oauth", timestamp: 400 }, { method: "password", timestamp: 450 }];
    expect(await readSessionProof(client({ amr: amr2 }))).toMatchObject({ passwordAuthAt: 450, oauthAuthAt: 400 });
  });

  it("solo métodos por correo (recovery, otp, magiclink): ninguna re-autenticación", async () => {
    const amr = [{ method: "recovery", timestamp: 1 }, { method: "otp", timestamp: 2 }, { method: "magiclink", timestamp: 3 }];
    expect(await readSessionProof(client({ session_id: "s", amr }))).toMatchObject({ passwordAuthAt: null, oauthAuthAt: null });
  });

  it("un método desconocido no cuenta, aunque sea más reciente", async () => {
    const amr = [{ method: "password", timestamp: 10 }, { method: "sso/saml", timestamp: 99 }, { method: "OAuth", timestamp: 98 }, { method: "Password", timestamp: 97 }];
    expect(await readSessionProof(client({ amr }))).toMatchObject({ passwordAuthAt: 10, oauthAuthAt: null });
  });

  it("descarta entradas de amr mal formadas", async () => {
    const p = await readSessionProof(client({ amr: [null, "x", { method: "password", timestamp: "ayer" }] }));
    expect(p?.amr).toEqual([]);
    expect(p?.sessionId).toBeNull();
  });

  it("sin usuaria validada no confía en el token", async () => {
    expect(await readSessionProof(client({ amr: [] }, null))).toBeNull();
  });

  it("token de otra usuaria que la validada: null", async () => {
    expect(await readSessionProof(client({ sub: "otra", amr: [] }))).toBeNull();
  });
});

describe("hasRecentEmailProof (flujo de recuperación, sin cambios)", () => {
  it("recuperación hace 10 minutos: sí; hace 20: no", async () => {
    expect(await hasRecentEmailProof(client({ amr: [{ method: "recovery", timestamp: now() - 600 }] }))).toBe(true);
    expect(await hasRecentEmailProof(client({ amr: [{ method: "otp", timestamp: now() - 1200 }] }))).toBe(false);
  });
  it("un ingreso con contraseña no es prueba por correo", async () => {
    expect(await hasRecentEmailProof(client({ amr: [{ method: "password", timestamp: now() }] }))).toBe(false);
  });
  it("timestamp en el futuro lejano: no", async () => {
    expect(await hasRecentEmailProof(client({ amr: [{ method: "recovery", timestamp: now() + 3600 }] }))).toBe(false);
  });
});

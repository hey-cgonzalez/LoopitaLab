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
    expect(p).toMatchObject({ userId: "u", sessionId: "s-1", passwordAuthAt: 200 });
  });

  it("sin password en amr: passwordAuthAt null", async () => {
    expect((await readSessionProof(client({ session_id: "s", amr: [{ method: "recovery", timestamp: 1 }] })))?.passwordAuthAt).toBeNull();
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

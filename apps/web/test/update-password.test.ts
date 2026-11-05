import { beforeEach, describe, expect, it, vi } from "vitest";

/** updatePassword: recuperación por correo (15 min, sin cambios) o re-autenticación atada (F2-M5). */

const state = { emailProof: false, reauthOk: false, updateError: null as { code: string; message: string } | null };
const updateUser = vi.fn(async (..._a: unknown[]) => ({ error: state.updateError }));
const signOut = vi.fn(async (..._a: unknown[]) => ({ error: null }));
const signInWithPassword = vi.fn();
const consumeReauthIntent = vi.fn(async (..._a: unknown[]) => state.reauthOk);
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`);
});

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u", email: "u@example.test" } } }), updateUser, signOut, signInWithPassword },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/recovery", () => ({ hasRecentEmailProof: async () => state.emailProof }));
vi.mock("@/app/api/_lib/reauth", () => ({ consumeReauthIntent }));

const { updatePassword } = await import("@/app/(acceso)/actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const good = { password: "nueva1234", confirm: "nueva1234" };

beforeEach(() => {
  Object.assign(state, { emailProof: false, reauthOk: false, updateError: null });
  for (const f of [updateUser, signOut, signInWithPassword, consumeReauthIntent, redirect]) f.mockClear();
});

describe("updatePassword", () => {
  it("sesión recién ingresada sin intento de re-autenticación: no cambia la contraseña", async () => {
    const res = await updatePassword({}, form(good));
    expect(res.fieldErrors?.current).toMatch(/vuelve a escribir tu contraseña/);
    expect(consumeReauthIntent).toHaveBeenCalledWith(expect.anything(), expect.anything(), "change_password");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("con re-autenticación atada: cambia, cierra otras sesiones y redirige", async () => {
    state.reauthOk = true;
    await expect(updatePassword({}, form(good))).rejects.toThrow("REDIRECT /proyectos?aviso=clave");
    expect(updateUser).toHaveBeenCalledWith({ password: "nueva1234" });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("enlace de recuperación reciente: no pide re-autenticación (flujo de 15 min sin cambios)", async () => {
    state.emailProof = true;
    await expect(updatePassword({}, form(good))).rejects.toThrow("REDIRECT");
    expect(consumeReauthIntent).not.toHaveBeenCalled();
  });

  it("la contraseña actual que llegue en el formulario se ignora: el servidor nunca la verifica", async () => {
    await updatePassword({}, form({ ...good, current: "vieja123" }));
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("contraseña nueva débil: no gasta el intento", async () => {
    state.reauthOk = true;
    const res = await updatePassword({}, form({ password: "corta", confirm: "corta" }));
    expect(res.fieldErrors?.password).toBeDefined();
    expect(consumeReauthIntent).not.toHaveBeenCalled();
  });
});

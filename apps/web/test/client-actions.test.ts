import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));

const reset = vi.fn();
const assign = vi.fn();

async function load(siteKey: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://loopitalab.test/");
  vi.stubGlobal("window", { turnstile: { reset }, location: { assign, origin: "http://localhost:3000" } });
  const m = await import("@/app/(acceso)/client-actions");
  const { CAPTCHA_MISSING } = await import("@/lib/captcha");
  return { ...m, CAPTCHA_MISSING };
}

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const login = { email: "Ana@Example.test", password: "clave1234" };
const signup = { name: "Ana", email: "ana@example.test", password: "clave1234" };

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  reset.mockReset();
  assign.mockReset();
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe("con CAPTCHA activo", () => {
  it("signIn sin token no llama a Supabase", async () => {
    const m = await load("0x4AAAA");
    const r = await m.signIn({}, form(login));
    expect(r.error).toBe(m.CAPTCHA_MISSING);
    expect(r.fields).toEqual({ email: "ana@example.test" });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signIn con token lo envía y renueva el widget", async () => {
    const m = await load("0x4AAAA");
    await m.signIn({}, form({ ...login, "cf-turnstile-response": "tok", next: "/cuenta" }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@example.test",
      password: "clave1234",
      options: { captchaToken: "tok" },
    });
    expect(reset).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/cuenta");
  });

  it("signIn con captcha_failed muestra el mensaje y renueva el widget", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: "captcha_failed", message: "x" } });
    const m = await load("0x4AAAA");
    const r = await m.signIn({}, form({ ...login, "cf-turnstile-response": "tok" }));
    expect(r.error).toMatch(/robot/);
    expect(reset).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it("signIn no redirige a otro sitio con next manipulado", async () => {
    const m = await load("0x4AAAA");
    await m.signIn({}, form({ ...login, "cf-turnstile-response": "tok", next: "//evil.test" }));
    expect(assign).toHaveBeenCalledWith("/proyectos");
  });

  it("los errores de campo van antes que el CAPTCHA", async () => {
    const m = await load("0x4AAAA");
    const r = await m.signIn({}, form({ email: "x", password: "" }));
    expect(r.fieldErrors).toBeDefined();
    expect(r.error).toBeUndefined();
  });

  it("signUp sin token no llama a Supabase; con token lo incluye en options", async () => {
    const m = await load("0x4AAAA");
    expect((await m.signUp({}, form(signup))).error).toBe(m.CAPTCHA_MISSING);
    expect(auth.signUp).not.toHaveBeenCalled();

    const r = await m.signUp({}, form({ ...signup, "cf-turnstile-response": "tok" }));
    expect(r.ok).toMatch(/ana@example.test/);
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "ana@example.test",
      password: "clave1234",
      options: {
        captchaToken: "tok",
        emailRedirectTo: "https://loopitalab.test/auth/callback?next=/proyectos",
        data: { display_name: "Ana" },
      },
    });
    expect(reset).toHaveBeenCalledOnce();
  });

  it("requestPasswordReset sin token no llama a Supabase; con token lo envía", async () => {
    const m = await load("0x4AAAA");
    expect((await m.requestPasswordReset({}, form({ email: "ana@example.test" }))).error).toBe(m.CAPTCHA_MISSING);
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();

    const r = await m.requestPasswordReset({}, form({ email: "ana@example.test", "cf-turnstile-response": "tok" }));
    expect(r.ok).toBeDefined();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@example.test", {
      redirectTo: "https://loopitalab.test/auth/callback?next=/nueva-clave",
      captchaToken: "tok",
    });
  });

  it("requestPasswordReset con captcha_failed avisa que falló la verificación", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "captcha_failed", message: "x" } });
    const m = await load("0x4AAAA");
    const r = await m.requestPasswordReset({}, form({ email: "ana@example.test", "cf-turnstile-response": "tok" }));
    expect(r.ok).toBeUndefined();
    expect(r.error).toMatch(/robot/);
  });
});

describe("con CAPTCHA desactivado", () => {
  it("signIn no exige token ni manda options", async () => {
    const m = await load("");
    await m.signIn({}, form(login));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "ana@example.test", password: "clave1234", options: undefined });
    expect(reset).not.toHaveBeenCalled();
  });

  it("signUp no incluye captchaToken", async () => {
    const m = await load("");
    await m.signUp({}, form(signup));
    expect(auth.signUp.mock.calls[0]![0].options).not.toHaveProperty("captchaToken");
  });

  it("requestPasswordReset no incluye captchaToken", async () => {
    const m = await load("");
    await m.requestPasswordReset({}, form({ email: "ana@example.test" }));
    expect(auth.resetPasswordForEmail.mock.calls[0]![1]).not.toHaveProperty("captchaToken");
  });
});

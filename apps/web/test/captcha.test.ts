import { afterEach, describe, expect, it, vi } from "vitest";

/** captcha.ts lee la clave al cargar el módulo: se recarga en cada caso. */
async function load(siteKey: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  return import("@/lib/captcha");
}

const form = (token?: string) => {
  const f = new FormData();
  if (token !== undefined) f.set("cf-turnstile-response", token);
  return f;
};

afterEach(() => vi.resetModules());

describe("captcha desactivado (sin clave)", () => {
  it("no pide token ni toca window", async () => {
    const c = await load("");
    expect(c.captchaEnabled()).toBe(false);
    expect(c.captchaOptions(form("x"))).toBeUndefined();
    expect(() => c.resetCaptcha()).not.toThrow(); // en Node no hay window
  });
});

describe("captcha activo", () => {
  it("lee el token del campo oculto de Turnstile", async () => {
    const c = await load("0x4AAAA");
    expect(c.captchaEnabled()).toBe(true);
    expect(c.captchaToken(form("tok"))).toBe("tok");
    expect(c.captchaToken(form())).toBe("");
    expect(c.captchaOptions(form("tok"))).toEqual({ captchaToken: "tok" });
    expect(c.captchaOptions(form())).toEqual({ captchaToken: "" });
  });

  it("resetCaptcha pide un token nuevo si el widget está cargado", async () => {
    const reset = vi.fn();
    vi.stubGlobal("window", { turnstile: { reset } });
    const c = await load("0x4AAAA");
    c.resetCaptcha();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("resetCaptcha no falla si el script aún no cargó", async () => {
    vi.stubGlobal("window", {});
    const c = await load("0x4AAAA");
    expect(() => c.resetCaptcha()).not.toThrow();
  });
});

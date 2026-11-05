import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callbackDestination, isReauthDone, isReauthNext } from "@/lib/auth-callback";
import { parseProviders, reauthChoice, enabledProviders } from "@/lib/auth-providers";
import { readSessionProof } from "@/lib/recovery";

const exchangeCodeForSession = vi.fn(async (_c: string) => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession } }) }));
const { GET } = await import("@/app/auth/callback/route");
const { OAuthButtons } = await import("@/components/OAuthButtons");

afterEach(() => vi.unstubAllEnvs());

describe("reauthChoice: casos extra", () => {
  const on = ["google", "azure"] as const;
  it("con contraseña y azure vinculado: solo contraseña", () => {
    expect(reauthChoice(true, [{ provider: "email" }, { provider: "azure" }], ["google"])).toEqual({ password: true, providers: [], needsPassword: false });
  });
  it("identidades vacías o null, sin contraseña: debe crear una", () => {
    expect(reauthChoice(false, [], on)).toEqual({ password: false, providers: [], needsPassword: true });
    expect(reauthChoice(false, null, on)).toEqual({ password: false, providers: [], needsPassword: true });
  });
  it("ninguno habilitado y solo proveedor: debe crear contraseña (B3)", () => {
    expect(reauthChoice(false, [{ provider: "google" }], [])).toEqual({ password: false, providers: [], needsPassword: true });
  });
  it("google+azure duplicados: sin repetir y en orden fijo", () => {
    expect(reauthChoice(false, [{ provider: "azure" }, { provider: "google" }, { provider: "google" }], on).providers).toEqual(["google", "azure"]);
  });
});

describe("enabledProviders / parseProviders: casos extra", () => {
  it("espacios, mayúsculas y duplicados", () => {
    expect(parseProviders("  GOOGLE ,  Azure , azure ")).toEqual(["google", "azure"]);
  });
  it("valores desconocidos y 'microsoft' (no es el id de Supabase)", () => {
    expect(parseProviders("microsoft,github")).toEqual([]);
    expect(parseProviders(",,,")).toEqual([]);
  });
  it("variable ausente", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDERS", undefined as unknown as string);
    delete process.env.NEXT_PUBLIC_AUTH_PROVIDERS;
    expect(enabledProviders()).toEqual([]);
  });
});

describe("callback: contrato extra", () => {
  const ORIGIN = "http://localhost:3000";
  beforeEach(() => {
    exchangeCodeForSession.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  async function go(query: string) {
    const res = await GET(new NextRequest(`${ORIGIN}/auth/callback${query}`));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe(ORIGIN);
    return `${loc.pathname}${loc.search}`;
  }
  it("next malformado con error: /ingresar?error=oauth&next=/proyectos", async () => {
    expect(await go("?error=access_denied&next=%E0%A4%A")).toBe("/ingresar?error=oauth&next=%2Fproyectos");
    expect(await go("?error=access_denied&next=//evil.com")).toBe("/ingresar?error=oauth&next=%2Fproyectos");
  });
  it("reauth_error ya presente en next: no se duplica", async () => {
    expect(await go("?error=access_denied&next=%2Fcuenta%3Freauth%3Ddelete_account%26reauth_error%3D1")).toBe("/cuenta?reauth=delete_account&reauth_error=1");
  });
  it("reauth_error=0 en next se pisa con 1", () => {
    expect(callbackDestination("/cuenta?reauth=delete_account&reauth_error=0", { kind: "exchange_failed" })).toBe("/cuenta?reauth=delete_account&reauth_error=1");
  });
  it("con error nunca se canjea el código (varios errores)", async () => {
    for (const e of ["access_denied", "server_error", "temporarily_unavailable"]) {
      await go(`?error=${e}&code=abc&next=%2Fcuenta%3Freauth%3Ddelete_account`);
    }
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("error_description no aparece en la salida, tampoco en reauth", async () => {
    const d = encodeURIComponent("SECRETO-del-proveedor");
    expect(await go(`?error=access_denied&error_description=${d}&next=%2Fcuenta%3Freauth%3Ddelete_account`)).not.toMatch(/SECRETO/);
    expect(await go(`?error=access_denied&error_code=otp_expired&error_description=${d}`)).toBe("/ingresar?error=enlace");
  });
  it("otp_expired con next de reauth: vuelve a la pantalla con reauth_error", async () => {
    expect(await go("?error=access_denied&error_code=otp_expired&next=%2Fcuenta%3Freauth%3Ddelete_account")).toBe("/cuenta?reauth=delete_account&reauth_error=1");
    expect(await go("?error=access_denied&error_code=otp_expired&next=%2Fnueva-clave%3Freauth%3Dchange_password")).toBe("/ingresar?error=enlace");
  });
  it("isReauthNext con next hostil", () => {
    expect(isReauthNext("//evil.com/cuenta?reauth=delete_account")).toBe(false);
  });
});

describe("isReauthDone", () => {
  it("true solo con la acción correcta y sin reauth_error=1", () => {
    expect(isReauthDone("delete_account", "delete_account", undefined)).toBe(true);
    expect(isReauthDone("delete_account", "delete_account", "1")).toBe(false);
    expect(isReauthDone("delete_account", "change_password", undefined)).toBe(false);
    expect(isReauthDone("change_password", undefined, undefined)).toBe(false);
    expect(isReauthDone("change_password", "change_password", "0")).toBe(true);
  });
});

describe("OAuthButtons", () => {
  const html = () => renderToStaticMarkup(createElement(OAuthButtons, { next: "/" }));
  it("sin proveedores: no renderiza nada", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDERS", "");
    expect(html()).toBe("");
  });
  it("solo desconocidos: no renderiza nada", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDERS", "github");
    expect(html()).toBe("");
  });
  it("google,azure: dos botones en orden", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDERS", "azure,google");
    const h = html();
    expect(h).toContain("Continuar con Google");
    expect(h.indexOf("Google")).toBeLessThan(h.indexOf("Microsoft"));
    expect(h).toContain("Continuar con Microsoft");
  });
});

describe("recovery: casos extra", () => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const client = (payload: Record<string, unknown>) =>
    ({
      auth: {
        getUser: async () => ({ data: { user: { id: "u" } } }),
        getSession: async () => ({ data: { session: { access_token: `${b64({})}.${b64({ sub: "u", ...payload })}.f` } } }),
      },
    }) as unknown as SupabaseClient;
  it("timestamps no numéricos se ignoran", async () => {
    const amr = [{ method: "oauth", timestamp: "999" }, { method: "password", timestamp: null }, { method: "password", timestamp: 10 }];
    expect(await readSessionProof(client({ amr }))).toMatchObject({ passwordAuthAt: 10, oauthAuthAt: null });
  });
  it("amr no es arreglo: sin autenticación fuerte", async () => {
    expect(await readSessionProof(client({ amr: "password" }))).toMatchObject({ passwordAuthAt: null, oauthAuthAt: null, amr: [] });
  });
  it("method desconocido más reciente no desplaza a oauth", async () => {
    const amr = [{ method: "saml", timestamp: 999 }, { method: "oauth", timestamp: 5 }];
    expect(await readSessionProof(client({ amr }))).toMatchObject({ passwordAuthAt: null, oauthAuthAt: 5 });
  });
});

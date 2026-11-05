import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callbackUrl,
  enabledProviders,
  identityLabel,
  linkedProviders,
  oauthOptions,
  parseProviders,
  providerLabel,
  reauthChoice,
} from "@/lib/auth-providers";

afterEach(() => vi.unstubAllEnvs());

describe("proveedores habilitados", () => {
  it("vacío o ausente: solo correo", () => {
    expect(parseProviders(undefined)).toEqual([]);
    expect(parseProviders("")).toEqual([]);
  });
  it("ordena google, azure e ignora valores inválidos", () => {
    expect(parseProviders("azure, google")).toEqual(["google", "azure"]);
    expect(parseProviders("github,AZURE,,facebook")).toEqual(["azure"]);
    expect(parseProviders("google,google")).toEqual(["google"]);
  });
  it("lee NEXT_PUBLIC_AUTH_PROVIDERS", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDERS", "google,azure");
    expect(enabledProviders()).toEqual(["google", "azure"]);
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDERS", "");
    expect(enabledProviders()).toEqual([]);
  });
  it("nombres", () => {
    expect(providerLabel("google")).toBe("Google");
    expect(providerLabel("azure")).toBe("Microsoft");
    expect(identityLabel("email")).toBe("Correo y contraseña");
    expect(identityLabel("github")).toBeUndefined();
  });
});

describe("oauthOptions", () => {
  const redirectTo = "http://localhost/auth/callback?next=%2F";
  it("azure siempre pide el scope email", () => {
    expect(oauthOptions("azure", { redirectTo })).toEqual({ redirectTo, scopes: "email" });
  });
  it("google normal no agrega parámetros", () => {
    expect(oauthOptions("google", { redirectTo })).toEqual({ redirectTo });
  });
  it("re-autenticación fuerza volver a ingresar", () => {
    expect(oauthOptions("azure", { redirectTo, reauth: true })).toEqual({ redirectTo, scopes: "email", queryParams: { prompt: "login" } });
    expect(oauthOptions("google", { redirectTo, reauth: true }).queryParams).toEqual({ prompt: "select_account", max_age: "0" });
  });
  it("redirectTo pasa por /auth/callback con next codificado", () => {
    expect(callbackUrl("https://x.test", "/cuenta?reauth=delete_account")).toBe("https://x.test/auth/callback?next=%2Fcuenta%3Freauth%3Ddelete_account");
  });
});

describe("re-autenticación: contraseña o proveedor", () => {
  const on = ["google", "azure"] as const;
  it("con contraseña: solo contraseña, sin botones de proveedor", () => {
    expect(reauthChoice(true, [{ provider: "email" }], on)).toEqual({ password: true, providers: [], needsPassword: false });
    expect(reauthChoice(true, [{ provider: "azure" }, { provider: "email" }], on)).toEqual({ password: true, providers: [], needsPassword: false });
  });
  it("sin contraseña y con proveedor habilitado: confirma con el proveedor", () => {
    expect(reauthChoice(false, [{ provider: "google" }], on)).toEqual({ password: false, providers: ["google"], needsPassword: false });
  });
  it("sin contraseña y proveedor no habilitado: debe crear contraseña", () => {
    expect(reauthChoice(false, [{ provider: "google" }], ["azure"])).toEqual({ password: false, providers: [], needsPassword: true });
    expect(reauthChoice(false, undefined, on).needsPassword).toBe(true);
    expect(linkedProviders([{ provider: "github" }])).toEqual([]);
  });
});

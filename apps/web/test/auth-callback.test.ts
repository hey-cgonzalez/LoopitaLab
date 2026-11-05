import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "@/lib/env";
import { callbackDestination, isReauthNext } from "@/lib/auth-callback";

/** /auth/callback: correos (PKCE) y vuelta desde Google/Microsoft. Contrato en lib/auth-callback.ts. */

const exchange = { error: null as { message: string } | null };
const exchangeCodeForSession = vi.fn(async (_code: string) => ({ error: exchange.error }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession } }) }));

const { GET } = await import("@/app/auth/callback/route");

const ORIGIN = "http://localhost:3000";
async function go(query: string) {
  const res = await GET(new NextRequest(`${ORIGIN}/auth/callback${query}`));
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  const loc = new URL(res.headers.get("location")!);
  expect(loc.origin).toBe(ORIGIN);
  return `${loc.pathname}${loc.search}`;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  exchange.error = null;
  exchangeCodeForSession.mockClear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("GET /auth/callback", () => {
  it("código válido: canjea y va a next (con su query)", async () => {
    expect(await go("?code=abc&next=%2Fcuenta%3Freauth%3Ddelete_account")).toBe("/cuenta?reauth=delete_account");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("sin next: /proyectos", async () => {
    expect(await go("?code=abc")).toBe("/proyectos");
  });

  it("canje fallido o sin código: /ingresar?error=enlace (como antes)", async () => {
    exchange.error = { message: "x" };
    expect(await go("?code=abc&next=/proyectos")).toBe("/ingresar?error=enlace");
    expect(await go("?next=/proyectos")).toBe("/ingresar?error=enlace");
  });

  it("la usuaria cancela en el proveedor (error=access_denied): /ingresar?error=oauth, sin reflejar la descripción", async () => {
    const desc = encodeURIComponent("<script>alert(1)</script> usuario canceló");
    const dest = await go(`?error=access_denied&error_description=${desc}&next=/proyectos`);
    expect(dest).toBe("/ingresar?error=oauth&next=%2Fproyectos");
    expect(dest).not.toMatch(/script|cancel/i);
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/script|cancel/i);
  });

  it("error con código de error raro: se registra saneado", async () => {
    await go(`?error=${encodeURIComponent("x\nFAKE LOG")}&next=/proyectos`);
    expect(warn.mock.calls[0]).toContain("desconocido");
  });

  it("error aunque venga también un código: no canjea", async () => {
    expect(await go("?error=server_error&code=abc")).toBe("/ingresar?error=oauth&next=%2Fproyectos");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("enlace de correo vencido (error_code=otp_expired): /ingresar?error=enlace", async () => {
    expect(await go("?error=access_denied&error_code=otp_expired&next=/nueva-clave")).toBe("/ingresar?error=enlace");
  });

  it("re-autenticación cancelada: vuelve a la pantalla con reauth_error=1", async () => {
    expect(await go("?error=access_denied&next=%2Fcuenta%3Freauth%3Ddelete_account")).toBe("/cuenta?reauth=delete_account&reauth_error=1");
    // /nueva-clave ya no es vuelta de re-autenticación con proveedor (M1): es un ingreso fallido.
    expect(await go("?error=access_denied&next=%2Fnueva-clave%3Freauth%3Dchange_password")).toBe(
      "/ingresar?error=oauth&next=%2Fnueva-clave%3Freauth%3Dchange_password",
    );
  });

  it("re-autenticación con canje fallido: también reauth_error=1", async () => {
    exchange.error = { message: "x" };
    expect(await go("?code=abc&next=%2Fcuenta%3Freauth%3Ddelete_account")).toBe("/cuenta?reauth=delete_account&reauth_error=1");
  });

  it("next externo: nunca sale del sitio", async () => {
    expect(await go("?code=abc&next=%2F%2Fevil.com")).toBe("/proyectos");
    expect(await go("?error=access_denied&next=https%3A%2F%2Fevil.com")).toBe("/ingresar?error=oauth&next=%2Fproyectos");
  });
});

describe("callbackDestination / isReauthNext", () => {
  it("solo /cuenta y /nueva-clave con una acción conocida son re-autenticación", () => {
    expect(isReauthNext("/cuenta?reauth=delete_account")).toBe(true);
    expect(isReauthNext("/nueva-clave?reauth=change_password")).toBe(false); // M1: sin proveedor
    expect(isReauthNext("/cuenta?reauth=change_password")).toBe(false);
    expect(isReauthNext("/cuenta")).toBe(false);
    expect(isReauthNext("/nueva-clave")).toBe(false); // enlace de recuperación
    expect(isReauthNext("/cuenta?reauth=otra")).toBe(false);
    expect(isReauthNext("/proyectos?reauth=delete_account")).toBe(false);
  });
  it("reauth_error se fija una sola vez", () => {
    expect(callbackDestination("/cuenta?reauth=delete_account&reauth_error=1", { kind: "exchange_failed" })).toBe("/cuenta?reauth=delete_account&reauth_error=1");
  });
});

describe("safeNext", () => {
  it("acepta rutas internas con query string", () => {
    expect(safeNext("/cuenta?reauth=delete_account")).toBe("/cuenta?reauth=delete_account");
    expect(safeNext("/nueva-clave?reauth=change_password&x=1")).toBe("/nueva-clave?reauth=change_password&x=1");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "https:evil.com", "javascript:alert(1)", "/\t/evil.com", "evil.com", "", "/cuenta#x"])(
    "rechaza %j",
    (bad) => expect(safeNext(bad)).toBe("/proyectos"),
  );
  it("nulo o ausente: fallback", () => {
    expect(safeNext(null)).toBe("/proyectos");
    expect(safeNext(undefined, "/cuenta")).toBe("/cuenta");
  });
});

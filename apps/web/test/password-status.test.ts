import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPassword } from "@/lib/password-status";

const result = { value: { data: true as unknown, error: null as { code?: string; message: string } | null } };
const rpc = vi.fn(async (_fn: string, _a: Record<string, unknown>) => result.value);
const admin = { rpc } as unknown as SupabaseClient;
const errors = { calls: [] as unknown[][] };

beforeEach(() => {
  rpc.mockClear();
  errors.calls = [];
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.calls.push(a));
});

describe("hasPassword", () => {
  it("consulta public.user_has_password con la usuaria y devuelve el booleano", async () => {
    result.value = { data: true, error: null };
    expect(await hasPassword(admin, "u-1")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("user_has_password", { p_user: "u-1" });
    result.value = { data: false, error: null };
    expect(await hasPassword(admin, "u-1")).toBe(false);
  });

  it("error de la base: null, y el registro no lleva el id de la usuaria", async () => {
    result.value = { data: null, error: { code: "42501", message: "permission denied" } };
    expect(await hasPassword(admin, "usuaria-secreta")).toBeNull();
    expect(JSON.stringify(errors.calls)).not.toContain("usuaria-secreta");
  });

  it("respuesta que no es booleana: null", async () => {
    for (const data of [null, "true", 1, {}]) {
      result.value = { data, error: null };
      expect(await hasPassword(admin, "u-1")).toBeNull();
    }
  });

  it("excepción del cliente: null", async () => {
    rpc.mockImplementationOnce(async () => {
      throw new Error("red caída");
    });
    expect(await hasPassword(admin, "u-1")).toBeNull();
  });
});

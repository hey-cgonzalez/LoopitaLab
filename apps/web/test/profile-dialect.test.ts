import { beforeEach, describe, expect, it, vi } from "vitest";

/** Acciones del dialecto de patrones (profiles.pattern_dialect, T8 de la fase 4). */

const calls: { update?: unknown; eq?: unknown[] } = {};
const state = {
  user: { id: "u1" } as { id: string } | null,
  updateError: null as null | { code?: string; message: string },
  updateRows: [{ id: "u1" }] as { id: string }[],
  selectData: { pattern_dialect: "uk" } as { pattern_dialect: unknown } | null,
  selectError: null as null | { code?: string; message: string },
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      expect(table).toBe("profiles");
      return {
        update: (v: unknown) => {
          calls.update = v;
          return {
            eq: (...a: unknown[]) => {
              calls.eq = a;
              return { select: async () => ({ data: state.updateError ? null : state.updateRows, error: state.updateError }) };
            },
          };
        },
        select: () => ({
          eq: (...a: unknown[]) => {
            calls.eq = a;
            return { maybeSingle: async () => ({ data: state.selectData, error: state.selectError }) };
          },
        }),
      };
    },
  }),
}));

const { updatePatternDialect, getPatternDialect } = await import("@/app/cuenta/actions");

beforeEach(() => {
  for (const k of Object.keys(calls)) delete (calls as Record<string, unknown>)[k];
  Object.assign(state, {
    user: { id: "u1" },
    updateError: null,
    updateRows: [{ id: "u1" }],
    selectData: { pattern_dialect: "uk" },
    selectError: null,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("updatePatternDialect", () => {
  it.each(["es", "us", "uk"])("guarda %s filtrando por el id de la sesión", async (d) => {
    const res = await updatePatternDialect(d);
    expect(res.ok).toBeDefined();
    expect(res.dialect).toBe(d);
    expect(calls.update).toEqual({ pattern_dialect: d });
    expect(calls.eq).toEqual(["id", "u1"]);
  });
  it.each(["es-uk", "ES", "", null, undefined, 3, "uk; drop table profiles"])("rechaza %j sin tocar la base", async (d) => {
    const res = await updatePatternDialect(d);
    expect(res.error).toMatch(/No reconocemos/);
    expect(calls.update).toBeUndefined();
  });
  it("sin sesión no guarda", async () => {
    state.user = null;
    const res = await updatePatternDialect("us");
    expect(res.error).toMatch(/sesión/);
    expect(calls.update).toBeUndefined();
  });
  it("no expone el mensaje de Postgres", async () => {
    state.updateError = { code: "23514", message: 'new row violates check constraint "profiles_pattern_dialect_check"' };
    const res = await updatePatternDialect("us");
    expect(res.error).toMatch(/No pudimos guardar/);
    expect(JSON.stringify(res)).not.toMatch(/check constraint|profiles_pattern/);
  });
  it("si no actualizó ninguna fila lo avisa", async () => {
    state.updateRows = [];
    expect((await updatePatternDialect("us")).error).toMatch(/perfil/);
  });
});

describe("getPatternDialect", () => {
  it("lee el dialecto de la sesión", async () => {
    expect(await getPatternDialect()).toEqual({ dialect: "uk" });
    expect(calls.eq).toEqual(["id", "u1"]);
  });
  it("un valor desconocido o ausente cae en es", async () => {
    state.selectData = { pattern_dialect: "es-uk" };
    expect((await getPatternDialect()).dialect).toBe("es");
    state.selectData = null;
    expect((await getPatternDialect()).dialect).toBe("es");
  });
  it("sin sesión da error en español", async () => {
    state.user = null;
    expect((await getPatternDialect()).error).toMatch(/sesión/);
  });
  it("no expone el mensaje de Postgres", async () => {
    state.selectError = { code: "42703", message: 'column "pattern_dialect" does not exist' };
    const res = await getPatternDialect();
    expect(res.error).toMatch(/No pudimos leer/);
    expect(JSON.stringify(res)).not.toMatch(/column/);
  });
});

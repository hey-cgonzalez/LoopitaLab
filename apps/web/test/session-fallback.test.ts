import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * requireUser (lib/session.ts): la relectura sin `mirror_knitting` debe usarse solo cuando
 * la columna no existe (migración 20261106010000 sin aplicar). Cualquier otro error de la
 * base no debe convertirse en silencio en "mirror_knitting = false", porque /cuenta
 * mostraría el interruptor apagado y, al guardar otras preferencias, escribiría false
 * sobre el true real de la usuaria.
 *
 * Errores con la forma que devuelve PostgREST: `{ code, message, details, hint }`.
 */

type DbError = { code: string; message: string; details: string | null; hint: string | null };
const MISSING_COLUMN: DbError = { code: "42703", message: "column profiles.mirror_knitting does not exist", details: null, hint: null };
const TIMEOUT: DbError = { code: "57014", message: "canceling statement due to statement timeout", details: null, hint: null };
const JWT_EXPIRED: DbError = { code: "PGRST301", message: "JWT expired", details: null, hint: null };

const row = { display_name: "Ana", terminology: "es", units: "metric", dominant_hand: "left" };
const state: {
  full: { data: unknown; error: DbError | null };
  base: { data: unknown; error: DbError | null };
  updateError: DbError | null;
} = { full: { data: null, error: null }, base: { data: null, error: null }, updateError: null };
const selects: string[] = [];
const update = vi.fn((..._a: unknown[]) => ({ eq: async (..._b: unknown[]) => ({ error: state.updateError }) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u", email: "ana@example.test" } } }) },
    from: () => ({
      update,
      select: (cols: string) => {
        selects.push(cols);
        const res = cols.includes("mirror_knitting") ? state.full : state.base;
        return { eq: () => ({ maybeSingle: async () => res }) };
      },
    }),
  }),
}));

const { requireUser } = await import("@/lib/session");
const { updateProfile } = await import("@/app/cuenta/actions");

beforeEach(() => {
  selects.length = 0;
  update.mockClear();
  state.full = { data: { ...row, mirror_knitting: true }, error: null };
  state.base = { data: row, error: null };
  state.updateError = null;
});

describe("requireUser: lectura de mirror_knitting", () => {
  it("sin error usa una sola consulta y el valor real", async () => {
    const { profile } = await requireUser("/cuenta");
    expect(profile?.mirror_knitting).toBe(true);
    expect(selects).toHaveLength(1);
  });

  it("perfil inexistente (data null, sin error) no relee y deja profile en null", async () => {
    state.full = { data: null, error: null };
    const { profile, name } = await requireUser("/cuenta");
    expect(profile).toBeNull();
    expect(name).toBe("ana");
    expect(selects).toHaveLength(1);
  });

  it("columna inexistente (42703, forma real de PostgREST): relee sin ella y usa false", async () => {
    state.full = { data: null, error: MISSING_COLUMN };
    const { profile } = await requireUser("/cuenta");
    expect(profile).toEqual({ ...row, mirror_knitting: false });
    expect(selects).toEqual([
      "display_name, terminology, units, dominant_hand, mirror_knitting",
      "display_name, terminology, units, dominant_hand",
    ]);
  });

  it("columna inexistente y la relectura también falla: no lanza y profile queda en null", async () => {
    state.full = { data: null, error: MISSING_COLUMN };
    state.base = { data: null, error: TIMEOUT };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { profile } = await requireUser("/cuenta");
    expect(profile).toBeNull();
    // Se registra solo el código del error, sin mensaje ni datos personales.
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("releer"), "57014");
    for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toMatch(/ana|example\.test|statement timeout/);
    spy.mockRestore();
  });

  // QA F1 (corregido): solo "columna inexistente" (42703 / PGRST204) relee sin la columna.
  it("un timeout (57014) NO se trata como columna inexistente", async () => {
    state.full = { data: null, error: TIMEOUT };
    await requireUser("/cuenta").catch(() => undefined);
    expect(selects).toHaveLength(1);
  });

  it("un JWT vencido (PGRST301) NO se trata como columna inexistente", async () => {
    state.full = { data: null, error: JWT_EXPIRED };
    await requireUser("/cuenta").catch(() => undefined);
    expect(selects).toHaveLength(1);
  });

  it("un error transitorio no presenta mirror_knitting = false cuando la base tiene true", async () => {
    // La primera consulta falla por un timeout; la segunda (sin la columna) responde.
    state.full = { data: null, error: TIMEOUT };
    const result = await requireUser("/cuenta").catch(() => null);
    // Aceptable: lanzar (result null) o no inventar el valor. No aceptable: false.
    expect(result?.profile?.mirror_knitting).not.toBe(false);
  });
});

describe("updateProfile sin la columna mirror_knitting", () => {
  it("si la migración no está aplicada, guarda el resto de las preferencias sin mirror_knitting (QA O1)", async () => {
    state.updateError = { code: "PGRST204", message: "Could not find the 'mirror_knitting' column of 'profiles' in the schema cache", details: null, hint: null };
    const f = new FormData();
    for (const [k, v] of Object.entries({ display_name: "Ana", terminology: "es", units: "metric", dominant_hand: "right" })) f.set(k, v);
    await updateProfile({}, f);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({ mirror_knitting: false }));
    expect(update.mock.calls[1]?.[0]).not.toHaveProperty("mirror_knitting");
  });

  it("otro error al guardar no reintenta sin la columna", async () => {
    state.updateError = { code: "57014", message: "timeout", details: null, hint: null };
    const f = new FormData();
    for (const [k, v] of Object.entries({ display_name: "Ana", terminology: "es", units: "metric", dominant_hand: "right" })) f.set(k, v);
    const res = await updateProfile({}, f);
    expect(res.error).toMatch(/No pudimos guardar/);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("valores de checkbox distintos de 'on' (por ejemplo 'true' o vacío) se rechazan sin consultar", async () => {
    for (const v of ["true", "", "1", "off"]) {
      const f = new FormData();
      f.set("mirror_knitting", v);
      const res = await updateProfile({}, f);
      expect(res.error, v).toMatch(/no reconocemos/);
    }
    expect(update).not.toHaveBeenCalled();
  });
});

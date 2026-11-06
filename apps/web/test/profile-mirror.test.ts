import { beforeEach, describe, expect, it, vi } from "vitest";

/** updateProfile: interruptor "Tejer en espejo" (mirror_knitting) y lectura tolerante en requireUser. */

const update = vi.fn((..._a: unknown[]) => ({ eq: async (..._b: unknown[]) => ({ error: null as null | { message: string } }) }));
const selects: string[] = [];
const state = { user: { id: "u", email: "u@example.test" } as { id: string; email: string } | null, failFull: false };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => {
    throw new Error(`REDIRECT ${u}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      update,
      select: (cols: string) => {
        selects.push(cols);
        const hasMirror = cols.includes("mirror_knitting");
        return {
          eq: () => ({
            maybeSingle: async () =>
              hasMirror && state.failFull
                ? { data: null, error: { code: "42703", message: 'column "mirror_knitting" does not exist' } }
                : { data: { display_name: "Ana", terminology: "es", units: "metric", dominant_hand: "left", ...(hasMirror ? { mirror_knitting: true } : {}) }, error: null },
          }),
        };
      },
    }),
  }),
}));

const { updateProfile } = await import("@/app/cuenta/actions");
const { requireUser, DEFAULT_WEIGHT_LABEL } = await import("@/lib/session");

const base = { display_name: "Ana", terminology: "es", units: "metric", dominant_hand: "right" };
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  update.mockClear();
  selects.length = 0;
  Object.assign(state, { user: { id: "u", email: "u@example.test" }, failFull: false });
});

describe("updateProfile mirror_knitting", () => {
  it("checkbox marcado guarda true", async () => {
    const res = await updateProfile({}, form({ ...base, mirror_knitting: "on" }));
    expect(res.ok).toBeDefined();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ mirror_knitting: true, dominant_hand: "right" }));
  });
  it("checkbox ausente guarda false", async () => {
    await updateProfile({}, form(base));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ mirror_knitting: false }));
  });
  it("valor no booleano se rechaza sin guardar", async () => {
    const res = await updateProfile({}, form({ ...base, mirror_knitting: "maybe" }));
    expect(res.error).toMatch(/no reconocemos/);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("requireUser", () => {
  it("lee mirror_knitting", async () => {
    const { profile } = await requireUser("/cuenta");
    expect(profile?.mirror_knitting).toBe(true);
  });
  it("si la columna no existe, relee sin ella y usa false", async () => {
    state.failFull = true;
    const { profile } = await requireUser("/cuenta");
    expect(profile?.mirror_knitting).toBe(false);
    expect(profile?.dominant_hand).toBe("left");
    expect(selects).toHaveLength(2);
  });
});

describe("yarn-catalog desde la web", () => {
  it("importa el JSON con atributos y resuelve grosor y muestra", async () => {
    const { suggestedGauge } = await import("@/lib/yarn");
    expect(DEFAULT_WEIGHT_LABEL).toMatch(/Aran/);
    expect(suggestedGauge(4, "knit")).toBeDefined();
  });
});

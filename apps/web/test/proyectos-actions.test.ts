import { beforeEach, describe, expect, it, vi } from "vitest";

// Simulación mínima de Supabase: solo insert en projects, con el error que devuelve la base.
let nextError: { code?: string; message: string } | null = null;
const insert = vi.fn(async (_row: unknown) => ({ error: nextError }));
const from = vi.fn((_table: string) => ({ insert }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createProject } = await import("@/app/proyectos/actions");

const form = (title: string) => {
  const f = new FormData();
  f.set("title", title);
  return f;
};

beforeEach(() => {
  nextError = null;
  insert.mockClear();
  from.mockClear();
});

describe("createProject", () => {
  it("crea el proyecto sin error", async () => {
    const r = await createProject({}, form("Gorro para Sofía"));
    expect(r).toEqual({});
    expect(from).toHaveBeenCalledWith("projects");
    expect(insert).toHaveBeenCalledWith({ title: "Gorro para Sofía" });
  });

  it("el tope 54000 da el mensaje de 1000 proyectos, no el texto de la base", async () => {
    nextError = { code: "54000", message: "Llegaste al tope de 1000 proyectos" };
    const r = await createProject({}, form("Otro"));
    expect(r.error).toBe("Llegaste al tope de 1000 proyectos. No podemos crear otro por ahora.");
  });

  it("otro error de la base da el mensaje genérico, sin el texto de la base", async () => {
    nextError = { code: "42501", message: "permission denied for table projects" };
    const r = await createProject({}, form("Otro"));
    expect(r.error).toBe("No pudimos crear el proyecto. Revisa tu conexión e intenta de nuevo.");
    expect(JSON.stringify(r)).not.toMatch(/permission denied|projects/);
  });

  it("valida el título antes de tocar la base", async () => {
    expect(await createProject({}, form("   "))).toEqual({ error: "Ponle un nombre al proyecto." });
    expect(insert).not.toHaveBeenCalled();
  });
});

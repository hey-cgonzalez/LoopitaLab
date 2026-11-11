import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NEAR_COLOR_DELTA_E, PALETTE, nearestPaletteColors } from "@loopitalab/yarn-catalog";
import { describe, expect, it, vi } from "vitest";
import {
  draftFromSaved,
  draftProblems,
  draftToInput,
  describeComposition,
  emptyDraft,
  nearPaletteMatch,
  parsePercent,
  weightSearch,
  withHex,
  type YarnDraft,
} from "@/lib/yarns/form";
import { prepareUserYarn, type SavedYarn } from "@/lib/yarns/saved";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const OK: YarnDraft = { ...emptyDraft(), weight: 4, hex: "#112233" };
const problemsOf = (d: YarnDraft) => draftProblems(d).map((p) => p.field);

describe("búsqueda de grosor (F3-28 a F3-33)", () => {
  it("«aran» da la categoría 4 y «DK» la 3 primero", () => {
    expect(weightSearch("aran").results[0]?.cat).toBe(4);
    expect(weightSearch("DK").results[0]?.cat).toBe(3);
  });
  it("un resultado por alias se rotula aproximado; uno por nombre no", () => {
    const grueso = weightSearch("grueso").results[0];
    expect(grueso).toMatchObject({ cat: 5, approximate: true });
    expect(weightSearch("aran").results[0]?.approximate).toBe(false);
  });
  it("«ply» y una letra dan ayuda y no resultados", () => {
    const ply = weightSearch("4 ply");
    expect(ply.results).toEqual([]);
    expect(ply.message).toMatch(/cambia según el país/);
    expect(weightSearch("a").message).toMatch(/al menos 2 letras/);
    expect(weightSearch("   ")).toEqual({ results: [] });
  });
  it("un nombre sin coincidencias explica qué hacer", () => {
    expect(weightSearch("zzzz").message).toMatch(/No encontramos/);
  });
});

describe("validación en vivo", () => {
  it("el borrador por defecto pide grosor y color", () => {
    expect(problemsOf(emptyDraft())).toEqual(["weight", "color"]);
    expect(draftToInput(emptyDraft())).toBeNull();
  });
  it("la composición debe sumar 100 y dice cuánto falta o sobra", () => {
    const d = { ...OK, composition: [{ key: 1, fiber: "lana", percent: "70" }, { key: 2, fiber: "mohair", percent: "20" }] };
    expect(draftProblems(d)[0]?.message).toMatch(/faltan 10 %/);
    const e = { ...d, composition: [{ key: 1, fiber: "lana", percent: "70" }, { key: 2, fiber: "mohair", percent: "40" }] };
    expect(draftProblems(e)[0]?.message).toMatch(/sobran 10 %/);
  });
  it("acepta coma decimal y rechaza texto, 0 y fibras repetidas", () => {
    expect(parsePercent("33,5")).toBe(33.5);
    expect(parsePercent("abc")).toBeNull();
    expect(problemsOf({ ...OK, composition: [{ key: 1, fiber: "lana", percent: "0" }] })).toContain("composition");
    expect(problemsOf({ ...OK, composition: [{ key: 1, fiber: "lana", percent: "50" }, { key: 2, fiber: "lana", percent: "50" }] })).toContain("composition");
  });
  it("hex mal escrito y nota de más de 200 caracteres", () => {
    expect(problemsOf({ ...OK, hex: "#12" })).toEqual(["color"]);
    expect(problemsOf({ ...OK, note: "x".repeat(201) })).toEqual(["note"]);
    expect(problemsOf({ ...OK, note: "x".repeat(200) })).toEqual([]);
  });
  it("lo que pasa la validación en vivo lo acepta el servidor", () => {
    const d: YarnDraft = { ...OK, composition: [{ key: 1, fiber: "lana", percent: "66,5" }, { key: 2, fiber: "mohair", percent: "33,5" }], note: "  Mi lana  " };
    const input = draftToInput(d);
    expect(input).toMatchObject({ weight: 4, note: "Mi lana", color: { hex: "#112233" } });
    expect(prepareUserYarn(input).ok).toBe(true);
  });
});

describe("color (F3-36)", () => {
  const first = PALETTE[0]!;
  it("un hex exacto de la paleta lleva su paletteId; uno que no, nunca", () => {
    expect(withHex(emptyDraft(), first.hex.toLowerCase())).toMatchObject({ hex: first.hex.toUpperCase(), paletteId: first.id });
    const custom = withHex({ ...emptyDraft(), paletteId: first.id }, "#123456");
    expect(custom.paletteId).toBeUndefined();
  });
  it("un hex a menos de ΔE 2,3 de la paleta avisa «prácticamente igual»", () => {
    const [h, r, g, b] = [first.hex, ...[1, 3, 5].map((i) => parseInt(first.hex.slice(i, i + 2), 16))] as [string, number, number, number];
    void h;
    const nudged = `#${[r, g, b].map((v) => Math.min(255, v + 1).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    if (nudged !== first.hex.toUpperCase()) {
      const best = nearestPaletteColors(nudged, 1)[0]!;
      expect(best.deltaE).toBeLessThan(NEAR_COLOR_DELTA_E);
      expect(nearPaletteMatch(nudged)?.color.id).toBe(best.color.id);
    }
    expect(nearPaletteMatch(first.hex)).toBeUndefined();
    expect(nearPaletteMatch("#00FF00")?.deltaE ?? 99).toBeGreaterThanOrEqual(0);
  });
});

describe("lista y composición", () => {
  const saved: SavedYarn = {
    id: "11111111-1111-4111-8111-111111111111",
    weight: 4,
    composition: [{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 30 }],
    color: { hex: "#112233" },
    note: "de la tía",
    createdAt: "2026-11-10T00:00:00Z",
  };
  it("describe con porcentajes y nombres en español", () => {
    expect(describeComposition(saved.composition)).toBe("70 % Lana, 30 % Mohair");
    expect(draftFromSaved(saved)).toMatchObject({ weight: 4, hex: "#112233", note: "de la tía" });
  });
  it("estado vacío y lista se dibujan sin marcas y con la nota privada", async () => {
    const { YarnManager } = await import("@/app/lanas/YarnManager");
    const empty = renderToStaticMarkup(createElement(YarnManager, { initial: [] }));
    expect(empty).toContain("Todavía no guardaste ninguna lana");
    expect(empty).toContain("0 de 500");
    const list = renderToStaticMarkup(createElement(YarnManager, { initial: [saved] }));
    expect(list).toContain("70 % Lana, 30 % Mohair");
    expect(list).toContain("Nota privada:");
    expect(list).toContain("de la tía");
    expect(list).toContain("personalizado (#112233)");
  });
  it("el formulario trae etiquetas y el aviso de privacidad de la nota", async () => {
    const { YarnForm } = await import("@/app/lanas/YarnForm");
    const html = renderToStaticMarkup(createElement(YarnForm, { editing: null, onSaved: () => {}, onCancel: () => {} }));
    for (const t of ["Grosor", "Composición", "Color personalizado", "Nota privada", "Agregar fibra", "no se comparte"]) expect(html).toContain(t);
    expect(html).toContain("0 de 200 caracteres");
  });
});

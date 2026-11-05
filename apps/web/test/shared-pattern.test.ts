import { beforeEach, describe, expect, it, vi } from "vitest";
import { ballPattern, smallChart } from "../../../packages/pattern-core/test/support/fixtures.ts";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const { checkSharedRow, getSharedPattern, isUuid, listPublicPatterns } = await import("@/lib/shared-pattern");

const ID = "aaaaaaaa-0000-4000-8000-000000000002";

function row(document: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: ID,
    title: "Gorro de Ana",
    technique: "knit",
    kind: "chart",
    schema_version: 1,
    origin: "manual",
    document,
    author_name: "Ana",
    updated_at: "2026-11-05T00:00:00Z",
    ...extra,
  };
}

beforeEach(() => rpc.mockReset());

describe("isUuid", () => {
  it.each([
    "aaaaaaaa-0000-0000-0000-000000000002",
    "AAAAAAAA-0000-0000-0000-00000000000F",
    "123e4567-e89b-12d3-a456-426614174000",
  ])("acepta %s", (v) => expect(isUuid(v)).toBe(true));

  it.each([
    "",
    "no-es-uuid",
    "aaaaaaaa-0000-0000-0000-00000000000",
    "aaaaaaaa-0000-0000-0000-0000000000022",
    "aaaaaaaa00000000000000000000000002",
    " aaaaaaaa-0000-0000-0000-000000000002",
    "aaaaaaaa-0000-0000-0000-000000000002\n",
    "gggggggg-0000-0000-0000-000000000002",
    "aaaaaaaa-0000-0000-0000-000000000002' or 1=1 --",
    "{aaaaaaaa-0000-0000-0000-000000000002}",
  ])("rechaza %j", (v) => expect(isUuid(v)).toBe(false));

  it.each([null, undefined, 42, {}, ["aaaaaaaa-0000-0000-0000-000000000002"]])("rechaza lo que no es texto: %j", (v) =>
    expect(isUuid(v)).toBe(false),
  );
});

describe("checkSharedRow", () => {
  it("un gráfico válido se devuelve utilizable, con sus metadatos y sin owner_id", () => {
    const doc = smallChart();
    const r = checkSharedRow(row(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pattern).toEqual(doc);
    expect(r.warnings).toEqual([]);
    expect(r.meta).toEqual({
      id: ID,
      title: "Gorro de Ana",
      technique: "knit",
      kind: "chart",
      origin: "manual",
      authorName: "Ana",
      updatedAt: "2026-11-05T00:00:00Z",
    });
    expect(JSON.stringify(r.meta)).not.toMatch(/owner/);
  });

  it("un patrón escrito válido (bolita) también", () => {
    const r = checkSharedRow(row(ballPattern(), { kind: "written", technique: "crochet" }));
    expect(r.ok).toBe(true);
  });

  it("los avisos no impiden usarlo, pero se devuelven", () => {
    const doc = smallChart();
    doc.origin = { kind: "ai" }; // sin modelo: aviso ORIGIN_AI_MODEL
    const r = checkSharedRow(row(doc, { origin: "ai" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((i) => i.code)).toContain("ORIGIN_AI_MODEL");
    expect(r.warnings.every((i) => i.severity === "warning")).toBe(true);
  });

  it("un conteo que no cuadra deja el documento inutilizable", () => {
    const doc = ballPattern();
    doc.parts[0]!.rounds[2]!.expected = 20;
    const r = checkSharedRow(row(doc, { kind: "written" }));
    expect(r).toMatchObject({ id: ID, ok: false, reason: "invalid_document" });
    if (r.ok) return;
    expect(r.issues.map((i) => i.code)).toContain("ROUND_COUNT_MISMATCH");
    expect(r).not.toHaveProperty("pattern");
    expect(r).not.toHaveProperty("meta");
  });

  it("celdas fuera de tamaño en el gráfico invalidan", () => {
    const doc = smallChart();
    doc.chart.cells = doc.chart.cells.slice(0, 5);
    expect(checkSharedRow(row(doc)).ok).toBe(false);
  });

  it.each([
    ["null", null],
    ["texto", "hola"],
    ["arreglo", []],
    ["objeto vacío", {}],
    ["versión de esquema desconocida", { ...smallChart(), schemaVersion: 99 }],
    ["tipo desconocido", { ...smallChart(), kind: "pdf" }],
  ])("rechaza un documento que no es un patrón: %s", (_name, doc) => {
    const r = checkSharedRow(row(doc));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe("getSharedPattern", () => {
  it("un id inválido no consulta la base", async () => {
    expect(await getSharedPattern("../../etc/passwd")).toEqual({ ok: false, reason: "invalid_id" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sin filas: not_found; error de la RPC: error", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await getSharedPattern(ID)).toEqual({ ok: false, reason: "not_found" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect(await getSharedPattern(ID)).toEqual({ ok: false, reason: "error" });
    expect(rpc).toHaveBeenCalledWith("get_shared_pattern", { p_pattern_id: ID });
  });

  it("un documento que no valida no se devuelve como utilizable", async () => {
    rpc.mockResolvedValueOnce({ data: [row({})], error: null });
    const r = await getSharedPattern(ID);
    expect(r).toMatchObject({ ok: false, reason: "invalid_document" });
  });

  it("un documento válido sí", async () => {
    rpc.mockResolvedValueOnce({ data: [row(smallChart())], error: null });
    expect((await getSharedPattern(ID)).ok).toBe(true);
  });
});

describe("listPublicPatterns", () => {
  it.each([
    [24, 0, 24, 0],
    [0, -5, 1, 0],
    [1000, 10, 100, 10],
    [Number.NaN, 1.5, 24, 0],
  ])("acota límite %s y desplazamiento %s", async (limit, offset, pLimit, pOffset) => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await listPublicPatterns(limit, offset);
    expect(rpc).toHaveBeenCalledWith("list_public_patterns", { p_limit: pLimit, p_offset: pOffset });
  });

  it("marca los que no validan sin descartar los válidos", async () => {
    rpc.mockResolvedValueOnce({ data: [row(smallChart()), row({ kind: "chart" }, { id: "b" })], error: null });
    const r = await listPublicPatterns();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => [i.id, i.ok])).toEqual([
      [ID, true],
      ["b", false],
    ]);
  });
});

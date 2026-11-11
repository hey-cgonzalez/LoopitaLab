import type { Yarn } from "@loopitalab/pattern-core";
import { PALETTE } from "@loopitalab/yarn-catalog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectsDb } from "./support/projects-db.ts";
import { USER } from "./support/supabase-mock.ts";

const ANA = USER.id;
const BEA = "33333333-3333-4333-8333-333333333333";
const db = createProjectsDb(USER);
const adminFactory = vi.fn(() => db.admin);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFactory() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { listUserYarns, saveUserYarn, updateUserYarn, deleteUserYarn } = await import("@/app/lanas/actions");
const { prepareUserYarn, yarnFromSaved, inputFromYarn, savedYarnFromRow, SAVED_NOTE_MAX } = await import("@/lib/yarns/saved");

const valid = (over: Record<string, unknown> = {}) => ({
  weight: 4,
  composition: [{ fiber: "lana", percent: 100 }],
  color: { hex: "#112233" },
  ...over,
});

beforeEach(() => {
  db.current = USER;
  for (const k of ["patterns", "versions", "projects", "progress", "profiles", "yarns", "log", "rpcLog"] as const) db[k].length = 0;
  db.clock = 1;
  db.seq = 1;
  db.writeError = null;
  adminFactory.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("sin sesión", () => {
  it("ninguna acción toca la base", async () => {
    db.current = null;
    const results = await Promise.all([listUserYarns(), saveUserYarn(valid()), updateUserYarn(db.uid(), valid()), deleteUserYarn(db.uid())]);
    for (const r of results) expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(db.log).toEqual([]);
  });
});

describe("saveUserYarn", () => {
  it("guarda con el dueño de la sesión y devuelve la lana", async () => {
    const r = await saveUserYarn(valid({ note: "  Ovillo de mi abuela  " }));
    expect(r).toMatchObject({ ok: true, yarn: { weight: 4, color: { hex: "#112233" }, note: "Ovillo de mi abuela" } });
    expect(db.yarns).toHaveLength(1);
    expect(db.yarns[0]).toMatchObject({ owner_id: ANA, color_hex: "#112233", palette_id: null });
    expect(adminFactory).not.toHaveBeenCalled(); // sin clave secreta: RLS de la sesión
  });

  it("el dueño no se puede elegir: campos de más (owner_id, id, createdAt) no entran", async () => {
    await saveUserYarn({ ...valid(), owner_id: BEA, id: "x", created_at: "2020-01-01", note: undefined });
    expect(db.yarns[0]?.owner_id).toBe(ANA);
    expect(db.log.find((l) => l.op === "insert")?.payload).not.toHaveProperty("created_at");
  });

  it("color de la paleta con su id; el hex se normaliza a mayúsculas", async () => {
    const c = PALETTE[3]!;
    const r = await saveUserYarn(valid({ color: { hex: c.hex.toLowerCase(), paletteId: c.id } }));
    expect(r).toMatchObject({ ok: true, yarn: { color: { hex: c.hex.toUpperCase(), paletteId: c.id } } });
  });

  it("un paletteId inexistente o que no corresponde al hex se rechaza (el hex que no es de la paleta nunca lleva paletteId)", async () => {
    expect(await saveUserYarn(valid({ color: { hex: "#112233", paletteId: "no-existe" } }))).toMatchObject({ ok: false, code: "INVALID_YARN" });
    expect(await saveUserYarn(valid({ color: { hex: "#112233", paletteId: PALETTE[0]!.id } }))).toMatchObject({ ok: false, code: "INVALID_YARN" });
    expect(db.yarns).toEqual([]);
  });

  it.each([
    ["grosor fuera de 0 a 7", { weight: 9 }],
    ["grosor decimal", { weight: 2.5 }],
    ["composición vacía", { composition: [] }],
    ["composición que no suma 100", { composition: [{ fiber: "lana", percent: 60 }] }],
    ["porcentaje 0", { composition: [{ fiber: "lana", percent: 0 }, { fiber: "algodon", percent: 100 }] }],
    ["más de 10 fibras", { composition: Array.from({ length: 11 }, (_, i) => ({ fiber: `f${i}`, percent: 100 / 11 })) }],
    ["fibra repetida", { composition: [{ fiber: "lana", percent: 50 }, { fiber: "lana", percent: 50 }] }],
    ["nombre de fibra de más de 40 caracteres", { composition: [{ fiber: "x".repeat(41), percent: 100 }] }],
    ["hex inválido", { color: { hex: "rojo" } }],
    ["hex corto", { color: { hex: "#fff" } }],
    ["composición que no es lista", { composition: "lana" }],
    ["color ausente", { color: undefined }],
  ])("rechaza %s con INVALID_YARN y sin escribir", async (_n, over) => {
    const r = await saveUserYarn(valid(over));
    expect(r).toMatchObject({ ok: false, code: "INVALID_YARN" });
    expect(db.log.filter((l) => l.op === "insert")).toEqual([]);
  });

  it("una entrada que no es un objeto es INVALID_YARN", async () => {
    for (const bad of [null, undefined, 3, "lana", []]) expect(await saveUserYarn(bad)).toMatchObject({ ok: false, code: "INVALID_YARN" });
  });

  it("una fibra desconocida avisa pero no bloquea (E11)", async () => {
    const r = await saveUserYarn(valid({ composition: [{ fiber: "fibra-rara", percent: 100 }] }));
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.warnings.some((w) => w.code === "YARN_FIBER_UNKNOWN")).toBe(true);
  });

  it("la nota de más de 200 caracteres se rechaza, salvo que la usuaria confirme el recorte", async () => {
    const long = "n".repeat(SAVED_NOTE_MAX + 20);
    const r = await saveUserYarn(valid({ note: long }));
    expect(r).toMatchObject({ ok: false, code: "NOTE_TOO_LONG" });
    expect(db.yarns).toEqual([]);
    const ok = await saveUserYarn(valid({ note: long }), { truncateNote: true });
    expect(ok.ok && ok.yarn.note?.length).toBe(SAVED_NOTE_MAX);
  });

  it("la nota se normaliza (sin caracteres de control, \\r\\n a \\n) y una vacía queda sin nota", async () => {
    const r = await saveUserYarn(valid({ note: "a\u0000b\r\nc" }));
    expect(r.ok && r.yarn.note).toBe("ab\nc");
    const empty = await saveUserYarn(valid({ note: "   " }));
    expect(empty.ok && empty.yarn.note).toBeUndefined();
    expect(db.yarns[1]?.note).toBeNull();
  });

  it("el tope de 500 lanas (54000) da un mensaje claro, sin el texto de la base", async () => {
    for (let i = 0; i < 500; i++) db.yarns.push({ id: db.uid(), owner_id: ANA, weight: 4, composition: [], color_hex: "#000000", created_at: db.tick() });
    const r = await saveUserYarn(valid());
    expect(r).toMatchObject({ ok: false, code: "QUOTA", error: "Llegaste al tope de 500 lanas guardadas. Borra alguna que ya no uses para guardar otra." });
    expect(JSON.stringify(r)).not.toContain("Llegaste al tope de 500 lanas\"");
  });

  it("un error desconocido de la base no filtra su texto", async () => {
    db.writeError = { at: "user_yarns.insert", error: { code: "XX000", message: "relation user_yarns secreta" } };
    const r = await saveUserYarn(valid());
    expect(r).toMatchObject({ ok: false, code: "DATABASE" });
    expect(JSON.stringify(r)).not.toContain("secreta");
  });
});

describe("listUserYarns, updateUserYarn y deleteUserYarn", () => {
  it("lista solo las lanas de la sesión, de la más nueva a la más antigua", async () => {
    await saveUserYarn(valid({ note: "primera" }));
    await saveUserYarn(valid({ weight: 2 }));
    db.yarns.push({ id: db.uid(), owner_id: BEA, weight: 5, composition: [{ fiber: "lana", percent: 100 }], color_hex: "#FFFFFF", note: "de Bea", created_at: db.tick() });
    const r = await listUserYarns();
    expect(r.ok && r.yarns.map((y) => y.weight)).toEqual([2, 4]);
    expect(JSON.stringify(r)).not.toContain("de Bea");
    expect(db.log.at(-1)?.filters).toContainEqual(["owner_id", ANA]);
  });

  it("edita una propia; una ajena o inexistente es NOT_FOUND y no cambia nada", async () => {
    const saved = await saveUserYarn(valid());
    const id = saved.ok ? saved.yarn.id : "";
    const r = await updateUserYarn(id, valid({ weight: 6 }));
    expect(r).toMatchObject({ ok: true, yarn: { id, weight: 6 } });
    db.current = { id: BEA };
    expect(await updateUserYarn(id, valid({ weight: 1 }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(db.yarns[0]?.weight).toBe(6);
    expect(await updateUserYarn("no-uuid", valid())).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });

  it("editar valida igual que guardar", async () => {
    const saved = await saveUserYarn(valid());
    const id = saved.ok ? saved.yarn.id : "";
    expect(await updateUserYarn(id, valid({ composition: [{ fiber: "lana", percent: 50 }] }))).toMatchObject({ ok: false, code: "INVALID_YARN" });
    expect(db.yarns[0]?.composition).toEqual([{ fiber: "lana", percent: 100 }]);
  });

  it("borra una propia; una ajena es NOT_FOUND", async () => {
    const saved = await saveUserYarn(valid());
    const id = saved.ok ? saved.yarn.id : "";
    db.current = { id: BEA };
    expect(await deleteUserYarn(id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(db.yarns).toHaveLength(1);
    db.current = USER;
    expect(await deleteUserYarn(id)).toEqual({ ok: true });
    expect(db.yarns).toEqual([]);
    expect(await deleteUserYarn("x")).toMatchObject({ code: "INVALID_REQUEST" });
  });
});

describe("copia por valor entre «Mis lanas» y el diseño (ADR 0008, sección 5)", () => {
  const saved = savedYarnFromRow({
    id: "u1",
    weight: 3,
    composition: [{ fiber: "lana", percent: 80 }, { fiber: "alpaca", percent: 20 }],
    color_hex: "#112233",
    palette_id: null,
    note: "Comprada en la feria",
    created_at: "2026-11-11T00:00:00+00:00",
  })!;

  it("la nota privada NO se copia al diseño por defecto", () => {
    const y = yarnFromSaved(saved, "C");
    expect(y).toEqual<Yarn>({ id: "C", weight: 3, composition: [{ fiber: "lana", percent: 80 }, { fiber: "alpaca", percent: 20 }], color: { hex: "#112233" } });
    expect(JSON.stringify(y)).not.toContain("feria");
  });

  it("con la casilla «copiar también la nota» sí se copia", () => {
    expect(yarnFromSaved(saved, "C", { copyNote: true }).note).toBe("Comprada en la feria");
  });

  it("es una copia: editar la lana del diseño no cambia la guardada", () => {
    const y = yarnFromSaved(saved, "C");
    y.composition[0]!.percent = 1;
    expect(saved.composition[0]?.percent).toBe(80);
  });

  it("«Guardar en mis lanas» copia la lana del diseño por valor, con su nota", () => {
    const yarn: Yarn = { id: "A", weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: PALETTE[0]!.hex, paletteId: PALETTE[0]!.id }, note: "nota" };
    const input = inputFromYarn(yarn);
    expect(input).toEqual({ weight: 4, composition: [{ fiber: "lana", percent: 100 }], color: { hex: PALETTE[0]!.hex, paletteId: PALETTE[0]!.id }, note: "nota" });
    expect(input.composition).not.toBe(yarn.composition);
    expect(prepareUserYarn(input)).toMatchObject({ ok: true });
    // Una lana inconsistente (paletteId que no corresponde al hex) no se acepta.
    expect(prepareUserYarn({ ...input, color: { hex: "#112233", paletteId: PALETTE[0]!.id } })).toMatchObject({ ok: false, code: "INVALID_YARN" });
  });

  it("una fila dañada no se convierte en lana", () => {
    expect(savedYarnFromRow({ id: "x" })).toBeNull();
    expect(savedYarnFromRow(null)).toBeNull();
    expect(savedYarnFromRow({ id: "x", weight: 9, composition: [], color_hex: "#000000", created_at: "t" })).toBeNull();
  });
});

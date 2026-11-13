import { NO_STITCH, newChartPattern, type ChartPattern, type NewChartInput } from "@loopitalab/pattern-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectsDb, type DbErr } from "./support/projects-db.ts";
import { USER } from "./support/supabase-mock.ts";

// ---------------------------------------------------------------- simulación

const ANA = USER.id;
const BEA = "33333333-3333-4333-8333-333333333333";
const db = createProjectsDb(USER);
const adminFactory = vi.fn(() => db.admin);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminFactory() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("@/app/proyectos/actions");
const { deletePattern } = await import("@/app/disenos/actions");
const { startProjectFromDesign, getKnitPreview, loadProject, saveProgress, getRepinPreview, repinProject, getProgress, setProjectStatus } = actions;

const yarns = [
  { id: "A", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } },
  { id: "B", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
];
const input = (over: Partial<Omit<NewChartInput, "id">> = {}): Omit<NewChartInput, "id"> => ({
  title: "Gorro de prueba",
  width: 4,
  height: 3,
  repeat: { x: 2, y: 1 },
  workedIn: "rounds",
  renderAs: "tube",
  direction: "bottom_up",
  yarns,
  ...over,
});
function doc(id: string, over: Partial<NewChartInput> = {}): ChartPattern {
  return newChartPattern({ id, ...input(), ...over });
}
const PID = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";

const seed = (d: ChartPattern = doc(PID), owner = ANA) => db.seedPattern({ id: d.id, owner_id: owner, document: d as unknown as Record<string, unknown> });
const jsonDoc = (d: ChartPattern) => d as unknown as Record<string, unknown>;

/** Diseño con un error de tejido (una vuelta sin ningún punto): se puede guardar, pero no tejer. */
function draftDoc(id: string): ChartPattern {
  const d = doc(id);
  d.chart.cells.fill(NO_STITCH, 0, d.chart.width);
  return d;
}

beforeEach(() => {
  db.current = USER;
  for (const k of ["patterns", "versions", "projects", "progress", "profiles", "yarns", "log", "rpcLog"] as const) db[k].length = 0;
  db.clock = 1;
  db.seq = 1;
  db.writeError = null;
  db.rpcError = null;
  db.beforeRpc = null;
  adminFactory.mockReset();
  adminFactory.mockImplementation(() => db.admin);
  db.admin.rpc.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const dbWrites = () => db.log.filter((l) => l.op !== "select");

/** Empieza un proyecto con el diseño por defecto y devuelve su id y el de la versión fijada. */
async function startOne(d: ChartPattern = doc(PID)) {
  seed(d);
  const r = await startProjectFromDesign(d.id, db.updatedAt(d.id));
  if (!r.ok) throw new Error(`no empezó: ${r.code}`);
  const project = db.projects.find((p) => p.id === r.projectId)!;
  return { projectId: r.projectId, versionId: project.pattern_version_id as string, result: r };
}

// ---------------------------------------------------------------- sin sesión

describe("sin sesión: nada toca la base ni el cliente admin", () => {
  beforeEach(() => {
    db.current = null;
  });

  it("todas las acciones responden UNAUTHENTICATED", async () => {
    const pointer = { rowsDone: 1, stitchesDone: 0 };
    const results = await Promise.all([
      startProjectFromDesign(PID, db.updatedAt(PID)),
      getKnitPreview(PID),
      loadProject(PID),
      saveProgress(PID, OTHER, pointer, null),
      getRepinPreview(PID),
      repinProject(PID, null),
    ]);
    for (const r of results) expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(adminFactory).not.toHaveBeenCalled();
    expect(db.log).toEqual([]);
  });
});

// ---------------------------------------------------------------- startProjectFromDesign

describe("startProjectFromDesign", () => {
  it("lee el diseño de la base, valida y llama a start_chart_project con p_owner_id de la sesión y el updated_at leído", async () => {
    const row = seed();
    const r = await startProjectFromDesign(PID, db.updatedAt(PID), "  Mi gorro  ");
    expect(r).toMatchObject({ ok: true, version: 1, reused: false });
    expect(db.rpcLog).toEqual([
      { fn: "start_chart_project", args: { p_owner_id: ANA, p_pattern_id: PID, p_expected_updated_at: row.updated_at, p_title: "Mi gorro" } },
    ]);
    expect(db.projects).toHaveLength(1);
    expect(db.projects[0]).toMatchObject({ owner_id: ANA, title: "Mi gorro", status: "in_progress", pattern_id: PID });
    expect(db.progress[0]).toMatchObject({ round_number: 1, stitch_index: 0 });
  });

  it("sin título usa null (el de la base: el del diseño)", async () => {
    seed();
    await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(db.rpcLog[0]?.args.p_title).toBeNull();
    expect(db.projects[0]?.title).toBe("Gorro de prueba");
  });

  it("p_owner_id sale siempre de la sesión: argumentos de más del cliente se ignoran", async () => {
    seed();
    // @ts-expect-error: un cliente manipulado puede mandar argumentos de más; la acción no los lee.
    await startProjectFromDesign(PID, db.updatedAt(PID), "Gorro", BEA);
    expect(db.rpcLog[0]?.args.p_owner_id).toBe(ANA);
    expect(db.projects[0]?.owner_id).toBe(ANA);
  });

  it("la validación es obligatoria: con errores de tejido responde NOT_KNITTABLE y NUNCA crea el cliente admin", async () => {
    seed(draftDoc(PID));
    const r = await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(r).toMatchObject({ ok: false, code: "NOT_KNITTABLE" });
    if (!r.ok) expect(r.issues?.some((i) => i.code === "CHART_ROW_EMPTY_FULL")).toBe(true);
    expect(adminFactory).not.toHaveBeenCalled();
    expect(db.rpcLog).toEqual([]);
    expect(db.projects).toEqual([]);
  });

  it("un documento dañado (no savable) no llega a admin: NOT_SAVABLE", async () => {
    seed(doc(PID));
    db.patterns[0]!.document = { ...jsonDoc(doc(PID)), chart: "roto" };
    const r = await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(r).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("un diseño ajeno o inexistente es NOT_FOUND, sin distinguir, y sin admin", async () => {
    seed(doc(PID), BEA);
    expect(await startProjectFromDesign(PID, db.updatedAt(PID))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await startProjectFromDesign(OTHER, db.updatedAt(OTHER))).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("ids o títulos mal formados no tocan la base", async () => {
    expect(await startProjectFromDesign("no-es-uuid", db.updatedAt("no-es-uuid"))).toMatchObject({ code: "INVALID_REQUEST" });
    expect(await startProjectFromDesign(PID, db.updatedAt(PID), "x".repeat(121))).toMatchObject({ code: "REJECTED" });
    // @ts-expect-error: el título debe ser texto.
    expect(await startProjectFromDesign(PID, db.updatedAt(PID), { toString: () => "x" })).toMatchObject({ code: "REJECTED" });
    expect(db.log).toEqual([]);
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("limpia caracteres de control del título", async () => {
    seed();
    await startProjectFromDesign(PID, db.updatedAt(PID), "Gorro\u0000\n  de\tprueba");
    expect(db.rpcLog[0]?.args.p_title).toBe("Gorro de prueba");
  });

  it("un diseño que no es un gráfico es NOT_A_CHART", async () => {
    db.seedPattern({ id: PID, owner_id: ANA, kind: "written", document: jsonDoc(doc(PID)) });
    expect(await startProjectFromDesign(PID, db.updatedAt(PID))).toMatchObject({ ok: false, code: "NOT_A_CHART" });
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("si el diseño cambia entre leer y fijar, la base responde PT409 y la acción devuelve CONFLICT (pattern)", async () => {
    seed();
    db.beforeRpc = () => db.touchPattern(PID);
    const r = await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "pattern" });
    expect(db.projects).toEqual([]);
  });

  it("si el diseño cambió desde la pantalla previa (expectedUpdatedAt distinto): CONFLICT (pattern) sin crear admin", async () => {
    seed();
    const shown = db.updatedAt(PID);
    db.touchPattern(PID);
    const r = await startProjectFromDesign(PID, shown);
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "pattern" });
    expect(adminFactory).not.toHaveBeenCalled();
    expect(db.rpcLog).toEqual([]);
    expect(db.projects).toEqual([]);
  });

  it("expectedUpdatedAt inválido es INVALID_REQUEST y no toca la base", async () => {
    seed();
    for (const bad of ["", "ayer", "2026-11-11", "x".repeat(60), null, undefined, 12345]) {
      // @ts-expect-error: un cliente manipulado puede mandar cualquier cosa.
      expect(await startProjectFromDesign(PID, bad)).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    }
    expect(db.log).toEqual([]);
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("reutiliza la versión idéntica y crea otra si el diseño cambió", async () => {
    seed();
    const a = await startProjectFromDesign(PID, db.updatedAt(PID));
    const b = await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(a).toMatchObject({ ok: true, version: 1, reused: false });
    expect(b).toMatchObject({ ok: true, version: 1, reused: true });
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    expect(await startProjectFromDesign(PID, db.updatedAt(PID))).toMatchObject({ ok: true, version: 2, reused: false });
    expect(db.versionsOf(PID)).toHaveLength(2);
  });

  const quota: [string, DbErr, string][] = [
    ["1000 proyectos", { code: "54000", message: "Llegaste al tope de 1000 proyectos" }, "QUOTA"],
    ["200 versiones por diseño", { code: "54000", message: "Este patrón llegó al máximo de 200 versiones guardadas" }, "MAX_VERSIONS"],
    ["5000 versiones por usuaria", { code: "54000", message: "Llegaste al máximo de 5000 versiones guardadas" }, "VERSIONS_QUOTA"],
    ["P0002", { code: "P0002", message: "Patrón no encontrado" }, "NOT_FOUND"],
    ["22023", { code: "22023", message: "Solo se pueden tejer gráficos de colorwork" }, "NOT_A_CHART"],
    ["23514", { code: "23514", message: 'new row for relation "projects" violates check constraint "projects_title_check"' }, "REJECTED"],
    ["PT409 (pattern)", { code: "PT409", message: "El diseño cambió desde que se validó", details: "pattern" }, "CONFLICT"],
    ["desconocido", { code: "XX000", message: "relation public.pattern_versions secreta" }, "DATABASE"],
  ];
  it.each(quota)("mapa de errores: %s -> %s, con texto en español y sin el mensaje de la base", async (_n, error, code) => {
    seed();
    db.rpcError = error;
    const r = await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(r).toMatchObject({ ok: false, code });
    if (!r.ok) {
      expect(r.error).toMatch(/[a-záéíóú]/i);
      // (el texto del tope de proyectos coincide a propósito con el de la base: se cita, no se devuelve el de Postgres)
      if (code !== "QUOTA") expect(JSON.stringify(r)).not.toContain(error.message);
      expect(JSON.stringify(r)).not.toMatch(/pattern_versions|projects_title_check|violates/);
    }
  });

  it("si faltan las variables del servidor, falla sin detalles", async () => {
    seed();
    adminFactory.mockImplementation(() => {
      throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
    });
    const r = await startProjectFromDesign(PID, db.updatedAt(PID));
    expect(r).toMatchObject({ ok: false, code: "DATABASE" });
    expect(JSON.stringify(r)).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("una respuesta inesperada de la base es DATABASE, no un éxito inventado", async () => {
    seed();
    db.admin.rpc.mockResolvedValueOnce({ data: [{ nada: 1 }], error: null });
    expect(await startProjectFromDesign(PID, db.updatedAt(PID))).toMatchObject({ ok: false, code: "DATABASE" });
  });

  it("la sesión nunca llama a rpc: no tiene start_chart_project (solo service_role)", async () => {
    seed();
    await startProjectFromDesign(PID, db.updatedAt(PID));
    expect((db.client as Record<string, unknown>).rpc).toBeUndefined();
  });
});

// ---------------------------------------------------------------- getKnitPreview

describe("getKnitPreview", () => {
  it("muestra supuesta rotulada, metraje por lana, forma de trabajo y totalRows", async () => {
    seed(doc(PID, { repeat: { x: 2, y: 2 } }));
    const r = await getKnitPreview(PID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gauge).toMatchObject({ assumed: true });
    expect(r.shape).toMatchObject({ workedIn: "rounds", renderAs: "tube", direction: "bottom_up", totalRows: 6, flatAndSewn: false });
    expect(r.yarns).toHaveLength(2);
    expect(r.yarns[0]?.length?.meters).toBeGreaterThan(0);
    expect(r.yarns[0]?.length?.assumptions).toContain("assumed_gauge");
    expect(r.yarns[1]?.length?.meters).toBe(0); // la lana B no se usa en el gráfico
    expect(r.lengthScope).toBe("chart_only");
    expect(r.patternUpdatedAt).toBe(db.patterns[0]?.updated_at);
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("con muestra propia no se rotula supuesta", async () => {
    seed(doc(PID, { gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 } }));
    const r = await getKnitPreview(PID);
    expect(r.ok && r.gauge).toMatchObject({ stitchesPer10cm: 22, assumed: false });
  });

  it("tubo con ida y vuelta: se teje plano y se cose (CHART_ROWS_SHAPE)", async () => {
    seed(doc(PID, { workedIn: "rows", renderAs: "tube" }));
    const r = await getKnitPreview(PID);
    expect(r.ok && r.shape.flatAndSewn).toBe(true);
    expect(r.ok && r.warnings.some((w) => w.code === "CHART_ROWS_SHAPE")).toBe(true);
  });

  it("en crochet no hay estimación de metraje (sin inventar)", async () => {
    const crochet = { ...doc(PID), technique: "crochet" as const };
    db.seedPattern({ id: PID, owner_id: ANA, document: jsonDoc(crochet) });
    const r = await getKnitPreview(PID);
    expect(r.ok && r.yarns.every((y) => y.length === null)).toBe(true);
  });

  it("con errores de tejido no hay vista previa: NOT_KNITTABLE", async () => {
    seed(draftDoc(PID));
    expect(await getKnitPreview(PID)).toMatchObject({ ok: false, code: "NOT_KNITTABLE" });
  });

  it("un diseño ajeno es NOT_FOUND", async () => {
    seed(doc(PID), BEA);
    expect(await getKnitPreview(PID)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

// ---------------------------------------------------------------- loadProject

describe("loadProject", () => {
  it("devuelve la versión fijada, el puntero inicial y newerVersionAvailable falso", async () => {
    const { projectId, versionId } = await startOne();
    const r = await loadProject(projectId);
    expect(r).toMatchObject({
      ok: true,
      valid: true,
      mirror: false,
      pointer: { rowsDone: 0, stitchesDone: 0 },
      newerVersionAvailable: false,
      project: { id: projectId, versionId, version: 1 },
    });
    if (r.ok) expect(r.progressUpdatedAt).toBe(db.progress[0]?.updated_at);
  });

  it("el puntero se acota al plan de la versión fijada (un avance dañado o excesivo)", async () => {
    const { projectId } = await startOne();
    db.setProgress(projectId, 9999, 7);
    const r = await loadProject(projectId);
    expect(r.ok && r.pointer).toEqual({ rowsDone: 3, stitchesDone: 0 }); // terminado: 3 filas
    db.setProgress(projectId, 2, 3);
    const mid = await loadProject(projectId);
    expect(mid.ok && mid.pointer.rowsDone).toBe(1);
  });

  it("una fila sin avance (proyecto anterior a la fase 3) es el inicio con progressUpdatedAt null", async () => {
    const { projectId } = await startOne();
    db.progress.length = 0;
    const r = await loadProject(projectId);
    expect(r).toMatchObject({ ok: true, pointer: { rowsDone: 0, stitchesDone: 0 }, progressUpdatedAt: null });
  });

  it("newerVersionAvailable es verdadero cuando el diseño actual cambió", async () => {
    const { projectId } = await startOne();
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    const r = await loadProject(projectId);
    expect(r.ok && r.newerVersionAvailable).toBe(true);
    // El proyecto sigue mostrando la versión fijada, no la actual.
    expect(r.ok && r.document.chart.height).toBe(3);
  });

  it("lee la preferencia mirror_knitting del perfil", async () => {
    const { projectId } = await startOne();
    db.profiles.push({ id: ANA, mirror_knitting: true });
    const r = await loadProject(projectId);
    expect(r.ok && r.mirror).toBe(true);
  });

  it("un proyecto ajeno es NOT_FOUND (sin distinguir)", async () => {
    const { projectId } = await startOne();
    db.current = { id: BEA };
    expect(await loadProject(projectId)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await loadProject("no-uuid")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });

  it("un proyecto suelto (sin diseño) es NO_DESIGN", async () => {
    db.projects.push({ id: OTHER, owner_id: ANA, title: "Suelto", status: "planned", pattern_id: null, pattern_version_id: null });
    expect(await loadProject(OTHER)).toMatchObject({ ok: false, code: "NO_DESIGN" });
  });

  it("sin savable no se muestra (NOT_SAVABLE)", async () => {
    const { projectId } = await startOne();
    db.versions[0]!.document = { ...(db.versions[0]!.document as object), chart: 1 };
    expect(await loadProject(projectId)).toMatchObject({ ok: false, code: "NOT_SAVABLE" });
  });

  it("sin valid se muestra con aviso (una regla nueva marca la versión)", async () => {
    const { projectId } = await startOne();
    const draft = draftDoc(PID);
    db.versions[0]!.document = jsonDoc(draft);
    const r = await loadProject(projectId);
    expect(r).toMatchObject({ ok: true, valid: false });
    expect(r.ok && r.issues.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------- T17: notas privadas, estado y relectura ligera

describe("T17: loadProject sin notas privadas (B3), setProjectStatus (I2) y getProgress (I4)", () => {
  it("B3: el documento de loadProject no trae yarns[*].note ni las notas del patrón", async () => {
    const d = doc(PID);
    d.yarns[0]!.note = "ovillo de la feria";
    d.notes = ["nota privada del patrón"];
    const { projectId } = await startOne(d);
    expect(JSON.stringify(db.versions[0]!.document)).toContain("ovillo de la feria"); // la versión fijada sí la guarda
    const r = await loadProject(projectId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r)).not.toContain("ovillo de la feria");
    expect(JSON.stringify(r)).not.toContain("nota privada del patrón");
    expect(r.document.yarns.map((y) => y.color.hex)).toEqual(d.yarns.map((y) => y.color.hex));
  });

  it("I2: setProjectStatus exige sesión y filtra por dueña", async () => {
    const { projectId } = await startOne();
    const form = (status: string) => {
      const f = new FormData();
      f.set("id", projectId);
      f.set("status", status);
      return f;
    };
    // La simulación no modela el UPDATE de `projects`: se comprueba la consulta que se envía.
    const lastUpdate = () => db.log.filter((l) => l.op === "update" && l.table === "projects").at(-1);
    await setProjectStatus(form("paused"));
    expect(lastUpdate()?.filters).toEqual([["id", projectId], ["owner_id", ANA]]);
    expect(lastUpdate()?.payload).toEqual({ status: "paused" });
    db.current = { id: BEA };
    await setProjectStatus(form("finished"));
    expect(lastUpdate()?.filters).toEqual([["id", projectId], ["owner_id", BEA]]); // la dueña es la de la sesión
    db.current = null;
    const before = db.log.length;
    await setProjectStatus(form("finished"));
    expect(db.log.length).toBe(before);
  });

  it("I4: getProgress devuelve solo el puntero, su fecha y la versión; ajeno es NOT_FOUND", async () => {
    const { projectId, versionId } = await startOne();
    db.setProgress(projectId, 3, 2);
    const r = await getProgress(projectId);
    expect(r).toEqual({ ok: true, versionId, pointer: { rowsDone: 2, stitchesDone: 2 }, progressUpdatedAt: db.progress[0]!.updated_at });
    // No lee documentos: ni el diseño ni la versión fijada.
    const reads = db.log.filter((l) => l.op === "select").slice(-2).map((l) => l.table);
    expect(reads).toEqual(["projects", "project_progress"]);
    db.current = { id: BEA };
    expect(await getProgress(projectId)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await getProgress("no-uuid")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    db.current = null;
    expect(await getProgress(projectId)).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});

// ---------------------------------------------------------------- saveProgress

describe("saveProgress", () => {
  it("guarda con updated_at esperado y devuelve el nuevo; el puntero se codifica como round_number = rowsDone + 1", async () => {
    const { projectId, versionId } = await startOne();
    const before = db.progress[0]!.updated_at as string;
    adminFactory.mockClear();
    const r = await saveProgress(projectId, versionId, { rowsDone: 2, stitchesDone: 4 }, before);
    expect(r.ok).toBe(true);
    expect(db.progress[0]).toMatchObject({ round_number: 3, stitch_index: 4, part_id: null });
    expect(r.ok && r.updatedAt).toBe(db.progress[0]?.updated_at);
    expect(r.ok && r.updatedAt).not.toBe(before);
    // El mismo dispositivo nunca entra en conflicto consigo mismo: sigue con el updatedAt nuevo.
    const again = await saveProgress(projectId, versionId, { rowsDone: 3, stitchesDone: 0 }, r.ok ? r.updatedAt : "");
    expect(again.ok).toBe(true);
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("no exige nada del documento (guarda aunque la versión ya no sea valid)", async () => {
    const { projectId, versionId } = await startOne();
    db.versions[0]!.document = jsonDoc(draftDoc(PID));
    const r = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, db.progress[0]!.updated_at as string);
    expect(r.ok).toBe(true);
  });

  it("CONFLICT cuando otro dispositivo avanzó: trae las dos posiciones, la hora y el mensaje con «vuelta»", async () => {
    const { projectId, versionId } = await startOne();
    const seen = db.progress[0]!.updated_at as string;
    db.setProgress(projectId, 3, 0); // otro dispositivo: vuelta 3
    const r = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, seen);
    expect(r).toMatchObject({
      ok: false,
      code: "CONFLICT",
      conflictOn: "progress",
      currentPointer: { rowsDone: 2, stitchesDone: 0 },
      workedIn: "rounds",
    });
    if (!r.ok) {
      expect(r.currentUpdatedAt).toBe(db.progress[0]?.updated_at);
      expect(r.error).toBe("En otro dispositivo vas en la vuelta 3. Aquí vas en la vuelta 2. ¿Con cuál sigues?");
    }
    // No se escribió nada.
    expect(db.progress[0]).toMatchObject({ round_number: 3 });
  });

  it("el mensaje dice «fila» en ida y vuelta (C2) y «gráfico terminado» al final", async () => {
    const { projectId, versionId } = await startOne(doc(PID, { workedIn: "rows", renderAs: "flat" }));
    const seen = db.progress[0]!.updated_at as string;
    db.setProgress(projectId, 4, 0); // terminado (3 filas)
    const r = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, seen);
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", workedIn: "rows", totalRows: 3 });
    if (!r.ok) expect(r.error).toBe("En otro dispositivo ya terminaste el gráfico. Aquí vas en la fila 2. ¿Con cuál sigues?");
  });

  it("elegir «esta» es reintentar con currentUpdatedAt (acción explícita)", async () => {
    const { projectId, versionId } = await startOne();
    const seen = db.progress[0]!.updated_at as string;
    db.setProgress(projectId, 3, 0);
    const conflict = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, seen);
    expect(conflict.ok).toBe(false);
    const retry = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, conflict.ok ? "" : (conflict.currentUpdatedAt as string));
    expect(retry.ok).toBe(true);
    expect(db.progress[0]).toMatchObject({ round_number: 2 });
  });

  it("VERSION_CHANGED cuando otro dispositivo pasó a otra versión: devuelve la actual y no escribe", async () => {
    const { projectId, versionId } = await startOne();
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    const r = await repinProject(projectId, db.progress[0]!.updated_at as string);
    expect(r.ok).toBe(true);
    const stale = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, db.progress[0]!.updated_at as string);
    expect(stale).toMatchObject({ ok: false, code: "VERSION_CHANGED", currentVersion: 2, workedIn: "rounds", totalRows: 5 });
    if (!stale.ok) {
      expect(stale.currentVersionId).not.toBe(versionId);
      expect(stale.error).toContain("vuelta");
    }
  });

  it("sin fila de avance (expected null) la crea; si otro dispositivo la creó antes, CONFLICT", async () => {
    const { projectId, versionId } = await startOne();
    db.progress.length = 0;
    const r = await saveProgress(projectId, versionId, { rowsDone: 1, stitchesDone: 0 }, null);
    expect(r.ok).toBe(true);
    expect(db.progress).toHaveLength(1);
    const clash = await saveProgress(projectId, versionId, { rowsDone: 2, stitchesDone: 0 }, null);
    expect(clash).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "progress" });
  });

  it.each([
    ["NaN", { rowsDone: NaN, stitchesDone: 0 }],
    ["decimal", { rowsDone: 1.5, stitchesDone: 0 }],
    ["negativo", { rowsDone: -1, stitchesDone: 0 }],
    ["stitches negativo", { rowsDone: 0, stitchesDone: -3 }],
    ["pasa la cota de filas", { rowsDone: 100_001, stitchesDone: 0 }],
    ["pasa la cota de puntos", { rowsDone: 0, stitchesDone: 100_001 }],
    ["texto", { rowsDone: "1", stitchesDone: 0 }],
    ["Infinity", { rowsDone: Infinity, stitchesDone: 0 }],
    ["null", null],
    ["arreglo", [1, 0]],
    ["sin campos", {}],
  ])("puntero inválido (%s): INVALID_REQUEST sin tocar la base", async (_n, pointer) => {
    const { projectId, versionId } = await startOne();
    db.log.length = 0;
    const r = await saveProgress(projectId, versionId, pointer, db.progress[0]!.updated_at as string);
    expect(r).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(db.log).toEqual([]);
  });

  it("ids o hora mal formados: INVALID_REQUEST", async () => {
    const { projectId, versionId } = await startOne();
    const p = { rowsDone: 1, stitchesDone: 0 };
    expect(await saveProgress("x", versionId, p, null)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(await saveProgress(projectId, "x", p, null)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(await saveProgress(projectId, versionId, p, "ayer")).toMatchObject({ code: "INVALID_REQUEST" });
    // @ts-expect-error: undefined no es null
    expect(await saveProgress(projectId, versionId, p, undefined)).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("un proyecto ajeno es NOT_FOUND y no escribe", async () => {
    const { projectId, versionId } = await startOne();
    const seen = db.progress[0]!.updated_at as string;
    db.current = { id: BEA };
    const r = await saveProgress(projectId, versionId, { rowsDone: 2, stitchesDone: 0 }, seen);
    expect(r).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(db.progress[0]).toMatchObject({ round_number: 1 });
    expect(dbWrites()).toEqual([]);
  });

  it("un error de la base no filtra su texto", async () => {
    const { projectId, versionId } = await startOne();
    db.writeError = { at: "project_progress.update", error: { code: "XX000", message: "relation project_progress secreta" } };
    const r = await saveProgress(projectId, versionId, { rowsDone: 2, stitchesDone: 0 }, db.progress[0]!.updated_at as string);
    expect(r).toMatchObject({ ok: false, code: "DATABASE" });
    expect(JSON.stringify(r)).not.toContain("secreta");
  });
});

// ---------------------------------------------------------------- repinProject

describe("repinProject", () => {
  it("pasa a la versión actual, reubica el puntero con remapPointer y lo escribe en la misma transacción", async () => {
    const { projectId } = await startOne();
    db.setProgress(projectId, 3, 0); // vuelta 3 de 3
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    const seen = db.progress[0]!.updated_at as string;
    const preview = await getRepinPreview(projectId);
    expect(preview).toMatchObject({ ok: true, sameDocument: false, from: { version: 1, workedIn: "rounds", totalRows: 3 }, to: { workedIn: "rounds", totalRows: 5 }, pointer: { rowsDone: 2, stitchesDone: 0 }, progressUpdatedAt: seen });

    const r = await repinProject(projectId, seen);
    expect(r).toMatchObject({ ok: true, version: 2, reused: false, pointer: { rowsDone: 2, stitchesDone: 0 }, workedIn: "rounds", totalRows: 5 });
    expect(db.rpcLog.at(-1)).toMatchObject({
      fn: "repin_project",
      args: { p_owner_id: ANA, p_project_id: projectId, p_expected_progress_updated_at: seen, p_round_number: 3, p_stitch_index: 0 },
    });
    expect(db.rpcLog.at(-1)?.args.p_expected_updated_at).toBe(db.patterns[0]?.updated_at);
    expect(db.projects[0]?.pattern_version_id).toBe(db.versions[1]?.id);
  });

  it("el puntero nunca viene del cliente: se acota si el plan nuevo es más corto", async () => {
    const { projectId } = await startOne(doc(PID, { height: 5 }));
    db.setProgress(projectId, 5, 0);
    db.editPattern(PID, jsonDoc(doc(PID, { height: 2 })));
    const r = await repinProject(projectId, db.progress[0]!.updated_at as string);
    expect(r).toMatchObject({ ok: true, clamped: true, pointer: { rowsDone: 2, stitchesDone: 0 } });
  });

  it("CONFLICT si el avance cambió desde que la pantalla lo vio (no pisa en silencio), sin llamar a admin", async () => {
    const { projectId } = await startOne();
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    const seen = db.progress[0]!.updated_at as string;
    db.setProgress(projectId, 2, 0);
    adminFactory.mockClear();
    const r = await repinProject(projectId, seen);
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "progress", currentPointer: { rowsDone: 1, stitchesDone: 0 } });
    expect(adminFactory).not.toHaveBeenCalled();
    expect(db.projects[0]?.pattern_version_id).toBe(db.versions[0]?.id);
  });

  it("CONFLICT de la base (avance que cambió entre la lectura y la llamada) trae la posición del servidor", async () => {
    const { projectId } = await startOne();
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    db.beforeRpc = () => db.setProgress(projectId, 2, 0);
    const r = await repinProject(projectId, db.progress[0]!.updated_at as string);
    expect(r).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "progress", currentPointer: { rowsDone: 1, stitchesDone: 0 } });
    expect(db.projects[0]?.pattern_version_id).toBe(db.versions[0]?.id);
  });

  it("exige valid del diseño nuevo: con errores de tejido NOT_KNITTABLE y sin admin", async () => {
    const { projectId } = await startOne();
    db.editPattern(PID, jsonDoc(draftDoc(PID)));
    adminFactory.mockClear();
    const r = await repinProject(projectId, db.progress[0]!.updated_at as string);
    expect(r).toMatchObject({ ok: false, code: "NOT_KNITTABLE" });
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("p_owner_id es de la sesión: un proyecto ajeno es NOT_FOUND y no llega a admin", async () => {
    const { projectId } = await startOne();
    db.current = { id: BEA };
    adminFactory.mockClear();
    expect(await repinProject(projectId, db.progress[0]!.updated_at as string)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(adminFactory).not.toHaveBeenCalled();
  });

  it("sin fila de avance: expected null", async () => {
    const { projectId } = await startOne();
    db.progress.length = 0;
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    const r = await repinProject(projectId, null);
    expect(r.ok).toBe(true);
    expect(db.progress).toHaveLength(1);
  });

  it("argumentos mal formados: INVALID_REQUEST", async () => {
    const { projectId } = await startOne();
    expect(await repinProject("x", null)).toMatchObject({ code: "INVALID_REQUEST" });
    expect(await repinProject(projectId, "ayer")).toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("si el diseño cambia entre leer y fijar: CONFLICT (pattern)", async () => {
    const { projectId } = await startOne();
    db.editPattern(PID, jsonDoc(doc(PID, { height: 5 })));
    db.beforeRpc = () => db.touchPattern(PID);
    expect(await repinProject(projectId, db.progress[0]!.updated_at as string)).toMatchObject({ ok: false, code: "CONFLICT", conflictOn: "pattern" });
  });
});

// ---------------------------------------------------------------- deletePattern (D1, 23503)

describe("deletePattern con proyectos (ADR 0009, D1)", () => {
  it("un diseño que tiene proyectos no se borra: mensaje claro con la cuenta, sin el texto de la base", async () => {
    await startOne();
    await startProjectFromDesign(PID, db.updatedAt(PID));
    const r = await deletePattern(PID);
    expect(r).toMatchObject({ ok: false, code: "HAS_PROJECTS", error: "Este diseño tiene 2 proyectos con su avance. Bórralos antes de borrar el diseño; al borrarlos pierdes el avance." });
    expect(JSON.stringify(r)).not.toMatch(/foreign key|pattern_versions/);
    expect(db.patterns).toHaveLength(1);
    expect(db.versionsOf(PID)).toHaveLength(1);
  });

  it("con un proyecto dice «1 proyecto»", async () => {
    await startOne();
    expect(await deletePattern(PID)).toMatchObject({ ok: false, code: "HAS_PROJECTS", error: "Este diseño tiene 1 proyecto con su avance. Bórralos antes de borrar el diseño; al borrarlos pierdes el avance." });
  });

  it("si la cuenta falla, el mensaje sale sin número", async () => {
    await startOne();
    const real = db.client.from;
    db.client.from = (t: string) => {
      if (t !== "projects") return real(t);
      const q: Record<string, unknown> = { select: () => q, eq: () => q, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, count: null, error: { code: "XX000", message: "x" } }).then(ok) };
      return q as ReturnType<typeof real>;
    };
    try {
      expect(await deletePattern(PID)).toMatchObject({ ok: false, code: "HAS_PROJECTS", error: "Este diseño tiene proyectos con su avance. Bórralos antes de borrar el diseño; al borrarlos pierdes el avance." });
    } finally {
      db.client.from = real;
    }
  });

  it("un diseño sin proyectos se borra como siempre", async () => {
    seed();
    expect(await deletePattern(PID)).toEqual({ ok: true });
    expect(db.patterns).toEqual([]);
  });

  it("un 23503 que llega en la base del diseño ajeno no revela nada: NOT_FOUND", async () => {
    seed(doc(PID), BEA);
    expect(await deletePattern(PID)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

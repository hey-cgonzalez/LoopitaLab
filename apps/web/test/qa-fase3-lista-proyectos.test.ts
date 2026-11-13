import { planChart, totalRowsOf } from "@loopitalab/follow";
import { newChartPattern } from "@loopitalab/pattern-core";
import { describe, expect, it, vi } from "vitest";
import { listProjects } from "@/lib/projects/list.ts";
import type { SessionClient } from "@/lib/projects/server.ts";

/*
 * QA final de la fase 3 (T16): `lib/projects/list.ts` ("Tus proyectos") no tenía prueba unitaria. La lista arma cada
 * tarjeta con las rutas JSON de la versión fijada, sin leer documentos; aquí se simula lo que devuelve PostgREST
 * (relaciones como objeto o como lista de uno, números como texto) y se comprueba que:
 *   - el total de filas es el de `follow` (`totalRowsOf`, igual a `planChart`): nada se cuenta en `apps/web` (CA3-T13);
 *   - "vuelta" o "fila" sale de `workedIn` de la versión fijada (CA3-T16);
 *   - el puntero se acota al total (un diseño que se acortó no muestra "fila 13 de 10");
 *   - valores dañados no lanzan y la consulta filtra por dueña y tiene tope.
 */

interface Call {
  table: string;
  select: string;
  eq: [string, unknown][];
  order: [string, unknown][];
  limit: number | null;
}

function client(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const calls: Call[] = [];
  const supabase = {
    from(table: string) {
      const call: Call = { table, select: "", eq: [], order: [], limit: null };
      calls.push(call);
      const q = {
        select(s: string) {
          call.select = s;
          return q;
        },
        eq(col: string, v: unknown) {
          call.eq.push([col, v]);
          return q;
        },
        order(col: string, o: unknown) {
          call.order.push([col, o]);
          return q;
        },
        limit(n: number) {
          call.limit = n;
          return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
        },
      };
      return q;
    },
  };
  return { supabase: supabase as unknown as SessionClient, calls };
}

const ANA = "11111111-1111-4111-8111-111111111111";
const T0 = "2026-11-10T10:00:00.000000+00:00";
const T1 = "2026-11-10T11:00:00.000000+00:00";
const T2 = "2026-11-10T12:00:00.000000+00:00";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    title: "Gorro",
    status: "in_progress",
    updated_at: T1,
    pattern_id: "d1",
    pattern_version_id: "v1",
    pattern: { title: "Diseño", updated_at: T0 },
    version: { version: 3, created_at: T0, worked_in: "rounds", height: "8", repeat_y: "2" },
    progress: { round_number: 5, stitch_index: 4, updated_at: T1 },
    ...over,
  };
}

async function list(rows: unknown[]) {
  const { supabase } = client({ data: rows });
  const r = await listProjects(supabase, ANA);
  if (!r.ok) throw new Error("listProjects falló");
  return r.projects;
}

describe("listProjects: consulta", () => {
  it("lee `projects` con el cliente de la sesión, filtra por dueña, ordena por lo más reciente y pone tope", async () => {
    const { supabase, calls } = client({ data: [] });
    expect(await listProjects(supabase, ANA)).toEqual({ ok: true, projects: [] });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "projects", eq: [["owner_id", ANA]], order: [["updated_at", { ascending: false }]], limit: 500 });
    // Solo rutas JSON de la versión fijada: nunca el documento completo (ADR 0009, T1-2).
    expect(calls[0]!.select).toContain("document->chart->>workedIn");
    expect(calls[0]!.select).not.toMatch(/[,(]\s*document\s*[,)]/);
  });

  it("`data` nulo es una lista vacía; un error de la base se traduce sin filtrar su texto", async () => {
    expect(await listProjects(client({ data: null }).supabase, ANA)).toEqual({ ok: true, projects: [] });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await listProjects(client({ error: { code: "XX000", message: "relation secreta_interna does not exist" } }).supabase, ANA);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("secreta_interna");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secreta_interna");
  });
});

describe("listProjects: avance de cada tarjeta", () => {
  it("el total de filas es el de follow (alto × repeat.y) y el puntero sale de las columnas (round_number − 1)", async () => {
    const [p] = await list([row()]);
    expect(p).toEqual({
      id: "p1",
      title: "Gorro",
      status: "in_progress",
      updatedAt: T1,
      design: { patternId: "d1", patternTitle: "Diseño", version: 3, workedIn: "rounds", totalRows: 16, pointer: { rowsDone: 4, stitchesDone: 4 }, progressUpdatedAt: T1, mayHaveNewer: false },
    });
    // Misma cuenta que el plan de la pantalla "Tejiendo" (CA3-T13): no hay un segundo cálculo en apps/web.
    const doc = newChartPattern({ id: "d1", title: "Diseño", width: 4, height: 8, repeat: { x: 3, y: 2 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns: [] });
    expect(p!.design!.totalRows).toBe(planChart(doc).totalRows);
    expect(p!.design!.totalRows).toBe(totalRowsOf(8, 2));
  });

  it("PostgREST puede devolver las relaciones como lista de uno: mismo resultado", async () => {
    const asObject = await list([row()]);
    const r = row();
    const asList = await list([{ ...r, pattern: [r.pattern], version: [r.version], progress: [r.progress] }]);
    expect(asList).toEqual(asObject);
  });

  it("`workedIn` de la versión fijada: `rows` es ida y vuelta; cualquier otro valor (o nulo) cae en redondo", async () => {
    const worked = async (v: unknown) => (await list([row({ version: { version: 1, created_at: T0, worked_in: v, height: "8", repeat_y: "1" } })]))[0]!.design!.workedIn;
    expect(await worked("rows")).toBe("rows");
    expect(await worked("rounds")).toBe("rounds");
    expect(await worked(null)).toBe("rounds");
    expect(await worked("otra")).toBe("rounds");
  });

  it("sin fila de avance (proyecto recién creado o anterior a la fase 3): inicio, sin fecha", async () => {
    const [p] = await list([row({ progress: null })]);
    expect(p!.design).toMatchObject({ pointer: { rowsDone: 0, stitchesDone: 0 }, progressUpdatedAt: null });
    const [q] = await list([row({ progress: [] })]);
    expect(q!.design).toMatchObject({ pointer: { rowsDone: 0, stitchesDone: 0 }, progressUpdatedAt: null });
  });

  it("gráfico terminado: round_number = total + 1 da rowsDone = total", async () => {
    const [p] = await list([row({ progress: { round_number: 17, stitch_index: 0, updated_at: T1 } })]);
    expect(p!.design).toMatchObject({ totalRows: 16, pointer: { rowsDone: 16, stitchesDone: 0 } });
  });

  it("diseño que se acortó: un avance más allá del total se acota al total (nunca «fila 41 de 16»)", async () => {
    const [p] = await list([row({ progress: { round_number: 41, stitch_index: 7, updated_at: T1 } })]);
    expect(p!.design!.pointer.rowsDone).toBe(16);
    expect(p!.design!.pointer.rowsDone).toBeLessThanOrEqual(p!.design!.totalRows);
  });

  it("columnas dañadas (nulas, negativas, texto, NaN) no lanzan: inicio", async () => {
    for (const progress of [
      { round_number: null, stitch_index: null, updated_at: T1 },
      { round_number: -3, stitch_index: -1, updated_at: T1 },
      { round_number: "7", stitch_index: "2", updated_at: T1 },
      { round_number: Number.NaN, stitch_index: Number.NaN, updated_at: T1 },
    ]) {
      const [p] = await list([row({ progress })]);
      expect(p!.design!.pointer, JSON.stringify(progress)).toEqual({ rowsDone: 0, stitchesDone: 0 });
    }
  });

  it("alto o repeat.y dañados en la versión (nulo, texto, decimal, negativo, enorme): total 0, sin lanzar", async () => {
    for (const [height, repeat_y] of [
      [null, "2"],
      ["8", null],
      ["ocho", "2"],
      ["8.5", "2"],
      ["-8", "2"],
      ["0", "2"],
      ["12345678", "2"],
    ] as const) {
      const [p] = await list([row({ version: { version: 1, created_at: T0, worked_in: "rounds", height, repeat_y } })]);
      expect(p!.design, `${height} × ${repeat_y}`).toMatchObject({ totalRows: 0, pointer: { rowsDone: 0 } });
    }
  });

  it("máximo del modelo (200 × 500 = 100.000 filas) y gráfico de 1 × 1", async () => {
    const [big] = await list([row({ version: { version: 1, created_at: T0, worked_in: "rows", height: "200", repeat_y: "500" }, progress: { round_number: 100_001, stitch_index: 0, updated_at: T1 } })]);
    expect(big!.design).toMatchObject({ totalRows: 100_000, pointer: { rowsDone: 100_000, stitchesDone: 0 } });
    const [one] = await list([row({ version: { version: 1, created_at: T0, worked_in: "rounds", height: "1", repeat_y: "1" }, progress: { round_number: 1, stitch_index: 0, updated_at: T1 } })]);
    expect(one!.design).toMatchObject({ totalRows: 1, pointer: { rowsDone: 0, stitchesDone: 0 } });
  });
});

describe("listProjects: proyectos sueltos, estados y versión más nueva", () => {
  it("sin versión fijada (o sin poder leerla) es un proyecto suelto: `design` nulo, conserva título y estado", async () => {
    const [a] = await list([row({ pattern_version_id: null, version: null })]);
    expect(a).toEqual({ id: "p1", title: "Gorro", status: "in_progress", updatedAt: T1, design: null });
    const [b] = await list([row({ version: null })]); // la versión existe pero RLS no la devolvió
    expect(b!.design).toBeNull();
    const [c] = await list([row({ version: [] })]);
    expect(c!.design).toBeNull();
  });

  it("un estado desconocido cae en `planned`; los cuatro conocidos se conservan", async () => {
    for (const s of ["planned", "in_progress", "paused", "finished"]) expect((await list([row({ status: s })]))[0]!.status).toBe(s);
    expect((await list([row({ status: "archivado" })]))[0]!.status).toBe("planned");
  });

  it("diseño borrado o ilegible: título nulo, sin pista de versión nueva, y el avance sigue", async () => {
    const [p] = await list([row({ pattern: null, pattern_id: null })]);
    expect(p!.design).toMatchObject({ patternId: null, patternTitle: null, mayHaveNewer: false, totalRows: 16, pointer: { rowsDone: 4, stitchesDone: 4 } });
  });

  it("`mayHaveNewer` solo si el diseño cambió después de la versión Y después del proyecto", async () => {
    const newer = async (patternAt: string, versionAt: string, projectAt: string) =>
      (await list([row({ updated_at: projectAt, pattern: { title: "Diseño", updated_at: patternAt }, version: { version: 1, created_at: versionAt, worked_in: "rounds", height: "8", repeat_y: "2" } })]))[0]!.design!.mayHaveNewer;
    expect(await newer(T2, T0, T1)).toBe(true);
    expect(await newer(T0, T0, T0), "mismo instante: no es posterior").toBe(false);
    expect(await newer(T1, T0, T2), "el proyecto se tocó después (por ejemplo, recién pasó de versión)").toBe(false);
    expect(await newer(T1, T2, T0), "la versión es posterior al diseño").toBe(false);
    expect(await newer("no es una fecha", T0, T0), "fecha dañada: sin pista, sin lanzar").toBe(false);
    // Microsegundos de PostgREST: `Date` los trunca a milisegundos; una diferencia menor a 1 ms no cuenta como posterior.
    expect(await newer("2026-11-10T10:00:00.000900+00:00", "2026-11-10T10:00:00.000100+00:00", "2026-11-10T10:00:00.000100+00:00")).toBe(false);
  });

  it("conserva el orden que devuelve la base y no mezcla datos entre tarjetas", async () => {
    const out = await list([row({ id: "a", title: "A" }), row({ id: "b", title: "B", pattern_version_id: null, version: null }), row({ id: "c", title: "C", progress: { round_number: 2, stitch_index: 0, updated_at: T2 } })]);
    expect(out.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(out.map((p) => p.design?.pointer.rowsDone ?? null)).toEqual([4, null, 1]);
  });
});

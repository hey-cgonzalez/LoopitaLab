import { vi } from "vitest";
import { instantMicros } from "./patterns-db.ts";

/**
 * Doble en memoria de las tablas de "Tejer este diseño" y de las lanas guardadas, con la forma de supabase-js
 * (consultas encadenables y "thenable"). Imita lo que importa para las pruebas de las Server Actions de proyectos:
 *  - RLS: la sesión (`db.current`) solo ve y toca lo suyo (patrones y lanas por `owner_id`; versiones, proyectos y avance
 *    a través del dueño);
 *  - permisos por columna de `authenticated` (migración 20261111031813): `project_progress` solo escribe
 *    `part_id, round_number, stitch_index` (42501 con cualquier otra), con las cotas generales (23514);
 *  - `project_progress.updated_at` avanza con cada escritura (disparador `set_updated_at`);
 *  - borrar un patrón con proyectos que fijan una de sus versiones falla con 23503;
 *  - `db.admin.rpc`: `start_chart_project` y `repin_project` con la semántica de la migración (dueño, `kind`, `updated_at`
 *    exacto, reutilización de la versión idéntica, topes, PT409 con `details`). Solo existe en el cliente admin: la
 *    sesión no tiene `rpc` (service_role es la única que las ejecuta).
 * No sustituye a supabase/checks/10_rls_check.sql, que prueba las políticas y funciones reales.
 */

type Rec = Record<string, unknown> & { id?: string };
export type DbErr = { message: string; code?: string; details?: string | null };
type Res = { data: unknown; error: DbErr | null; count?: number };

export const ts = (n: number) => `2026-11-11T10:00:00.${String(n).padStart(6, "0")}+00:00`;

const PROGRESS_WRITABLE = ["project_id", "part_id", "round_number", "stitch_index"];
const YARN_WRITABLE = ["owner_id", "weight", "composition", "color_hex", "palette_id", "note"];

export function createProjectsDb(me: { id: string } | null) {
  const db = {
    current: me,
    patterns: [] as Rec[],
    versions: [] as Rec[],
    projects: [] as Rec[],
    progress: [] as Rec[],
    profiles: [] as Rec[],
    yarns: [] as Rec[],
    clock: 1,
    seq: 1,
    /** Todas las consultas: [tabla, operación, filtros, carga]. */
    log: [] as { table: string; op: string; filters: [string, unknown][]; payload?: unknown }[],
    /** Error para la próxima escritura de la sesión (`table.op`, por ejemplo "patterns.delete"). */
    writeError: null as { at: string; error: DbErr } | null,
    /** Error para la próxima llamada rpc del cliente admin. */
    rpcError: null as DbErr | null,
    /** Se ejecuta justo antes de aplicar un rpc (simula otra pestaña que escribe entre la validación y la llamada). */
    beforeRpc: null as (() => void) | null,
    rpcLog: [] as { fn: string; args: Record<string, unknown> }[],
    tick: () => ts(db.clock++),
    uid: () => `00000000-0000-4000-8000-${String(db.seq++).padStart(12, "0")}`,
    seedPattern(row: { id: string; owner_id: string; document: Record<string, unknown>; kind?: string }): Rec {
      const r: Rec = { kind: "chart", created_at: db.tick(), updated_at: db.tick(), title: String(row.document.title ?? "Sin título"), ...row };
      db.patterns.push(r);
      return r;
    },
    /** Otra pestaña guarda el diseño: cambia el documento y avanza `updated_at`. */
    editPattern(id: string, document: Record<string, unknown>) {
      const r = db.patterns.find((p) => p.id === id)!;
      r.document = document;
      r.title = String(document.title);
      r.updated_at = db.tick();
    },
    /** `updated_at` que devolvería `getKnitPreview` (`patternUpdatedAt`); con un id desconocido, un instante válido cualquiera. */
    updatedAt(id: string): string {
      return (db.patterns.find((p) => p.id === id)?.updated_at as string | undefined) ?? ts(0);
    },
    touchPattern(id: string) {
      db.patterns.find((p) => p.id === id)!.updated_at = db.tick();
    },
    /** Otro dispositivo guarda el avance. */
    setProgress(projectId: string, round_number: number, stitch_index: number) {
      const r = db.progress.find((p) => p.project_id === projectId);
      if (r) Object.assign(r, { round_number, stitch_index, updated_at: db.tick() });
      else db.progress.push({ project_id: projectId, part_id: null, round_number, stitch_index, updated_at: db.tick() });
    },
    versionsOf: (patternId: string) => db.versions.filter((v) => v.pattern_id === patternId),
  };

  const mine = () => db.current?.id ?? null;
  const ownsPattern = (id: unknown) => db.patterns.some((p) => p.id === id && p.owner_id === mine());
  const ownsProject = (id: unknown) => db.projects.some((p) => p.id === id && p.owner_id === mine());

  /** RLS por tabla. */
  function visible(table: string): Rec[] {
    if (mine() === null) return [];
    switch (table) {
      case "patterns":
        return db.patterns.filter((r) => r.owner_id === mine());
      case "pattern_versions":
        return db.versions.filter((r) => ownsPattern(r.pattern_id));
      case "projects":
        return db.projects.filter((r) => r.owner_id === mine());
      case "project_progress":
        return db.progress.filter((r) => ownsProject(r.project_id));
      case "profiles":
        return db.profiles.filter((r) => r.id === mine());
      case "user_yarns":
        return db.yarns.filter((r) => r.owner_id === mine());
      default:
        return [];
    }
  }

  function same(cur: unknown, v: unknown, col: string): boolean {
    if (col === "updated_at" || col === "created_at") {
      const a = instantMicros(cur);
      const b = instantMicros(v);
      return a !== null && b !== null && a === b;
    }
    return cur === v;
  }

  function builder(table: string) {
    const st: { op: "select" | "insert" | "update" | "delete"; payload?: Rec; filters: [string, unknown][]; limitN?: number; desc: boolean; head: boolean; count: boolean } = {
      op: "select",
      filters: [],
      desc: false,
      head: false,
      count: false,
    };
    const q: Record<string, unknown> = {};
    const chain = (name: string, fn: (...a: unknown[]) => void) => {
      q[name] = vi.fn((...a: unknown[]) => (fn(...a), q));
    };
    chain("select", (_cols, o) => {
      const opts = o as { count?: string; head?: boolean } | undefined;
      if (opts?.count) st.count = true;
      if (opts?.head) st.head = true;
    });
    chain("insert", (p) => ((st.op = "insert"), (st.payload = p as Rec)));
    chain("update", (p) => ((st.op = "update"), (st.payload = p as Rec)));
    chain("delete", () => (st.op = "delete"));
    chain("eq", (c, v) => st.filters.push([c as string, v]));
    chain("order", (_c, o) => (st.desc = (o as { ascending?: boolean } | undefined)?.ascending === false));
    chain("limit", (n) => (st.limitN = n as number));

    const run = (): Res => {
      db.log.push({ table, op: st.op, filters: [...st.filters], payload: st.payload });
      if (!db.current) return { data: null, error: { message: "JWT", code: "42501" } };
      if (st.op !== "select" && db.writeError?.at === `${table}.${st.op}`) {
        const e = db.writeError.error;
        db.writeError = null;
        return { data: null, error: e };
      }
      const match = (r: Rec) => st.filters.every(([c, v]) => same(r[c], v, c));
      const outside = (cols: string[]) => Object.keys(st.payload ?? {}).some((c) => !cols.includes(c));
      const denied: Res = { data: null, error: { message: `permission denied for table ${table}`, code: "42501" } };

      if (st.op === "select") {
        let out = visible(table).filter(match);
        if (st.desc) out = [...out].sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1));
        if (st.limitN !== undefined) out = out.slice(0, st.limitN);
        return { data: st.head ? null : out.map((r) => ({ ...r })), error: null, count: out.length };
      }

      if (st.op === "insert") {
        const p = st.payload!;
        if (table === "project_progress") {
          if (outside(PROGRESS_WRITABLE)) return denied;
          if (!ownsProject(p.project_id)) return { data: null, error: { message: "rls", code: "42501" } };
          if (db.progress.some((r) => r.project_id === p.project_id)) return { data: null, error: { message: "duplicate key", code: "23505" } };
          if (!Number.isInteger(p.round_number) || (p.round_number as number) < 1 || (p.round_number as number) > 100001) return { data: null, error: { message: "check", code: "23514" } };
          if (!Number.isInteger(p.stitch_index) || (p.stitch_index as number) < 0 || (p.stitch_index as number) > 100000) return { data: null, error: { message: "check", code: "23514" } };
          const row = { part_id: null, ...p, updated_at: db.tick() };
          db.progress.push(row);
          return { data: [{ ...row }], error: null };
        }
        if (table === "user_yarns") {
          if (outside(YARN_WRITABLE)) return denied;
          if (p.owner_id !== mine()) return { data: null, error: { message: "rls", code: "42501" } };
          if (db.yarns.filter((r) => r.owner_id === mine()).length >= 500) return { data: null, error: { message: "Llegaste al tope de 500 lanas", code: "54000" } };
          const row: Rec = { id: db.uid(), note: null, palette_id: null, created_at: db.tick(), ...p };
          db.yarns.push(row);
          return { data: [{ ...row }], error: null };
        }
        return denied;
      }

      const hit = visible(table).filter(match);
      if (st.op === "update") {
        if (table === "project_progress") {
          if (outside(PROGRESS_WRITABLE.slice(1))) return denied;
          for (const r of hit) Object.assign(r, st.payload, { updated_at: db.tick() });
          return { data: hit.map((r) => ({ ...r })), error: null };
        }
        if (table === "user_yarns") {
          if (outside(YARN_WRITABLE.slice(1))) return denied;
          for (const r of hit) Object.assign(r, st.payload);
          return { data: hit.map((r) => ({ ...r })), error: null };
        }
        return denied;
      }

      // delete
      if (table === "patterns") {
        const ids = hit.map((r) => r.id as string | undefined);
        const pinned = db.projects.some((pr) => ids.includes(pr.pattern_id as string) && pr.pattern_version_id);
        if (pinned) return { data: null, error: { message: 'update or delete on table "pattern_versions" violates foreign key constraint', code: "23503" } };
        db.patterns = db.patterns.filter((r) => !hit.includes(r));
        db.versions = db.versions.filter((v) => !ids.includes(v.pattern_id as string));
        for (const pr of db.projects) if (ids.includes(pr.pattern_id as string)) pr.pattern_id = null;
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (table === "projects") {
        // RLS "proyectos: borrar propios"; el avance se va en cascada.
        const ids = hit.map((r) => r.id);
        db.projects = db.projects.filter((r) => !hit.includes(r));
        db.progress = db.progress.filter((r) => !ids.includes(r.project_id as string));
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (table === "user_yarns") {
        db.yarns = db.yarns.filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      return denied;
    };

    const one = (strict: boolean) => {
      const r = run();
      if (r.error) return r;
      const arr = r.data as unknown[];
      if (strict && arr.length !== 1) return { data: null, error: { message: "PGRST116", code: "PGRST116" } };
      return { data: arr[0] ?? null, error: null };
    };
    q.single = vi.fn(async () => one(true));
    q.maybeSingle = vi.fn(async () => one(false));
    q.then = (ok: (v: Res) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko);
    return q;
  }

  // ------------------------------------------------------------ cliente admin (service_role): rpc

  const fail = (code: string, message: string, details: string | null = null) => ({ data: null, error: { code, message, details } });

  /** pin_current_version: reutiliza la última versión idéntica o crea una (tope 200 por diseño). */
  function pin(patternId: string, document: unknown): { id: string; version: number; reused: boolean } | DbErr {
    const last = db.versionsOf(patternId).sort((a, b) => (a.version as number) - (b.version as number)).at(-1);
    if (last && JSON.stringify(last.document) === JSON.stringify(document)) return { id: last.id as string, version: last.version as number, reused: true };
    const next = ((last?.version as number | undefined) ?? 0) + 1;
    if (next > 200) return { code: "54000", message: "Este patrón llegó al máximo de 200 versiones guardadas" };
    const v: Rec = { id: db.uid(), pattern_id: patternId, version: next, document: JSON.parse(JSON.stringify(document)) };
    db.versions.push(v);
    return { id: v.id as string, version: next, reused: false };
  }

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>): Promise<Res> => {
    db.rpcLog.push({ fn, args });
    if (db.rpcError) {
      const e = db.rpcError;
      db.rpcError = null;
      return { data: null, error: e };
    }
    db.beforeRpc?.();
    db.beforeRpc = null;
    if (fn === "start_chart_project") {
      const { p_owner_id, p_pattern_id, p_expected_updated_at, p_title } = args as Record<string, string | null>;
      if (!p_owner_id || !p_pattern_id || !p_expected_updated_at) return fail("22023", "Faltan argumentos");
      const pat = db.patterns.find((p) => p.id === p_pattern_id);
      if (!pat || pat.owner_id !== p_owner_id) return fail("P0002", "Patrón no encontrado");
      if (pat.kind !== "chart") return fail("22023", "Solo se pueden tejer gráficos de colorwork");
      if (!same(pat.updated_at, p_expected_updated_at, "updated_at")) return fail("PT409", "El diseño cambió desde que se validó", "pattern");
      const pinned = pin(p_pattern_id, pat.document);
      if ("message" in pinned) return { data: null, error: pinned };
      const title = (p_title ?? "").trim() || String(pat.title);
      if ([...title].length > 120) return fail("23514", "check");
      if (db.projects.filter((p) => p.owner_id === p_owner_id).length >= 1000) return fail("54000", "Llegaste al tope de 1000 proyectos");
      const project: Rec = { id: db.uid(), owner_id: p_owner_id, title, status: "in_progress", pattern_id: p_pattern_id, pattern_version_id: pinned.id, created_at: db.tick() };
      db.projects.push(project);
      db.progress.push({ project_id: project.id, part_id: null, round_number: 1, stitch_index: 0, updated_at: db.tick() });
      return { data: [{ project_id: project.id, version: pinned.version, reused: pinned.reused }], error: null };
    }
    if (fn === "repin_project") {
      const a = args as Record<string, string | number | null>;
      if (!a.p_owner_id || !a.p_project_id || !a.p_expected_updated_at || a.p_round_number === null || a.p_stitch_index === null) return fail("22023", "Faltan argumentos");
      const pr = db.projects.find((p) => p.id === a.p_project_id);
      if (!pr || pr.owner_id !== a.p_owner_id) return fail("P0002", "Proyecto no encontrado");
      if (!pr.pattern_id) return fail("22023", "El proyecto no tiene un diseño asociado");
      const pat = db.patterns.find((p) => p.id === pr.pattern_id);
      if (!pat || pat.owner_id !== a.p_owner_id) return fail("P0002", "Patrón no encontrado");
      if (pat.kind !== "chart") return fail("22023", "Solo se pueden tejer gráficos de colorwork");
      if (!same(pat.updated_at, a.p_expected_updated_at, "updated_at")) return fail("PT409", "El diseño cambió desde que se validó", "pattern");
      const prog = db.progress.find((p) => p.project_id === pr.id);
      const expected = a.p_expected_progress_updated_at;
      if (prog ? !(expected !== null && same(prog.updated_at, expected, "updated_at")) : expected !== null) return fail("PT409", "El avance cambió en otro dispositivo", "progress");
      const pinned = pin(pr.pattern_id as string, pat.document);
      if ("message" in pinned) return { data: null, error: pinned };
      pr.pattern_version_id = pinned.id;
      db.setProgress(pr.id as string, a.p_round_number as number, a.p_stitch_index as number);
      const at = db.progress.find((p) => p.project_id === pr.id)!.updated_at;
      return { data: [{ version: pinned.version, reused: pinned.reused, progress_updated_at: at }], error: null };
    }
    return fail("42883", "no existe");
  });

  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: db.current } })) },
    from: (table: string) => builder(table),
  };
  const admin = { rpc };
  return Object.assign(db, { client, admin });
}

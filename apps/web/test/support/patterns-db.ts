import { vi } from "vitest";

/**
 * Simulación en memoria de la tabla `patterns` y de `snapshot_pattern` con la forma de supabase-js
 * (consultas encadenables y "thenable"). Imita lo que importa para las pruebas de los diseños:
 *  - RLS: cada usuaria solo ve y toca sus filas (`current.id`);
 *  - `updated_at` avanza con cada escritura (microsegundos, como PostgREST);
 *  - restricciones de la base (`patterns_document_consistent`, `patterns_document_text_size`): ver
 *    `CONSISTENCY_RULES` y test/disenos-qa.test.ts, que las compara con la última migración;
 *  - jsonb rechaza `\u0000` (22P05) y sustitutos UTF-16 sueltos (22P02);
 *  - `updated_at` se compara por instante (como timestamptz), no como texto;
 *  - permisos por columna de `authenticated` (T15-M2): ni INSERT ni UPDATE pueden nombrar `visibility`
 *    (ni `owner_id` en UPDATE, ni columnas de sistema): 42501, aunque el valor sea `private`;
 *  - cuota de `patterns_quota` (T15-M3): `PATTERNS_QUOTA` diseños por usuaria, error 54000;
 *  - el trigger `patterns_guard_origin`: editar un diseño IA lo marca `ai_edited` (columna y documento).
 * No sustituye a supabase/checks/10_rls_check.sql, que prueba las políticas reales.
 */

/**
 * Condiciones de `patterns_document_consistent` que imita el doble, con la expresión SQL de la
 * migración. Si la migración cambia, test/disenos-qa.test.ts falla hasta que se actualice esta lista.
 */
export const CONSISTENCY_RULES: { sql: string; ok: (r: Row) => boolean }[] = [
  { sql: "jsonb_typeof(document) = 'object'", ok: (r) => typeof r.document === "object" && r.document !== null && !Array.isArray(r.document) },
  { sql: "jsonb_typeof(document -> 'yarns') = 'array'", ok: (r) => Array.isArray(r.document.yarns) },
  { sql: "document ->> 'kind' = kind", ok: (r) => typeof r.document.kind === "string" && r.document.kind === r.kind },
  { sql: "document ->> 'technique' = technique", ok: (r) => typeof r.document.technique === "string" && r.document.technique === r.technique },
  { sql: "(document ->> 'schemaVersion')::smallint = schema_version", ok: (r) => Number(r.document.schemaVersion) === r.schema_version },
  { sql: "document -> 'origin' ->> 'kind' = origin", ok: (r) => (r.document.origin as { kind?: unknown } | undefined)?.kind === r.origin },
  { sql: "jsonb_typeof(document -> 'title') = 'string'", ok: (r) => typeof r.document.title === "string" },
  { sql: "coalesce(document ->> 'title' = title, false)", ok: (r) => typeof r.document.title === "string" && r.document.title === r.title },
];

/** Tope de `patterns_quota`. */
export const PATTERNS_QUOTA = 500;

/** Columnas con INSERT / UPDATE para `authenticated` (20261106110000_publicar_y_cuotas.sql). */
export const INSERT_COLUMNS = ["id", "owner_id", "title", "technique", "kind", "schema_version", "origin", "document"];
export const UPDATE_COLUMNS = ["title", "technique", "kind", "schema_version", "origin", "document"];

/** Tope de `patterns_document_text_size`. */
export const DOCUMENT_TEXT_MAX = 1_000_000;

/**
 * Bytes de `document::text` en Postgres: jsonb escribe ", " y ": " (un byte más por separador que
 * el JSON compacto). Los números y escapes se toman como JSON.stringify (suficiente para el tope).
 */
export function jsonbTextBytes(v: unknown): number {
  if (Array.isArray(v)) return v.length === 0 ? 2 : 2 + v.reduce((n: number, x) => n + jsonbTextBytes(x), 0) + 2 * (v.length - 1);
  if (v !== null && typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined);
    return e.length === 0 ? 2 : 2 + e.reduce((n, [k, x]) => n + Buffer.byteLength(JSON.stringify(k)) + 2 + jsonbTextBytes(x), 0) + 2 * (e.length - 1);
  }
  return Buffer.byteLength(JSON.stringify(v) ?? "null");
}

/** Error que daría Postgres al convertir el documento a jsonb (en textos y claves), o null. */
export function jsonbInputError(v: unknown): Err | null {
  const strings: string[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "string") strings.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x !== null && typeof x === "object") for (const [k, y] of Object.entries(x)) (strings.push(k), walk(y));
  };
  walk(v);
  if (strings.some((t) => t.includes("\u0000"))) return { message: "unsupported Unicode escape sequence", code: "22P05" };
  if (strings.some((t) => !t.isWellFormed())) return { message: "invalid input syntax for type json", code: "22P02" };
  return null;
}

/** Instante de un timestamptz en microsegundos desde 1970, o null si no se entiende. */
export function instantMicros(v: unknown): bigint | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(v);
  if (!m) return null;
  let tz = m[4] as string;
  if (/^[+-]\d{2}$/.test(tz)) tz += ":00";
  else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const ms = Date.parse(`${m[1]}T${m[2]}${tz}`);
  if (Number.isNaN(ms)) return null;
  return BigInt(ms) * 1000n + BigInt((m[3] ?? "").padEnd(6, "0") || "0");
}

export interface Row {
  id: string;
  owner_id: string;
  title: string;
  technique: string;
  kind: string;
  schema_version: number;
  origin: string;
  visibility: string;
  document: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type Err = { message: string; code?: string };
type Res = { data: unknown; error: Err | null };

export const stamp = (n: number) => `2026-11-06T10:00:00.${String(n).padStart(6, "0")}+00:00`;

export function createFakeDb(me: { id: string } | null) {
  const db = {
    current: me,
    rows: [] as Row[],
    versions: [] as { pattern_id: string; version: number; label: string | null }[],
    clock: 1,
    /** Cada consulta recibida: [tabla, operación, filtros]. Sirve para comprobar qué se escribió. */
    log: [] as { table: string; op: string; payload?: unknown; filters: [string, unknown][]; sel?: string }[],
    /** Error que devolverá la próxima escritura (para simular fallos de la base). */
    nextError: null as Err | null,
    snapshotError: null as Err | null,
    seed(row: Partial<Row> & Pick<Row, "id" | "owner_id" | "document">): Row {
      const full: Row = {
        title: String(row.document.title ?? "Sin título"),
        technique: "knit",
        kind: "chart",
        schema_version: 1,
        origin: "manual",
        visibility: "private",
        created_at: stamp(db.clock),
        updated_at: stamp(db.clock++),
        ...row,
      };
      db.rows.push(full);
      return full;
    },
    tick: () => stamp(db.clock++),
  };

  const visible = () => db.rows.filter((r) => db.current !== null && r.owner_id === db.current.id);

  function builder(table: string) {
    const st: { op: "select" | "insert" | "update" | "delete"; payload?: Record<string, unknown>; filters: [string, unknown][]; sel?: string; limitN?: number; desc: boolean } = {
      op: "select",
      filters: [],
      desc: false,
    };
    const q: Record<string, unknown> = {};
    const chain = (name: string, fn: (...a: unknown[]) => void) => {
      q[name] = vi.fn((...a: unknown[]) => {
        fn(...a);
        return q;
      });
    };
    chain("select", (cols) => {
      st.sel = cols as string;
    });
    chain("insert", (p) => {
      st.op = "insert";
      st.payload = p as Record<string, unknown>;
    });
    chain("update", (p) => {
      st.op = "update";
      st.payload = p as Record<string, unknown>;
    });
    chain("delete", () => {
      st.op = "delete";
    });
    chain("eq", (c, v) => {
      st.filters.push([c as string, v]);
    });
    chain("order", (_c, o) => {
      st.desc = (o as { ascending?: boolean } | undefined)?.ascending === false;
    });
    chain("limit", (n) => {
      st.limitN = n as number;
    });

    const run = (): Res => {
      db.log.push({ table, op: st.op, payload: st.payload, filters: [...st.filters], sel: st.sel });
      if (!db.current) return { data: null, error: { message: "JWT", code: "42501" } };
      const match = (r: Row) =>
        st.filters.every(([c, v]) => {
          const cur = (r as unknown as Record<string, unknown>)[c];
          if (c === "updated_at" || c === "created_at") {
            const a = instantMicros(cur);
            const b = instantMicros(v);
            return a !== null && b !== null && a === b;
          }
          return cur === v;
        });
      const writeErr = db.nextError;
      if (st.op !== "select" && writeErr) {
        db.nextError = null;
        return { data: null, error: writeErr };
      }
      const consistent = (r: Row) => CONSISTENCY_RULES.every((rule) => rule.ok(r));
      const tooBig = (r: Row) => jsonbTextBytes(r.document) > DOCUMENT_TEXT_MAX;
      const payloadErr = st.payload && "document" in st.payload ? jsonbInputError(st.payload.document) : null;
      if ((st.op === "insert" || st.op === "update") && payloadErr) return { data: null, error: payloadErr };
      const forbidden = (cols: string[]) => Object.keys(st.payload ?? {}).some((c) => !cols.includes(c));
      if (st.op === "insert" && forbidden(INSERT_COLUMNS)) return { data: null, error: { message: "permission denied for table patterns", code: "42501" } };
      if (st.op === "update" && forbidden(UPDATE_COLUMNS)) return { data: null, error: { message: "permission denied for table patterns", code: "42501" } };
      if (st.op === "insert") {
        const p = st.payload as Partial<Row>;
        const row = {
          owner_id: db.current.id,
          technique: "knit",
          kind: "chart",
          origin: "manual",
          visibility: "private",
          schema_version: 1,
          created_at: db.tick(),
          updated_at: db.tick(),
          ...p,
        } as Row;
        // RLS: solo se inserta como uno mismo. patterns_guard_origin: el origen IA lo asigna el servidor.
        if (row.owner_id !== db.current.id) return { data: null, error: { message: "rls", code: "42501" } };
        if (row.origin !== "manual") return { data: null, error: { message: "El origen IA lo asigna el servidor", code: "42501" } };
        if (!consistent(row) || tooBig(row)) return { data: null, error: { message: "check", code: "23514" } };
        if (db.rows.filter((r) => r.owner_id === row.owner_id).length >= PATTERNS_QUOTA) return { data: null, error: { message: "Llegaste al tope de 500 diseños", code: "54000" } };
        db.rows.push(row);
        return { data: [row], error: null };
      }
      const hit = visible().filter(match);
      if (st.op === "update") {
        const done: Row[] = [];
        for (const r of hit) {
          const next = { ...r, ...(st.payload as Partial<Row>) };
          // patterns_guard_origin (UPDATE de authenticated).
          if (r.origin === "manual" && next.origin !== "manual") return { data: null, error: { message: "origen", code: "42501" } };
          if (r.origin !== "manual") {
            if (next.origin === "manual") return { data: null, error: { message: "IA conserva su etiqueta", code: "42501" } };
            if (JSON.stringify(next.document) !== JSON.stringify(r.document) || next.origin !== r.origin) {
              next.origin = "ai_edited";
              next.document = { ...next.document, origin: { ...(next.document.origin as object), kind: "ai_edited" } };
            }
          }
          if (!consistent(next) || tooBig(next)) return { data: null, error: { message: "check", code: "23514" } };
          Object.assign(r, next, { updated_at: db.tick() });
          done.push(r);
        }
        return { data: done, error: null };
      }
      if (st.op === "delete") {
        db.rows = db.rows.filter((r) => !hit.includes(r));
        return { data: hit, error: null };
      }
      let out = [...hit].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1) * (st.desc ? 1 : -1));
      if (st.limitN !== undefined) out = out.slice(0, st.limitN);
      // select con rutas JSON (listado): width:document->chart->>width, etc.
      if (st.sel?.includes("document->chart")) {
        const chart = (r: Row) => (r.document.chart ?? {}) as Record<string, unknown>;
        return {
          data: out.map((r) => ({
            id: r.id, title: r.title, technique: r.technique, kind: r.kind, origin: r.origin, visibility: r.visibility, updated_at: r.updated_at,
            width: chart(r).width === undefined ? null : String(chart(r).width),
            height: chart(r).height === undefined ? null : String(chart(r).height),
            render_as: chart(r).renderAs === undefined ? null : String(chart(r).renderAs),
          })),
          error: null,
        };
      }
      return { data: out, error: null };
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

  const rpc = vi.fn(async (fn: string, args: { p_pattern_id: string; p_label: string | null }): Promise<Res> => {
    db.log.push({ table: "rpc", op: fn, payload: args, filters: [] });
    if (fn !== "snapshot_pattern") return { data: null, error: { message: "no existe", code: "42883" } };
    if (db.snapshotError) return { data: null, error: db.snapshotError };
    const row = visible().find((r) => r.id === args.p_pattern_id);
    if (!row) return { data: null, error: { message: "Patrón no encontrado", code: "P0002" } };
    const version = db.versions.filter((v) => v.pattern_id === row.id).length + 1;
    db.versions.push({ pattern_id: row.id, version, label: args.p_label === null ? null : args.p_label.slice(0, 80) });
    return { data: version, error: null };
  });

  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: db.current } })) },
    from: (table: string) => builder(table),
    rpc,
  };
  return Object.assign(db, { client });
}

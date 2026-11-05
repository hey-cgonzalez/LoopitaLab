import { vi } from "vitest";

export type Result = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };

/**
 * Constructor de consultas encadenable al estilo de supabase-js: cada método devuelve el mismo
 * objeto, que es "thenable" y resuelve con `resolve(calls)`. `calls` registra la cadena.
 */
export function query(resolve: (calls: [string, unknown[]][]) => Result | Promise<Result>) {
  const calls: [string, unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "order", "range", "insert", "single", "delete"]) {
    q[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, args]);
      return q;
    });
  }
  q.then = (ok: (v: Result) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resolve(calls)).then(ok, ko);
  return Object.assign(q, { calls });
}

export const USER = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "bea@example.test",
  created_at: "2026-11-01T00:00:00Z",
  last_sign_in_at: "2026-11-05T00:00:00Z",
};

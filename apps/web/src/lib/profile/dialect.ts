/*
 * Valores de `profiles.pattern_dialect` (ADR 0011, sección 8). Vive fuera de app/cuenta/actions.ts porque un archivo
 * "use server" solo puede exportar funciones async.
 */
export const PATTERN_DIALECTS = ["es", "us", "uk"] as const;
export type PatternDialect = (typeof PATTERN_DIALECTS)[number];

export function isPatternDialect(v: unknown): v is PatternDialect {
  return typeof v === "string" && (PATTERN_DIALECTS as readonly string[]).includes(v);
}

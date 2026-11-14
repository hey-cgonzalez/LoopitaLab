import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Toda fecha formateada en la interfaz usa una zona fija (lib/time-zone.ts); si no, servidor y navegador no hidratan igual. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("formato de fechas", () => {
  it("cada Intl.DateTimeFormat y toLocale(Date|Time)String lleva timeZone", () => {
    const bad: string[] = [];
    for (const p of files(join(__dirname, "..", "src"))) {
      const src = readFileSync(p, "utf8");
      const re = /new Intl\.DateTimeFormat\([^)]*\)|\.toLocale(?:Date|Time)String\([^)]*\)/g;
      for (const m of src.match(re) ?? []) if (!m.includes("timeZone")) bad.push(`${p.split("/src/")[1]}: ${m}`);
    }
    expect(bad).toEqual([]);
  });
});

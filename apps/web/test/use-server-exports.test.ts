import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Next.js rechaza en tiempo de ejecución un archivo "use server" que exporta algo que no sea una función async
 * ("A 'use server' file can only export async functions"). El build y las pruebas unitarias no lo detectan; esta guardia sí.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const serverFiles = files(join(__dirname, "..", "src")).filter((p) =>
  /^\s*(["'])use server\1;?/.test(readFileSync(p, "utf8")),
);

describe('archivos "use server"', () => {
  it("hay al menos uno (la búsqueda funciona)", () => {
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it.each(serverFiles.map((p) => [p.split("/src/")[1], p]))("%s solo exporta funciones async y tipos", (_name, p) => {
    const src = readFileSync(p as string, "utf8");
    const bad = src
      .split("\n")
      .filter((l) => /^export\s/.test(l))
      .filter((l) => !/^export\s+(async\s+function|type\s|interface\s)/.test(l));
    expect(bad).toEqual([]);
  });
});

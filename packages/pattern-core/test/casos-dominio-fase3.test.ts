/**
 * Fase 3 (T16): trazabilidad de los casos F3-1 a F3-42 de docs/casos-dominio-fase-3.md, como la de la fase 2
 * (casos-dominio.test.ts, CA-F11). No repite la lógica de ningún caso: comprueba que
 *   1. el documento tiene exactamente los casos F3-1 a F3-42;
 *   2. cada caso tiene al menos una prueba activa (no `skip`, `todo` ni `fixme`) con "F3-N" en el título, en los
 *      paquetes o en apps/web (Vitest y E2E);
 *   3. los casos que el documento marca "validar con tejedora" llevan el comentario `// validar con tejedora`
 *      dentro de alguna de sus pruebas, para cambiarla si T1b corrige la regla;
 *   4. esa lista de casos marcados es la que conoce esta prueba (si el documento cambia, se revisa aquí).
 * La búsqueda es por título, así que mover o renombrar un archivo no la rompe. La tabla legible está en
 * docs/qa-fase-3.md.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const LAST = 42;
/** Casos que el documento marca "validar con tejedora" o "pendiente de validar por tejedora". */
const VALIDATE_WITH_KNITTER = [4, 6, 21, 30, 32, 35];
const MARKER = "// validar con tejedora";

function docCases(): Map<number, string> {
  const text = readFileSync(join(ROOT, "docs/casos-dominio-fase-3.md"), "utf8");
  const cases = new Map<number, string>();
  for (const line of text.split("\n")) {
    const m = /^\|\s*F3-(\d+)\s*\|(.*)\|\s*$/.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    assert.ok(!cases.has(n), `caso F3-${n} repetido en el documento`);
    cases.set(n, m[2]!);
  }
  return cases;
}

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(test|spec)\.ts$/.test(e.name)) out.push(p);
    }
  };
  for (const pkg of readdirSync(join(ROOT, "packages"), { withFileTypes: true })) {
    if (pkg.isDirectory()) {
      try {
        walk(join(ROOT, "packages", pkg.name, "test"));
      } catch {
        /* paquete sin pruebas */
      }
    }
  }
  walk(join(ROOT, "apps/web/test"));
  walk(join(ROOT, "apps/web/e2e"));
  return out.filter((f) => !f.endsWith("casos-dominio-fase3.test.ts"));
}

interface Block {
  file: string;
  call: string;
  /** Título de la prueba, precedido por el del `describe` que la contiene (los casos del grupo valen para sus pruebas). */
  title: string;
  body: string;
}

/**
 * Pruebas (`it` / `test`) de un archivo: título y cuerpo hasta la siguiente declaración. Una prueba hereda el título
 * del último `describe` declarado antes que ella (por ejemplo `describe("F3-37: …")` con varios `it` dentro).
 */
function blocks(file: string): Block[] {
  const source = readFileSync(file, "utf8");
  const re = /^[ \t]*(describe|it|test)((?:\.\w+)?)\(\s*(["'`])(.*)$/gm;
  const found: { index: number; kind: string; call: string; title: string }[] = [];
  for (let m = re.exec(source); m; m = re.exec(source)) found.push({ index: m.index, kind: m[1]!, call: `${m[1]}${m[2]}`, title: m[4]! });
  const out: Block[] = [];
  let group = "";
  let groupSkipped = false;
  found.forEach((f, i) => {
    // `test.describe(` de Playwright empieza con `test`: se trata como grupo.
    const isGroup = f.kind === "describe" || /^test\.describe/.test(f.call);
    if (isGroup) {
      group = f.title;
      groupSkipped = /\.(skip|todo|fixme)$/.test(f.call);
      return;
    }
    out.push({ file: relative(ROOT, file), call: groupSkipped ? `${f.call}.skip` : f.call, title: `${group} › ${f.title}`, body: source.slice(f.index, found[i + 1]?.index ?? source.length) });
  });
  return out;
}

/** Números de caso que nombra un título: "F3-7", y también los rangos "F3-23 a F3-27". */
function casesIn(title: string): Set<number> {
  const out = new Set<number>();
  for (const m of title.matchAll(/(?<![\w-])F3-(\d+)(?:\s+a\s+F3-(\d+))?/g)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= b && n <= LAST; n++) out.add(n);
  }
  return out;
}

describe("fase 3: casos de dominio F3-1 a F3-42", () => {
  const all = testFiles().flatMap(blocks);
  const active = all.filter((b) => !/\.(skip|todo|fixme)$/.test(b.call));
  const byCase = new Map<number, Block[]>();
  for (const b of active) for (const n of casesIn(b.title)) byCase.set(n, [...(byCase.get(n) ?? []), b]);

  it(`el documento tiene exactamente los casos F3-1 a F3-${LAST}`, () => {
    assert.deepEqual([...docCases().keys()].sort((a, b) => a - b), Array.from({ length: LAST }, (_v, i) => i + 1));
  });

  it("los casos marcados 'validar con tejedora' en el documento son los de esta lista", () => {
    const marked = [...docCases()].filter(([, row]) => /validar (con|por) tejedora/i.test(row)).map(([n]) => n);
    assert.deepEqual(marked.sort((a, b) => a - b), VALIDATE_WITH_KNITTER);
  });

  for (let n = 1; n <= LAST; n++) {
    const knitter = VALIDATE_WITH_KNITTER.includes(n);
    it(`F3-${n}: tiene prueba automática activa${knitter ? " y queda señalado 'validar con tejedora'" : ""}`, () => {
      const refs = byCase.get(n) ?? [];
      assert.ok(refs.length > 0, `F3-${n} sin prueba activa con "F3-${n}" en el título`);
      if (knitter) {
        assert.ok(refs.some((r) => r.body.includes(MARKER)), `F3-${n}: falta el comentario "${MARKER}" en alguna de sus pruebas (${refs.map((r) => r.file).join(", ")})`);
      }
    });
  }
});

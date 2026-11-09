/**
 * CA-F11 (roadmap, fase 2): trazabilidad de los 27 casos de docs/casos-dominio-colorwork.md.
 *
 * Esta prueba no repite la lógica de los casos: cada caso ya tiene su prueba en el paquete
 * que lo implementa (pattern-core, pattern-render, stitch-render, yarn-catalog). Aquí se fija
 * que el documento sigue teniendo los casos 1 a 27, que cada uno tiene al menos una prueba
 * con su referencia explícita "caso N" en el título (no saltada ni pendiente), y que los
 * marcados "validar con tejedora" llevan el comentario `// validar con tejedora` dentro de
 * esa prueba, para cambiarla si T1b corrige la regla.
 *
 * Si se mueve o renombra una prueba, actualizar la tabla de abajo y la de docs/qa-fase-2.md.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const CORE_DERIVED = "packages/pattern-core/test/derived.test.ts";
const CORE_VALIDATE = "packages/pattern-core/test/validate-colorwork.test.ts";
const CORE_PROPERTY = "packages/pattern-core/test/property-colorwork.test.ts";
const CORE_QA = "packages/pattern-core/test/qa-bordes-colorwork.test.ts";
const RENDER_SVG = "packages/pattern-render/test/chart-svg.test.ts";
const RENDER_PROPERTY = "packages/pattern-render/test/property.test.ts";
const STITCH_LAYOUT = "packages/stitch-render/test/layout.test.ts";
const YARN_CATALOG = "packages/yarn-catalog/test/catalog.test.ts";

type Ref = { file: string; title: string };

/** Caso → pruebas que lo cubren. `title` es el comienzo exacto del título de `it`, `test` o `describe`. */
const TRACE: Record<number, Ref[]> = {
  1: [{ file: CORE_DERIVED, title: "caso 1: en redondo" }],
  2: [{ file: CORE_DERIVED, title: "caso 2: en ida y vuelta" }],
  3: [
    { file: CORE_DERIVED, title: "caso 3: el espejo invierte los casos 1 y 2" },
    // El espejo en la numeración del SVG (lado de los números) se fija en el caso 25.
  ],
  4: [{ file: CORE_PROPERTY, title: "caso 4: readingDirection depende solo de workedIn" }],
  5: [
    { file: CORE_DERIVED, title: "caso 5: top_down es una rotación de 180°" },
    { file: STITCH_LAYOUT, title: "caso 5: top_down 3 × 2" },
  ],
  6: [{ file: CORE_DERIVED, title: "caso 6: motivo 5 × 3 con R = 8" }],
  7: [
    { file: CORE_DERIVED, title: "caso 7 (CA-F3)" },
    { file: STITCH_LAYOUT, title: "CA-F3: cuña de 8 repeticiones" },
  ],
  8: [
    { file: CORE_DERIVED, title: "caso 8 positivo" },
    { file: CORE_VALIDATE, title: "caso 8: CHART_SHAPING_IMPOSSIBLE y CHART_SHAPING_TOO_FAST" },
  ],
  9: [{ file: CORE_VALIDATE, title: "caso 9: CHART_SHAPING_STEEP" }],
  10: [{ file: CORE_VALIDATE, title: "caso 10: CHART_CIRCLE_NOT_CLOSED" }],
  11: [{ file: CORE_VALIDATE, title: "caso 11: CHART_CIRCLE_REPEATS y CHART_WEDGE_TOO_NARROW" }],
  12: [{ file: CORE_VALIDATE, title: "caso 12: CHART_CIRCLE_REPEAT_Y" }],
  13: [{ file: CORE_VALIDATE, title: "caso 13: CHART_SHAPING_UNEXPECTED" }],
  14: [{ file: CORE_VALIDATE, title: "caso 14: CHART_CIRCLE_START" }],
  15: [
    { file: CORE_VALIDATE, title: "caso 15: hebra que cierra la vuelta" },
    { file: CORE_QA, title: "caso 15: con dos repeticiones" },
  ],
  16: [
    { file: CORE_VALIDATE, title: "caso 16: B AAAAA B" },
    { file: CORE_QA, title: "caso 16: hebra de exactamente 4" },
  ],
  17: [{ file: CORE_VALIDATE, title: "caso 17: máximo de hebra por categoría" }],
  18: [{ file: CORE_VALIDATE, title: "caso 18: documento sin gauge" }],
  19: [
    { file: YARN_CATALOG, title: "caso 19: puntos y filas de jersey" },
    { file: YARN_CATALOG, title: "caso 19: filas / puntos entre 1,2 y 1,5" },
  ],
  20: [
    { file: CORE_DERIVED, title: "caso 20 (parte de T2)" },
    { file: CORE_VALIDATE, title: "caso 20 completo: dimensionsCm con circunferencia" },
    { file: CORE_QA, title: "caso 20: con muestra de 20 × 28" },
  ],
  21: [
    { file: CORE_VALIDATE, title: "caso 21: CHART_COLORS_PER_ROW" },
    { file: CORE_QA, title: "caso 21: el aviso de lanas por fila" },
  ],
  22: [
    { file: CORE_VALIDATE, title: "caso 22: YARNS_MIXED_WEIGHT" },
    { file: CORE_QA, title: "caso 22: tres grosores" },
  ],
  23: [
    { file: CORE_VALIDATE, title: "caso 23: CHART_ROWS_SHAPE" },
    { file: CORE_QA, title: "caso 23: el aviso sale una sola vez" },
  ],
  24: [
    { file: CORE_DERIVED, title: "caso 24: renderAs no cambia los conteos" },
    { file: CORE_PROPERTY, title: "caso 24: cambiar renderAs" },
  ],
  25: [
    { file: RENDER_SVG, title: "chartToSvg: numeración (caso 25" },
    { file: RENDER_PROPERTY, title: "la numeración tiene una etiqueta por fila, del lado donde empieza la lectura (caso 25)" },
  ],
  26: [{ file: STITCH_LAYOUT, title: "caso 26: bottom_up gira antihorario" }],
  27: [{ file: STITCH_LAYOUT, title: "caso 27: en cada anillo los arcos suman 2π" }],
};

/** Casos que el documento marca "validar con tejedora" (T1b). Se comprueba contra el documento. */
const VALIDATE_WITH_KNITTER = [11, 26];

const MARKER = "// validar con tejedora";

/** Filas `| N | … |` de las tablas de casos (antes de la tabla de muestra supuesta). */
function docCases(): Map<number, string> {
  const text = read("docs/casos-dominio-colorwork.md");
  const end = text.indexOf("## Muestra supuesta");
  assert.ok(end > 0, "falta la sección de muestra supuesta");
  const cases = new Map<number, string>();
  for (const line of text.slice(0, end).split("\n")) {
    const m = /^\|\s*(\d+)\s*\|(.*)\|\s*$/.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    assert.ok(!cases.has(n), `caso ${n} repetido en el documento`);
    cases.set(n, m[2]!);
  }
  return cases;
}

/**
 * Bloque de una prueba: desde su título hasta el próximo `it`/`test` (si es una prueba) o el
 * próximo `describe` de primer nivel (si es un grupo). Devuelve también cómo se declaró.
 */
function block(source: string, title: string): { call: string; body: string } | undefined {
  const re = new RegExp(`^(\\s*)(describe|it|test)((?:\\.\\w+)?)\\(\\s*"${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
  const m = re.exec(source);
  if (!m) return undefined;
  const start = m.index + m[0].length;
  const rest = source.slice(start);
  const next = m[2] === "describe" ? /\n(describe|test)(\.\w+)?\(/.exec(rest) : /\n\s*(describe|it|test)(\.\w+)?\(/.exec(rest);
  return { call: `${m[2]}${m[3]}`, body: rest.slice(0, next ? next.index : rest.length) };
}

describe("CA-F11: casos de dominio del colorwork", () => {
  it("el documento tiene exactamente los casos 1 a 27", () => {
    assert.deepEqual([...docCases().keys()].sort((a, b) => a - b), Array.from({ length: 27 }, (_v, i) => i + 1));
  });

  it("los casos marcados 'validar con tejedora' en el documento son los de esta lista", () => {
    const marked = [...docCases()].filter(([, row]) => /validar con tejedora/i.test(row)).map(([n]) => n);
    assert.deepEqual(marked.sort((a, b) => a - b), VALIDATE_WITH_KNITTER);
  });

  it("la tabla de trazabilidad cubre los 27 casos", () => {
    assert.deepEqual(Object.keys(TRACE).map(Number).sort((a, b) => a - b), Array.from({ length: 27 }, (_v, i) => i + 1));
  });

  for (let n = 1; n <= 27; n++) {
    it(`Caso ${n}: tiene prueba automática activa${VALIDATE_WITH_KNITTER.includes(n) ? " y queda señalado 'validar con tejedora'" : ""}`, () => {
      const refs = TRACE[n] ?? [];
      assert.ok(refs.length > 0, `caso ${n} sin prueba`);
      let marked = false;
      for (const ref of refs) {
        const b = block(read(ref.file), ref.title);
        assert.ok(b, `caso ${n}: no se encontró "${ref.title}" en ${ref.file}`);
        assert.ok(!/\.(skip|todo)$/.test(b.call), `caso ${n}: "${ref.title}" está como ${b.call} en ${ref.file}`);
        const names = new RegExp(`\\bcaso ${n}\\b`, "i").test(ref.title) || (n === 7 && ref.title.includes("CA-F3"));
        assert.ok(names, `caso ${n}: el título "${ref.title}" no menciona el caso`);
        if (b.body.includes(MARKER)) marked = true;
      }
      if (VALIDATE_WITH_KNITTER.includes(n)) assert.ok(marked, `caso ${n}: falta el comentario "${MARKER}" en su prueba`);
    });
  }
});

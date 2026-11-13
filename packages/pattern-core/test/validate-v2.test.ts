/**
 * Validador v2 (ADR 0011, secciones 3 y 4): `PART_COPIES`, `LAYOUT_*`, topes duros nuevos
 * de `LIMITS` y errores de tejido de los patrones escritos. Criterios CA4-M3 y CA4-M4.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAFT_ERROR_CODES,
  LIMITS,
  concreteRounds,
  formatPart,
  isDraftError,
  recommendedLimitNotices,
  recommendedLimitUsage,
  summarizePart,
  validatePattern,
  type Issue,
  type Part,
  type Placement,
  type WrittenPattern,
} from "../src/index.ts";
import { fixtureAPart, writtenOf } from "./support/amigurumi.ts";
import { ballPart, ballPattern } from "./support/fixtures.ts";
import { forAll } from "./support/property.ts";
import { genWrittenV2 } from "./support/written-gen.ts";

type Json = Record<string, any>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const issuesOf = (d: unknown, code: string): Issue[] => validatePattern(d).issues.filter((i) => i.code === code);
const errorCodes = (d: unknown) => validatePattern(d).issues.filter((i) => i.severity === "error").map((i) => i.code);

/** Oreja que se teje 2 veces. */
function ear(): Part {
  return {
    id: "oreja",
    name: "Oreja",
    construction: "spiral",
    start: { type: "magic_ring" },
    startYarn: "A",
    copies: 2,
    rounds: [
      { number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 },
      { number: 2, through: 3, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 },
    ],
  };
}

/** Cabeza (la bolita: 11 vueltas, 24 puntos de la V4 a la V8), dos orejas cosidas y un cuerpo libre. */
function doll(): WrittenPattern {
  const head = { ...ballPart(), id: "cabeza", name: "Cabeza" };
  const body = { ...ballPart(), id: "cuerpo", name: "Cuerpo" };
  return {
    ...ballPattern(),
    parts: [body, head, ear()],
    layout: {
      placements: [
        { target: { part: "cuerpo", copy: 0 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } },
        { target: { part: "cabeza", copy: 0 }, at: { type: "surface", host: { part: "cuerpo", copy: 0 }, round: 11, stitch: 0, attach: "start", rotationDeg: [0, 0, 0] } },
        { target: { part: "oreja", copy: 0 }, at: { type: "surface", host: { part: "cabeza", copy: 0 }, round: 6, stitch: 3, attach: "end", rotationDeg: [0, 0, 20], offsetCm: -0.1 } },
        { target: { part: "oreja", copy: 1 }, at: { type: "surface", host: { part: "cabeza", copy: 0 }, round: 6, stitch: 15, attach: "end", rotationDeg: [0, 0, -20] } },
      ],
    },
  };
}

const placements = (d: Json): any[] => d.layout.placements;

describe("v2: el documento de referencia", () => {
  it("una muñeca con copias y posiciones libres y ancladas es valid, sin avisos", () => {
    const r = validatePattern(doll());
    assert.deepEqual(r.issues, []);
    assert.equal(r.valid, true);
  });

  it("copies: 1 explícito y layout vacío son válidos", () => {
    const d = clone(doll()) as Json;
    d.parts[0].copies = 1;
    d.layout = { placements: [] };
    assert.equal(validatePattern(d).valid, true);
  });
});

describe("PART_COPIES", () => {
  it("es error estructural fuera de 1 a LIMITS.maxCopies o si no es entero", () => {
    assert.equal(LIMITS.maxCopies, 50);
    for (const copies of [0, -1, 1.5, LIMITS.maxCopies + 1, "2", null, Number.NaN, 1e308]) {
      const d = clone(doll()) as Json;
      d.parts[2].copies = copies;
      if (Number.isNaN(copies)) d.parts[2].copies = Number.NaN; // clone lo convertiría en null
      const r = validatePattern(d);
      const [e] = r.issues.filter((i) => i.code === "PART_COPIES");
      assert.equal(e?.severity, "error", String(copies));
      assert.equal(e?.path, "parts[2].copies");
      assert.equal(r.savable, false);
      assert.match(e!.message, /^Oreja: la cantidad de veces que se teje debe ser un entero entre 1 y 50\.$/);
    }
    const ok = clone(doll()) as Json;
    ok.parts[2].copies = LIMITS.maxCopies;
    assert.deepEqual(errorCodes(ok), []);
  });
});

describe("LAYOUT_*: cada código con su prueba (CA4-M3)", () => {
  it("LAYOUT_TARGET_UNKNOWN y LAYOUT_HOST_UNKNOWN: la parte no existe", () => {
    const d = clone(doll()) as Json;
    placements(d)[1].target.part = "nariz";
    placements(d)[2].at.host.part = "sombrero";
    const t = issuesOf(d, "LAYOUT_TARGET_UNKNOWN");
    assert.deepEqual(t.map((i) => [i.severity, i.path]), [["error", "layout.placements[1].target"]]);
    assert.match(t[0]!.message, /parte que no existe \("nariz"\)/);
    const h = issuesOf(d, "LAYOUT_HOST_UNKNOWN");
    assert.deepEqual(h.map((i) => [i.severity, i.path]), [["error", "layout.placements[2].at.host"]]);
    assert.match(h[0]!.message, /^Oreja \(1 de 2\) se cose a una parte que no existe \("sombrero"\)\.$/);
    assert.equal(validatePattern(d).savable, false);
  });

  it("LAYOUT_COPY_RANGE: copy fuera de 0 a copies − 1, en la pieza y en el anfitrión", () => {
    for (const copy of [2, -1, 99]) {
      const d = clone(doll()) as Json;
      placements(d)[3].target.copy = copy;
      const [e] = issuesOf(d, "LAYOUT_COPY_RANGE");
      assert.equal(e?.severity, "error");
      assert.equal(e?.path, "layout.placements[3].target.copy");
      assert.match(e!.message, /Oreja se teje 2 veces\.$/);
    }
    const host = clone(doll()) as Json;
    placements(host)[2].at.host.copy = 1; // la cabeza se teje 1 vez
    assert.deepEqual(issuesOf(host, "LAYOUT_COPY_RANGE").map((i) => i.path), ["layout.placements[2].at.host.copy"]);
    assert.match(issuesOf(host, "LAYOUT_COPY_RANGE")[0]!.message, /Cabeza se teje 1 vez\.$/);
  });

  it("LAYOUT_DUPLICATE: dos entradas para la misma copia", () => {
    const d = clone(doll()) as Json;
    placements(d).push(clone(placements(d)[2]));
    const [e, ...rest] = issuesOf(d, "LAYOUT_DUPLICATE");
    assert.deepEqual(rest, []);
    assert.equal(e?.severity, "error");
    assert.equal(e?.path, "layout.placements[4].target");
    assert.match(e!.message, /^Oreja \(1 de 2\) tiene dos ubicaciones \(la 3 y la 5\); deja solo una\.$/);
  });

  it("LAYOUT_CYCLE: una pieza cosida a sí misma y un ciclo de anclas", () => {
    const self = clone(doll()) as Json;
    placements(self)[2].at.host = { part: "oreja", copy: 0 };
    const [s] = issuesOf(self, "LAYOUT_CYCLE");
    assert.equal(s?.severity, "error");
    assert.match(s!.message, /^Oreja \(1 de 2\) está cosida a sí misma/);

    const loop = clone(doll()) as Json;
    placements(loop)[0] = { target: { part: "cuerpo", copy: 0 }, at: { type: "surface", host: { part: "oreja", copy: 1 }, round: 2, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } };
    placements(loop)[3].at.host = { part: "cabeza", copy: 0 };
    // cuerpo → oreja 2 → cabeza → cuerpo
    const cycle = issuesOf(loop, "LAYOUT_CYCLE");
    assert.equal(cycle.length, 1);
    assert.deepEqual(cycle[0]?.data, { length: 3 });
    assert.match(cycle[0]!.message, /están cosidas entre sí en círculo/);
    // La oreja 1 cuelga del ciclo, pero el ciclo se informa una sola vez.
    assert.equal(validatePattern(loop).savable, false);
  });

  it("LAYOUT_DEPTH: una cadena de más de LIMITS.maxLayoutDepth anclas", () => {
    assert.equal(LIMITS.maxLayoutDepth, 16);
    const chain = (n: number): WrittenPattern => {
      const part: Part = { ...ear(), id: "eslabon", name: "Eslabón", copies: n + 1 };
      const list: Placement[] = [{ target: { part: "eslabon", copy: 0 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } }];
      for (let i = 1; i <= n; i++) list.push({ target: { part: "eslabon", copy: i }, at: { type: "surface", host: { part: "eslabon", copy: i - 1 }, round: 3, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } });
      return { ...ballPattern(), parts: [part], layout: { placements: list } };
    };
    assert.deepEqual(errorCodes(chain(16)), [], "16 anclas seguidas valen");
    const over = issuesOf(chain(17), "LAYOUT_DEPTH");
    assert.deepEqual(over.map((i) => [i.severity, i.path]), [["error", "layout.placements[17].at.host"]]);
    assert.match(over[0]!.message, /cadena de más de 16 piezas/);
    // Una cadena de 40 informa solo el punto donde se pasa el tope.
    assert.equal(issuesOf(chain(40), "LAYOUT_DEPTH").length, 1);
  });

  it("LAYOUT_ANCHOR_RANGE: la vuelta o el punto ya no existen en el anfitrión (advertencia, savable)", () => {
    const round = clone(doll()) as Json;
    placements(round)[2].at.round = 12; // la cabeza tiene 11 vueltas
    const [r] = issuesOf(round, "LAYOUT_ANCHOR_RANGE");
    assert.equal(r?.severity, "warning");
    assert.equal(r?.path, "layout.placements[2].at.round");
    assert.match(r!.message, /^Oreja \(1 de 2\) está cosida a la vuelta 12 de Cabeza, que ya no existe/);
    assert.equal(validatePattern(round).valid, true);

    const stitch = clone(doll()) as Json;
    placements(stitch)[3].at.stitch = 24; // la V6 de la cabeza tiene 24 puntos (0 a 23)
    const [s] = issuesOf(stitch, "LAYOUT_ANCHOR_RANGE");
    assert.equal(s?.path, "layout.placements[3].at.stitch");
    assert.match(s!.message, /al punto 25 de la vuelta 6 de Cabeza, que tiene 24 puntos/);
    assert.deepEqual(s?.data, { round: 6, stitch: 24, stitches: 24 });
    placements(stitch)[3].at.stitch = 23;
    assert.deepEqual(issuesOf(stitch, "LAYOUT_ANCHOR_RANGE"), []);
  });

  it("LIMIT: números no finitos o fuera de cota en posiciones, giros, separación, vuelta y punto", () => {
    const cases: Array<[string, (d: Json) => void, string]> = [
      ["posición sobre maxPositionCm", (d) => (placements(d)[0].at.positionCm = [LIMITS.maxPositionCm + 1, 0, 0]), "layout.placements[0].at.positionCm"],
      ["posición 1e308", (d) => (placements(d)[0].at.positionCm = [0, 1e308, 0]), "layout.placements[0].at.positionCm"],
      ["posición NaN", (d) => (placements(d)[0].at.positionCm = [0, 0, Number.NaN]), "layout.placements[0].at.positionCm"],
      ["giro de 181 grados", (d) => (placements(d)[0].at.rotationDeg = [181, 0, 0]), "layout.placements[0].at.rotationDeg"],
      ["giro Infinity", (d) => (placements(d)[2].at.rotationDeg = [0, Number.POSITIVE_INFINITY, 0]), "layout.placements[2].at.rotationDeg"],
      ["separación sobre maxOffsetCm", (d) => (placements(d)[2].at.offsetCm = -(LIMITS.maxOffsetCm + 0.5)), "layout.placements[2].at.offsetCm"],
      ["vuelta 0", (d) => (placements(d)[2].at.round = 0), "layout.placements[2].at.round"],
      ["vuelta no entera", (d) => (placements(d)[2].at.round = 2.5), "layout.placements[2].at.round"],
      ["punto negativo", (d) => (placements(d)[2].at.stitch = -1), "layout.placements[2].at.stitch"],
      ["punto 1e308", (d) => (placements(d)[2].at.stitch = 1e308), "layout.placements[2].at.stitch"],
      ["copia no entera", (d) => (placements(d)[2].target.copy = 0.5), "layout.placements[2].target.copy"],
    ];
    for (const [name, mutate, path] of cases) {
      const d = doll() as unknown as Json; // sin clone: conserva NaN e Infinity
      mutate(d);
      const r = validatePattern(d);
      assert.deepEqual(r.issues.filter((i) => i.severity === "error").map((i) => [i.code, i.path]), [["LIMIT", path]], name);
      assert.equal(r.savable, false, name);
    }
    // Los bordes exactos valen.
    const edge = clone(doll()) as Json;
    placements(edge)[0].at.positionCm = [LIMITS.maxPositionCm, -LIMITS.maxPositionCm, 0];
    placements(edge)[0].at.rotationDeg = [180, -180, 0];
    placements(edge)[2].at.offsetCm = LIMITS.maxOffsetCm;
    assert.deepEqual(errorCodes(edge), []);
  });

  it("SHAPE: forma inválida del layout, sin lanzar", () => {
    const cases: Array<[unknown, string]> = [
      [null, "layout"],
      [[], "layout"],
      [{ placements: "x" }, "layout.placements"],
      [{ placements: [null] }, "layout.placements[0]"],
      [{ placements: [{ target: "oreja", at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } }] }, "layout.placements[0].target"],
      [{ placements: [{ target: { part: "oreja", copy: 0 }, at: { type: "glued" } }] }, "layout.placements[0].at"],
      [{ placements: [{ target: { part: "oreja", copy: 0 }, at: { type: "free", positionCm: [0, 0], rotationDeg: [0, 0, 0] } }] }, "layout.placements[0].at.positionCm"],
      [{ placements: [{ target: { part: "oreja", copy: 0 }, at: { type: "free", positionCm: [0, "1", 0], rotationDeg: [0, 0, 0] } }] }, "layout.placements[0].at.positionCm"],
      [{ placements: [{ target: { part: "oreja", copy: 0 }, at: { type: "surface", host: { part: "cabeza", copy: 0 }, round: 2, stitch: 0, attach: "middle", rotationDeg: [0, 0, 0] } }] }, "layout.placements[0].at.attach"],
      [{ placements: [{ target: { part: "", copy: 0 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } }] }, "layout.placements[0].target.part"],
      [{ placements: [{ target: { part: "oreja", copy: "0" }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } }] }, "layout.placements[0].target.copy"],
    ];
    for (const [layout, path] of cases) {
      const d = clone(doll()) as Json;
      d.layout = layout;
      const r = validatePattern(d);
      assert.ok(r.issues.some((i) => i.code === "SHAPE" && i.path === path), `${JSON.stringify(layout)} → ${JSON.stringify(r.issues.map((i) => [i.code, i.path]))}`);
      assert.equal(r.savable, false);
    }
  });
});

describe("CA4-M3: documentos hostiles se rechazan sin lanzar y en menos de 50 ms", () => {
  /** Con calentamiento y el mejor de 3: mide el costo del validador, no el JIT ni la carga de las otras pruebas en paralelo. */
  const timed = (d: unknown) => {
    let r = validatePattern(d);
    let ms = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      r = validatePattern(d);
      ms = Math.min(ms, performance.now() - t0);
    }
    return { r, ms };
  };

  it("cadena de 10.000 anclas: LIMIT por la cantidad de ubicaciones", () => {
    const list = Array.from({ length: 10_000 }, (_, i) => ({ target: { part: "oreja", copy: i }, at: { type: "surface", host: { part: "oreja", copy: i + 1 }, round: 1, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } }));
    const d = { ...clone(doll()), layout: { placements: list } };
    const { r, ms } = timed(d);
    assert.deepEqual(r.issues.filter((i) => i.severity === "error").map((i) => [i.code, i.path]), [["LIMIT", "layout.placements"]]);
    assert.ok(ms < 50, `${ms} ms`);
  });

  it("cadena y ciclo dentro del tope de ubicaciones (2.500): un aviso por causa y tiempo lineal", () => {
    const n = LIMITS.maxPlacements;
    const part: Part = { ...ear(), id: "e", name: "Eslabón", copies: LIMITS.maxCopies };
    const parts = Array.from({ length: LIMITS.maxParts }, (_, i) => ({ ...part, id: `e${i}`, name: `Eslabón ${i + 1}` }));
    const ref = (k: number) => ({ part: `e${Math.floor(k / LIMITS.maxCopies)}`, copy: k % LIMITS.maxCopies });
    // Una sola cadena que recorre las 2.500 copias y se cierra en ciclo.
    const list = Array.from({ length: n }, (_, k) => ({ target: ref(k), at: { type: "surface", host: ref((k + 1) % n), round: 1, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } }));
    const cyc = timed({ ...ballPattern(), parts, layout: { placements: list } });
    assert.deepEqual(cyc.r.issues.filter((i) => i.severity === "error").map((i) => i.code), ["LAYOUT_CYCLE"]);
    assert.ok(cyc.ms < 50, `${cyc.ms} ms`);
    // La misma cadena abierta (la última copia, libre): solo LAYOUT_DEPTH en el punto 17.
    list[n - 1] = { target: ref(n - 1), at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } } as never;
    const deep = timed({ ...ballPattern(), parts, layout: { placements: list } });
    assert.deepEqual(deep.r.issues.filter((i) => i.severity === "error").map((i) => i.code), ["LAYOUT_DEPTH"]);
    assert.ok(deep.ms < 50, `${deep.ms} ms`);
  });

  it("NaN, 1e308 y referencias rotas en 2.500 ubicaciones: los avisos se acotan", () => {
    const list = Array.from({ length: LIMITS.maxPlacements }, (_, i) => ({ target: { part: `x${i}`, copy: 1e308 }, at: { type: "free", positionCm: [Number.NaN, 1e308, -1e308], rotationDeg: [0, 0, 0] } }));
    const { r, ms } = timed({ ...clone(doll()), layout: { placements: list } });
    assert.equal(r.savable, false);
    assert.ok(r.issues.length <= 100, `${r.issues.length} avisos`);
    assert.ok(ms < 50, `${ms} ms`);
  });

  it("50 partes con LIMITS.maxCopies + 1 copias: PART_COPIES en cada una", () => {
    const parts = Array.from({ length: 50 }, (_, i) => ({ ...ear(), id: `p${i}`, name: `Parte ${i + 1}`, copies: LIMITS.maxCopies + 1 }));
    const { r, ms } = timed({ ...ballPattern(), parts });
    assert.equal(r.issues.filter((i) => i.code === "PART_COPIES").length, 50);
    assert.equal(r.savable, false);
    assert.ok(ms < 50, `${ms} ms`);
  });

  it("un documento que supera los cinco límites recomendados, pero no los topes duros, es valid", () => {
    // 21 partes que se tejen 11 veces, cada una de 101 hileras de 201 puntos.
    const panel = (i: number): Part => ({
      id: `panel${i}`,
      name: `Panel ${i + 1}`,
      construction: "flat",
      start: { type: "chain", count: 202 },
      startYarn: "A",
      copies: 11,
      rounds: [
        { number: 1, items: [{ type: "stitch", stitch: "sc", count: 201 }], expected: 201 },
        { number: 2, through: 101, items: [{ type: "stitch", stitch: "sc", count: 201 }], expected: 201 },
      ],
    });
    const d: WrittenPattern = { ...ballPattern(), parts: Array.from({ length: 21 }, (_, i) => panel(i)) };
    const r = validatePattern(d);
    assert.deepEqual(r.issues, []);
    assert.equal(r.valid, true);
    assert.deepEqual(recommendedLimitNotices(d).map((u) => u.limit), ["parts", "copiesPerPart", "roundsPerPart", "stitchesPerRound", "sceneStitches"]);
  });
});

describe("CA4-M4: borradores escritos (DRAFT_ERROR_CODES, ADR 0011, sección 4)", () => {
  it("los cinco errores de conteo y numeración son de tejido", () => {
    for (const code of ["ROUND_CONSUMPTION_MISMATCH", "ROUND_COUNT_MISMATCH", "ROUND_ZERO", "ROUND_RANGE_CHANGES", "ROUND_NUMBERING"]) {
      assert.ok(DRAFT_ERROR_CODES.includes(code), code);
      assert.equal(isDraftError({ code, severity: "error", path: "", message: "" }), true);
    }
  });

  it("un patrón con ROUND_CONSUMPTION_MISMATCH se guarda como borrador; uno con STITCH_UNKNOWN o un error de layout no", () => {
    const draft = clone(ballPattern());
    draft.parts[0]!.rounds[2]!.items = [{ type: "group", times: 5, items: [{ type: "stitch", stitch: "sc", count: 1 }, { type: "stitch", stitch: "inc", count: 1 }] }];
    const r = validatePattern(draft);
    assert.ok(r.issues.some((i) => i.code === "ROUND_CONSUMPTION_MISMATCH" && i.severity === "error"));
    assert.deepEqual({ valid: r.valid, savable: r.savable }, { valid: false, savable: true });

    const unknown = clone(draft) as Json;
    unknown.parts[0].rounds[0].items[0].stitch = "xyz";
    assert.equal(validatePattern(unknown).savable, false);

    const layout = clone(doll()) as Json;
    layout.parts[0].rounds[2].expected = 99; // borrador
    placements(layout)[1].target.part = "nadie"; // estructural
    const lr = validatePattern(layout);
    assert.equal(lr.savable, false);
    assert.ok(lr.issues.filter((i) => i.severity === "error" && !isDraftError(i)).every((i) => i.code === "LAYOUT_TARGET_UNKNOWN"));
  });

  it("siguen siendo estructurales STITCH_UNKNOWN, COLOR_UNKNOWN_YARN, ITEM_COUNT, GROUP_*, SHAPE y LIMIT (F4-33)", () => {
    const mutations: Array<[string, (d: Json) => void]> = [
      ["STITCH_UNKNOWN", (d) => (d.parts[0].rounds[0].items[0].stitch = "zz")],
      ["COLOR_UNKNOWN_YARN", (d) => d.parts[0].rounds[0].items.unshift({ type: "color", yarn: "Z" })],
      ["ITEM_COUNT", (d) => (d.parts[0].rounds[0].items[0].count = 0)],
      ["GROUP_TIMES", (d) => (d.parts[0].rounds[2].items[0].times = 0)],
      ["GROUP_EMPTY", (d) => (d.parts[0].rounds[2].items[0].items = [])],
      ["SHAPE", (d) => (d.parts[0].rounds[0].items[0] = 3)],
      ["LIMIT", (d) => (d.parts[0].rounds[0].items[0].count = LIMITS.maxItemCount + 1)],
    ];
    for (const [code, mutate] of mutations) {
      const d = clone(ballPattern()) as Json;
      mutate(d);
      const r = validatePattern(d);
      assert.ok(r.issues.some((i) => i.severity === "error" && (i.code === code || (code === "LIMIT" && i.code === "ITEM_COUNT"))), code);
      assert.equal(r.savable, false, code);
    }
  });

  it("un número de vuelta < 1 es ROUND_NUMBERING (borrador) y la vuelta igual se revisa: un punto desconocido no se salta", () => {
    const d = clone(ballPattern()) as Json;
    d.parts[0].rounds[0].number = 0;
    const r = validatePattern(d);
    assert.ok(r.issues.some((i) => i.code === "ROUND_NUMBERING"));
    assert.equal(r.savable, true);
    d.parts[0].rounds[0].items[0].stitch = "xyz";
    assert.equal(validatePattern(d).savable, false);
    // Muy lejos del rango es además LIMIT (estructural): el conteo no terminaría.
    const far = clone(ballPattern()) as Json;
    far.parts[0].rounds[0].number = -1e308;
    const fr = validatePattern(far);
    assert.ok(fr.issues.some((i) => i.code === "LIMIT" && i.path === "parts[0].rounds[0].number"));
    assert.equal(fr.savable, false);
  });

  it("el tope de puntos por vuelta es estructural, también para lo que la vuelta trabaja (saltar desmedido)", () => {
    const d = clone(ballPattern()) as Json;
    // Última vuelta: ROUND_ZERO no aplica, pero 5000 × 500 × 500 puntos saltados colgarían expandRound.
    d.parts[0].rounds[7].items = [{ type: "group", times: 500, items: [{ type: "group", times: 500, items: [{ type: "stitch", stitch: "sk", count: 5000 }] }] }];
    delete d.parts[0].rounds[7].expected;
    const r = validatePattern(d);
    assert.ok(r.issues.some((i) => i.code === "LIMIT" && i.path === "parts[0].rounds[7]"));
    assert.equal(r.savable, false);
  });

  it("propiedad: los derivados funcionan con cualquier documento v2 savable y nunca lanzan", () => {
    let drafts = 0;
    forAll("derivados con savable", genWrittenV2, (d) => {
      const r = validatePattern(d);
      if (!r.savable) return;
      if (!r.valid) drafts++;
      for (const p of d.parts) {
        concreteRounds(p);
        summarizePart(p);
        formatPart(p);
      }
      recommendedLimitUsage(d);
    }, 300);
    assert.ok(drafts > 20, `${drafts} borradores probados`);
  });

  it("propiedad: los documentos v2 generados (copias y ubicaciones sin ciclos) son savable", () => {
    forAll("v2 savable", genWrittenV2, (d) => {
      const r = validatePattern(d);
      const structural = r.issues.filter((i) => i.severity === "error" && !isDraftError(i));
      assert.deepEqual(structural, []);
      // Las anclas fuera del anfitrión solo advierten.
      for (const i of r.issues.filter((x) => x.code.startsWith("LAYOUT_"))) assert.equal(i.code, "LAYOUT_ANCHOR_RANGE");
    }, 300);
  });
});

describe("rendimiento con el fixture A y copias", () => {
  it("50 partes de 39 vueltas (1.800 puntos) con layout completo se validan en menos de 50 ms", () => {
    const parts = Array.from({ length: 50 }, (_, i) => ({ ...fixtureAPart(), id: `c${i}`, name: `Cuerpo ${i + 1}`, copies: 2 }));
    const list: Placement[] = parts.flatMap((p, i) => [0, 1].map((copy) => ({
      target: { part: p.id, copy },
      at: i === 0 && copy === 0 ? { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } : { type: "surface", host: { part: "c0", copy: 0 }, round: 20, stitch: 30, attach: "end", rotationDeg: [0, 0, 0] },
    }) as Placement));
    const d = writtenOf(parts, { layout: { placements: list } });
    validatePattern(d); // calentamiento
    const t0 = performance.now();
    const r = validatePattern(d);
    const ms = performance.now() - t0;
    assert.equal(r.valid, true, JSON.stringify(r.issues.slice(0, 3)));
    assert.ok(ms < 50, `${ms} ms`);
  });
});

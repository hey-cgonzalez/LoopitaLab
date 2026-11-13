/**
 * Texto v2 (T6; ADR 0011, secciones 7 y 8): `normalizePart`, notas `>`, encabezado
 * "Cantidad", `formatPartLines`, `parseWrittenParts`, `PARSE_LIMITS`, aviso de `#`,
 * dialecto UK con modos de lectura por alias, y los casos F4-9, F4-61 y F4-63 a F4-69
 * de `docs/casos-dominio-fase-4.md`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMENT_WARNING,
  DIALECTS,
  LIMITS,
  PARSE_LIMITS,
  READING_MODES,
  STITCHES,
  countRound,
  formatPart,
  formatPartLines,
  formatRound,
  loopAliases,
  lookupStitch,
  normalizePart,
  parsePart,
  parseRound,
  parseWrittenParts,
  readingModeFor,
  stitchAbbrev,
  stitchAliases,
  type Part,
  type ReadingMode,
  type Round,
  type StitchCode,
  validatePattern,
} from "../src/index.ts";
import { ballPart, ballPattern } from "./support/fixtures.ts";

function okPart(text: string, mode: ReadingMode = "es-us", id = "x"): Part {
  const r = parsePart(text, { id, mode });
  if (!r.ok) assert.fail(`No se leyó:\n${text}\n${r.issues.map((i) => `${i.path} ${i.code}: ${i.message}`).join("\n")}`);
  return r.value;
}

function okRound(text: string, mode: ReadingMode = "es-us"): Round {
  const r = parseRound(text, 1, mode);
  if (!r.ok) assert.fail(`No se leyó "${text}": ${r.issues.map((i) => i.message).join("; ")}`);
  return r.value;
}

function errors(text: string, mode: ReadingMode = "es-us") {
  const r = parsePart(text, { id: "x", mode });
  assert.equal(r.ok, false, `debía fallar:\n${text}`);
  return r.ok ? [] : r.issues;
}

const OREJA = `Parte: Oreja
Cantidad: 2
Inicio: AM
Construcción: espiral
Lana: A
V1: 6 pb (6)
V2: aum x6 (12)
> Coloca un marcador al inicio de la vuelta.
V3-5: 12 pb (12)
Cierre: no rellenar; aplanar y coser abierta.
> Deja una hebra larga para coser.`;

describe("normalizePart (ADR 0011, sección 7)", () => {
  it("aplica las seis reglas y no fusiona ni reordena", () => {
    const raw: Part = {
      id: "p",
      name: "  Oreja  ",
      construction: "spiral",
      start: { type: "magic_ring" },
      startYarn: "A",
      copies: 1,
      finish: "  Rellenar.  \r\nCerrar.   \r\n  ",
      rounds: [
        { number: 1, through: 1, items: [{ type: "stitch", stitch: "sc", count: 1, loop: "both" }, { type: "stitch", stitch: "sc", count: 1 }], note: "a  \r\n b \t" },
        { number: 2, items: [{ type: "group", times: 2, items: [{ type: "stitch", stitch: "inc", count: 1, loop: "both" }] }], note: "   " },
      ],
    };
    const n = normalizePart(raw);
    assert.deepEqual(n, {
      id: "p",
      name: "Oreja",
      construction: "spiral",
      start: { type: "magic_ring" },
      startYarn: "A",
      finish: "Rellenar.\nCerrar.",
      rounds: [
        { number: 1, items: [{ type: "stitch", stitch: "sc", count: 1 }, { type: "stitch", stitch: "sc", count: 1 }], note: "a\n b" },
        { number: 2, items: [{ type: "group", times: 2, items: [{ type: "stitch", stitch: "inc", count: 1 }] }] },
      ],
    });
    // Pura: la entrada no cambia.
    assert.equal(raw.name, "  Oreja  ");
    assert.equal(raw.rounds[0]!.items[0]!.type === "stitch" && raw.rounds[0]!.items[0]!.loop, "both");
    // Idempotente.
    assert.deepEqual(normalizePart(n), n);
  });

  it("no lanza con valores que no son objeto", () => {
    assert.equal(normalizePart(null as unknown as Part), null);
    assert.equal(normalizePart(5 as unknown as Part), 5);
  });
});

describe("notas > y cierre de varias líneas (CA4-E4)", () => {
  it("lee el ejemplo del ADR: nota de vuelta, cantidad y cierre de dos líneas", () => {
    const p = okPart(OREJA);
    assert.equal(p.copies, 2);
    assert.equal(p.rounds[1]!.note, "Coloca un marcador al inicio de la vuelta.");
    assert.equal(p.rounds[2]!.through, 5);
    assert.equal(p.finish, "no rellenar; aplanar y coser abierta.\nDeja una hebra larga para coser.");
    // Forma canónica: "aum x6" pasa a "6 aum"; lo demás queda igual.
    assert.equal(formatPart(p), OREJA.replace("V2: aum x6", "V2: 6 aum"));
  });

  it("varias líneas > forman una nota de varias líneas; > vacía es una línea vacía", () => {
    const p = okPart("V1: 6 pb\n> uno\n>\n>   tres con sangría\nV2: 6 pb");
    assert.equal(p.rounds[0]!.note, "uno\n\n  tres con sangría");
    assert.equal(p.rounds[1]!.note, undefined);
    assert.match(formatPart(p), /^V1: 6 pb\n> uno\n>\n>   tres con sangría\nV2: 6 pb$/m);
  });

  it("una nota antes de toda vuelta es error; tras una vuelta que no se leyó no agrega otro error", () => {
    const e = errors("Lana: A\n> suelta\nV1: 6 pb");
    assert.deepEqual(e.map((i) => [i.code, i.path]), [["PARSE_NOTE", "texto:2:1"]]);
    const f = errors("V1: 6 zz\n> nota");
    assert.deepEqual(f.map((i) => i.code), ["PARSE_UNKNOWN_STITCH"]);
  });

  it("un cierre vacío seguido de > y dos encabezados de cierre se juntan, sin perder líneas", () => {
    assert.equal(okPart("V1: 6 pb\nCierre:\n> Rellenar.").finish, "Rellenar.");
    assert.equal(okPart("Cierre: a\nV1: 6 pb\nCierre: b").finish, "a\nb");
    // Tras el cierre, una vuelta nueva recibe sus propias notas.
    const p = okPart("Cierre: a\nV1: 6 pb\n> de la vuelta");
    assert.equal(p.finish, "a");
    assert.equal(p.rounds[0]!.note, "de la vuelta");
  });

  it("formatRound escribe la nota y parseRound la lee", () => {
    const r: Round = { number: 3, items: [{ type: "stitch", stitch: "sc", count: 12 }], expected: 12, note: "Marcador.\nSin apretar." };
    const t = formatRound(r);
    assert.equal(t, "V3: 12 pb (12)\n> Marcador.\n> Sin apretar.");
    assert.deepEqual(okRound(t), r);
    assert.equal(parseRound("V3: 12 pb\nV4: 12 pb").ok, false);
  });
});

describe("comentarios # (CA4-E5)", () => {
  it("se ignoran y dejan el aviso PARSE_COMMENT con su línea, también si la lectura falla", () => {
    const r = parsePart("# mi nota\nV1: 6 pb\n  # otra", { id: "x" });
    assert.ok(r.ok);
    assert.deepEqual(r.warnings?.map((w) => [w.code, w.severity, w.path, w.message]), [
      ["PARSE_COMMENT", "warning", "texto:1:1", COMMENT_WARNING],
      ["PARSE_COMMENT", "warning", "texto:3:3", COMMENT_WARNING],
    ]);
    assert.equal(COMMENT_WARNING, "Los comentarios con # no se guardan; usa > para una nota.");
    const bad = parsePart("# x\nV1: zz", { id: "x" });
    assert.equal(bad.ok, false);
    assert.equal(bad.warnings?.length, 1);
    assert.equal(parsePart("V1: 6 pb", { id: "x" }).warnings, undefined);
  });
});

describe('encabezado "Cantidad" (C-14, F4-61)', () => {
  it('escribe "Cantidad: N" solo si N > 1 y lee "Hacer", "Piezas" y "Tejer", con o sin dos puntos', () => {
    for (const line of ["Cantidad: 2", "cantidad 2", "Hacer 2", "Hacer: 2", "HACER:2", "Piezas 2", "Piezas: 2", "Tejer 2", "Tejer: 2", "Make 2"]) {
      const p = okPart(`${line}\nV1: 6 pb`);
      assert.equal(p.copies, 2, line);
      // RT2: un alias vuelve como "Cantidad".
      assert.match(formatPart(p), /^Cantidad: 2$/m, line);
      assert.match(formatPart(p, "us"), /^Make: 2$/m, line);
    }
    const one = okPart("Hacer 1\nV1: 6 pb");
    assert.equal(Object.hasOwn(one, "copies"), false);
    assert.doesNotMatch(formatPart(one), /Cantidad/);
  });

  it(`fuera de 1 a ${LIMITS.maxCopies} o sin número es PARSE_COPIES`, () => {
    for (const line of ["Cantidad: 0", `Hacer ${LIMITS.maxCopies + 1}`, "Tejer con cuidado", "Piezas:", "Cantidad: 2,5"]) {
      assert.deepEqual(errors(`${line}\nV1: 6 pb`).map((i) => i.code), ["PARSE_COPIES"], line);
    }
  });
});

describe("Inicio: óvalo (F4-9, enmienda C-13)", () => {
  it('"Inicio: óvalo 7" es PARSE_START con "Usa AM o cad N"; no se lee como cadeneta', () => {
    for (const v of ["óvalo 7", "ovalo 7", "Óvalo", "cadeneta en óvalo 7", "oval 7"]) {
      const e = errors(`Inicio: ${v}\nV1: 14 pb`);
      assert.deepEqual(e.map((i) => i.code), ["PARSE_START"], v);
      assert.match(e[0]!.message, /Usa AM o cad N/, v);
    }
  });

  it('"Inicio: cad 7" con la V1 de un óvalo (14 puntos) se lee, y el validador la marca como no cuadra', () => {
    const p = okPart("Inicio: cad 7\nConstrucción: cerrada\nV1: 14 pb (14)");
    assert.deepEqual(p.start, { type: "chain", count: 7 });
    assert.equal(countRound(p.rounds[0]!, "A").consumed, 14);
  });
});

describe("formatPartLines", () => {
  it("roundLine traduce cada vuelta a su línea, con notas y cantidad en el medio", () => {
    const p = okPart(OREJA);
    const { text, roundLine } = formatPartLines(p);
    const lines = text.split("\n");
    assert.deepEqual(roundLine, [6, 7, 9]);
    assert.match(lines[roundLine[0]! - 1]!, /^V1:/);
    assert.match(lines[roundLine[1]! - 1]!, /^V2:/);
    assert.match(lines[roundLine[2]! - 1]!, /^V3-5:/);
    assert.equal(formatPart(p), text);
  });

  it("propiedad simple: en la bolita, cada vuelta está en su línea en los tres dialectos", () => {
    for (const d of DIALECTS) {
      const { text, roundLine } = formatPartLines(ballPart(), d);
      const lines = text.split("\n");
      ballPart().rounds.forEach((r, j) => assert.match(lines[roundLine[j]! - 1]!, new RegExp(`^[VR]${r.number}\\b`)));
    }
  });
});

describe("parseWrittenParts", () => {
  const TWO = `# patrón pegado
Parte: Cabeza
V1: 6 pb en AM (6)
V2: aum x6 (12)

Parte: Oreja
Hacer 2
V1: 6 pb (6)
> Cose abierta.
V2: zz`;

  it("corta en cada Parte:, da ids con partId y marca errores con la línea del texto completo", () => {
    const r = parseWrittenParts(TWO, { partId: (i) => `n${i}` });
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual(r.issues.map((i) => [i.code, i.path]), [["PARSE_UNKNOWN_STITCH", "texto:10:5"]]);
    assert.equal(r.warnings?.[0]?.path, "texto:1:1");
    const fixed = parseWrittenParts(TWO.replace("V2: zz", "V2: 6 pb"), { partId: (i) => `n${i}` });
    assert.ok(fixed.ok);
    assert.deepEqual(fixed.value.map((p) => [p.id, p.name, p.copies ?? 1, p.rounds.length]), [
      ["n0", "Cabeza", 1, 2],
      ["n1", "Oreja", 2, 2],
    ]);
    assert.equal(fixed.value[1]!.rounds[0]!.note, "Cose abierta.");
  });

  it("lo que va antes de la primera Parte: es otra parte si tiene vueltas; sin Parte: es una sola parte", () => {
    const r = parseWrittenParts("V1: 6 pb\nParte: B\nV1: 6 pb", { partId: (i) => `q${i}` });
    assert.ok(r.ok);
    assert.deepEqual(r.value.map((p) => [p.id, p.name]), [["q0", "Parte"], ["q1", "B"]]);
    const one = parseWrittenParts("V1: 6 pb", { partId: () => "solo" });
    assert.ok(one.ok);
    assert.equal(one.value.length, 1);
  });

  it(`más de ${LIMITS.maxParts} partes es PARSE_TOO_MANY_PARTS`, () => {
    const text = Array.from({ length: LIMITS.maxParts + 1 }, (_, i) => `Parte: P${i}\nV1: 6 pb`).join("\n");
    const r = parseWrittenParts(text, { partId: (i) => `p${i}` });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.issues[0]!.code, "PARSE_TOO_MANY_PARTS");
  });

  it("ida y vuelta: varias partes escritas con formatPart y pegadas juntas", () => {
    const parts = [okPart(OREJA, "es-us", "a"), { ...ballPart(), id: "b" }];
    for (const d of DIALECTS) {
      const r = parseWrittenParts(parts.map((p) => formatPart(p, d)).join("\n\n"), { partId: (i) => ["a", "b"][i]!, mode: readingModeFor(d) });
      assert.ok(r.ok, d);
      assert.deepEqual(r.value, parts, d);
    }
  });
});

describe("PARSE_LIMITS (R4-7)", () => {
  it("100 KB por texto y 2.000 caracteres por línea", () => {
    assert.deepEqual({ ...PARSE_LIMITS }, { maxTextLength: 100_000, maxLineLength: 2_000 });
    const long = parsePart("V1: 6 pb\n" + "#".repeat(PARSE_LIMITS.maxTextLength), { id: "x" });
    assert.equal(long.ok, false);
    if (!long.ok) assert.equal(long.issues[0]!.code, "PARSE_TOO_LONG");
    const line = parsePart(`V1: 6 pb\nV2: ${"pb, ".repeat(600)}pb`, { id: "x" });
    assert.equal(line.ok, false);
    if (!line.ok) assert.deepEqual(line.issues.map((i) => [i.code, i.path]), [["PARSE_LINE_TOO_LONG", `texto:2:${PARSE_LIMITS.maxLineLength + 1}`]]);
    assert.equal(parseRound(`V1: ${"pb, ".repeat(600)}pb`).ok, false);
  });

  it(`${LIMITS.maxNesting} niveles de ítems (${LIMITS.maxNesting - 1} grupos anidados) se leen y son valid; uno más es PARSE_NESTING, como LIMIT en el validador`, () => {
    const nest = (n: number) => "[".repeat(n) + "pb" + "] x2".repeat(n);
    const max = parsePart(`V1: ${nest(LIMITS.maxNesting - 1)}`, { id: "bolita" });
    assert.ok(max.ok);
    assert.ok(validatePattern({ ...ballPattern(), parts: [max.value] }).valid);
    const tooDeep = { ...ballPattern(), parts: [{ ...max.value, rounds: [{ number: 1, items: [{ type: "group" as const, times: 2, items: max.value.rounds[0]!.items }] }] }] };
    assert.ok(validatePattern(tooDeep).issues.some((i) => i.code === "LIMIT"));
    const r = parseRound(`V1: ${nest(LIMITS.maxNesting)}`);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.issues[0]!.code, "PARSE_NESTING");
  });

  it("números de más de 15 cifras son PARSE_NUMBER, sin redondear", () => {
    for (const t of ["V1: 1234567890123456 pb", "V1234567890123456: pb", "V1: 6 pb (1234567890123456)", "V1: [pb] x1234567890123456"]) {
      const r = parseRound(t);
      assert.equal(r.ok, false, t);
      if (!r.ok) assert.ok(["PARSE_NUMBER", "PARSE_GROUP_TIMES"].includes(r.issues[0]!.code), `${t}: ${r.issues[0]!.code}`);
    }
  });

  it("una línea hostil de 2.000 caracteres se lee en menos de 5 ms (aceptación de T6)", () => {
    const N = PARSE_LIMITS.maxLineLength;
    const fill = (head: string, ch: string, tail = "x") => head + ch.repeat(N - head.length - tail.length) + tail;
    const hostile = [
      fill("V1:", " "),
      fill("V", " "),
      fill("V1 a", " "),
      fill("a", " ", "b"),
      fill("Parte: x", " ", "y"),
      fill("V1: (1", " "),
      "V1: " + "(1)".repeat(665),
      fill("V1: ", "["),
      fill("V1: ", ","),
      "V1: " + "pb, ".repeat(499),
      "V1: " + "pb x".repeat(499),
      fill("V1: ", "9"),
      "V1: 6 pb" + " en".repeat(600) + " am",
      "V1: " + "sc blo ".repeat(285),
      "V1: " + "[[[[[[pb] x2] x2] x2] x2] x2] x2, ".repeat(60).slice(0, N - 4),
      fill(">", " "),
      fill("Hacer", " "),
      fill("Inicio: cad", " "),
      fill("V1: 6 pb", "\t"),
    ];
    let worst = 0;
    for (const line of hostile) {
      assert.ok(line.length <= N);
      const text = `Parte: X\n${line}\nV2: 6 pb`;
      parsePart(text, { id: "x" });
      const runs: number[] = [];
      for (let k = 0; k < 7; k++) {
        const t0 = performance.now();
        parsePart(text, { id: "x" });
        parseRound(line);
        runs.push(performance.now() - t0);
      }
      const best = Math.min(...runs);
      worst = Math.max(worst, best);
      assert.ok(best < 5, `${JSON.stringify(line.slice(0, 30))}…: ${best.toFixed(2)} ms`);
    }
    if (process.env.QA_TIMING) console.log(`peor línea hostil: ${worst.toFixed(3)} ms`);
  });
});

describe("dialectos y modos de lectura (ADR 0011, sección 8; C-15, C-16; CA4-G2)", () => {
  it("tabla de abreviaturas de la enmienda C-15", () => {
    const table: Record<StitchCode, [string, string, string]> = {
      sc: ["pb", "sc", "dc"],
      hdc: ["mpa", "hdc", "htr"],
      dc: ["pa", "dc", "tr"],
      tr: ["pad", "tr", "dtr"],
      slst: ["pd", "sl st", "ss"],
      ch: ["cad", "ch", "ch"],
      inc: ["aum", "inc", "inc"],
      inc3: ["aum3", "inc3", "inc3"],
      dec: ["dism", "dec", "dec"],
      sk: ["saltar", "sk", "miss"],
    };
    assert.deepEqual(Object.keys(table).sort(), Object.keys(STITCHES).sort());
    for (const [code, [es, us, uk]] of Object.entries(table) as [StitchCode, [string, string, string]][]) {
      assert.deepEqual([stitchAbbrev(code, "es"), stitchAbbrev(code, "us"), stitchAbbrev(code, "uk")], [es, us, uk], code);
    }
  });

  it("readingModeFor: uk se lee en es-uk; es y us, en es-us", () => {
    assert.deepEqual(DIALECTS.map(readingModeFor), ["es-us", "es-us", "es-uk"]);
  });

  it('F4-63: "R3: 12 dc" es punto alto en es-us y punto bajo en es-uk; el conteo es el mismo', () => {
    const us = okRound("R3: 12 dc", "es-us");
    const uk = okRound("R3: 12 dc", "es-uk");
    assert.deepEqual(us.items, [{ type: "stitch", stitch: "dc", count: 12 }]);
    assert.deepEqual(uk.items, [{ type: "stitch", stitch: "sc", count: 12 }]);
    assert.equal(countRound(us, "A").produced, countRound(uk, "A").produced);
    // Por omisión es es-us: nunca se adivina.
    assert.deepEqual(okRound("R3: 12 dc").items, us.items);
    assert.deepEqual(okPart("R1: 12 dc").rounds[0]!.items, us.items);
  });

  it('F4-64: "sc", "hdc" y "sc2tog" en es-uk son error de lectura con la pista del otro dialecto', () => {
    const cases: Array<[string, RegExp]> = [
      ["R1: 6 sc", /sc es US; en UK el punto bajo se llama dc/],
      ["R1: 6 sc blo", /sc es US; en UK el punto bajo se llama dc/],
      ["R1: 6 hdc", /hdc es US; en UK el medio punto alto se llama htr/],
      ["R1: sc2tog x6", /sc2tog es US; en UK la disminución de punto bajo se llama dc2tog/],
    ];
    for (const [text, hint] of cases) {
      const r = parseRound(text, 1, "es-uk");
      assert.equal(r.ok, false, text);
      if (r.ok) continue;
      assert.equal(r.issues[0]!.code, "PARSE_UNKNOWN_STITCH", text);
      assert.match(r.issues[0]!.message, hint, text);
      assert.equal(r.issues[0]!.data?.mode, "es-uk");
      assert.ok(parseRound(text, 1, "es-us").ok, `${text} se lee en es-us`);
    }
  });

  it("F4-65: tr es pad en es-us y pa en es-uk", () => {
    assert.equal((okRound("R1: tr", "es-us").items[0] as { stitch: string }).stitch, "tr");
    assert.equal((okRound("R1: tr", "es-uk").items[0] as { stitch: string }).stitch, "dc");
  });

  it("F4-66: htr = hdc y dtr = tr en es-uk; en es-us son desconocidos, con pista", () => {
    assert.equal(lookupStitch("htr", "es-uk"), "hdc");
    assert.equal(lookupStitch("dtr", "es-uk"), "tr");
    for (const t of ["htr", "dtr"]) {
      const r = parseRound(`R1: 6 ${t}`, 1, "es-us");
      assert.equal(r.ok, false);
      if (r.ok) continue;
      assert.equal(r.issues[0]!.code, "PARSE_UNKNOWN_STITCH");
      assert.match(r.issues[0]!.message, /UK/);
    }
  });

  it("CA4-G2: htr, dtr, ss, miss y dc2tog solo en es-uk; sl st, slst y sc2tog solo en es-us", () => {
    for (const [t, code] of [["htr", "hdc"], ["dtr", "tr"], ["ss", "slst"], ["miss", "sk"], ["dc2tog", "dec"]] as const) {
      assert.equal(lookupStitch(t, "es-uk"), code, t);
      assert.equal(lookupStitch(t, "es-us"), undefined, t);
    }
    for (const [t, code] of [["sl st", "slst"], ["slst", "slst"], ["sc2tog", "dec"], ["sc", "sc"], ["hdc", "hdc"]] as const) {
      assert.equal(lookupStitch(t, "es-us"), code, t);
      assert.equal(lookupStitch(t, "es-uk"), undefined, t);
    }
    // US escribe "sl st", como el CYC (C-16), y se lee.
    const r: Round = { number: 1, items: [{ type: "stitch", stitch: "slst", count: 3 }] };
    assert.equal(formatRound(r, "us"), "R1: 3 sl st");
    assert.deepEqual(okRound(formatRound(r, "us")), r);
    assert.equal(formatRound(r, "uk"), "R1: 3 ss");
  });

  it("F4-67 / RT5: en cada modo, ningún alias corresponde a dos puntos (ni a punto y hebra)", () => {
    for (const mode of READING_MODES) {
      const seen = new Map<string, string>();
      for (const [alias, code] of stitchAliases(mode)) {
        const prev = seen.get(alias);
        assert.ok(prev === undefined || prev === code, `${mode}: "${alias}" es ${prev} y ${code}`);
        seen.set(alias, code);
      }
      for (const [alias, loop] of loopAliases(mode)) {
        assert.equal(seen.has(alias), false, `${mode}: "${alias}" es punto y hebra`);
        seen.set(alias, `loop:${loop}`);
      }
      // La abreviatura que se escribe en cada dialecto del modo se lee como su punto.
      for (const d of DIALECTS.filter((x) => readingModeFor(x) === mode)) {
        for (const code of Object.keys(STITCHES) as StitchCode[]) assert.equal(lookupStitch(stitchAbbrev(code, d), mode), code, `${mode} ${d} ${code}`);
      }
    }
    // Los alias que están en los dos modos significan lo mismo, salvo "dc" y "tr", que cada
    // modo carga de su propia tabla: es la trampa de la tabla del CYC, por la que el modo se elige.
    const us = new Map(stitchAliases("es-us"));
    const differ = stitchAliases("es-uk").filter(([alias, code]) => us.has(alias) && us.get(alias) !== code).map(([a]) => a);
    assert.deepEqual(differ.sort(), ["dc", "tr"]);
  });

  it("F4-68: formatPart en UK escribe dc para el punto bajo y la ida y vuelta no pierde nada", () => {
    const text = formatPart(ballPart(), "uk");
    assert.match(text, /^R1: 6 dc \(6\)$/m);
    assert.match(text, /^R9: \[2 dc, dec\] x6 \(18\)$/m);
    assert.match(text, /^Start: MR$/m);
    assert.deepEqual(okPart(text, "es-uk", "bolita"), ballPart());
    // Leído como US sería otro punto: por eso el modo se elige, nunca se adivina.
    assert.deepEqual(okPart(text, "es-us", "bolita").rounds[0]!.items, [{ type: "stitch", stitch: "dc", count: 6 }]);
  });

  it("F4-69: sin variantes regionales del español sin respaldo (medio punto, pma, punto raso, pr, punto bajísimo)", () => {
    for (const mode of READING_MODES) {
      for (const t of ["medio punto", "pma", "punto raso", "pr", "punto pasado", "punto bajisimo", "punto bajísimo", "p bjs", "pbjs"]) {
        assert.equal(lookupStitch(t, mode), undefined, `${mode}: ${t}`);
      }
    }
  });

  it("el español se lee igual en los dos modos", () => {
    const es = "V1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3: [pb, aum] x6 (18)\nV4: @B, 18 pb ht, 2 pd, cad, 3 pa, pad, mpa, saltar, dism";
    assert.deepEqual(okPart(es, "es-uk"), okPart(es, "es-us"));
  });

  it("lookupStitch sin modo usa es-us y nunca confunde nombres de Object.prototype", () => {
    assert.equal(lookupStitch("dc"), "dc");
    for (const t of ["toString", "__proto__", "constructor"]) for (const m of READING_MODES) assert.equal(lookupStitch(t, m), undefined);
  });
});

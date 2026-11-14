/**
 * Casos de dominio de la fase 4 que tocan a `pattern-core` en T4 (docs/casos-dominio-fase-4.md):
 * inicio de la parte (F4-1 a F4-7), subida y unión (F4-11, F4-12), conteos y borradores
 * (F4-29 a F4-34), fixtures A y B en su parte de conteos (F4-45, F4-47 en lo que toca al
 * validador, F4-48, F4-49) y copias (F4-58). La forma de los fixtures (perfil, alto,
 * diámetro) es de T5. Los valores "validar con tejedora" llevan ese comentario.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  concreteRounds,
  parsePart,
  recommendedLimitNotices,
  recommendedLimitUsage,
  summarizePart,
  validatePattern,
  type Issue,
  type Part,
  type Round,
} from "../src/index.ts";
import { FIXTURE_B_COUNTS, fixtureAPart, fixtureAText, fixtureBPart, writtenOf } from "./support/amigurumi.ts";

const read = (text: string, id = "p"): Part => {
  const r = parsePart(text, { id });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  return r.value;
};
const validate = (...parts: Part[]) => validatePattern(writtenOf(parts));
const only = (issues: Issue[], code: string) => issues.filter((i) => i.code === code);

describe("F4-1 a F4-7: inicio de la parte", () => {
  it("F4-1: anillo mágico en espiral, V1 de 6: no se compara con nada", () => {
    const r = validate(read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)"));
    assert.deepEqual(r.issues, []);
  });

  it("F4-2: la V1 con anillo mágico acepta cualquier cantidad; MAGIC_RING_UNUSUAL solo con menos de 3 o más de 12", () => {
    // validar con tejedora: el umbral 3 a 12 es provisional (C-20).
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13, 15]) {
      const r = validate(read(`Inicio: AM\nV1: ${n} pb en AM (${n})`));
      assert.equal(r.valid, true, String(n));
      const info = only(r.issues, "MAGIC_RING_UNUSUAL");
      if (n < 3 || n > 12) {
        assert.equal(info.length, 1, String(n));
        assert.equal(info[0]?.severity, "info");
        assert.deepEqual(info[0]?.data, { round: 1, stitches: n, min: 3, max: 12 });
      } else assert.deepEqual(info, [], String(n));
    }
    const msg = only(validate(read("Inicio: AM\nV1: 15 pb en AM (15)")).issues, "MAGIC_RING_UNUSUAL")[0]!.message;
    assert.equal(msg, "Parte, vuelta 1: empieza con 15 puntos en el anillo mágico; lo habitual es de 3 a 12 (6 es lo más común).");
    // En vueltas cerradas también; en hileras no (ahí avisa PART_START_FLAT_RING).
    assert.equal(only(validate(read("Inicio: AM\nConstrucción: cerrada\nV1: 2 pb (2)")).issues, "MAGIC_RING_UNUSUAL").length, 1);
    assert.deepEqual(only(validate(read("Inicio: AM\nConstrucción: hileras\nV1: 2 pb (2)")).issues, "MAGIC_RING_UNUSUAL"), []);
  });

  it("F4-3: cad 2 y 6 pb en la 2.ª cadeneta (espiral): la V1 libre es advertencia con la pista del aro", () => {
    const r = validate(read("Inicio: cad 2\nV1: 6 pb (6)\nV2: aum x6 (12)"));
    assert.equal(r.valid, true);
    const [w] = only(r.issues, "ROUND_CONSUMPTION_MISMATCH");
    assert.equal(w?.severity, "warning");
    assert.equal(w?.message, "Parte, vuelta 1: se trabaja sobre 6 puntos, pero la cadeneta inicial deja 2. Sobran 4 puntos en las instrucciones. Si trabajas dentro del aro, la cantidad de la primera vuelta es libre.");
    assert.deepEqual(w?.data, { round: 1, consumed: 6, available: 2, hints: ["ring"] });
  });

  it("F4-4: cadeneta en aro (espiral o cerrada): cad 6 con V1 de 6 cuadra; con V1 de 12 es advertencia; desde la V2 sigue siendo error", () => {
    for (const construction of ["espiral", "cerrada"]) {
      assert.deepEqual(validate(read(`Inicio: cad 6\nConstrucción: ${construction}\nV1: 6 pb (6)`)).issues, []);
      const twelve = validate(read(`Inicio: cad 6\nConstrucción: ${construction}\nV1: 12 pb (12)`));
      assert.equal(twelve.valid, true);
      assert.equal(only(twelve.issues, "ROUND_CONSUMPTION_MISMATCH")[0]?.severity, "warning");
      // validar con tejedora: la lectura "un punto en cada cadeneta del aro".
      const v2 = validate(read(`Inicio: cad 6\nConstrucción: ${construction}\nV1: 6 pb (6)\nV2: 10 pb (10)`));
      const [e] = only(v2.issues, "ROUND_CONSUMPTION_MISMATCH");
      assert.equal(e?.severity, "error");
      assert.deepEqual({ valid: v2.valid, savable: v2.savable }, { valid: false, savable: true });
    }
  });

  it("PART_START_RING_SHORT: una cadeneta en aro de 1 es advertencia (no error, por M1)", () => {
    const r = validate(read("Inicio: cad 1\nV1: 6 pb (6)"));
    assert.equal(r.valid, true);
    const [w] = only(r.issues, "PART_START_RING_SHORT");
    assert.equal(w?.severity, "warning");
    assert.equal(w?.path, "parts[0].start.count");
    assert.deepEqual(w?.data, { count: 1, min: 2 });
    assert.deepEqual(only(validate(read("Inicio: cad 2\nV1: 2 pb (2)")).issues, "PART_START_RING_SHORT"), []);
  });

  it("F4-5: hileras con cadeneta base de 11: H1 de 10 pb cuadra; H1 de 11 pb es advertencia con las pistas", () => {
    assert.deepEqual(validate(read("Inicio: cad 11\nConstrucción: hileras\nH1: 10 pb (10)")).issues, []);
    const r = validate(read("Inicio: cad 11\nConstrucción: hileras\nH1: 11 pb (11)"));
    assert.equal(r.valid, true);
    const [w] = only(r.issues, "ROUND_CONSUMPTION_MISMATCH");
    assert.equal(w?.severity, "warning");
    assert.match(w!.message, /la cadeneta inicial deja 10\. Sobra 1 punto en las instrucciones\. Revisa si la cadeneta para girar cuenta como punto\. ¿Escribiste la cadeneta de subida o el pd de unión como puntos\? No cuentan\.$/);
    assert.deepEqual(w?.data?.hints, ["turning_chain", "join"]);
  });

  it("F4-6: hileras con la primera fila en pa: advertencia que sugiere revisar la cadeneta para girar", () => {
    // cad 13: la convención de pb deja 12; con el primer pa en la 4.ª cadeneta, 10 pa (2 de diferencia).
    const r = validate(read("Inicio: cad 13\nConstrucción: hileras\nH1: 10 pa (10)"));
    assert.equal(r.valid, true);
    const [w] = only(r.issues, "ROUND_CONSUMPTION_MISMATCH");
    assert.equal(w?.severity, "warning");
    assert.match(w!.message, /Revisa si la cadeneta para girar cuenta como punto\./);
    assert.deepEqual(w?.data?.hints, ["turning_chain", "join"]);
    // Con una diferencia mayor que 2 no se sugiere la cadeneta de subida.
    const far = validate(read("Inicio: cad 14\nConstrucción: hileras\nH1: 10 pa (10)"));
    assert.deepEqual(only(far.issues, "ROUND_CONSUMPTION_MISMATCH")[0]?.data?.hints, ["turning_chain"]);
  });

  it("F4-7: hileras que empiezan con anillo mágico: PART_START_FLAT_RING (info); parsePart sigue poniendo AM por omisión", () => {
    const part = read("Construcción: hileras\nH1: 4 pb (4)");
    assert.deepEqual(part.start, { type: "magic_ring" });
    const r = validate(part);
    assert.equal(r.valid, true);
    const [i] = only(r.issues, "PART_START_FLAT_RING");
    assert.equal(i?.severity, "info");
    assert.equal(i?.path, "parts[0].start");
    assert.equal(i?.message, "Parte: las filas suelen empezar con una cadeneta base, no con un anillo mágico. La vista de la pieza no dibuja el anillo.");
  });
});

describe("F4-11 y F4-12: la cadeneta de subida y el pd de unión no son puntos", () => {
  it("F4-11: V2: 12 pb, pd produce 13; con su conteo (12) da ROUND_COUNT_MISMATCH con la pista (vueltas cerradas)", () => {
    const r = validate(read("Inicio: AM\nConstrucción: cerrada\nV1: 6 pb (6)\nV2: aum x6, pd (12)"));
    const [e] = only(r.issues, "ROUND_COUNT_MISMATCH");
    assert.equal(e?.message, "Parte, vuelta 2: el patrón declara 12 puntos, pero las instrucciones dan 13. ¿Escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan.");
    assert.deepEqual(e?.data, { round: 2, expected: 12, actual: 13, hints: ["join"] });
    assert.deepEqual({ valid: r.valid, savable: r.savable }, { valid: false, savable: true });
  });

  it("F4-12: cad 1 al inicio de una vuelta cerrada desajusta la siguiente en 1: ROUND_CONSUMPTION_MISMATCH con la pista", () => {
    const r = validate(read("Inicio: AM\nConstrucción: cerrada\nV1: 6 pb (6)\nV2: cad 1, aum x6\nV3: [pb, aum] x6 (18)"));
    const [e] = only(r.issues, "ROUND_CONSUMPTION_MISMATCH");
    assert.equal(e?.severity, "error");
    assert.match(e!.message, /^Parte, vuelta 3: se trabaja sobre 12 puntos, pero la vuelta 2 dejó 13\. Falta 1 punto en las instrucciones\. ¿Escribiste la cadeneta de subida o el pd de unión como puntos\? No cuentan\.$/);
    assert.equal(r.savable, true);
  });

  it("en espiral no hay subida ni unión: el mismo desajuste no lleva la pista", () => {
    const r = validate(read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6, pd (12)"));
    const [e] = only(r.issues, "ROUND_COUNT_MISMATCH");
    assert.equal(e?.message, "Parte, vuelta 2: el patrón declara 12 puntos, pero las instrucciones dan 13.");
    assert.equal(e?.data?.hints, undefined);
  });

  it("con 3 o más puntos de diferencia tampoco", () => {
    const r = validate(read("Inicio: AM\nConstrucción: cerrada\nV1: 6 pb (6)\nV2: aum x6 (15)"));
    assert.equal(only(r.issues, "ROUND_COUNT_MISMATCH")[0]?.data?.hints, undefined);
  });
});

describe("F4-29 a F4-34: conteos por vuelta y borradores", () => {
  const base = "Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)";

  it("F4-29: conteo declarado que no cuadra es ROUND_COUNT_MISMATCH (borrador); sin conteo, ROUND_NO_EXPECTED", () => {
    assert.deepEqual(validate(read(base)).issues, []);
    const r = validate(read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (13)"));
    assert.deepEqual(r.issues.filter((i) => i.severity === "error").map((i) => i.code), ["ROUND_COUNT_MISMATCH"]);
    assert.deepEqual({ valid: r.valid, savable: r.savable }, { valid: false, savable: true });
    const none = validate(read("Inicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6"));
    assert.deepEqual(none.issues.map((i) => [i.code, i.severity]), [["ROUND_NO_EXPECTED", "info"]]);
  });

  it("F4-30: [pb, aum] x5 sobre 12 consume 10: ROUND_CONSUMPTION_MISMATCH (borrador)", () => {
    const r = validate(read(`${base}\nV3: [pb, aum] x5 (15)`));
    const [e] = only(r.issues, "ROUND_CONSUMPTION_MISMATCH");
    assert.equal(e?.severity, "error");
    assert.deepEqual(e?.data, { round: 3, consumed: 10, available: 12 });
    assert.deepEqual({ valid: r.valid, savable: r.savable }, { valid: false, savable: true });
  });

  it("F4-31: un rango que no mantiene el conteo es ROUND_RANGE_CHANGES (borrador) y sugiere escribir cada vuelta", () => {
    // Las V1 a V10 del fixture A (4 líneas de encabezado y 10 vueltas) y un rango que aumenta.
    const growing = [...fixtureAText().split("\n").slice(0, 14), "V11-30: [pb 4, aum] x12 (72)"].join("\n");
    const r = validate(read(growing));
    const [e] = only(r.issues, "ROUND_RANGE_CHANGES");
    assert.equal(e?.severity, "error");
    assert.match(e!.message, /vueltas 11-30: un rango de vueltas iguales debe mantener el conteo, pero cada vuelta pasa de 60 a 72 puntos\. Si las vueltas aumentan, escribe cada vuelta por separado\.$/);
    assert.equal(r.savable, true);
    const down = validate(read(`${base}\nV3-4: dism x6 (6)`));
    assert.match(only(down.issues, "ROUND_RANGE_CHANGES")[0]!.message, /Si las vueltas disminuyen, escribe cada vuelta por separado\.$/);
  });

  it("F4-32: una vuelta que no deja puntos (que no es la última) es ROUND_ZERO (borrador); la última puede dejar cualquier conteo", () => {
    const r = validate(read(`${base}\nV3: saltar 12\nV4: 6 pb`));
    assert.ok(only(r.issues, "ROUND_ZERO").length === 1);
    assert.equal(r.savable, true);
    const last = validate(read(`${base}\nV3: saltar 12`));
    assert.deepEqual(only(last.issues, "ROUND_ZERO"), []);
  });

  it("F4-33: STITCH_UNKNOWN, COLOR_UNKNOWN_YARN, ITEM_COUNT, GROUP_* y SHAPE no son borrador", () => {
    const part = read(base);
    const bad: Array<(p: Part) => void> = [
      (p) => ((p.rounds[0]!.items[0] as { stitch: string }).stitch = "zz"),
      (p) => p.rounds[0]!.items.unshift({ type: "color", yarn: "Z" }),
      (p) => ((p.rounds[0]!.items[0] as { count: number }).count = 0),
      (p) => (p.rounds[1]!.items = [{ type: "group", times: 0, items: [{ type: "stitch", stitch: "sc", count: 1 }] }]),
      (p) => (p.rounds[1]!.items = [{ type: "group", times: 2, items: [] }]),
      (p) => ((p.rounds as unknown[])[1] = { number: 2 }),
    ];
    for (const mutate of bad) {
      const p = structuredClone(part);
      mutate(p);
      assert.equal(validate(p).savable, false);
    }
  });

  it("F4-34: una vuelta de 201 puntos no es error ni aviso del validador; la lista recommendedLimitNotices", () => {
    const part = read("Inicio: cad 202\nConstrucción: hileras\nH1: 201 pb (201)");
    const d = writtenOf([part]);
    const r = validatePattern(d);
    assert.deepEqual(r.issues, []);
    assert.equal(r.valid, true);
    const notices = recommendedLimitNotices(d);
    assert.deepEqual(notices, [{ limit: "stitchesPerRound", value: 201, recommended: 200, over: [{ partId: "p", round: 1 }] }]);
    const two = writtenOf([read("Inicio: cad 201\nConstrucción: hileras\nH1: 200 pb (200)")]);
    assert.deepEqual(recommendedLimitNotices(two), []);
  });
});

describe("Fixtures A y B: conteos verificados por el motor (F4-45 a F4-51, parte de conteos)", () => {
  it("F4-45: fixture A (cuerpo de 39 vueltas): 39 vueltas concretas, 1.800 puntos, valid sin avisos", () => {
    const part = fixtureAPart();
    assert.equal(part.rounds.length, 20, "V11–30 es un solo rango");
    const concrete = concreteRounds(part);
    assert.equal(concrete.length, 39);
    assert.deepEqual(concrete.filter((c) => c.sourceIndex === 10).map((c) => c.number), Array.from({ length: 20 }, (_, i) => 11 + i));
    const r = validatePattern(writtenOf([part]));
    assert.deepEqual(r.issues, []);
    assert.deepEqual(summarizePart(part), { rounds: 39, totalStitches: 1800, stitchesByYarn: { A: 1800 }, finalCount: 6 });
  });

  it("F4-45: la tabla de conteos y acumulados del fixture A", () => {
    const expected = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, ...Array(20).fill(60), 54, 48, 42, 36, 30, 24, 18, 12, 6];
    const concrete = concreteRounds(fixtureAPart());
    assert.deepEqual(concrete.map((c) => c.count.produced), expected);
    const acc = (k: number) => concrete.slice(0, k).reduce((s, c) => s + c.count.produced, 0);
    assert.deepEqual([acc(1), acc(2), acc(10), acc(30), acc(31), acc(38), acc(39)], [6, 18, 330, 1530, 1584, 1794, 1800]);
  });

  it("F4-47 (validador): ningún aviso de conteo en el fixture A", () => {
    // ROUND_GROWS_FAST y ROUND_SHRINKS_FAST son de T5 (perfil); aquí no hay ningún aviso.
    assert.deepEqual(validatePattern(writtenOf([fixtureAPart()])).issues, []);
  });

  it("F4-48: cada vuelta consume lo que dejó la anterior y produce su conteo declarado; con la meseta V11–32, 41 vueltas y 1.920", () => {
    for (const part of [fixtureAPart(), fixtureBPart()]) {
      const concrete = concreteRounds(part);
      concrete.forEach((c, i) => {
        if (i > 0) assert.equal(c.count.consumed, concrete[i - 1]!.count.produced, `${part.id} V${c.number}`);
        assert.equal(c.count.produced, c.round.expected, `${part.id} V${c.number}`);
      });
    }
    const longer = fixtureAPart(32);
    assert.equal(validatePattern(writtenOf([longer])).valid, true);
    assert.deepEqual([summarizePart(longer).rounds, summarizePart(longer).totalStitches], [41, 1920]);
  });

  it("F4-49: fixture B (esfera de perfil): valid, 36 vueltas, 1.384 puntos, ninguna vuelta crece más de 5", () => {
    // Los conteos de los casos de dominio salen de la fórmula.
    const formula = Array.from({ length: 36 }, (_, k) => Math.max(6, Math.round(60 * Math.sin((Math.PI * (k + 0.5)) / 36))));
    assert.deepEqual([...FIXTURE_B_COUNTS], formula);
    const part = fixtureBPart();
    const r = validatePattern(writtenOf([part]));
    assert.deepEqual(r.issues, []);
    assert.deepEqual(summarizePart(part), { rounds: 36, totalStitches: 1384, stitchesByYarn: { A: 1384 }, finalCount: 6 });
    const counts = concreteRounds(part).map((c) => c.count.produced);
    assert.deepEqual(counts, [...FIXTURE_B_COUNTS]);
    for (let i = 1; i < counts.length; i++) assert.ok(counts[i]! - counts[i - 1]! <= 5, `V${i + 1}`);
    // Simétrico: n(Vi) = n(V(37 − i)).
    for (let i = 0; i < 36; i++) assert.equal(counts[i], counts[35 - i]);
  });

  it("F4-51 (conteos): A y B tienen la misma circunferencia máxima (60) y distinta cantidad de vueltas", () => {
    const max = (p: Part) => Math.max(...concreteRounds(p).map((c) => c.count.produced));
    assert.equal(max(fixtureAPart()), 60);
    assert.equal(max(fixtureBPart()), 60);
    assert.equal(concreteRounds(fixtureAPart()).length - concreteRounds(fixtureBPart()).length, 3);
  });
});

describe("F4-58 y F4-76: copias en los límites recomendados", () => {
  it("F4-58: copies: 2 en la oreja multiplica sus puntos en la escena; las copias no cuentan como partes", () => {
    const ear: Part = { ...read("Parte: Oreja\nInicio: AM\nV1: 6 pb en AM (6)\nV2: aum x6 (12)\nV3-5: 12 pb (12)", "oreja"), copies: 2 };
    const d = writtenOf([fixtureAPart(), ear]);
    assert.equal(validatePattern(d).valid, true);
    const usage = Object.fromEntries(recommendedLimitUsage(d).map((u) => [u.limit, u.value]));
    assert.deepEqual(usage, { parts: 2, copiesPerPart: 2, roundsPerPart: 39, stitchesPerRound: 60, sceneStitches: 1800 + 2 * (6 + 12 + 36) });
  });

  it("F4-70: escenario del ADR 0010 (cuerpo de 1.800, 9 partes, 6 con 2 copias) queda dentro de todos los límites", () => {
    // validar con tejedora: estimación de orden de magnitud.
    const small = (id: string, rounds: number, copies: number): Part => {
      const rs: Round[] = [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }], expected: 6 }, { number: 2, items: [{ type: "stitch", stitch: "inc", count: 6 }], expected: 12 }];
      rs.push({ number: 3, through: rounds, items: [{ type: "stitch", stitch: "sc", count: 12 }], expected: 12 });
      return { id, name: id, construction: "spiral", start: { type: "magic_ring" }, startYarn: "A", rounds: rs, ...(copies > 1 ? { copies } : {}) };
    };
    const parts = [fixtureAPart(), ...Array.from({ length: 8 }, (_, i) => small(`p${i}`, 10 + 2 * i, i < 6 ? 2 : 1))];
    const d = writtenOf(parts);
    assert.equal(validatePattern(d).valid, true);
    assert.deepEqual(recommendedLimitNotices(d), []);
  });
});

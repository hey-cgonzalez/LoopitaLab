/**
 * QA de la fase 4 (T19, `qa-tester`): huecos que encontró la revisión de T4, T5 y T6 en las
 * propiedades G y en los casos F4 de docs/casos-dominio-fase-4.md.
 *
 * - G3 por tramos: el generador general (`genWrittenV2`) no garantiza que se recorran los tres
 *   tramos del paso radial ni el acotado hacia adentro. Aquí un generador de piezas de revolución
 *   con cambios de conteo y muestras al azar fuerza los cuatro casos y exige que cada uno aparezca.
 * - Casos F4 que no tenían una prueba con su número (F4-8, F4-13 a F4-27, F4-35, F4-39, F4-42,
 *   F4-52, F4-53, F4-55 a F4-57, F4-59, F4-60, F4-71 a F4-75, F4-77, F4-78, F4-83, F4-84).
 *
 * Semilla: `SEED=… node --test test/qa-fase4.test.ts`. Los valores "validar con tejedora" llevan el comentario.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROFILE_RADIAL_TOLERANCE,
  RECOMMENDED_WRITTEN_LIMITS,
  STITCHES,
  STITCH_HEIGHT_FACTOR,
  concreteRounds,
  countRound,
  formatPart,
  parsePart,
  partProfile,
  readingModeFor,
  roundHeightFactor,
  shapeMetrics,
  stitchAbbrev,
  validatePattern,
  type GaugeStitch,
  type Item,
  type Part,
  type ProfileRing,
  type RevolutionProfile,
  type Round,
  type ShapeMetrics,
  type StitchCode,
} from "../src/index.ts";
import { FIXTURE_GAUGE, writtenOf } from "./support/amigurumi.ts";
import { forAll, type Rng } from "./support/property.ts";

const EPS = 1e-6;
const read = (text: string, id = "p"): Part => {
  const r = parsePart(text, { id });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.issues));
  return r.value;
};
const SC = shapeMetrics(FIXTURE_GAUGE, { assumed: false, gaugeStitch: "sc" });
const revolution = (part: Part, m: ShapeMetrics): RevolutionProfile => {
  const p = partProfile(part, m);
  assert.equal(p.kind, "revolution");
  return p as RevolutionProfile;
};

// ------------------------------------------------------------ G3 por tramos

/**
 * Pieza de revolución con conteos que suben y bajan: cada vuelta cambia en `d` puntos (de −n/2 a +n),
 * con `inc`/`dec` y el resto en `sc`, o mantiene el conteo con `hdc`, `dc` o `tr` (otro alto de vuelta).
 */
function genRevolution(r: Rng): { part: Part; metrics: ShapeMetrics } {
  const ring = r.bool(0.7);
  const startCount = ring ? 0 : r.int(3, 12);
  let n = ring ? r.int(3, 12) : startCount;
  const rounds: Round[] = [];
  if (ring) rounds.push({ number: 1, items: [{ type: "stitch", stitch: "sc", count: n }] });
  else rounds.push({ number: 1, items: [{ type: "stitch", stitch: "sc", count: n }] });
  const total = r.int(2, 30);
  for (let k = 2; k <= total; k++) {
    const roll = r.next();
    let items: Item[];
    if (roll < 0.15) {
      items = [{ type: "stitch", stitch: r.pick(["hdc", "dc", "tr"] as const), count: n }];
    } else if (roll < 0.6 || n < 4) {
      const d = r.int(0, Math.min(n, 40));
      items = [];
      if (d > 0) items.push({ type: "stitch", stitch: "inc", count: d });
      if (n - d > 0) items.push({ type: "stitch", stitch: "sc", count: n - d });
      n += d;
    } else {
      const d = r.int(1, Math.floor(n / 2));
      items = [{ type: "stitch", stitch: "dec", count: d }];
      if (n - 2 * d > 0) items.push({ type: "stitch", stitch: "sc", count: n - 2 * d });
      n -= d;
    }
    rounds.push({ number: k, items });
  }
  const part: Part = {
    id: "g3",
    name: "G3",
    construction: r.bool() ? "spiral" : "joined",
    start: ring ? { type: "magic_ring" } : { type: "chain", count: startCount },
    startYarn: "A",
    rounds,
  };
  const gaugeStitch: GaugeStitch = r.pick(["sc", "sc", "hdc", "dc", "tr"] as const);
  // ρ (vueltas por punto) de 0,5 a 2: abarca discos que quedan planos, que ondulan y conos.
  const stitches = r.int(8, 40);
  const metrics = shapeMetrics({ stitchesPer10cm: stitches, rowsPer10cm: Math.max(1, Math.round(stitches * (0.5 + r.next() * 1.5))) }, { assumed: r.bool(), gaugeStitch });
  return { part, metrics };
}

describe("G3 por tramos (QA T19): los tres tramos del paso radial y el acotado hacia adentro", () => {
  it("propiedad: cada anillo cumple su tramo, el alto es factor × s y los cuatro casos aparecen", () => {
    const tol = PROFILE_RADIAL_TOLERANCE;
    const hits = { first: 0, second: 0, clampedOut: 0, clampedIn: 0, magicV1: 0 };
    forAll(
      "G3-tramos",
      genRevolution,
      ({ part, metrics }) => {
        const profile = revolution(part, metrics);
        const concrete = concreteRounds(part);
        const rings: ProfileRing[] = profile.rings;
        assert.equal(rings.length, concrete.length + 1);
        for (let i = 1; i < rings.length; i++) {
          const prev = rings[i - 1]!;
          const ring = rings[i]!;
          const c = concrete[i - 1]!;
          const s = roundHeightFactor(c.round) * metrics.roundHeightCm;
          assert.ok(Math.abs(ring.heightCm - s) < EPS, `V${ring.round}: alto de la vuelta`);
          const target = (ring.stitches * metrics.stitchWidthCm) / (2 * Math.PI);
          const dz = ring.zCm - prev.zCm;
          assert.ok(dz >= -EPS, "G2: z no decrece");
          assert.ok(ring.radiusCm >= 0, "G2: radio ≥ 0");
          if (i === 1 && part.start.type === "magic_ring") {
            hits.magicV1++;
            assert.ok(Math.abs(ring.radiusCm - target) < EPS, "V1 sobre AM sin acotar");
            assert.equal(ring.strain, 1);
            continue;
          }
          const dr = target - prev.radiusCm;
          if (Math.abs(dr) <= s) {
            hits.first++;
            assert.ok(Math.abs(Math.hypot(ring.radiusCm - prev.radiusCm, dz) - s) < EPS, "tramo 1: distancia s sobre el meridiano");
            assert.equal(ring.strain, 1);
          } else if (Math.abs(dr) - s * tol <= 1e-9 * s * tol) {
            hits.second++;
            assert.ok(Math.abs(dz) < EPS, "tramo 2: Δz = 0");
            assert.equal(ring.radiusCm, target);
            assert.equal(ring.strain, 1);
          } else {
            assert.ok(Math.abs(dz) < EPS, "tramo 3: Δz = 0");
            assert.ok(Math.abs(Math.abs(ring.radiusCm - prev.radiusCm) - s * tol) < EPS, "tramo 3: |Δr| = s × tolerancia");
            if (dr > 0) {
              hits.clampedOut++;
              assert.ok(ring.strain > 1, "acotado hacia afuera: ondula (strain > 1)");
            } else {
              hits.clampedIn++;
              // El acotado hacia adentro nunca baja de 0: target ≥ 0 y prev − target > s·tol, así que prev − s·tol > 0.
              assert.ok(ring.radiusCm > 0, "acotado hacia adentro: el radio queda positivo");
              assert.ok(ring.strain < 1, "acotado hacia adentro: frunce (strain < 1)");
            }
          }
        }
      },
      400,
    );
    for (const [k, v] of Object.entries(hits)) assert.ok(v > 0, `el generador no recorrió el caso «${k}» (${JSON.stringify(hits)})`);
  });

  it("propiedad: el validador avisa exactamente en las vueltas acotadas que cambian el conteo en ese sentido, una vez por vuelta escrita", () => {
    let grows = 0;
    let shrinks = 0;
    forAll(
      "G3-avisos",
      genRevolution,
      ({ part }) => {
        // El validador lee la muestra del documento como punto bajo (C-3).
        const v = validatePattern(writtenOf([part], { gauge: { ...FIXTURE_GAUGE } }));
        const got = v.issues
          .filter((i) => i.code === "ROUND_GROWS_FAST" || i.code === "ROUND_SHRINKS_FAST")
          .map((i) => `${i.code === "ROUND_GROWS_FAST" ? "+" : "-"}${(i.data as { round: number }).round}`);
        const profile = revolution(part, SC);
        const expected: string[] = [];
        for (let i = 1; i < profile.rings.length; i++) {
          const ring = profile.rings[i]!;
          if (ring.strain === 1) continue;
          const change = ring.stitches - profile.rings[i - 1]!.stitches;
          if (change > 0 && ring.strain > 1) expected.push(`+${ring.round}`);
          else if (change < 0 && ring.strain < 1) expected.push(`-${ring.round}`);
        }
        assert.deepEqual(got, expected);
        grows += got.filter((x) => x.startsWith("+")).length;
        shrinks += got.filter((x) => x.startsWith("-")).length;
        for (const i of v.issues) if (i.code === "ROUND_GROWS_FAST" || i.code === "ROUND_SHRINKS_FAST") assert.equal(i.severity, "info");
      },
      300,
    );
    assert.ok(grows > 0 && shrinks > 0, `avisos: ${grows} de crecer y ${shrinks} de cerrar`);
  });
});

// ------------------------------------------------------------ Casos F4 sin prueba con su número

describe("F4-8, F4-55 a F4-57: el óvalo no entra en la v2", () => {
  it("F4-8 y F4-57: «Inicio: óvalo 7» no se lee (PARSE_START con el mensaje claro) y un start de óvalo armado a mano no se guarda", () => {
    const r = parsePart("Inicio: óvalo 7\nV1: 14 pb (14)", { id: "p" });
    assert.equal(r.ok, false);
    const issue = !r.ok ? r.issues[0] : undefined;
    assert.equal(issue?.code, "PARSE_START");
    assert.equal(issue?.message, "El inicio en óvalo todavía no está disponible. Usa AM o cad N y escribe la V1 con todos sus puntos.");
    const part = read("Inicio: AM\nV1: 6 pb (6)");
    const v = validatePattern(writtenOf([{ ...part, start: { type: "oval", count: 7 } as unknown as Part["start"] }]));
    assert.equal(v.savable, false);
    assert.ok(v.issues.some((i) => i.code === "PART_START"));
  });

  it("F4-55 y F4-56: la V1 de un óvalo (2n = 14) escrita sobre AM se lee, cuenta 14 y el perfil la dibuja como un círculo (axisimétrico)", () => {
    // F4-57: mientras tanto, el óvalo se escribe con Inicio: AM y la V1 con los puntos finales.
    const part = read("Inicio: AM\nV1: 14 pb (14)\nV2: 14 pb (14)");
    assert.equal(concreteRounds(part)[0]?.count.produced, 14);
    const p = revolution(part, SC);
    assert.ok(Math.abs(p.rings[1]!.radiusCm - (14 * SC.stitchWidthCm) / (2 * Math.PI)) < EPS);
    assert.equal(p.kind, "revolution");
  });
});

describe("F4-13 a F4-16: espiral, vueltas cerradas y palabra por construcción", () => {
  it("F4-13: la nota «Coloca un marcador al inicio de la vuelta» va en round.note y sobrevive a la ida y vuelta por texto", () => {
    const part = read("Inicio: AM\nV1: 6 pb en AM (6)\n> Coloca un marcador al inicio de la vuelta\nV2: aum x6 (12)");
    assert.equal(part.rounds[0]?.note, "Coloca un marcador al inicio de la vuelta");
    for (const d of ["es", "us", "uk"] as const) {
      const back = parsePart(formatPart(part, d), { id: "p", mode: readingModeFor(d) });
      assert.ok(back.ok);
      assert.deepEqual(back.ok && back.value, part);
    }
  });

  it("F4-14: un cambio de lana no cambia el conteo, ni en espiral ni en cerradas", () => {
    for (const c of ["espiral", "cerrada"]) {
      const withColor = read(`Inicio: AM\nConstrucción: ${c}\nV1: 6 pb (6)\nV2: @B, aum x6 (12)`);
      const without = read(`Inicio: AM\nConstrucción: ${c}\nV1: 6 pb (6)\nV2: aum x6 (12)`);
      const a = countRound(withColor.rounds[1]!, "A");
      const b = countRound(without.rounds[1]!, "A");
      assert.deepEqual({ consumed: a.consumed, produced: a.produced }, { consumed: b.consumed, produced: b.produced });
      assert.equal(a.endYarn, "B");
    }
  });

  it("F4-15: una vuelta de pa en espiral o cerrada sube el doble que una de pb; los conteos no cambian", () => {
    // validar con tejedora: STITCH_HEIGHT_FACTOR.dc = 2.
    for (const c of ["espiral", "cerrada"]) {
      const pb = revolution(read(`Inicio: AM\nConstrucción: ${c}\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3: 12 pb (12)`), SC);
      const pa = revolution(read(`Inicio: AM\nConstrucción: ${c}\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3: 12 pa (12)`), SC);
      assert.equal(pa.rings[3]!.stitches, pb.rings[3]!.stitches);
      assert.ok(Math.abs(pa.rings[3]!.heightCm - 2 * pb.rings[3]!.heightCm) < EPS);
      assert.ok(Math.abs(pa.rings[3]!.zCm - pa.rings[2]!.zCm - 2 * (pb.rings[3]!.zCm - pb.rings[2]!.zCm)) < EPS);
    }
  });

  it("F4-16: en hileras los mensajes nunca dicen «vuelta»; en espiral y cerradas, sí", () => {
    // T21 (C2): el motor escribe «hilera», como la sintaxis (H2) y la descripción; el texto acepta «H»/«hilera» y «fila». // validar con tejedora
    const flat = read("Inicio: cad 11\nConstrucción: hileras\nH1: 10 pb (10)\nH2: 11 pb (11)\nH3: 12 pb (12)");
    const msgs = validatePattern(writtenOf([flat])).issues.map((i) => i.message);
    assert.ok(msgs.length > 0);
    for (const m of msgs) assert.doesNotMatch(m, /vuelta/i, m);
    assert.ok(msgs.some((m) => /hilera 2/.test(m)));
    for (const m of msgs) assert.doesNotMatch(m, /\bfilas?\b/, m);
    const round = read("Inicio: AM\nV1: 6 pb (6)\nV2: 7 pb (7)");
    assert.ok(validatePattern(writtenOf([round])).issues.some((i) => /vuelta 2/.test(i.message)));
  });
});

describe("F4-17 a F4-27: qué consume, qué produce y cuánto sube cada punto", () => {
  // validar con tejedora: las alturas (F4-22 a F4-24) son convenciones; slst y ch no tienen valor.
  const TABLE: Array<[string, StitchCode, number, number, number | undefined, string]> = [
    ["F4-17", "sc", 1, 1, 1, "pb"],
    ["F4-18", "inc", 1, 2, 1, "aum"],
    ["F4-19", "inc3", 1, 3, 1, "aum3"],
    ["F4-20", "dec", 2, 1, 1, "dism"],
    ["F4-22", "hdc", 1, 1, 1.5, "mpa"],
    ["F4-23", "dc", 1, 1, 2, "pa"],
    ["F4-24", "tr", 1, 1, 2.5, "pad"],
    ["F4-25", "slst", 1, 1, undefined, "pd"],
    ["F4-26", "ch", 0, 1, undefined, "cad"],
    ["F4-27", "sk", 1, 0, undefined, "saltar"],
  ];
  for (const [id, code, consumes, produces, height, es] of TABLE) {
    it(`${id}: ${es} / ${STITCHES[code].us} consume ${consumes}, produce ${produces} y tiene alto ${height ?? "sin valor"}`, () => {
      assert.equal(STITCHES[code].consumes, consumes);
      assert.equal(STITCHES[code].produces, produces);
      assert.equal(stitchAbbrev(code, "es"), es);
      assert.equal(STITCH_HEIGHT_FACTOR[code], height);
      assert.equal(Object.hasOwn(STITCH_HEIGHT_FACTOR, code), height !== undefined);
    });
  }

  it("F4-18 y F4-20: «aum x6» consume 6 y produce 12; «dism x6» consume 12 y produce 6", () => {
    const p = read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3: dism x6 (6)");
    const c = concreteRounds(p).map((x) => [x.count.consumed, x.count.produced]);
    assert.deepEqual(c.slice(1), [[6, 12], [12, 6]]);
  });

  it("F4-21: la disminución invisible (invdec, en es-us y es-uk desde T21) cuenta como dism y no es dism en hebra delantera", () => {
    const inv = parsePart("Inicio: AM\nV1: 12 pb (12)\nV2: 6 invdec (6)", { id: "p", mode: "es-us" });
    assert.ok(inv.ok);
    const invUk = parsePart("Inicio: AM\nV1: 12 pb (12)\nV2: 6 invdec (6)", { id: "p", mode: "es-uk" });
    assert.deepEqual(invUk.ok ? invUk.value.rounds : null, inv.ok ? inv.value.rounds : undefined);
    const item = inv.ok ? inv.value.rounds[1]?.items[0] : undefined;
    assert.deepEqual(item, { type: "stitch", stitch: "dec", count: 6 });
    const front = read("Inicio: AM\nV1: 12 pb (12)\nV2: 6 dism hd (6)");
    assert.equal((front.rounds[1]?.items[0] as { loop?: string }).loop, "front");
    // validar con tejedora: el 3D no distingue las dos.
    assert.deepEqual(concreteRounds(inv.ok ? inv.value : front).map((x) => x.count), concreteRounds({ ...front, rounds: front.rounds.map((r) => ({ ...r, items: r.items.map((i) => (i.type === "stitch" ? { type: "stitch", stitch: i.stitch, count: i.count } : i)) })) }).map((x) => x.count));
  });

  it("F4-25 y F4-26: slst y ch quedan fuera del promedio de alto de la vuelta", () => {
    const r: Round = { number: 2, items: [{ type: "stitch", stitch: "dc", count: 6 }, { type: "stitch", stitch: "ch", count: 3 }, { type: "stitch", stitch: "slst", count: 2 }] };
    assert.equal(roundHeightFactor(r), 2);
    assert.equal(roundHeightFactor({ number: 1, items: [{ type: "stitch", stitch: "ch", count: 3 }] }), 1);
  });
});

describe("F4-35, F4-42 y F4-53: cierre, hebra trasera y piezas sin relleno no cambian la forma", () => {
  it("F4-35: el cierre de varias líneas va en finish y la última vuelta queda abierta (radio > 0)", () => {
    const part = read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3: 12 pb (12)\nCierre: pasa la hebra por la hebra delantera de los puntos\n> y tira para cerrar");
    assert.equal(part.finish, "pasa la hebra por la hebra delantera de los puntos\ny tira para cerrar");
    const p = revolution(part, SC);
    assert.ok(p.rings.at(-1)!.radiusCm > 0);
  });

  it("F4-42: una vuelta en hebra trasera no cambia el conteo, ni el alto ni el perfil", () => {
    // validar con tejedora: en la v2 el perfil no se quiebra; solo el relieve marca el borde.
    const base = read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3: 12 pb (12)\nV4: 12 pb (12)");
    const back = read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3: 12 pb ht (12)\nV4: 12 pb (12)");
    assert.equal((back.rounds[2]?.items[0] as { loop?: string }).loop, "back");
    assert.deepEqual(concreteRounds(back).map((c) => c.count), concreteRounds(base).map((c) => c.count));
    assert.deepEqual(partProfile(back, SC), partProfile(base, SC));
  });

  it("F4-53: «no rellenar; aplanar y coser abierta» se guarda como texto en finish y no cambia el perfil", () => {
    const open = read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)\nCierre: no rellenar; aplanar y coser abierta");
    const plain = read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)");
    assert.equal(open.finish, "no rellenar; aplanar y coser abierta");
    assert.deepEqual(partProfile(open, SC), partProfile(plain, SC));
  });
});

describe("F4-39: no hay aumento de mpa en el modelo", () => {
  it("F4-39: los únicos puntos que producen más de lo que consumen son de punto bajo; la cuenta del disco de mpa queda a mano", () => {
    const growing = (Object.keys(STITCHES) as StitchCode[]).filter((c) => STITCHES[c].produces > STITCHES[c].consumes && STITCHES[c].consumes > 0);
    assert.deepEqual(growing.sort(), ["inc", "inc3"]);
    for (const c of growing) assert.equal(STITCH_HEIGHT_FACTOR[c], 1);
    // Cuenta del caso con ρ = 1,2 (validar con tejedora): s(mpa) = 1,5 · s(pb) = 1,25 · w; Δn plano = 2π · 1,25 ≈ 7,85; 8 da ≈ 1,019.
    const m = shapeMetrics({ stitchesPer10cm: 20, rowsPer10cm: 24 }, { assumed: false, gaugeStitch: "sc" });
    const sHdc = (STITCH_HEIGHT_FACTOR.hdc as number) * m.roundHeightCm;
    assert.ok(Math.abs(sHdc - 1.25 * m.stitchWidthCm) < EPS);
    assert.ok(Math.abs((2 * Math.PI * sHdc) / m.stitchWidthCm - 7.854) < 1e-3);
    assert.ok(Math.abs((8 * m.stitchWidthCm) / (2 * Math.PI) / sHdc - 1.019) < 1e-3);
  });
});

describe("F4-52, F4-59 y F4-60: fuera de la v2 (relleno, espejo, variantes de una copia)", () => {
  const base = () => read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)");
  it("F4-52: la clave stuffing es UNKNOWN_KEY y no se guarda", () => {
    const v = validatePattern(writtenOf([{ ...base(), stuffing: "stuffed" } as Part]));
    assert.equal(v.savable, false);
    assert.ok(v.issues.some((i) => i.code === "UNKNOWN_KEY" && i.path === "parts[0].stuffing"));
  });
  it("F4-59: no hay espejo: una clave mirror en la parte es UNKNOWN_KEY", () => {
    const v = validatePattern(writtenOf([{ ...base(), mirror: true } as Part]));
    assert.equal(v.savable, false);
    assert.ok(v.issues.some((i) => i.code === "UNKNOWN_KEY" && i.path === "parts[0].mirror"));
  });
  it("F4-60: copies no admite variantes (solo un entero de 1 a LIMITS.maxCopies)", () => {
    for (const bad of [[1, 2], { left: 1 }, "2", 2.5]) {
      const v = validatePattern(writtenOf([{ ...base(), copies: bad } as unknown as Part]));
      assert.ok(v.issues.some((i) => i.code === "PART_COPIES"), JSON.stringify(bad));
    }
    assert.equal(validatePattern(writtenOf([{ ...base(), copies: 2 }])).valid, true);
  });
});

describe("F4-71 a F4-75: límites recomendados", () => {
  it("F4-71 a F4-75: 20 partes, 10 copias, 100 vueltas, 200 puntos por vuelta y 40.000 en la escena", () => {
    // validar con tejedora: estimaciones de orden de magnitud (C-18).
    assert.deepEqual({ ...RECOMMENDED_WRITTEN_LIMITS }, { parts: 20, copiesPerPart: 10, roundsPerPart: 100, stitchesPerRound: 200, sceneStitches: 40_000 });
  });
});

describe("F4-77, F4-78, F4-83 y F4-84: textos del validador", () => {
  const gauge = { gauge: { ...FIXTURE_GAUGE } };
  it("F4-77: ROUND_GROWS_FAST con el texto propuesto y la cifra de pb", () => {
    const v = validatePattern(writtenOf([read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3: aum x12 (24)")], gauge));
    const i = v.issues.find((x) => x.code === "ROUND_GROWS_FAST");
    assert.equal(i?.message, "Parte, vuelta 3: esta vuelta aumenta más de lo que la tela puede abrir en plano (+12 puntos; una vuelta de pb queda plana con unos 6). Si la tejes así, la pieza tiende a ondularse. Puede ser lo que buscas.");
  });
  it("F4-78: ROUND_SHRINKS_FAST con el texto propuesto", () => {
    const part = read(["Inicio: AM", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3: [pb, aum] x6 (18)", "V4: [pb 2, aum] x6 (24)", "V5: [pb 3, aum] x6 (30)", "V6: dism x15 (15)"].join("\n"));
    const v = validatePattern(writtenOf([part], gauge));
    const i = v.issues.find((x) => x.code === "ROUND_SHRINKS_FAST");
    assert.equal(i?.message, "Parte, vuelta 6: esta vuelta disminuye más de lo que la pieza puede cerrarse en curva (−15 puntos). Si la tejes así, la pieza se frunce o se cierra en copa. Puede ser lo que buscas (por ejemplo, el remate).");
  });
  it("F4-83: ROUND_CONSUMPTION_MISMATCH trae la pista de la cadeneta de subida y del pd de unión, y en hileras la de la cadeneta para girar", () => {
    const joined = validatePattern(writtenOf([read("Inicio: AM\nConstrucción: cerrada\nV1: 6 pb (6)\nV2: aum x6, pd (12)")]));
    const j = joined.issues.find((x) => x.code === "ROUND_CONSUMPTION_MISMATCH");
    assert.deepEqual((j?.data as { hints?: string[] }).hints, ["join"]);
    assert.match(j!.message, /¿Escribiste la cadeneta de subida o el pd de unión como puntos\? No cuentan\.$/);
    const flat = validatePattern(writtenOf([read("Inicio: cad 11\nConstrucción: hileras\nH1: 10 pb (10)\nH2: 11 pb (11)")]));
    const f = flat.issues.find((x) => x.code === "ROUND_CONSUMPTION_MISMATCH");
    assert.deepEqual((f?.data as { hints?: string[] }).hints, ["turning_chain", "join"]);
    assert.match(f!.message, /Revisa si la cadeneta para girar cuenta como punto\./);
  });
  it("F4-84: ROUND_RANGE_CHANGES sugiere escribir cada vuelta por separado", () => {
    const v = validatePattern(writtenOf([read("Inicio: AM\nV1: 6 pb (6)\nV2: aum x6 (12)\nV3-5: [pb, aum] x6 (18)")]));
    const i = v.issues.find((x) => x.code === "ROUND_RANGE_CHANGES");
    assert.equal(i?.message, "Parte, vueltas 3-5: un rango de vueltas iguales debe mantener el conteo, pero cada vuelta pasa de 12 a 18 puntos. Si las vueltas aumentan, escribe cada vuelta por separado.");
    assert.equal(i?.severity, "error");
    assert.equal(v.savable, true);
  });
});

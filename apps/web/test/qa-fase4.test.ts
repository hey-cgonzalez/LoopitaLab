/**
 * QA de la fase 4 (T19, `qa-tester`), fuera del núcleo:
 *
 * 1. Prueba cruzada de la tabla de muestra de crochet que el validador copió de `yarn-catalog` (ADR 0010, riesgos de
 *    T5). La tabla es privada (`ASSUMED_CROCHET_GAUGE` en `validate.ts`): se compara por comportamiento. Para cada
 *    categoría 0 a 7, validar con `weightCat` da exactamente los mismos avisos de forma (código, vuelta, cambio y
 *    `ratio` = Δr/s con tres decimales) que validar con `assumedGauge` = `suggestedGauge(cat, "crochet")` y el punto
 *    traducido de `assumption`. El `ratio` depende del ancho del punto y del alto de la vuelta: una diferencia en
 *    puntos, vueltas o punto de la muestra cambia el resultado.
 * 2. BUG-QA4-1 (corregido en T21, C1): la muestra supuesta sale de una sola fuente, `assumedGaugeOfPart`: la lana
 *    inicial de cada parte, en el validador, la descripción, el panel, las medidas, las siluetas y el 3D.
 * 3. Casos F4 de textos de la interfaz: F4-44, F4-54, F4-79 (aviso de prototipo), F4-72 a F4-74 (nombres de los
 *    límites), F4-80 (forma C-17), F4-81 (aviso de `#`) y F4-82 (ayuda de los límites).
 */
import { COMMENT_WARNING, RECOMMENDED_WRITTEN_LIMITS, newWrittenPattern, parsePart, validatePattern, type GaugeStitch, type Issue, type Part, type WeightCategory, type WrittenPattern } from "@loopitalab/pattern-core";
import { describeWritten } from "@loopitalab/pattern-render";
import { suggestedGauge } from "@loopitalab/yarn-catalog";
import { describe, expect, it } from "vitest";
import { metricsResolver, partSummaries, silhouettesOf } from "@/components/amigurumi/metrics.ts";
import { VIEWER_3D_TEXTS } from "@/components/amigurumi/texts.ts";
import { assumedGaugeOfPart } from "@/lib/amigurumi/assumed-gauge.ts";
import { writtenValidateOptions } from "@/lib/amigurumi/review.ts";
import { AMIGURUMI_TEXTS, LIMIT_NAMES } from "@/lib/amigurumi/texts.ts";

const ID = "aaaaaaaa-0000-4000-8000-0000000000f4";

function part(text: string, id = "p1"): Part {
  const r = parsePart(text, { id });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const yarn = (id: string, weight: WeightCategory, hex: string) => ({ id, weight, composition: [{ fiber: "algodon", percent: 100 }], color: { hex } });

/** Disco de pb con `per` aumentos por vuelta y, al final, un cierre con `dec` (avisos de crecer y de cerrar). */
function discText(per: number): string {
  const lines = ["Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)"];
  let n = 6;
  for (let k = 2; k <= 6; k++) {
    const inc = Math.min(per, n);
    lines.push(`V${k}: ${[`aum x${inc}`, n - inc > 0 ? `pb ${n - inc}` : ""].filter(Boolean).join(", ")} (${n + inc})`);
    n += inc;
  }
  const dec = Math.floor(n / 2);
  lines.push(`V7: dism x${dec}${n - 2 * dec > 0 ? `, pb ${n - 2 * dec}` : ""} (${n - dec})`);
  return lines.join("\n");
}

const shape = (issues: Issue[]) =>
  issues.filter((i) => i.code === "ROUND_GROWS_FAST" || i.code === "ROUND_SHRINKS_FAST").map((i) => ({ code: i.code, path: i.path, data: i.data, message: i.message }));

const stitchOf = (assumption: string): GaugeStitch => (assumption === "crochet-pa" ? "dc" : "sc");

describe("prueba cruzada: muestra de crochet del validador = suggestedGauge(cat, \"crochet\") de yarn-catalog", () => {
  const DISCS = [3, 6, 7, 8, 9, 10, 12, 18].map((per) => part(discText(per), `d${per}`));
  const doc: WrittenPattern = { ...newWrittenPattern({ id: ID, title: "Discos", yarns: [yarn("A", 4, "#E9DDBE")], partName: "x" }), parts: DISCS };

  for (const cat of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
    it(`categoría ${cat}: los mismos avisos de forma con weightCat y con la muestra de yarn-catalog`, () => {
      const s = suggestedGauge(cat, "crochet");
      expect(s, `yarn-catalog no tiene muestra de crochet para la categoría ${cat}`).toBeDefined();
      const byTable = validatePattern(doc, { weightCat: cat });
      const byCatalog = validatePattern(doc, { assumedGauge: { stitchesPer10cm: s!.stitchesPer10cm, rowsPer10cm: s!.rowsPer10cm }, assumedGaugeStitch: stitchOf(s!.assumption) });
      expect(shape(byTable.issues)).toEqual(shape(byCatalog.issues));
      // Hay avisos con los que comparar (si no, la prueba no diría nada).
      expect(shape(byTable.issues).length).toBeGreaterThan(0);
    });
  }

  /*
   * Límite de la comparación por comportamiento: los avisos de forma dependen solo de Δr/s, es decir de
   * (vueltas en 10 cm × factor del punto) / (puntos en 10 cm). Un valor mal copiado que conserve esa razón (por
   * ejemplo, puntos y vueltas multiplicados por lo mismo) no se ve desde el validador. Las categorías 3 (15 × 18) y
   * 5 (10 × 12) tienen la misma razón, 1,2, y por eso dan los mismos avisos.
   */
  it("la comparación distingue las categorías con distinta razón vueltas × factor / puntos (sensible a un valor mal copiado)", () => {
    const sig = (cat: WeightCategory) => JSON.stringify(shape(validatePattern(doc, { weightCat: cat }).issues).map((i) => i.data));
    const all = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => sig(c as WeightCategory));
    expect(new Set(all).size).toBe(7);
    expect(sig(3)).toBe(sig(5));
    // Un supuesto que difiere en una vuelta en 10 cm de la tabla ya cambia el resultado.
    const s = suggestedGauge(4, "crochet")!;
    const off = validatePattern(doc, { assumedGauge: { stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm + 1 }, assumedGaugeStitch: stitchOf(s.assumption) });
    expect(JSON.stringify(shape(off.issues).map((i) => i.data))).not.toBe(sig(4));
  });

  it("la aplicación traduce assumption igual que el validador: crochet-pa → dc solo donde yarn-catalog lo dice", () => {
    for (const cat of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
      const s = suggestedGauge(cat, "crochet")!;
      const single: WrittenPattern = { ...doc, yarns: [yarn("A", cat, "#E9DDBE")] };
      const opts = writtenValidateOptions(single);
      expect(opts.assumedGaugeOf?.(single.parts[0]!, 0)).toEqual({ gauge: { stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm }, stitch: stitchOf(s.assumption) });
    }
  });
});

describe("BUG-QA4-1: la muestra supuesta sale de una sola fuente (revisión T21, C1)", () => {
  // Lana A fina (categoría 1) y lana B gruesa (categoría 6). La parte empieza con la B. Sin muestra en el documento.
  const body = part(["Parte: Cuerpo", "Inicio: AM", "Construcción: espiral", "Lana: B", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3: [pb, aum] x6 (18)", "V4-8: 18 pb (18)"].join("\n"), "cuerpo");
  const doc: WrittenPattern = { ...newWrittenPattern({ id: ID, title: "Dos lanas", yarns: [yarn("A", 1, "#E9DDBE"), yarn("B", 6, "#BA222C")], partName: "x" }), parts: [body] };
  const describedOf = (d: WrittenPattern) =>
    describeWritten(d, {
      assumedGaugeOf: (p) => {
        const { stitchesPer10cm, rowsPer10cm, gaugeStitch } = assumedGaugeOfPart(d, p);
        return { stitchesPer10cm, rowsPer10cm, gaugeStitch };
      },
    });

  it("el validador, la descripción, la lista de medidas, las siluetas y el 3D usan la lana inicial de la parte", () => {
    const b = suggestedGauge(6, "crochet")!;
    const g = assumedGaugeOfPart(doc, body);
    expect(g).toMatchObject({ stitchesPer10cm: b.stitchesPer10cm, rowsPer10cm: b.rowsPer10cm, gaugeStitch: stitchOf(b.assumption), weight: 6 });
    expect(writtenValidateOptions(doc).assumedGaugeOf?.(body, 0)).toEqual({ gauge: { stitchesPer10cm: b.stitchesPer10cm, rowsPer10cm: b.rowsPer10cm }, stitch: stitchOf(b.assumption) });
    expect(AMIGURUMI_TEXTS.muestra.supuesta(b.stitchesPer10cm, b.rowsPer10cm)).toContain("según el grosor de la lana con que empieza esta parte");
    expect(metricsResolver(doc)(body).stitchWidthCm).toBeCloseTo(10 / b.stitchesPer10cm, 9);
    const described = describedOf(doc).parts[0]?.measures?.heightCm;
    expect(described).toBeDefined();
    expect(partSummaries(doc)[0]!.heightCm).toBeCloseTo(described as number, 6);
    expect(silhouettesOf(doc)[0]!.heightCm).toBeCloseTo(partSummaries(doc)[0]!.heightCm, 9);
  });

  it("sin grosor conocido cae al grosor 4, marcado como supuesto", () => {
    const odd: WrittenPattern = { ...doc, yarns: [{ ...yarn("A", 1, "#E9DDBE"), weight: "x" as unknown as WeightCategory }, doc.yarns[1]!], parts: [{ ...body, startYarn: "A" }] };
    expect(assumedGaugeOfPart(odd, odd.parts[0]!).weight).toBe(4);
  });

  it("el validador y la descripción coinciden con el 3D también en los avisos de forma (grosor distinto por parte)", () => {
    const fine = validatePattern(doc, writtenValidateOptions(doc)).issues.map((i) => i.code);
    const viaPart = validatePattern(doc, { assumedGauge: { stitchesPer10cm: suggestedGauge(6, "crochet")!.stitchesPer10cm, rowsPer10cm: suggestedGauge(6, "crochet")!.rowsPer10cm }, assumedGaugeStitch: stitchOf(suggestedGauge(6, "crochet")!.assumption) }).issues.map((i) => i.code);
    expect(fine).toEqual(viaPart);
  });
});

describe("casos F4 de textos de la interfaz", () => {
  it("F4-44, F4-54 y F4-79: el aviso de prototipo menciona el relleno y la tensión de amigurumi", () => {
    // validar con tejedora (textos de T18).
    expect(VIEWER_3D_TEXTS.avisoPrototipo).toContain("El relleno redondea la pieza y puede cambiar sus medidas");
    expect(VIEWER_3D_TEXTS.avisoPrototipo).toContain("El amigurumi se teje más apretado que una muestra plana: teje una muestra con tu ganchillo");
    expect(AMIGURUMI_TEXTS.muestra.ayuda).toContain("El amigurumi se teje apretado");
  });

  it("F4-71 a F4-74: los nombres de los límites usan los valores del motor y dicen «veces», no «copias»", () => {
    const R = RECOMMENDED_WRITTEN_LIMITS;
    expect(LIMIT_NAMES).toEqual({
      parts: `${R.parts} partes`,
      copiesPerPart: `${R.copiesPerPart} veces por parte`,
      roundsPerPart: `${R.roundsPerPart} vueltas por parte`,
      stitchesPerRound: `${R.stitchesPerRound} puntos por vuelta`,
      sceneStitches: "40.000 puntos en la escena",
    });
    for (const v of Object.values(LIMIT_NAMES)) expect(v).not.toMatch(/copia/i);
  });

  it("F4-80: «Dónde va cada pieza» sin distancia en puntos y contando desde el anillo mágico", () => {
    const head = part(["Parte: Cabeza", "Inicio: AM", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3-12: 12 pb (12)"].join("\n"), "cabeza");
    const ear = { ...part(["Parte: Oreja", "Cantidad: 2", "Inicio: AM", "V1: 6 pb (6)", "V2: 6 pb (6)"].join("\n"), "oreja") };
    const doc: WrittenPattern = {
      ...newWrittenPattern({ id: ID, title: "Osito", yarns: [yarn("A", 4, "#E9DDBE")], partName: "x" }),
      parts: [head, ear],
      layout: { placements: [{ target: { part: "oreja", copy: 0 }, at: { type: "surface", host: { part: "cabeza", copy: 0 }, round: 10, stitch: 3, attach: "end", rotationDeg: [0, 0, 0] } }] },
    };
    expect(validatePattern(doc).savable).toBe(true);
    const text = describeWritten(doc).placements.find((p) => p.copy === 0 && p.part === "oreja")!.text;
    expect(text).toBe("Oreja (1 de 2): se cose a la pieza «Cabeza», entre la V10 y la V11, contando desde el anillo mágico.");
    expect(text).not.toMatch(/punto/);
  });

  it("F4-81: el aviso de # es el del ADR", () => {
    expect(COMMENT_WARNING).toBe("Los comentarios con # no se guardan; usa > para una nota.");
  });

  it("F4-82: el diálogo y la ayuda dicen que no son límites del tejido", () => {
    expect(AMIGURUMI_TEXTS.limites.dialogo("parts", 21)).toBe("Esto supera el límite recomendado de 20 partes (quedaría en 21). La vista previa puede ir más lenta. ¿Seguir igual?");
    expect(AMIGURUMI_TEXTS.limites.ayuda.join(" ")).toContain("No son límites del tejido");
  });

  // O-QA4-2: F4-82 pide además aclarar en la ayuda que las piezas que se tejen varias veces no cuentan como partes.
  it("F4-82 (copias): la ayuda aclara que una parte que se teje varias veces cuenta como una sola parte", () => {
    expect(AMIGURUMI_TEXTS.limites.ayuda.join(" ")).toMatch(/(veces|copias)[^.]*(cuenta|cuentan)[^.]*(una|sola) parte|no cuentan como partes/);
  });
});

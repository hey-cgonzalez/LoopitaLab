/**
 * QA de la fase 4 (T19, `qa-tester`), fuera del núcleo:
 *
 * 1. Prueba cruzada de la tabla de muestra de crochet que el validador copió de `yarn-catalog` (ADR 0010, riesgos de
 *    T5). La tabla es privada (`ASSUMED_CROCHET_GAUGE` en `validate.ts`): se compara por comportamiento. Para cada
 *    categoría 0 a 7, validar con `weightCat` da exactamente los mismos avisos de forma (código, vuelta, cambio y
 *    `ratio` = Δr/s con tres decimales) que validar con `assumedGauge` = `suggestedGauge(cat, "crochet")` y el punto
 *    traducido de `assumption`. El `ratio` depende del ancho del punto y del alto de la vuelta: una diferencia en
 *    puntos, vueltas o punto de la muestra cambia el resultado.
 * 2. BUG-QA4-1: la muestra supuesta tiene dos fuentes (ADR 0011, T14-5). El panel de la muestra, el validador y la
 *    descripción accesible usan el grosor de la lana A; el 3D, las medidas de la lista de partes y las siluetas usan
 *    la lana inicial de cada parte. No se corrige aquí: lo decide `experto-tejido` en T21.
 * 3. Casos F4 de textos de la interfaz: F4-44, F4-54, F4-79 (aviso de prototipo), F4-72 a F4-74 (nombres de los
 *    límites), F4-80 (forma C-17), F4-81 (aviso de `#`) y F4-82 (ayuda de los límites).
 */
import { COMMENT_WARNING, RECOMMENDED_WRITTEN_LIMITS, newWrittenPattern, parsePart, validatePattern, type GaugeStitch, type Issue, type Part, type WeightCategory, type WrittenPattern } from "@loopitalab/pattern-core";
import { describeWritten } from "@loopitalab/pattern-render";
import { suggestedGauge } from "@loopitalab/yarn-catalog";
import { describe, expect, it } from "vitest";
import { metricsResolver, partSummaries, silhouettesOf } from "@/components/amigurumi/metrics.ts";
import { VIEWER_3D_TEXTS } from "@/components/amigurumi/texts.ts";
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
      expect(opts.assumedGauge).toEqual({ stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm });
      expect(opts.assumedGaugeStitch).toBe(stitchOf(s.assumption));
    }
  });
});

describe("BUG-QA4-1: la muestra supuesta tiene dos fuentes (ADR 0011, T14-5)", () => {
  // Lana A fina (categoría 1) y lana B gruesa (categoría 6). La parte empieza con la B. Sin muestra en el documento.
  const body = part(["Parte: Cuerpo", "Inicio: AM", "Construcción: espiral", "Lana: B", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3: [pb, aum] x6 (18)", "V4-8: 18 pb (18)"].join("\n"), "cuerpo");
  const doc: WrittenPattern = { ...newWrittenPattern({ id: ID, title: "Dos lanas", yarns: [yarn("A", 1, "#E9DDBE"), yarn("B", 6, "#BA222C")], partName: "x" }), parts: [body] };

  it("hoy: el validador y la descripción usan la lana A; el 3D, las medidas y las siluetas, la lana inicial de la parte", () => {
    const a = suggestedGauge(1, "crochet")!;
    const b = suggestedGauge(6, "crochet")!;
    // Panel y validador: lana A.
    expect(writtenValidateOptions(doc).assumedGauge).toEqual({ stitchesPer10cm: a.stitchesPer10cm, rowsPer10cm: a.rowsPer10cm });
    expect(AMIGURUMI_TEXTS.muestra.supuesta(a.stitchesPer10cm, a.rowsPer10cm)).toContain("según el grosor de la lana A");
    // 3D (controller → metricsResolver), lista de medidas y siluetas: lana B, la inicial de la parte.
    const m = metricsResolver(doc)(body);
    expect(m.stitchWidthCm).toBeCloseTo(10 / b.stitchesPer10cm, 9);
    // Descripción accesible, armada como en WrittenStudio (con la lana A).
    const desc = describeWritten(doc, { assumedGauge: { stitchesPer10cm: a.stitchesPer10cm, rowsPer10cm: a.rowsPer10cm, gaugeStitch: stitchOf(a.assumption) } });
    const described = desc.parts[0]?.measures?.heightCm;
    const summary = partSummaries(doc)[0]!;
    const silhouette = silhouettesOf(doc)[0]!;
    expect(described).toBeDefined();
    // La misma pieza mide distinto en la descripción y en la lista de medidas del 3D (más del doble).
    expect(summary.heightCm / (described as number)).toBeGreaterThan(2);
    expect(silhouette.heightCm).toBeCloseTo(summary.heightCm, 9);
  });

  // `it.fails`: pasa mientras el bug exista. Cuando T21 decida una sola fuente y se corrija, esta prueba falla y
  // hay que quitarle el `.fails`.
  it.fails("esperado: la descripción y la lista de medidas dan el mismo alto para la misma pieza", () => {
    const a = suggestedGauge(1, "crochet")!;
    const desc = describeWritten(doc, { assumedGauge: { stitchesPer10cm: a.stitchesPer10cm, rowsPer10cm: a.rowsPer10cm, gaugeStitch: stitchOf(a.assumption) } });
    expect(partSummaries(doc)[0]!.heightCm).toBeCloseTo(desc.parts[0]!.measures!.heightCm as number, 6);
  });
});

describe("casos F4 de textos de la interfaz", () => {
  it("F4-44, F4-54 y F4-79: el aviso de prototipo menciona el relleno y la tensión de amigurumi", () => {
    // validar con tejedora (textos de T18).
    expect(VIEWER_3D_TEXTS.avisoPrototipo).toContain("El relleno redondea la pieza y puede cambiar sus medidas");
    expect(VIEWER_3D_TEXTS.avisoPrototipo).toContain("El amigurumi se teje más apretado que una muestra plana: teje una muestra con tu aguja");
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
  // `it.fails` mientras falte: al agregar la frase, quitar el `.fails`.
  it.fails("F4-82 (pendiente): la ayuda aclara que una parte que se teje varias veces cuenta como una sola parte", () => {
    expect(AMIGURUMI_TEXTS.limites.ayuda.join(" ")).toMatch(/(veces|copias)[^.]*(cuenta|cuentan)[^.]*(una|sola) parte|no cuentan como partes/);
  });
});

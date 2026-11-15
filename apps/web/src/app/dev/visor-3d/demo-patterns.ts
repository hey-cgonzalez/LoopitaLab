import { SCHEMA_VERSION, parsePart, partProfile, shapeMetrics, type Part, type Placement, type WeightCategory, type WrittenPattern, type Yarn } from "@loopitalab/pattern-core";

/*
 * Patrones de demostración de `/dev/visor-3d` (T11 de la fase 4). Se escriben en la sintaxis de texto y los lee el
 * motor (`parsePart`): ni esta página ni el visor cuentan puntos (regla de oro 2). Los fixtures A y B son los de los
 * casos de dominio (docs/casos-dominio-fase-4.md, sección 6; mismos textos que
 * `packages/pattern-core/test/support/amigurumi.ts`). Sin marcas: lanas por fibra y color de la paleta propia.
 */

export const DEMO_GAUGE = Object.freeze({ stitchesPer10cm: 20, rowsPer10cm: 24 });

const yarn = (id: string, hex: string, paletteId: string, composition: Yarn["composition"], weight: WeightCategory = 3): Yarn => ({ id, weight, composition, color: { hex, paletteId } });

export const YARN_A = yarn("A", "#E9DDBE", "crudo", [{ fiber: "algodon", percent: 100 }]);
export const YARN_B = yarn("B", "#BA222C", "rojo", [{ fiber: "algodon", percent: 100 }]);
export const YARN_C = yarn("C", "#1A2540", "azul-marino", [{ fiber: "lana", percent: 75 }, { fiber: "poliamida", percent: 25 }], 1);
export const YARN_D = yarn("D", "#EC9DB0", "rosado", [{ fiber: "acrilico", percent: 100 }]);

/** Composiciones para comparar el aspecto por fibra (CA4-V8; la calibración es T11c). */
export const FIBER_SAMPLES: Record<string, { label: string; composition: Yarn["composition"] }> = {
  algodon: { label: "100 % algodón", composition: [{ fiber: "algodon", percent: 100 }] },
  acrilico: { label: "100 % acrílico", composition: [{ fiber: "acrilico", percent: 100 }] },
  "lana-mohair": { label: "70/30 lana y mohair", composition: [{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 30 }] },
  seda: { label: "100 % seda", composition: [{ fiber: "seda", percent: 100 }] },
  mohair: { label: "100 % mohair", composition: [{ fiber: "mohair", percent: 100 }] },
};

const head = (name: string, opts: { start?: string; construction?: string; yarn?: string; copies?: number } = {}) =>
  [`Parte: ${name}`, ...(opts.copies ? [`Cantidad: ${opts.copies}`] : []), `Inicio: ${opts.start ?? "AM"}`, `Construcción: ${opts.construction ?? "espiral"}`, `Lana: ${opts.yarn ?? "A"}`];
const sc = (n: number) => (n === 1 ? "pb" : `pb ${n}`);

/** Fixture A, "cuerpo de 39 vueltas" (F4-45): +6 hasta 60, meseta V11 a `plateauEnd`, −6 hasta 6. */
export function fixtureAText(plateauEnd = 30, opts: { name?: string; yarn?: string; stripes?: boolean; copies?: number } = {}): string {
  const lines = [...head(opts.name ?? "Cuerpo", { yarn: opts.yarn ?? "A", ...(opts.copies ? { copies: opts.copies } : {}) }), "V1: 6 pb en AM (6)", "V2: aum x6 (12)"];
  for (let k = 3; k <= 10; k++) lines.push(`V${k}: [${sc(k - 2)}, aum] x6 (${6 * k})`);
  if (opts.stripes) {
    // Cambios de color en 5 vueltas (escenario de referencia, sección 6 del ADR 0010).
    lines.push("V11-14: 60 pb (60)", "V15: @B, 60 pb (60)", "V16: @C, 60 pb (60)", "V17: @B, 60 pb (60)", "V18: @A, [pb 9, @B, pb, @A] x6 (60)", "V19: @C, 60 pb (60)", `V20-${plateauEnd}: @A, 60 pb (60)`);
  } else lines.push(`V11-${plateauEnd}: 60 pb (60)`);
  const close = plateauEnd + 9;
  for (let k = plateauEnd + 1; k < close; k++) {
    const before = close - k;
    lines.push(`V${k}: [${sc(before)}, dism] x6 (${6 * (before + 1)})`);
  }
  lines.push(`V${close}: dism x6 (6)`);
  return lines.join("\n");
}

/** Conteos del fixture B (esfera de perfil, 36 vueltas, F4-49). */
export const FIXTURE_B_COUNTS: readonly number[] = Object.freeze([
  6, 8, 13, 18, 23, 28, 32, 37, 41, 44, 48, 51, 53, 55, 57, 59, 59, 60, 60, 59, 59, 57, 55, 53, 51, 48, 44, 41, 37, 32, 28, 23, 18, 13, 8, 6,
]);

export function fixtureBText(name = "Esfera", yarnId = "A"): string {
  const lines = [...head(name, { yarn: yarnId }), "V1: 6 pb en AM (6)"];
  for (let i = 1; i < FIXTURE_B_COUNTS.length; i++) {
    const prev = FIXTURE_B_COUNTS[i - 1]!;
    const n = FIXTURE_B_COUNTS[i]!;
    const d = Math.abs(n - prev);
    let text: string;
    if (n > prev) text = [`aum x${d}`, prev - d > 0 ? `${prev - d} pb` : ""].filter(Boolean).join(", ");
    else if (n < prev) text = [`dism x${d}`, prev - 2 * d > 0 ? `${prev - 2 * d} pb` : ""].filter(Boolean).join(", ");
    else text = `${n} pb`;
    lines.push(`V${i + 1}: ${text} (${n})`);
  }
  return lines.join("\n");
}

/** Cilindro: base plana de 36 (V1 a V6) y 20 vueltas rectas, abierto arriba. */
export function cylinderText(name = "Cilindro", yarnId = "A", copies?: number, height = 26): string {
  const lines = [...head(name, { yarn: yarnId, ...(copies ? { copies } : {}) }), "V1: 6 pb en AM (6)", "V2: aum x6 (12)"];
  for (let k = 3; k <= 6; k++) lines.push(`V${k}: [${sc(k - 2)}, aum] x6 (${6 * k})`);
  lines.push(`V7-${height}: 36 pb (36)`);
  return lines.join("\n");
}

/** Panel plano en hileras: cadeneta de 21 (20 más la de vuelta) y 24 filas de 20 pb. */
export function panelText(): string {
  return [...head("Panel", { start: "cad 21", construction: "hileras", yarn: "D" }), "H1: 20 pb (20)", "H2-24: 20 pb (20)"].join("\n");
}

/** Pieza que ondula: aumenta 12 por vuelta (Δr/s > 1,25; CA4-V6). */
export function ruffleText(): string {
  const lines = [...head("Volado", { yarn: "D" }), "V1: 6 pb en AM (6)", "V2: aum x6 (12)", "V3: [pb, aum] x6 (18)"];
  for (let k = 4, n = 18; k <= 9; k++, n += 12) lines.push(`V${k}: aum x12, ${n - 12} pb (${n + 12})`);
  return lines.join("\n");
}

export function readDemoPart(text: string, id: string): Part {
  const r = parsePart(text, { id });
  if (!r.ok) throw new Error(`La parte ${id} no se lee: ${r.issues.map((i) => i.message).join("; ")}`);
  return r.value;
}

const pattern = (title: string, parts: Part[], yarns: Yarn[], extra: Partial<WrittenPattern> = {}): WrittenPattern => ({
  schemaVersion: SCHEMA_VERSION,
  id: `demo-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  title,
  technique: "crochet",
  kind: "written",
  yarns,
  gauge: { ...DEMO_GAUGE },
  origin: { kind: "manual" },
  parts,
  ...extra,
});

/** Muñeco armado: cuerpo libre, cabeza encima, orejas y brazos cosidos con anclas (`SurfaceAt`), copias. */
function doll(): WrittenPattern {
  const body = readDemoPart(cylinderText("Cuerpo", "A", undefined, 22), "cuerpo");
  const headPart = readDemoPart(fixtureBText("Cabeza", "A"), "cabeza");
  const ear = readDemoPart(["Parte: Oreja", "Cantidad: 2", "Inicio: AM", "Construcción: espiral", "Lana: D", "V1: 6 pb en AM (6)", "V2: aum x6 (12)", "V3: [pb, aum] x6 (18)", "V4-8: 18 pb (18)"].join("\n"), "oreja");
  const arm = readDemoPart(["Parte: Brazo", "Cantidad: 2", "Inicio: AM", "Construcción: espiral", "Lana: C", "V1: 6 pb en AM (6)", "V2: [pb, aum] x3 (9)", "V3-14: 9 pb (9)"].join("\n"), "brazo");
  // Alto real del cuerpo según el perfil del motor (las vueltas de la base plana no suman alto).
  const bodyHeightCm = partProfile(body, shapeMetrics(DEMO_GAUGE, { assumed: false, gaugeStitch: "sc" })).heightCm;
  const surface = (target: string, copy: number, host: string, round: number, stitch: number, rot: [number, number, number] = [0, 0, 0]): Placement => ({
    target: { part: target, copy },
    at: { type: "surface", host: { part: host, copy: 0 }, round, stitch, attach: "end", rotationDeg: rot, offsetCm: -0.2 },
  });
  const layout = {
    placements: [
      { target: { part: "cuerpo", copy: 0 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } },
      { target: { part: "cabeza", copy: 0 }, at: { type: "free", positionCm: [0, 0, bodyHeightCm - 0.6], rotationDeg: [0, 0, 0] } },
      surface("oreja", 0, "cabeza", 30, 4),
      surface("oreja", 1, "cabeza", 30, 18),
      surface("brazo", 0, "cuerpo", 20, 0),
      surface("brazo", 1, "cuerpo", 20, 18),
    ] as Placement[],
  };
  return pattern("Muñeco armado", [body, headPart, ear, arm], [YARN_A, YARN_B, YARN_C, YARN_D], { layout, assembly: ["Cose la cabeza sobre el cuerpo.", "Cose las orejas a la cabeza.", "Cose los brazos al cuerpo."] });
}

export interface DemoEntry {
  key: string;
  label: string;
  build: () => WrittenPattern;
}

export const DEMOS: DemoEntry[] = [
  { key: "fixture-a", label: "Fixture A: cuerpo de 39 vueltas (1.800 puntos)", build: () => pattern("Fixture A", [readDemoPart(fixtureAText(), "cuerpo")], [YARN_A, YARN_B, YARN_C]) },
  { key: "fixture-b", label: "Fixture B: esfera (1.384 puntos)", build: () => pattern("Fixture B", [readDemoPart(fixtureBText(), "esfera")], [YARN_A, YARN_B, YARN_C]) },
  { key: "cilindro", label: "Cilindro", build: () => pattern("Cilindro", [readDemoPart(cylinderText(), "cilindro")], [YARN_A, YARN_B]) },
  { key: "panel", label: "Panel plano (hileras)", build: () => pattern("Panel", [readDemoPart(panelText(), "panel")], [YARN_D]) },
  { key: "colores", label: "Pieza con cambios de color", build: () => pattern("Colores", [readDemoPart(fixtureAText(30, { stripes: true }), "cuerpo")], [YARN_A, YARN_B, YARN_C]) },
  { key: "ondula", label: "Pieza que ondula (aumentos de más)", build: () => pattern("Ondula", [readDemoPart(ruffleText(), "volado")], [YARN_D]) },
  { key: "muneco", label: "Muñeco armado (partes, copias y anclas)", build: doll },
  {
    key: "grande",
    label: "Escena sobre el límite recomendado (61.200 puntos)",
    build: () => pattern("Grande", [readDemoPart(fixtureAText(30, { copies: 34 }), "cuerpo")], [YARN_A, YARN_B, YARN_C]),
  },
  {
    key: "tope",
    label: "Escena sobre el tope del visor (270.000 puntos)",
    build: () =>
      pattern(
        "Tope",
        ["a", "b", "c"].map((id) => readDemoPart(fixtureAText(30, { name: `Cuerpo ${id.toUpperCase()}`, copies: 50 }), id)),
        [YARN_A, YARN_B, YARN_C],
      ),
  },
];

/**
 * Datos de la página, armados en el servidor: el cliente recibe documentos ya leídos, así el lector de texto
 * (`parsePart`) no entra en el JS del cliente ni en el fragmento compartido de `pattern-core`.
 */
export interface DemoData {
  demos: Array<{ key: string; label: string; pattern: WrittenPattern }>;
  fibers: Record<string, { label: string; composition: Yarn["composition"] }>;
  /** Fixture A con la meseta V11–30 y V11–31 ("editar una vuelta"). */
  editParts: { 30: Part; 31: Part };
}

export function demoData(): DemoData {
  return {
    demos: DEMOS.map((d) => ({ key: d.key, label: d.label, pattern: d.build() })),
    fibers: FIBER_SAMPLES,
    editParts: { 30: readDemoPart(fixtureAText(30), "cuerpo"), 31: readDemoPart(fixtureAText(31), "cuerpo") },
  };
}

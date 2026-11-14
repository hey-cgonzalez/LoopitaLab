/**
 * Fixtures A y B de los casos de dominio de la fase 4 (docs/casos-dominio-fase-4.md,
 * sección 6), escritos en la sintaxis de texto y leídos por el motor (`parsePart`).
 * Muestra de los fixtures: 20 puntos y 24 vueltas en 10 cm. Una sola lana (A), anillo
 * mágico, espiral; todas las vueltas declaran su conteo.
 */
import { SCHEMA_VERSION, parsePart, type Part, type WrittenPattern } from "../../src/index.ts";
import { yarnA } from "./fixtures.ts";

export const FIXTURE_GAUGE = Object.freeze({ stitchesPer10cm: 20, rowsPer10cm: 24 });

const head = (name: string) => `Parte: ${name}\nInicio: AM\nConstrucción: espiral\nLana: A`;
/** "pb 8" o nada si es 0. */
const sc = (n: number) => (n === 1 ? "pb" : `pb ${n}`);

/**
 * Fixture A, "cuerpo de 39 vueltas" (antes llamado esfera; F4-46): crece +6 por vuelta
 * hasta 60 (V1 a V10), meseta de 60 (V11 a `plateauEnd`) y cierra −6 por vuelta hasta 6.
 * Con la meseta por omisión (V11–30): 39 vueltas y 1.800 puntos (F4-45).
 */
export function fixtureAText(plateauEnd = 30): string {
  const lines = [head("Cuerpo"), "V1: 6 pb en AM (6)", "V2: aum x6 (12)"];
  for (let k = 3; k <= 10; k++) lines.push(`V${k}: [${sc(k - 2)}, aum] x6 (${6 * k})`);
  lines.push(`V11-${plateauEnd}: 60 pb (60)`);
  const close = plateauEnd + 9;
  for (let k = plateauEnd + 1; k < close; k++) {
    const before = close - k; // pb antes de cada dism: 8, 7, … 1
    lines.push(`V${k}: [${sc(before)}, dism] x6 (${6 * (before + 1)})`);
  }
  lines.push(`V${close}: dism x6 (6)`);
  return lines.join("\n");
}

/**
 * Conteos del fixture B (esfera de perfil, 36 vueltas): `n(Vi) = round(60·sen(π(i − 0,5)/36))`
 * con un mínimo de 6, simétricos. Los valores escritos en los casos de dominio.
 */
export const FIXTURE_B_COUNTS: readonly number[] = Object.freeze([
  6, 8, 13, 18, 23, 28, 32, 37, 41, 44, 48, 51, 53, 55, 57, 59, 59, 60,
  60, 59, 59, 57, 55, 53, 51, 48, 44, 41, 37, 32, 28, 23, 18, 13, 8, 6,
]);

/**
 * Fixture B escrito como indican los casos de dominio: si crece en `d`, `aum x d, pb
 * (anterior − d)`; si disminuye en `d`, `dism x d, pb (anterior − 2d)`; si no cambia, `n pb`.
 */
export function fixtureBText(): string {
  const lines = [head("Esfera"), "V1: 6 pb en AM (6)"];
  for (let i = 1; i < FIXTURE_B_COUNTS.length; i++) {
    const prev = FIXTURE_B_COUNTS[i - 1] as number;
    const n = FIXTURE_B_COUNTS[i] as number;
    const d = Math.abs(n - prev);
    let text: string;
    if (n > prev) text = [`aum x${d}`, prev - d > 0 ? `${prev - d} pb` : ""].filter(Boolean).join(", ");
    else if (n < prev) text = [`dism x${d}`, prev - 2 * d > 0 ? `${prev - 2 * d} pb` : ""].filter(Boolean).join(", ");
    else text = `${n} pb`;
    lines.push(`V${i + 1}: ${text} (${n})`);
  }
  return lines.join("\n");
}

function read(text: string, id: string): Part {
  const r = parsePart(text, { id });
  if (!r.ok) throw new Error(`El fixture ${id} no se lee: ${JSON.stringify(r.issues)}`);
  return r.value;
}

export function fixtureAPart(plateauEnd = 30): Part {
  return read(fixtureAText(plateauEnd), "cuerpo");
}

export function fixtureBPart(): Part {
  return read(fixtureBText(), "esfera");
}

export function writtenOf(parts: Part[], extra: Partial<WrittenPattern> = {}): WrittenPattern {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "p-amigurumi",
    title: "Amigurumi",
    technique: "crochet",
    kind: "written",
    yarns: [structuredClone(yarnA)],
    gauge: { ...FIXTURE_GAUGE },
    origin: { kind: "manual" },
    parts,
    ...extra,
  };
}

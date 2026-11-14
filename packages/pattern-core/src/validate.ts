/**
 * Validador del modelo canónico. Acepta cualquier valor (por ejemplo, JSON propuesto
 * por la IA), nunca lanza excepciones y devuelve problemas estructurados en español.
 */
import { floatLengthCm, rowFloats } from "./chart.ts";
import { yarnLetter } from "./letters.ts";
import { LIMITS } from "./limits.ts";
import { PROFILE_RADIAL_TOLERANCE, revolutionProfile, shapeMetrics, type GaugeStitch, type ShapeMetrics } from "./profile.ts";
import { STITCHES } from "./stitches.ts";
import {
  NO_STITCH,
  SCHEMA_VERSION,
  type Chart,
  type Gauge,
  type Issue,
  type Item,
  type Part,
  type Pattern,
  type Round,
  type Severity,
  type WeightCategory,
} from "./types.ts";
import { countRound, startAvailable } from "./written.ts";

export interface ValidateOptions {
  /** Fibras conocidas (de `yarn-catalog`). Si se entregan, se avisa de fibras desconocidas. */
  fibers?: ReadonlySet<string>;
  /** Identificadores de la paleta propia. */
  paletteIds?: ReadonlySet<string>;
  /**
   * Muestra supuesta (de `yarn-catalog`) cuando el documento no tiene `gauge`. Solo la
   * usa el validador (umbral de hebras flotantes); nunca se escribe en el documento.
   */
  assumedGauge?: Gauge;
  /**
   * Alternativa a `assumedGauge`: grosor CYC de la lana principal. El validador deriva
   * la muestra supuesta de la tabla del ADR 0003 sin depender de `yarn-catalog`.
   * Prioridad: `gauge` del documento, después `assumedGauge`, después `weightCat`.
   */
  weightCat?: WeightCategory;
  /**
   * Punto con que se midió `assumedGauge` en un patrón escrito (ADR 0010, enmienda C-3):
   * la aplicación traduce `assumption` de `suggestedGauge` (`"crochet-pb"` → `"sc"`,
   * `"crochet-pa"` → `"dc"`). Omitido, `"sc"`. Solo lo usan los avisos de forma
   * (`ROUND_GROWS_FAST`, `ROUND_SHRINKS_FAST`); la muestra del documento se lee como punto bajo.
   */
  assumedGaugeStitch?: GaugeStitch;
  /** Largo máximo de una hebra flotante en cm, cuando hay muestra (real o supuesta). Por defecto 2,5 cm. */
  maxFloatCm?: number;
  /**
   * Tope de la hebra flotante en puntos; se aplica siempre, haya o no muestra. Solo se
   * acepta un entero ≥ 1; cualquier otro valor usa el 5 por defecto (ADR 0003, E12).
   */
  maxFloatStitches?: number;
}

/*
 * Invariante de opciones (ADR 0003, E10): ninguna opción de `ValidateOptions` cambia el
 * conjunto de errores; solo agrega o ajusta advertencias e información. Así el cliente y
 * el servidor llegan al mismo `valid` y `savable` aunque pasen opciones distintas.
 */

export interface ValidationResult {
  /** true si no hay ningún error. Requisito para tejer, publicar, exportar y aceptar salida de IA. */
  valid: boolean;
  /** true si todos los errores son de tejido (o no hay errores). Requisito para guardar. `valid` implica `savable`. */
  savable: boolean;
  issues: Issue[];
}

/**
 * Errores de tejido: el documento es sano y se puede guardar como borrador, pero no
 * tejer, publicar, exportar ni aceptar de la IA (ADR 0003, E10). Lista cerrada: todo
 * código de error que no esté aquí es estructural y bloquea guardar.
 * - Gráfico: `CHART_EMPTY` y `CHART_ROW_EMPTY_FULL`.
 * - Patrón escrito (ADR 0011, sección 4): los errores de conteo y de numeración de vueltas.
 *   Una vuelta a medio escribir que no cuadra se guarda como borrador y se ve en 3D.
 */
export const DRAFT_ERROR_CODES: readonly string[] = Object.freeze([
  "CHART_EMPTY",
  "CHART_ROW_EMPTY_FULL",
  "ROUND_CONSUMPTION_MISMATCH",
  "ROUND_COUNT_MISMATCH",
  "ROUND_ZERO",
  "ROUND_RANGE_CHANGES",
  "ROUND_NUMBERING",
]);

/** true si el problema es un error de tejido (severidad "error" y código en `DRAFT_ERROR_CODES`). */
export function isDraftError(issue: Issue): boolean {
  return issue.severity === "error" && DRAFT_ERROR_CODES.includes(issue.code);
}

export { LIMITS };

/**
 * Puntos en 10 cm de la muestra supuesta por categoría CYC 0 a 7 (ADR 0003, sección 1):
 * punto medio del rango del Craft Yarn Council, en punto jersey. Es la misma tabla que
 * `suggestedGauge` de `yarn-catalog`; se copia para que el núcleo no dependa de él.
 */
const ASSUMED_STITCHES_PER_10CM: readonly number[] = [37, 30, 25, 23, 18, 14, 9, 6];

/**
 * Muestra supuesta de crochet por categoría CYC 0 a 7, para los avisos de forma de los
 * patrones escritos: la misma que da `suggestedGauge(cat, "crochet")` de `yarn-catalog`
 * (puntos, vueltas en 10 cm y punto de la muestra), copiada para no depender de él.
 * // validar con tejedora (las vueltas son un supuesto: 1,2 por punto en pb, 0,6 en pa)
 */
const ASSUMED_CROCHET_GAUGE: readonly { stitchesPer10cm: number; rowsPer10cm: number; stitch: GaugeStitch }[] = [
  { stitchesPer10cm: 37, rowsPer10cm: 22, stitch: "dc" },
  { stitchesPer10cm: 27, rowsPer10cm: 32, stitch: "sc" },
  { stitchesPer10cm: 18, rowsPer10cm: 22, stitch: "sc" },
  { stitchesPer10cm: 15, rowsPer10cm: 18, stitch: "sc" },
  { stitchesPer10cm: 13, rowsPer10cm: 16, stitch: "sc" },
  { stitchesPer10cm: 10, rowsPer10cm: 12, stitch: "sc" },
  { stitchesPer10cm: 8, rowsPer10cm: 10, stitch: "sc" },
  { stitchesPer10cm: 6, rowsPer10cm: 7, stitch: "sc" },
];

const YARN_ID_RE = /^[A-Za-z0-9_-]{1,16}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";
/** Largo en puntos de código, como `char_length` de Postgres (no unidades UTF-16). */
const charLength = (s: string) => [...s].length;
const LINE_BREAK_RE = /[\r\n\u2028\u2029]/;

/**
 * Texto libre (F5): debe ser texto (si no, `SHAPE`) y caber en `max` caracteres (si no,
 * `LIMIT`). `what` es el sujeto del mensaje, con mayúscula ("El cierre de Bolita").
 * Devuelve true si el texto es válido.
 */
function checkText(v: unknown, path: string, what: string, max: number, c: Collector, multiline = false): v is string {
  if (!isStr(v)) {
    c.error("SHAPE", path, `${what} debe ser texto.`);
    return false;
  }
  const length = charLength(v);
  if (length > max) {
    c.error("LIMIT", path, `${what} puede tener hasta ${max} caracteres (tiene ${length}).`, { length, max });
    return false;
  }
  return checkChars(v, path, what, multiline, c);
}

/*
 * Caracteres prohibidos en los textos (ADR 0003, E16): los de control `\p{Cc}` (U+0000 a
 * U+001F y U+007F a U+009F) y los sustitutos UTF-16 sueltos. Postgres rechaza U+0000 y los
 * sustitutos sueltos en jsonb; los demás controles no se ven y no tienen uso en un patrón.
 * En los textos de varias líneas (notas, cierre, armado, nota de lana) se admiten el salto
 * de línea (\n) y la tabulación (\t); en los demás (título, nombres, ids), ninguno.
 */
const CONTROL_RE = /\p{Cc}/u;
const CONTROL_MULTILINE_RE = /[^\P{Cc}\n\t]/u;
/** Primer sustituto suelto (alto sin bajo detrás, o bajo sin alto delante). */
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const codePointLabel = (n: number) => `U+${n.toString(16).toUpperCase().padStart(4, "0")}`;

/** TEXT_CONTROL_CHAR si el texto tiene un carácter prohibido. Devuelve true si está limpio. */
function checkChars(v: string, path: string, what: string, multiline: boolean, c: Collector): boolean {
  const control = (multiline ? CONTROL_MULTILINE_RE : CONTROL_RE).exec(v);
  if (control) {
    const codePoint = codePointLabel(control[0].codePointAt(0) ?? 0);
    const hint = multiline ? " Solo se admiten saltos de línea y tabulaciones." : "";
    c.error("TEXT_CONTROL_CHAR", path, `${what} tiene un carácter invisible no permitido (${codePoint}).${hint}`, { codePoint, index: control.index });
    return false;
  }
  // Sin `String.prototype.isWellFormed` (ES2024): el núcleo apunta a navegadores anteriores.
  const lone = LONE_SURROGATE_RE.exec(v);
  if (lone) {
    const codePoint = codePointLabel(lone[0].charCodeAt(0));
    c.error("TEXT_CONTROL_CHAR", path, `${what} tiene un carácter dañado que no se puede guardar (${codePoint}, sustituto suelto).`, { codePoint, index: lone.index, surrogate: true });
    return false;
  }
  return true;
}

/*
 * Documento cerrado (ADR 0003, E16): cada objeto del esquema (v2) solo admite sus claves,
 * incluidas las opcionales. Una clave desconocida es error estructural UNKNOWN_KEY con
 * su ruta. Una versión futura del esquema que agregue campos los declara aquí.
 */
const KEYS_BASE = ["schemaVersion", "id", "title", "technique", "yarns", "gauge", "origin", "notes", "kind"] as const;
const SCHEMA_KEYS = Object.freeze({
  chartPattern: Object.freeze([...KEYS_BASE, "chart"]),
  writtenPattern: Object.freeze([...KEYS_BASE, "parts", "assembly", "layout"]),
  chart: Object.freeze(["width", "height", "cells", "repeat", "workedIn", "renderAs", "direction"]),
  repeat: Object.freeze(["x", "y"]),
  gauge: Object.freeze(["stitchesPer10cm", "rowsPer10cm"]),
  origin: Object.freeze(["kind", "model", "promptVersion"]),
  yarn: Object.freeze(["id", "weight", "composition", "color", "note"]),
  yarnColor: Object.freeze(["hex", "paletteId"]),
  fiberShare: Object.freeze(["fiber", "percent"]),
  // Sin `stuffing` en la v2 (ADR 0011, enmienda C-13): esa clave es UNKNOWN_KEY.
  part: Object.freeze(["id", "name", "construction", "start", "startYarn", "rounds", "finish", "copies"]),
  startMagicRing: Object.freeze(["type"]),
  startChain: Object.freeze(["type", "count"]),
  round: Object.freeze(["number", "through", "items", "expected", "note"]),
  stitchItem: Object.freeze(["type", "stitch", "count", "loop"]),
  groupItem: Object.freeze(["type", "items", "times"]),
  colorItem: Object.freeze(["type", "yarn"]),
  // v2: posición de las partes (ADR 0011, secciones 2 y 3).
  layout: Object.freeze(["placements"]),
  placement: Object.freeze(["target", "at"]),
  partRef: Object.freeze(["part", "copy"]),
  freeAt: Object.freeze(["type", "positionCm", "rotationDeg"]),
  surfaceAt: Object.freeze(["type", "host", "round", "stitch", "attach", "rotationDeg", "offsetCm"]),
} as const satisfies Record<string, readonly string[]>);

/** Tope de avisos UNKNOWN_KEY por documento: un objeto con miles de claves no llena la lista. */
const MAX_UNKNOWN_KEY_ISSUES = 20;

/** Ruta de una clave: `padre.clave`, con la clave recortada y sin caracteres prohibidos. */
const keyPath = (parent: string, key: string) => (parent ? `${parent}.${clip(key)}` : clip(key));

function checkKeys(obj: Rec, allowed: readonly string[], path: string, c: Collector): void {
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) continue;
    c.unknownKeys++;
    if (c.unknownKeys > MAX_UNKNOWN_KEY_ISSUES) return;
    const shown = clip(key);
    c.error("UNKNOWN_KEY", keyPath(path, key), `El patrón tiene un dato que no corresponde ("${shown}"${path ? ` en ${path}` : ""}): quítalo para poder guardarlo.`, { key: shown });
  }
}

/** Lista de textos libres (`notes`, `assembly`): un arreglo de hasta `LIMITS.maxNotes` textos. */
function checkTextList(v: unknown, path: string, what: string, item: (i: number) => string, c: Collector): void {
  if (!Array.isArray(v)) {
    c.error("SHAPE", path, `${what} deben ser una lista de textos.`);
    return;
  }
  if (v.length > LIMITS.maxNotes) {
    c.error("LIMIT", path, `${what} pueden tener hasta ${LIMITS.maxNotes} elementos (hay ${v.length}).`, { length: v.length, max: LIMITS.maxNotes });
    return;
  }
  v.forEach((t: unknown, i: number) => checkText(t, `${path}[${i}]`, item(i), LIMITS.maxNoteLength, c, true));
}

class Collector {
  issues: Issue[] = [];
  /** Claves desconocidas encontradas (se informan hasta `MAX_UNKNOWN_KEY_ISSUES`). */
  unknownKeys = 0;
  add(severity: Severity, code: string, path: string, message: string, data?: Record<string, unknown>): void {
    this.issues.push(data ? { code, severity, path, message, data } : { code, severity, path, message });
  }
  error(code: string, path: string, message: string, data?: Record<string, unknown>) {
    this.add("error", code, path, message, data);
  }
  warn(code: string, path: string, message: string, data?: Record<string, unknown>) {
    this.add("warning", code, path, message, data);
  }
  info(code: string, path: string, message: string, data?: Record<string, unknown>) {
    this.add("info", code, path, message, data);
  }
}

export function validatePattern(input: unknown, opts: ValidateOptions = {}): ValidationResult {
  const c = new Collector();
  try {
    validateInto(input, c, opts);
  } catch {
    // Solo con objetos armados a mano (getters o Proxy que lanzan); JSON.parse no los produce.
    c.error("SHAPE", "", "El patrón no se pudo leer.");
  }
  const errors = c.issues.filter((i) => i.severity === "error");
  return { valid: errors.length === 0, savable: errors.every(isDraftError), issues: c.issues };
}

function validateInto(input: unknown, c: Collector, opts: ValidateOptions): void {
  if (!isRec(input)) {
    c.error("SHAPE", "", "El patrón debe ser un objeto.");
    return;
  }
  // Con un `kind` desconocido (ya es error KIND) se aceptan las claves de los dos tipos.
  const rootKeys = input.kind === "chart" ? SCHEMA_KEYS.chartPattern : input.kind === "written" ? SCHEMA_KEYS.writtenPattern : [...SCHEMA_KEYS.chartPattern, "parts", "assembly", "layout"];
  checkKeys(input, rootKeys, "", c);
  if (input.schemaVersion !== SCHEMA_VERSION) {
    c.error("SCHEMA_VERSION", "schemaVersion", `Versión de esquema no soportada (se esperaba ${SCHEMA_VERSION}).`, { found: input.schemaVersion });
  }
  if (!isStr(input.id) || input.id.trim() === "") c.error("ID_MISSING", "id", "El patrón no tiene identificador.");
  else checkText(input.id, "id", "El identificador del patrón", LIMITS.maxIdLength, c);
  if (!isStr(input.title)) c.error("SHAPE", "title", "El título debe ser texto.");
  else {
    // `char_length` de Postgres cuenta puntos de código, no unidades UTF-16.
    const length = charLength(input.title);
    if (length < 1 || length > LIMITS.maxTitleLength) {
      c.error("TITLE_LENGTH", "title", `El título debe tener entre 1 y ${LIMITS.maxTitleLength} caracteres (tiene ${length}).`, { length, max: LIMITS.maxTitleLength });
    } else checkChars(input.title, "title", "El título", false, c);
  }
  if (input.technique !== "knit" && input.technique !== "crochet") {
    c.error("TECHNIQUE", "technique", 'La técnica debe ser "knit" (palillo) o "crochet".');
  }
  validateOrigin(input.origin, c);
  if (input.gauge !== undefined) validateGauge(input.gauge, c);
  if (input.notes !== undefined) checkTextList(input.notes, "notes", "Las notas del patrón", (i) => `La nota ${i + 1} del patrón`, c);
  const yarnIds = validateYarns(input.yarns, c, opts);

  if (input.kind === "chart") validateChart(input, yarnIds, c, opts);
  else if (input.kind === "written") {
    const parts = validateWritten(input, yarnIds, c, writtenShapeMetrics(input.gauge, opts));
    if (input.layout !== undefined) validateLayout(input.layout, parts, c);
  }
  else c.error("KIND", "kind", 'El tipo de patrón debe ser "chart" (gráfico) o "written" (escrito).');
}

/** Atajo: valida y, si no hay errores, devuelve el patrón tipado. */
export function parsePattern(input: unknown, opts: ValidateOptions = {}): { ok: true; pattern: Pattern; issues: Issue[] } | { ok: false; issues: Issue[] } {
  const r = validatePattern(input, opts);
  return r.valid ? { ok: true, pattern: input as Pattern, issues: r.issues } : { ok: false, issues: r.issues };
}

function validateOrigin(origin: unknown, c: Collector) {
  if (!isRec(origin) || !["manual", "ai", "ai_edited"].includes(origin.kind as string)) {
    c.error("ORIGIN", "origin", 'El origen debe ser "manual", "ai" o "ai_edited".');
    if (isRec(origin)) checkKeys(origin, SCHEMA_KEYS.origin, "origin", c);
    return;
  }
  checkKeys(origin, SCHEMA_KEYS.origin, "origin", c);
  // El tipo se revisa con cualquier origen; la falta del modelo solo avisa si viene de IA.
  if (origin.model !== undefined) checkText(origin.model, "origin.model", "El modelo de IA del origen", LIMITS.maxOriginFieldLength, c);
  if (origin.promptVersion !== undefined) {
    checkText(origin.promptVersion, "origin.promptVersion", "La versión de las instrucciones de IA del origen", LIMITS.maxOriginFieldLength, c);
  }
  if (origin.kind !== "manual" && (origin.model === undefined || origin.model === "")) {
    c.warn("ORIGIN_AI_MODEL", "origin.model", "El patrón viene de IA pero no registra qué modelo lo generó.");
  }
}

const isGauge = (g: unknown): g is Gauge =>
  isRec(g) && isNum(g.stitchesPer10cm) && isNum(g.rowsPer10cm) && g.stitchesPer10cm > 0 && g.rowsPer10cm > 0;

function validateGauge(g: unknown, c: Collector) {
  if (isRec(g)) checkKeys(g, SCHEMA_KEYS.gauge, "gauge", c);
  if (!isGauge(g)) c.error("GAUGE", "gauge", "La muestra debe indicar puntos y filas en 10 cm, mayores que cero.");
}

function validateYarns(yarns: unknown, c: Collector, opts: ValidateOptions): string[] {
  if (!Array.isArray(yarns) || yarns.length === 0) {
    c.error("YARNS_EMPTY", "yarns", "El patrón necesita al menos una lana.");
    return [];
  }
  if (yarns.length > LIMITS.maxYarns) {
    c.error("LIMIT", "yarns", `Máximo ${LIMITS.maxYarns} lanas por patrón.`);
    return [];
  }
  const ids: string[] = [];
  yarns.forEach((y, i) => {
    const p = `yarns[${i}]`;
    const id = checkYarn(y, p, `${i + 1}`, c, opts);
    if (YARN_ID_RE.test(id) && ids.includes(id)) c.error("YARN_DUPLICATE_ID", `${p}.id`, `El identificador de lana "${id}" está repetido.`);
    ids.push(id);
  });
  return ids;
}

/**
 * Revisa una lana suelta con las mismas reglas de `validatePattern` (ADR 0003, E9), para
 * que el formulario de lana explique el problema. `path` prefija las rutas de los
 * `Issue` (por defecto "yarn"). No revisa el identificador repetido ni el tope de
 * lanas: eso depende del patrón (`pattern.yarns` y `EDIT_LIMITS.maxYarns`).
 * `opts` es opcional: con `fibers` o `paletteIds` también avisa fibras o colores
 * desconocidos (solo agrega advertencias, ADR 0003, E11).
 */
export function validateYarn(input: unknown, path = "yarn", opts: Pick<ValidateOptions, "fibers" | "paletteIds"> = {}): Issue[] {
  const c = new Collector();
  try {
    checkYarn(input, path, "", c, opts);
  } catch {
    c.error("SHAPE", path, "La lana no se pudo leer.");
  }
  return c.issues;
}

/** Reglas de una lana. Devuelve su identificador tal como viene ("" si no es texto). `label` es el número de la lana, o "" si va suelta. */
function checkYarn(y: unknown, p: string, label: string, c: Collector, opts: Pick<ValidateOptions, "fibers" | "paletteIds">): string {
  const named = (s: string) => (s ? `La lana ${s}` : "La lana");
  if (!isRec(y)) {
    c.error("SHAPE", p, "Cada lana debe ser un objeto.");
    return "";
  }
  checkKeys(y, SCHEMA_KEYS.yarn, p, c);
  const id = isStr(y.id) ? y.id : "";
  if (!YARN_ID_RE.test(id)) c.error("YARN_ID", `${p}.id`, `${named(label)} necesita un identificador corto (letras, números, "-" o "_").`);
  // Un id inválido (ya es YARN_ID) no se cita: puede traer caracteres de control o ser enorme.
  const name = named(YARN_ID_RE.test(id) ? id : label);

  if (!isInt(y.weight) || y.weight < 0 || y.weight > 7) {
    c.error("YARN_WEIGHT", `${p}.weight`, `${name} necesita un grosor entre 0 (Ultra Fino) y 7 (Jumbo).`);
  }

  const lower = name.replace(/^La lana/, "la lana");
  if (!Array.isArray(y.composition) || y.composition.length === 0) {
    c.error("YARN_COMPOSITION_EMPTY", `${p}.composition`, `${name} necesita su composición (por ejemplo, 100 % lana).`);
  } else {
    let sum = 0;
    const seen = new Set<string>();
    y.composition.forEach((f: unknown, j: number) => {
      const fp = `${p}.composition[${j}]`;
      if (isRec(f)) checkKeys(f, SCHEMA_KEYS.fiberShare, fp, c);
      if (!isRec(f) || !isStr(f.fiber) || !isNum(f.percent)) {
        c.error("SHAPE", fp, "Cada fibra necesita su nombre y su porcentaje.");
        return;
      }
      checkText(f.fiber, `${fp}.fiber`, `El nombre de una fibra de ${lower}`, LIMITS.maxIdLength, c);
      if (f.percent <= 0 || f.percent > 100) c.error("YARN_PERCENT", fp, `El porcentaje de ${clip(f.fiber)} debe estar entre 0 y 100.`);
      sum += f.percent;
      if (seen.has(f.fiber)) c.warn("YARN_FIBER_DUPLICATE", fp, `La fibra ${clip(f.fiber)} aparece dos veces en ${lower}.`);
      seen.add(f.fiber);
      if (opts.fibers && !opts.fibers.has(f.fiber)) c.warn("YARN_FIBER_UNKNOWN", fp, `No conozco la fibra "${clip(f.fiber)}".`);
    });
    // Una suma no finita (porcentajes desmedidos) ya tiene su YARN_PERCENT; no se repite.
    if (Number.isFinite(sum) && Math.abs(sum - 100) > 0.01) {
      c.error("YARN_COMPOSITION_SUM", `${p}.composition`, `La composición de ${lower} suma ${round2(sum)} % y debe sumar 100 %.`, { sum });
    }
  }

  if (isRec(y.color)) checkKeys(y.color, SCHEMA_KEYS.yarnColor, `${p}.color`, c);
  if (!isRec(y.color) || !isStr(y.color.hex) || !HEX_RE.test(y.color.hex)) {
    c.error("YARN_COLOR", `${p}.color`, `${name} necesita un color en formato #RRGGBB.`);
  } else if (y.color.paletteId !== undefined) {
    // El tipo se revisa siempre (error); la pertenencia a la paleta solo con opciones (advertencia).
    if (!isStr(y.color.paletteId)) {
      c.error("SHAPE", `${p}.color.paletteId`, `El color de ${lower} indica la paleta con un valor que no es texto.`);
    } else if (checkText(y.color.paletteId, `${p}.color.paletteId`, `El color de paleta de ${lower}`, LIMITS.maxIdLength, c) && opts.paletteIds && !opts.paletteIds.has(y.color.paletteId)) {
      c.warn("YARN_PALETTE_UNKNOWN", `${p}.color.paletteId`, `El color "${clip(y.color.paletteId)}" no está en la paleta.`);
    }
  }
  // Texto privado: se revisa su forma, pero nunca se cita en un mensaje.
  if (y.note !== undefined) checkText(y.note, `${p}.note`, `La nota de ${lower}`, LIMITS.maxYarnNoteLength, c, true);
  return id;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Recorta un texto de la usuaria o de la IA antes de ponerlo en un mensaje. */
const clip = (s: string, max = 40) => {
  // Sin caracteres de control ni sustitutos sueltos: el mensaje nunca los arrastra (E16).
  // Al separar por puntos de código, un sustituto suelto queda solo y mide 1 unidad UTF-16.
  const chars = [...s].map((ch) => (/^\p{Cc}$/u.test(ch) || (ch.length === 1 && /[\uD800-\uDFFF]/.test(ch)) ? "\uFFFD" : ch));
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
};
/** Número con coma decimal y a lo más un decimal, sin depender de la configuración regional. */
const fmt1 = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

// ------------------------------------------------------------------ Gráfico

/** "vuelta" en redondo y "fila" de ida y vuelta (glosario pendiente del roadmap). */
const rowWord = (workedIn: unknown) => (workedIn === "rows" ? "fila" : "vuelta");

/** Muestra que usa el umbral de hebras flotantes: del documento, supuesta o ninguna. */
function floatGauge(docGauge: unknown, opts: ValidateOptions): { stitchesPer10cm: number; source: "document" | "assumed" | "weight" } | null {
  if (isGauge(docGauge)) return { stitchesPer10cm: docGauge.stitchesPer10cm, source: "document" };
  if (isGauge(opts.assumedGauge)) return { stitchesPer10cm: opts.assumedGauge.stitchesPer10cm, source: "assumed" };
  const cat = opts.weightCat;
  if (isInt(cat) && cat >= 0 && cat <= 7) return { stitchesPer10cm: ASSUMED_STITCHES_PER_10CM[cat] as number, source: "weight" };
  return null;
}

function validateChart(input: Rec, yarnIds: string[], c: Collector, opts: ValidateOptions) {
  const ch = input.chart;
  if (!isRec(ch)) {
    c.error("SHAPE", "chart", "Falta el gráfico.");
    return;
  }
  checkKeys(ch, SCHEMA_KEYS.chart, "chart", c);
  if (isRec(ch.repeat)) checkKeys(ch.repeat, SCHEMA_KEYS.repeat, "chart.repeat", c);
  const { width, height, cells, repeat } = ch;
  const word = rowWord(ch.workedIn);
  let ok = true;
  let tooLarge = false;
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1) {
    c.error("CHART_SIZE", "chart", "El ancho y el alto del motivo deben ser enteros de 1 o más.");
    ok = false;
  } else if (width > LIMITS.maxMotifSide || height > LIMITS.maxMotifSide) {
    c.error("CHART_MOTIF_TOO_LARGE", "chart", `El motivo puede medir hasta ${LIMITS.maxMotifSide} × ${LIMITS.maxMotifSide} casillas; el tuyo mide ${width} × ${height}.`, {
      width,
      height,
      max: LIMITS.maxMotifSide,
    });
    ok = false;
    tooLarge = true;
  } else if (width * height > LIMITS.maxCells) {
    // Protección general; con el lado limitado a 200 hoy no se alcanza.
    c.error("LIMIT", "chart", `El motivo no puede superar ${LIMITS.maxCells.toLocaleString("es-CL")} casillas.`);
    ok = false;
  }
  if (!isRec(repeat) || !isInt(repeat.x) || !isInt(repeat.y) || repeat.x < 1 || repeat.y < 1) {
    c.error("CHART_REPEAT", "chart.repeat", "Las repeticiones deben ser enteros de 1 o más.");
    ok = false;
  } else if (repeat.x > LIMITS.maxRepeat || repeat.y > LIMITS.maxRepeat) {
    c.error("LIMIT", "chart.repeat", `Máximo ${LIMITS.maxRepeat} repeticiones por eje.`);
    ok = false;
  }
  if (ch.workedIn !== "rounds" && ch.workedIn !== "rows") {
    c.error("CHART_WORKED_IN", "chart.workedIn", "Indica si el gráfico se teje en redondo (vueltas) o de ida y vuelta (filas).");
    ok = false;
  }
  if (!["flat", "tube", "circle", "yoke"].includes(ch.renderAs as string)) {
    c.error("CHART_RENDER", "chart.renderAs", "Forma de vista desconocida. Elige plano, tubo, círculo o canesú.");
    ok = false;
  }
  if (ch.direction !== "bottom_up" && ch.direction !== "top_down") {
    c.error("CHART_DIRECTION", "chart.direction", "Indica si se teje de abajo hacia arriba o de arriba hacia abajo.");
    ok = false;
  }
  // Un motivo demasiado grande se informa por su tamaño, sin recorrer sus casillas (E6, E7).
  if (tooLarge) return;
  if (!Array.isArray(cells) || !isInt(width) || !isInt(height) || cells.length !== width * height) {
    c.error("CHART_CELLS_LENGTH", "chart.cells", "La cantidad de casillas no coincide con ancho × alto.");
    return;
  }

  const yarnCount = yarnIds.length;
  let bad = 0;
  let firstBad = -1;
  const used = new Array<boolean>(yarnCount).fill(false);
  let stitches = 0;
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (!isInt(v) || v < NO_STITCH || v >= yarnCount) {
      bad++;
      if (firstBad < 0) firstBad = i;
    } else if (v !== NO_STITCH) {
      used[v] = true;
      stitches++;
    }
  }
  if (bad > 0) {
    // Casilla contada desde la derecha, como en los gráficos de tejido (ADR 0003, E18); `data.x` sigue
    // siendo el índice del modelo (x = 0 a la izquierda visto por el derecho).
    const x = firstBad % width;
    const y = Math.floor(firstBad / width);
    c.error("CHART_CELL_VALUE", `chart.cells[${firstBad}]`, `Hay ${bad} casilla${bad === 1 ? "" : "s"} con una lana que no existe en la paleta; la primera está en la ${word} ${y + 1}, casilla ${width - x}.`, { count: bad, x, y });
    return;
  }
  if (stitches === 0) {
    c.error("CHART_EMPTY", "chart.cells", "El gráfico no tiene ningún punto.");
    return;
  }
  used.forEach((u, i) => {
    if (!u) c.info("YARN_UNUSED", `yarns[${i}]`, `${capitalize(yarnLabel(input.yarns, i))} no se usa en el gráfico.`);
  });
  mixedWeights(input.yarns, c);
  if (!ok) return;

  const chart = ch as unknown as Chart;
  const W = width;
  const H = height;
  const R = chart.repeat.x;
  const RY = chart.repeat.y;

  // Puntos por fila del motivo y total de la vuelta completa (repeat.x veces).
  const perWedge = new Array<number>(H);
  let masked = false;
  for (let my = 0; my < H; my++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (cells[my * W + x] !== NO_STITCH) n++;
    perWedge[my] = n;
    if (n < W) masked = true;
  }
  const total = (my: number) => (perWedge[my] ?? 0) * R;

  // Forma de vista y forma de trabajo.
  if (chart.renderAs === "yoke") {
    c.info("CHART_RENDER_UNSUPPORTED", "chart.renderAs", "La vista de canesú todavía no está disponible: la vista previa lo dibuja como tubo.");
  }
  if ((chart.renderAs === "tube" || chart.renderAs === "circle") && chart.workedIn === "rows") {
    c.warn(
      "CHART_ROWS_SHAPE",
      "chart.workedIn",
      chart.renderAs === "circle"
        ? "La vista es de círculo, pero el gráfico se teje de ida y vuelta: la pieza queda abierta y hay que coserla para cerrar el círculo."
        : "La vista es de tubo, pero el gráfico se teje de ida y vuelta: la pieza queda abierta y hay que coserla.",
      { renderAs: chart.renderAs },
    );
  }

  // Filas sin puntos (error de tejido, ADR 0003, E10). Una fila del gráfico completo está
  // vacía si y solo si lo está su fila del motivo, así que se informa una sola vez, con las
  // filas del gráfico completo (`rows`, hasta 50) y las del motivo (`motifRows`) para que
  // la interfaz las resalte. Desde T2d no se emite además CHART_EMPTY_ROW por cada fila del
  // motivo: la tejedora ve un solo aviso por la misma causa.
  const emptyMotif: number[] = [];
  for (let my = 0; my < H; my++) if (perWedge[my] === 0) emptyMotif.push(my);
  if (emptyMotif.length > 0) {
    const count = emptyMotif.length * RY;
    const rows: number[] = [];
    for (let ry = 0; ry < RY && rows.length < 50; ry++) for (const my of emptyMotif) if (rows.length < 50) rows.push(ry * H + my);
    c.error(
      "CHART_ROW_EMPTY_FULL",
      "chart.cells",
      `El gráfico completo tiene ${count} ${word}${count === 1 ? "" : "s"} sin puntos (la primera es la ${(rows[0] ?? 0) + 1}). Una ${word} sin puntos no se puede tejer: pinta al menos una casilla en ella o quita esa ${word}.`,
      { count, rows, motifRows: emptyMotif.slice(0, 50) },
    );
  }

  // Forma: cambios de puntos entre vueltas seguidas (ADR 0005). Las vueltas internas del
  // motivo se repiten igual en cada repetición vertical: se revisan una vez, más el borde
  // entre la última fila del motivo y la primera de la repetición siguiente.
  const circle = chart.renderAs === "circle";
  const transitions: Array<{ row: number; from: number; to: number }> = [];
  for (let my = 1; my < H; my++) transitions.push({ row: my, from: total(my - 1), to: total(my) });
  if (RY > 1) transitions.push({ row: H, from: total(H - 1), to: total(0) });
  for (const { row, from, to } of transitions) {
    // Las filas sin puntos ya son error (CHART_ROW_EMPTY_FULL); no se mide la forma contra ellas.
    if (from === 0 || to === 0 || from === to) continue;
    const n = row + 1;
    const data = { row, from, to, perRepeat: (to - from) / R };
    if (to < from) {
      const third = Math.ceil(from / 3);
      const half = Math.ceil(from / 2);
      if (to < third) {
        // Advertencia (ADR 0003, E10): se puede tejer cerrando puntos, dejándolos en espera,
        // tejiendo 4 o más juntos o pasando la hebra; solo disminuyendo de a 2 o 3, no.
        c.warn(
          "CHART_SHAPING_IMPOSSIBLE",
          "chart.cells",
          `En la ${word} ${n} se pasa de ${from} a ${to} puntos: disminuyendo de a 2 o 3 juntos quedan como mínimo ${third}. Para llegar a ${to} hay que cerrar puntos, dejarlos en espera, tejer 4 o más juntos o pasar la hebra por todos.`,
          { ...data, min: third },
        );
      } else if (to < half) {
        c.warn(
          "CHART_SHAPING_TOO_FAST",
          "chart.cells",
          `En la ${word} ${n} se pasa de ${from} a ${to} puntos: se pierde más de la mitad en una sola ${word}, lo que exige disminuir de a 3 juntos o más y la tela se frunce. Conviene repartir las disminuciones en más ${word}s.`,
          { ...data, min: half },
        );
      }
    } else if (to > from * 2) {
      c.warn(
        "CHART_SHAPING_TOO_FAST",
        "chart.cells",
        `En la ${word} ${n} se pasa de ${from} a ${to} puntos: más del doble en una sola ${word}. Conviene repartir los aumentos en más ${word}s.`,
        { ...data, max: from * 2 },
      );
    }
    if (!circle) continue;
    const per = Math.abs(to - from) / R;
    if (per > 2) {
      c.warn(
        "CHART_SHAPING_STEEP",
        "chart.cells",
        `En la ${word} ${n} se ${to < from ? "pierden" : "ganan"} ${per} puntos por repetición; con más de 2 por repetición en una ${word} el círculo se deforma. Conviene repartirlos en más ${word}s.`,
        data,
      );
    }
    if (chart.direction === "bottom_up" && to > from) {
      c.warn(
        "CHART_SHAPING_UNEXPECTED",
        "chart.cells",
        `En la ${word} ${n} hay aumentos (de ${from} a ${to} puntos), pero el círculo se teje desde el borde hacia el centro, donde se disminuye. Revisa la dirección si no es a propósito (por ejemplo, después de un elástico).`,
        data,
      );
    } else if (chart.direction === "top_down" && to < from) {
      c.warn(
        "CHART_SHAPING_UNEXPECTED",
        "chart.cells",
        `En la ${word} ${n} hay disminuciones (de ${from} a ${to} puntos), pero el círculo se teje desde el centro hacia afuera, donde se aumenta. Revisa la dirección si no es a propósito.`,
        data,
      );
    }
  }

  // Reglas propias del círculo (ADR 0005).
  if (circle) {
    if (R < 4 || R > 12) {
      // validar con tejedora
      c.info("CHART_CIRCLE_REPEATS", "chart.repeat.x", `El círculo tiene ${R} cuña${R === 1 ? "" : "s"}; lo habitual es de 4 a 12 (6, 8, 10 y 12 son comunes).`, { repeat: R, min: 4, max: 12 });
    }
    const widest = Math.max(...perWedge);
    if (widest < 4) {
      // validar con tejedora
      c.info("CHART_WEDGE_TOO_NARROW", "chart", `Cada cuña tiene como máximo ${widest} punto${widest === 1 ? "" : "s"}: queda poco espacio para un dibujo (lo habitual es 4 o más).`, { max: widest, min: 4 });
    }
    if (RY > 1 && masked) {
      c.warn(
        "CHART_CIRCLE_REPEAT_Y",
        "chart.repeat.y",
        `El motivo tiene casillas sin punto y se repite ${RY} veces hacia arriba: en un círculo, cada repetición vuelve a empezar desde la base de la cuña y el círculo se abre otra vez. Si buscas una copa más alta, agranda el motivo en vez de repetirlo.`,
        { repeat: RY },
      );
    }
    // Se mide contra la última (o primera) vuelta CON puntos: una fila vacía en el borde ya
    // es error (CHART_ROW_EMPTY_FULL) y no debe silenciar el aviso del cierre o del comienzo.
    // Con repeat.y > 1 la última vuelta del gráfico completo es la última fila del motivo.
    if (chart.direction === "bottom_up") {
      let my = H - 1;
      while (my > 0 && perWedge[my] === 0) my--;
      const last = total(my);
      if (last > 16) {
        c.add(
          last > 24 ? "warning" : "info",
          "CHART_CIRCLE_NOT_CLOSED",
          "chart.cells",
          `La última ${word} deja ${last} puntos. Lo habitual es cerrar con 8 a 16 puntos pasando la hebra por todos; con ${last} puntos el cierre queda abultado.`,
          { stitches: last, info: 16, warning: 24 },
        );
      }
    } else {
      let my = 0;
      while (my < H - 1 && perWedge[my] === 0) my++;
      const first = total(my);
      if (first > 0 && (first < 4 || first > 16)) {
        const usual = input.technique === "crochet" ? "en crochet se suele empezar con un anillo mágico de 6 a 12 puntos" : "en palillo se suele empezar con un montaje inicial de 8 a 12 puntos";
        c.info("CHART_CIRCLE_START", "chart.cells", `La primera ${word} tiene ${first} puntos; ${usual}.`, { stitches: first, min: 4, max: 16 });
      }
    }
  }

  // Hebras flotantes: solo en palillo (colorwork de hebras). En crochet tapestry la hebra va por dentro.
  if (input.technique === "knit") {
    const g = floatGauge(input.gauge, opts);
    const cap = isInt(opts.maxFloatStitches) && opts.maxFloatStitches >= 1 ? opts.maxFloatStitches : 5;
    const maxCm = isNum(opts.maxFloatCm) && opts.maxFloatCm > 0 ? opts.maxFloatCm : 2.5;
    // max(1, min(floor(2,5 cm × puntos en 10 cm / 10), 5)). El 1e-9 evita que 4,9999… redondee
    // a 4; el mínimo de 1 evita que con una muestra muy gruesa toda hebra avise.
    const maxStitches = Math.max(1, g ? Math.min(Math.floor((maxCm * g.stitchesPer10cm) / 10 + 1e-9), cap) : cap);
    const assumed = g !== null && g.source !== "document";
    for (let y = 0; y < H; y++) {
      const floats = rowFloats(chart, y);
      if (floats.length > 2) {
        c.info("CHART_COLORS_PER_ROW", "chart.cells", `La ${word} ${y + 1} usa ${floats.length} lanas; en colorwork de hebras lo habitual es 2 por ${word}.`, { row: y, colors: floats.length });
      }
      const worst = floats.reduce<(typeof floats)[number] | undefined>((a, f) => (!a || f.length > a.length ? f : a), undefined);
      if (worst && worst.length > maxStitches) {
        // `rowsPer10cm: 1` es relleno para cumplir el tipo `Gauge`: el largo de la hebra solo
        // depende de los puntos en 10 cm. No es un dato de muestra.
        const cm = g ? ` (≈${fmt1(floatLengthCm(worst.length, { stitchesPer10cm: g.stitchesPer10cm, rowsPer10cm: 1 }))} cm${assumed ? " con la muestra supuesta" : ""})` : "";
        c.warn(
          "CHART_FLOAT_LONG",
          "chart.cells",
          `En la ${word} ${y + 1}, la hebra flotante de ${yarnLabel(input.yarns, worst.yarn)} mide ${worst.length} puntos${cm}. Conviene enganchar la hebra o cambiar el dibujo (máximo sugerido: ${maxStitches} puntos).`,
          { row: y, yarn: worst.yarn, length: worst.length, max: maxStitches, gauge: g ? g.source : "none" },
        );
      }
    }
  }
}

/**
 * Nombre de una lana para la tejedora: letra según su orden en el documento
 * (`yarnLetter`: A, B, C…; desde la 27, AA, AB…) y su color, como la muestra la paleta del diseño. No usa el
 * identificador interno ni la nota (texto privado: los avisos también acompañan a los
 * patrones compartidos).
 */
function yarnLabel(yarns: unknown, index: number): string {
  const letter = yarnLetter(index);
  const y = Array.isArray(yarns) ? yarns[index] : undefined;
  const hex = isRec(y) && isRec(y.color) && isStr(y.color.hex) && HEX_RE.test(y.color.hex) ? ` (${y.color.hex.toUpperCase()})` : "";
  return `la lana ${letter}${hex}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** YARNS_MIXED_WEIGHT: las lanas del diseño tienen distinto grosor CYC. */
function mixedWeights(yarns: unknown, c: Collector) {
  if (!Array.isArray(yarns)) return;
  const weights = new Set<number>();
  for (const y of yarns) if (isRec(y) && isInt(y.weight) && y.weight >= 0 && y.weight <= 7) weights.add(y.weight);
  if (weights.size < 2) return;
  const list = [...weights].sort((a, b) => a - b);
  c.info(
    "YARNS_MIXED_WEIGHT",
    "yarns",
    `Las lanas tienen grosores distintos (categorías ${list.join(", ")}); en colorwork conviene usar el mismo grosor para que la tela quede pareja.`,
    { weights: list },
  );
}

// ------------------------------------------------------------ Patrón escrito

/** "fila" en partes de ida y vuelta (`flat`) y "vuelta" en espiral o en vueltas unidas. */
const partRowWord = (construction: unknown) => (construction === "flat" ? "fila" : "vuelta");
/** "1 punto", "3 puntos": la palabra en singular o plural (las de este archivo forman el plural con "s"). */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** "1 vez", "3 veces". */
const times = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);

/*
 * Pistas de los desajustes de conteo (ADR 0011, sección 4; enmiendas C-9 y C-10). Van al
 * final del mensaje y, con su nombre, en `data.hints`, para que la interfaz las muestre
 * aparte si quiere. Textos provisionales: los redacta `documentador`. // validar con tejedora
 */
const HINTS = {
  /** V1 sobre una cadeneta en aro (espiral o vueltas cerradas), F4-3 y F4-4. */
  ring: "Si trabajas dentro del aro, la cantidad de la primera vuelta es libre.",
  /** Vueltas cerradas e hileras con 1 o 2 puntos de diferencia, F4-11 y F4-12. */
  join: "¿Escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan.",
  /** Hileras: la cadeneta para girar puede contar como punto (F4-6). */
  turning_chain: "Revisa si la cadeneta para girar cuenta como punto.",
} as const;
type Hint = keyof typeof HINTS;
const withHints = (message: string, hints: Hint[]) => (hints.length === 0 ? message : `${message} ${hints.map((h) => HINTS[h]).join(" ")}`);
/** Diferencia que puede venir de escribir la cadeneta de subida o el pd de unión como ítems. */
const joinSized = (diff: number) => diff !== 0 && Math.abs(diff) <= 2;

/** Umbral de MAGIC_RING_UNUSUAL (F4-2, enmienda C-20). Provisional. // validar con tejedora */
const MAGIC_RING_USUAL = Object.freeze({ min: 3, max: 12 });

/** Lo que el validador de `layout` necesita saber de cada parte (por su `id`). */
interface PartInfo {
  name: string;
  /** "vuelta" o "fila". */
  word: string;
  /** Veces que se teje; `null` si `copies` no es válido (ya es PART_COPIES). */
  copies: number | null;
  /** Conteo producido por número de vuelta concreta; `null` si la parte no llegó a contarse. */
  produced: Map<number, number> | null;
}

/**
 * Valida las partes. Devuelve lo que sabe de cada parte con identificador válido (para
 * `layout`), o `null` si la lista de partes no se pudo recorrer (no es una lista o supera
 * `LIMITS.maxParts`).
 */
function validateWritten(input: Rec, yarnIds: string[], c: Collector, metrics: ShapeMetrics | null): Map<string, PartInfo> | null {
  if (input.technique !== "crochet") {
    c.error("WRITTEN_TECHNIQUE", "technique", "En esta versión los patrones escritos son solo de crochet; el palillo se diseña con gráfico.");
  }
  if (input.assembly !== undefined) checkTextList(input.assembly, "assembly", "Los pasos de armado", (i) => `El paso de armado ${i + 1}`, c);
  const parts = input.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    c.error("PARTS_EMPTY", "parts", "El patrón necesita al menos una parte.");
    return Array.isArray(parts) ? new Map() : null;
  }
  if (parts.length > LIMITS.maxParts) {
    c.error("LIMIT", "parts", `Máximo ${LIMITS.maxParts} partes.`);
    return null;
  }
  const yarnSet = new Set(yarnIds);
  const usedYarns = new Set<string>();
  const partIds = new Set<string>();
  const infos = new Map<string, PartInfo>();

  parts.forEach((part: unknown, pi: number) => {
    const pp = `parts[${pi}]`;
    if (!isRec(part)) {
      c.error("SHAPE", pp, "Cada parte debe ser un objeto.");
      return;
    }
    checkKeys(part, SCHEMA_KEYS.part, pp, c);
    // Nombre: texto de una línea, no vacío y de hasta `maxPartNameLength` caracteres. Si no
    // lo es, los mensajes la llaman "Parte N" (su posición) y nunca citan el valor recibido.
    const fallback = `Parte ${pi + 1}`;
    let nameOk = false;
    if (!isStr(part.name)) c.error("SHAPE", `${pp}.name`, `${fallback}: el nombre debe ser texto.`);
    else if (part.name.trim() === "") c.error("PART_NAME", `${pp}.name`, `${fallback} necesita un nombre.`);
    else if (LINE_BREAK_RE.test(part.name)) c.error("PART_NAME", `${pp}.name`, `${fallback}: el nombre debe ir en una sola línea.`);
    else nameOk = checkText(part.name, `${pp}.name`, `El nombre de la parte ${pi + 1}`, LIMITS.maxPartNameLength, c);
    const pname = nameOk ? (part.name as string) : fallback;

    // Veces que se teje (v2). Omitido = 1.
    let copies: number | null = 1;
    if (part.copies !== undefined) {
      if (!isInt(part.copies) || part.copies < 1 || part.copies > LIMITS.maxCopies) {
        c.error("PART_COPIES", `${pp}.copies`, `${pname}: la cantidad de veces que se teje debe ser un entero entre 1 y ${LIMITS.maxCopies}.`, { max: LIMITS.maxCopies });
        copies = null;
      } else copies = part.copies;
    }
    const info: PartInfo = { name: pname, word: partRowWord(part.construction), copies, produced: null };

    if (!isStr(part.id) || part.id === "") c.error("PART_ID", `${pp}.id`, `${pname} no tiene identificador.`);
    else if (checkText(part.id, `${pp}.id`, `El identificador de ${pname}`, LIMITS.maxIdLength, c)) {
      if (partIds.has(part.id)) c.error("PART_DUPLICATE_ID", `${pp}.id`, `El identificador de parte "${clip(part.id)}" está repetido.`);
      else {
        partIds.add(part.id);
        infos.set(part.id, info);
      }
    }

    if (part.finish !== undefined) checkText(part.finish, `${pp}.finish`, `El cierre de ${pname}`, LIMITS.maxFinishLength, c, true);

    if (!["spiral", "joined", "flat"].includes(part.construction as string)) {
      c.error("PART_CONSTRUCTION", `${pp}.construction`, `${pname}: la construcción debe ser en espiral, en vueltas unidas o en filas (ida y vuelta).`);
      return;
    }
    const word = partRowWord(part.construction);
    const flat = part.construction === "flat";
    const start = part.start;
    if (isRec(start) && (start.type === "magic_ring" || start.type === "chain")) {
      checkKeys(start, start.type === "chain" ? SCHEMA_KEYS.startChain : SCHEMA_KEYS.startMagicRing, `${pp}.start`, c);
    }
    if (!isRec(start) || (start.type !== "magic_ring" && start.type !== "chain")) {
      c.error("PART_START", `${pp}.start`, `${pname}: indica cómo empieza (anillo mágico o cadeneta).`);
      return;
    }
    if (start.type === "chain" && (!isInt(start.count) || start.count < (flat ? 2 : 1))) {
      c.error("PART_START", `${pp}.start.count`, `${pname}: la cadeneta inicial necesita una cantidad válida.`);
      return;
    }
    // Ajustes de T1 (ADR 0011, sección 4; enmiendas C-9 y C-19). No cambian `valid` ni `savable`.
    if (start.type === "chain" && !flat && start.count === 1) {
      // Advertencia y no error: un v1 con `cad 1` en espiral sigue siendo válido (M1). // validar con tejedora
      c.warn("PART_START_RING_SHORT", `${pp}.start.count`, `${pname}: una cadeneta en aro necesita al menos 2 cadenetas; con 1 no se forma el aro. Usa un anillo mágico o más cadenetas.`, { count: 1, min: 2 });
    }
    if (start.type === "magic_ring" && flat) {
      c.info("PART_START_FLAT_RING", `${pp}.start`, `${pname}: las filas suelen empezar con una cadeneta base, no con un anillo mágico. La vista de la pieza no dibuja el anillo.`);
    }
    if (!isStr(part.startYarn) || part.startYarn === "") {
      c.error("PART_START_YARN", `${pp}.startYarn`, `${pname}: falta indicar con qué lana empieza.`);
      return;
    }
    if (!yarnSet.has(part.startYarn)) {
      c.error("PART_START_YARN", `${pp}.startYarn`, `${pname}: la lana inicial "${clip(part.startYarn)}" no existe en el patrón.`);
      return;
    }
    usedYarns.add(part.startYarn);

    const rounds = part.rounds;
    if (!Array.isArray(rounds) || rounds.length === 0) {
      c.error("PART_NO_ROUNDS", `${pp}.rounds`, `${pname} no tiene ${word}s.`);
      return;
    }
    if (rounds.length > LIMITS.maxRounds) {
      c.error("LIMIT", `${pp}.rounds`, `${pname}: máximo ${LIMITS.maxRounds} ${word}s.`);
      return;
    }

    // 1) Estructura de cada vuelta. `number` y `through` se acotan ANTES de recorrer los
    // rangos: un número desmedido (≥ 2^53 no avanza con n++) o un rango enorme colgaría el conteo.
    const maxR = LIMITS.maxRounds;
    let structureOk = true;
    let expectedNext = 1;
    let concrete = 0;
    rounds.forEach((r: unknown, ri: number) => {
      const rp = `${pp}.rounds[${ri}]`;
      if (isRec(r)) checkKeys(r, SCHEMA_KEYS.round, rp, c);
      if (!isRec(r) || !isInt(r.number) || !Array.isArray(r.items)) {
        c.error("SHAPE", rp, `${pname}: la ${word} ${ri + 1} está mal formada.`);
        structureOk = false;
        return;
      }
      if (r.number > maxR) {
        c.error("LIMIT", `${rp}.number`, `${pname}: máximo ${maxR} ${word}s (la ${word} ${ri + 1} se numera más allá).`, { max: maxR });
        structureOk = false;
        return;
      }
      // Numeración (error de tejido desde la v2, ADR 0011, sección 4). Con un número entre
      // −maxR y 0 la vuelta se sigue revisando y contando: el conteo termina igual. Más abajo
      // es además LIMIT (estructural): `n++` no avanza desde −1e308 y el conteo no terminaría.
      if (r.number < 1) {
        c.error("ROUND_NUMBERING", `${rp}.number`, `${pname}: las ${word}s se numeran desde 1 (la ${word} ${ri + 1} dice ${r.number}).`, { expected: expectedNext, found: r.number });
        if (r.number < -maxR) {
          c.error("LIMIT", `${rp}.number`, `${pname}: el número de la ${word} ${ri + 1} está fuera de rango.`, { min: -maxR });
          structureOk = false;
          return;
        }
      } else if (r.number !== expectedNext) {
        c.error("ROUND_NUMBERING", `${rp}.number`, `${pname}: se esperaba la ${word} ${expectedNext} y aparece la ${r.number}.`, { expected: expectedNext, found: r.number });
      }
      const label = `${pname}, ${word} ${r.number}`;
      // La nota no entra en los conteos: un error suyo no detiene la revisión de la vuelta.
      if (r.note !== undefined) checkText(r.note, `${rp}.note`, `${label}: la nota`, LIMITS.maxRoundNoteLength, c, true);
      if (r.through !== undefined && (!isInt(r.through) || r.through < r.number)) {
        c.error("ROUND_RANGE", `${rp}.through`, `${label}: el rango de ${word}s no es válido.`);
        structureOk = false;
        return;
      }
      if (isInt(r.through) && r.through > maxR) {
        c.error("LIMIT", `${rp}.through`, `${label}: máximo ${maxR} ${word}s (el rango llega a la ${r.through}).`, { max: maxR });
        structureOk = false;
        return;
      }
      concrete += ((r.through as number | undefined) ?? r.number) - r.number + 1;
      expectedNext = ((r.through as number | undefined) ?? r.number) + 1;
      if (r.expected !== undefined && (!isInt(r.expected) || r.expected < 0)) {
        c.error("ROUND_EXPECTED", `${rp}.expected`, `${label}: el conteo declarado no es válido.`);
      }
      if (r.items.length === 0) {
        c.error("ROUND_EMPTY", rp, `${label} no tiene puntos.`);
        structureOk = false;
        return;
      }
      if (!checkItems(r.items, `${rp}.items`, label, yarnSet, usedYarns, c, 1)) {
        structureOk = false;
        return;
      }
      // Tope de puntos por vuelta (estructural): lo que deja y lo que trabaja. Se revisa aquí,
      // y no al contar, para que un error de tejido (la numeración) nunca lo salte. El tope de
      // lo que trabaja acota `expandRound` (una vuelta de `saltar` desmedida no deja puntos).
      const count = countRound(r as unknown as Round, "");
      if (count.produced > LIMITS.maxRoundStitches) {
        c.error("LIMIT", rp, `${label}: demasiados puntos (${count.produced}).`, { produced: count.produced, max: LIMITS.maxRoundStitches });
        structureOk = false;
      } else if (count.consumed > LIMITS.maxRoundStitches) {
        c.error("LIMIT", rp, `${label}: se trabaja sobre demasiados puntos (${count.consumed}).`, { consumed: count.consumed, max: LIMITS.maxRoundStitches });
        structureOk = false;
      }
    });
    if (structureOk && concrete > maxR) {
      // Vueltas que se pisan (por ejemplo, varias "V1–1000"): ya hay ROUND_NUMBERING, pero el conteo igual se acota.
      c.error("LIMIT", `${pp}.rounds`, `${pname}: máximo ${maxR} ${word}s (los rangos suman ${concrete}).`, { max: maxR, rounds: concrete });
      structureOk = false;
    }
    if (!structureOk) return;

    // 2) Conteos: cada vuelta consume lo que dejó la anterior.
    const typed = part as unknown as Part;
    const ringStart = typed.start.type === "chain" && !flat;
    const missingExpected: number[] = [];
    const produced = new Map<number, number>();
    let prevProduced = startAvailable(typed);
    let prevNumber: number | null = null;
    let yarn = typed.startYarn;
    const lastRound = typed.rounds.at(-1);
    const finalNumber = lastRound ? (lastRound.through ?? lastRound.number) : 0;
    typed.rounds.forEach((round, ri) => {
      const rp = `${pp}.rounds[${ri}]`;
      const last = round.through ?? round.number;
      let rangeReported = false;
      for (let n = round.number; n <= last; n++) {
        const count = countRound(round, yarn);
        const label = `${pname}, ${word} ${n}`;
        const first = prevNumber === null;
        if (prevProduced !== null && count.consumed !== prevProduced && !rangeReported) {
          const diff = count.consumed - prevProduced;
          const what = first && typed.start.type === "chain" ? "la cadeneta inicial deja" : `la ${word} ${prevNumber ?? n - 1} dejó`;
          // En hileras, si la cadeneta para girar cuenta o no como punto depende del punto usado
          // (en punto alto suele contar; en punto bajo no): ahí es advertencia. En la primera
          // vuelta sobre una cadeneta en aro también (C-9): si se trabaja dentro del aro, la
          // cantidad es libre. Desde la segunda vuelta, en espiral o cerradas, es error de tejido.
          const ring = first && ringStart;
          const hints: Hint[] = ring ? ["ring"] : [];
          if (flat) hints.push("turning_chain");
          if (!ring && typed.construction !== "spiral" && joinSized(diff)) hints.push("join");
          c.add(
            flat || ring ? "warning" : "error",
            "ROUND_CONSUMPTION_MISMATCH",
            rp,
            withHints(
              `${label}: se trabaja sobre ${count.consumed} puntos, pero ${what} ${prevProduced}. ${diff > 0 ? `Sobra${diff === 1 ? "" : "n"} ${plural(diff, "punto")}` : `Falta${diff === -1 ? "" : "n"} ${plural(-diff, "punto")}`} en las instrucciones.`,
              hints,
            ),
            hints.length > 0 ? { round: n, consumed: count.consumed, available: prevProduced, hints } : { round: n, consumed: count.consumed, available: prevProduced },
          );
        }
        // Un `expected` mal formado ya es ROUND_EXPECTED: no se compara (evita un mensaje con "[object Object]").
        if (isInt(round.expected) && round.expected >= 0 && count.produced !== round.expected && !rangeReported) {
          const hints: Hint[] = typed.construction !== "spiral" && joinSized(count.produced - round.expected) ? ["join"] : [];
          c.error(
            "ROUND_COUNT_MISMATCH",
            rp,
            withHints(`${label}: el patrón declara ${plural(round.expected, "punto")}, pero las instrucciones dan ${count.produced}.`, hints),
            hints.length > 0 ? { round: n, expected: round.expected, actual: count.produced, hints } : { round: n, expected: round.expected, actual: count.produced },
          );
        }
        // Primera vuelta sobre anillo mágico con pocos o muchos puntos (C-20). Nunca error.
        if (first && typed.start.type === "magic_ring" && !flat && count.produced > 0 && (count.produced < MAGIC_RING_USUAL.min || count.produced > MAGIC_RING_USUAL.max)) {
          // validar con tejedora
          c.info(
            "MAGIC_RING_UNUSUAL",
            rp,
            `${label}: empieza con ${plural(count.produced, "punto")} en el anillo mágico; lo habitual es de ${MAGIC_RING_USUAL.min} a ${MAGIC_RING_USUAL.max} (6 es lo más común).`,
            { round: n, stitches: count.produced, min: MAGIC_RING_USUAL.min, max: MAGIC_RING_USUAL.max },
          );
        }
        if (round.expected === undefined && n === round.number) missingExpected.push(n);
        if (count.produced === 0 && n !== finalNumber) {
          c.error("ROUND_ZERO", rp, `${label} no deja puntos para la ${word} siguiente.`);
        }
        // Un rango repite la misma vuelta: solo cuadra si consume lo mismo que produce.
        // Se informa una vez y no se repiten los avisos de las vueltas siguientes del rango.
        if (n === round.number && last > round.number && count.consumed !== count.produced) {
          const grows = count.produced > count.consumed;
          c.error(
            "ROUND_RANGE_CHANGES",
            rp,
            `${pname}, ${word}s ${round.number}-${last}: un rango de ${word}s iguales debe mantener el conteo, pero cada ${word} pasa de ${count.consumed} a ${count.produced} puntos. Si las ${word}s ${grows ? "aumentan" : "disminuyen"}, escribe cada ${word} por separado.`,
            { from: count.consumed, to: count.produced },
          );
          rangeReported = true;
        }
        produced.set(n, count.produced);
        prevProduced = count.produced;
        prevNumber = n;
        yarn = count.endYarn;
      }
    });
    info.produced = produced;
    if (!flat && metrics) shapeNotices(typed, pp, pname, word, metrics, c);
    if (missingExpected.length > 0) {
      const n = missingExpected.length;
      c.info(
        "ROUND_NO_EXPECTED",
        `${pp}.rounds`,
        `${pname}: ${plural(n, word)} no declara${n === 1 ? "" : "n"} su conteo final; sirve para detectar errores.`,
        { rounds: missingExpected },
      );
    }
  });

  yarnIds.forEach((id, i) => {
    if (id && !usedYarns.has(id)) c.info("YARN_UNUSED", `yarns[${i}]`, `${capitalize(yarnLabel(input.yarns, i))} no se usa en ninguna parte.`);
  });
  return infos;
}

// ------------------------------------------------------- Forma de las partes

/**
 * Muestra de los avisos de forma (ADR 0010, sección 2): la del documento (leída como punto
 * bajo, C-3), después `assumedGauge` (con `assumedGaugeStitch`), después `weightCat` (tabla
 * de crochet). Sin ninguna, no hay avisos de forma (regla de oro 6: no se inventa la muestra).
 */
function writtenShapeMetrics(docGauge: unknown, opts: ValidateOptions): ShapeMetrics | null {
  if (isGauge(docGauge)) return shapeMetrics(docGauge, { assumed: false, gaugeStitch: "sc" });
  if (isGauge(opts.assumedGauge)) {
    const st = opts.assumedGaugeStitch;
    const gaugeStitch: GaugeStitch = st === "hdc" || st === "dc" || st === "tr" ? st : "sc";
    return shapeMetrics(opts.assumedGauge, { assumed: true, gaugeStitch });
  }
  const cat = opts.weightCat;
  if (isInt(cat) && cat >= 0 && cat <= 7) {
    const g = ASSUMED_CROCHET_GAUGE[cat]!;
    return shapeMetrics(g, { assumed: true, gaugeStitch: g.stitch });
  }
  return null;
}

/**
 * `ROUND_GROWS_FAST` y `ROUND_SHRINKS_FAST` (información; enmiendas C-4 y C-6): la vuelta
 * cambia el radio más de `PROFILE_RADIAL_TOLERANCE` veces su alto, es decir, cuando el perfil
 * acota el radio. Se decide por `Δr/s`, no por `strain`. La V1 sobre anillo mágico no se
 * evalúa. Un aviso por vuelta escrita (un rango que cambia el conteo ya es error).
 * Textos de F4-77 y F4-78. // validar con tejedora
 */
function shapeNotices(part: Part, pp: string, pname: string, word: string, metrics: ShapeMetrics, c: Collector): void {
  const { steps } = revolutionProfile(part, metrics);
  let lastSource = -1;
  for (const step of steps) {
    if (!step.evaluated || step.sourceIndex === lastSource) continue;
    // Además del paso radial, la vuelta misma tiene que aumentar (o disminuir): tras una vuelta
    // acotada, el perfil sigue abriéndose (o cerrándose) en las vueltas siguientes sin que
    // ellas cambien el conteo, y avisarles con "+0 puntos" no ayuda a la tejedora.
    // `clamped` es `|Δr/s| > PROFILE_RADIAL_TOLERANCE` (con el margen de redondeo del perfil).
    const grows = step.clamped && step.ratio > 0 && step.change > 0;
    const shrinks = step.clamped && step.ratio < 0 && step.change < 0;
    if (!grows && !shrinks) continue;
    lastSource = step.sourceIndex;
    const label = `${pname}, ${word} ${step.round}`;
    const n = Math.abs(step.change);
    const data = { round: step.round, change: step.change, ratio: Math.round(step.ratio * 1000) / 1000, tolerance: PROFILE_RADIAL_TOLERANCE };
    const path = `${pp}.rounds[${step.sourceIndex}]`;
    if (grows) {
      // "unos 6" es el valor del punto bajo; con otro punto el texto no da cifra (C-12).
      const sc = step.heightFactor === 1 ? "; una vuelta de pb queda plana con unos 6" : "";
      c.info("ROUND_GROWS_FAST", path, `${label}: esta vuelta aumenta más de lo que la tela puede abrir en plano (+${plural(n, "punto")}${sc}). Si la tejes así, la pieza tiende a ondularse. Puede ser lo que buscas.`, data);
    } else {
      c.info("ROUND_SHRINKS_FAST", path, `${label}: esta vuelta disminuye más de lo que la pieza puede cerrarse en curva (−${plural(n, "punto")}). Si la tejes así, la pieza se frunce o se cierra en copa. Puede ser lo que buscas (por ejemplo, el remate).`, data);
    }
  }
}

// ------------------------------------------------- Posición de las partes (v2)

/** Tope de avisos por código dentro de `layout`: miles de ubicaciones malas no llenan la lista. */
const MAX_LAYOUT_ISSUES_PER_CODE = 20;

interface Ref {
  part: string;
  copy: number;
}
const refKey = (r: Ref) => `${r.copy}:${r.part}`;

/**
 * Valida `layout` (ADR 0011, sección 3). `parts` es lo que devolvió `validateWritten`; con
 * `null` (la lista de partes no se pudo recorrer) solo se revisa la forma. Ciclo y
 * profundidad se revisan en tiempo lineal, sin recursión.
 */
function validateLayout(layout: unknown, parts: Map<string, PartInfo> | null, c: Collector): void {
  const counts = new Map<string, number>();
  const emit = (severity: Severity, code: string, path: string, message: string, data?: Record<string, unknown>) => {
    const n = (counts.get(code) ?? 0) + 1;
    counts.set(code, n);
    if (n <= MAX_LAYOUT_ISSUES_PER_CODE) c.add(severity, code, path, message, data);
  };
  if (!isRec(layout)) {
    emit("error", "SHAPE", "layout", "La ubicación de las piezas debe ser un objeto.");
    return;
  }
  checkKeys(layout, SCHEMA_KEYS.layout, "layout", c);
  const list = layout.placements;
  if (!Array.isArray(list)) {
    emit("error", "SHAPE", "layout.placements", "La ubicación de las piezas debe ser una lista.");
    return;
  }
  if (list.length > LIMITS.maxPlacements) {
    emit("error", "LIMIT", "layout.placements", `Se pueden ubicar hasta ${LIMITS.maxPlacements.toLocaleString("es-CL")} piezas (hay ${list.length}).`, { length: list.length, max: LIMITS.maxPlacements });
    return;
  }

  const label = (r: Ref) => {
    const info = parts?.get(r.part);
    if (!info) return `"${clip(r.part)}"`;
    return info.copies !== null && info.copies > 1 ? `${info.name} (${r.copy + 1} de ${info.copies})` : info.name;
  };

  /** Lee una referencia `{ part, copy }`. Devuelve `null` si su forma no es válida (ya informado). */
  const readRef = (v: unknown, path: string, what: string): Ref | null => {
    if (!isRec(v)) {
      emit("error", "SHAPE", path, `${what} debe indicar la parte y cuál de sus piezas.`);
      return null;
    }
    checkKeys(v, SCHEMA_KEYS.partRef, path, c);
    let ok = true;
    if (!isStr(v.part) || v.part === "") {
      emit("error", "SHAPE", `${path}.part`, `${what} no indica a qué parte se refiere.`);
      ok = false;
    } else if (!checkText(v.part, `${path}.part`, `${what}: el identificador de la parte`, LIMITS.maxIdLength, c)) ok = false;
    if (typeof v.copy !== "number") {
      emit("error", "SHAPE", `${path}.copy`, `${what} no indica cuál de las piezas es.`);
      ok = false;
    } else if (!Number.isInteger(v.copy)) {
      emit("error", "LIMIT", `${path}.copy`, `${what}: el número de la pieza debe ser un entero.`);
      ok = false;
    }
    return ok ? { part: v.part as string, copy: v.copy as number } : null;
  };

  /** Número acotado: tipo (SHAPE), entero y cota (LIMIT). */
  const checkInt = (v: unknown, path: string, what: string, min: number, max: number): v is number => {
    if (typeof v !== "number") {
      emit("error", "SHAPE", path, `${what} debe ser un número.`);
      return false;
    }
    if (!Number.isInteger(v) || v < min || v > max) {
      emit("error", "LIMIT", path, `${what} debe ser un entero entre ${min} y ${max}.`, { min, max });
      return false;
    }
    return true;
  };
  const checkVec3 = (v: unknown, path: string, what: string, max: number, unit: string) => {
    if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== "number")) {
      emit("error", "SHAPE", path, `${what} debe tener tres números (x, y, z).`);
      return;
    }
    if (v.some((x: number) => !Number.isFinite(x) || Math.abs(x) > max)) {
      emit("error", "LIMIT", path, `${what} debe estar entre −${max} y ${max} ${unit} en cada eje.`, { max });
    }
  };

  /** Referencia que existe en el patrón (parte conocida y copia dentro de rango). */
  const resolve = (r: Ref, path: string, unknownCode: string, unknownMessage: string): boolean => {
    if (parts === null) return false;
    const info = parts.get(r.part);
    if (!info) {
      emit("error", unknownCode, path, unknownMessage, { part: clip(r.part) });
      return false;
    }
    if (info.copies === null) return false; // ya es PART_COPIES
    if (r.copy < 0 || r.copy >= info.copies) {
      emit("error", "LAYOUT_COPY_RANGE", `${path}.copy`, `La ubicación se refiere a una pieza de ${info.name} que no existe: ${info.name} se teje ${times(info.copies)}.`, {
        part: clip(r.part),
        copy: r.copy,
        copies: info.copies,
      });
      return false;
    }
    return true;
  };

  const firstIndex = new Map<string, number>();
  /** Anfitrión de cada pieza cosida (solo referencias válidas y la primera entrada de cada pieza). */
  const hostOf = new Map<string, string>();
  const refOf = new Map<string, Ref>();
  const pathOf = new Map<string, string>();

  list.forEach((pl: unknown, i: number) => {
    const pp = `layout.placements[${i}]`;
    if (!isRec(pl)) {
      emit("error", "SHAPE", pp, `La ubicación ${i + 1} debe ser un objeto.`);
      return;
    }
    checkKeys(pl, SCHEMA_KEYS.placement, pp, c);
    const target = readRef(pl.target, `${pp}.target`, `La ubicación ${i + 1}`);
    let targetOk = false;
    let duplicate = false;
    if (target) {
      targetOk = resolve(target, `${pp}.target`, "LAYOUT_TARGET_UNKNOWN", `La ubicación ${i + 1} se refiere a una parte que no existe ("${clip(target.part)}").`);
      const key = refKey(target);
      const prev = firstIndex.get(key);
      if (targetOk && prev !== undefined) {
        duplicate = true;
        emit("error", "LAYOUT_DUPLICATE", `${pp}.target`, `${label(target)} tiene dos ubicaciones (la ${prev + 1} y la ${i + 1}); deja solo una.`, { first: prev, index: i });
      } else if (targetOk) firstIndex.set(key, i);
    }

    const at = pl.at;
    if (!isRec(at) || (at.type !== "free" && at.type !== "surface")) {
      emit("error", "SHAPE", `${pp}.at`, `La ubicación ${i + 1} debe indicar si la pieza va suelta (posición libre) o cosida a otra.`);
      return;
    }
    if (at.type === "free") {
      checkKeys(at, SCHEMA_KEYS.freeAt, `${pp}.at`, c);
      checkVec3(at.positionCm, `${pp}.at.positionCm`, `La posición de la ubicación ${i + 1}`, LIMITS.maxPositionCm, "cm");
      checkVec3(at.rotationDeg, `${pp}.at.rotationDeg`, `El giro de la ubicación ${i + 1}`, LIMITS.maxRotationDeg, "grados");
      return;
    }
    checkKeys(at, SCHEMA_KEYS.surfaceAt, `${pp}.at`, c);
    const host = readRef(at.host, `${pp}.at.host`, `El anfitrión de la ubicación ${i + 1}`);
    const roundOk = checkInt(at.round, `${pp}.at.round`, `La vuelta de la ubicación ${i + 1}`, 1, LIMITS.maxRounds);
    const stitchOk = checkInt(at.stitch, `${pp}.at.stitch`, `El punto de la ubicación ${i + 1}`, 0, LIMITS.maxRoundStitches - 1);
    if (at.attach !== "end" && at.attach !== "start") {
      emit("error", "SHAPE", `${pp}.at.attach`, `La ubicación ${i + 1} debe indicar qué extremo de la pieza se cose: el final ("end") o el centro del inicio ("start").`);
    }
    checkVec3(at.rotationDeg, `${pp}.at.rotationDeg`, `El giro de la ubicación ${i + 1}`, LIMITS.maxRotationDeg, "grados");
    if (at.offsetCm !== undefined) {
      if (typeof at.offsetCm !== "number") emit("error", "SHAPE", `${pp}.at.offsetCm`, `La separación de la ubicación ${i + 1} debe ser un número.`);
      else if (!Number.isFinite(at.offsetCm) || Math.abs(at.offsetCm) > LIMITS.maxOffsetCm) {
        emit("error", "LIMIT", `${pp}.at.offsetCm`, `La separación de la ubicación ${i + 1} debe estar entre −${LIMITS.maxOffsetCm} y ${LIMITS.maxOffsetCm} cm.`, { max: LIMITS.maxOffsetCm });
      }
    }
    if (!host) return;
    const who = target && targetOk ? label(target) : `La ubicación ${i + 1}`;
    const hostOk = resolve(host, `${pp}.at.host`, "LAYOUT_HOST_UNKNOWN", `${who} se cose a una parte que no existe ("${clip(host.part)}").`);
    if (!hostOk) return;

    // El ancla ya no existe en el anfitrión (por ejemplo, después de borrar vueltas). Es
    // advertencia: editar el anfitrión nunca impide guardar. El 3D acota y lo dice.
    const hostInfo = parts?.get(host.part);
    if (hostInfo?.produced && roundOk && stitchOk) {
      const n = hostInfo.produced.get(at.round as number);
      const hostLabel = label(host);
      if (n === undefined) {
        emit("warning", "LAYOUT_ANCHOR_RANGE", `${pp}.at.round`, `${who} está cosida a la ${hostInfo.word} ${at.round} de ${hostLabel}, que ya no existe; la vista 3D la acerca a la ${hostInfo.word} más cercana.`, {
          round: at.round,
          stitch: at.stitch,
        });
      } else if ((at.stitch as number) >= n) {
        emit("warning", "LAYOUT_ANCHOR_RANGE", `${pp}.at.stitch`, `${who} está cosida al punto ${(at.stitch as number) + 1} de la ${hostInfo.word} ${at.round} de ${hostLabel}, que tiene ${plural(n, "punto")}; la vista 3D la acerca al último punto.`, {
          round: at.round,
          stitch: at.stitch,
          stitches: n,
        });
      }
    }
    if (target && targetOk && !duplicate) {
      const key = refKey(target);
      hostOf.set(key, refKey(host));
      refOf.set(key, target);
      pathOf.set(key, `${pp}.at.host`);
    }
  });

  // Ciclos y profundidad de las cadenas de anclas: cada pieza se visita una vez (lineal).
  // depth = 0 en una pieza suelta o sin ubicar; 1 + depth(anfitrión) en una cosida. −1 si
  // la cadena termina en un ciclo (se informa una vez, en el ciclo).
  const max = LIMITS.maxLayoutDepth;
  const depth = new Map<string, number>();
  for (const startKey of hostOf.keys()) {
    if (depth.has(startKey)) continue;
    const path: string[] = [];
    const onPath = new Map<string, number>();
    let cur = startKey;
    while (hostOf.has(cur) && !depth.has(cur) && !onPath.has(cur)) {
      onPath.set(cur, path.length);
      path.push(cur);
      cur = hostOf.get(cur) as string;
    }
    let base: number;
    let end = path.length;
    if (depth.has(cur)) base = depth.get(cur) as number;
    else if (onPath.has(cur)) {
      const from = onPath.get(cur) as number;
      const cycle = path.slice(from);
      const refs = cycle.map((k) => refOf.get(k) as Ref);
      const firstRef = refs[0] as Ref;
      const message =
        cycle.length === 1
          ? `${label(firstRef)} está cosida a sí misma; cósela a otra pieza o déjala suelta.`
          : `${refs.slice(0, 10).map(label).join(", ")}${refs.length > 10 ? "…" : ""} están cosidas entre sí en círculo; una de ellas tiene que ir suelta o cosida a otra pieza.`;
      emit("error", "LAYOUT_CYCLE", pathOf.get(cycle[0] as string) as string, message, { length: cycle.length });
      for (const k of cycle) depth.set(k, -1);
      base = -1;
      end = from;
    } else base = 0; // anfitrión suelto o sin ubicar
    for (let j = end - 1; j >= 0; j--) {
      const k = path[j] as string;
      base = base < 0 ? -1 : base + 1;
      depth.set(k, base);
      if (base === max + 1) {
        emit("error", "LAYOUT_DEPTH", pathOf.get(k) as string, `${label(refOf.get(k) as Ref)} está al final de una cadena de más de ${max} piezas cosidas una a otra; cósela más cerca de la pieza principal.`, { max });
      }
    }
  }
}

function checkItems(items: unknown[], path: string, label: string, yarnSet: Set<string>, used: Set<string>, c: Collector, depth: number): boolean {
  if (depth > LIMITS.maxNesting) {
    c.error("LIMIT", path, `${label}: demasiados grupos anidados.`);
    return false;
  }
  let ok = true;
  items.forEach((it, i) => {
    const p = `${path}[${i}]`;
    if (!isRec(it)) {
      c.error("SHAPE", p, `${label}: elemento mal formado.`);
      ok = false;
      return;
    }
    const item = it as Partial<Item> & Rec;
    const keys = item.type === "stitch" ? SCHEMA_KEYS.stitchItem : item.type === "group" ? SCHEMA_KEYS.groupItem : item.type === "color" ? SCHEMA_KEYS.colorItem : null;
    if (keys) checkKeys(item, keys, p, c);
    if (item.type === "stitch") {
      // Object.hasOwn: `in` aceptaría "toString", "constructor" o "__proto__" de Object.prototype.
      if (!isStr(item.stitch)) {
        c.error("STITCH_UNKNOWN", p, `${label}: falta indicar qué punto es.`);
        ok = false;
      } else if (!Object.hasOwn(STITCHES, item.stitch)) {
        c.error("STITCH_UNKNOWN", p, `${label}: punto desconocido "${clip(item.stitch)}".`);
        ok = false;
      }
      if (!isInt(item.count) || item.count < 1 || item.count > LIMITS.maxItemCount) {
        c.error("ITEM_COUNT", p, `${label}: la cantidad de puntos debe ser un entero entre 1 y ${LIMITS.maxItemCount}.`);
        ok = false;
      }
      if (item.loop !== undefined && !["both", "front", "back"].includes(item.loop as string)) {
        c.error("STITCH_LOOP", p, `${label}: la lazada no es válida (debe ser ambas, delantera o trasera).`);
        ok = false;
      }
    } else if (item.type === "group") {
      if (!isInt(item.times) || item.times < 1 || item.times > LIMITS.maxGroupTimes) {
        c.error("GROUP_TIMES", p, `${label}: un grupo debe repetirse entre 1 y ${LIMITS.maxGroupTimes} veces.`);
        ok = false;
      }
      if (!Array.isArray(item.items) || item.items.length === 0) {
        c.error("GROUP_EMPTY", p, `${label}: hay un grupo vacío.`);
        ok = false;
      } else if (!checkItems(item.items, `${p}.items`, label, yarnSet, used, c, depth + 1)) ok = false;
    } else if (item.type === "color") {
      if (!isStr(item.yarn) || item.yarn === "") {
        c.error("COLOR_UNKNOWN_YARN", p, `${label}: el cambio de color no indica a qué lana.`);
        ok = false;
      } else if (!yarnSet.has(item.yarn)) {
        c.error("COLOR_UNKNOWN_YARN", p, `${label}: la lana "${clip(item.yarn)}" no existe en el patrón.`);
        ok = false;
      } else used.add(item.yarn);
    } else {
      c.error("SHAPE", p, `${label}: tipo de elemento desconocido.`);
      ok = false;
    }
  });
  return ok;
}

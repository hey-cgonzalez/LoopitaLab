/**
 * Validador del modelo canónico. Acepta cualquier valor (por ejemplo, JSON propuesto
 * por la IA), nunca lanza excepciones y devuelve problemas estructurados en español.
 */
import { floatLengthCm, rowFloats } from "./chart.ts";
import { yarnLetter } from "./letters.ts";
import { LIMITS } from "./limits.ts";
import { STITCHES } from "./stitches.ts";
import {
  NO_STITCH,
  SCHEMA_VERSION,
  type Chart,
  type Gauge,
  type Issue,
  type Item,
  type Pattern,
  type Severity,
  type WeightCategory,
  type WrittenPattern,
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
 */
export const DRAFT_ERROR_CODES: readonly string[] = Object.freeze(["CHART_EMPTY", "CHART_ROW_EMPTY_FULL"]);

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
 * Documento cerrado (ADR 0003, E16): cada objeto del esquema v1 solo admite sus claves,
 * incluidas las opcionales. Una clave desconocida es error estructural UNKNOWN_KEY con
 * su ruta. Una versión futura del esquema que agregue campos los declara aquí.
 */
const KEYS_BASE = ["schemaVersion", "id", "title", "technique", "yarns", "gauge", "origin", "notes", "kind"] as const;
const SCHEMA_KEYS = Object.freeze({
  chartPattern: Object.freeze([...KEYS_BASE, "chart"]),
  writtenPattern: Object.freeze([...KEYS_BASE, "parts", "assembly"]),
  chart: Object.freeze(["width", "height", "cells", "repeat", "workedIn", "renderAs", "direction"]),
  repeat: Object.freeze(["x", "y"]),
  gauge: Object.freeze(["stitchesPer10cm", "rowsPer10cm"]),
  origin: Object.freeze(["kind", "model", "promptVersion"]),
  yarn: Object.freeze(["id", "weight", "composition", "color", "note"]),
  yarnColor: Object.freeze(["hex", "paletteId"]),
  fiberShare: Object.freeze(["fiber", "percent"]),
  part: Object.freeze(["id", "name", "construction", "start", "startYarn", "rounds", "finish"]),
  startMagicRing: Object.freeze(["type"]),
  startChain: Object.freeze(["type", "count"]),
  round: Object.freeze(["number", "through", "items", "expected", "note"]),
  stitchItem: Object.freeze(["type", "stitch", "count", "loop"]),
  groupItem: Object.freeze(["type", "items", "times"]),
  colorItem: Object.freeze(["type", "yarn"]),
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
  const rootKeys = input.kind === "chart" ? SCHEMA_KEYS.chartPattern : input.kind === "written" ? SCHEMA_KEYS.writtenPattern : [...SCHEMA_KEYS.chartPattern, "parts", "assembly"];
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
  else if (input.kind === "written") validateWritten(input, yarnIds, c);
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
    const x = firstBad % width;
    const y = Math.floor(firstBad / width);
    c.error("CHART_CELL_VALUE", `chart.cells[${firstBad}]`, `Hay ${bad} casilla${bad === 1 ? "" : "s"} con una lana que no existe en la paleta; la primera está en la ${word} ${y + 1}, casilla ${x + 1}.`, { count: bad, x, y });
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

function validateWritten(input: Rec, yarnIds: string[], c: Collector) {
  if (input.technique !== "crochet") {
    c.error("WRITTEN_TECHNIQUE", "technique", "En esta versión los patrones escritos son solo de crochet; el palillo se diseña con gráfico.");
  }
  if (input.assembly !== undefined) checkTextList(input.assembly, "assembly", "Los pasos de armado", (i) => `El paso de armado ${i + 1}`, c);
  const parts = input.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    c.error("PARTS_EMPTY", "parts", "El patrón necesita al menos una parte.");
    return;
  }
  if (parts.length > LIMITS.maxParts) {
    c.error("LIMIT", "parts", `Máximo ${LIMITS.maxParts} partes.`);
    return;
  }
  const yarnSet = new Set(yarnIds);
  const usedYarns = new Set<string>();
  const partIds = new Set<string>();

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

    if (!isStr(part.id) || part.id === "") c.error("PART_ID", `${pp}.id`, `${pname} no tiene identificador.`);
    else if (checkText(part.id, `${pp}.id`, `El identificador de ${pname}`, LIMITS.maxIdLength, c)) {
      if (partIds.has(part.id)) c.error("PART_DUPLICATE_ID", `${pp}.id`, `El identificador de parte "${clip(part.id)}" está repetido.`);
      else partIds.add(part.id);
    }

    if (part.finish !== undefined) checkText(part.finish, `${pp}.finish`, `El cierre de ${pname}`, LIMITS.maxFinishLength, c, true);

    if (!["spiral", "joined", "flat"].includes(part.construction as string)) {
      c.error("PART_CONSTRUCTION", `${pp}.construction`, `${pname}: la construcción debe ser en espiral, en vueltas unidas o en filas (ida y vuelta).`);
      return;
    }
    const word = partRowWord(part.construction);
    const start = part.start;
    if (isRec(start) && (start.type === "magic_ring" || start.type === "chain")) {
      checkKeys(start, start.type === "chain" ? SCHEMA_KEYS.startChain : SCHEMA_KEYS.startMagicRing, `${pp}.start`, c);
    }
    if (!isRec(start) || (start.type !== "magic_ring" && start.type !== "chain")) {
      c.error("PART_START", `${pp}.start`, `${pname}: indica cómo empieza (anillo mágico o cadeneta).`);
      return;
    }
    if (start.type === "chain" && (!isInt(start.count) || start.count < (part.construction === "flat" ? 2 : 1))) {
      c.error("PART_START", `${pp}.start.count`, `${pname}: la cadeneta inicial necesita una cantidad válida.`);
      return;
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
      if (r.number < 1) {
        c.error("ROUND_NUMBERING", `${rp}.number`, `${pname}: las ${word}s se numeran desde 1 (la ${word} ${ri + 1} dice ${r.number}).`, { expected: expectedNext, found: r.number });
        structureOk = false;
        return;
      }
      if (r.number > maxR) {
        c.error("LIMIT", `${rp}.number`, `${pname}: máximo ${maxR} ${word}s (la ${word} ${ri + 1} se numera más allá).`, { max: maxR });
        structureOk = false;
        return;
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
      if (r.number !== expectedNext) {
        c.error("ROUND_NUMBERING", `${rp}.number`, `${pname}: se esperaba la ${word} ${expectedNext} y aparece la ${r.number}.`, { expected: expectedNext, found: r.number });
      }
      expectedNext = ((r.through as number | undefined) ?? r.number) + 1;
      if (r.expected !== undefined && (!isInt(r.expected) || r.expected < 0)) {
        c.error("ROUND_EXPECTED", `${rp}.expected`, `${label}: el conteo declarado no es válido.`);
      }
      if (r.items.length === 0) {
        c.error("ROUND_EMPTY", rp, `${label} no tiene puntos.`);
        structureOk = false;
        return;
      }
      if (!checkItems(r.items, `${rp}.items`, label, yarnSet, usedYarns, c, 1)) structureOk = false;
    });
    if (structureOk && concrete > maxR) {
      // Vueltas que se pisan (por ejemplo, varias "V1–1000"): ya hay ROUND_NUMBERING, pero el conteo igual se acota.
      c.error("LIMIT", `${pp}.rounds`, `${pname}: máximo ${maxR} ${word}s (los rangos suman ${concrete}).`, { max: maxR, rounds: concrete });
      structureOk = false;
    }
    if (!structureOk) return;

    // 2) Conteos: cada vuelta consume lo que dejó la anterior.
    const typed = part as unknown as WrittenPattern["parts"][number];
    const missingExpected: number[] = [];
    let prevProduced = startAvailable(typed);
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
        if (count.produced > LIMITS.maxRoundStitches) {
          c.error("LIMIT", rp, `${label}: demasiados puntos (${count.produced}).`);
          return;
        }
        if (prevProduced !== null && count.consumed !== prevProduced && !rangeReported) {
          const diff = count.consumed - prevProduced;
          const what = n === 1 && typed.start.type === "chain" ? "la cadeneta inicial deja" : `la ${word} ${n - 1} dejó`;
          // En hileras, si la cadeneta para girar cuenta o no como punto depende del punto usado
          // (en punto alto suele contar; en punto bajo no). Por eso ahí es advertencia, no error.
          const flat = typed.construction === "flat";
          c.add(
            flat ? "warning" : "error",
            "ROUND_CONSUMPTION_MISMATCH",
            rp,
            `${label}: se trabaja sobre ${count.consumed} puntos, pero ${what} ${prevProduced}. ${diff > 0 ? `Sobra${diff === 1 ? "" : "n"} ${plural(diff, "punto")}` : `Falta${diff === -1 ? "" : "n"} ${plural(-diff, "punto")}`} en las instrucciones.${flat ? " Revisa si la cadeneta para girar cuenta como punto." : ""}`,
            { round: n, consumed: count.consumed, available: prevProduced },
          );
        }
        // Un `expected` mal formado ya es ROUND_EXPECTED: no se compara (evita un mensaje con "[object Object]").
        if (isInt(round.expected) && round.expected >= 0 && count.produced !== round.expected && !rangeReported) {
          c.error(
            "ROUND_COUNT_MISMATCH",
            rp,
            `${label}: el patrón declara ${plural(round.expected, "punto")}, pero las instrucciones dan ${count.produced}.`,
            { round: n, expected: round.expected, actual: count.produced },
          );
        }
        if (round.expected === undefined && n === round.number) missingExpected.push(n);
        if (count.produced === 0 && n !== finalNumber) {
          c.error("ROUND_ZERO", rp, `${label} no deja puntos para la ${word} siguiente.`);
        }
        // Un rango repite la misma vuelta: solo cuadra si consume lo mismo que produce.
        // Se informa una vez y no se repiten los avisos de las vueltas siguientes del rango.
        if (n === round.number && last > round.number && count.consumed !== count.produced) {
          c.error(
            "ROUND_RANGE_CHANGES",
            rp,
            `${pname}, ${word}s ${round.number}-${last}: un rango de ${word}s iguales debe mantener el conteo, pero cada ${word} pasa de ${count.consumed} a ${count.produced} puntos.`,
          );
          rangeReported = true;
        }
        prevProduced = count.produced;
        yarn = count.endYarn;
      }
    });
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

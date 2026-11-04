/**
 * Validador del modelo canónico. Acepta cualquier valor (por ejemplo, JSON propuesto
 * por la IA), nunca lanza excepciones y devuelve problemas estructurados en español.
 */
import { floatLengthCm, rowFloats } from "./chart.ts";
import { STITCHES } from "./stitches.ts";
import {
  NO_STITCH,
  SCHEMA_VERSION,
  type ChartPattern,
  type Issue,
  type Item,
  type Pattern,
  type Severity,
  type WrittenPattern,
} from "./types.ts";
import { countRound, startAvailable } from "./written.ts";

export interface ValidateOptions {
  /** Fibras conocidas (de `yarn-catalog`). Si se entregan, se avisa de fibras desconocidas. */
  fibers?: ReadonlySet<string>;
  /** Identificadores de la paleta propia. */
  paletteIds?: ReadonlySet<string>;
  /** Hebra flotante máxima en cm cuando hay muestra. Por defecto 2,5 cm. */
  maxFloatCm?: number;
  /** Hebra flotante máxima en puntos cuando no hay muestra. Por defecto 5. */
  maxFloatStitches?: number;
}

export interface ValidationResult {
  /** true si no hay problemas de severidad "error". */
  valid: boolean;
  issues: Issue[];
}

/** Límites que protegen al motor de entradas desmedidas (por ejemplo, de la IA). */
export const LIMITS = {
  maxCells: 250_000,
  maxRepeat: 500,
  maxYarns: 32,
  maxParts: 50,
  maxRounds: 1_000,
  maxItemCount: 5_000,
  maxGroupTimes: 500,
  maxNesting: 6,
  maxRoundStitches: 50_000,
} as const;

const YARN_ID_RE = /^[A-Za-z0-9_-]{1,16}$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

class Collector {
  issues: Issue[] = [];
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
  get hasErrors() {
    return this.issues.some((i) => i.severity === "error");
  }
}

export function validatePattern(input: unknown, opts: ValidateOptions = {}): ValidationResult {
  const c = new Collector();
  if (!isRec(input)) {
    c.error("SHAPE", "", "El patrón debe ser un objeto.");
    return { valid: false, issues: c.issues };
  }
  if (input.schemaVersion !== SCHEMA_VERSION) {
    c.error("SCHEMA_VERSION", "schemaVersion", `Versión de esquema no soportada (se esperaba ${SCHEMA_VERSION}).`, { found: input.schemaVersion });
  }
  if (!isStr(input.id) || input.id.trim() === "") c.error("ID_MISSING", "id", "El patrón no tiene identificador.");
  if (!isStr(input.title)) c.error("SHAPE", "title", "El título debe ser texto.");
  if (input.technique !== "knit" && input.technique !== "crochet") {
    c.error("TECHNIQUE", "technique", 'La técnica debe ser "knit" (palillo) o "crochet".');
  }
  validateOrigin(input.origin, c);
  if (input.gauge !== undefined) validateGauge(input.gauge, c);
  const yarnIds = validateYarns(input.yarns, c, opts);

  if (input.kind === "chart") validateChart(input, yarnIds, c, opts);
  else if (input.kind === "written") validateWritten(input, yarnIds, c);
  else c.error("KIND", "kind", 'El tipo de patrón debe ser "chart" (gráfico) o "written" (escrito).');

  return { valid: !c.hasErrors, issues: c.issues };
}

/** Atajo: valida y, si no hay errores, devuelve el patrón tipado. */
export function parsePattern(input: unknown, opts: ValidateOptions = {}): { ok: true; pattern: Pattern; issues: Issue[] } | { ok: false; issues: Issue[] } {
  const r = validatePattern(input, opts);
  return r.valid ? { ok: true, pattern: input as Pattern, issues: r.issues } : { ok: false, issues: r.issues };
}

function validateOrigin(origin: unknown, c: Collector) {
  if (!isRec(origin) || !["manual", "ai", "ai_edited"].includes(origin.kind as string)) {
    c.error("ORIGIN", "origin", 'El origen debe ser "manual", "ai" o "ai_edited".');
    return;
  }
  if (origin.kind !== "manual" && (!isStr(origin.model) || origin.model === "")) {
    c.warn("ORIGIN_AI_MODEL", "origin.model", "El patrón viene de IA pero no registra qué modelo lo generó.");
  }
}

function validateGauge(g: unknown, c: Collector) {
  if (!isRec(g) || !isNum(g.stitchesPer10cm) || !isNum(g.rowsPer10cm) || g.stitchesPer10cm <= 0 || g.rowsPer10cm <= 0) {
    c.error("GAUGE", "gauge", "La muestra debe indicar puntos y filas en 10 cm, mayores que cero.");
  }
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
    if (!isRec(y)) {
      c.error("SHAPE", p, "Cada lana debe ser un objeto.");
      ids.push("");
      return;
    }
    const id = isStr(y.id) ? y.id : "";
    if (!YARN_ID_RE.test(id)) c.error("YARN_ID", `${p}.id`, `La lana ${i + 1} necesita un identificador corto (letras, números, "-" o "_").`);
    else if (ids.includes(id)) c.error("YARN_DUPLICATE_ID", `${p}.id`, `El identificador de lana "${id}" está repetido.`);
    ids.push(id);
    const name = id || `${i + 1}`;

    if (!isInt(y.weight) || y.weight < 0 || y.weight > 7) {
      c.error("YARN_WEIGHT", `${p}.weight`, `La lana ${name} necesita un grosor entre 0 (Ultra Fino) y 7 (Jumbo).`);
    }

    if (!Array.isArray(y.composition) || y.composition.length === 0) {
      c.error("YARN_COMPOSITION_EMPTY", `${p}.composition`, `La lana ${name} necesita su composición (por ejemplo, 100 % lana).`);
    } else {
      let sum = 0;
      const seen = new Set<string>();
      y.composition.forEach((f: unknown, j: number) => {
        const fp = `${p}.composition[${j}]`;
        if (!isRec(f) || !isStr(f.fiber) || !isNum(f.percent)) {
          c.error("SHAPE", fp, "Cada fibra necesita su nombre y su porcentaje.");
          return;
        }
        if (f.percent <= 0 || f.percent > 100) c.error("YARN_PERCENT", fp, `El porcentaje de ${f.fiber} debe estar entre 0 y 100.`);
        sum += f.percent;
        if (seen.has(f.fiber)) c.warn("YARN_FIBER_DUPLICATE", fp, `La fibra ${f.fiber} aparece dos veces en la lana ${name}.`);
        seen.add(f.fiber);
        if (opts.fibers && !opts.fibers.has(f.fiber)) c.warn("YARN_FIBER_UNKNOWN", fp, `No conozco la fibra "${f.fiber}".`);
      });
      if (Math.abs(sum - 100) > 0.01) {
        c.error("YARN_COMPOSITION_SUM", `${p}.composition`, `La composición de la lana ${name} suma ${round2(sum)} % y debe sumar 100 %.`, { sum });
      }
    }

    if (!isRec(y.color) || !isStr(y.color.hex) || !HEX_RE.test(y.color.hex)) {
      c.error("YARN_COLOR", `${p}.color`, `La lana ${name} necesita un color en formato #RRGGBB.`);
    } else if (y.color.paletteId !== undefined && opts.paletteIds && !opts.paletteIds.has(String(y.color.paletteId))) {
      c.warn("YARN_PALETTE_UNKNOWN", `${p}.color.paletteId`, `El color "${String(y.color.paletteId)}" no está en la paleta.`);
    }
  });
  return ids;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ Gráfico

function validateChart(input: Rec, yarnIds: string[], c: Collector, opts: ValidateOptions) {
  const ch = input.chart;
  if (!isRec(ch)) {
    c.error("SHAPE", "chart", "Falta el gráfico.");
    return;
  }
  const { width, height, cells, repeat } = ch;
  let ok = true;
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1) {
    c.error("CHART_SIZE", "chart", "El ancho y el alto del motivo deben ser enteros de 1 o más.");
    ok = false;
  } else if (width * height > LIMITS.maxCells) {
    c.error("LIMIT", "chart", `El motivo no puede superar ${LIMITS.maxCells.toLocaleString("es-CL")} celdas.`);
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
    c.error("CHART_WORKED_IN", "chart.workedIn", 'Indica si se teje "rounds" (en redondo) o "rows" (ida y vuelta).');
    ok = false;
  }
  if (!["flat", "tube", "circle", "yoke"].includes(ch.renderAs as string)) {
    c.error("CHART_RENDER", "chart.renderAs", "Forma de vista desconocida.");
  }
  if (ch.direction !== "bottom_up" && ch.direction !== "top_down") {
    c.error("CHART_DIRECTION", "chart.direction", 'La dirección debe ser "bottom_up" o "top_down".');
  }
  if (!Array.isArray(cells) || !isInt(width) || !isInt(height) || cells.length !== width * height) {
    c.error("CHART_CELLS_LENGTH", "chart.cells", "La cantidad de celdas no coincide con ancho × alto.");
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
    const x = firstBad % (width as number);
    const y = Math.floor(firstBad / (width as number));
    c.error("CHART_CELL_VALUE", `chart.cells[${firstBad}]`, `${bad} celda(s) tienen una lana que no existe; la primera está en la fila ${y + 1}, punto ${x + 1}.`, { count: bad, x, y });
    return;
  }
  if (stitches === 0) {
    c.error("CHART_EMPTY", "chart.cells", "El gráfico no tiene ningún punto.");
    return;
  }
  used.forEach((u, i) => {
    if (!u) c.info("YARN_UNUSED", `yarns[${i}]`, `La lana ${yarnIds[i]} no se usa en el gráfico.`);
  });
  if (!ok) return;

  const chart = ch as unknown as ChartPattern["chart"];
  for (let y = 0; y < chart.height; y++) {
    let any = false;
    for (let x = 0; x < chart.width; x++) if (cells[y * chart.width + x] !== NO_STITCH) any = true;
    if (!any) c.warn("CHART_EMPTY_ROW", `chart.cells`, `La fila ${y + 1} del motivo no tiene puntos.`, { row: y });
  }

  // Hebras flotantes: solo en palillo (colorwork de hebras). En crochet tapestry la hebra va por dentro.
  if (input.technique === "knit") {
    const gauge = input.gauge as ChartPattern["gauge"];
    const validGauge = isRec(gauge) && isNum(gauge.stitchesPer10cm) && gauge.stitchesPer10cm > 0;
    const maxStitches = validGauge
      ? Math.max(1, Math.floor(((opts.maxFloatCm ?? 2.5) * gauge.stitchesPer10cm) / 10))
      : (opts.maxFloatStitches ?? 5);
    for (let y = 0; y < chart.height; y++) {
      const floats = rowFloats(chart, y);
      if (floats.length > 2) {
        c.info("CHART_COLORS_PER_ROW", "chart.cells", `La fila ${y + 1} usa ${floats.length} colores; en colorwork de hebras lo habitual es 2 por fila.`, { row: y, colors: floats.length });
      }
      const worst = floats.reduce<(typeof floats)[number] | undefined>((a, f) => (!a || f.length > a.length ? f : a), undefined);
      if (worst && worst.length > maxStitches) {
        const cm = validGauge ? ` (≈${round2(floatLengthCm(worst.length, gauge))} cm)` : "";
        c.warn(
          "CHART_FLOAT_LONG",
          "chart.cells",
          `En la fila ${y + 1}, la lana ${yarnIds[worst.yarn]} queda suelta ${worst.length} puntos${cm}. Conviene atraparla o cambiar el dibujo (máximo sugerido: ${maxStitches}).`,
          { row: y, yarn: worst.yarn, length: worst.length, max: maxStitches },
        );
      }
    }
  }
}

// ------------------------------------------------------------ Patrón escrito

function validateWritten(input: Rec, yarnIds: string[], c: Collector) {
  if (input.technique !== "crochet") {
    c.error("WRITTEN_TECHNIQUE", "technique", "En esta versión los patrones escritos son solo de crochet; el palillo se diseña con gráfico.");
  }
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
    const pname = isStr(part.name) && part.name !== "" ? part.name : `Parte ${pi + 1}`;
    if (!isStr(part.id) || part.id === "") c.error("PART_ID", `${pp}.id`, `${pname} no tiene identificador.`);
    else if (partIds.has(part.id)) c.error("PART_DUPLICATE_ID", `${pp}.id`, `El identificador de parte "${part.id}" está repetido.`);
    else partIds.add(part.id);

    if (!["spiral", "joined", "flat"].includes(part.construction as string)) {
      c.error("PART_CONSTRUCTION", `${pp}.construction`, `${pname}: la construcción debe ser espiral, cerrada o hileras.`);
      return;
    }
    const start = part.start;
    if (!isRec(start) || (start.type !== "magic_ring" && start.type !== "chain")) {
      c.error("PART_START", `${pp}.start`, `${pname}: indica cómo empieza (anillo mágico o cadeneta).`);
      return;
    }
    if (start.type === "chain" && (!isInt(start.count) || start.count < (part.construction === "flat" ? 2 : 1))) {
      c.error("PART_START", `${pp}.start.count`, `${pname}: la cadeneta inicial necesita una cantidad válida.`);
      return;
    }
    if (!isStr(part.startYarn) || !yarnSet.has(part.startYarn)) {
      c.error("PART_START_YARN", `${pp}.startYarn`, `${pname}: la lana inicial "${String(part.startYarn)}" no existe en el patrón.`);
      return;
    }
    usedYarns.add(part.startYarn);

    const rounds = part.rounds;
    if (!Array.isArray(rounds) || rounds.length === 0) {
      c.error("PART_NO_ROUNDS", `${pp}.rounds`, `${pname} no tiene vueltas.`);
      return;
    }
    if (rounds.length > LIMITS.maxRounds) {
      c.error("LIMIT", `${pp}.rounds`, `${pname}: máximo ${LIMITS.maxRounds} vueltas.`);
      return;
    }

    // 1) Estructura de cada vuelta.
    let structureOk = true;
    let expectedNext = 1;
    rounds.forEach((r: unknown, ri: number) => {
      const rp = `${pp}.rounds[${ri}]`;
      if (!isRec(r) || !isInt(r.number) || !Array.isArray(r.items)) {
        c.error("SHAPE", rp, `${pname}: la vuelta ${ri + 1} está mal formada.`);
        structureOk = false;
        return;
      }
      const label = `${pname}, vuelta ${r.number}`;
      if (r.through !== undefined && (!isInt(r.through) || r.through < r.number)) {
        c.error("ROUND_RANGE", `${rp}.through`, `${label}: el rango de vueltas no es válido.`);
        structureOk = false;
        return;
      }
      if (r.number !== expectedNext) {
        c.error("ROUND_NUMBERING", `${rp}.number`, `${pname}: se esperaba la vuelta ${expectedNext} y aparece la ${r.number}.`, { expected: expectedNext, found: r.number });
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
        const label = `${pname}, vuelta ${n}`;
        if (count.produced > LIMITS.maxRoundStitches) {
          c.error("LIMIT", rp, `${label}: demasiados puntos (${count.produced}).`);
          return;
        }
        if (prevProduced !== null && count.consumed !== prevProduced && !rangeReported) {
          const diff = count.consumed - prevProduced;
          const what = n === 1 && typed.start.type === "chain" ? "la cadeneta inicial deja" : `la vuelta ${n - 1} dejó`;
          // En hileras, si la cadeneta para girar cuenta o no como punto depende del punto usado
          // (en punto alto suele contar; en punto bajo no). Por eso ahí es advertencia, no error.
          const flat = typed.construction === "flat";
          c.add(
            flat ? "warning" : "error",
            "ROUND_CONSUMPTION_MISMATCH",
            rp,
            `${label}: se trabaja sobre ${count.consumed} puntos, pero ${what} ${prevProduced}. ${diff > 0 ? `Sobran ${diff}` : `Faltan ${-diff}`} punto(s) en las instrucciones.${flat ? " Revisa si la cadeneta para girar cuenta como punto." : ""}`,
            { round: n, consumed: count.consumed, available: prevProduced },
          );
        }
        if (round.expected !== undefined && count.produced !== round.expected && !rangeReported) {
          c.error(
            "ROUND_COUNT_MISMATCH",
            rp,
            `${label}: el patrón dice (${round.expected}) pero las instrucciones dan ${count.produced} puntos.`,
            { round: n, expected: round.expected, actual: count.produced },
          );
        }
        if (round.expected === undefined && n === round.number) missingExpected.push(n);
        if (count.produced === 0 && n !== finalNumber) {
          c.error("ROUND_ZERO", rp, `${label} no deja puntos para la vuelta siguiente.`);
        }
        // Un rango repite la misma vuelta: solo cuadra si consume lo mismo que produce.
        // Se informa una vez y no se repiten los avisos de las vueltas siguientes del rango.
        if (n === round.number && last > round.number && count.consumed !== count.produced) {
          c.error(
            "ROUND_RANGE_CHANGES",
            rp,
            `${pname}, vueltas ${round.number}-${last}: un rango de vueltas iguales debe mantener el conteo, pero cada vuelta pasa de ${count.consumed} a ${count.produced} puntos.`,
          );
          rangeReported = true;
        }
        prevProduced = count.produced;
        yarn = count.endYarn;
      }
    });
    if (missingExpected.length > 0) {
      c.info("ROUND_NO_EXPECTED", `${pp}.rounds`, `${pname}: ${missingExpected.length} vuelta(s) no declaran su conteo final; sirve para detectar errores.`, { rounds: missingExpected });
    }
  });

  yarnIds.forEach((id, i) => {
    if (id && !usedYarns.has(id)) c.info("YARN_UNUSED", `yarns[${i}]`, `La lana ${id} no se usa en ninguna parte.`);
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
    if (item.type === "stitch") {
      if (!isStr(item.stitch) || !(item.stitch in STITCHES)) {
        c.error("STITCH_UNKNOWN", p, `${label}: punto desconocido "${String(item.stitch)}".`);
        ok = false;
      }
      if (!isInt(item.count) || item.count < 1 || item.count > LIMITS.maxItemCount) {
        c.error("ITEM_COUNT", p, `${label}: la cantidad de puntos debe ser un entero entre 1 y ${LIMITS.maxItemCount}.`);
        ok = false;
      }
      if (item.loop !== undefined && !["both", "front", "back"].includes(item.loop as string)) {
        c.error("STITCH_LOOP", p, `${label}: hebra desconocida.`);
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
      if (!isStr(item.yarn) || !yarnSet.has(item.yarn)) {
        c.error("COLOR_UNKNOWN_YARN", p, `${label}: la lana "${String(item.yarn)}" no existe en el patrón.`);
        ok = false;
      } else used.add(item.yarn);
    } else {
      c.error("SHAPE", p, `${label}: tipo de elemento desconocido.`);
      ok = false;
    }
  });
  return ok;
}

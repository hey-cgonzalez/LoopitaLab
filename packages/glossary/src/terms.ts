/**
 * Datos del glosario (ADR 0011, sección 8). Todo término está en estado "pendiente": falta
 * validarlo con una tejedora (regla de oro 5, T1b). Sin marcas ni nombres de tienda (regla de
 * oro 9) y sin variantes regionales del español sin respaldo (F4-69).
 *
 * Las abreviaturas de los puntos NO están aquí: viven en `pattern-core/src/stitches.ts`.
 */

export type GlossaryLocale = "es" | "en-US" | "en-GB";
export type TermStatus = "pendiente" | "validado";

export type TermKey =
  | "cell"
  | "round"
  | "row"
  | "gauge"
  | "magic_ring"
  | "foundation_chain"
  | "spiral"
  | "joined_rounds"
  | "increase"
  | "decrease"
  | "invisible_decrease"
  | "stuffing"
  | "quantity"
  | "fasten_off"
  | "part"
  | "turning_chain_up"
  | "join_slip_stitch"
  | "turning_chain";

/** Texto en cada idioma. `plural` es opcional: sin él, `term(..., { plural: true })` devuelve el singular. */
export interface TermText {
  name: string;
  plural?: string;
  /** Definición breve. */
  definition: string;
}

export interface TermEntry {
  key: TermKey;
  /** Nombre en español (atajo de `es.name`). */
  es: string;
  /** Otras formas en español respaldadas por el glosario pendiente o por los casos de dominio. */
  aliasesEs: readonly string[];
  /** Nombre en inglés de EE. UU. (atajo de `enUS.name`). */
  enUS: string;
  /** Nombre en inglés del Reino Unido (atajo de `enGB.name`). */
  enGB: string;
  texts: { es: TermText; "en-US": TermText; "en-GB": TermText };
  /** Todo "pendiente" hasta T1b. */
  status: TermStatus;
  /** Advertencias de uso. */
  note?: string;
  /** Verdadero si el término no corresponde a puntos que se cuentan en la vuelta (C-21). */
  notAStitch?: true;
}

const NOT_COUNTED =
  "No cuenta como punto: no suma ni resta puntos de la vuelta y no se escribe como ítem en el patrón.";

function entry(
  key: TermKey,
  es: TermText,
  enUS: TermText,
  enGB: TermText,
  extra: { aliasesEs?: readonly string[]; note?: string; notAStitch?: true } = {},
): TermEntry {
  const out: TermEntry = {
    key,
    es: es.name,
    aliasesEs: extra.aliasesEs ?? [],
    enUS: enUS.name,
    enGB: enGB.name,
    texts: { es, "en-US": enUS, "en-GB": enGB },
    status: "pendiente",
  };
  if (extra.note !== undefined) out.note = extra.note;
  if (extra.notAStitch) out.notAStitch = true;
  return out;
}

export const TERMS: readonly TermEntry[] = Object.freeze([
  // Glosario pendiente (revisión de experto-tejido, 2026-11-05)
  entry(
    "cell",
    { name: "casilla", plural: "casillas", definition: "Cada cuadro de la cuadrícula de un gráfico de colorwork." },
    { name: "square", plural: "squares", definition: "Each box of a colorwork chart grid." },
    { name: "square", plural: "squares", definition: "Each box of a colorwork chart grid." },
    { note: "En el código y en los ADR se sigue diciendo celda (cell). TODO(verificar): términos en inglés con una tejedora." },
  ),
  entry(
    "round",
    { name: "vuelta", plural: "vueltas", definition: "Recorrido completo de puntos cuando se teje en redondo (espiral o vueltas cerradas)." },
    { name: "round", plural: "rounds", definition: "One complete trip of stitches when working in the round." },
    { name: "round", plural: "rounds", definition: "One complete trip of stitches when working in the round." },
  ),
  entry(
    "row",
    { name: "fila", plural: "filas", definition: "Recorrido de puntos cuando se teje de ida y vuelta." },
    { name: "row", plural: "rows", definition: "One line of stitches when working back and forth." },
    { name: "row", plural: "rows", definition: "One line of stitches when working back and forth." },
    { aliasesEs: ["hilera"], note: "Mismo dato que la vuelta, distinta palabra según cómo se teje (workedIn)." },
  ),
  entry(
    "gauge",
    { name: "muestra", plural: "muestras", definition: "Cuántos puntos y vueltas caben en un trozo de tela de medida conocida, con tu lana y tu aguja." },
    { name: "gauge", plural: "gauges", definition: "How many stitches and rows fit in a swatch of known size, with your yarn and hook or needle." },
    { name: "tension", plural: "tensions", definition: "How many stitches and rows fit in a swatch of known size, with your yarn and hook or needle." },
    { aliasesEs: ["tensión"], note: "En UK se usa también \"tension\" para el mismo concepto. TODO(verificar)." },
  ),

  // Amigurumi (T1, casos de dominio, sección 11)
  entry(
    "magic_ring",
    { name: "anillo mágico", definition: "Inicio de una pieza en redondo: un aro de lana que se cierra tirando de la hebra, donde se tejen los primeros puntos." },
    { name: "magic ring", definition: "A starting loop for working in the round, tightened by pulling the tail after the first stitches are worked into it." },
    { name: "magic ring", definition: "A starting loop for working in the round, tightened by pulling the tail after the first stitches are worked into it." },
    {
      aliasesEs: ["anillo ajustable"],
      note: "\"Magic loop\" en inglés es también un método de tejido en redondo a palillo: no es lo mismo.",
    },
  ),
  entry(
    "foundation_chain",
    { name: "cadeneta base", definition: "Cadeneta con que se parte una pieza de hileras o un óvalo; sobre ella se tejen los primeros puntos." },
    { name: "foundation chain", definition: "The chain a flat piece or oval is started on; the first stitches are worked into it." },
    { name: "foundation chain", definition: "The chain a flat piece or oval is started on; the first stitches are worked into it." },
    { aliasesEs: ["cadeneta inicial", "base de cadenetas"] },
  ),
  entry(
    "spiral",
    { name: "espiral", definition: "Vueltas que se tejen una tras otra sin cerrarlas; se marca el primer punto de la vuelta con un marcador." },
    { name: "spiral", definition: "Rounds worked one after another without joining; a stitch marker keeps track of the start of the round." },
    { name: "spiral", definition: "Rounds worked one after another without joining; a stitch marker keeps track of the start of the round." },
    { aliasesEs: ["en espiral"], note: "TODO(verificar): nombre en inglés (\"continuous rounds\", \"working in a spiral\")." },
  ),
  entry(
    "joined_rounds",
    { name: "vueltas cerradas", definition: "Vueltas que se cierran con un punto deslizado al primer punto y suelen empezar con cadeneta de subida." },
    { name: "joined rounds", definition: "Rounds closed with a slip stitch into the first stitch, usually started with a turning chain." },
    { name: "joined rounds", definition: "Rounds closed with a slip stitch into the first stitch, usually started with a turning chain." },
    { aliasesEs: ["vueltas unidas"], note: "TODO(verificar): nombre en inglés con una tejedora." },
  ),
  entry(
    "increase",
    { name: "aumento", plural: "aumentos", definition: "Dos puntos bajos en el mismo punto de la vuelta anterior; la vuelta gana un punto." },
    { name: "increase", plural: "increases", definition: "Two single crochet stitches in the same stitch of the previous round; the round gains one stitch." },
    { name: "increase", plural: "increases", definition: "Two double crochet (UK) stitches in the same stitch of the previous round; the round gains one stitch." },
    { note: "En la v1 del motor, el aumento se entiende en punto bajo. Abreviatura: la de pattern-core (aum / inc)." },
  ),
  entry(
    "decrease",
    { name: "disminución", plural: "disminuciones", definition: "Dos puntos bajos tejidos juntos; la vuelta pierde un punto." },
    { name: "decrease", plural: "decreases", definition: "Two single crochet stitches worked together; the round loses one stitch." },
    { name: "decrease", plural: "decreases", definition: "Two double crochet (UK) stitches worked together; the round loses one stitch." },
    { note: "En la v1 del motor, la disminución se entiende en punto bajo. Abreviatura: la de pattern-core (dism / dec)." },
  ),
  entry(
    "invisible_decrease",
    { name: "disminución invisible", definition: "Disminución de punto bajo que se teje tomando solo la hebra delantera de dos puntos, para que se note menos." },
    { name: "invisible decrease", definition: "A single crochet decrease worked through the front loops only of two stitches, so it shows less." },
    { name: "invisible decrease", definition: "A double crochet (UK) decrease worked through the front loops only of two stitches, so it shows less." },
    { note: "TODO(verificar): definición de la técnica con una tejedora; el motor la trata como una disminución común." },
  ),
  entry(
    "stuffing",
    { name: "relleno", definition: "Material con que se rellena la pieza antes de cerrarla." },
    { name: "stuffing", definition: "The material a piece is filled with before closing it." },
    { name: "stuffing", definition: "The material a piece is filled with before closing it." },
    { note: "Fuera del modelo (v2): el texto libre de la parte cubre \"no rellenar\"." },
  ),
  entry(
    "quantity",
    { name: "cantidad", definition: "Cuántas veces se teje una parte igual (por ejemplo, 2 orejas)." },
    { name: "quantity", definition: "How many times an identical part is worked (for example, 2 ears)." },
    { name: "quantity", definition: "How many times an identical part is worked (for example, 2 ears)." },
    {
      aliasesEs: ["hacer", "piezas", "tejer"],
      note: "Convención de patronistas: \"Hacer 2\". La interfaz muestra \"Cantidad: 2\" y evita \"copias\" (F4-61). TODO(verificar): en inglés suele decirse \"Make 2\".",
    },
  ),
  entry(
    "fasten_off",
    { name: "cierre", definition: "Corte de la lana y remate de la última vuelta para que la pieza no se deshaga." },
    { name: "fasten off", definition: "Cutting the yarn and securing the last round so the piece does not unravel." },
    { name: "fasten off", definition: "Cutting the yarn and securing the last round so the piece does not unravel." },
    { aliasesEs: ["remate"] },
  ),
  entry(
    "part",
    { name: "parte", plural: "partes", definition: "Cada pieza del amigurumi que se teje por separado (cuerpo, ojos, orejas...)." },
    { name: "part", plural: "parts", definition: "Each separately worked piece of an amigurumi (body, eyes, ears...)." },
    { name: "part", plural: "parts", definition: "Each separately worked piece of an amigurumi (body, eyes, ears...)." },
    { aliasesEs: ["pieza"], note: "\"Parte\" en el estudio; \"pieza\" en el armado." },
  ),

  // C-21: no cuentan como puntos
  entry(
    "turning_chain_up",
    { name: "cadeneta de subida", definition: "Cadeneta con que se sube a la altura de la vuelta cerrada antes de tejer su primer punto." },
    { name: "turning chain", definition: "The chain worked at the start of a joined round to reach the height of the first stitch." },
    { name: "turning chain", definition: "The chain worked at the start of a joined round to reach the height of the first stitch." },
    { note: `${NOT_COUNTED} TODO(verificar): nombre en inglés.`, notAStitch: true },
  ),
  entry(
    "join_slip_stitch",
    { name: "pd de unión", definition: "Punto deslizado con que se cierra una vuelta cerrada, en el primer punto de la vuelta." },
    { name: "slip stitch join", definition: "The slip stitch that closes a joined round, worked into the first stitch of the round." },
    { name: "slip stitch join", definition: "The slip stitch (ss) that closes a joined round, worked into the first stitch of the round." },
    { aliasesEs: ["punto deslizado de unión"], note: `${NOT_COUNTED} TODO(verificar): nombre en inglés.`, notAStitch: true },
  ),
  entry(
    "turning_chain",
    { name: "cadeneta de giro", definition: "Cadeneta que se teje al final de una hilera para dar vuelta la labor y subir a la altura de la hilera siguiente." },
    { name: "turning chain", definition: "The chain worked at the end or start of a row to turn the work and reach the height of the next row." },
    { name: "turning chain", definition: "The chain worked at the end or start of a row to turn the work and reach the height of the next row." },
    { note: `${NOT_COUNTED} TODO(verificar): nombre en inglés.`, notAStitch: true },
  ),
]);

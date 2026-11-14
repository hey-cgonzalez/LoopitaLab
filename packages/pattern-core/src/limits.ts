/**
 * Límites que protegen al motor de entradas desmedidas (por ejemplo, JSON de la IA).
 * Se exportan desde `validate.ts`; viven aparte para que `written.ts` los use sin un
 * import circular.
 */
export const LIMITS = {
  /** Lado máximo del motivo en casillas (ADR 0003, E7). `EDIT_LIMITS` deriva de aquí. */
  maxMotifSide: 200,
  maxCells: 250_000,
  maxRepeat: 500,
  maxYarns: 32,
  maxParts: 50,
  /**
   * Vueltas por parte, contando cada vuelta de un rango ("V5–8" son 4). También es el
   * número de vuelta más alto aceptado (`number` y `through`).
   */
  maxRounds: 1_000,
  maxItemCount: 5_000,
  maxGroupTimes: 500,
  maxNesting: 6,
  maxRoundStitches: 50_000,
  /** Largo del título en caracteres, igual que la columna `patterns.title` (`char_length`). */
  maxTitleLength: 120,
  /*
   * Textos libres (F5). Se cuentan en puntos de código, como el título. Los topes son
   * holgados para un patrón real y acotan lo que la IA o un JSON manipulado pueden meter
   * en el documento y en los derivados (texto escrito, PDF, modo tejiendo).
   */
  /** Identificadores internos: `id` del patrón y de cada parte, `fiber` y `paletteId` (un UUID mide 36). */
  maxIdLength: 64,
  /** Nombre de una parte ("Cuerpo", "Oreja izquierda"); una sola línea. */
  maxPartNameLength: 80,
  /** Nota de una vuelta. */
  maxRoundNoteLength: 500,
  /** Instrucción de cierre de una parte ("rellenar y cerrar"). */
  maxFinishLength: 500,
  /** Nota privada de una lana ("la lana que tengo"). */
  maxYarnNoteLength: 500,
  /** Cada nota del patrón (`notes[i]`) y cada paso de armado (`assembly[i]`). */
  maxNoteLength: 2_000,
  /** Cantidad de notas del patrón y de pasos de armado (cada lista por separado). */
  maxNotes: 50,
  /** `origin.model` y `origin.promptVersion`: identificadores técnicos del pipeline de IA. */
  maxOriginFieldLength: 100,
  /*
   * Topes duros de la v2 (ADR 0011, sección 3). Protegen al motor; no son los límites
   * recomendados de la sección 3b (`RECOMMENDED_WRITTEN_LIMITS`), que solo advierten.
   * Subirlos después es compatible; bajarlos, no.
   */
  /** Veces que se teje una parte (`Part.copies`). Recomendado: 10. */
  maxCopies: 50,
  /** Largo máximo de una cadena de anclas (pieza cosida a pieza cosida a…). */
  maxLayoutDepth: 16,
  /** Cota de cada componente de `FreeAt.positionCm`, en cm. */
  maxPositionCm: 1_000,
  /** Cota de `SurfaceAt.offsetCm`, en cm. */
  maxOffsetCm: 100,
  /** Cota de cada componente de una rotación, en grados (de −180 a 180). */
  maxRotationDeg: 180,
  /** Entradas de `layout.placements`: una por copia de cada parte (`maxParts × maxCopies`). */
  maxPlacements: 2_500,
} as const;

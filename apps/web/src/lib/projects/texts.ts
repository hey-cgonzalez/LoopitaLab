import { yarnLetter } from "@loopitalab/pattern-core";
import type { ChartPointer, ColorRun } from "@loopitalab/follow";
import { PROJECT_MESSAGES, conflictSentence, positionText, rowWord, type WorkedIn } from "./messages.ts";
import type { NotInChartKey } from "./types.ts";
import { STUDIO_TEXTS, directionName, shapeName, workedInName } from "../studio-texts.ts";

/*
 * Textos de "Tejer este diseño", de la lista y la ficha de proyectos y de la pantalla "Tejiendo" (T12 de la fase 3).
 * Mismas reglas que studio-texts.ts: solo texto y formato; los conteos llegan de `follow` y de `pattern-core`.
 *
 * Terminología (ADR 0007, enmiendas T1-2 a T1-5; ADR 0009, T1-2):
 *  - "vuelta" con `workedIn: "rounds"` y "fila" con `workedIn: "rows"` (`rowWord`); nunca "vuelta" para una fila plana;
 *  - en filas por el revés se dice "por el revés, de izquierda a derecha" y que los colores del gráfico son los del
 *    derecho; nunca que "se invierten"; en crochet no se afirma "punto revés";
 *  - "Gráfico terminado", nunca "Pieza terminada";
 *  - "casillas N a M de T" (la repetición en curso) en filas con disminuciones o aumentos: el avance va de a una
 *    repetición, así que no se afirma una casilla exacta (T18, R1). Con una sola repetición no se muestra;
 *  - la lectura para lector de pantalla dice "3 de la lana A, 2 de la lana B"; "3 A · 2 B" es solo visual (T18, R6).
 * Los términos marcados `// validar con tejedora` esperan la revisión de T1b.
 */

export { rowWord, positionText };

export const PROJECT_TEXTS = {
  /** Botón que abre la pantalla previa. */
  tejer: {
    boton: "Tejer este diseño",
    botonCorto: "Tejer",
    abriendo: "Preparando…",
    empezando: "Creando el proyecto…",
    cancelar: "Cancelar",
    /** «Tejer este diseño» desde el estudio (`StudioShell`): el autoguardado no pudo vaciarse. */
    guardarAntes: "Antes de tejer hay que guardar los cambios, y todavía no se pudo. Revisa el estado del guardado.",
    confirmar: "Empezar a tejer",
    tituloDialogo: "Antes de empezar",
    tituloProyecto: "Nombre del proyecto (opcional)",
    tituloProyectoAyuda: "Si lo dejas vacío, el proyecto se llama como el diseño.",
    noSePuede: "Este diseño todavía no se puede tejer",
    noSePuedeAyuda: "Corrige estos errores de tejido en el estudio y vuelve a intentar:",
    irAlEstudio: "Abrir en el estudio",
    sinRed: "No pudimos preparar el proyecto. Revisa tu conexión e intenta de nuevo.",
    sinRedCrear: "No pudimos crear el proyecto. Revisa tu conexión e intenta de nuevo.",
    cambioMientras: "El diseño cambió mientras esta pantalla estaba abierta. Se volvieron a calcular los datos: revísalos y confirma de nuevo.",
    recalculando: "Recalculando…",
    listo: "Proyecto creado. Abriendo la pantalla de tejido…",
    muestra: "Muestra usada",
    muestraSupuesta: "supuesta",
    muestraSupuestaAyuda: "No ingresaste tu muestra: se usa la de referencia del grosor de la lana A, rotulada como supuesta.",
    muestraPropia: "la que ingresaste en el diseño",
    formaDeTrabajo: "Cómo se teje",
    metraje: "Metraje estimado por lana",
    metrajeCrochet: STUDIO_TEXTS.metraje.sinEstimacionCrochet,
    advertencias: "Advertencias (no impiden tejer)",
    noEnGrafico: "Lo que el gráfico no incluye",
    prototipo: "La vista previa y los cálculos son una aproximación. Teje una muestra para comprobar la tensión y las proporciones antes de empezar la pieza.",
    /** F3-40 (`CHART_ROWS_SHAPE`). */
    idaYVueltaYCose: "Se teje de ida y vuelta y se cose para cerrar la forma.", // validar con tejedora
  },

  /** Lo que no está en el gráfico (ADR 0009, T1-7, punto 5; T18, M1). La lista según la técnica la da `notInChartFor`. */
  noEnGrafico: {
    cast_on: "Montaje de los puntos", // validar con tejedora
    edging: "Elástico, borde u orillo", // validar con tejedora
    bind_off: "Cerrar los puntos", // validar con tejedora
    foundation: "Cadeneta base o anillo mágico", // validar con tejedora
    turning_chain: "Cadeneta de vuelta al empezar cada fila", // validar con tejedora
    fasten_off: "Remate: cortar y pasar la hebra", // validar con tejedora
    prior_shaping: "Aumentos o disminuciones previos, forma del cuello o sisa", // validar con tejedora
    assembly: "Armado y costuras", // validar con tejedora
  } satisfies Record<NotInChartKey, string>,

  /** Lista y ficha de proyectos. */
  proyectos: {
    titulo: "Tus proyectos",
    subtitulo: "Cada proyecto sigue una versión fijada de un diseño y guarda tu avance en todos tus dispositivos. Para empezar uno con patrón, abre un diseño y usa «Tejer este diseño»: el proyecto se crea con la versión que tengas guardada.",
    vacio: "Todavía no tienes proyectos. Para empezar uno con patrón, abre un diseño en Mis diseños y usa «Tejer este diseño». También puedes crear uno suelto con el nombre de lo que quieres tejer.",
    errorCarga: "No pudimos cargar tus proyectos. Recarga la página para intentarlo de nuevo.",
    irAProyectos: "Ir a tus proyectos",
    borrarCorto: "Borrar",
    borrarDe: (title: string) => `Borrar ${title}`,
    confirmarBorradoDe: (title: string) => `Confirmar borrado de ${title}`,
    estadoDe: (title: string) => `Estado de ${title}`,
    actualizadoEl: (date: string) => `actualizado el ${date}`,
    soloEstado: "Este proyecto guarda solo su estado.",
    sinDiseno: "Sin diseño asociado",
    version: "Versión fijada",
    versionCorta: (n: number) => `versión ${n}`,
    hayMasNueva: "El diseño tiene cambios posteriores a la versión fijada.",
    hayMasNuevaCorta: "Hay una versión más nueva del diseño",
    seguirTejiendo: "Seguir tejiendo",
    empezarATejer: "Empezar a tejer",
    verFicha: "Ver proyecto",
    borrar: "Borrar proyecto",
    borrarPregunta: (title: string) => `¿Borrar «${title}»? Se pierde el avance guardado y no se puede deshacer.`,
    borrarConfirmar: "Sí, borrar",
    borrado: (title: string) => `Borraste «${title}».`,
    diseno: "Diseño",
    avance: "Avance",
    actualizado: "Actualizado",
    estado: "Estado",
    guardarEstado: "Guardar",
    terminadoPropuesta: "Terminaste el gráfico. Cuando remates la pieza, puedes marcar el proyecto como terminado.",
    marcarTerminado: "Marcar como terminado",
    versionNoValida:
      "Esta versión del diseño ya no pasa una regla nueva de revisión. Puedes seguir tejiendo con cuidado; para corregirla, edita el diseño y pasa el proyecto a la versión actual.", // F3-42
    noSavable: PROJECT_MESSAGES.NOT_SAVABLE, // F3-42 (una sola fuente: lib/projects/messages.ts)
  },

  /** "Pasar a la versión actual" (ADR 0007 §5, ADR 0009). */
  repin: {
    boton: "Pasar a la versión actual",
    titulo: "Pasar a la versión actual del diseño",
    revisando: "Comparando con el diseño actual…",
    igual: "El diseño actual es idéntico a la versión fijada: no hay nada que cambiar.",
    /** T18, R7. `where` es `positionText` del puntero reubicado ("la fila 5"). // validar con tejedora */
    conservaFila: (workedIn: WorkedIn, where: string) =>
      `Tu avance queda en ${where}. Solo se compara la ${rowWord(workedIn)} en la que vas: si cambiaste ${rowWord(workedIn)}s anteriores o el ancho, lo que ya tejiste puede no coincidir.`,
    filaCambio: (workedIn: WorkedIn) => `La ${rowWord(workedIn)} en la que vas se teje distinto en la versión nueva: revisa que tu tejido coincida antes de seguir.`, // F3-12
    acotado: "La versión nueva es más corta: tu avance queda al final del gráfico (gráfico terminado).", // ADR 0007, enmienda T4-3; validar con tejedora
    casillasACero: (workedIn: WorkedIn) => `El avance dentro de la ${rowWord(workedIn)} vuelve al inicio de la ${rowWord(workedIn)}.`,
    cerrar: "Cerrar",
    versiones: (version: number, fromRows: string, toRows: string) => `Versión fijada: ${version} (${fromRows}). Versión nueva: ${toRows}.`,
    avanceAntesDespues: (before: string, after: string) => `Tu avance ahora: ${before}. Después del cambio: ${after}.`,
    confirmar: "Pasar a la versión actual",
    listo: (version: number) => `Listo: el proyecto ahora sigue la versión ${version}.`,
    conflicto: "Tu avance cambió en otro dispositivo mientras preparabas el cambio. Recarga la página y vuelve a intentar.",
  },

  /** Pantalla "Tejiendo". */
  tejiendo: {
    titulo: "Tejiendo",
    volver: "← Proyecto",
    noSePudoAbrir: "No pudimos abrir este proyecto para tejer",
    volverAlProyecto: "Volver al proyecto",
    siguiente: "Siguiente",
    anterior: "Anterior",
    /** Nombres accesibles de los botones grandes (T18, M3): contienen el texto visible. */
    siguienteEtiqueta: (workedIn: WorkedIn) => `${capital(rowWord(workedIn))} siguiente`,
    anteriorEtiqueta: (workedIn: WorkedIn) => `${capital(rowWord(workedIn))} anterior`,
    repeticionSiguiente: "Repetición siguiente",
    repeticionAnterior: "Repetición anterior",
    repeticion: "Repetición",
    repeticiones: "repeticiones",
    tramos: "Tramos de una repetición",
    ladoDerecho: "por el derecho",
    ladoReves: "por el revés",
    deDerechaAIzquierda: "de derecha a izquierda",
    deIzquierdaADerecha: "de izquierda a derecha",
    coloresDelDerecho: "Los colores del gráfico son los que se ven por el derecho.", // F3-10; validar con tejedora
    espejo: "Lectura en espejo (preferencia de tu cuenta).",
    graficoConFila: (workedIn: WorkedIn) => `Gráfico con la ${rowWord(workedIn)} actual`,
    grafico: "Gráfico",
    vistaPrevia: "Vista previa",
    graficoTerminado: "Gráfico terminado",
    graficoTerminadoAyuda: "Tejiste todas las filas del gráfico.", // F3-7
    graficoTerminadoAyudaRedondo: "Tejiste todas las vueltas del gráfico.", // F3-7
    /** Cierre según técnica, forma y dirección (T18, R4). // validar con tejedora */
    cerrarCopa: (n: number) => `Pasa la hebra por ${n === 1 ? "el punto" : `los ${n} puntos`} y tira para cerrar la copa.`, // validar con tejedora
    cerrarPuntos: (n: number) => `${n === 1 ? "Queda 1 punto: ciérralo." : `Quedan ${n} puntos: ciérralos.`}`, // validar con tejedora
    bordeArriba: (n: number) => `${n === 1 ? "Queda 1 punto en el borde: falta el elástico o borde y cerrarlo." : `Quedan ${n} puntos en el borde: falta el elástico o borde y cerrarlos.`}`, // validar con tejedora
    rematarCrochet: "Corta la hebra y pásala por el último lazo. Si es una copa, pásala por los puntos de la última vuelta y tira.", // validar con tejedora
    faltaCerrar: "Falta rematar o cerrar la pieza.",
    /** Leyenda del gráfico en `top_down` (T18, M4). */
    leyendaArribaAbajo: "El gráfico se lee de abajo hacia arriba, en el orden en que se teje. La vista previa muestra la pieza como queda puesta.", // validar con tejedora
    sinPuntos: (workedIn: WorkedIn) => `Esta ${rowWord(workedIn)} no tiene puntos: pasa a la siguiente.`,
    atajos: "Teclas: flechas, Espacio o Enter avanzan; Retroceso retrocede. Av Pág y Re Pág (o un pasapáginas Bluetooth) también sirven. Con Mayús, las flechas mueven por repetición.",
    pantallaEncendida: "Pantalla encendida",
    pantallaEncendidaAyuda: "Evita que la pantalla se apague mientras tejes. Se recuerda en este dispositivo.",
    pantallaNoSoportada: "Este navegador no permite mantener la pantalla encendida.",
    versionCambio: "Este proyecto cambió de versión en otro dispositivo. Recarga la pantalla para seguir con la versión nueva.",
    recargar: "Recargar",
    /** Botones de avance (T13): grupo y mano. */
    avanzarGrupo: "Avanzar en el patrón",
    manoIzquierda: "Botones para zurda",
    manoIzquierdaAyuda: "Pone «Siguiente» a la izquierda, al alcance del pulgar izquierdo. Se recuerda en este dispositivo; si no la cambias, se usa la mano de tu cuenta.",
    pantallaNoSePudo: "No se pudo mantener la pantalla encendida. Puede apagarse sola mientras tejes.",
    /** Repeticiones de la fila (T13): lista con texto accesible. */
    repeticionesDeFila: (workedIn: WorkedIn) => `Repeticiones de esta ${rowWord(workedIn)}`,
    /** Tarjeta de la fila actual. */
    puntosPorRepeticion: (n: number) => `${n} ${n === 1 ? "punto" : "puntos"} por repetición`,
    puntosEnLa: (workedIn: WorkedIn, n: number) => `${n} ${n === 1 ? "punto" : "puntos"} en la ${rowWord(workedIn)}`,
    enLa: (workedIn: WorkedIn, n: number) => `${n} en la ${rowWord(workedIn)}`,
    puntosMenos: (n: number) => `${n} ${n === 1 ? "punto menos" : "puntos menos"} que la anterior`,
    masTramos: (n: number) => `y ${n} ${n === 1 ? "tramo más" : "tramos más"}`,
    repeticionActualTexto: "actual",
    repeticionHechaTexto: "hecha",
    repeticionPorHacerTexto: "por hacer",
    /** Texto alternativo del gráfico (T13). */
    graficoEnTexto: "Ver el gráfico en texto",
    graficoEnTextoAyuda: "Una fila por línea, empezando por la primera que se teje. Los colores son los que se ven por el derecho; cada letra es una lana.",
    graficoTablaTitulo: "Colores de cada fila del gráfico",
    columnaFila: "Fila",
    columnaVuelta: "Vuelta",
    columnaLado: "Lado y sentido",
    columnaPuntos: "Puntos",
    columnaColores: "Colores de una repetición",
    filaActualTexto: "(la que tejes ahora)",
    /** Conflicto de avance (T13): ayuda de teclado del diálogo obligatorio. */
    conflictoAyuda: "Elige una opción para seguir. Esta pregunta no se puede cerrar sin elegir.",
    actualizadoDesdeOtro: (where: string) => `Se actualizó desde otro dispositivo: vas en ${where}.`,
  },

  /** Estado del guardado del avance (ADR 0009 §4). */
  avance: {
    guardado: "Avance guardado",
    guardando: "Guardando el avance…",
    pendiente: "Avance por guardar",
    sinConexion: "Sin conexión: tu avance se guardará al volver",
    reintentando: "No se pudo guardar el avance: reintentando",
    conflicto: "Conflicto de avance",
    fallo: "No se pudo guardar el avance",
    conflictoTitulo: "¿Con cuál sigues?",
    seguirAqui: "Seguir con la de aquí",
    seguirOtro: "Seguir con la del otro dispositivo",
  },
} as const;

/** Estados de un proyecto (`projects.status`). */
export const STATUS_LABEL = {
  planned: "Por empezar",
  in_progress: "Tejiendo",
  paused: "En pausa",
  finished: "Terminado",
} as const;

// ------------------------------------------------------------------ contadores

/** "Vuelta 12 de 60" / "Fila 12 de 60". `number` ya viene en base 1 (de `step.number`). */
export function rowCounterText(workedIn: WorkedIn, number: number, totalRows: number): string {
  return `${capital(rowWord(workedIn))} ${number} de ${totalRows}`;
}

/** "8 vueltas" / "1 fila": la unidad en singular o plural según `workedIn`. Única fuente de "vuelta"/"fila" con número. */
export function rowCountText(workedIn: WorkedIn, n: number): string {
  const w = rowWord(workedIn);
  return `${n} ${n === 1 ? w : `${w}s`}`;
}

/** Resumen del avance para la lista y la ficha: "Vuelta 12 de 60" o "Gráfico terminado". */
export function progressSummaryText(workedIn: WorkedIn | undefined, totalRows: number, p: ChartPointer): string {
  if (totalRows > 0 && p.rowsDone >= totalRows) return PROJECT_TEXTS.tejiendo.graficoTerminado;
  return rowCounterText(workedIn ?? "rounds", p.rowsDone + 1, totalRows);
}

/**
 * Lado y sentido: "por el derecho, de derecha a izquierda" / "por el revés, de izquierda a derecha" (F3-10).
 * En redondo siempre por el derecho. `follow` entrega `side` y `reading` (con el espejo ya aplicado): no se deduce nada.
 */
export function sideAndReadingText(side: "right" | "wrong", reading: "right_to_left" | "left_to_right"): string {
  const T = PROJECT_TEXTS.tejiendo;
  return `${side === "wrong" ? T.ladoReves : T.ladoDerecho}, ${reading === "right_to_left" ? T.deDerechaAIzquierda : T.deIzquierdaADerecha}`;
}

/** "3 A · 2 B · 3 A": solo visual. Las letras salen de `yarnLetter` (pattern-core). Una fila sin puntos da "". */
export function runsText(runs: readonly ColorRun[]): string {
  return runs.map((r) => `${r.count} ${yarnLetter(r.yarn)}`).join(" · ");
}

/** Máximo de tramos que se leen en voz alta en el anuncio completo (T18, M5). */
export const SPOKEN_RUNS_MAX = 5;

/**
 * Lectura para lector de pantalla (T18, R6): "3 de la lana A, 2 de la lana B". Con más de `max` tramos, "… y 4 tramos
 * más" (M5). Una fila sin puntos da "".
 */
export function runsSpoken(runs: readonly ColorRun[], max: number = Number.POSITIVE_INFINITY): string {
  const shown = runs.slice(0, max).map((r) => `${r.count} de la lana ${yarnLetter(r.yarn)}`);
  const rest = runs.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} ${PROJECT_TEXTS.tejiendo.masTramos(rest)}` : shown.join(", ");
}

/** "repetición 3 de 8" (índice en base 0, como `position().horizontalRepeat.index`). */
export function repeatCounterText(index: number, of: number): string {
  return `${PROJECT_TEXTS.tejiendo.repeticion.toLowerCase()} ${index + 1} de ${of}`;
}

/**
 * "casillas 10 a 18 de 72" (T18, R1): las casillas de la repetición en curso (`position().repeatCells`, de `follow`).
 * El avance va de a una repetición, así que no se afirma una casilla exacta. Nunca "puntos tejidos". // validar con tejedora
 */
export function repeatCellsText(cells: { first: number; last: number; of: number }): string {
  const u = STUDIO_TEXTS.unidades.casilla;
  return cells.first === cells.last ? `${u} ${cells.first} de ${cells.of}` : `${u}s ${cells.first} a ${cells.last} de ${cells.of}`;
}

/** Lo que `shapingText` necesita de un paso de `follow`. */
export interface ShapingStep {
  decreases: number;
  increases: number;
  decreaseBefore: readonly number[];
  increaseAt: readonly number[];
  stitchesPerRepeat: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Agrupa posiciones iguales y consecutivas: [3, 3, 7] -> [{ at: 3, n: 2 }, { at: 7, n: 1 }]. */
function groupPositions(list: readonly number[]): { at: number; n: number }[] {
  const out: { at: number; n: number }[] = [];
  for (const at of list) {
    const last = out[out.length - 1];
    if (last && last.at === at) last.n++;
    else out.push({ at, n: 1 });
  }
  return out;
}

/**
 * Disminuciones y aumentos de la fila (T18, R2 y R3), con los conteos y las posiciones que da `follow`
 * (`decreases`, `decreaseBefore`, `increases`, `increaseAt`). Dice cuántos y dónde, nunca la técnica ("2 juntos"):
 * eso espera la capa de símbolos (ADR 0007). Devuelve las frases (vacío si la fila no cambia).
 * "Disminuye 8 puntos en la fila (1 por repetición). Se pierde un punto antes de la casilla 3 de cada repetición."
 * // validar con tejedora
 */
export function shapingText(workedIn: WorkedIn, step: ShapingStep, repeatX: number): string[] {
  const w = rowWord(workedIn);
  const scope = repeatX > 1 ? "de cada repetición" : `de la ${w}`;
  const out: string[] = [];
  if (step.decreases > 0) {
    const per = step.decreaseBefore.length;
    out.push(`Disminuye ${plural(step.decreases, "punto", "puntos")} en la ${w}${repeatX > 1 ? ` (${per} por repetición)` : ""}.`);
    const groups = groupPositions(step.decreaseBefore);
    const place = (at: number) => (at > step.stitchesPerRepeat ? "al final" : `antes de la casilla ${at}`);
    if (groups.every((g) => g.n === 1)) {
      out.push(`Se pierde un punto ${listJoin(groups.map((g) => place(g.at)))} ${scope}.`);
    } else {
      out.push(`Se pierden puntos ${scope}: ${listJoin(groups.map((g) => `${g.n} ${place(g.at)}`))}.`);
    }
  }
  if (step.increases > 0) {
    const per = step.increaseAt.length;
    out.push(`Aumenta ${plural(step.increases, "punto", "puntos")} en la ${w}${repeatX > 1 ? ` (${per} por repetición)` : ""}.`);
    const at = step.increaseAt;
    out.push(at.length === 1 ? `La casilla ${at[0]} ${scope} es un punto nuevo.` : `Las casillas ${listJoin(at.map(String))} ${scope} son puntos nuevos.`);
  }
  return out;
}

/** Anuncio corto para la región viva al avanzar: "Vuelta 13 de 60: 3 de la lana A, 2 de la lana B". */
export function rowAnnouncement(workedIn: WorkedIn, number: number, totalRows: number, runs: readonly ColorRun[]): string {
  const t = runsSpoken(runs, SPOKEN_RUNS_MAX);
  return t ? `${rowCounterText(workedIn, number, totalRows)}: ${t}` : rowCounterText(workedIn, number, totalRows);
}

/**
 * Anuncio completo al cambiar de fila (CA3-A1; T18, M5): número, lado, sentido, puntos y repeticiones, forma y lanas
 * (hasta 5 tramos). "Vuelta 13 de 60, por el derecho, de derecha a izquierda, 36 puntos en 8 repeticiones. En cada
 * repetición: 3 de la lana A, 2 de la lana B."
 */
export function rowAnnouncementFull(
  workedIn: WorkedIn,
  step: { number: number; side: "right" | "wrong"; reading: "right_to_left" | "left_to_right"; stitches: number; runs: readonly ColorRun[] } & Partial<ShapingStep>,
  totalRows: number,
  repeatX: number,
): string {
  const head = `${rowCounterText(workedIn, step.number, totalRows)}, ${sideAndReadingText(step.side, step.reading)}`;
  if (step.stitches === 0) return `${head}. ${PROJECT_TEXTS.tejiendo.sinPuntos(workedIn)}`;
  const points = `${plural(step.stitches, "punto", "puntos")}${repeatX > 1 ? ` en ${repeatX} ${PROJECT_TEXTS.tejiendo.repeticiones}` : ""}`;
  const shaping =
    step.decreases !== undefined && step.increases !== undefined && step.decreaseBefore && step.increaseAt && step.stitchesPerRepeat !== undefined
      ? shapingText(workedIn, step as ShapingStep, repeatX)
      : [];
  const runs = runsSpoken(step.runs, SPOKEN_RUNS_MAX);
  return [`${head}, ${points}.`, ...shaping, `${repeatX > 1 ? "En cada repetición: " : "Colores: "}${runs}.`].join(" ");
}

/** Anuncio al pasar de repetición dentro de la misma fila: "Repetición 3 de 8 de la vuelta 13: 3 de la lana A, 2 de la lana B". */
export function repeatAnnouncement(workedIn: WorkedIn, number: number, index: number, of: number, runs: readonly ColorRun[]): string {
  const t = runsSpoken(runs, SPOKEN_RUNS_MAX);
  const base = `${PROJECT_TEXTS.tejiendo.repeticion} ${index + 1} de ${of} de la ${rowWord(workedIn)} ${number}`;
  return t ? `${base}: ${t}` : base;
}

/** Texto accesible de un punto de la lista de repeticiones: "repetición 3 (actual)". */
export function repeatDotText(i: number, current: number): string {
  const T = PROJECT_TEXTS.tejiendo;
  return `${T.repeticion.toLowerCase()} ${i + 1} (${i === current ? T.repeticionActualTexto : i < current ? T.repeticionHechaTexto : T.repeticionPorHacerTexto})`;
}

/**
 * Texto de "Gráfico terminado" (F3-7, T1-4; T18, R4): el cierre depende de la técnica, la forma y la dirección.
 * `lastStitches` viene de `stepAt(plan, totalRows − 1).stitches`. Nunca "Pieza terminada". // validar con tejedora
 */
export function finishedText(opts: {
  technique: "knit" | "crochet";
  workedIn: WorkedIn;
  direction: "bottom_up" | "top_down";
  renderAs: string;
  lastStitches: number | null;
}): string {
  const T = PROJECT_TEXTS.tejiendo;
  const base = opts.workedIn === "rounds" ? T.graficoTerminadoAyudaRedondo : T.graficoTerminadoAyuda;
  if (opts.technique === "crochet") return `${base} ${T.rematarCrochet}`;
  const n = opts.lastStitches;
  if (n === null || n <= 0) return `${base} ${T.faltaCerrar}`;
  if (opts.direction === "top_down") return `${base} ${T.bordeArriba(n)}`;
  if (opts.renderAs === "circle") return `${base} ${T.cerrarCopa(n)}`;
  return `${base} ${T.cerrarPuntos(n)}`;
}

function capital(t: string): string {
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

// ------------------------------------------------------------------ pantalla previa

/** "En redondo, de abajo hacia arriba, 60 vueltas en total (tubo)". Los números vienen de `planChart`. */
export function workShapeText(workedIn: WorkedIn, direction: "bottom_up" | "top_down", renderAs: string, totalRows: number): string {
  const shape = renderAs === "flat" || renderAs === "tube" || renderAs === "circle" || renderAs === "yoke" ? shapeName(renderAs) : renderAs;
  return `${workedInName(workedIn)}, ${directionName(direction).toLowerCase()}: ${rowCountText(workedIn, totalRows)} en total (${shape.toLowerCase()}).`;
}

/**
 * "20 puntos × 28 vueltas en 10 cm (supuesta)" (T18, R5): "vueltas" o "filas" según `workedIn`.
 * // validar con tejedora: la muestra a menudo se mide en plano aunque la pieza se teja en redondo.
 */
export function gaugeText(g: { stitchesPer10cm: number; rowsPer10cm: number; assumed: boolean }, workedIn: WorkedIn): string {
  const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  return `${fmt(g.stitchesPer10cm)} ${STUDIO_TEXTS.unidades.puntos} × ${fmt(g.rowsPer10cm)} ${rowWord(workedIn)}s en 10 cm${g.assumed ? ` (${PROJECT_TEXTS.tejer.muestraSupuesta})` : ""}`;
}

/** "Motivo de 8 × 8, repetido 12 veces a lo ancho y sin repetir a lo alto." (T18, M7). */
export function motifText(width: number, height: number, repeatX: number, repeatY: number): string {
  const head = `Motivo de ${width} × ${height}`;
  if (repeatX === 1 && repeatY === 1) return `${head}, sin repetir.`;
  const part = (n: number, where: string) => (n === 1 ? `sin repetir ${where}` : `repetido ${n} veces ${where}`);
  return `${head}, ${part(repeatX, "a lo ancho")} y ${part(repeatY, "a lo alto")}.`;
}

// ------------------------------------------------------------------ conflicto y tiempo relativo

/** "hace 3 min", "hace 2 h", "hace 4 días", "recién". `null` o una fecha ilegible dan "". */
export function relativeTimeText(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "recién";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/**
 * Pregunta del conflicto (F3-41, O-2 de QA): "En otro dispositivo vas en la vuelta 40 (hace 3 min). Aquí vas en la
 * vuelta 36. ¿Con cuál sigues?". Dice "fila" en ida y vuelta.
 */
export function conflictQuestionText(workedIn: WorkedIn | undefined, totalRows: number, theirs: ChartPointer, theirsAt: string | null, yours: ChartPointer, now: number = Date.now()): string {
  const when = relativeTimeText(theirsAt, now);
  return conflictSentence(workedIn, totalRows, theirs, yours, when ? ` (${when})` : "");
}

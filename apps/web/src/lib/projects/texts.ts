import { yarnLetter } from "@loopitalab/pattern-core";
import type { ChartPointer, ColorRun } from "@loopitalab/follow";
import { positionText, rowWord, type WorkedIn } from "./messages.ts";
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
 *  - "casilla N de M" en filas con disminuciones (las casillas producidas, no los puntos que salen de la aguja).
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

  /** Lo que no está en el gráfico (ADR 0009, T1-7, punto 5). */
  noEnGrafico: {
    cast_on: "Montaje de los puntos", // validar con tejedora
    edging: "Elástico, borde u orillo", // validar con tejedora
    bind_off: "Remate o cierre de los puntos", // validar con tejedora
    assembly: "Armado y costuras", // validar con tejedora
  },

  /** Lista y ficha de proyectos. */
  proyectos: {
    titulo: "Tus proyectos",
    subtitulo: "Cada proyecto sigue una versión fijada de un diseño y guarda tu avance en todos tus dispositivos.",
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
    noEncontrado: "No encontramos ese proyecto. Puede que lo hayas borrado desde otro dispositivo.",
    diseno: "Diseño",
    avance: "Avance",
    actualizado: "Actualizado",
    estado: "Estado",
    guardarEstado: "Guardar",
    terminadoPropuesta: "Terminaste el gráfico. Cuando remates la pieza, puedes marcar el proyecto como terminado.",
    marcarTerminado: "Marcar como terminado",
    versionNoValida:
      "Esta versión del diseño ya no pasa una regla nueva de revisión. Puedes seguir tejiendo con cuidado; para corregirla, edita el diseño y pasa el proyecto a la versión actual.", // F3-42
    noSavable: "Esta versión del diseño no se puede abrir con las reglas actuales. No se puede seguir tejiendo con ella.", // F3-42
  },

  /** "Pasar a la versión actual" (ADR 0007 §5, ADR 0009). */
  repin: {
    boton: "Pasar a la versión actual",
    titulo: "Pasar a la versión actual del diseño",
    revisando: "Comparando con el diseño actual…",
    igual: "El diseño actual es idéntico a la versión fijada: no hay nada que cambiar.",
    conservaFila: "Tu avance se conserva en el mismo número de fila.",
    filaCambio: "La fila en la que vas se teje distinto en la versión nueva: revisa que tu tejido coincida antes de seguir.", // F3-12
    acotado: "La versión nueva es más corta: tu avance queda al final del gráfico (gráfico terminado).", // ADR 0007, enmienda T4-3; validar con tejedora
    casillasACero: "El avance dentro de la fila vuelve al inicio de la fila.",
    confirmar: "Pasar a la versión actual",
    listo: (version: number) => `Listo: el proyecto ahora sigue la versión ${version}.`,
    conflicto: "Tu avance cambió en otro dispositivo mientras preparabas el cambio. Recarga la página y vuelve a intentar.",
  },

  /** Pantalla "Tejiendo". */
  tejiendo: {
    titulo: "Tejiendo",
    volver: "← Proyecto",
    siguiente: "Siguiente",
    anterior: "Anterior",
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
    grafico: "Gráfico con la fila actual",
    vistaPrevia: "Vista previa",
    graficoTerminado: "Gráfico terminado",
    graficoTerminadoAyuda: "Tejiste todas las filas del gráfico. Falta rematar o cerrar la pieza.", // F3-7
    graficoTerminadoAyudaRedondo: "Tejiste todas las vueltas del gráfico. Falta rematar o cerrar la pieza.", // F3-7
    quedanPuntos: (n: number) => `Quedan ${n} ${n === 1 ? "punto" : "puntos"} de la última vuelta para rematar o cerrar.`, // F3-7 (bottom_up); validar con tejedora
    quedanPuntosFila: (n: number) => `Quedan ${n} ${n === 1 ? "punto" : "puntos"} de la última fila para rematar o cerrar.`, // validar con tejedora
    sinPuntos: "Esta fila no tiene puntos: pasa a la siguiente.",
    atajos: "Teclas: flechas, Espacio o Enter avanzan; Retroceso retrocede. Av Pág y Re Pág (o un pasapáginas Bluetooth) también sirven. Con Mayús, las flechas mueven por repetición.",
    pantallaEncendida: "Pantalla encendida",
    pantallaEncendidaAyuda: "Evita que la pantalla se apague mientras tejes. Se recuerda en este dispositivo.",
    pantallaNoSoportada: "Este navegador no permite mantener la pantalla encendida.",
    versionCambio: "Este proyecto cambió de versión en otro dispositivo. Se recargará la pantalla.",
    recargar: "Recargar",
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
  const w = rowWord(workedIn);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${number} de ${totalRows}`;
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

/** "3 A · 2 B · 3 A". Las letras salen de `yarnLetter` (pattern-core). Una fila sin puntos da "". */
export function runsText(runs: readonly ColorRun[]): string {
  return runs.map((r) => `${r.count} ${yarnLetter(r.yarn)}`).join(" · ");
}

/** "repetición 3 de 8" (índice en base 0, como `position().horizontalRepeat.index`). */
export function repeatCounterText(index: number, of: number): string {
  return `${PROJECT_TEXTS.tejiendo.repeticion.toLowerCase()} ${index + 1} de ${of}`;
}

/**
 * "casilla N de M" en filas con disminuciones (enmienda T1-5): N es la próxima casilla a producir (`stitchesDone + 1`)
 * y M las casillas de la fila (`step.stitches`). Nunca "puntos tejidos". // validar con tejedora
 */
export function cellCounterText(stitchesDone: number, stitches: number): string {
  return `${STUDIO_TEXTS.unidades.casilla} ${Math.min(stitchesDone + 1, Math.max(stitches, 1))} de ${stitches}`;
}

/** Anuncio corto para la región viva al avanzar: "Vuelta 13 de 60: 3 A · 2 B". */
export function rowAnnouncement(workedIn: WorkedIn, number: number, totalRows: number, runs: readonly ColorRun[]): string {
  const t = runsText(runs);
  return t ? `${rowCounterText(workedIn, number, totalRows)}: ${t}` : rowCounterText(workedIn, number, totalRows);
}

/** Texto de "Gráfico terminado" (F3-7, T1-4). `lastStitches` viene de `stepAt(plan, totalRows − 1).stitches`. */
export function finishedText(workedIn: WorkedIn, direction: "bottom_up" | "top_down", lastStitches: number | null): string {
  const T = PROJECT_TEXTS.tejiendo;
  const base = workedIn === "rounds" ? T.graficoTerminadoAyudaRedondo : T.graficoTerminadoAyuda;
  if (direction !== "bottom_up" || lastStitches === null || lastStitches <= 0) return base;
  return `${base} ${workedIn === "rounds" ? T.quedanPuntos(lastStitches) : T.quedanPuntosFila(lastStitches)}`;
}

// ------------------------------------------------------------------ pantalla previa

/** "En redondo, de abajo hacia arriba, 60 vueltas en total (tubo)". Los números vienen de `planChart`. */
export function workShapeText(workedIn: WorkedIn, direction: "bottom_up" | "top_down", renderAs: string, totalRows: number): string {
  const w = rowWord(workedIn);
  const unit = totalRows === 1 ? w : `${w}s`;
  const shape = renderAs === "flat" || renderAs === "tube" || renderAs === "circle" || renderAs === "yoke" ? shapeName(renderAs) : renderAs;
  return `${workedInName(workedIn)}, ${directionName(direction).toLowerCase()}: ${totalRows} ${unit} en total (${shape.toLowerCase()}).`;
}

/** "20 puntos × 28 filas en 10 cm (supuesta)". */
export function gaugeText(g: { stitchesPer10cm: number; rowsPer10cm: number; assumed: boolean }): string {
  const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  return `${fmt(g.stitchesPer10cm)} ${STUDIO_TEXTS.unidades.puntos} × ${fmt(g.rowsPer10cm)} filas en 10 cm${g.assumed ? ` (${PROJECT_TEXTS.tejer.muestraSupuesta})` : ""}`;
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
  const other = positionText(workedIn, totalRows, theirs);
  const finished = totalRows > 0 && theirs.rowsDone >= totalRows;
  const stamp = when ? ` (${when})` : "";
  const head = finished ? `En otro dispositivo ya terminaste el gráfico${stamp}.` : `En otro dispositivo vas en ${other}${stamp}.`;
  return `${head} Aquí vas en ${positionText(workedIn, totalRows, yours)}. ¿Con cuál sigues?`;
}

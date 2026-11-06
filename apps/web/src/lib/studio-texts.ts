/**
 * Textos de la interfaz del estudio de colorwork (rutas /disenos y /disenos/[id]).
 *
 * Provisional hasta la validación con tejedoras (T1b). La terminología sigue el "Glosario pendiente"
 * de docs/roadmap.md. Los términos marcados con `// validar con tejedora` no se publican sin revisión
 * (regla de oro 5). Los `TODO(verificar)` están como comentario y no aparecen en la interfaz.
 *
 * Reglas de este archivo:
 * - Solo texto y formato. Conteos, totales, medidas y disminuciones vienen de pattern-core y de
 *   stitch-render; aquí no se calcula nada.
 * - Las posiciones (fila, vuelta, casilla) llegan ya en base 1, listas para mostrar.
 * - Tuteo neutro en chileno, sin voseo.
 */

/** Cómo se teje: "rounds" (en redondo) o "rows" (ida y vuelta). Mismo valor que `Chart["workedIn"]`. */
export type WorkedIn = "rounds" | "rows";

export const STUDIO_TEXTS = {
  /** Subtítulo del estudio según la técnica. */
  subtitulo: {
    palillo: "Tejido de colores (jacquard)", // validar con tejedora
    crochet: "Tejido de colores (tapestry)", // validar con tejedora; el crochet tapestry llega después de la fase 4
  },

  /** Aviso fijo de prototipo digital (regla de oro 8, CA-F10). No tiene botón para cerrarlo. */
  prototipo: {
    etiqueta: "Prototipo digital",
    aviso: "La vista es una aproximación. Teje una muestra para comprobar la tensión y las proporciones.",
    ayudaMuestra: "Teje una muestra con la lana y la aguja que vas a usar, para comprobar la tensión.",
  },

  /** Muestra (tensión). Rótulo "supuesto" cuando no hay muestra real (CA-F4). */
  muestra: {
    titulo: "Muestra",
    alias: "tensión", // alias regional del glosario
    supuesto: "supuesto",
    supuestoEtiqueta: "Muestra supuesta",
    // Se muestra la muestra supuesta en punto jersey, en 10 cm. Las filas son una proporción calculada (1,35).
    supuestoPuntoJersey:
      "La muestra supuesta es en punto jersey, en 10 cm. Las filas son una proporción calculada, no una medida tuya.", // validar con tejedora (proporción 1,35)
    // Para crochet todavía no hay muestra supuesta propia: se deja el texto para cuando exista.
    supuestoCrochet:
      "En crochet, la proporción entre filas y puntos cambia según el punto (punto bajo o punto alto). La muestra supuesta de palillo no sirve para crochet.", // validar con tejedora
    colorworkConviene:
      "Para colorwork, conviene medir una muestra tejida en colorwork: el tejido de dos o más colores suele quedar con otra tensión que el punto jersey.", // validar con tejedora
    confianzaBaja:
      "Confianza baja: la muestra supuesta de esta categoría de lana es poco precisa. Mide tu muestra.", // validar con tejedora (categoría 7)
    ingresar: "Ingresar mi muestra",
    usarSupuesta: "Usar la muestra supuesta",
  },

  /** Unidades y nombres de tejido. */
  unidades: {
    vuelta: "Vuelta",
    fila: "Fila",
    casilla: "casilla",
    punto: "punto",
    puntos: "puntos",
    puntosAbrev: "pts", // "p" no se usa: se confunde con punto revés
    ladoDerecho: "lado derecho",
    ladoReves: "lado revés",
  },

  /** Barra de herramientas del editor de motivo. */
  herramientas: {
    lapiz: "Lápiz",
    relleno: "Relleno",
    cuentagotas: "Cuentagotas",
    sinPunto: "Sin punto",
    deshacer: "Deshacer",
    rehacer: "Rehacer",
    zoom: "Zoom",
    zoomAcercar: "Acercar",
    zoomAlejar: "Alejar",
    zoomAjustar: "Ajustar a la pantalla",
  },

  /** Lanas del diseño (lista A, B, C…). */
  lanas: {
    titulo: "Lanas del diseño",
    agregar: "Agregar lana",
    quitar: "Quitar lana",
    cambiarColor: "Cambiar color",
    colorPersonalizado: "Color personalizado",
    colorPaleta: "Color de la paleta",
    grosor: "Grosor",
    composicion: "Composición",
    composicionPorDefecto: "100 % de la fibra elegida",
    fondo: "Lana de fondo",
    ayuda:
      "Cada lana tiene una letra (A, B, C…) que se ve sobre la cuadrícula. Así distingues las lanas aunque no distingas bien los colores.",
    noSeQuitaLaUnica: "Un diseño necesita al menos una lana.",
    // Quitar una lana obliga a elegir la lana que reemplaza sus casillas (ADR 0003, replaceWith).
    eligeReemplazo: "Antes de quitarla, elige la lana que reemplazará sus casillas.", // validar con tejedora
  },

  /** Repeticiones. */
  repeticiones: {
    titulo: "Repeticiones",
    ancho: "A lo ancho",
    alto: "A lo alto",
    ayuda:
      "El motivo se repite este número de veces a lo ancho y a lo alto. Al editar cualquier repetición, cambia el mismo punto en todas.",
  },

  /** Forma de la vista: plano, tubo, círculo y canesú. */
  formas: {
    titulo: "Forma",
    flat: "Plano",
    tube: "Tubo",
    circle: "Círculo",
    yoke: "Canesú",
    ayudaPlano: "Tejido plano, como un rectángulo abierto.",
    ayudaTubo: "Tejido en redondo sin disminuciones, como una banda cerrada.",
    ayudaCirculo:
      "Tejido en redondo que se cierra en el centro, como la copa de un gorro. Cada cuña se repite alrededor.", // validar con tejedora
    ayudaCanesu: "El canesú todavía no tiene vista propia: se muestra como tubo.",
  },

  /** En redondo o ida y vuelta. */
  tejido: {
    titulo: "Cómo se teje",
    rounds: "En redondo",
    rows: "Ida y vuelta",
    ayudaRedondo: "Todas las vueltas se tejen por el lado derecho.", // validar con tejedora
    ayudaIdaYVuelta:
      "Las filas impares se tejen por el lado derecho y las pares por el lado revés.", // validar con tejedora
  },

  /** Dirección de tejido: de abajo hacia arriba o de arriba hacia abajo. */
  direccion: {
    titulo: "Dirección",
    bottom_up: "De abajo hacia arriba",
    top_down: "De arriba hacia abajo",
    ayudaBottomUp: "La pieza empieza abajo y crece hacia arriba. En el círculo, la copa se cierra al final.", // validar con tejedora
    // La vista gira el gráfico 180 grados (wornOrientation, ADR 0003): no es un espejo.
    ayudaTopDown:
      "La vista gira el gráfico 180 grados, para que la pieza se vea como queda puesta.", // validar con tejedora
  },

  /** Medidas y totales del panel lateral. Los valores llegan de pattern-core. */
  medidas: {
    titulo: "Medidas",
    ancho: "Ancho",
    alto: "Alto",
    circunferencia: "Circunferencia",
    total: "Total de puntos",
    porVuelta: "Puntos por vuelta",
    ayudaCircunferencia:
      "En tubo y círculo, el ancho es la circunferencia: la medida alrededor de la pieza.",
    ayudaSupuesto: "Las medidas usan la muestra supuesta. Con tu muestra, cambian.",
  },

  /** Ayuda del estudio (panel de ayuda). */
  ayuda: {
    titulo: "Ayuda del estudio",
    lectura:
      "Por el lado derecho, el gráfico se lee de derecha a izquierda. Por el lado revés, de izquierda a derecha.", // validar con tejedora
    alternanciaMotivo:
      "Si el motivo tiene un alto impar y se repite a lo alto, el derecho y el revés de cada fila se alternan entre repeticiones. La numeración es la de la primera repetición.", // validar con tejedora (T7b)
    cuadricula: "Cada casilla es un punto. La fila 1 está abajo.",
    sinPuntoExplica:
      "'Sin punto' deja una casilla vacía. Sirve para dibujar cuñas y formas que se van cerrando.",
    sinPuntoPlanoTubo:
      "En plano y tubo, las casillas en 'sin punto' se dibujan como huecos. La prenda real no tiene huecos: la pieza se teje continua.", // CA-F13
    cierreCirculo:
      "Coronilla (remate): el cierre de la copa en el centro, en la última vuelta.", // validar con tejedora
    comienzoCirculo:
      "Montaje inicial de 8 a 12 puntos para empezar un círculo a palillo (en crochet, anillo mágico de 6 a 12 puntos).", // validar con tejedora
    enganchar:
      "Una hebra flotante es una hebra larga que queda suelta en el lado revés. Conviene enganchar la hebra para fijarla y que no quede floja.", // validar con tejedora
    // TODO(verificar): atajos de teclado de cada herramienta (hoy no hay una lista definida).
    atajosTeclado:
      "Usa las flechas para moverte entre casillas y la barra espaciadora para pintar la casilla con la lana elegida.",
  },

  /** Limitaciones de la vista previa (ADR 0004, E8). Se muestran junto a la vista. */
  limitaciones: {
    titulo: "Lo que la vista no muestra",
    orillos: "La vista no dibuja los orillos (las puntadas de los bordes).", // validar con tejedora
    jog:
      "La vista no dibuja el salto de vuelta (jog), el desfase donde termina y empieza cada vuelta en redondo.", // validar con tejedora
    colorTrasDisminucion:
      "El punto que queda después de una disminución se muestra con el color de su fila. En el tejido real puede tener otro color.", // validar con tejedora
    canesu: "El canesú se muestra como tubo: la vista todavía no tiene su forma propia.",
    huecosSinPunto:
      "En plano y tubo, los huecos de 'sin punto' no existen en la prenda real. Son una forma de dibujar el motivo, no un hueco del tejido.", // CA-F13
    deformacionCirculo:
      "Esta vista del círculo se ve deformada: la proyección plana comprime o estira los puntos, porque la copa real forma una cúpula. Es una aproximación, no un error del patrón.", // validar con tejedora (umbrales de ringDistortion)
  },

  /** Disminuciones (ADR 0005). Se muestra la pérdida de punto, sin tipo ni inclinación. */
  disminuciones: {
    titulo: "Disminuciones",
    tipoPendiente:
      "Todavía no se indica el tipo de disminución. Esta vista solo marca dónde se pierde un punto.", // validar con tejedora (los nombres de disminución esperan la capa de símbolos)
    ayuda:
      "Las disminuciones se marcan en la casilla donde se pierde un punto. Puede que la disminución se teje en una casilla vecina.", // validar con tejedora (ADR 0003, pendiente de experto-tejido)
  },

  /** Estado del guardado (ADR 0006). */
  guardado: {
    titulo: "Estado del guardado",
    guardado: "Guardado",
    guardando: "Guardando…",
    borrador:
      "Guardado como borrador: tiene errores de tejido. Se guardó, pero no se puede tejer ni publicar todavía.",
    // TODO(verificar): si el reintento al volver la conexión es automático (ADR 0006 solo define el respaldo local).
    sinConexion:
      "Sin conexión. Tu último cambio queda en este dispositivo y se guardará cuando vuelva la conexión.",
    conflicto:
      "Este diseño se cambió en otra pestaña o dispositivo. Recarga para ver esa versión o sobrescríbela con la tuya.",
    conflictoRecargar: "Recargar",
    conflictoSobrescribir: "Sobrescribir",
    guardarVersion: "Guardar versión",
    versionNombre: "Nombre de la versión",
  },

  /** Mis diseños (lista). */
  misDisenos: {
    titulo: "Mis diseños",
    nuevo: "Nuevo diseño",
    abrir: "Abrir",
    duplicar: "Duplicar",
    duplicarNoIa: "Duplicar no está disponible en diseños generados con IA.",
    borrar: "Borrar",
    vacio: "Todavía no tienes diseños. Crea uno para empezar.",
    etiquetaIa: "Generado con IA",
    columnaTitulo: "Título",
    columnaForma: "Forma",
    columnaTamano: "Tamaño",
    columnaFecha: "Actualizado",
  },

  /** Confirmaciones. */
  confirmar: {
    borrarTitulo: "¿Borrar este diseño?",
    borrarBoton: "Sí, borrar",
    cancelar: "Cancelar",
    // TODO(verificar): si al borrar también se borran las versiones guardadas.
  },

  /** Asistente de nuevo diseño (/disenos/nuevo). */
  asistente: {
    titulo: "Nuevo diseño",
    tamanoMotivo: "Tamaño del motivo",
    muestraOpcional: "Muestra (opcional)",
    muestraAyuda: "Si no la tienes, se usa una muestra supuesta y se marca como tal.",
    crear: "Crear diseño",
    plantillasTitulo: "Empezar desde una plantilla",
    plantillaBanda: "Banda en tubo",
    plantillaCopa: "Copa en cuña de 8 gajos", // validar con tejedora (gajo como alias de cuña)
    tituloPorDefecto: "Mi diseño",
    tituloAyuda: "Entre 1 y 120 caracteres.",
  },

  /** Accesibilidad: lector de pantalla y teclado (CA-A1 a CA-A3). */
  accesibilidad: {
    editorEtiqueta: "Editor del motivo",
    descripcionMotivo: "Descripción del motivo para lectores de pantalla",
    zoom: "Zoom",
    instrucciones:
      "Flechas: moverte entre casillas. Espacio: pintar la casilla con la lana elegida.",
    vistaPreviaEtiqueta: "Vista previa del tejido",
  },
} as const;

/** Nombre de la forma (plano, tubo, círculo, canesú). */
export function shapeName(shape: "flat" | "tube" | "circle" | "yoke"): string {
  return STUDIO_TEXTS.formas[shape];
}

/** Nombre de la dirección de tejido. */
export function directionName(direction: "bottom_up" | "top_down"): string {
  return STUDIO_TEXTS.direccion[direction];
}

/** Nombre de la forma de tejer (en redondo o ida y vuelta). */
export function workedInName(workedIn: WorkedIn): string {
  return STUDIO_TEXTS.tejido[workedIn];
}

/** Rótulo de una lana: "Lana A" o "Lana A (azul marino)". */
export function yarnTitle(letter: string, name?: string): string {
  return name === undefined || name.length === 0 ? `Lana ${letter}` : `Lana ${letter} (${name})`;
}

/**
 * Anuncio de la casilla enfocada para lectores de pantalla (CA-A3).
 * Ejemplo: "Fila 3, casilla 5, lana B". `yarn` es el texto de la lana o "sin punto".
 */
export function cellAnnouncement(row: number, col: number, yarn: string, workedIn: WorkedIn): string {
  const unit = workedIn === "rounds" ? STUDIO_TEXTS.unidades.vuelta : STUDIO_TEXTS.unidades.fila;
  return `${unit} ${row}, ${STUDIO_TEXTS.unidades.casilla} ${col}, ${yarn}`;
}

/** Formato de cantidades con separador de miles. */
function formatCount(n: number): string {
  return n.toLocaleString("es-CL"); // TODO(verificar): separador de miles en es-CL
}

/** Total de puntos del diseño. El número viene de `stitchTotal` (pattern-core). */
export function stitchTotalText(total: number): string {
  return `${formatCount(total)} ${total === 1 ? STUDIO_TEXTS.unidades.punto : STUDIO_TEXTS.unidades.puntos} en total`;
}

/** Puntos por vuelta en el círculo. El número viene de `rowStitchCount` (pattern-core). */
export function stitchesPerRoundText(count: number): string {
  return `${formatCount(count)} ${count === 1 ? STUDIO_TEXTS.unidades.punto : STUDIO_TEXTS.unidades.puntos} por vuelta`;
}

/** Repeticiones del motivo a lo ancho y a lo alto. */
export function repeatsText(x: number, y: number): string {
  return `${x} a lo ancho × ${y} a lo alto`;
}

/**
 * Medida en cm. Los valores llegan de `dimensionsCm` (pattern-core). `assumed` agrega el rótulo "supuesto".
 * Ejemplo: "Circunferencia: 56,4 cm (supuesto)".
 */
export function measureText(
  label: "ancho" | "alto" | "circunferencia",
  cm: number,
  assumed: boolean,
): string {
  const name = STUDIO_TEXTS.medidas[label];
  const value = cm.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  const suffix = assumed ? ` (${STUDIO_TEXTS.muestra.supuesto})` : "";
  return `${name}: ${value} cm${suffix}`;
}

/** Signo visible para cambios (− para disminuciones, + para aumentos, ±0 sin cambio). */
function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "±0";
}

/**
 * Línea de disminuciones de una fila del panel. Los valores llegan de `shaping` (pattern-core).
 * Ejemplo: "Fila 31: 56 pts, −8 en la vuelta, −1 por repetición".
 */
export function shapingLine(row: number, stitches: number, change: number, perRepeat: number): string {
  return `Fila ${row}: ${stitches} ${STUDIO_TEXTS.unidades.puntosAbrev}, ${signed(change)} en la vuelta, ${signed(perRepeat)} por repetición`;
}

/** Aviso en una casilla de disminución: se pierde un punto aquí. No decide el tipo de disminución. */
export function lostStitchNote(row: number, col: number): string {
  return `Aquí se pierde un punto (fila ${row}, casilla ${col}). La vista no indica todavía el tipo de disminución.`; // validar con tejedora
}

/** Texto de la muestra supuesta. `lowConfidence` agrega la advertencia de la categoría 7. */
export function assumedSampleNote(lowConfidence: boolean): string {
  const base = `${STUDIO_TEXTS.muestra.supuestoPuntoJersey} ${STUDIO_TEXTS.muestra.colorworkConviene}`;
  return lowConfidence ? `${base} ${STUDIO_TEXTS.muestra.confianzaBaja}` : base;
}

/** "No se puede guardar", con el motivo ya traducido por quien llama. */
export function cannotSaveText(reason: string): string {
  return `No se puede guardar: ${reason}.`;
}

/** Límite de diseños guardados (cuota). El número lo pasa quien llama desde el servidor. */
export function quotaFullText(limit: number): string {
  return `Llegaste al máximo de ${formatCount(limit)} diseños guardados. Borra alguno que ya no uses para crear uno nuevo.`;
}

/** Límite de versiones guardadas de un diseño. */
export function maxVersionsText(limit: number): string {
  return `Este diseño llegó al máximo de ${formatCount(limit)} versiones guardadas. Borra el diseño o guarda una copia.`;
}

/** Versión guardada con nombre. */
export function versionSavedText(name: string): string {
  return `Versión «${name}» guardada.`;
}

/** Confirmación de borrado, con el título del diseño. */
export function deleteConfirmText(title: string): string {
  return `Se borrará el diseño «${title}».`;
}

/** Aviso de vista previa lenta: más de `limit` puntos (40.000 en el ADR 0004). */
export function slowPreviewText(limit: number): string {
  return `Con más de ${formatCount(limit)} puntos, la respuesta de la vista previa no es instantánea. Puede tardar un poco más en actualizarse.`;
}

/** Aviso de vista previa no disponible: el diseño supera el tope del render (1.000.000 de puntos, ADR 0004 E1). */
export function previewTooLargeText(limit: number): string {
  return `El diseño es demasiado grande para la vista previa (más de ${formatCount(limit)} puntos). Reduce el tamaño del motivo o las repeticiones.`;
}

/** Zoom en porcentaje, para anunciarlo a lectores de pantalla. */
export function zoomAnnouncement(percent: number): string {
  return `${STUDIO_TEXTS.accesibilidad.zoom} ${percent} %`;
}

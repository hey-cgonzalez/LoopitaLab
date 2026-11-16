import { RECOMMENDED_WRITTEN_LIMITS, type Dialect, type RecommendedLimit } from "@loopitalab/pattern-core";

/*
 * Textos del estudio amigurumi (T14 de la fase 4), revisados en T18 por `documentador`; los revisa `ux-accesibilidad`
 * (T17). Los términos de tejido llevan `// validar con tejedora` y están en la hoja T1b (sección "Textos de T18" de
 * docs/casos-dominio-fase-4.md; regla de oro 5). En la interfaz se evita la palabra "copias" (enmienda C-14):
 * "se teje N veces". Nombres de partes: no se supone su género; se dice "la pieza «X»".
 */

const n = (v: number) => v.toLocaleString("es-CL");
const R = RECOMMENDED_WRITTEN_LIMITS;

/** Nombre de cada límite recomendado, con su valor. */
export const LIMIT_NAMES: Record<RecommendedLimit, string> = {
  parts: `${n(R.parts)} partes`,
  copiesPerPart: `${n(R.copiesPerPart)} veces por parte`,
  roundsPerPart: `${n(R.roundsPerPart)} vueltas por parte`,
  stitchesPerRound: `${n(R.stitchesPerRound)} puntos por vuelta`,
  sceneStitches: `${n(R.sceneStitches)} puntos en la escena`,
};

export const AMIGURUMI_TEXTS = {
  subtitulo: "Amigurumi (crochet, escrito)",
  volver: "← Mis diseños",
  nombreDiseno: "Nombre del diseño",
  pestanas: { etiqueta: "Zonas del estudio", partes: "Partes", editor: "Patrón", vista: "3D" },

  partes: {
    titulo: "Partes",
    agregar: "Agregar parte",
    nombreNueva: (k: number) => `Parte ${k}`,
    renombrar: "Nombre de la parte",
    subir: "Subir",
    bajar: "Bajar",
    borrar: "Borrar",
    borrarConfirmar: "Borrar la parte",
    cancelar: "Cancelar",
    borrarPregunta: (name: string) => `¿Borrar «${name}» y todas sus vueltas? Puedes deshacerlo.`,
    unicaNoSeBorra: "El patrón necesita al menos una parte.",
    seTeje: "Se teje",
    veces: (k: number) => (k === 1 ? "vez" : "veces"),
    vecesAyuda: "Cuántas piezas iguales se tejen con esta parte (por ejemplo, 2 orejas).",
    pieza: (name: string, i: number, total: number) => (total > 1 ? `${name} (${i} de ${total})` : name),
    ubicacionAutomatica: "ubicación automática",
    ubicada: "ubicada",
    vueltas: (v: number) => `${n(v)} de ${n(R.roundsPerPart)} vueltas recomendadas`,
    seleccionada: "abierta en el editor",
    abrir: (name: string) => `Abrir «${name}» en el editor`,
    sinUbicar: (list: string) => `Estas piezas quedaron sin ubicar y se acomodan solas en el 3D: ${list}.`,
    sinUbicarBorrar: (list: string) => `Al borrarla, estas piezas quedan sin ubicar: ${list}.`,
    topePartes: (max: number) => `No se pueden agregar más partes: el máximo del editor es ${max}.`,
    topeCopias: (max: number) => `Una parte se puede tejer hasta ${max} veces.`,
    nombreInvalido: "El nombre no puede quedar vacío ni pasar de 80 caracteres. No se guardó.",
    movida: (name: string, pos: number, total: number) => `«${name}» quedó en el lugar ${pos} de ${total}.`,
    agregada: (name: string) => `Se agregó «${name}».`,
    borrada: (name: string) => `Se borró «${name}».`,
  },

  editor: {
    titulo: "Patrón de la parte",
    pestanaTexto: "Texto",
    pestanaBloques: "Bloques",
    etiquetaTexto: (name: string) => `Patrón escrito de «${name}»`,
    ayuda:
      "Una vuelta por línea, por ejemplo «V2: aum x6 (12)»; en una parte por hileras, «H2». Una línea que empieza con > es una nota de la vuelta de arriba. «Cantidad: 2» dice cuántas veces se teje la parte (también se lee «Hacer», «Piezas» y «Tejer»). Una base ovalada se escribe con «Inicio: AM» y todos sus puntos en la V1: el 3D la dibuja redonda. Al salir de una línea, se escribe en su forma de siempre (por ejemplo, «pb x6» pasa a «6 pb»).", // validar con tejedora
    dialecto: (d: Dialect) =>
      d === "uk"
        ? "Abreviaturas: inglés del Reino Unido (UK). Ojo: en UK «dc» es el punto bajo (en US, «sc»); «sc» da error. Se leen también las del español." // validar con tejedora
        : d === "us"
          ? "Abreviaturas: inglés de EE. UU. (US). Se leen también las del español."
          : "Abreviaturas: español. Se leen también las de EE. UU. (US).",
    cambiarDialecto: "Cambiar en tu cuenta",
    leido: "El patrón se leyó bien.",
    sinLeer:
      "Hay líneas que no se pueden leer: el diseño y el 3D no cambian hasta que las corrijas. Lo que escribiste queda guardado en este equipo.",
    sinAplicar: "El patrón se lee, pero supera un límite del editor y no se aplicó. Lo que escribiste queda guardado en este equipo.",
    descartar: "Descartar las líneas sin leer",
    descartarAyuda: "Vuelve a escribir la parte como está en el diseño.",
    lineaColumna: (line: number, col: number) => `Línea ${line}, columna ${col}`,
    irALinea: (line: number) => `Ir a la línea ${line}`,
    vueltaActual: "Vuelta del cursor",
    sinVuelta: "El cursor no está en una vuelta.",
    conteo: (label: string, produced: number, consumed: number, range: boolean) =>
      `${label}: ${n(produced)} ${produced === 1 ? "punto" : "puntos"}${range ? " cada una" : ""}${consumed > 0 ? ` (trabaja sobre ${n(consumed)})` : ""}.`,
    revision: "Revisión",
    revisando: "Revisando…",
    sinProblemas: "Sin errores ni avisos en esta parte.",
    borrador: "Borrador: se guarda, pero no se puede tejer hasta corregir los errores.",
    pista: "Pista",
    deshacer: "Deshacer",
    rehacer: "Rehacer",
    limiteVuelta: (label: string) =>
      `${label}: supera los ${n(R.stitchesPerRound)} puntos recomendados por vuelta. La vista previa puede ir más lenta; el patrón no está mal.`,
    limiteVueltas: `Esta parte supera las ${n(R.roundsPerPart)} vueltas recomendadas. La vista previa puede ir más lenta.`,
    limiteCopias: `Esta parte se teje más de ${n(R.copiesPerPart)} veces, lo recomendado. La vista previa puede ir más lenta.`,
  },

  /** Editor de bloques (T15). Redacción provisional: la final es de `documentador` (T18) y la revisa `ux-accesibilidad` (T17). */
  bloques: {
    etiquetaArbol: (label: string) => `Bloques de la vuelta ${label}`,
    ayuda:
      "Cada bloque es un punto con su cantidad, un grupo que se repite o un cambio de lana. Elige un bloque con las flechas; Enter edita sus datos y Escape vuelve al bloque. Cada cambio se puede deshacer.",
    ayudaSoloLectura: "Los grupos dentro de más de 2 niveles se ven aquí, pero se editan en el texto.",
    vuelta: (label: string) => label,
    conteo: (produced: number, perRound: boolean) => `${n(produced)} ${produced === 1 ? "punto" : "puntos"}${perRound ? " cada una" : ""}`,
    declarado: (expected: number) => `El patrón declara ${n(expected)}.`,
    noCuadra: (expected: number, produced: number) => `No cuadra: el patrón declara ${n(expected)} y los bloques dan ${n(produced)}.`,
    usarConteo: (produced: number) => `Declarar ${n(produced)}`,
    insertarAntes: "Insertar vuelta antes",
    insertarDespues: "Insertar vuelta después",
    insertarAlFinal: "Agregar vuelta al final",
    borrarVuelta: "Borrar vuelta",
    unicaVuelta: "La parte necesita al menos una vuelta.",
    agregarPunto: "Agregar punto",
    agregarPuntoEn: "Agregar punto al grupo",
    punto: "Punto",
    cantidad: "Cantidad",
    hebra: "Hebra",
    hebraAmbas: "Ambas",
    hebraTrasera: "Trasera",
    hebraDelantera: "Delantera",
    lanaNueva: "Pasa a la lana",
    cambioLana: "Cambio de lana",
    grupo: "Grupo",
    veces: "Veces",
    repite: (times: number) => `se repite ${n(times)} ${times === 1 ? "vez" : "veces"}`,
    subir: "Subir",
    bajar: "Bajar",
    borrar: "Borrar",
    agrupar: "Agrupar",
    agruparConSiguiente: "Agrupar con el siguiente",
    desagrupar: "Deshacer grupo",
    editarEnTexto: "Editar en el texto",
    soloLectura: "Solo lectura",
    soloLecturaAyuda: "Este nivel se edita en el texto.",
    nivel: (k: number) => `nivel ${k}`,
    // Anuncios (región `polite`)
    insertada: (label: string) => `Se insertó la vuelta ${label}.`,
    borrada: (label: string) => `Se borró la vuelta ${label}.`,
    movido: (pos: number, total: number) => `Quedó en el lugar ${pos} de ${total}.`,
    agrupado: "Se agrupó.",
    desagrupado: "Se deshizo el grupo.",
    agregado: "Se agregó un punto.",
    quitado: "Se borró el bloque.",
    sinCambio: "No se pudo hacer ese cambio: supera un límite del editor.",
    // Descripción accesible de cada bloque
    puntoDescripcion: (abbr: string, count: number) => `${count} ${abbr}`,
    grupoDescripcion: (times: number, inside: number) => `grupo, se repite ${n(times)} ${times === 1 ? "vez" : "veces"}, ${n(inside)} ${inside === 1 ? "bloque" : "bloques"}`,
    cambioDescripcion: (yarn: string) => `cambio a la lana ${yarn}`,
    // Cambio de pestaña con líneas sin leer
    sinLeerTitulo: "Hay líneas sin leer en el texto",
    sinLeerTexto: "Los bloques solo muestran lo que el patrón ya entiende. Las líneas sin leer no están en el diseño. ¿Qué quieres hacer?",
    volverAlTexto: "Volver al texto",
    descartar: "Descartar las líneas sin leer",
    sinLeerForzado: "Hay líneas sin leer en esta parte: se volvió al texto.",
  },

  /** Pistas de los desajustes (`data.hints`, enmienda T4-2): los mismos textos del motor (`validate.ts`), aparte. */
  pistas: {
    ring: "Si trabajas dentro del aro, la cantidad de la primera vuelta es libre.",
    join: "¿Escribiste la cadeneta de subida o el pd de unión como puntos? No cuentan.",
    turning_chain: "Revisa si la cadeneta para girar cuenta como punto.",
  },

  limites: {
    medidor: (value: number) => `${n(value)} de ${n(R.sceneStitches)} puntos recomendados en la escena`,
    partes: (value: number) => `${n(value)} de ${n(R.parts)} partes recomendadas`,
    cerca: "Cerca del límite recomendado.",
    sobre: "Supera el límite recomendado: la vista previa puede ir más lenta.",
    ayudaTitulo: "¿Por qué hay límites recomendados?",
    ayuda: [
      `Son valores para que la vista previa responda al instante: ${n(R.parts)} partes, ${n(R.copiesPerPart)} veces por parte, ${n(R.roundsPerPart)} vueltas por parte, ${n(R.stitchesPerRound)} puntos por vuelta y ${n(R.sceneStitches)} puntos en toda la escena.`,
      "Una parte que se teje varias veces cuenta como una sola parte: lo que se cuenta aparte son sus copias.",
      "No son límites del tejido: un patrón que los pasa no está mal y se guarda igual.",
      "Si los pasas, la vista previa puede ir más lenta. Tú decides si sigues.",
    ],
    nombres: LIMIT_NAMES,
    dialogoTitulo: "Límite recomendado",
    dialogo: (limit: RecommendedLimit, value: number) =>
      `Esto supera el límite recomendado de ${LIMIT_NAMES[limit]} (quedaría en ${n(value)}). La vista previa puede ir más lenta. ¿Seguir igual?`,
    /** Uno o varios límites cruzados por la misma acción (BUG-QA4-2). */
    dialogoVarios: (usages: readonly { limit: RecommendedLimit; value: number }[]) => {
      const [first] = usages;
      if (usages.length === 1 && first) return `Esto supera el límite recomendado de ${LIMIT_NAMES[first.limit]} (quedaría en ${n(first.value)}). La vista previa puede ir más lenta. ¿Seguir igual?`;
      const list = usages.map((u) => `${LIMIT_NAMES[u.limit]} (quedaría en ${n(u.value)})`).join(", ");
      return `Esto supera los límites recomendados de ${list}. La vista previa puede ir más lenta. ¿Seguir igual?`;
    },
    seguir: "Seguir igual",
    cancelar: "Cancelar",
  },

  muestra: {
    titulo: "Muestra",
    puntos: "Puntos en 10 cm",
    vueltas: "Vueltas en 10 cm",
    ayuda: "En punto bajo, con la lana y el ganchillo que vas a usar. El amigurumi se teje apretado: mide tu muestra.",
    supuesta: (st: number, rw: number) => `Muestra supuesta: ${n(st)} puntos y ${n(rw)} vueltas en 10 cm, según el grosor de la lana A.`,
    supuestaAyuda: "Sin tu muestra, las medidas y la forma del 3D son un supuesto.",
    quitar: "Usar la muestra supuesta",
    incompleta: "Escribe los puntos y las vueltas en 10 cm.",
  },

  vista: {
    titulo: "Vista 3D",
    posicionar: "Posicionar",
    posicionarAyuda: "Ubica cada pieza: cósela a otra tocando su superficie, o deja libre la pieza principal.",
    descripcionTitulo: "Descripción del patrón",
    descripcionAyuda: "Texto con las partes, sus vueltas, medidas y dónde va cada pieza.",
    avisos: "Avisos de la vista 3D",
  },

  /** Posicionado (T16; decisión 3). Redacción provisional: la final es de `documentador` (T18) y la revisa `ux-accesibilidad` (T17). */
  posicion: {
    titulo: "Posicionar piezas",
    pieza: "Pieza que ubicas",
    como: "Cómo va",
    auto: "Sin ubicar (se acomoda sola)",
    libre: "Libre (pieza principal)",
    cosida: "Cosida a otra pieza",
    autoAyuda: "Sin posición, la pieza se muestra a la derecha de las demás.",
    libreAyuda: "La pieza principal va libre en el espacio: posición en cm y giro en grados. Las demás conviene coserlas a ella, así la siguen si cambia.",
    cosidaAyuda: "Toca en el 3D la pieza donde se cose, o escribe la vuelta y el punto. Si la pieza crece, esta la sigue.",
    tocarAyuda: "Toca la superficie de la pieza donde se cose.",
    tocarElegir: "Toca una pieza en el 3D para elegirla.",
    anfitrion: "Se cose a",
    vuelta: "Vuelta",
    punto: "Punto",
    puntoAyuda: (count: number) => `De 1 a ${n(count)} en esa vuelta.`,
    vueltasDe: (first: number, last: number, word: string) => `${word} de ${n(first)} a ${n(last)}.`,
    coserAqui: "Coser en esta vuelta y punto",
    vueltaNoExiste: (word: string, first: number, last: number) => `Esa ${word} no existe: la pieza tiene de la ${n(first)} a la ${n(last)}.`,
    puntoNoExiste: (count: number) => `Ese punto no existe: la vuelta tiene ${n(count)} ${count === 1 ? "punto" : "puntos"}.`,
    extremo: "Qué extremo se cose",
    extremoFinal: "El borde abierto (última vuelta)",
    extremoInicio: "El centro del inicio",
    girar: "Girar",
    girarAyuda: "Gira la pieza sobre el punto donde se cose.",
    inclinar: "Inclinar",
    inclinarAyuda: "Inclina la pieza hacia arriba o hacia abajo.",
    ladear: "Ladear",
    ladearAyuda: "Inclina la pieza hacia un lado.",
    separar: "Separar (cm)",
    separarAyuda: (max: number) => `Aleja la pieza de la superficie; con un valor negativo se hunde un poco. Hasta ${n(max)} cm.`,
    posicionX: "Posición X (cm)",
    posicionY: "Posición Y (cm)",
    posicionZ: "Posición Z (cm)",
    giroX: "Giro X (grados)",
    giroY: "Giro Y (grados)",
    giroZ: "Giro Z (grados)",
    grados: "grados",
    quitar: "Quitar posición",
    quitada: (label: string) => `La pieza «${label}» quedó sin ubicar: el 3D la acomoda sola.`,
    cosidaEn: (label: string, host: string, word: string, round: number, stitch: number) => `La pieza «${label}» quedó cosida a la pieza «${host}», ${word} ${n(round)}, punto ${n(stitch)}.`,
    libreLista: (label: string) => `La pieza «${label}» quedó libre.`,
    noASiMisma: "Una pieza no se puede coser a sí misma: toca otra pieza.",
    noSePudo: "No se pudo ubicar así: dos piezas quedarían cosidas una a la otra (en círculo) o se pasa un límite del editor.",
    actual: "Dónde va",
    sinVisor: "Sin la vista 3D, ubica la pieza con la vuelta y el punto.",
  },

  /** Armado (T16; ADR 0011, sección 9). Redacción provisional (T18). */
  armado: {
    titulo: "Armado",
    dondeVa: "Dónde va cada pieza",
    dondeVaAyuda: "Sale de la posición de cada pieza. Las vueltas se cuentan desde el anillo mágico (o desde la cadeneta inicial), no desde el cuello ni desde el marcador.", // validar con tejedora
    sinDescripcion: "Corrige los errores del patrón para ver dónde va cada pieza.",
    sinUbicar: (list: string) => `Sin ubicar (el 3D las acomoda solas, a la derecha): ${list}.`,
    pasos: "Pasos de armado",
    pasosAyuda: "Escribe cómo se arma el muñeco, un paso por casilla (por ejemplo, «Cose la cabeza sobre el cuerpo»).",
    paso: (i: number) => `Paso ${i}`,
    agregar: "Agregar paso",
    borrar: (i: number) => `Borrar el paso ${i}`,
    subir: (i: number) => `Subir el paso ${i}`,
    bajar: (i: number) => `Bajar el paso ${i}`,
    tope: (max: number) => `Hasta ${n(max)} pasos.`,
    largo: (max: number) => `Cada paso tiene hasta ${n(max)} caracteres.`,
  },

  lanas: {
    ayuda: "Cada lana tiene una letra (A, B, C…). En el patrón, @B cambia a la lana B; así distingues las lanas aunque no distingas bien los colores.",
    reemplazoPregunta: "¿Con qué lana la reemplazas en el patrón?",
    eligeReemplazo: "Antes de quitarla, elige la lana que la reemplaza en el patrón (los cambios @ y la lana con que empieza cada parte).", // validar con tejedora
  },

  tejer: "Seguir un amigurumi punto a punto llega en una próxima versión.",
  borradorTitulo: "Borrador con vueltas que no cuadran",
  borradorTexto: "Está guardado, pero no se puede tejer hasta corregirlo.",

  /**
   * Accesibilidad (T17 de la fase 4): anuncios para lector de pantalla, leyenda del ancla, atajos de teclado y textos
   * de las siluetas. Sección propia de `ux-accesibilidad`; `documentador` (T18) revisa la redacción.
   */
  a11y: {
    // Anuncios del texto (región `polite`, con pausa: no se repiten en cada tecla)
    lineasSinLeer: (count: number, line: number, message: string) =>
      count === 1 ? `Hay 1 línea sin leer: la línea ${line}. ${message}` : `Hay ${n(count)} líneas sin leer. La primera es la línea ${line}. ${message}`,
    revisionAviso: (count: number, first: string) => (count === 1 ? `Revisión: ${first}` : `Revisión: ${n(count)} avisos. El primero: ${first}`),
    // Anuncios de los bloques
    cambioAgregado: "Se agregó un cambio de lana.",
    conteoDeclarado: (label: string, produced: number) => `${label}: ahora el patrón declara ${n(produced)} ${produced === 1 ? "punto" : "puntos"}.`,
    vueltaCambio: (label: string, text: string) => `${label}: ${text}.`,
    // Límites recomendados
    medidorValor: (value: string, tone: string | null) => (tone ? `${value}. ${tone}` : value),
    medidorVolvio: "Volviste al rango recomendado de puntos.",
    // Visor
    visorTeclas: "Con la vista 3D enfocada: las flechas la giran, + y − acercan o alejan, 0 vuelve a la vista inicial.",
    coloresPlanosLink: "Colores planos",
    // Posicionar
    posicionarActivo: "Posicionar activado. Elige la pieza y cómo va en el panel «Posicionar piezas», debajo de la vista 3D. Escape lo cierra.",
    posicionarCerrado: "Posicionar cerrado.",
    piezaElegida: (label: string) => `Elegiste «${label}».`,
    posicionarCerrar: "Escape cierra el modo Posicionar.",
    // Leyenda del ancla: se entiende sin distinguir colores (las flechas difieren en largo)
    anclaTitulo: "Qué muestran el punto y las flechas",
    anclaIntro: "En la vista 3D, el punto blanco marca dónde se cose la pieza. Las flechas se distinguen por su largo, no solo por su color.",
    anclaNormal: "Flecha larga (azul marino): sale de la superficie hacia afuera. «Girar» gira la pieza sobre ella.",
    anclaVuelta: "Flecha mediana (roja): sigue la vuelta, de punto a punto. «Inclinar» gira la pieza sobre ella.",
    anclaMeridiano: "Flecha corta (verde): sube por la pieza, de una vuelta a la siguiente. «Ladear» gira la pieza sobre ella.",
    // Siluetas (sin WebGL 2)
    siluetasEtiqueta: "Piezas del patrón",
    siluetasAyuda: "Cada silueta es el perfil de la pieza, visto de lado. La descripción completa está en «Descripción del patrón», más abajo.",
    silueta: (name: string, copies: number, rounds: number, size: string) =>
      `${name}${copies > 1 ? `, se teje ${n(copies)} veces` : ""}: ${n(rounds)} ${rounds === 1 ? "vuelta" : "vueltas"}, ${size}.`,
    // Atajos de teclado (documentados dentro del estudio)
    atajosTitulo: "Atajos de teclado",
    atajos: [
      "Pestañas (en pantallas angostas): flechas izquierda y derecha cambian de pestaña; Inicio y Fin van a la primera y a la última.",
      "Texto: Tab sale del cuadro. Al salir de una línea, se escribe en su forma de siempre.",
      "Bloques: flechas arriba y abajo recorren los bloques; derecha entra al grupo e izquierda sale; Inicio y Fin van al primero y al último.",
      "Bloques: Enter pasa a los datos del bloque y Escape vuelve al bloque. Alt con flecha arriba o abajo lo mueve.",
      "Fuera de un cuadro de texto: Ctrl o Cmd + Z deshace; Ctrl o Cmd + Mayús + Z (o Ctrl + Y) rehace.",
      "Vista 3D: flechas giran, + y − acercan o alejan, 0 vuelve a la vista inicial.",
      "Posicionar: Escape cierra el modo y devuelve el foco al botón.",
    ],
  },
} as const;

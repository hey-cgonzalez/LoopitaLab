import { RECOMMENDED_WRITTEN_LIMITS, type Dialect, type RecommendedLimit } from "@loopitalab/pattern-core";

/*
 * Textos del estudio amigurumi (T14 de la fase 4). Redacción provisional de `frontend-editor`: la final la hace
 * `documentador` (T18) y la revisa `ux-accesibilidad` (T17). Los términos de tejido quedan "validar con tejedora"
 * (T1b, regla de oro 5). En la interfaz se evita la palabra "copias" (enmienda C-14): "se teje N veces".
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
    bloquesPronto: "El editor de bloques llega pronto. Por ahora, escribe el patrón en el texto.",
    etiquetaTexto: (name: string) => `Patrón escrito de «${name}»`,
    ayuda:
      "Una vuelta por línea, por ejemplo «V2: aum x6 (12)». Una línea que empieza con > es una nota de la vuelta de arriba. Al salir de una línea, se escribe en su forma de siempre (por ejemplo, «pb x6» pasa a «6 pb»).",
    dialecto: (d: Dialect) =>
      d === "uk"
        ? "Abreviaturas: inglés del Reino Unido (UK). Se leen también las del español."
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
      "No son límites del tejido: un patrón que los pasa no está mal y se guarda igual.",
      "Si los pasas, la vista previa puede ir más lenta. Tú decides si sigues.",
    ],
    nombres: LIMIT_NAMES,
    dialogoTitulo: "Límite recomendado",
    dialogo: (limit: RecommendedLimit, value: number) =>
      `Esto supera el límite recomendado de ${LIMIT_NAMES[limit]} (quedaría en ${n(value)}). La vista previa puede ir más lenta. ¿Seguir igual?`,
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
    posicionarPronto: "Ubicar las piezas a mano llega pronto. Por ahora se acomodan solas.",
    descripcionTitulo: "Descripción del patrón",
    descripcionAyuda: "Texto con las partes, sus vueltas, medidas y dónde va cada pieza.",
    avisos: "Avisos de la vista 3D",
  },

  lanas: {
    ayuda: "Cada lana tiene una letra (A, B, C…). En el patrón, @B cambia a la lana B; así distingues las lanas aunque no distingas bien los colores.",
    reemplazoPregunta: "¿Con qué lana la reemplazas en el patrón?",
    eligeReemplazo: "Antes de quitarla, elige la lana que la reemplaza en el patrón (los cambios @ y la lana con que empieza cada parte).", // validar con tejedora
  },

  tejer: "Seguir un amigurumi punto a punto llega en una próxima versión.",
  borradorTitulo: "Borrador con vueltas que no cuadran",
  borradorTexto: "Está guardado, pero no se puede tejer hasta corregirlo.",
} as const;

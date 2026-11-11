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
      "Por convención, la fila 1 se teje por el lado derecho: las filas impares por el derecho y las pares por el revés.", // validar con tejedora (convención)
    /** Tubo tejido en ida y vuelta: no se bloquea (CHART_ROWS_SHAPE), pero se avisa. */
    tuboIdaYVuelta: "En ida y vuelta, el tubo se cierra con una costura.", // validar con tejedora
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
    ayudaCircunferenciaCirculo: "En el círculo es la circunferencia del borde, la vuelta más ancha.", // validar con tejedora
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
      "Una hebra flotante es una hebra que va tendida por el revés entre dos zonas del mismo color. Si es larga, conviene enganchar la hebra para fijarla y que no quede floja.", // validar con tejedora
    atajosTeclado:
      "Usa las flechas para moverte entre casillas y Enter o la barra espaciadora para aplicar la herramienta en la casilla. La lista completa de atajos está en «Atajos de teclado».",
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
      "En un círculo, los dibujos se ven más estirados cerca del borde y más apretados cerca del centro: la vista es plana y la copa real forma una cúpula. Es una aproximación, no un error del patrón.", // validar con tejedora (umbrales de ringDistortion)
  },

  /** Disminuciones (ADR 0005). Se muestra la pérdida de punto, sin tipo ni inclinación. */
  disminuciones: {
    titulo: "Disminuciones",
    tipoPendiente:
      "Todavía no se indica el tipo de disminución. Esta vista solo marca dónde se pierde un punto.", // validar con tejedora (los nombres de disminución esperan la capa de símbolos)
    ayuda:
      "Las disminuciones se marcan en la casilla donde se pierde un punto. Puede que la disminución se teja en una casilla vecina.", // validar con tejedora (ADR 0003, pendiente de experto-tejido)
  },

  /** Estado del guardado (ADR 0006). */
  guardado: {
    titulo: "Estado del guardado",
    guardado: "Guardado",
    guardando: "Guardando…",
    borrador:
      "Guardado como borrador: tiene errores de tejido. Se guardó, pero no se puede tejer ni publicar todavía.",
    sinConexionEtiqueta: "Sin conexión",
    // El reintento es automático (con espera creciente y al volver la conexión, ADR 0006 E10).
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
    plantillaCopa: "Copa de gorro en 8 cuñas", // validar con tejedora ("cuña" es el término principal; "gajo", solo alias)
    tituloPorDefecto: "Mi diseño",
    tituloAyuda: "Entre 1 y 120 caracteres.",
  },

  /** Accesibilidad: lector de pantalla y teclado (CA-A1 a CA-A3). */
  accesibilidad: {
    /** Enlace para saltar directo a la cuadrícula (primer elemento enfocable del estudio). */
    saltarEditor: "Saltar al editor",
    editorEtiqueta: "Editor del motivo",
    descripcionMotivo: "Descripción del motivo para lectores de pantalla",
    zoom: "Zoom",
    instrucciones:
      "Flechas: moverte entre casillas. Enter o Espacio: aplicar la herramienta en la casilla. Mayús con las flechas: pintar mientras te mueves. L, R, C y S eligen la herramienta; 1 a 9 eligen la lana. Tab: salir de la cuadrícula.",
    anuncioHerramienta: "Herramienta",
    anuncioZoomAjustado: "Zoom ajustado a la pantalla",
    anuncioLana: "Lana activa",
    anuncioPintada: "pintada",
    anuncioRellenada: "rellenada",
    anuncioCuentagotas: "Lana tomada de la casilla",
    vistaPreviaEtiqueta: "Vista previa del tejido",
  },
  /**
   * Atajos de teclado del editor (CA-A1). Las teclas de una sola letra solo funcionan con el foco en la cuadrícula
   * (WCAG 2.1.4), para no chocar con la escritura en los campos. Deshacer y rehacer funcionan en toda la página,
   * salvo dentro de un campo de texto, que tiene su propio deshacer.
   */
  atajos: {
    titulo: "Atajos de teclado",
    nota: "Las teclas de una letra funcionan con el foco en la cuadrícula.",
    lista: [
      { teclas: "Flechas", accion: "Mover la casilla enfocada" },
      { teclas: "Inicio / Fin", accion: "Ir a la primera o a la última casilla de la fila" },
      { teclas: "Re Pág / Av Pág", accion: "Subir o bajar 5 filas" },
      { teclas: "Enter o Espacio", accion: "Aplicar la herramienta en la casilla enfocada" },
      { teclas: "Mayús + flechas", accion: "Pintar las casillas por las que pasas (lápiz y sin punto); se deshace de una vez" },
      { teclas: "Tab", accion: "Salir de la cuadrícula hacia el siguiente control" },
      { teclas: "L", accion: "Lápiz" },
      { teclas: "R", accion: "Relleno" },
      { teclas: "C", accion: "Cuentagotas" },
      { teclas: "S", accion: "Sin punto" },
      { teclas: "1 a 9", accion: "Elegir la lana A a I" },
      { teclas: "[ y ]", accion: "Lana anterior y siguiente" },
      { teclas: "+ y −", accion: "Acercar y alejar" },
      { teclas: "0", accion: "Ajustar a la pantalla" },
      { teclas: "Ctrl o Cmd + Z", accion: "Deshacer" },
      { teclas: "Ctrl o Cmd + Mayús + Z", accion: "Rehacer (también Ctrl + Y)" },
    ],
  },

  /** Editor de motivo (cuadrícula). */
  editor: {
    titulo: "Gráfico",
    leyendaSinPunto: "Rayas: sin punto",
    leyendaPierde: "Triángulo: aquí se pierde un punto",
    verMotivo: "Solo el motivo",
    verCompleto: "Con repeticiones",
    vista: "Vista del gráfico",
    vistaCompletaDemasiado:
      "El gráfico con repeticiones es demasiado grande para dibujarlo aquí. Se muestra solo el motivo.",
    lanaActiva: "Lana activa",
    leerDerecho: "Las flechas del borde indican por dónde empieza a leerse cada fila.",
    espejo:
      "Lectura en espejo: la preferencia «Tejer en espejo» de tu cuenta, pensada para zurdas que tejen en sentido contrario. Las filas se leen al revés y las casillas se numeran desde la izquierda. El dibujo no cambia.", // validar con tejedora
    sinLanas: "Este diseño no tiene lanas.",
    dedoDibuja: "Dibujar con el dedo o el lápiz",
    dedoAyudaTitulo: "¿Cómo funciona?",
    dedoAyuda:
      "Apagado, con el dedo o el lápiz desplazas la cuadrícula y tocas una casilla para aplicar la herramienta. Encendido, arrastrar dibuja y la página no se desplaza sobre la cuadrícula.",
    descripcionTitulo: "Descripción del motivo en texto",
    descripcionVacia: "Calculando la descripción…",
  },

  /** Panel de lanas. */
  panelLanas: {
    editar: "Editar",
    cerrar: "Cerrar",
    activa: "Usar esta lana",
    activaEstado: "lana activa",
    subir: "Subir",
    bajar: "Bajar",
    notaTitulo: "Nota privada",
    notaAyuda: "Solo la ves tú. Para compartir el diseño tendrás que borrar las notas de las lanas. Sirve para anotar la marca o dónde la compraste.",
    notaEtiqueta: "Mi lana (opcional)",
    paletaVacia: "Personalizado",
    fibra: "Fibra",
    porcentaje: "Porcentaje",
    agregarFibra: "Agregar fibra",
    quitarFibra: "Quitar fibra",
    suma: "Suma",
    noSeGuarda: "Los cambios de esta lana no se guardan hasta que se corrija.",
    reemplazoPregunta: "¿Con qué lana reemplazas sus casillas?",
    reemplazoConfirmar: "Quitar y reemplazar",
    cancelar: "Cancelar",
    maximo: "Llegaste al máximo de lanas del diseño.",
    sugerencia: "Para este grosor, suelen usarse",
    agujas: "palillos", // "aguja" se acepta como alias (CLAUDE.md: tejido a palillo)
    crochet: "crochet",
    muestraCyc: "muestra de referencia",
  },

  /** Panel lateral. */
  panel: {
    titulo: "Panel lateral",
    diseno: "Diseño",
    cuadricula: "Cuadrícula",
    muestraSeccion: "Muestra",
    medidasSeccion: "Medidas y puntos",
    validacionSeccion: "Revisión del diseño",
    motivoTamano: "Tamaño del motivo",
    puntosMotivo: "Puntos (ancho)",
    filasMotivo: "Filas (alto)",
    aplicarTamano: "Aplicar tamaño",
    tamanoAyuda: "Si agrandas el motivo, lo nuevo se rellena con la lana A. Se ancla abajo a la izquierda.",
    tamanoCirculo:
      "En el círculo, las casillas nuevas se rellenan con la lana A y pueden romper la forma de la cuña. Revisa los bordes y marca con «sin punto» las que queden fuera de la cuña.", // validar con tejedora
    repeticionesRango: "Repeticiones recomendadas en el círculo: de 4 a 12.",
    puntosEn10: "Puntos en 10 cm",
    filasEn10: "Filas en 10 cm",
    muestraAyudaVacia: "Sin muestra tuya: las medidas usan una muestra supuesta.",
    muestraProporcion: "Muestra supuesta según el grosor de la lana A",
    sinMedidas: "—",
    sinPuntos: "Sin puntos todavía: las medidas aparecen cuando haya al menos un punto.",
    revisando: "Revisando…",
    todoBien: "Sin avisos.",
    tejerAyuda: "Crea un proyecto con esta versión del diseño fijada y te lleva a seguirlo fila a fila. Antes verás un resumen.",
    guardarVersionAyuda:
      "Una versión es una copia del diseño tal como está guardado, a la que puedes volver. El autoguardado no crea versiones.",
  },

  /** Revisión (validador). */
  validacion: {
    impideTejer: "Impide tejer",
    impideTejerAyuda: "El diseño se guarda como borrador, pero no se puede tejer ni publicar hasta corregirlo.",
    impideGuardar: "Impide guardar",
    advertencias: "Advertencias",
    informacion: "Información",
    verDetalle: "Ver detalle",
    sinFilaCantidad: "se repite",
  },

  /** Vista previa. */
  vistaPrevia: {
    titulo: "Vista previa",
    muestraSupuesta: "La vista usa una muestra supuesta.",
    rotacion: "Girar el tubo",
    error: "No se pudo dibujar la vista previa de este diseño.",
    ajustar: "Ajustar",
    acercar: "Acercar",
    alejar: "Alejar",
    moverConDedo: "Mover la vista con el dedo",
    moverConDedoAyuda: "Apagado, el dedo desplaza la página. Encendido, arrastrar mueve la vista previa.",
    descripcionCarga: "Descripción del diseño",
    limitacionesAbrir: "Lo que la vista no muestra",
    /** Interruptor de vista (ADR 0008 §4): no cambia el diseño. */
    coloresPlanos: "Colores planos",
    coloresPlanosAyuda: "Muestra cada lana solo con su color, sin el halo ni el brillo de la fibra. No cambia el diseño.",
    /** Regla de oro 8: el aspecto por fibra también es una aproximación. */
    aspectoFibra: "El halo y el brillo según la fibra son una aproximación visual.",
  },

  /** Pestañas en tableta y móvil. */
  pestanas: {
    etiqueta: "Secciones del estudio",
    editor: "Editor",
    vista: "Vista previa",
    ajustes: "Ajustes",
  },

  /** Cierre de sesión y respaldo local (pendientes de T8). */
  respaldo: {
    recuperacionEditando:
      "Ya empezaste a editar. Tus cambios nuevos se guardan en el diseño, pero este respaldo se conserva hasta que decidas. Recuperar lo reemplaza por el respaldo.",
  },

  /** Metraje estimado por lana (ADR 0008 §6, T1-6). Siempre "estimación"; nunca gramos ni ovillos. */
  metraje: {
    seccion: "Metraje estimado",
    lista: "Metraje por lana",
    lana: "Lana",
    calculando: "Calculando el metraje…",
    seActualiza: "Se actualiza un momento después de que dejas de editar.",
    total: "Total de las lanas",
    supuestos: "Supuestos",
    sinMuestra: "No hay una muestra con la que estimar: ingresa la tuya en la sección Muestra.",
    sinEstimacion: "Sin estimación",
    // Crochet: no hay factores validados (F3-25); no se inventa una cifra.
    sinEstimacionCrochet: "Sin estimación en crochet todavía: aún no hay factores validados para este punto.", // validar con tejedora
  },

  /** Selector de lanas (por lana del diseño). */
  selectorLanas: {
    pestanaAjustar: "Ajustar la lana",
    pestanaMisLanas: "Mis lanas",
    pestanas: "Elegir el aspecto de la lana",
    buscarGrosor: "Buscar grosor por nombre",
    buscarGrosorAyuda: "Por ejemplo «aran», «dk», «fino» o «mediano». No distingue tildes ni mayúsculas.",
    grosorLista: "Grosor",
    aproximada: "equivalencia aproximada",
    nombresAyudaTitulo: "Sobre los nombres de los grosores",
    nombresAyuda:
      "Los nombres en español son los de LoopitaLab y los que están entre paréntesis son nombres en inglés de uso común para ese grosor, según el Craft Yarn Council. Algunos nombres de uso común («mediano», «grueso») son equivalencias aproximadas: no siempre significan lo mismo en todas partes. Ante la duda, mira la muestra.", // validar con tejedora
    muestraSupuesta: "Muestra supuesta",
    muestraSupuestaAyuda: "hasta que ingreses la tuya en la sección Muestra",
    paleta: "Paleta",
    paletaAyuda: "Pasa el cursor o el foco por un color para verlo en la vista previa. Enter o clic lo elige.",
    personalizado: "Color personalizado",
    hexEtiqueta: "Código del color (#RRGGBB)",
    hexInvalido: "El color debe tener el formato #RRGGBB, por ejemplo #A63D40.",
    masCercano: "El color más cercano de la paleta",
    practicamenteIgual: "prácticamente igual",
    usarColor: "Usar",
    seleccionado: "elegido",
    coloresPlanosActivo: "Colores planos está activado: la vista previa muestra solo el color, sin el halo ni el brillo de la fibra.",
    coloresPlanosApagar: "Apagar colores planos",
    coloresPlanosEncender: "Activar colores planos",
    cerrar: "Cerrar el selector (Esc)",
    fibraAviso: "Aviso",
    // Mis lanas
    misLanasIntro: "Lanas que guardaste en tu cuenta. Al usar una, se copia su grosor, su composición y su color a la lana del diseño.",
    misLanasCargando: "Cargando tus lanas…",
    misLanasVacia: "Todavía no guardaste lanas.",
    misLanasIrA: "Administrar mis lanas",
    misLanasSinSesion: "Inicia sesión para usar tus lanas guardadas.",
    misLanasActualizar: "Actualizar la lista",
    copiarNota: (letter: string) => `Copiar también la nota privada de la lana guardada (si no, la lana ${letter} conserva la suya)`,
    copiarNotaAyuda: "La nota suele llevar la marca o dónde la compraste. Déjala sin marcar si vas a compartir el diseño: un diseño con notas en las lanas no se puede compartir.",
    usarEn: "Usar en la lana",
    agregarNueva: "Agregar como lana nueva",
    usada: "Listo",
    usadaConservaNota: "conserva su nota anterior; revísala.",
    noValida: "Esta lana guardada no se puede usar en el diseño:",
  },
} as const;

/** Mensaje al usar una lana guardada; avisa si la lana del diseño conserva su nota anterior. */
export function savedYarnUsedText(letter: string, keptOldNote: boolean): string {
  return keptOldNote ? `Listo. La lana ${letter} ${STUDIO_TEXTS.selectorLanas.usadaConservaNota}` : STUDIO_TEXTS.selectorLanas.usada;
}

/** "Puntos por vuelta" o "Puntos por fila" según cómo se trabaja el diseño. */
export function stitchesPerWorkedRowLabel(workedIn: "rows" | "rounds"): string {
  return `Puntos por ${(workedIn === "rounds" ? STUDIO_TEXTS.unidades.vuelta : STUDIO_TEXTS.unidades.fila).toLowerCase()}`;
}

/** Rótulo del punto en que se supone la muestra de referencia. */
export function gaugeStitchLabel(assumption: "stockinette" | "crochet-pb" | "crochet-pa"): string {
  return assumption === "stockinette" ? "punto jersey" : assumption === "crochet-pa" ? "punto alto" : "punto bajo";
}

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
 * Ejemplo: "Fila 3, casilla 5, lana B". `yarn` es el texto de la lana o "sin punto". `col` ya viene numerada con
 * `columnLabel` (casilla 1 a la derecha; a la izquierda con espejo, E18).
 */
export function cellAnnouncement(row: number, col: number, yarn: string, workedIn: WorkedIn): string {
  const unit = workedIn === "rounds" ? STUDIO_TEXTS.unidades.vuelta : STUDIO_TEXTS.unidades.fila;
  return `${unit} ${row}, ${STUDIO_TEXTS.unidades.casilla} ${col}, ${yarn}`;
}

/** Por dónde empieza a leerse una fila o vuelta. Sale de `readingDirection` de pattern-core (ya con el espejo aplicado). */
export type ReadDirection = "right_to_left" | "left_to_right";

/** Aviso de lectura de la fila o vuelta: se dice al entrar a una fila nueva, no en cada casilla. */
export function readingNote(workedIn: WorkedIn, direction: ReadDirection, mirror: boolean): string {
  const unit = workedIn === "rounds" ? "vuelta" : "fila";
  const from = direction === "right_to_left" ? "derecha a izquierda" : "izquierda a derecha";
  const base = `Esta ${unit} se lee de ${from}${mirror ? " (lectura en espejo, para zurdas)" : ""}.`;
  if (workedIn === "rounds") return base;
  // Por el derecho se lee de derecha a izquierda; el espejo invierte la lectura, no el lado. // validar con tejedora
  const rightSide = (direction === "right_to_left") !== mirror;
  return `${base} Se teje por el ${rightSide ? "lado derecho" : "revés"}.`;
}

/** Nombre accesible del editor, con su tamaño: "Editor del motivo: 12 puntos de ancho y 10 filas de alto". */
export function editorLabel(cols: number, rows: number, workedIn: WorkedIn): string {
  const unit = workedIn === "rounds" ? (rows === 1 ? "vuelta" : "vueltas") : rows === 1 ? "fila" : "filas";
  return `${STUDIO_TEXTS.accesibilidad.editorEtiqueta}: ${cols} ${cols === 1 ? "punto" : "puntos"} de ancho y ${rows} ${unit} de alto`;
}

/** Lana movida en la lista: al cambiar de posición cambia de letra, y el dibujo conserva sus colores. */
export function yarnMovedText(fromLetter: string, toLetter: string): string {
  return `La lana ${fromLetter} ahora es la lana ${toLetter}. El dibujo conserva sus colores.`;
}

/** Lana quitada: sus casillas pasan a la lana de reemplazo (letras ya calculadas después de quitar). */
export function yarnRemovedText(removedLetter: string, replacementLetter: string, lettersShift: boolean): string {
  return `Se quitó la lana ${removedLetter}. Sus casillas ahora usan la lana ${replacementLetter}.${lettersShift ? " Las lanas siguientes cambiaron de letra." : ""}`;
}

/**
 * Lana en la revisión agrupada: "la lana B (rojo)" con el nombre de la paleta, o "la lana B (color personalizado)".
 * Nunca el hex: no le dice nada a quien teje.
 */
export function yarnReviewLabel(letter: string, paletteName?: string): string {
  return `la lana ${letter} (${paletteName && paletteName.length > 0 ? paletteName : "color personalizado"})`;
}

/** Lana agregada. */
export function yarnAddedText(letter: string): string {
  return `Se agregó la lana ${letter}. Puedes cambiar su color y su grosor.`;
}

/**
 * Nombre accesible de un botón de una lana: "Quitar lana A", "Editar lana A" (contiene el texto visible, WCAG 2.5.3).
 * Si el texto visible ya dice "lana" ("Quitar lana"), no se repite: "Quitar lana B", no "Quitar lana lana B".
 */
export function yarnButtonLabel(verb: string, letter: string, suffix = ""): string {
  const base = verb.trimEnd();
  const head = /(^|\s)lana$/i.test(base) ? base : `${base} lana`;
  return `${head} ${letter}${suffix}`;
}

/** Conteos de la revisión del diseño (por grupo de aviso), para el resumen que lee el lector de pantalla. */
export interface ReviewCounts {
  cannotKnit: number;
  cannotSave: number;
  warnings: number;
  info: number;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Resumen de la revisión: solo cambia cuando cambian los conteos, así el lector de pantalla no repite lo mismo. */
export function reviewSummary(c: ReviewCounts): string {
  const parts: string[] = [];
  if (c.cannotSave > 0) parts.push(`${plural(c.cannotSave, "error que impide guardar", "errores que impiden guardar")}`);
  if (c.cannotKnit > 0) parts.push(`${plural(c.cannotKnit, "error que impide tejer", "errores que impiden tejer")}`);
  if (c.warnings > 0) parts.push(plural(c.warnings, "advertencia", "advertencias"));
  if (c.info > 0) parts.push(plural(c.info, "aviso informativo", "avisos informativos"));
  return parts.length === 0 ? "Revisión del diseño: sin avisos." : `Revisión del diseño: ${parts.join(", ")}.`;
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
 * Ejemplo en redondo: "Vuelta 31: 56 pts, −8 en la vuelta, −1 por repetición"; en ida y vuelta, "Fila 31: …, −8 en la fila…".
 */
export function shapingLine(row: number, stitches: number, change: number, perRepeat: number, workedIn: WorkedIn = "rounds"): string {
  const unit = workedIn === "rounds" ? "vuelta" : "fila";
  return `${rowWord(workedIn, false)} ${row}: ${stitches} ${STUDIO_TEXTS.unidades.puntosAbrev}, ${signed(change)} en la ${unit}, ${signed(perRepeat)} por repetición`;
}

/**
 * Aviso en una casilla de disminución: se pierde un punto aquí. No decide el tipo de disminución.
 * `col` ya viene numerada con `columnLabel` (E18).
 */
export function lostStitchNote(row: number, col: number, workedIn: WorkedIn): string {
  const unit = workedIn === "rounds" ? "vuelta" : "fila";
  return `Aquí se pierde un punto (${unit} ${row}, casilla ${col}). La vista no indica todavía el tipo de disminución.`; // validar con tejedora
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

/** Palabra para las filas según cómo se teje: "vuelta" (en redondo) o "fila" (ida y vuelta). */
export function rowWord(workedIn: WorkedIn, plural: boolean): string {
  if (workedIn === "rounds") return plural ? "Vueltas" : "Vuelta";
  return plural ? "Filas" : "Fila";
}

/** Texto de la revisión agrupada: una línea por grupo, con los rangos compactados. */
export function issueGroupText(
  kind: "float" | "colors" | "generic",
  p: { workedIn: WorkedIn; ranges: string; count: number; rowCount: number; yarn?: string; length?: number; cm?: string; max?: number; colors?: number; message?: string },
): string {
  const head = `${rowWord(p.workedIn, p.rowCount !== 1)} ${p.ranges}`;
  if (kind === "float") {
    const cm = p.cm ? ` (≈ ${p.cm} cm)` : "";
    const max = p.max !== undefined ? ` Máximo sugerido: ${p.max} puntos.` : "";
    return `${head}: la hebra flotante de ${p.yarn ?? "una lana"} llega a ${p.length ?? "?"} puntos${cm} en el peor caso; conviene enganchar la hebra o cambiar el dibujo.${max}`;
  }
  if (kind === "colors") {
    return `${head}: usan hasta ${p.colors ?? "más de 2"} lanas; en colorwork de hebras lo habitual es 2 por ${p.workedIn === "rounds" ? "vuelta" : "fila"}.`;
  }
  if (p.ranges && p.rowCount > 0) {
    const where = `${p.rowCount === 1 ? "en la" : "en las"} ${rowWord(p.workedIn, p.rowCount !== 1).toLowerCase()} ${p.ranges}`;
    return `${p.message ?? ""} (se repite ${p.count} veces, ${where})`;
  }
  return `${p.message ?? ""} (se repite ${p.count} veces)`;
}

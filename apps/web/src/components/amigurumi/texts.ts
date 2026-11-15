/**
 * Textos del visor 3D amigurumi (ADR 0010, secciones 5 a 8; enmienda C-11). Redacción provisional de `visor-3d`:
 * el texto final lo redacta `documentador` y lo valida `experto-tejido` (sección 7).
 */
export const VIEWER_3D_TEXTS = {
  /**
   * Aviso de prototipo digital (regla de oro 8; enmienda C-11, F4-44, F4-54 y F4-79): siempre visible junto al
   * visor y sin botón para cerrarlo.
   */
  avisoPrototipo:
    "Vista aproximada. La forma y el tamaño reales dependen de tu tensión, la lana y el relleno. El relleno redondea la pieza y puede cambiar sus medidas. El amigurumi se teje más apretado que una muestra plana: teje una muestra con tu aguja para comprobar. El halo y el brillo de la fibra son una aproximación visual.",
  etiquetaLienzo: "Vista 3D del amigurumi. Flechas: girar; + y −: acercar y alejar; 0: volver a la vista inicial.",
  cargando: "Cargando la vista 3D…",
  actualizando: "Actualizando 3D…",
  coloresPlanos: "Colores planos",
  coloresPlanosAyuda: "Muestra cada lana solo con su color, sin el halo ni el brillo de la fibra. No cambia el diseño.",
  nivel: "Detalle",
  nivelRelieve: "Relieve del punto",
  nivelLiso: "Liso",
  nivelForzado: "La escena tiene muchos puntos: el 3D se dibuja liso para seguir fluido.",
  sobreRecomendado: "Esta escena supera los puntos recomendados: la vista previa puede ir más lenta. El editor sigue igual.",
  sobreTope:
    "Esta escena tiene demasiados puntos para armar el 3D sin trabar la página. Se muestran las siluetas de las piezas; editar y guardar siguen igual.",
  sinWebgl: "Este navegador no tiene WebGL 2, así que no se puede mostrar la vista 3D. Se muestran las siluetas de las piezas.",
  contextoPerdido: "Se perdió la vista 3D (el navegador liberó la tarjeta gráfica). Se muestran las siluetas mientras se recupera.",
  soloEn3d: "Las siluetas usan el color plano de cada lana: el halo y el brillo solo se ven en la vista 3D.",
  medidasTitulo: "Medidas",
  estimacion: "estimación",
  supuesto: "supuesto",
  muestraSupuesta: "Las medidas y la forma usan una muestra supuesta: teje una muestra para comprobar.",
  seleccion: "Punto elegido",
  sinSeleccion: "Toca la pieza para ver la vuelta y el punto.",
} as const;

/** "≈ 12 cm de alto, ≈ 8 cm de ancho, estimación" (sección 7), con "supuesto" si la muestra es supuesta. */
export function measureText(heightCm: number, widthCm: number, assumed: boolean): string {
  const cm = (x: number) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toLocaleString("es-CL") : "—");
  return `≈ ${cm(heightCm)} cm de alto, ≈ ${cm(widthCm)} cm de ancho, ${VIEWER_3D_TEXTS.estimacion}${assumed ? `, ${VIEWER_3D_TEXTS.supuesto}` : ""}`;
}

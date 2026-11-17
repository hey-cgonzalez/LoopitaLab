// Aviso de derechos de la función Imagen a patrón (ADR 0013, sección 7).
// Sin "use server": son constantes que usan el navegador y el servidor.
// [PENDIENTE DE REVISIÓN LEGAL]: el texto es un borrador. Cambiarlo obliga a
// subir RIGHTS_VERSION, para volver a pedir la casilla en cada subida.

export const RIGHTS_VERSION = "rights-v1";

/** Texto de la casilla obligatoria, sin marcar, en cada subida. */
export const RIGHTS_LABEL =
  "Tengo derecho a usar esta imagen y no muestra a personas identificables. " +
  "Entiendo que una versión reducida se envía a un proveedor de inteligencia artificial (Anthropic) solo para analizarla, " +
  "y que la foto se borra a más tardar en 7 días.";

/** Texto de ayuda bajo la casilla. */
export const RIGHTS_HELP =
  "Sube solo imágenes tuyas o con permiso de quien tenga los derechos. " +
  "Las fotos cuyo tema principal es una persona se rechazan. " +
  "La imagen se reduce en tu equipo antes de enviarse, sin datos de ubicación ni del dispositivo. " +
  "Puedes borrarla cuando quieras con el botón “Borrar la foto”. " +
  "Ver la Política de privacidad y los Términos de servicio.";

/** Marca para que la revisión legal sepa que el texto no está aprobado. */
export const RIGHTS_LEGAL_STATUS = "[PENDIENTE DE REVISIÓN LEGAL]";

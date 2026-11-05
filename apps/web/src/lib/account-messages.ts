/**
 * Mensajes de "Tus datos" y de la re-autenticación con contraseña. Funciones puras: cada
 * código que devuelven Supabase Auth y las rutas /api/cuenta/* tiene un mensaje que dice qué hacer.
 */

/** Error de signInWithPassword al confirmar la contraseña actual en el navegador. */
export function reauthErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "La contraseña no es correcta. Revisa e intenta de nuevo.";
    case "captcha_failed":
      return "No pudimos verificar que no eres un robot. Resuelve la verificación de nuevo e intenta otra vez.";
    case "over_request_rate_limit":
      return "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
    case "email_not_confirmed":
      return "Falta confirmar tu correo. Abre el enlace que te enviamos y vuelve a intentarlo.";
    default:
      return "No pudimos verificar tu contraseña. Revisa tu conexión e intenta de nuevo en unos minutos.";
  }
}

/** Respuesta de POST /api/cuenta/eliminar que no fue 200. */
export function deleteAccountMessage(status: number, reason?: string): string {
  switch (status) {
    case 400:
      return "Escribe ELIMINAR para confirmar.";
    case 401:
      return "Tu sesión expiró. Vuelve a ingresar y repite el proceso.";
    case 403:
      if (reason === "reauth_required") return "Por seguridad, vuelve a escribir tu contraseña e intenta de nuevo.";
      if (reason === "cross_site") return "La solicitud fue bloqueada por seguridad. Recarga la página desde LoopitaLab e intenta de nuevo.";
      return "No tienes permiso para completar esta acción.";
    case 413:
      return "La solicitud es demasiado grande. Recarga la página e intenta de nuevo.";
    case 429:
      return "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
    default:
      return "No pudimos eliminar tu cuenta. Intenta de nuevo en unos minutos; si sigue pasando, escríbenos.";
  }
}

/** Respuesta de GET /api/cuenta/exportar que no fue 200, o descarga cortada a mitad (status 0). */
export function exportMessage(status: number, reason?: string): string {
  switch (status) {
    case 0:
      return "La descarga se cortó antes de terminar y el archivo quedaría incompleto. Intenta de nuevo en unos minutos.";
    case 401:
      return "Tu sesión expiró. Vuelve a ingresar para descargar tus datos.";
    case 403:
      return "La solicitud fue bloqueada por seguridad. Recarga la página desde LoopitaLab e intenta de nuevo.";
    case 409:
      return "Ya estamos preparando una descarga de tus datos. Espera a que termine e intenta de nuevo.";
    case 429:
      if (reason === "daily_limit") return "Llegaste al máximo de 5 descargas de tus datos en 24 horas. Vuelve a intentarlo mañana.";
      return "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
    default:
      return "No pudimos preparar tus datos. Intenta de nuevo en unos minutos; si sigue pasando, escríbenos.";
  }
}

/** Respuesta de POST /api/cuenta/reautenticar que no fue 201. */
export function reauthIntentMessage(status: number): string {
  switch (status) {
    case 401:
      return "Tu sesión expiró. Vuelve a ingresar e intenta de nuevo.";
    case 403:
      return "La solicitud fue bloqueada por seguridad. Recarga la página desde LoopitaLab e intenta de nuevo.";
    case 429:
      return "Hiciste muchos intentos de confirmación seguidos. Espera unos minutos y vuelve a intentarlo.";
    default:
      return "No pudimos preparar la confirmación. Revisa tu conexión e intenta de nuevo en unos minutos.";
  }
}

/**
 * Paso 1 de la re-autenticación (F2-M5): pide al servidor el intento para la acción, antes de
 * verificar la contraseña en el navegador. Devuelve el mensaje de error, o null si salió bien.
 */
export async function requestReauthIntent(action: "delete_account" | "change_password"): Promise<string | null> {
  try {
    const res = await fetch("/api/cuenta/reautenticar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    return res.ok ? null : reauthIntentMessage(res.status);
  } catch {
    return reauthIntentMessage(0);
  }
}

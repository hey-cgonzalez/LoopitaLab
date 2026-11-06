/** Validaciones y mensajes de acceso, compartidos entre navegador y servidor. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

/** Mismas reglas que supabase/config.toml: al menos 8 caracteres, con letras y números. */
export function passwordProblem(password: string): string | undefined {
  if (password.length < MIN_PASSWORD) return `Usa al menos ${MIN_PASSWORD} caracteres.`;
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(password) || !/\d/.test(password)) return "Combina letras y números.";
  return undefined;
}

export interface FormState {
  error?: string;
  ok?: string;
  fields?: Record<string, string>;
  fieldErrors?: Record<string, string>;
}

/** Traduce los errores de Supabase Auth a mensajes que digan qué hacer. */
export function authMessage(error: { code?: string | undefined; message: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "El correo o la contraseña no coinciden. Revisa ambos e intenta de nuevo.";
    case "email_not_confirmed":
      return "Falta confirmar tu correo. Abre el enlace que te enviamos y vuelve a ingresar.";
    case "weak_password":
      return `La contraseña es muy débil. Usa al menos ${MIN_PASSWORD} caracteres, con letras y números.`;
    case "same_password":
      return "La nueva contraseña debe ser distinta de la anterior.";
    case "reauthentication_needed":
      return "Por seguridad, vuelve a ingresar antes de cambiar la contraseña.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Hiciste muchos intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
    case "signup_disabled":
      return "El registro está cerrado por ahora.";
    case "captcha_failed":
      return "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.";
    default:
      return "No pudimos completar la solicitud. Revisa tu conexión e intenta de nuevo en unos minutos.";
  }
}

/** Ingreso y registro con Google o Microsoft. */
export const OAUTH_ERROR_MESSAGE = "No pudimos completar el ingreso con el proveedor. Intenta de nuevo o usa tu correo.";
export const OAUTH_START_ERROR = "No pudimos abrir el ingreso con el proveedor. Intenta de nuevo en unos minutos o usa tu correo.";
export const REAUTH_EXPIRED_MESSAGE = "La confirmación venció o no es válida. Vuelve a confirmar.";
export const REAUTH_FAILED_MESSAGE = "No pudimos confirmar tu identidad con el proveedor. Intenta de nuevo.";
/** Neutro a propósito: un enlace manipulado (?reauth=...) también mostraría este aviso. */
export const REAUTH_RETURN_NOTICE = "Si ya confirmaste con tu proveedor, escribe ELIMINAR para terminar. La confirmación vale 5 minutos.";
export const PASSWORD_STATUS_UNKNOWN = "No pudimos comprobar tu forma de ingreso. Intenta más tarde.";
export const CREATE_PASSWORD_FIRST = "Crea una contraseña con un enlace por correo y luego podrás eliminar tu cuenta.";
export const PASSWORD_LINK_SENT = "Te enviamos un enlace por correo. Ábrelo para crear tu contraseña; vale por poco tiempo.";

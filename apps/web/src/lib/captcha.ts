/** Utilidades de Cloudflare Turnstile. Activo solo si existe NEXT_PUBLIC_TURNSTILE_SITE_KEY. */

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

export const captchaEnabled = (): boolean => TURNSTILE_SITE_KEY !== "";

export const CAPTCHA_MISSING = "Completa la verificación de seguridad antes de continuar. Si no aparece, recarga la página.";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

export function turnstile(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

/** Token del widget dentro del formulario (Turnstile lo agrega como campo oculto). */
export function captchaToken(form: FormData): string {
  return String(form.get("cf-turnstile-response") ?? "");
}

/** Opciones para Supabase Auth: undefined si el CAPTCHA está desactivado. */
export function captchaOptions(form: FormData): { captchaToken: string } | undefined {
  return captchaEnabled() ? { captchaToken: captchaToken(form) } : undefined;
}

/** El token es de un solo uso: se pide uno nuevo tras cada intento. */
export function resetCaptcha(): void {
  if (captchaEnabled()) turnstile()?.reset();
}

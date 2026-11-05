/**
 * Ingreso con proveedores externos (Google y Microsoft, que en Supabase es `azure`).
 * Funciones puras: se pueden probar sin navegador.
 */

export type OAuthProvider = "google" | "azure";

/** Orden fijo en que se muestran los botones. */
const ORDER: readonly OAuthProvider[] = ["google", "azure"];

const LABELS: Record<OAuthProvider, string> = { google: "Google", azure: "Microsoft" };

/** Interpreta el valor de NEXT_PUBLIC_AUTH_PROVIDERS ("google,azure"). Ignora lo desconocido. */
export function parseProviders(raw: string | undefined): OAuthProvider[] {
  const wanted = new Set((raw ?? "").split(",").map((s) => s.trim().toLowerCase()));
  return ORDER.filter((p) => wanted.has(p));
}

/** Proveedores habilitados en este despliegue. Vacío = solo correo y contraseña. */
export function enabledProviders(): OAuthProvider[] {
  // Debe leerse como process.env.NEXT_PUBLIC_*: así Next la inserta en el código del navegador.
  return parseProviders(process.env.NEXT_PUBLIC_AUTH_PROVIDERS);
}

export function providerLabel(p: OAuthProvider): string {
  return LABELS[p];
}

/** Nombre legible de un proveedor de `user.identities`; undefined si no es uno que mostremos. */
export function identityLabel(provider: string): string | undefined {
  if (provider === "email") return "Correo y contraseña";
  return provider === "google" || provider === "azure" ? LABELS[provider] : undefined;
}

/**
 * Parámetros que obligan al proveedor a pedir de nuevo las credenciales al re-autenticar
 * (acciones sensibles). Si cambian, ajustar también la documentación del backend.
 */
export const REAUTH_QUERY_PARAMS: Record<OAuthProvider, Record<string, string>> = {
  azure: { prompt: "login" },
  google: { prompt: "select_account", max_age: "0" },
};

export interface OAuthOptions {
  redirectTo: string;
  scopes?: string;
  queryParams?: Record<string, string>;
}

/** Ruta de vuelta tras el proveedor: pasa por /auth/callback, que valida `next`. */
export function callbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** Opciones para `supabase.auth.signInWithOAuth`. */
export function oauthOptions(p: OAuthProvider, opts: { redirectTo: string; reauth?: boolean }): OAuthOptions {
  const out: OAuthOptions = { redirectTo: opts.redirectTo };
  if (p === "azure") out.scopes = "email";
  if (opts.reauth) out.queryParams = { ...REAUTH_QUERY_PARAMS[p] };
  return out;
}

export interface IdentityLike {
  provider: string;
}

/** Proveedores externos vinculados, sin repetir y en orden fijo. */
export function linkedProviders(identities: readonly IdentityLike[] | null | undefined): OAuthProvider[] {
  const have = new Set((identities ?? []).map((i) => i.provider));
  return ORDER.filter((p) => have.has(p));
}

export interface ReauthChoice {
  /** Tiene contraseña: es el único método para eliminar la cuenta (el servidor lo impone). */
  password: boolean;
  /** Proveedores con los que puede confirmar: solo si NO tiene contraseña (vinculados y habilitados). */
  providers: OAuthProvider[];
  /** Sin contraseña y sin proveedor utilizable: debe crear una contraseña por enlace de correo. */
  needsPassword: boolean;
}

/**
 * Cómo puede confirmar su identidad antes de eliminar la cuenta. `hasPassword` lo calcula el
 * servidor (no se deduce de `identities`). Con contraseña, solo contraseña; sin ella, con un
 * proveedor vinculado y habilitado; si no hay ninguno, primero debe crear una contraseña.
 */
export function reauthChoice(
  hasPassword: boolean,
  identities: readonly IdentityLike[] | null | undefined,
  enabled: readonly OAuthProvider[],
): ReauthChoice {
  const providers = hasPassword ? [] : linkedProviders(identities).filter((p) => enabled.includes(p));
  return { password: hasPassword, providers, needsPassword: !hasPassword && providers.length === 0 };
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/env";

/** Rutas que requieren sesión. */
const PROTECTED = ["/proyectos", "/cuenta", "/nueva-clave"];
/** Rutas de acceso: con sesión iniciada no tiene sentido verlas. */
const AUTH_PAGES = ["/ingresar", "/registro"];

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Refresca la sesión de Supabase en cada solicitud y protege las rutas privadas.
 * Usa getUser(), que valida el token con Supabase Auth (no confía solo en la cookie).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  let redirectTo: URL | null = null;

  if (!user && matches(path, PROTECTED)) {
    const target = new URL("/ingresar", request.nextUrl.origin);
    target.searchParams.set("next", path);
    redirectTo = target;
  } else if (user && matches(path, AUTH_PAGES)) {
    redirectTo = new URL("/proyectos", request.nextUrl.origin);
  }

  if (redirectTo) {
    const redirect = NextResponse.redirect(redirectTo);
    // Conserva las cookies de sesión recién refrescadas.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

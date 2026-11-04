import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino de los enlaces que llegan por correo (confirmar cuenta, recuperar contraseña).
 * Solo acepta el flujo PKCE (?code=): el código sirve únicamente en el navegador que pidió
 * el correo, así que nadie puede hacer entrar a otra persona en su cuenta con un enlace propio.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");

  let ok = false;
  if (code) {
    const supabase = await createClient();
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  // `next` ya pasó por safeNext: es una ruta interna, así que la URL queda en este mismo sitio.
  return NextResponse.redirect(new URL(ok ? next : "/ingresar?error=enlace", request.nextUrl.origin));
}

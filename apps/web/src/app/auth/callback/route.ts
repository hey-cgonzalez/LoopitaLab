import { NextResponse, type NextRequest } from "next/server";
import { callbackDestination, sanitizeErrorCode, type CallbackOutcome } from "@/lib/auth-callback";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino de los enlaces que llegan por correo (confirmar cuenta, recuperar contraseña) y de la
 * vuelta desde Google o Microsoft (ingreso y re-autenticación). Contrato de parámetros y
 * redirecciones: lib/auth-callback.ts.
 * Solo acepta el flujo PKCE (?code=): el código sirve únicamente en el navegador que inició el
 * flujo, así que nadie puede hacer entrar a otra persona en su cuenta con un enlace propio.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const error = searchParams.get("error");
  const code = searchParams.get("code");

  let outcome: CallbackOutcome;
  if (error) {
    // error_description es texto del proveedor: no se registra ni se reenvía.
    const errorCode = sanitizeErrorCode(searchParams.get("error_code") ?? error);
    console.warn("auth/callback: el proveedor o el enlace devolvió un error", errorCode);
    outcome = { kind: "provider_error", code: errorCode };
  } else if (code) {
    const supabase = await createClient();
    outcome = (await supabase.auth.exchangeCodeForSession(code)).error ? { kind: "exchange_failed" } : { kind: "ok" };
  } else {
    outcome = { kind: "exchange_failed" };
  }

  // callbackDestination devuelve siempre una ruta interna (pasa por safeNext): la URL queda en
  // este mismo sitio.
  return NextResponse.redirect(new URL(callbackDestination(searchParams.get("next"), outcome), request.nextUrl.origin));
}

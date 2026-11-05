import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Cierra la sesión. Solo por POST y solo desde este mismo sitio, para que otra página
 * no pueda cerrar la sesión de nadie con un formulario oculto.
 */
export async function POST(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const sameSite = fetchSite ? fetchSite === "same-origin" : origin === request.nextUrl.origin;
  if (!sameSite) return new NextResponse(null, { status: 403 });

  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}

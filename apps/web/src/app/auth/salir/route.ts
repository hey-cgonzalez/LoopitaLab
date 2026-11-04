import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Cierra la sesión. Solo por POST, para que un enlace o una imagen no puedan cerrarla. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = request.nextUrl.clone();
  target.pathname = "/";
  target.search = "";
  return NextResponse.redirect(target, { status: 303 });
}

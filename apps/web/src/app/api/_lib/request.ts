import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/**
 * ¿La solicitud viene de este mismo sitio? Mismo criterio que app/auth/salir/route.ts:
 * Sec-Fetch-Site si el navegador lo envía; si no, el encabezado Origin.
 * Para GET de navegación (un enlace o la barra de direcciones) se acepta además
 * Sec-Fetch-Site "none" (la usuaria escribió la URL); otro sitio no puede leer la respuesta.
 */
export function isSameSite(request: NextRequest, { allowNavigation = false } = {}): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin" || (allowNavigation && fetchSite === "none");
  const origin = request.headers.get("origin");
  if (origin) return origin === request.nextUrl.origin;
  // Navegadores antiguos no envían Origin en un GET del mismo sitio.
  return allowNavigation;
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Respuesta JSON de error con un código estable que la interfaz puede traducir. */
export function jsonError(status: number, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error }, { status, headers: { ...NO_STORE, ...headers } });
}

export function jsonOk(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Lee el cuerpo con tope real: no guarda en memoria más de `maxBytes`, aunque el encabezado
 * Content-Length falte o mienta. Devuelve "too_large" si se pasa y "timeout" si el cliente no
 * termina de enviarlo en `timeoutMs` (por defecto sin límite).
 */
export async function readBody(
  request: Request,
  maxBytes: number,
  timeoutMs?: number,
): Promise<Uint8Array | "too_large" | "timeout" | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return "too_large";
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    if (timeoutMs !== undefined) timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), timedOut]);
      if (next === "timeout") {
        await reader.cancel().catch(() => undefined);
        return "timeout";
      }
      const { done, value } = next;
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      chunks.push(value);
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Bandera de las subidas (T15 BAJO-4): sin interfaz hasta la fase 5, /api/subidas responde 404
 * salvo que LOOPITA_UPLOADS_ENABLED=1 (o "true"). Se lee en cada solicitud.
 */
export function uploadsEnabled(): boolean {
  const v = process.env.LOOPITA_UPLOADS_ENABLED;
  return v === "1" || v === "true";
}

export function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

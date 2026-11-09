import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import sharp from "sharp";
import { createAdminClient, UPLOADS_BUCKET } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { beginOperation, endOperation } from "../_lib/operations";
import { isSameSite, jsonError, jsonOk, readBody } from "../_lib/request";
import { Semaphore } from "../_lib/semaphore";
import { notFound, uploadsEnabled } from "./enabled";

/**
 * Subida de imágenes por el servidor (M3).
 * POST multipart/form-data con el campo `file`. Respuesta 201 { id, path }.
 *
 * - Solo mismo sitio y con sesión.
 * - Antes de leer el archivo se toma el candado de la usuaria y se cobra el intento en la base
 *   (public.begin_operation): una subida en curso por usuaria (409), 60 intentos y 30 imágenes
 *   guardadas por día (429). Los intentos fallidos (413, 415, ilegibles) también cuentan.
 * - El cuerpo debe llegar completo en 60 s (408 si no).
 * - Máximo 10 MB por solicitud. Coincide con el búfer de proxy.ts (proxyClientMaxBodySize,
 *   10 MB por defecto): un cuerpo mayor llegaría truncado, así que se rechaza antes.
 * - Se revisan los bytes reales (JPEG, PNG o WebP); el tipo que declara el navegador no cuenta.
 * - Se re-codifica a WebP: sin EXIF, XMP, IPTC ni perfil ICC (sharp no copia metadatos salvo
 *   que se pida), con la orientación aplicada y como máximo 4096 px por lado. Como máximo 2
 *   re-codificaciones simultáneas por instancia (503 si hay demasiadas esperando).
 * - Se guarda con la clave secreta en uploads/<uid>/<uuid>.webp y se registra en public.uploads.
 */

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 4096;
/** Tiempo máximo para recibir el cuerpo (F2-B11); el candado de subida dura 2 minutos. */
const READ_TIMEOUT_MS = 60_000;
/** Límite de píxeles al decodificar, contra "bombas" de descompresión (24 MP, ≈ 6000 × 4000). */
const MAX_INPUT_PIXELS = 24_000_000;

sharp.cache(false);
sharp.concurrency(1);

/** Re-codificaciones simultáneas por instancia, y cuántas pueden esperar turno. */
const encoder = new Semaphore(2, 4);

type ImageKind = "jpeg" | "png" | "webp";

/** Tipo real por los primeros bytes. SVG, HEIC, GIF y todo lo demás quedan fuera. */
function sniff(bytes: Uint8Array): ImageKind | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => at(i) === b)) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Re-codifica a WebP. Devuelve el búfer o la respuesta de error. */
async function reencode(input: Uint8Array, kind: ImageKind): Promise<Buffer | Response> {
  const release = await encoder.acquire();
  if (!release) return jsonError(503, "busy", { "Retry-After": "10" });
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false });
    const meta = await image.metadata();
    // El decodificador debe coincidir con los bytes mágicos (evita archivos políglotas).
    if (meta.format !== kind) return jsonError(415, "unsupported_type");
    return await image
      .rotate() // aplica la orientación EXIF antes de descartar los metadatos
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    // Imagen corrupta, demasiados píxeles o formato que no se puede decodificar.
    return jsonError(415, "unreadable_image");
  } finally {
    release();
  }
}

/** Todo lo que pasa después de cobrar el intento. */
async function processUpload(request: NextRequest, admin: Admin, userId: string, contentType: string): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  const raw = await readBody(request, MAX_BYTES, READ_TIMEOUT_MS);
  if (raw === "too_large") return jsonError(413, "too_large");
  if (raw === "timeout") return jsonError(408, "body_timeout");
  // Sin Content-Length, un cuerpo de exactamente 10 MB puede venir truncado por el proxy.
  if (raw && !declared && raw.byteLength === MAX_BYTES) return jsonError(413, "too_large");
  if (!raw) return jsonError(400, "file_required");

  let file: FormDataEntryValue | null;
  try {
    const form = await new Response(raw as BodyInit, { headers: { "content-type": contentType } }).formData();
    file = form.get("file");
  } catch {
    return jsonError(400, "invalid_form");
  }
  if (!(file instanceof File) || file.size === 0) return jsonError(400, "file_required");
  if (file.size > MAX_BYTES) return jsonError(413, "too_large");

  const input = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(input);
  if (!kind) return jsonError(415, "unsupported_type");

  const output = await reencode(input, kind);
  if (output instanceof Response) return output;
  if (output.byteLength > MAX_BYTES) return jsonError(413, "too_large");

  const path = `${userId}/${randomUUID()}.webp`;
  const { error: uploadError } = await admin.storage
    .from(UPLOADS_BUCKET)
    .upload(path, output, { contentType: "image/webp", upsert: false, cacheControl: "private, max-age=0" });
  if (uploadError) {
    console.error("subidas: error de Storage", uploadError.message);
    return jsonError(500, "storage_failed");
  }

  const { data: row, error: insertError } = await admin
    .from("uploads")
    .insert({ owner_id: userId, storage_path: path, mime_type: "image/webp", size_bytes: output.byteLength })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !row) {
    // Sin registro no debe quedar un archivo huérfano.
    const { error: removeError } = await admin.storage.from(UPLOADS_BUCKET).remove([path]);
    if (removeError) console.error("subidas: no se pudo borrar el archivo huérfano (sin ruta: lleva el uid)");
    if (insertError?.code === "54000") return jsonError(429, "daily_limit", { "Retry-After": "3600" });
    console.error("subidas: error al registrar", insertError?.message);
    return jsonError(500, "insert_failed");
  }

  return jsonOk({ id: row.id, path }, 201);
}

export async function POST(request: NextRequest) {
  if (!uploadsEnabled()) return notFound();
  if (!isSameSite(request)) return jsonError(403, "cross_site");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "unauthenticated");

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return jsonError(415, "multipart_required");

  let admin: Admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error("subidas: falta configuración", e instanceof Error ? e.message : e);
    return jsonError(500, "server_misconfigured");
  }

  // Candado y cobro del intento antes de leer el cuerpo: lo que falle después también cuenta.
  const lock = await beginOperation(admin, user.id, "upload");
  if (lock instanceof Response) return lock;
  try {
    return await processUpload(request, admin, user.id, contentType);
  } finally {
    await endOperation(admin, lock);
  }
}

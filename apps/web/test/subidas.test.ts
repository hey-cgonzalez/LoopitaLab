import { deflateSync, crc32 } from "node:zlib";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query, USER, type Result } from "./support/supabase-mock.ts";

// ---------------------------------------------------------------- simulación de Supabase

const TOKEN = "bbbbbbbb-0000-4000-8000-000000000001";
const state = {
  user: USER as typeof USER | null,
  /** Respuesta de begin_operation (candado y cobro del intento). */
  begin: { data: TOKEN, error: null } as Result,
  upload: { error: null } as Result,
  insert: { data: { id: "row-1" }, error: null } as Result,
  adminThrows: false,
};
const getUser = vi.fn(async () => ({ data: { user: state.user } }));
const sessionFrom = vi.fn(() => query(() => ({ data: null, error: null })));
const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) => (fn === "begin_operation" ? state.begin : { error: null }));
const upload = vi.fn(async (..._args: unknown[]) => state.upload);
const remove = vi.fn(async (..._args: unknown[]) => ({ error: null }));
const insertQuery = vi.fn(() => query(() => state.insert));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from: sessionFrom }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  UPLOADS_BUCKET: "uploads",
  createAdminClient: () => {
    if (state.adminThrows) throw new Error("Faltan variables");
    return { storage: { from: () => ({ upload, remove }) }, from: insertQuery, rpc };
  },
}));

const { POST } = await import("@/app/api/subidas/route");

beforeEach(() => {
  state.user = USER;
  state.begin = { data: TOKEN, error: null };
  state.upload = { error: null };
  state.insert = { data: { id: "row-1" }, error: null };
  state.adminThrows = false;
  for (const f of [getUser, sessionFrom, rpc, upload, remove, insertQuery]) f.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

// ---------------------------------------------------------------- utilidades

function formWith(bytes: Uint8Array | string, { name = "file", type = "image/png", filename = "foto.png" } = {}) {
  const f = new FormData();
  f.set(name, new File([bytes as BlobPart], filename, { type }));
  return f;
}

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/subidas", {
    method: "POST",
    body,
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });
}

async function errorOf(res: Response) {
  return ((await res.json()) as { error?: string }).error;
}

const png = (w = 20, h = 10) => sharp({ create: { width: w, height: h, channels: 3, background: "#BA222C" } }).png().toBuffer();

/** JPEG de 20 × 10 con EXIF (autora, copyright) y orientación 6 (girar 90°). */
const jpegWithExif = () =>
  sharp({ create: { width: 20, height: 10, channels: 3, background: "#1A2540" } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Artist: "Ana Secreta", Copyright: "GPS -33.45 -70.66" } } })
    .toBuffer();

/** PNG válido que declara 10 000 × 10 000 píxeles (100 M) en pocos KB: una "bomba". */
function pngBomb(side = 10_000) {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr[8] = 1; // 1 bit
  ihdr[9] = 0; // escala de grises
  const rows = Buffer.alloc(side * (1 + Math.ceil(side / 8)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- casos

describe("POST /api/subidas: acceso", () => {
  it("rechaza otro sitio antes de mirar la sesión", async () => {
    const res = await POST(post(formWith(await png()), { "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe("cross_site");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("sin sesión: 401", async () => {
    state.user = null;
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toBe("unauthenticated");
  });

  it("exige multipart/form-data", async () => {
    const res = await POST(post(JSON.stringify({ file: "x" }), { "content-type": "application/json" }));
    expect(res.status).toBe(415);
    expect(await errorOf(res)).toBe("multipart_required");
  });
});

describe("POST /api/subidas: tamaño y tope diario", () => {
  it("Content-Length mayor a 10 MB: 413 sin leer el cuerpo", async () => {
    const res = await POST(post(formWith(await png()), { "content-length": String(10 * 1024 * 1024 + 1) }));
    expect(res.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it("cuerpo real mayor a 10 MB sin Content-Length: 413", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 10);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Cuerpo ya serializado (como llega por red); un FormData de undici falla al cancelarse a medias.
    const serialized = new Response(formWith(big));
    const bytes = new Uint8Array(await serialized.arrayBuffer());
    const res = await POST(post(bytes, { "content-type": serialized.headers.get("content-type")! }));
    expect(res.status).toBe(413);
    expect(await errorOf(res)).toBe("too_large");
    expect(upload).not.toHaveBeenCalled();
  });

  it("tope diario (54000 de begin_operation): 429 con Retry-After, sin procesar", async () => {
    state.begin = { error: { message: "tope", code: "54000" } };
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect(await errorOf(res)).toBe("daily_limit");
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("end_operation", expect.anything()); // no tomó el candado
  });

  it("otra subida en curso (55P03): 409 operation_in_progress", async () => {
    state.begin = { error: { message: "en curso", code: "55P03" } };
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe("operation_in_progress");
    expect(upload).not.toHaveBeenCalled();
  });

  it("cobra el intento con la usuaria de la sesión y siempre suelta el candado", async () => {
    await POST(post(formWith(await png())));
    expect(rpc.mock.calls[0]).toEqual(["begin_operation", { p_owner: USER.id, p_operation: "upload" }]);
    expect(rpc.mock.calls.at(-1)).toEqual(["end_operation", { p_owner: USER.id, p_operation: "upload", p_token: TOKEN }]);
    expect(sessionFrom).not.toHaveBeenCalled(); // el tope ya no se cuenta con la sesión
  });

  it.each([
    ["413", async () => post(formWith(await png()), { "content-length": String(10 * 1024 * 1024 + 1) }), 413],
    ["415", async () => post(formWith("<svg/>")), 415],
    ["ilegible", async () => post(formWith((await png(200, 200)).subarray(0, 60))), 415],
  ])("un intento fallido (%s) también se cobra (F2-M2)", async (_n, make, status) => {
    const res = await POST(await make());
    expect(res.status).toBe(status);
    expect(rpc).toHaveBeenCalledWith("begin_operation", { p_owner: USER.id, p_operation: "upload" });
    expect(rpc.mock.calls.at(-1)![0]).toBe("end_operation");
  });

  it("el cuerpo que no termina de llegar en 60 s: 408 y se suelta el candado (F2-B11)", async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array([0x89, 0x50, 0x4e, 0x47])); // y nunca cierra
        },
      });
      const req = new NextRequest("http://localhost:3000/api/subidas", {
        method: "POST",
        body: stream,
        headers: { "sec-fetch-site": "same-origin", "content-type": "multipart/form-data; boundary=x" },
        duplex: "half",
      } as unknown as ConstructorParameters<typeof NextRequest>[1]);
      const pending = POST(req);
      await vi.advanceTimersByTimeAsync(60_001);
      const res = await pending;
      expect(res.status).toBe(408);
      expect(await errorOf(res)).toBe("body_timeout");
      expect(rpc.mock.calls.at(-1)).toEqual(["end_operation", { p_owner: USER.id, p_operation: "upload", p_token: TOKEN }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("begin_operation sin token: 500", async () => {
    state.begin = { data: null, error: null };
    expect((await POST(post(formWith(await png())))).status).toBe(500);
  });

  it("si falla begin_operation por otra causa: 500", async () => {
    state.begin = { error: { message: "x", code: "XX000" } };
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toBe("quota_check_failed");
  });
});

describe("POST /api/subidas: contenido", () => {
  it("falta el campo file: 400", async () => {
    const res = await POST(post(formWith(await png(), { name: "imagen" })));
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe("file_required");
  });

  it("archivo vacío: 400", async () => {
    const res = await POST(post(formWith(new Uint8Array(0))));
    expect(res.status).toBe(400);
  });

  it("un campo de texto en vez de archivo: 400", async () => {
    const f = new FormData();
    f.set("file", "no soy un archivo");
    const res = await POST(post(f));
    expect(res.status).toBe(400);
  });

  it.each([
    ["GIF", new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0])],
    ["SVG", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ["HEIC", new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0])],
    ["HTML", "<!doctype html><p>hola</p>"],
    ["PDF", "%PDF-1.4\n%"],
    ["RIFF que no es WebP (WAV)", "RIFF\x24\x00\x00\x00WAVEfmt "],
  ])("rechaza %s por sus bytes: 415 unsupported_type", async (_n, bytes) => {
    const res = await POST(post(formWith(bytes, { type: "image/png" })));
    expect(res.status).toBe(415);
    expect(await errorOf(res)).toBe("unsupported_type");
    expect(upload).not.toHaveBeenCalled();
  });

  it("bytes mágicos válidos pero imagen corrupta: 415", async () => {
    const truncated = (await png(200, 200)).subarray(0, 60);
    const res = await POST(post(formWith(truncated)));
    expect(res.status).toBe(415);
    expect(upload).not.toHaveBeenCalled();
  });

  it("políglota: cabecera JPEG seguida de un PNG: 415", async () => {
    const poly = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), await png()]);
    const res = await POST(post(formWith(poly, { type: "image/jpeg" })));
    expect(res.status).toBe(415);
    expect(upload).not.toHaveBeenCalled();
  });

  it("más de 24 MP (5000 × 5000): 415 unreadable_image", async () => {
    const res = await POST(post(formWith(pngBomb(5000))));
    expect(res.status).toBe(415);
    expect(await errorOf(res)).toBe("unreadable_image");
    expect(upload).not.toHaveBeenCalled();
  });

  it("bomba de descompresión (100 M píxeles en pocos KB): 415 unreadable_image", async () => {
    const bomb = pngBomb();
    expect(bomb.byteLength).toBeLessThan(100_000);
    const res = await POST(post(formWith(bomb)));
    expect(res.status).toBe(415);
    expect(await errorOf(res)).toBe("unreadable_image");
    expect(upload).not.toHaveBeenCalled();
  });

  it("el tipo que declara el navegador no cuenta: PNG enviado como image/gif se acepta", async () => {
    const res = await POST(post(formWith(await png(), { type: "image/gif", filename: "x.gif" })));
    expect(res.status).toBe(201);
  });
});

describe("POST /api/subidas: re-codificación y guardado", () => {
  it("JPEG con EXIF: sale WebP sin metadatos, con la orientación aplicada", async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined(); // el original sí trae EXIF

    const res = await POST(post(formWith(input, { type: "image/jpeg", filename: "foto.jpg" })));
    expect(res.status).toBe(201);
    const [path, output, opts] = upload.mock.calls[0]! as [string, Buffer, Record<string, unknown>];
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.orientation ?? 1).toBe(1);
    expect([meta.width, meta.height]).toEqual([10, 20]); // girada 90°
    expect(output.includes(Buffer.from("Ana Secreta"))).toBe(false);
    expect(opts).toMatchObject({ contentType: "image/webp", upsert: false });
    expect(path).toMatch(new RegExp(`^${USER.id}/[0-9a-f-]{36}\\.webp$`));
  });

  it("WebP de entrada también se acepta", async () => {
    const webp = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).webp().toBuffer();
    const res = await POST(post(formWith(webp, { type: "image/webp" })));
    expect(res.status).toBe(201);
  });

  it("limita a 4096 px por lado sin agrandar las pequeñas", async () => {
    await POST(post(formWith(await png(5000, 100))));
    const big = await sharp(upload.mock.calls[0]![1] as Buffer).metadata();
    expect(big.width).toBe(4096);
    expect(big.height).toBeLessThanOrEqual(100);

    await POST(post(formWith(await png(30, 15))));
    const small = await sharp(upload.mock.calls[1]![1] as Buffer).metadata();
    expect([small.width, small.height]).toEqual([30, 15]);
  });

  it("registra la fila con la usuaria de la sesión y responde 201 { id, path }", async () => {
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { id: string; path: string };
    const [path, output] = upload.mock.calls[0]! as [string, Buffer];
    expect(body).toEqual({ id: "row-1", path });
    const q = insertQuery.mock.results[0]!.value as ReturnType<typeof query>;
    expect(insertQuery).toHaveBeenCalledWith("uploads");
    expect(q.calls[0]).toEqual([
      "insert",
      [{ owner_id: USER.id, storage_path: path, mime_type: "image/webp", size_bytes: output.byteLength }],
    ]);
  });

  it("dos subidas no comparten ruta", async () => {
    await POST(post(formWith(await png())));
    await POST(post(formWith(await png())));
    expect(upload.mock.calls[0]![0]).not.toBe(upload.mock.calls[1]![0]);
  });

  it("sin clave secreta configurada: 500 sin subir", async () => {
    state.adminThrows = true;
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toBe("server_misconfigured");
  });

  it("error de Storage: 500 y no se registra la fila", async () => {
    state.upload = { error: { message: "bucket" } };
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toBe("storage_failed");
    expect(insertQuery).not.toHaveBeenCalled();
  });

  it("el trigger de la base corta con 54000: 429 y se borra el archivo subido", async () => {
    state.insert = { data: null, error: { message: "tope", code: "54000" } };
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(429);
    expect(await errorOf(res)).toBe("daily_limit");
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0]![0]]);
  });

  it("si tampoco se puede borrar el huérfano, queda registrado en el log (F2-B8)", async () => {
    state.insert = { data: null, error: { message: "x", code: "23505" } };
    remove.mockResolvedValueOnce({ error: { message: "storage caído" } } as never);
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith("subidas: no se pudo borrar el archivo huérfano", upload.mock.calls[0]![0], "storage caído");
  });

  it("otro error al registrar: 500 y no queda archivo huérfano", async () => {
    state.insert = { data: null, error: { message: "x", code: "23505" } };
    const res = await POST(post(formWith(await png())));
    expect(res.status).toBe(500);
    expect(await errorOf(res)).toBe("insert_failed");
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0]![0]]);
  });
});

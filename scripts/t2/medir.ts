/**
 * Mide la función `t2-medicion` (puerta T2 de la fase 5): invoca cada caso N veces y calcula
 * p50, p95 y p99 de cada etapa. Lo usan `scripts/t2-invocar.sh` (desplegada) y la medición local.
 *
 *   node scripts/t2/medir.ts --url <url-de-la-función> [--n 20] [--casos subida,etapa,...]
 *        [--docker-cpu supabase_edge_runtime_loopitalab] [--json salida.json]
 *
 * Credenciales, solo por variables de entorno (nunca se imprimen ni se escriben):
 *   T2_KEY    clave publicable (`sb_publishable_…`), va en la cabecera `apikey`
 *   T2_JWT    opcional: token de acceso de una usuaria, va en `Authorization: Bearer`
 *   T2_TOKEN  opcional: valor del secreto T2_TOKEN de la función, va en `x-t2-token`
 *
 * `--docker-cpu` (solo en local): lee `cpu.stat` del cgroup del contenedor del edge-runtime antes y
 * después de cada invocación. Es el CPU de TODO el contenedor (runtime, HTTP, recolector), menos
 * la lectura misma (se resta la mediana de lecturas en vacío): una cota superior del CPU de la
 * invocación. Desplegado no hay equivalente: el CPU se lee en los registros de la plataforma.
 *
 * Percentiles por rango más cercano: con N = 20, p95 es el 19.º valor y p99 el máximo.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

interface Args {
  url: string;
  n: number;
  casos: string[];
  dockerCpu: string | null;
  json: string | null;
}

const ALL_CASES = ["importar", "codecs", "subida", "etapa", "validar", "validar-ruido", "cruzada", "cuerpo"];

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const url = get("url") ?? process.env.T2_URL;
  if (!url) throw new Error("falta --url (o T2_URL)");
  return {
    url: url.replace(/\/+$/, ""),
    n: Number(get("n") ?? process.env.T2_N ?? 20),
    casos: (get("casos") ?? ALL_CASES.join(",")).split(",").filter(Boolean),
    dockerCpu: get("docker-cpu") ?? null,
    json: get("json") ?? null,
  };
}

const args = parseArgs(process.argv.slice(2));

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  const key = process.env.T2_KEY;
  const jwt = process.env.T2_JWT;
  const token = process.env.T2_TOKEN;
  if (key) h.apikey = key;
  // verify_jwt acepta la clave publicable en `apikey` (compatibilidad de migración, docs de Supabase
  // "Authorization headers"); `Authorization` queda solo para un token de usuaria.
  if (jwt) h.authorization = `Bearer ${jwt}`;
  if (token) h["x-t2-token"] = token;
  return h;
}

function cgroupUsec(container: string): number {
  const out = execFileSync("docker", ["exec", container, "cat", "/sys/fs/cgroup/cpu.stat"], { encoding: "utf8" });
  const m = /usage_usec (\d+)/.exec(out);
  if (!m?.[1]) throw new Error("no se pudo leer cpu.stat");
  return Number(m[1]);
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(q * sorted.length))) - 1] ?? NaN;
}

function stats(values: number[]): { n: number; p50: number; p95: number; p99: number; max: number } {
  const s = [...values].sort((a, b) => a - b);
  const r = (x: number) => Math.round(x * 10) / 10;
  return { n: s.length, p50: r(percentile(s, 0.5)), p95: r(percentile(s, 0.95)), p99: r(percentile(s, 0.99)), max: r(s[s.length - 1] ?? NaN) };
}

let cpuBaseline = 0;
if (args.dockerCpu) {
  const deltas: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = cgroupUsec(args.dockerCpu);
    const b = cgroupUsec(args.dockerCpu);
    deltas.push((b - a) / 1000);
  }
  cpuBaseline = stats(deltas).p50;
}

interface Sample {
  status: number;
  clientMs: number;
  cpuMs: number | null;
  body: Record<string, unknown> | null;
}

async function invoke(path: string, init: { method?: string; body?: Uint8Array<ArrayBuffer>; contentType?: string } = {}): Promise<Sample> {
  const before = args.dockerCpu ? cgroupUsec(args.dockerCpu) : 0;
  const t0 = performance.now();
  const reqInit: RequestInit = { method: init.method ?? "GET", headers: headers(init.contentType ? { "content-type": init.contentType } : {}) };
  if (init.body) reqInit.body = init.body;
  const res = await fetch(`${args.url}${path}`, reqInit);
  const text = await res.text();
  const clientMs = performance.now() - t0;
  const cpuMs = args.dockerCpu ? Math.max(0, (cgroupUsec(args.dockerCpu) - before) / 1000 - cpuBaseline) : null;
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = null;
  }
  return { status: res.status, clientMs, cpuMs, body };
}

async function fetchPng(jpeg: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(`${args.url}?caso=subida&salida=png`, { method: "POST", headers: headers({ "content-type": "image/jpeg" }), body: jpeg });
  if (res.status !== 200) throw new Error(`subida&salida=png respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

const jpeg = new Uint8Array(readFileSync(new URL("./fixtures/foto-2048.jpg", import.meta.url)));
const report: Record<string, unknown> = { url: args.url.replace(/^(https?:\/\/[^/]+).*/, "$1/…"), n: args.n, fecha: new Date().toISOString(), cpuBaselineMs: args.dockerCpu ? cpuBaseline : null, casos: {} };
const casos = report.casos as Record<string, unknown>;

// Precalentamiento: carga el WebAssembly (la primera invocación de una instancia lo descarga).
const warm = await invoke("?caso=codecs");
if (warm.status !== 200) {
  console.error(`La función respondió ${warm.status} al precalentar: ${JSON.stringify(warm.body)?.slice(0, 300)}`);
  process.exit(1);
}
report.primeraInvocacion = { frio: warm.body?.frio, importacionMs: warm.body?.importacionMs, init: warm.body?.init, runtime: warm.body?.runtime };

let png: Uint8Array<ArrayBuffer> | null = null;

for (const caso of args.casos) {
  const samples: Sample[] = [];
  if (caso === "cuerpo") {
    const sizes = [1, 5.9, 6.5, 10, 12.5].map((mb) => Math.round(mb * 1024 * 1024));
    const result: Record<string, unknown> = {};
    for (const size of sizes) {
      const body = new Uint8Array(size);
      for (let i = 0; i < size; i++) body[i] = (i * 2654435761) >>> 24;
      const s = await invoke("?caso=cuerpo", { method: "POST", body, contentType: "application/octet-stream" });
      result[`${(size / 1048576).toFixed(1)} MB`] = { status: s.status, bytesLeidos: s.body?.bytes ?? null, error: s.body?.error ?? (s.body ? undefined : "respuesta no JSON"), clientMs: Math.round(s.clientMs) };
    }
    casos[caso] = result;
    console.log(`\n== cuerpo (R5-8)`);
    console.table(result);
    continue;
  }
  const reps = caso === "cruzada" ? Math.min(args.n, 3) : args.n;
  if (caso === "etapa" && !png) png = await fetchPng(jpeg);
  for (let i = 0; i < reps; i++) {
    let s: Sample;
    if (caso === "subida") s = await invoke("?caso=subida", { method: "POST", body: jpeg, contentType: "image/jpeg" });
    else if (caso === "etapa") s = await invoke("?caso=etapa", { method: "POST", body: png ?? new Uint8Array(), contentType: "image/png" });
    else if (caso === "validar-ruido") s = await invoke("?caso=validar&variante=ruido");
    else s = await invoke(`?caso=${caso}`);
    if (s.status !== 200) {
      console.error(`${caso}: HTTP ${s.status} ${JSON.stringify(s.body)?.slice(0, 300)}`);
      break;
    }
    samples.push(s);
  }
  if (samples.length === 0) continue;
  const steps: Record<string, number[]> = {};
  for (const s of samples) {
    const t = (s.body?.tiemposMs ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(t)) (steps[k] ??= []).push(v);
    if (typeof s.body?.procesoMs === "number") (steps.procesoMs ??= []).push(s.body.procesoMs);
    if (typeof s.body?.totalMs === "number") (steps.totalMs ??= []).push(s.body.totalMs);
    (steps.clienteMs ??= []).push(s.clientMs);
    if (s.cpuMs !== null) (steps.cpuContenedorMs ??= []).push(s.cpuMs);
  }
  const table: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(steps)) table[k] = stats(v);
  const last = samples[samples.length - 1]?.body ?? {};
  const extra: Record<string, unknown> = {};
  for (const k of ["salida", "entrada", "validacion", "grafico", "hashes", "uses", "results"]) if (k in last) extra[k] = last[k];
  // Invocaciones que estrenaron instancia (arranque en frío): importación y carga del WebAssembly.
  const cold = samples.filter((s) => s.body?.frio === true).map((s) => ({
    importacionMs: s.body?.importacionMs,
    tiemposMs: s.body?.tiemposMs,
    procesoMs: s.body?.procesoMs,
    cpuContenedorMs: s.cpuMs === null ? null : Math.round(s.cpuMs),
  }));
  casos[caso] = { tiempos: table, instancias: [...new Set(samples.map((s) => s.body?.instancia))].length, frias: cold, ...extra };
  console.log(`\n== ${caso} (${samples.length} invocaciones, ${cold.length} en frío, ms)`);
  console.table(table);
}

if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 2) + "\n");
const cr = casos.cruzada as { hashes?: Record<string, string> } | undefined;
if (cr?.hashes) {
  const expected = JSON.parse(readFileSync(new URL("../../packages/image-chart/test/support/cross-expected.json", import.meta.url), "utf8")) as Record<string, string>;
  const diffs = Object.keys(expected).filter((k) => cr.hashes?.[k] !== expected[k]);
  console.log(diffs.length === 0 ? "\nPrueba cruzada Node/Deno: los bytes coinciden en todos los casos." : `\nPrueba cruzada Node/Deno: DIFERENCIAS en ${diffs.join(", ")}`);
}

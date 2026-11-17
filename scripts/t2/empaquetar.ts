/**
 * Empaqueta `supabase/functions/t2-medicion` para desplegarla por la API de gestión (MCP
 * `deploy_edge_function`), sin la CLI ni Docker (puerta T2 de la fase 5).
 *
 *   node scripts/t2/empaquetar.ts
 *
 * Por qué hace falta: el despliegue por la API empaqueta en el servidor y solo ve los archivos
 * que se le envían, con nombres relativos a la función; no puede seguir los imports
 * `../../../packages/...` ni el mapa de `deno.json` hacia el monorepo, y no admite archivos
 * estáticos. El paquete resultante:
 *   - copia los paquetes del monorepo a `vendor/<paquete>/...`, conservando la estructura (así
 *     los imports relativos `.ts` y el JSON con atributos siguen resolviendo igual);
 *   - reemplaza los especificadores del mapa (`@loopitalab/*`, `@jsquash/*`) por rutas relativas o
 *     `npm:` con versión exacta, así que NO necesita import map;
 *   - quita tipos y comentarios con `typescript` (ya es dependencia de desarrollo de la raíz),
 *     solo para achicar lo que viaja en la llamada; los archivos siguen siendo `.ts`.
 *
 * Salida (ignorada por git): `supabase/.t2-deploy/t2-medicion/` y `supabase/.t2-deploy/payload.json`
 * con `{ name, entrypoint_path, verify_jwt, files: [{ name, content }] }`.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fnDir = join(root, "supabase/functions/t2-medicion");
const outRoot = join(root, "supabase/.t2-deploy");
const outDir = join(outRoot, "t2-medicion");

const denoJson = JSON.parse(readFileSync(join(fnDir, "deno.json"), "utf8")) as { imports: Record<string, string> };

/** Archivo de origen (absoluto) → nombre dentro del paquete. */
const files = new Map<string, string>();
for (const f of ["index.ts", "codec.ts", "muestras.ts"]) files.set(join(fnDir, f), f);
for (const f of readdirSync(join(fnDir, "marks"))) files.set(join(fnDir, "marks", f), `marks/${f}`);
const vendorPkgs: Array<[string, string[]]> = [
  ["pattern-core", ["src"]],
  ["yarn-catalog", ["src", "data"]],
  ["ai-router", ["src"]],
  ["image-chart", ["src", "test/support"]],
];
for (const [pkg, dirs] of vendorPkgs) {
  for (const d of dirs) {
    for (const f of readdirSync(join(root, "packages", pkg, d))) {
      if (!/\.(ts|json)$/.test(f) || f.endsWith(".d.ts")) continue;
      if (d === "test/support" && f !== "cross-cases.ts") continue;
      files.set(join(root, "packages", pkg, d, f), `vendor/${pkg}/${d}/${f}`);
    }
  }
}

/** Especificador del mapa → destino dentro del paquete, relativo al archivo que importa. */
function rewriteSpecifier(spec: string, fromName: string): string | null {
  const target = denoJson.imports[spec];
  if (!target) return null;
  if (target.startsWith("npm:") || target.startsWith("jsr:") || target.startsWith("https:")) return target;
  const abs = join(fnDir, target);
  const name = files.get(abs);
  if (!name) throw new Error(`${spec} apunta a ${target}, que no está en el paquete`);
  let rel = relative(dirname(fromName), name);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

rmSync(outRoot, { recursive: true, force: true });
const payloadFiles: Array<{ name: string; content: string }> = [];
let rawBytes = 0;
for (const [abs, name] of [...files.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
  const source = readFileSync(abs, "utf8");
  rawBytes += Buffer.byteLength(source);
  let content: string;
  if (name.endsWith(".json")) {
    content = JSON.stringify(JSON.parse(source));
  } else {
    content = ts.transpileModule(source, {
      fileName: name,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        removeComments: true,
        verbatimModuleSyntax: true,
        allowImportingTsExtensions: true,
      },
    }).outputText;
    content = content.replace(/(\bfrom\s*|\bimport\s*)"([^"]+)"/g, (m, kw: string, spec: string) => {
      const r = rewriteSpecifier(spec, name);
      return r === null ? m : `${kw}"${r}"`;
    });
    const leftover = /(?:from|import)\s*"(@[^"]+)"/.exec(content);
    if (leftover) throw new Error(`${name}: especificador sin resolver ${leftover[1]}`);
  }
  const dest = join(outDir, name);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
  payloadFiles.push({ name, content });
}

const payload = { name: "t2-medicion", entrypoint_path: "index.ts", verify_jwt: true, files: payloadFiles };
writeFileSync(join(outRoot, "payload.json"), JSON.stringify(payload, null, 2) + "\n");
const outBytes = payloadFiles.reduce((a, f) => a + Buffer.byteLength(f.content), 0);
console.log(`Paquete en ${relative(root, outDir)}/ (${payloadFiles.length} archivos)`);
console.log(`Tamaño: ${(rawBytes / 1024).toFixed(0)} KB de fuentes → ${(outBytes / 1024).toFixed(0)} KB empaquetado`);
console.log(`Para MCP: ${relative(root, join(outRoot, "payload.json"))} (name, entrypoint_path, verify_jwt, files)`);
for (const f of payloadFiles) console.log(`  ${f.name.padEnd(48)} ${(Buffer.byteLength(f.content) / 1024).toFixed(1).padStart(6)} KB`);

/**
 * Prueba cruzada Node/Deno de `resizeArea` (puerta T2 de la fase 5), lado Node.
 *
 *   node scripts/t2/cruzada-node.ts            imprime `{ caso: "WxH:sha256" }`
 *   node scripts/t2/cruzada-node.ts --write    además fija packages/image-chart/test/support/cross-expected.json
 *   node scripts/t2/cruzada-node.ts --compare <respuesta.json>
 *                                              compara con la respuesta de `?caso=cruzada` de la función en Deno
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resizeArea } from "../../packages/image-chart/src/index.ts";
import { CROSS_CASES, crossRaster } from "../../packages/image-chart/test/support/cross-cases.ts";

const result: Record<string, string> = {};
for (const c of CROSS_CASES) {
  const out = resizeArea(crossRaster(c), c.maxSide);
  result[c.name] = `${out.width}x${out.height}:${createHash("sha256").update(out.data).digest("hex")}`;
}

const args = process.argv.slice(2);
if (args[0] === "--write") {
  writeFileSync(new URL("../../packages/image-chart/test/support/cross-expected.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
}
if (args[0] === "--compare") {
  const file = args[1];
  if (!file) throw new Error("falta el archivo con la respuesta de Deno");
  const deno = (JSON.parse(readFileSync(file, "utf8")) as { hashes: Record<string, string> }).hashes;
  let ok = true;
  for (const [name, h] of Object.entries(result)) {
    const same = deno[name] === h;
    ok &&= same;
    console.log(`${same ? "igual   " : "DISTINTO"}  ${name}  node=${h.slice(0, 26)}…  deno=${(deno[name] ?? "(falta)").slice(0, 26)}…`);
  }
  console.log(ok ? "Prueba cruzada: los bytes coinciden en todos los casos." : "Prueba cruzada: HAY DIFERENCIAS.");
  process.exit(ok ? 0 : 1);
}
console.log(JSON.stringify(result, null, 2));

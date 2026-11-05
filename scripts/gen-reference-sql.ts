/**
 * Genera la migración con los datos de referencia (grosores, fibras, paleta) a partir de
 * packages/yarn-catalog/data/*.json, para que la base de datos y el código usen los mismos datos.
 *
 *   node scripts/gen-reference-sql.ts            # imprime el SQL
 *   node scripts/gen-reference-sql.ts --write    # escribe MIGRATION_FILE (la migración vigente)
 *
 * Las migraciones ya aplicadas no se editan: 20261106020000_datos_referencia_v2.sql queda congelada.
 * Los upserts son idempotentes (on conflict do update, sin borrar filas, porque user_yarns referencia
 * yarn_weights y palette_colors). Cuando los JSON cambien otra vez, crea una migración NUEVA, apunta
 * MIGRATION_FILE y HEADER a ella; la prueba reference-sql.test.ts compara contra la última migración
 * *_datos_referencia*.sql.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATION_FILE = join(root, "supabase/migrations/20261106020000_datos_referencia_v2.sql");

const HEADER = `-- GENERADO por scripts/gen-reference-sql.ts desde packages/yarn-catalog/data. No editar a mano.
-- Datos de referencia v2: grosores CYC 0–7, fibras y paleta propia (sin marcas).
--
-- Reemplaza los alias de yarn_weights que traían nombres de tienda (regla de oro 9: sin catálogos de
-- marcas) y las equivalencias en inglés con "Baby"/"Roving" por los datos limpios de grosores.json (T3).
-- No se editó 20261104010100_datos_referencia.sql porque ya está aplicada en el proyecto real: una
-- migración aplicada es historia inmutable. Esta es idempotente (upsert, nunca borra filas, porque
-- user_yarns referencia yarn_weights y palette_colors) y se puede reaplicar sin efectos.
-- Decisión: fuentesAlias (fuente de cada alias) vive solo en el paquete; la base solo necesita alias text[].
`;

const read = (p: string) => JSON.parse(readFileSync(join(root, "packages/yarn-catalog/data", p), "utf8"));

const q = (v: string | null) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);
const arr = (v: string[]) => `array[${v.map(q).join(", ")}]::text[]`;
const num = (v: number | null) => (v === null ? "null" : String(v));

export function generateReferenceSql(): string {
  const grosores = read("grosores.json");
  const fibras = read("fibras.json");
  const paleta = read("paleta.json");

  const weights = grosores.categorias
    .map(
      (w: any) =>
        `  (${w.cat}, ${q(w.nombre)}, ${arr(w.ingles)}, ${arr(w.alias)}, ${w.muestraPalillo[0]}, ${w.muestraPalillo[1]}, ${num(w.agujasMm[0])}, ${num(w.agujasMm[1])}, ${w.muestraCrochet[0]}, ${w.muestraCrochet[1]}, ${q(w.muestraCrochetPunto)}, ${num(w.crochetMm[0])}, ${num(w.crochetMm[1])})`,
    )
    .join(",\n");

  const fibers = fibras.fibras
    .map(
      (f: any) =>
        `  (${q(f.id)}, ${q(f.nombre)}, ${q(f.origen)}, ${q(f.elasticidad)}, ${q(f.calidez)}, ${q(f.definicion)}, ${q(f.halo)}, ${q(f.brillo)}, ${f.afieltra}, ${q(f.notas)}, ${arr(f.usos)})`,
    )
    .join(",\n");

  let orden = 0;
  const colors = paleta.familias
    .flatMap((fam: any) => fam.colores.map((c: any) => `  (${q(c.id)}, ${q(c.nombre)}, ${q(c.hex)}, ${q(fam.nombre)}, ${c.tono}, ${++orden})`))
    .join(",\n");

  return `${HEADER}
insert into public.yarn_weights (cat, nombre, ingles, alias, muestra_palillo_min, muestra_palillo_max, agujas_mm_min, agujas_mm_max, muestra_crochet_min, muestra_crochet_max, muestra_crochet_punto, crochet_mm_min, crochet_mm_max) values
${weights}
on conflict (cat) do update set
  nombre = excluded.nombre, ingles = excluded.ingles, alias = excluded.alias,
  muestra_palillo_min = excluded.muestra_palillo_min, muestra_palillo_max = excluded.muestra_palillo_max,
  agujas_mm_min = excluded.agujas_mm_min, agujas_mm_max = excluded.agujas_mm_max,
  muestra_crochet_min = excluded.muestra_crochet_min, muestra_crochet_max = excluded.muestra_crochet_max,
  muestra_crochet_punto = excluded.muestra_crochet_punto, crochet_mm_min = excluded.crochet_mm_min, crochet_mm_max = excluded.crochet_mm_max;

insert into public.fibers (id, nombre, origen, elasticidad, calidez, definicion, halo, brillo, afieltra, notas, usos) values
${fibers}
on conflict (id) do update set
  nombre = excluded.nombre, origen = excluded.origen, elasticidad = excluded.elasticidad, calidez = excluded.calidez,
  definicion = excluded.definicion, halo = excluded.halo, brillo = excluded.brillo, afieltra = excluded.afieltra,
  notas = excluded.notas, usos = excluded.usos;

-- "orden" se libera antes de reasignarlo para no chocar con la restricción unique.
update public.palette_colors set orden = -orden;
insert into public.palette_colors (id, nombre, hex, familia, tono, orden) values
${colors}
on conflict (id) do update set
  nombre = excluded.nombre, hex = excluded.hex, familia = excluded.familia, tono = excluded.tono, orden = excluded.orden;
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sql = generateReferenceSql();
  if (process.argv.includes("--write")) {
    writeFileSync(MIGRATION_FILE, sql);
    console.log(`Escrito ${MIGRATION_FILE}`);
  } else {
    process.stdout.write(sql);
  }
}

/**
 * Genera la migración con los datos de referencia (grosores, fibras, paleta) a partir de
 * packages/yarn-catalog/data/*.json, para que la base de datos y el código usen los mismos datos.
 *
 *   node scripts/gen-reference-sql.ts            # imprime el SQL
 *   node scripts/gen-reference-sql.ts --write    # escribe MIGRATION_FILE (la migración vigente)
 *
 * Las migraciones ya aplicadas no se editan: 20261106035603_datos_referencia_v2.sql queda congelada.
 * Los upserts son idempotentes (on conflict do update, sin borrar filas, porque user_yarns referencia
 * yarn_weights y palette_colors). Cuando los JSON cambien otra vez, crea una migración NUEVA, apunta
 * MIGRATION_FILE y HEADER a ella; la prueba reference-sql.test.ts compara contra la última migración
 * *_datos_referencia*.sql.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATION_FILE = join(root, "supabase/migrations/20261106035603_datos_referencia_v2.sql");

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
const arr = (v: unknown[]) => `array[${v.map(str).join(", ")}]::text[]`;
/** Número finito (o null). Lanza si un JSON trae un string u otro tipo donde va un número. */
const num = (v: unknown): string => {
  if (v === null) return "null";
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Se esperaba un número finito y llegó ${JSON.stringify(v)}`);
  return String(v);
};
/** Entero finito (no null). */
const int = (v: unknown): string => {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`Se esperaba un entero y llegó ${JSON.stringify(v)}`);
  return String(v);
};
/** Booleano SQL. */
const bool = (v: unknown): string => {
  if (typeof v !== "boolean") throw new Error(`Se esperaba un booleano y llegó ${JSON.stringify(v)}`);
  return String(v);
};
/** Texto (los valores no-string lanzan en vez de interpolarse). */
const str = (v: unknown): string => {
  if (typeof v !== "string") throw new Error(`Se esperaba un texto y llegó ${JSON.stringify(v)}`);
  return q(v);
};

export function generateReferenceSql(): string {
  const grosores = read("grosores.json");
  const fibras = read("fibras.json");
  const paleta = read("paleta.json");

  const weights = grosores.categorias
    .map(
      (w: any) =>
        `  (${int(w.cat)}, ${str(w.nombre)}, ${arr(w.ingles)}, ${arr(w.alias)}, ${num(w.muestraPalillo[0])}, ${num(w.muestraPalillo[1])}, ${num(w.agujasMm[0])}, ${num(w.agujasMm[1])}, ${num(w.muestraCrochet[0])}, ${num(w.muestraCrochet[1])}, ${str(w.muestraCrochetPunto)}, ${num(w.crochetMm[0])}, ${num(w.crochetMm[1])})`,
    )
    .join(",\n");

  const fibers = fibras.fibras
    .map(
      (f: any) =>
        `  (${str(f.id)}, ${str(f.nombre)}, ${str(f.origen)}, ${str(f.elasticidad)}, ${str(f.calidez)}, ${str(f.definicion)}, ${str(f.halo)}, ${str(f.brillo)}, ${bool(f.afieltra)}, ${str(f.notas)}, ${arr(f.usos)})`,
    )
    .join(",\n");

  let orden = 0;
  const colors = paleta.familias
    .flatMap((fam: any) => fam.colores.map((c: any) => `  (${str(c.id)}, ${str(c.nombre)}, ${str(c.hex)}, ${str(fam.nombre)}, ${int(c.tono)}, ${++orden})`))
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

-- "orden" es unique y smallint (máx. 32767), así que se libera antes de reasignarlo con el upsert:
--   1) los colores que ya no están en la paleta (no se borran: user_yarns los puede referenciar) pasan a
--      20000+ y quedan ahí; 2) los demás se desplazan +10000 y el upsert los devuelve a 1..N.
-- Es idempotente: solo se mueven filas con orden < 10000, y los dos rangos de destino no se pisan entre sí
-- ni con 1..N, así que reaplicar (o aplicar con restos de una versión anterior) nunca choca con unique.
update public.palette_colors set orden = orden + 20000 where orden < 10000 and id not in (${paleta.familias.flatMap((fam: any) => fam.colores.map((c: any) => str(c.id))).join(", ")});
update public.palette_colors set orden = orden + 10000 where orden < 10000;
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

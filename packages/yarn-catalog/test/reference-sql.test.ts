import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it } from "node:test";
import { MIGRATION_FILE, generateReferenceSql } from "../../../scripts/gen-reference-sql.ts";

const dir = join(import.meta.dirname, "../../../supabase/migrations");
const frozen = "20261104010100_datos_referencia.sql";
const refMigrations = readdirSync(dir).filter((f) => f.endsWith(".sql") && f.includes("datos_referencia")).sort();
const latest = refMigrations[refMigrations.length - 1]!;

describe("datos de referencia en SQL", () => {
  it("la migración vigente es la última de datos de referencia", () => {
    assert.equal(basename(MIGRATION_FILE), latest);
    assert.notEqual(latest, frozen, "la migración aplicada (congelada) no se usa como referencia");
  });

  it("la última migración de datos de referencia está al día con los JSON", () => {
    const current = readFileSync(join(dir, latest), "utf8");
    assert.equal(current, generateReferenceSql(), "Ejecuta: node scripts/gen-reference-sql.ts --write");
  });

  it("las migraciones de datos posteriores a la congelada no traen nombres de tienda ni Baby/Roving en grosores", () => {
    const later = refMigrations.filter((f) => f > frozen);
    assert.ok(later.length > 0);
    for (const f of later) {
      const sql = readFileSync(join(dir, f), "utf8")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))
        .join("\n");
      const block = sql.slice(sql.indexOf("insert into public.yarn_weights"), sql.indexOf("insert into public.fibers"));
      assert.ok(block.length > 0, f);
      for (const word of ["Orquídea", "Orquidea", "Revés Derecho", "Reves Derecho", "Modista", "Baby", "Roving"]) {
        assert.ok(!block.toLowerCase().includes(word.toLowerCase()), `${f} contiene "${word}"`);
      }
    }
  });
});

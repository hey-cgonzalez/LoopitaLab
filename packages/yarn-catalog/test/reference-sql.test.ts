import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { MIGRATION_FILE, generateReferenceSql } from "../../../scripts/gen-reference-sql.ts";

it("la migración de datos de referencia está al día con los JSON", () => {
  const current = readFileSync(MIGRATION_FILE, "utf8");
  assert.equal(current, generateReferenceSql(), "Ejecuta: node scripts/gen-reference-sql.ts --write");
});

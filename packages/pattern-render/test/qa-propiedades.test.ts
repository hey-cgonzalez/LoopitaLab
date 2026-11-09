/**
 * T14 (QA fase 2): propiedad con semilla de `isNumberedRow` (numeración rala de T7b), que solo
 * tenía una prueba de ejemplo.
 *   SEED=12345 node --test test/qa-propiedades.test.ts
 */
import assert from "node:assert/strict";
import { it } from "node:test";
import { isNumberedRow } from "../src/index.ts";
import { forAll } from "./support/property.ts";

it("isNumberedRow: numera la 1, las múltiplos de 5 y la última, y ninguna otra; dos filas numeradas seguidas solo al final o al comienzo", () => {
  forAll(
    "isNumberedRow",
    (r) => r.int(1, 2000),
    (rows) => {
      const numbered: number[] = [];
      for (let n = 1; n <= rows; n++) {
        const got = isNumberedRow(n, rows);
        assert.equal(got, n === 1 || n === rows || n % 5 === 0, `fila ${n} de ${rows}`);
        if (got) numbered.push(n);
      }
      assert.equal(numbered[0], 1);
      assert.equal(numbered.at(-1), rows);
      // Entre dos números seguidos hay a lo más 5 filas: nunca queda un tramo largo sin número.
      for (let i = 1; i < numbered.length; i++) assert.ok(numbered[i]! - numbered[i - 1]! <= 5);
    },
    200,
  );
});

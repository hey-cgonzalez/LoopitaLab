/**
 * Aspecto de la lana (ADR 0004, capa 2).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Yarn } from "@loopitalab/pattern-core";
import { FIBERS } from "@loopitalab/yarn-catalog";
import { FALLBACK_HEX, yarnLook } from "../src/index.ts";

const yarn = (composition: Yarn["composition"], hex = "#ba222c"): Yarn => ({ id: "A", weight: 4, composition, color: { hex } });

test("por defecto el aspecto es neutro (fase 2): solo el color", () => {
  assert.deepEqual(yarnLook(yarn([{ fiber: "mohair", percent: 100 }]), FIBERS), { hex: "#BA222C", halo: 0, sheen: 0, definition: 0 });
});

test("con fiberEffects: halo en mohair y alpaca, brillo en seda, viscosa, bambú y lurex, definición en algodón y acrílico", () => {
  const fx = { fiberEffects: true };
  const mohair = yarnLook(yarn([{ fiber: "mohair", percent: 100 }]), FIBERS, fx);
  const alpaca = yarnLook(yarn([{ fiber: "alpaca", percent: 100 }]), FIBERS, fx);
  const lana = yarnLook(yarn([{ fiber: "lana", percent: 100 }]), FIBERS, fx);
  assert.ok(mohair.halo > alpaca.halo && alpaca.halo > lana.halo);
  for (const f of ["seda", "viscosa", "bambu", "lurex"]) assert.equal(yarnLook(yarn([{ fiber: f, percent: 100 }]), FIBERS, fx).sheen, 1, f);
  for (const f of ["algodon", "acrilico"]) assert.equal(yarnLook(yarn([{ fiber: f, percent: 100 }]), FIBERS, fx).definition, 1, f);
  // Mezcla: ponderada por porcentaje.
  const mix = yarnLook(yarn([{ fiber: "mohair", percent: 70 }, { fiber: "seda", percent: 30 }]), FIBERS, fx);
  assert.ok(Math.abs(mix.halo - 0.7) < 1e-9);
  assert.ok(Math.abs(mix.sheen - (0.7 * 0.5 + 0.3 * 1)) < 1e-9);
});

test("fibra desconocida o color inválido: no se inventa (neutro y gris de respaldo)", () => {
  const l = yarnLook(yarn([{ fiber: "unobtainium", percent: 100 }], "rojo"), FIBERS, { fiberEffects: true });
  assert.deepEqual(l, { hex: FALLBACK_HEX, halo: 0, sheen: 0, definition: 0 });
});

test("propiedad: los valores siempre están entre 0 y 1", () => {
  for (const a of FIBERS)
    for (const b of FIBERS) {
      const l = yarnLook(yarn([{ fiber: a.id, percent: 40 }, { fiber: b.id, percent: 60 }]), FIBERS, { fiberEffects: true });
      for (const v of [l.halo, l.sheen, l.definition]) assert.ok(v >= 0 && v <= 1);
    }
});

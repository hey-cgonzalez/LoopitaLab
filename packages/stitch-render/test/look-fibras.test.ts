/**
 * Aspecto por fibra (T8 de la fase 3; ADR 0008 §4; caso F3-35 de docs/casos-dominio-fase-3.md).
 * Niveles de `yarn-catalog` (bajo / medio / alto = 0 / 0,5 / 1), mezclas ponderadas por porcentaje, fibra desconocida
 * neutra, y claves de caché que incluyen grosor y porcentajes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Yarn } from "@loopitalab/pattern-core";
import { FIBERS } from "@loopitalab/yarn-catalog";
import { FIBER_LEVELS, fillTone, lookInputKey, lookKey, neutralLook, yarnLook, type YarnLook } from "../src/index.ts";
import { forAll, type Rng } from "./support/property.ts";

const fx = { fiberEffects: true };
const yarn = (composition: Yarn["composition"], weight: Yarn["weight"] = 4, hex = "#BA222C"): Yarn => ({ id: "A", weight, composition, color: { hex } });
const one = (fiber: string) => yarnLook(yarn([{ fiber, percent: 100 }]), FIBERS, fx);
const close = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ""} ${a} ≠ ${b}`);

test("F3-35: 100 % mohair tiene halo alto y definición baja; 100 % algodón, definición alta y halo bajo", () => {
  assert.deepEqual(one("mohair"), { hex: "#BA222C", halo: 1, sheen: 0.5, definition: 0 });
  assert.deepEqual(one("algodon"), { hex: "#BA222C", halo: 0, sheen: 0, definition: 1 });
});

test("cada fibra del catálogo usa sus niveles de yarn-catalog tal cual (0 / 0,5 / 1)", () => {
  for (const f of FIBERS) {
    const l = one(f.id);
    assert.equal(l.halo, FIBER_LEVELS[f.halo], `${f.id} halo`);
    assert.equal(l.sheen, FIBER_LEVELS[f.brillo], `${f.id} brillo`);
    assert.equal(l.definition, FIBER_LEVELS[f.definicion], `${f.id} definición`);
  }
});

test("F3-35: 70/30 lana/mohair queda ponderada y pasar a 30/70 cambia el aspecto y las dos claves", () => {
  const a = yarn([{ fiber: "lana", percent: 70 }, { fiber: "mohair", percent: 30 }]);
  const b = yarn([{ fiber: "lana", percent: 30 }, { fiber: "mohair", percent: 70 }]);
  const la = yarnLook(a, FIBERS, fx);
  const lb = yarnLook(b, FIBERS, fx);
  // validar con tejedora: la ponderación lineal de pequeños porcentajes de mohair o lurex (F3-35)
  close(la.halo, 0.3, "halo 70/30");
  close(la.definition, 0.7 * 0.5, "definición 70/30");
  close(lb.halo, 0.7, "halo 30/70");
  assert.notEqual(lookKey(la), lookKey(lb));
  assert.notEqual(lookInputKey(a, fx), lookInputKey(b, fx));
});

test("F3-35: fibra desconocida neutra; mezclada, aporta el neutro con su porcentaje (no se inventa)", () => {
  assert.deepEqual(yarnLook(yarn([{ fiber: "cachemira-x", percent: 100 }]), FIBERS, fx), neutralLook("#BA222C"));
  const mix = yarnLook(yarn([{ fiber: "mohair", percent: 50 }, { fiber: "cachemira-x", percent: 50 }]), FIBERS, fx);
  close(mix.halo, 0.5);
  close(mix.sheen, 0.25);
});

test("el grosor entra en la clave de entrada pero no cambia el aspecto (el tamaño sale de la muestra)", () => {
  const c = [{ fiber: "alpaca", percent: 100 }];
  assert.notEqual(lookInputKey(yarn(c, 2), fx), lookInputKey(yarn(c, 5), fx));
  assert.equal(lookKey(yarnLook(yarn(c, 2), FIBERS, fx)), lookKey(yarnLook(yarn(c, 5), FIBERS, fx)));
});

test("lookInputKey distingue los efectos de fibra (Colores planos) y el color", () => {
  const y = yarn([{ fiber: "seda", percent: 100 }]);
  assert.notEqual(lookInputKey(y, fx), lookInputKey(y, {}));
  assert.notEqual(lookInputKey(y, fx), lookInputKey({ ...y, color: { hex: "#000000" } }, fx));
  assert.equal(lookInputKey(y, fx), lookInputKey({ ...y, color: { hex: "#ba222c" } }, fx), "el hex se normaliza");
});

test("fillTone: el aspecto neutro da el relleno de la fase 2; el halo aclara el hueco", () => {
  assert.deepEqual(fillTone(neutralLook("#123456"), 0.8, false), { k: 0.8 * 0.6, toWhite: 0 });
  assert.deepEqual(fillTone(neutralLook("#123456"), 0.8, true), { k: 0.8, toWhite: 0 });
  assert.deepEqual(fillTone(undefined, 1, false), { k: 0.6, toWhite: 0 });
  const m = one("mohair");
  assert.ok(fillTone(m, 1, false).k > 0.6 && fillTone(m, 1, false).toWhite > 0);
  assert.ok(fillTone(m, 1, true).toWhite > 0);
});

// ------------------------------------------------------------------ propiedades

const IDS = [...FIBERS.map((f) => f.id), "desconocida-1", "desconocida-2"];
function genComposition(r: Rng): Yarn["composition"] {
  const n = r.int(1, 4);
  const ids = new Set<string>();
  while (ids.size < n) ids.add(r.pick(IDS));
  // Porcentajes enteros que suman 100.
  const cuts = Array.from({ length: n - 1 }, () => r.int(1, 99)).sort((a, b) => a - b);
  const parts = [...cuts, 100].map((c, i, a) => c - (i === 0 ? 0 : (a[i - 1] as number)));
  return [...ids].map((fiber, i) => ({ fiber, percent: Math.max(1, parts[i] as number) }));
}
const vals = (l: YarnLook) => [l.halo, l.sheen, l.definition];

test("propiedad: el aspecto es un promedio ponderado (cada valor entre el mínimo y el máximo de sus fibras, con desconocidas en 0)", () => {
  forAll("promedio ponderado", genComposition, (comp) => {
    const l = yarnLook(yarn(comp), FIBERS, fx);
    const parts = comp.map((c) => (FIBERS.some((f) => f.id === c.fiber) ? vals(one(c.fiber)) : [0, 0, 0]));
    const known = comp.some((c) => FIBERS.some((f) => f.id === c.fiber));
    vals(l).forEach((v, k) => {
      if (!known) return assert.equal(v, 0);
      const col = parts.map((p) => p[k] as number);
      assert.ok(v >= Math.min(...col) - 1e-9 && v <= Math.max(...col) + 1e-9);
    });
  });
});

test("propiedad: el orden de las fibras y escalar todos los porcentajes no cambian el aspecto", () => {
  forAll("orden y escala", (r) => ({ comp: genComposition(r), k: r.pick([0.5, 2, 3]) }), ({ comp, k }) => {
    const base = lookKey(yarnLook(yarn(comp), FIBERS, fx));
    assert.equal(lookKey(yarnLook(yarn([...comp].reverse()), FIBERS, fx)), base);
    assert.equal(lookKey(yarnLook(yarn(comp.map((c) => ({ ...c, percent: c.percent * k }))), FIBERS, fx)), base);
  });
});

test("propiedad: sin efectos de fibra el aspecto siempre es neutro; misma clave de entrada, mismo aspecto", () => {
  forAll("neutro y clave", (r) => ({ a: genComposition(r), w: r.int(0, 7) as Yarn["weight"] }), ({ a, w }) => {
    assert.deepEqual(yarnLook(yarn(a, w), FIBERS), neutralLook("#BA222C"));
    const twin = yarn(a.map((c) => ({ ...c })), w);
    assert.equal(lookInputKey(yarn(a, w), fx), lookInputKey(twin, fx));
    assert.deepEqual(yarnLook(yarn(a, w), FIBERS, fx), yarnLook(twin, FIBERS, fx));
  });
});

test("propiedad: más mohair en una mezcla con lana nunca baja el halo (monótona en el porcentaje)", () => {
  let prev = -1;
  for (let p = 0; p <= 100; p += 5) {
    const comp = [{ fiber: "lana", percent: 100 - p }, { fiber: "mohair", percent: p }].filter((c) => c.percent > 0);
    const h = yarnLook(yarn(comp), FIBERS, fx).halo;
    assert.ok(h >= prev);
    prev = h;
  }
});

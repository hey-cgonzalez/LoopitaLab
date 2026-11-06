/**
 * Backend Canvas 2D con un doble de contexto (sin DOM): redibujo incremental,
 * agrupación de frames, vista, resaltado, vista previa de color y captura.
 * Las capturas visuales reales se prueban con Playwright desde apps/web (ADR 0004).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_STITCH, paintCells } from "@loopitalab/pattern-core";
import {
  HIDDEN,
  QUAD_CHUNK,
  ROTATED_SPRITE_BUDGET,
  SETTLE_MS,
  colorize,
  createRenderer,
  deviceBox,
  dirtyRegions,
  fitView,
  instanceBounds,
  layoutGeometry,
  neutralLook,
  tilePlan,
  visibleCount,
  type Ctx2D,
  type StitchLayout,
  type Surface,
} from "../src/index.ts";
import { GAUGE, chartFrom } from "./support/fixtures.ts";
import { count, fakeSurface, manualSchedule } from "./support/fake-canvas.ts";

// Verificación de tipos (tsc): el canvas real del navegador cumple las interfaces mínimas.
export const _ctxIsCompatible = (c: CanvasRenderingContext2D): Ctx2D => c;
export const _offscreenCtxIsCompatible = (c: OffscreenCanvasRenderingContext2D): Ctx2D => c;
export const _surfaceIsCompatible = (c: HTMLCanvasElement): Surface => c;

const LOOKS = [neutralLook("#E9DDBE"), neutralLook("#BA222C"), neutralLook("#1A2540")];

/** Por defecto sin baldosas ni búfer, para probar el dibujo punto a punto sobre el canvas. */
function setup(rows: string[], over: Parameters<typeof chartFrom>[1] = {}, size = { w: 800, h: 600 }, modes: { tiles?: boolean; backbuffer?: boolean } = { tiles: false, backbuffer: false }) {
  const chart = chartFrom(rows, over);
  const layout = layoutGeometry(chart, { gauge: GAUGE });
  colorize(layout, chart);
  const surface = fakeSurface(size.w, size.h);
  const sched = manualSchedule();
  const frames: { full: boolean; regions: number; drawn: number }[] = [];
  const r = createRenderer(surface, {
    devicePixelRatio: 1,
    schedule: sched.schedule,
    createSurface: (w, h) => fakeSurface(w, h),
    onFrame: (f) => frames.push(f),
    ...modes,
  });
  r.setLooks(LOOKS);
  r.setLayout(layout);
  const view = fitView(layout.bounds, size.w, size.h);
  r.setView(view);
  return { chart, layout, surface, sched, frames, r, view };
}

const motif10 = Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => ((x + y) % 3 === 0 ? "B" : "A")).join(""));

test("primer frame: dibujo completo de todas las instancias visibles", () => {
  const { r, layout, surface } = setup(motif10, { repeat: { x: 4, y: 4 } });
  const f = r.flush();
  assert.ok(f);
  assert.equal(f.full, true);
  assert.equal(f.drawn, layout.count);
  // Una V por punto visible (zoom suficiente para el sprite).
  assert.equal(count(surface.calls, "drawImage"), visibleCount(layout));
  assert.equal(r.flush(), null, "sin cambios no se dibuja nada");
});

test("pintar una celda del motivo redibuja solo las regiones de sus instancias (y vecinas), no todo", () => {
  const { r, chart, layout, surface, view } = setup(motif10, { repeat: { x: 4, y: 4 } });
  r.flush();
  surface.reset();
  const next = paintCells(chart, [{ x: 3, y: 4 }], 2, 3);
  const touched = colorize(layout, next, [4 * 10 + 3]);
  assert.equal(touched.length, 16);
  r.invalidate(touched);
  const f = r.flush();
  assert.ok(f);
  assert.equal(f.full, false);
  const boxes = instanceBounds(layout);
  const regions = dirtyRegions(boxes, touched, view, 1, surface.width, surface.height);
  assert.equal(f.regions, regions.length);
  // Todas las regiones van en un solo recorte (un rect por región) y se limpian con el fondo.
  assert.equal(count(surface.calls, "clip"), 1);
  assert.ok(count(surface.calls, "rect") >= regions.length);
  // Toda caja tocada queda dentro de la unión de regiones.
  for (const i of touched) {
    const b = deviceBox(boxes, i, view, 1);
    const corners = [
      [b.x, b.y],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
      [b.x + b.w, b.y],
    ];
    for (const [cx, cy] of corners) {
      const px = Math.min(Math.max(cx as number, 0), surface.width - 0.5);
      const py = Math.min(Math.max(cy as number, 0), surface.height - 0.5);
      assert.ok(
        regions.some((g) => px >= g.x && px <= g.x + g.w && py >= g.y && py <= g.y + g.h),
        `esquina (${px}, ${py}) de la instancia ${i}`,
      );
    }
  }
  assert.ok(f.drawn >= touched.length);
  assert.ok(f.drawn < layout.count / 2, `dibujó ${f.drawn} de ${layout.count}`);
});

test("requestRender agrupa varias llamadas en un solo frame", () => {
  const { r, sched, frames } = setup(motif10);
  r.requestRender();
  r.requestRender();
  r.requestRender();
  assert.equal(sched.pending, 1);
  sched.run();
  assert.equal(frames.length, 1);
  r.invalidate([0, 1, 2]);
  r.requestRender();
  r.invalidate([3]);
  r.requestRender();
  assert.equal(sched.pending, 1);
  sched.run();
  assert.equal(frames.length, 2);
  assert.equal(frames[1]?.full, false);
});

test("cambiar la vista (zoom o desplazamiento) redibuja todo; una vista igual no", () => {
  const { r, view } = setup(motif10);
  r.flush();
  r.setView({ ...view });
  assert.equal(r.flush(), null);
  r.setView({ ...view, zoom: view.zoom * 1.5 });
  assert.equal(r.flush()?.full, true);
  r.setView({ ...view, zoom: Number.NaN });
  assert.equal(r.flush(), null, "una vista inválida se ignora");
});

test("resaltar una fila invalida solo esa fila y la anterior resaltada", () => {
  const { r, layout } = setup(motif10, { repeat: { x: 2, y: 2 } });
  r.flush();
  r.setHighlightRow(3);
  const f1 = r.flush();
  assert.ok(f1 && !f1.full);
  r.setHighlightRow(3);
  assert.equal(r.flush(), null);
  r.setHighlightRow(null);
  const f2 = r.flush();
  assert.ok(f2 && !f2.full && f2.drawn < layout.count);
});

test("vista previa de un color: solo se redibujan las instancias de esa lana, y quitarla vuelve al aspecto original", () => {
  const motif = Array.from({ length: 6 }, (_, y) => (y === 5 ? "A".repeat(11) + "B" : "A".repeat(12)));
  const { r, layout, surface } = setup(motif, { repeat: { x: 6, y: 6 } });
  r.flush();
  surface.reset();
  r.setPreviewOverride({ yarn: 1, look: neutralLook("#00FF00") });
  const f = r.flush();
  assert.ok(f && !f.full);
  let ofYarn = 0;
  for (let i = 0; i < layout.count; i++) if (layout.yarn[i] === 1) ofYarn++;
  assert.equal(ofYarn, 36);
  assert.ok(f.drawn < layout.count);
  r.setPreviewOverride(null);
  assert.ok(r.flush());
});

test("huecos 'sin punto' en plano: sin fondo ni V (se ve el fondo del canvas)", () => {
  const { r, layout, surface } = setup(["A.A", "AAA"], {});
  const f = r.flush();
  assert.ok(f);
  const visible = visibleCount(layout);
  assert.equal(visible, 5);
  assert.equal(count(surface.calls, "rect"), visible, "un fondo por punto visible");
  assert.equal(count(surface.calls, "drawImage"), visible);
  assert.equal(layout.yarn[1], HIDDEN);
});

test("con zoom muy chico se dibuja solo el color (sin sprites), por rendimiento", () => {
  const { r, surface, layout } = setup(motif10, { repeat: { x: 4, y: 4 } });
  r.setView({ zoom: 0.1, panX: 0, panY: 0 });
  r.flush();
  assert.equal(count(surface.calls, "drawImage"), 0);
  assert.equal(count(surface.calls, "rect"), visibleCount(layout));
});

test("círculo: una transformación por V; top_down en plano usa el sprite rotado sin transformación por punto", () => {
  const c = setup(["AAAA", "AAA.", "AA.."], { renderAs: "circle", repeat: { x: 6, y: 1 } });
  c.r.flush();
  assert.ok(count(c.surface.calls, "setTransform") >= visibleCount(c.layout));
  const t = setup(["AB", "BA"], { direction: "top_down", repeat: { x: 3, y: 3 } });
  t.surface.reset();
  t.r.flush();
  assert.equal(count(t.surface.calls, "drawImage"), visibleCount(t.layout));
  assert.ok(count(t.surface.calls, "setTransform") <= 3);
});

test("círculo: los fondos van en trazados de a lo más QUAD_CHUNK puntos, y con muchos puntos visibles solo se dibuja el color", () => {
  const c = setup(motif10, { renderAs: "circle", repeat: { x: 10, y: 4 } }, { w: 4000, h: 4000 });
  const f = c.r.flush();
  assert.ok(f);
  const visible = visibleCount(c.layout);
  assert.equal(visible, 4000);
  assert.ok(count(c.surface.calls, "fill") >= Math.ceil(visible / QUAD_CHUNK));
  // 4.000 < ROTATED_SPRITE_BUDGET: hay V.
  assert.equal(count(c.surface.calls, "drawImage"), visible);
  const big = setup(motif10, { renderAs: "circle", repeat: { x: 20, y: 8 } }, { w: 8000, h: 8000 });
  big.r.flush();
  assert.ok(visibleCount(big.layout) > ROTATED_SPRITE_BUDGET);
  assert.equal(count(big.surface.calls, "drawImage"), 0);
});

test("snapshot devuelve una imagen PNG y no altera lo pendiente del canvas principal", async () => {
  const { r, surface } = setup(motif10);
  r.flush();
  surface.reset();
  const blob = await r.snapshot({ width: 256, height: 256 });
  assert.equal(blob.type, "image/png");
  assert.equal(surface.calls.length, 0, "la captura dibuja en otra superficie");
  assert.equal(r.flush(), null);
});

test("resize cambia el tamaño del canvas en px del dispositivo y redibuja todo", () => {
  const { r, surface } = setup(motif10);
  r.flush();
  r.resize(300, 200, 2);
  assert.equal(surface.width, 600);
  assert.equal(surface.height, 400);
  assert.equal(r.flush()?.full, true);
});

test("destroy: no se programa ni se dibuja nada más", () => {
  const { r, sched } = setup(motif10);
  r.destroy();
  r.requestRender();
  assert.equal(sched.pending, 0);
  assert.equal(r.flush(), null);
});

test("muchas instancias tocadas pasan a un dibujo completo", () => {
  const { r, layout } = setup(motif10, { repeat: { x: 3, y: 3 } });
  r.flush();
  const all = new Uint32Array(layout.count).map((_, i) => i);
  r.invalidate(all);
  assert.equal(r.flush()?.full, true);
});

test("una disposición nueva (cambio de repeticiones o de máscara en círculo) redibuja todo", () => {
  const { r, chart } = setup(["AAAA", "AAA."], { renderAs: "circle", repeat: { x: 6, y: 1 } });
  r.flush();
  const next = paintCells(chart, [{ x: 2, y: 1 }], NO_STITCH, 3);
  const l2: StitchLayout = layoutGeometry(next, { gauge: GAUGE });
  colorize(l2, next);
  r.setLayout(l2);
  assert.equal(r.flush()?.full, true);
});

test("baldosas (plano 10 × 10): el primer frame dibuja solo las baldosas de clase y compone copiándolas", () => {
  const { r, layout, surface } = setup(motif10, { repeat: { x: 10, y: 10 } }, undefined, { tiles: true, backbuffer: false });
  const plan = tilePlan(layout);
  assert.ok(plan);
  const f = r.flush();
  assert.ok(f);
  assert.equal(f.full, true);
  assert.equal(f.regions, 100, "una copia por baldosa visible");
  assert.ok(f.drawn <= plan.cost, `dibujó ${f.drawn} puntos para ${plan.cx * plan.cy} baldosas de clase`);
  assert.ok(f.drawn < layout.count / 3);
  // Las V se dibujan en las baldosas de clase (otras superficies), no en el canvas principal.
  assert.equal(count(surface.calls, "drawImage"), 100);
});

test("baldosas: desplazar solo vuelve a componer; editar o hacer zoom vuelve a dibujar las baldosas de clase", () => {
  const { r, chart, layout, view } = setup(motif10, { repeat: { x: 10, y: 10 } }, undefined, { tiles: true, backbuffer: false });
  r.flush();
  r.setView({ ...view, panX: view.panX + 15 });
  const pan = r.flush();
  assert.ok(pan);
  assert.equal(pan.drawn, 0, "sin redibujar puntos");
  const next = paintCells(chart, [{ x: 1, y: 1 }], 2, 3);
  r.invalidate(colorize(layout, next, [11]));
  const edit = r.flush();
  assert.ok(edit && edit.drawn > 0 && edit.drawn < layout.count / 3);
  // Durante el zoom las baldosas se copian escaladas; al detenerse se vuelven a dibujar.
  r.setView({ ...view, zoom: view.zoom * 1.2 });
  const zoom = r.flush();
  assert.ok(zoom && zoom.drawn === 0);
  r.setView({ ...view, zoom: view.zoom * 1.2, panX: view.panX + 1 });
  const settled = r.flush();
  assert.ok(settled && settled.drawn > 0, "con la escala estable se dibujan nítidas");
  r.setHighlightRow(4);
  const hl = r.flush();
  assert.ok(hl && hl.drawn === 0, "el resaltado va encima, sin redibujar baldosas");
  r.destroy();
});

test("baldosas en tubo: periódicas solo en y; con mucho zoom se vuelve al dibujo punto a punto", () => {
  const { r, layout } = setup(motif10, { renderAs: "tube", repeat: { x: 10, y: 10 } }, undefined, { tiles: true, backbuffer: false });
  const plan = tilePlan(layout);
  assert.ok(plan);
  assert.equal(plan.nx, 1);
  assert.equal(plan.ny, 10);
  assert.ok(r.flush()?.regions === 10);
  r.setView({ zoom: 40, panX: 0, panY: 0 });
  const f = r.flush();
  assert.ok(f && f.regions === 1, "dibujo punto a punto (con recorte a lo visible)");
});

test("búfer de la pieza: desplazarse es una sola copia; editar dibuja solo regiones en el búfer", () => {
  const { r, chart, layout, view, surface } = setup(motif10, { renderAs: "circle", repeat: { x: 8, y: 2 } }, undefined, { tiles: false, backbuffer: true });
  const first = r.flush();
  assert.ok(first && first.full && first.drawn === layout.count);
  // El primer frame con una escala nueva se dibuja directo; el búfer se arma al repetirse.
  r.setView({ ...view, panX: view.panX + 1 });
  r.flush();
  surface.reset();
  r.setView({ ...view, panX: view.panX + 30, panY: view.panY - 10 });
  const pan = r.flush();
  assert.ok(pan);
  assert.equal(pan.drawn, 0);
  assert.equal(count(surface.calls, "drawImage"), 1, "una copia del búfer");
  const next = paintCells(chart, [{ x: 4, y: 5 }], 2, 3);
  r.invalidate(colorize(layout, next, [54]));
  const edit = r.flush();
  assert.ok(edit && !edit.full && edit.drawn > 0 && edit.drawn < layout.count);
  r.destroy();
});

test("búfer: durante un zoom se copia escalado y se vuelve a dibujar nítido al detenerse", async () => {
  const { r, view, sched } = setup(motif10, { renderAs: "circle", repeat: { x: 8, y: 2 } }, undefined, { tiles: false, backbuffer: true });
  r.flush();
  r.setView({ ...view, panX: view.panX + 1 });
  assert.ok((r.flush()?.drawn ?? 0) > 0, "se arma el búfer");
  r.setView({ ...view, panX: view.panX + 1, zoom: view.zoom * 1.3 });
  const zoom = r.flush();
  assert.ok(zoom && zoom.full && zoom.drawn === 0, "copia escalada, sin redibujar puntos");
  await new Promise((res) => setTimeout(res, SETTLE_MS + 40));
  assert.equal(sched.pending, 1, "al detenerse se programa un dibujo");
  r.flush();
  sched.run();
  r.setView({ ...view, panX: view.panX + 2, zoom: view.zoom * 1.3 });
  const after = r.flush();
  assert.ok(after && after.drawn === 0, "con la escala estable, desplazarse vuelve a ser una copia");
  r.destroy();
});

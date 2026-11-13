/**
 * QA final de la fase 3 (T16): casos límite del render (revisión cruzada de T8) que no tenían prueba.
 * Gráfico de 1 × 1, todo "sin punto" salvo una casilla, 32 lanas (máximo del modelo), fila resaltada en los bordes
 * (última fila, fuera de rango, valores dañados, `top_down`) y vista previa de una lana que no existe.
 * Con el doble de canvas: se comprueba que nada lanza, que ninguna coordenada es NaN y que el redibujo es parcial.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, rowStitchCount, stitchTotal, type Chart, type Yarn } from "@loopitalab/pattern-core";
import { FIBERS } from "@loopitalab/yarn-catalog";
import { HIDDEN, colorize, createRenderer, fitView, layoutGeometry, layoutInstanceCount, neutralLook, visibleCount, yarnLook, type StitchLayout, type YarnLook } from "../src/index.ts";
import { GAUGE, chartFrom } from "./support/fixtures.ts";
import { fakeSurface, manualSchedule } from "./support/fake-canvas.ts";

const SHAPES = [
  { renderAs: "flat", workedIn: "rows" },
  { renderAs: "tube", workedIn: "rounds" },
  { renderAs: "circle", workedIn: "rounds" },
] as const;
const DIRECTIONS = ["bottom_up", "top_down"] as const;

function mount(chart: Chart, looks: readonly YarnLook[], modes: { tiles?: boolean; backbuffer?: boolean } = { tiles: false, backbuffer: false }) {
  const layout = layoutGeometry(chart, { gauge: GAUGE });
  colorize(layout, chart);
  const surface = fakeSurface(800, 600);
  const r = createRenderer(surface, { devicePixelRatio: 1, schedule: manualSchedule().schedule, createSurface: (w, h) => fakeSurface(w, h), ...modes });
  r.setLooks(looks);
  r.setLayout(layout);
  r.setView(fitView(layout.bounds, 800, 600));
  return { layout, surface, r };
}

function assertFinite(layout: StitchLayout, what: string): void {
  for (const k of ["x", "y", "angle", "scaleX", "scaleY", "shade"] as const) {
    for (let i = 0; i < layout.count; i++) assert.ok(Number.isFinite(layout[k][i]), `${what}: ${k}[${i}] = ${layout[k][i]}`);
  }
  assert.ok(Number.isFinite(layout.bounds.width) && layout.bounds.width > 0, `${what}: ancho ${layout.bounds.width}`);
  assert.ok(Number.isFinite(layout.bounds.height) && layout.bounds.height > 0, `${what}: alto ${layout.bounds.height}`);
}

function assertNoNaNCalls(surface: ReturnType<typeof fakeSurface>, what: string): void {
  for (const c of surface.calls) for (const a of c.args) assert.ok(Number.isFinite(a), `${what}: ${c.op}(${c.args.join(", ")})`);
}

const LOOKS2 = [neutralLook("#E9DDBE"), neutralLook("#BA222C")];

test("gráfico de 1 × 1 en plano, tubo y círculo, en las dos direcciones: un punto, geometría finita y se dibuja", () => {
  for (const s of SHAPES) {
    for (const direction of DIRECTIONS) {
      const what = `${s.renderAs} ${direction}`;
      const chart = chartFrom(["A"], { ...s, direction });
      const { layout, surface, r } = mount(chart, LOOKS2);
      assert.equal(layout.count, 1, what);
      assert.equal(layout.count, layoutInstanceCount(chart), what);
      assert.equal(visibleCount(layout), stitchTotal(chart), what);
      assertFinite(layout, what);
      const f = r.flush();
      assert.ok(f && f.full, what);
      assertNoNaNCalls(surface, what);
      // La única fila se puede resaltar y quitar.
      r.setHighlightRow(0);
      assert.ok(r.flush(), what);
      r.setHighlightRow(null);
      assert.ok(r.flush(), what);
      assertNoNaNCalls(surface, what);
    }
  }
});

test("1 × 1 repetido 500 × 500 en plano: 250.000 puntos con baldosas y búfer, sin lanzar", () => {
  const chart = chartFrom(["B"], { repeat: { x: LIMITS.maxRepeat, y: LIMITS.maxRepeat } });
  const { layout, surface, r } = mount(chart, LOOKS2, {});
  assert.equal(layout.count, 250_000);
  assert.equal(visibleCount(layout), stitchTotal(chart));
  assert.ok(r.flush());
  r.setHighlightRow(499);
  assert.ok(r.flush());
  assertNoNaNCalls(surface, "1 × 1 × 500 × 500");
});

test("todo «sin punto» salvo una casilla: se dibuja solo esa, y resaltar una fila vacía no lanza", () => {
  for (const s of SHAPES) {
    for (const direction of DIRECTIONS) {
      const what = `${s.renderAs} ${direction}`;
      const chart = chartFrom(["....", "..B.", "...."], { ...s, direction, repeat: { x: 3, y: 2 } });
      const { layout, surface, r } = mount(chart, LOOKS2);
      assert.equal(stitchTotal(chart), 6, what);
      // `visibleCount` excluye la cara trasera del tubo (contrato de layout.ts): ahí solo se exige que no cuente de más.
      if (s.renderAs === "tube") assert.ok(visibleCount(layout) >= 1 && visibleCount(layout) <= 6, `${what}: ${visibleCount(layout)}`);
      else assert.equal(visibleCount(layout), 6, what);
      assertFinite(layout, what);
      let shown = 0;
      for (let i = 0; i < layout.count; i++) {
        if (layout.yarn[i] === HIDDEN) continue;
        shown++;
        assert.equal(layout.yarn[i], 1, what);
        assert.equal((layout.row[i] as number) % 3, 1, `${what}: fila ${layout.row[i]}`);
      }
      assert.equal(shown, 6, what);
      assert.ok(r.flush(), what);
      for (const row of [0, 1, 2, 5]) {
        assert.equal(rowStitchCount(chart, row) === 0, row % 3 !== 1);
        r.setHighlightRow(row);
        r.flush();
      }
      r.setHighlightRow(null);
      r.flush();
      assertNoNaNCalls(surface, what);
    }
  }
});

test("32 lanas en una fila: cada instancia lleva su lana y el primer frame las dibuja todas", () => {
  const N = LIMITS.maxYarns;
  assert.equal(N, 32);
  const cells = Array.from({ length: N }, (_, i) => i);
  const looks = cells.map((i) => neutralLook(`#${(i * 8).toString(16).padStart(2, "0")}80${(255 - i * 8).toString(16).padStart(2, "0")}`));
  for (const s of SHAPES) {
    const chart: Chart = { width: N, height: 1, cells, repeat: { x: 2, y: 3 }, workedIn: s.workedIn, renderAs: s.renderAs, direction: "bottom_up" };
    const { layout, surface, r } = mount(chart, looks);
    const seen = new Set<number>();
    for (let i = 0; i < layout.count; i++) {
      assert.equal(layout.yarn[i], (layout.col[i] as number) % N, `${s.renderAs}: columna ${layout.col[i]}`);
      seen.add(layout.yarn[i] as number);
    }
    assert.equal(seen.size, N, s.renderAs);
    assert.ok(!seen.has(HIDDEN), `${s.renderAs}: 32 lanas no chocan con HIDDEN (255)`);
    const f = r.flush();
    assert.ok(f && f.full, s.renderAs);
    assertNoNaNCalls(surface, s.renderAs);

    // Vista previa de la última lana (índice 31): redibujo parcial, solo sus instancias.
    surface.reset();
    r.setPreviewOverride({ yarn: N - 1, look: neutralLook("#00FF00") });
    const p = r.flush();
    assert.ok(p && !p.full, s.renderAs);
    assert.ok(p.drawn < layout.count, `${s.renderAs}: ${p.drawn} de ${layout.count}`);
    r.setPreviewOverride(null);
    assert.ok(r.flush(), s.renderAs);
  }
});

test("32 lanas con fibras distintas y efectos activados: cada aspecto es finito y el render no lanza", () => {
  const fibers = ["lana", "mohair", "alpaca", "seda", "algodon", "acrilico", "viscosa", "bambu"];
  const looks = Array.from({ length: 32 }, (_, i) =>
    yarnLook({ color: { hex: "#8040C0" }, composition: [{ fiber: fibers[i % fibers.length]!, percent: 70 }, { fiber: fibers[(i + 3) % fibers.length]!, percent: 30 }], weight: (i % 8) as Yarn["weight"] }, FIBERS, { fiberEffects: true }),
  );
  for (const l of looks) for (const v of [l.halo, l.sheen, l.definition]) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, JSON.stringify(l));
  assert.ok(looks.some((l) => l.halo > 0) && looks.some((l) => l.sheen > 0) && looks.some((l) => l.definition > 0), "los efectos de fibra están activos");
  const chart: Chart = { width: 32, height: 2, cells: Array.from({ length: 64 }, (_, i) => i % 32), repeat: { x: 1, y: 1 }, workedIn: "rounds", renderAs: "circle", direction: "top_down" };
  const { surface, r } = mount(chart, looks);
  assert.ok(r.flush());
  assertNoNaNCalls(surface, "32 fibras");
});

test("menos aspectos que lanas (documento a medio cargar) y vista previa de una lana inexistente: no lanza", () => {
  const chart = chartFrom(["ABC", "CBA"], { repeat: { x: 2, y: 2 } });
  const { surface, r, layout } = mount(chart, [neutralLook("#E9DDBE")]); // faltan B y C
  assert.ok(r.flush());
  r.setPreviewOverride({ yarn: 7, look: neutralLook("#00FF00") }); // no hay lana 7
  const f = r.flush();
  assert.ok(f === null || f.drawn <= layout.count);
  r.setPreviewOverride({ yarn: -1, look: neutralLook("#00FF00") });
  r.flush();
  r.setPreviewOverride(null);
  r.flush();
  assertNoNaNCalls(surface, "aspectos faltantes");
});

test("fila resaltada en los bordes: última fila, fuera de rango y valores dañados no lanzan ni redibujan de más", () => {
  for (const s of SHAPES) {
    for (const direction of DIRECTIONS) {
      const what = `${s.renderAs} ${direction}`;
      const chart = chartFrom(["AAB", "ABB", "BAA"], { ...s, direction, repeat: { x: 4, y: 2 } });
      const { layout, surface, r } = mount(chart, LOOKS2);
      r.flush();
      const total = 6;
      // Última fila: redibujo parcial.
      r.setHighlightRow(total - 1);
      const last = r.flush();
      assert.ok(last && !last.full && last.drawn < layout.count, what);
      // La misma fila otra vez: nada que dibujar.
      r.setHighlightRow(total - 1);
      assert.equal(r.flush(), null, what);
      // Terminado (fila = total) y otros valores fuera de rango: solo se limpia la fila anterior; después, nada.
      for (const bad of [total, total + 100, -1, Number.MAX_SAFE_INTEGER]) {
        r.setHighlightRow(bad);
        const f = r.flush();
        assert.ok(f === null || (!f.full && f.drawn < layout.count), `${what}: fila ${bad}`);
      }
      // Valores que no son una fila equivalen a "sin resaltado".
      r.setHighlightRow(2);
      r.flush();
      for (const bad of [Number.NaN, 1.5, Infinity, -Infinity]) {
        r.setHighlightRow(bad);
        r.flush();
        r.setHighlightRow(null);
        assert.equal(r.flush(), null, `${what}: ${bad} ya había quitado el resaltado`);
        r.setHighlightRow(2);
        r.flush();
      }
      assertNoNaNCalls(surface, what);
    }
  }
});

test("la fila resaltada es la misma fila del gráfico en bottom_up y top_down: cambian de lugar, no de instancias", () => {
  // CA3-T3: `setHighlightRow(y)` recibe la fila de `follow` (0 = la primera que se teje) en las dos direcciones.
  for (const s of SHAPES) {
    const rows = ["AAB", "ABB", "BAA", "BBB"];
    const up = layoutGeometry(chartFrom(rows, { ...s, direction: "bottom_up", repeat: { x: 2, y: 1 } }), { gauge: GAUGE });
    const down = layoutGeometry(chartFrom(rows, { ...s, direction: "top_down", repeat: { x: 2, y: 1 } }), { gauge: GAUGE });
    assert.equal(up.count, down.count, s.renderAs);
    const perRow = (l: StitchLayout) => {
      const m = new Map<number, number>();
      for (let i = 0; i < l.count; i++) m.set(l.row[i] as number, (m.get(l.row[i] as number) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => a[0] - b[0]);
    };
    assert.deepEqual(perRow(up), perRow(down), s.renderAs);
    assert.deepEqual(perRow(up).map(([row]) => row), [0, 1, 2, 3], s.renderAs);
    if (s.renderAs !== "circle") {
      // En plano y tubo la fila 0 queda abajo en bottom_up y arriba en top_down (rotación de 180° de la vista).
      const meanY = (l: StitchLayout, row: number) => {
        let sum = 0;
        let n = 0;
        for (let i = 0; i < l.count; i++) if (l.row[i] === row) (sum += l.y[i] as number), n++;
        return sum / n;
      };
      assert.ok(meanY(up, 0) > meanY(up, 3), `${s.renderAs} bottom_up: la fila 0 va abajo`);
      assert.ok(meanY(down, 0) < meanY(down, 3), `${s.renderAs} top_down: la fila 0 va arriba`);
    }
  }
});

import { expect, type Page } from "@playwright/test";
import type { ViewerPerfSummary } from "../../src/lib/amigurumi/viewer-perf.ts";

/*
 * Ayudas de la latencia del estudio amigurumi con el visor 3D (T12 de la fase 4; ADR 0010, sección 6, "Medición").
 * Las usan `latencia-visor.spec.ts` (E2E, proyecto `webgl`) y `medir-visor-3d.ts` (medición a mano): las mismas
 * ediciones, con entradas reales (teclas, clics y el puntero), sobre `/dev/amigurumi?perf=1`.
 */

export type Rng = () => number;

/** Pseudoaleatorio con semilla (mismas pausas en cada corrida). */
export function rng(seed: number): Rng {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

type ControllerCounters = { buildScene: number; partsBuilt: number; partsRecolored: number; partsKept: number; looksOnly: number; deferred: number; superseded: number };
type RendererStats = { programs: number; attributesMarked: number; stitches: number; mode: string; lod: string; setLooksCalls: number; previewCalls: number };
type Hook = {
  store: { doc: unknown };
  viewer(): {
    controller: { counters: ControllerCounters; drawn: unknown; status: { mode: string; updating: boolean } };
    renderer: { stats(): RendererStats; policy: { mode: string; lod: string; maxPixelRatio: number | null } };
  } | null;
};
type W = Window & { __loopitaAmigurumi?: Hook; __loopitaViewerPerf?: { summary(): ViewerPerfSummary; reset(): void }; __loopitaLongTasks?: Array<{ start: number; duration: number }>; __loopitaUpdatingSeen?: number };

/** Registra las tareas largas (`PerformanceObserver` de tipo `longtask`) desde antes de cargar la página. */
export async function watchLongTasks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as W;
    w.__loopitaLongTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__loopitaLongTasks!.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Navegador sin Long Tasks API: la lista queda vacía.
    }
  });
}

export const longTasks = (page: Page) => page.evaluate(() => (window as unknown as W).__loopitaLongTasks ?? []);

/** Abre el estudio con un patrón de demostración y el modo de medición. `flat`: "Colores planos" (A/B). */
export async function openAmigurumi(page: Page, demo: string, opts: { flat?: boolean; cpuRate?: number } = {}): Promise<void> {
  if (opts.flat) await page.addInitScript(() => localStorage.setItem("loopita:vista:colores-planos", "1"));
  if ((opts.cpuRate ?? 1) > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: opts.cpuRate! });
  }
  await page.goto(`/dev/amigurumi?demo=${demo}&perf=1`);
  await page.waitForFunction(() => (window as unknown as W).__loopitaAmigurumi?.viewer() != null && (window as unknown as W).__loopitaViewerPerf != null, null, { timeout: 120_000 });
  await expect(page.getByTestId("part-text")).toBeVisible();
  // El primer armado y las revisiones diferidas terminan antes de medir.
  await expect(page.getByTestId("visor-3d-actualizando")).toHaveCount(0, { timeout: 60_000 });
  await page.waitForTimeout(800);
}

export const perfSummary = (page: Page) => page.evaluate(() => (window as unknown as W).__loopitaViewerPerf!.summary());
export const perfReset = (page: Page) => page.evaluate(() => (window as unknown as W).__loopitaViewerPerf!.reset());

export const viewerCounters = (page: Page) =>
  page.evaluate(() => {
    const v = (window as unknown as W).__loopitaAmigurumi!.viewer()!;
    return { controller: { ...v.controller.counters }, renderer: v.renderer.stats(), policy: { ...v.renderer.policy }, mode: v.controller.status.mode };
  });

/** ¿El 3D dibuja el documento actual? (llegó a la última edición). */
export const drawnIsCurrent = (page: Page) =>
  page.evaluate(() => {
    const h = (window as unknown as W).__loopitaAmigurumi!;
    return h.viewer()!.controller.drawn === h.store.doc;
  });

/** Cuenta las veces que aparece "Actualizando 3D…" (MutationObserver). */
export async function watchUpdating(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__loopitaUpdatingSeen = 0;
    let shown = false;
    new MutationObserver(() => {
      const now = document.querySelector('[data-testid="visor-3d-actualizando"]') !== null;
      if (now && !shown) w.__loopitaUpdatingSeen! += 1;
      shown = now;
    }).observe(document.body, { childList: true, subtree: true });
  });
}
export const updatingSeen = (page: Page) => page.evaluate(() => (window as unknown as W).__loopitaUpdatingSeen ?? 0);

const pause = (page: Page, rnd: Rng, min = 80, spread = 500) => page.waitForTimeout(min + Math.floor(rnd() * spread));

/** Posición en el texto de la parte: la primera meseta ("V11-30: 60 pb (60)"), el fin del número y su última cifra. */
async function plateauLine(page: Page): Promise<{ numberEnd: number; digit: string }> {
  return page.getByTestId("part-text").evaluate((el: HTMLTextAreaElement) => {
    const lines = el.value.split("\n");
    let offset = 0;
    for (const line of lines) {
      const m = /^V\d+-\d+: (?:@[A-Z], )?(\d+) pb/.exec(line);
      if (m) {
        const numStart = line.indexOf(m[1]!, line.indexOf(":"));
        return { numberEnd: offset + numStart + m[1]!.length, digit: m[1]!.at(-1)! };
      }
      offset += line.length + 1;
    }
    throw new Error("No hay una meseta en el texto de la parte");
  });
}

const select = (page: Page, from: number, to = from) =>
  page.getByTestId("part-text").evaluate(
    (el: HTMLTextAreaElement, r: [number, number]) => {
      el.focus();
      el.setSelectionRange(r[0], r[1]);
    },
    [from, to] as [number, number],
  );

async function presses(page: Page, key: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press(key);
}

/**
 * CA4-P1 y CA4-P8: `n` ediciones de una vuelta en el texto, en ciclos de cuatro: borrar la última cifra del conteo
 * ("60 pb" → "6 pb"), volver a escribirla, agregar un aumento (", aum") y quitarlo. Todas cambian el documento y la
 * forma de la parte. **Solo con el teclado** (el cursor se ubica una vez al empezar): un `evaluate` entre teclas
 * esperaría a que el hilo principal se libere y escondería el tiempo que una tecla espera detrás de una
 * reconstrucción del 3D (R4-20).
 */
export async function textEdits(page: Page, n: number, rnd: Rng): Promise<void> {
  const at = await plateauLine(page);
  await select(page, at.numberEnd);
  await page.waitForTimeout(300);
  const digit = at.digit;
  for (let k = 0; k < n; k++) {
    const step = k % 4;
    if (step === 0) await page.keyboard.press("Backspace");
    else if (step === 1) await page.keyboard.press(digit);
    else if (step === 2) {
      await presses(page, "ArrowRight", " pb".length); // al final de "pb"
      await page.keyboard.insertText(", aum");
    } else {
      await presses(page, "Shift+ArrowLeft", ", aum".length);
      await page.keyboard.press("Backspace");
      await presses(page, "ArrowLeft", " pb".length); // de vuelta al final del número
    }
    await pause(page, rnd);
  }
}

/**
 * CA4-P3 (cambio de lana de un cambio de color): `n` veces "@B" ↔ "@C" en la vuelta "V15" del cuerpo del escenario
 * de referencia, con el teclado (la letra se elige con Mayús + flecha y se reemplaza). La forma no cambia: solo
 * `colorizePartMesh`.
 */
export async function yarnChangeEdits(page: Page, n: number, rnd: Rng): Promise<void> {
  const at = await page.getByTestId("part-text").evaluate((el: HTMLTextAreaElement) => {
    const i = el.value.search(/^V15: @[BC]/m);
    if (i < 0) throw new Error("No está la V15 con un cambio de color");
    return { at: i + "V15: @".length + 1, letter: el.value[i + "V15: @".length]! };
  });
  await select(page, at.at);
  await page.waitForTimeout(300);
  let letter = at.letter;
  for (let k = 0; k < n; k++) {
    letter = letter === "B" ? "C" : "B";
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press(letter);
    await pause(page, rnd);
  }
}

/** CA4-P2: `n` acciones de bloques: la cantidad del primer bloque de la vuelta `roundIndex`, con flechas (61 ↔ 60). */
export async function blockEdits(page: Page, n: number, rnd: Rng, roundIndex = 10): Promise<void> {
  await page.getByTestId("tab-blocks").click();
  await expect(page.getByTestId("block-editor")).toBeVisible();
  const field = page.locator(`[data-block="${roundIndex}:0"]`).getByTestId("block-count");
  await field.focus();
  await page.waitForTimeout(300);
  for (let k = 0; k < n; k++) {
    await page.keyboard.press(k % 2 === 0 ? "ArrowUp" : "ArrowDown");
    await pause(page, rnd);
  }
  await page.getByTestId("tab-text").click();
  await expect(page.getByTestId("part-text")).toBeVisible();
}

/** Abre el editor de la lana A (paleta propia) en el panel de lanas. */
export async function openYarnA(page: Page): Promise<void> {
  const picker = page.locator("[data-testid=color-picker]");
  if ((await picker.count()) === 0) await page.locator("[data-zone=yarns]").getByRole("button", { name: "Editar lana A" }).click();
  await expect(picker.first()).toBeVisible();
}

const center = async (loc: import("@playwright/test").Locator) => {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/**
 * CA4-P3: `n` clics en dos colores de la paleta, alternados (cambia el color de la lana A: solo `setLooks`). Con
 * `page.mouse` y las posiciones medidas una vez: las comprobaciones de `locator.click` pasan por el hilo principal.
 */
export async function colorClicks(page: Page, n: number, rnd: Rng): Promise<void> {
  await openYarnA(page);
  const swatches = page.locator("[data-testid=color-picker] [data-swatch]");
  const a = await center(swatches.nth(3));
  const b = await center(swatches.nth(5));
  for (let k = 0; k < n; k++) {
    const p = k % 2 === 0 ? a : b;
    await page.mouse.click(p.x, p.y);
    await pause(page, rnd);
  }
}

/** CA4-P3: `n` clics en "Colores planos". */
export async function flatToggles(page: Page, n: number, rnd: Rng): Promise<void> {
  const p = await center(page.getByTestId("visor-3d-colores-planos"));
  for (let k = 0; k < n; k++) {
    await page.mouse.click(p.x, p.y);
    await pause(page, rnd);
  }
}

/** CA4-P10: pasar el cursor por `n` colores de la paleta de la lana A (vista previa, sin tocar el documento). */
export async function swatchHovers(page: Page, n: number, rnd: Rng): Promise<void> {
  await openYarnA(page);
  const centers = await page.locator("[data-testid=color-picker] [data-swatch]").evaluateAll((els) =>
    els.map((el) => {
      el.scrollIntoView({ block: "nearest" });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }),
  );
  expect(centers.length, "colores de la paleta").toBeGreaterThan(10);
  // Solo los que se ven en la pantalla (la columna se desplaza).
  const view = page.viewportSize()!;
  const visible = centers.filter((c) => c.y > 0 && c.y < view.height && c.x > 0 && c.x < view.width);
  expect(visible.length, "colores visibles").toBeGreaterThan(10);
  await page.mouse.move(visible[0]!.x, visible[0]!.y - 60);
  await page.waitForTimeout(300);
  for (let k = 0; k < n; k++) {
    // Cada paso cambia de color: el índice salta de a 3 para no repetir el anterior.
    const c = visible[(k * 3) % visible.length]!;
    await page.mouse.move(c.x, c.y);
    await pause(page, rnd, 100, 300);
  }
  await page.mouse.move(visible[0]!.x, visible[0]!.y - 60);
}

const r1 = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

/** Resumen compacto de una métrica y un origen. */
export function pick(s: ViewerPerfSummary, metric: keyof ViewerPerfSummary["metrics"], origin: string) {
  const m = s.metrics[metric]?.[origin as keyof NonNullable<ViewerPerfSummary["metrics"][typeof metric]>];
  return { n: m?.n ?? 0, p50: r1(m?.p50), p95: r1(m?.p95), max: r1(m?.max) };
}

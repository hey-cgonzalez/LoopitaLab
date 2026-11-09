import { test as base, expect, type Locator, type Page } from "@playwright/test";

/*
 * Ayudas de las pruebas E2E del estudio (T13), sobre `/dev/estudio` (sin sesión ni Supabase).
 * Ideas tomadas de los scripts de QA de T8 a T12 (CDP sin dependencias) y de `scripts/medir-estudio.mjs`.
 */

/**
 * `test` con una guardia automática: si durante la prueba hubo un `console.error` o una excepción no capturada en la
 * página, la prueba falla al terminar (aunque todas sus comprobaciones hayan pasado).
 */
export const test = base.extend<{ pageProblems: string[] }>({
  pageProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        problems.push(`console.error: ${m.text()} (${m.location().url})`);
      });
      page.on("pageerror", (e) => problems.push(`excepción no capturada: ${e.message}`));
      await use(problems);
      expect(problems, "sin console.error ni excepciones no capturadas").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export interface ChartGeom {
  x: number;
  y: number;
  cols: number;
  rows: number;
  px: number;
  left: number;
  top: number;
}

export type Cell = readonly [x: number, y: number];

/** Abre el estudio de desarrollo y espera a que el editor y la vista previa estén dibujados. */
export async function openStudio(page: Page, query = "forma=tubo&reps=3"): Promise<void> {
  await page.goto(`/dev/estudio?${query}`);
  await expect(chart(page)).toBeVisible();
  await expect(page.getByTestId("preview-canvas")).toBeAttached();
  await page.waitForFunction(() => document.readyState === "complete" && Number((document.querySelector("[data-testid=chart-canvas]") as HTMLElement | null)?.dataset.cellPx) > 0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Dos frames: el primer dibujo del editor y de la vista previa ya se pintó.
  await nextFrames(page, 2);
}

export const chart = (page: Page): Locator => page.getByTestId("chart-canvas");

export async function nextFrames(page: Page, n = 1): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}

/** Geometría del canvas del editor (en px CSS de la ventana), después de traerlo a la vista. */
export async function chartGeom(page: Page): Promise<ChartGeom> {
  return page.evaluate(() => {
    const c = document.querySelector("[data-testid=chart-canvas]") as HTMLCanvasElement;
    c.scrollIntoView({ block: "center" });
    const r = c.getBoundingClientRect();
    const cols = Number(c.dataset.cols);
    const rows = Number(c.dataset.rows);
    const px = Number(c.dataset.cellPx);
    return { x: r.x, y: r.y, cols, rows, px, left: (r.width - cols * px) / 2, top: (r.height - rows * px) / 2 };
  });
}

/** Centro de una casilla (x desde la izquierda, y desde abajo: la fila 1 es la de abajo). */
export function cellPoint(g: ChartGeom, [cx, cy]: Cell): { x: number; y: number } {
  return { x: g.x + g.left + (cx + 0.5) * g.px, y: g.y + g.top + (g.rows - 1 - cy + 0.5) * g.px };
}

/** Color de cada casilla leído del canvas del editor (esquina superior izquierda, lejos de la letra). */
export async function cellColors(page: Page, cells: readonly Cell[]): Promise<string[]> {
  return page.evaluate((list) => {
    const c = document.querySelector("[data-testid=chart-canvas]") as HTMLCanvasElement;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    const cols = Number(c.dataset.cols);
    const rows = Number(c.dataset.rows);
    const px = Number(c.dataset.cellPx);
    const cssW = parseFloat(c.style.width);
    const cssH = parseFloat(c.style.height);
    const dpr = c.width / cssW;
    const left = (cssW - cols * px) / 2;
    const top = (cssH - rows * px) / 2;
    return list.map(([x, y]) => {
      const d = ctx.getImageData(Math.round((left + (x + 0.22) * px) * dpr), Math.round((top + (rows - 1 - y + 0.22) * px) * dpr), 1, 1).data;
      return `#${[d[0], d[1], d[2]].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    });
  }, cells as Cell[]);
}

/** Lanas del panel, en orden, con su color. */
export async function yarnHexes(page: Page): Promise<{ letter: string; hex: string }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-zone=yarns] li[data-yarn]")].map((li) => {
      const s = li.querySelector<HTMLElement>("span[style]");
      const m = (s?.style.backgroundColor.match(/\d+/g) ?? []).map(Number);
      return { letter: li.dataset.yarn ?? "", hex: `#${m.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}` };
    }),
  );
}

/** Huella del contenido de la vista previa (para saber si cambió). */
export async function previewHash(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.querySelector("[data-testid=preview-canvas]") as HTMLCanvasElement;
    const u = c.toDataURL();
    let h = 0;
    for (let i = 0; i < u.length; i += 7) h = (h * 31 + u.charCodeAt(i)) >>> 0;
    return `${h}:${u.length}`;
  });
}

/** Limitaciones visibles junto a la vista previa (`data-limitation`). */
export async function limitations(page: Page): Promise<string[]> {
  return page.locator("[data-limitation]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.limitation ?? ""));
}

/** Trazo de lápiz con el ratón por estas casillas (un solo `pointerdown` … `pointerup`). */
export async function strokeThrough(page: Page, g: ChartGeom, cells: readonly Cell[]): Promise<void> {
  const [first, ...rest] = cells;
  if (!first) return;
  let p = cellPoint(g, first);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (const c of rest) {
    p = cellPoint(g, c);
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();
  await nextFrames(page, 2);
}

/** Clic en una casilla. */
export async function clickCell(page: Page, g: ChartGeom, c: Cell): Promise<void> {
  const p = cellPoint(g, c);
  await page.mouse.click(p.x, p.y);
  await nextFrames(page, 2);
}

/** Enfoca el editor sin mover el foco de casilla. */
export async function focusChart(page: Page): Promise<void> {
  await chart(page).focus();
}

/** Quita el foco del editor (el anillo de foco se dibuja sobre la casilla enfocada). */
export async function blurChart(page: Page): Promise<void> {
  await chart(page).evaluate((e) => (e as HTMLElement).blur());
  await nextFrames(page, 2);
}

/** Escribe un valor en un campo numérico como lo haría una persona (seleccionar todo y escribir). */
export async function setField(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.press("ControlOrMeta+a");
  if (value === "") await field.press("Backspace");
  else await field.pressSequentially(value);
}

export const toolButtons = (page: Page): Locator => page.getByRole("group", { name: "Herramientas de dibujo" }).getByRole("button");
export const undoButton = (page: Page): Locator => page.getByRole("button", { name: "Deshacer", exact: true });
export const redoButton = (page: Page): Locator => page.getByRole("button", { name: "Rehacer", exact: true });
export const repeatsX = (page: Page): Locator => page.getByLabel("A lo ancho", { exact: true });
export const repeatsY = (page: Page): Locator => page.getByLabel("A lo alto", { exact: true });

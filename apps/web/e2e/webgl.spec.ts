import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Visor3dDevApi } from "../src/app/dev/visor-3d/VisorDemo.tsx";

/*
 * WebGL por software en la CI (T3, fase 4): comprueba que Chromium (con los flags de SwiftShader del proyecto
 * `webgl` de playwright.config.ts) entrega un contexto y dibuja. Es la base del E2E del visor 3D; no usa three.
 */
test("Chromium entrega un contexto WebGL y dibuja un triángulo", async ({ page }) => {
  await page.goto("/dev/webgl");
  const probe = page.getByTestId("webgl-probe");
  await expect(probe).toHaveAttribute("data-ready", "true");
  const context = await probe.getAttribute("data-context");
  const renderer = await probe.getAttribute("data-renderer");
  // El renderer queda en la salida: en la CI debe ser SwiftShader/SwANGLE; en local puede ser la GPU o Metal.
  console.log(`[webgl] contexto=${context} renderer=${renderer || "(no informado)"}`);
  test.info().annotations.push({ type: "renderer", description: renderer || "(no informado)" });
  expect(["webgl2", "webgl"]).toContain(context);
  // En la CI no hay GPU: si el renderer no es SwiftShader, los flags no se aplicaron y las mediciones del visor mentirían.
  if (process.env.CI) expect(renderer ?? "").toMatch(/swiftshader/i);
  await expect(probe).toHaveAttribute("data-drawn", "true");
});

/*
 * Visor 3D real (T11 de la fase 4; ADR 0010, secciones 5 a 8): `/dev/visor-3d` con `viewer-3d/three` y r3f, en
 * WebGL por software. Comprueba que dibuja, que cambiar aspectos, "Colores planos", la vista previa y el nivel de
 * detalle no recompilan (2 programas), la guardia de rendimiento (0 escenas y 0 atributos al cambiar aspectos),
 * que con aspectos neutros el píxel es el del material base (CA4-V8), el aviso de prototipo (CA4-V1), las siluetas
 * sin WebGL2 y con el contexto perdido (CA4-V5) y la degradación de la sección 6c. Adjunta capturas (CA4-V2, CA4-V8).
 */
type Api = Visor3dDevApi;
type Stats = { visor: { programs: number; programNames: string[]; calls: number; triangles: number; attributesMarked: number; stitches: number; mode: string; lod: string }; controlador: { buildScene: number; partsBuilt: number; partsRecolored: number } };

async function openViewer(page: import("@playwright/test").Page, query = "") {
  await page.goto(`/dev/visor-3d${query}`);
  await page.waitForFunction(() => window.__loopitaVisor3d?.ready === true, null, { timeout: 60_000 });
  await page.evaluate(() => window.__loopitaVisor3d!.flatToPaint(false));
}
const stats = (page: import("@playwright/test").Page) => page.evaluate(() => window.__loopitaVisor3d!.stats()) as Promise<Stats>;
/** Corre `fn(api, arg)` en la página. `fn` no puede usar variables de la prueba: lo que necesite va en `arg`. */
const call = <T, A = undefined>(page: import("@playwright/test").Page, fn: (api: Api, arg: A) => T | Promise<T>, arg?: A) =>
  page.evaluate(({ src, arg: x }) => (0, eval)(`(${src})`)(window.__loopitaVisor3d, x), { src: fn.toString(), arg: arg as A }) as Promise<T>;

test("visor 3D: dibuja, el aviso de prototipo está visible y cambiar el aspecto no recompila", async ({ page }) => {
  await openViewer(page);
  const notice = page.getByTestId("visor-3d-aviso");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("redondea la pieza y puede cambiar sus medidas");
  await expect(notice).toContainText("teje una muestra con tu aguja");
  await expect(notice.getByRole("button")).toHaveCount(0); // no se puede cerrar
  await expect(page.getByTestId("visor-3d-medidas")).toContainText("estimación");

  const s0 = await stats(page);
  console.log(`[visor-3d] programas al montar: ${s0.visor.programs} ${JSON.stringify(s0.visor.programNames)}`);
  expect(s0.visor.programs).toBe(2);
  expect(s0.visor.stitches).toBe(1_800);
  expect(s0.visor.triangles).toBeGreaterThan(3_000);

  // Dibuja de verdad: con aspectos neutros, píxeles distintos del fondo, iguales a los del material base (CA4-V8).
  await call(page, (a) => a.select("fixture-b"));
  await call(page, (a) => a.flatToPaint(true));
  const px = await call(page, (a) => a.neutralVsBase());
  console.log(`[visor-3d] neutro frente a base: ${JSON.stringify(px)}`);
  expect(px.lit).toBeGreaterThan(px.pixels * 0.05);
  expect(px.differing).toBe(0);
  await call(page, (a) => a.flatToPaint(false));
  // El A/B creó los programas del material base: se cuentan desde aquí.
  const base = (await stats(page)).visor.programs;

  const before = await stats(page);
  for (const fiber of ["acrilico", "lana-mohair", "seda", "mohair", "algodon"]) await call(page, (a, f) => a.looksToPaint(f), fiber);
  await call(page, (a) => a.looksToPaint("algodon", "#BA222C"));
  await call(page, (a) => a.flatToPaint(true));
  await call(page, (a) => a.flatToPaint(false));
  await call(page, (a) => a.hoverToPaint("#25A8A6"));
  await call(page, (a) => a.hoverToPaint(null));
  const after = await stats(page);
  expect(after.visor.programs).toBe(base);
  // Guardia de rendimiento (sección 6b): 0 escenas, 0 mallas y 0 atributos al cambiar aspectos.
  expect(after.controlador.buildScene).toBe(before.controlador.buildScene);
  expect(after.visor.attributesMarked).toBe(before.visor.attributesMarked);

  // El nivel de detalle usa los dos programas compilados al montar.
  await call(page, (a) => a.setLod("smooth"));
  await call(page, (a) => a.setLod("relief"));
  expect((await stats(page)).visor.programs).toBe(base);

  // Cambiar la lana de una vuelta: recolorea, sin reconstruir la malla.
  await call(page, (a) => a.select("fixture-a"));
  const r0 = await stats(page);
  await call(page, (a) => a.recolorToPaint());
  const r1 = await stats(page);
  expect(r1.controlador.partsBuilt).toBe(r0.controlador.partsBuilt);
  expect(r1.controlador.partsRecolored).toBe(r0.controlador.partsRecolored + 1);
});

test("visor 3D: degradación fuera de los límites y siluetas (secciones 6c y 8; CA4-V5)", async ({ page }) => {
  await openViewer(page);
  await call(page, (a) => a.select("grande"));
  await expect(page.getByTestId("visor-3d-actualizando")).toHaveCount(0, { timeout: 30_000 });
  const st = (await call(page, (a) => a.status())) as { mode: string; policy: { lod: string; maxPixelRatio: number } };
  expect(st.mode).toBe("degraded");
  expect(st.policy).toMatchObject({ lod: "smooth", maxPixelRatio: 1 });
  await expect(page.getByText("supera los puntos recomendados")).toBeVisible();

  const builds = (await stats(page)).controlador.buildScene;
  await call(page, (a) => a.select("tope"));
  await expect(page.getByTestId("visor-3d-siluetas")).toBeVisible();
  const top = await stats(page);
  expect(top.controlador.buildScene).toBe(builds); // sobre el tope no se arma ninguna malla
  expect(top.visor.mode).toBe("silhouettes");
  await expect(page.getByTestId("visor-3d-aviso")).toBeVisible();

  await call(page, (a) => a.select("fixture-b"));
  await expect(page.getByTestId("visor-3d-siluetas")).toHaveCount(0);
  expect(await call(page, (a) => a.loseContext())).toBe(true);
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-lost", "true");
  await expect(page.getByTestId("visor-3d-siluetas")).toBeVisible();
  await expect(page.getByTestId("visor-3d-siluetas")).toContainText("el halo y el brillo solo se ven en la vista 3D");
  await call(page, (a) => a.restoreContext());
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-lost", "false");
});

test("visor 3D: sin WebGL2 muestra las siluetas con el aviso", async ({ page }) => {
  await page.goto("/dev/visor-3d?sinwebgl=1");
  await expect(page.getByTestId("visor-3d-siluetas")).toBeVisible();
  await expect(page.getByTestId("visor-3d-siluetas").locator("svg")).toHaveCount(1);
  await expect(page.getByTestId("visor-3d-aviso")).toBeVisible();
  await expect(page.getByText("no tiene WebGL 2")).toBeVisible();
});

test("visor 3D: capturas de los patrones de referencia y de las fibras (CA4-V2, CA4-V8)", async ({ page }, info) => {
  await openViewer(page);
  const canvas = page.getByTestId("visor-3d-lienzo");
  // Con E2E_CAPTURAS_DIR, las capturas también se guardan como archivos (para el PR y la revisión de T11c).
  const dir = process.env.E2E_CAPTURAS_DIR;
  if (dir) mkdirSync(dir, { recursive: true });
  const shot = async (name: string) => {
    const body = await canvas.screenshot();
    if (dir) writeFileSync(join(dir, name), body);
    await info.attach(name, { body, contentType: "image/png" });
  };
  for (const key of ["fixture-b", "fixture-a", "cilindro", "panel", "colores", "ondula", "muneco"]) {
    await call(page, (a, k) => a.select(k), key);
    await page.waitForTimeout(150);
    await shot(`visor-3d-${key}.png`);
  }
  await call(page, (a) => a.select("fixture-b"));
  for (const fiber of ["algodon", "acrilico", "lana-mohair", "seda"]) {
    await call(page, (a, f) => a.looksToPaint(f), fiber);
    await page.waitForTimeout(100);
    await shot(`visor-3d-fibra-${fiber}.png`);
  }
  await call(page, (a) => a.flatToPaint(true));
  await page.waitForTimeout(100);
  await shot("visor-3d-colores-planos.png");
});

/*
 * Calibración del aspecto por fibra (T11c de la fase 4; ADR 0010, sección 6b): las mismas lanas (mismo color, solo
 * cambia la composición) en el 3D (`/dev/visor-3d`) y en el 2D (`/dev/fibras-2d`). Con `E2E_CAPTURAS_DIR` guarda
 * `calib-3d-<lana>.png` y `calib-2d-<lana>.png` para compararlas.
 */
const CALIBRATION_HEX = "#BA222C";
const CALIBRATION_FIBERS = ["algodon", "acrilico", "lana-mohair", "seda", "algodon-lurex", "mohair"];

/** Métricas de una captura de una lana roja sobre fondo claro: brillo medio, brillo p98 (destellos), borde y contraste local. */
async function lookMetrics(page: import("@playwright/test").Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const W = c.width;
    const H = c.height;
    const lum = (i: number) => 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    const mask = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) mask[p] = data[p * 4]! - data[p * 4 + 1]! > 40 ? 1 : 0;
    const R = 5;
    const ls: number[] = [];
    const edge: number[] = [];
    const core: number[] = [];
    let diff = 0;
    let nd = 0;
    for (let y = R; y < H - R; y++)
      for (let x = R; x < W - R; x++) {
        const p = y * W + x;
        if (!mask[p]) continue;
        const l = lum(p * 4);
        ls.push(l);
        const inner = mask[p - R] && mask[p + R] && mask[p - R * W] && mask[p + R * W];
        (inner ? core : edge).push(l);
        if (inner && mask[p + 1]) {
          diff += Math.abs(l - lum((p + 1) * 4));
          nd++;
        }
      }
    const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    ls.sort((a, b) => a - b);
    return { mean: mean(ls), p98: ls[Math.floor(ls.length * 0.98)] ?? 0, edge: mean(edge), core: mean(core), contrast: nd ? diff / nd : 0 };
  }, png.toString("base64"));
}

test("calibración: capturas 3D y 2D de las mismas lanas (T11c, CA4-V8)", async ({ page }, info) => {
  const dir = process.env.E2E_CAPTURAS_DIR;
  if (dir) mkdirSync(dir, { recursive: true });
  const rows: string[] = [];
  const save = async (name: string, body: Buffer) => {
    if (dir) writeFileSync(join(dir, name), body);
    await info.attach(name, { body, contentType: "image/png" });
    const m = await lookMetrics(page, body);
    rows.push(`${name}: ${JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 10) / 10])))}`);
  };
  await openViewer(page);
  await call(page, (a) => a.select("fixture-b"));
  const canvas = page.getByTestId("visor-3d-lienzo");
  // La esfera ocupa el centro del lienzo: se recorta para que el detalle del punto se vea.
  const shot3d = async () => {
    const box = (await canvas.boundingBox())!;
    return page.screenshot({ clip: { x: box.x + box.width / 2 - 165, y: box.y + box.height / 2 - 150, width: 330, height: 300 } });
  };
  for (const fiber of CALIBRATION_FIBERS) {
    await call(page, (a, a2) => a.looksToPaint(a2.f, a2.hex), { f: fiber, hex: CALIBRATION_HEX });
    await page.waitForTimeout(150);
    await save(`calib-3d-${fiber}.png`, await shot3d());
  }
  await call(page, (a) => a.flatToPaint(true));
  await page.waitForTimeout(150);
  await save("calib-3d-colores-planos.png", await shot3d());

  await page.goto(`/dev/fibras-2d?hex=${encodeURIComponent(CALIBRATION_HEX)}`);
  for (const id of [...CALIBRATION_FIBERS, "colores-planos"]) {
    const c = page.getByTestId(`fibra-2d-${id}`);
    await expect(c).toHaveAttribute("data-ready", "true");
    await page.waitForTimeout(100);
    await save(`calib-2d-${id}.png`, await c.screenshot());
  }
  console.log(`[calibracion]\n${rows.join("\n")}`);
});

/*
 * Estudio amigurumi con WebGL por software (T14 de la fase 4): el visor se monta con el almacén como fuente
 * (`subscribe` y `getSnapshot`) y deja el modo y la reconstrucción a `ViewerController`. Editar el texto de una parte
 * rearma solo esa malla; la vista previa de una lana y "Colores planos" no arman escena. Fuera del límite
 * recomendado, el editor responde aunque el 3D vaya diferido.
 */
type StudioHook = {
  store: { doc: { parts: Array<{ id: string }> } };
  viewer(): { controller: { counters: { buildScene: number; partsBuilt: number; looksOnly: number } } } | null;
};
const studioCounters = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __loopitaAmigurumi: StudioHook }).__loopitaAmigurumi.viewer()!.controller.counters);

test("estudio amigurumi: editar una parte rearma solo su malla; la vista previa y Colores planos no arman escena", async ({ page }) => {
  await page.goto("/dev/amigurumi?demo=muneco");
  await page.waitForFunction(() => (window as unknown as { __loopitaAmigurumi?: StudioHook }).__loopitaAmigurumi?.viewer() != null, null, { timeout: 60_000 });
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-mode", "full");
  const before = await studioCounters(page);
  await page.getByTestId("part-text").evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
  // Un cierre no cambia la forma: se agrega una nota a la última vuelta, que sí cambia la parte pero no su perfil.
  await page.keyboard.type("\n> nota de prueba");
  await expect.poll(async () => (await studioCounters(page)).buildScene).toBeGreaterThan(before.buildScene);
  const after = await studioCounters(page);
  expect(after.partsBuilt - before.partsBuilt).toBeLessThanOrEqual(1);

  // "Colores planos": solo aspectos (sin escena).
  await page.getByTestId("visor-3d-colores-planos").check();
  await page.getByTestId("visor-3d-colores-planos").uncheck();
  const flat = await studioCounters(page);
  expect(flat.buildScene).toBe(after.buildScene);
  expect(flat.looksOnly).toBeGreaterThan(after.looksOnly);

  // Vista previa de un color al pasar el cursor por la paleta: no arma escena ni cambia el documento.
  const doc = await page.evaluate(() => JSON.stringify((window as unknown as { __loopitaAmigurumi: StudioHook }).__loopitaAmigurumi.store.doc));
  await page.locator("[data-zone=yarns]").getByRole("button", { name: "Editar lana A" }).click();
  await page.locator("[data-testid=color-picker] [data-swatch]").nth(3).hover();
  await page.locator("[data-testid=color-picker] [data-swatch]").nth(5).hover();
  expect((await studioCounters(page)).buildScene).toBe(after.buildScene);
  expect(await page.evaluate(() => JSON.stringify((window as unknown as { __loopitaAmigurumi: StudioHook }).__loopitaAmigurumi.store.doc))).toBe(doc);
});

test("estudio amigurumi: sobre el límite recomendado, el editor responde y el 3D se actualiza diferido", async ({ page }) => {
  await page.goto("/dev/amigurumi?demo=grande");
  await page.waitForFunction(() => (window as unknown as { __loopitaAmigurumi?: StudioHook }).__loopitaAmigurumi?.viewer() != null, null, { timeout: 60_000 });
  await expect(page.getByTestId("limits-meter")).toHaveAttribute("data-tone", "over");
  await expect(page.getByTestId("scene-stitches-tone")).toContainText("Supera el límite recomendado");
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-mode", "degraded");
  await page.getByTestId("part-text").evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    const at = el.value.indexOf("V11-30");
    el.setSelectionRange(at + "V11-30: 60 pb (60)".length, at + "V11-30: 60 pb (60)".length);
  });
  // Una flecha ida y vuelta: el editor sigue el cursor con el teclado y el puntero (no con una selección programática).
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("caret-count")).toContainText("V11–30: 60 puntos cada una");
  const before = await studioCounters(page);
  // Una nota en la meseta cambia la parte: el texto se lee al instante y el 3D se rearma en un turno aparte.
  await page.keyboard.type("\n> nota");
  await expect(page.getByTestId("part-text")).toHaveValue(/V11-30: 60 pb \(60\)\n> nota/);
  await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "synced");
  await expect.poll(async () => (await studioCounters(page)).buildScene, { timeout: 15_000 }).toBeGreaterThan(before.buildScene);
  await expect(page.getByTestId("visor-3d-actualizando")).toHaveCount(0, { timeout: 15_000 });
});

/*
 * Editor de bloques (T15 de la fase 4) con WebGL por software: una acción de bloques (cantidad, insertar vuelta)
 * rearma el 3D igual que el texto, y solo la parte editada.
 */
test("estudio amigurumi: editar en bloques rearma solo la malla de su parte", async ({ page }) => {
  await page.goto("/dev/amigurumi?demo=muneco");
  await page.waitForFunction(() => (window as unknown as { __loopitaAmigurumi?: StudioHook }).__loopitaAmigurumi?.viewer() != null, null, { timeout: 60_000 });
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-mode", "full");
  await page.getByTestId("tab-blocks").click();
  await expect(page.getByTestId("block-editor")).toBeVisible();
  const before = await studioCounters(page);
  const first = page.locator('[data-round="0"]').getByTestId("block-insert-after");
  await first.click();
  await expect.poll(async () => (await studioCounters(page)).buildScene, { timeout: 15_000 }).toBeGreaterThan(before.buildScene);
  const after = await studioCounters(page);
  expect(after.partsBuilt - before.partsBuilt).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("visor-3d-lienzo")).toHaveAttribute("data-mode", "full");
  await expect(page.getByTestId("visor-3d-actualizando")).toHaveCount(0, { timeout: 15_000 });
});

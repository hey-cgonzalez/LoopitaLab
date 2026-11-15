import type { Page } from "@playwright/test";
import { caretToEnd, partText } from "./support/amigurumi.ts";
import { expect, test } from "./support/estudio.ts";

/*
 * Accesibilidad del estudio amigurumi (T17 de la fase 4; CA4-A1 a CA4-A3), sobre `/dev/amigurumi` (sin sesión).
 * Son comprobaciones de comportamiento con Playwright (no hay verificador automático tipo axe en el repositorio):
 * sin desplazamiento horizontal a 320 y 390 px y con el texto al 200 %, foco y anuncios de los diálogos, región viva
 * `polite` sin repetir por tecla, descripción del visor, siluetas con texto, "Posicionar" con teclado, leyenda del
 * ancla, movimiento reducido y atajos del visor.
 *
 * WebGL por software (SwiftShader), con los mismos flags que `webglLaunch` de playwright.config.ts (no se importa el
 * archivo de configuración desde una prueba). Las pruebas de siluetas usan `?sinwebgl=1`.
 */
test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

type Hook = {
  store: { doc: { parts: unknown[] }; run(a: unknown): { changed: boolean } };
  viewer(): { camera: { position: { x: number; y: number; z: number } } } | null;
};

const TABS = [
  ["Partes", "parts-panel"],
  ["Patrón", "part-text"],
  ["3D", "limits-meter"],
] as const;

async function open(page: Page, query = "") {
  await page.goto(`/dev/amigurumi${query}`);
  await expect(partText(page)).toBeVisible();
  // En pantallas angostas el 3D está en su propia pestaña («3D»): arranca en «Patrón» y el visor está oculto.
  if ((page.viewportSize()?.width ?? 1440) >= 1024) await expect(page.getByTestId("visor-3d")).toBeVisible();
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** Cuenta los cambios con texto de una región viva desde ahora. */
async function watchRegion(page: Page, testId: string) {
  await page.evaluate((id) => {
    const w = window as unknown as { __live?: Record<string, string[]> };
    w.__live ??= {};
    w.__live[id] = [];
    const el = document.querySelector(`[data-testid=${id}]`)!;
    new MutationObserver(() => {
      const t = (el.textContent ?? "").trim();
      if (t !== "") w.__live![id]!.push(t);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }, testId);
}
const regionLog = (page: Page, testId: string) => page.evaluate((id) => (window as unknown as { __live: Record<string, string[]> }).__live[id] ?? [], testId);

test.describe("Estudio amigurumi: diseño y legibilidad", () => {
  for (const width of [320, 390]) {
    test(`${width} px: ninguna pestaña desplaza en horizontal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      const tabs = page.getByRole("tablist", { name: "Zonas del estudio" });
      await expect(tabs).toBeVisible();
      for (const [name, testId] of TABS) {
        await tabs.getByRole("tab", { name }).click();
        await expect(page.getByTestId(testId)).toBeVisible();
        expect(await noHScroll(page), `${name} a ${width} px`).toBe(true);
      }
      // Con el modo Posicionar abierto y su leyenda también.
      await tabs.getByRole("tab", { name: "3D" }).click();
      await page.getByTestId("position-mode").click();
      await page.getByTestId("position-mode-surface").check();
      await expect(page.getByTestId("anchor-legend")).toBeVisible();
      expect(await noHScroll(page), `3D con Posicionar a ${width} px`).toBe(true);
    });

    test(`${width} px con el texto al 200 %: sin desplazamiento horizontal y con los controles a la mano`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      // Texto al 200 % (WCAG 1.4.4): todo el tamaño de letra del estudio va en rem.
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      const tabs = page.getByRole("tablist", { name: "Zonas del estudio" });
      for (const [name, testId] of TABS) {
        await tabs.getByRole("tab", { name }).click();
        await expect(page.getByTestId(testId)).toBeVisible();
        expect(await noHScroll(page), `${name} con texto al 200 % a ${width} px`).toBe(true);
      }
      await tabs.getByRole("tab", { name: "3D" }).click();
      await expect(page.getByTestId("visor-3d-colores-planos")).toBeVisible();
    });
  }

  test("con prefers-reduced-motion no hay transiciones ni desplazamientos suaves", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const style = await page.getByTestId("position-mode").evaluate((el) => {
      const s = getComputedStyle(el);
      return { transition: parseFloat(s.transitionDuration), scroll: getComputedStyle(document.documentElement).scrollBehavior };
    });
    expect(style.transition).toBeLessThanOrEqual(0.001);
    expect(style.scroll).toBe("auto");
  });
});

test.describe("Estudio amigurumi: teclado, foco y anuncios", () => {
  test("el cuadro del patrón y la vista 3D muestran el foco por dentro (el marco recorta lo de afuera)", async ({ page }) => {
    await open(page);
    for (const id of ["part-text", "visor-3d-lienzo"]) {
      await page.getByTestId(id).focus();
      const css = await page.getByTestId(id).evaluate((el) => {
        const s = getComputedStyle(el);
        return { offset: s.outlineOffset, width: s.outlineWidth, style: s.outlineStyle };
      });
      expect(css.style, `${id}: contorno visible`).not.toBe("none");
      expect(css.offset, `${id}: contorno hacia adentro`).toBe("-5px");
    }
  });

  test("el visor responde a flechas, + − y 0; con Ctrl no toma las teclas (zoom del navegador)", async ({ page }) => {
    await open(page);
    const lienzo = page.getByTestId("visor-3d-lienzo");
    await expect(lienzo).toHaveAttribute("data-mode", "full");
    const pos = () =>
      page.evaluate(() => {
        const p = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.viewer()!.camera.position;
        return [p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000).join(",");
      });
    // El visor se crea de forma asíncrona (carga diferida del 3D): se espera a que su asa exista.
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.viewer()), { timeout: 20_000 }).toBe(true);
    const home = await pos();
    await lienzo.focus();
    await page.keyboard.press("ArrowRight");
    const turned = await pos();
    expect(turned).not.toBe(home);
    await page.keyboard.press("+");
    const closer = await pos();
    expect(closer).not.toBe(turned);
    // Ctrl + 0 es del navegador: el visor no vuelve a la vista inicial.
    await page.keyboard.press("Control+0");
    expect(await pos()).toBe(closer);
    await page.keyboard.press("0");
    expect(await pos()).toBe(home);
    await expect(page.getByTestId("visor-3d-teclas")).toContainText("las flechas la giran");
  });

  test("el visor tiene descripción accesible con las partes y el patrón (describedBy)", async ({ page }) => {
    await open(page);
    const lienzo = page.getByTestId("visor-3d-lienzo");
    await expect(lienzo).toHaveAccessibleDescription(/Cuerpo/);
    await expect(lienzo).toHaveAccessibleName(/Flechas: girar/);
    // La copia que enlaza el visor vive fuera del <details> (cerrado, su contenido puede no entrar al árbol).
    await expect(page.getByTestId("written-description-text")).toBeHidden();
    await expect(page.getByTestId("written-description-text")).toContainText("Cuerpo");
  });

  test("sin WebGL 2, cada silueta tiene su texto (nombre, vueltas y medidas) y el dibujo no se lee", async ({ page }) => {
    await open(page, "?sinwebgl=1");
    const sil = page.getByTestId("silueta").first();
    await expect(sil).toBeVisible();
    await expect(sil.locator("span.sr-only")).toContainText(/Cuerpo: 1 vuelta, ≈ .+ cm de alto/);
    await expect(sil.locator("[aria-hidden=true]").first()).toBeAttached();
    await expect(page.getByTestId("visor-3d-siluetas").getByRole("list", { name: "Piezas del patrón" })).toBeVisible();
    await expect(page.getByTestId("visor-3d-siluetas")).toContainText("La descripción completa está en «Descripción del patrón»");
  });

  test("«Colores planos» está junto al visor, se alcanza con Tab y tiene su ayuda visible", async ({ page }) => {
    await open(page);
    const flat = page.getByTestId("visor-3d-colores-planos");
    await expect(flat).toHaveAccessibleDescription(/sin el halo ni el brillo/);
    await flat.focus();
    await expect(flat).toBeFocused();
    await page.keyboard.press("Space");
    await expect(flat).toBeChecked();
    const box = (await flat.boundingBox())!;
    expect(box.width, "casilla de al menos 20 px").toBeGreaterThanOrEqual(20);
    // Tab sigue por el nivel de detalle (un solo grupo de opciones) y luego al visor: el orden es el de la pantalla.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("visor-3d-lienzo")).toBeFocused();
  });

  test("el conteo de la vuelta se anuncia una vez, con pausa, en una región polite; los errores van resumidos y sin repetir la columna", async ({ page }) => {
    await open(page);
    const region = page.getByTestId("caret-count-announcement");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toHaveText("");
    await expect(page.getByTestId("read-status")).not.toHaveAttribute("role", "status");
    await caretToEnd(page);
    // Mover el cursor por código no avisa al editor (el navegador no emite `select` con el cursor sin selección): una tecla de
    // navegación sí, como en el uso real.
    await page.keyboard.press("End");
    await expect(region).toHaveText(/V1: 6 puntos/, { timeout: 5_000 }); // el de la línea donde se enfocó
    await watchRegion(page, "caret-count-announcement");
    await page.keyboard.type("\nV2: aum x6 (12)");
    await expect(region).toHaveText(/V2: 12 puntos \(trabaja sobre 6\)/, { timeout: 5_000 });
    // Quince teclas, a lo sumo dos anuncios (pausa de 700 ms entre el último cambio y el anuncio).
    expect((await regionLog(page, "caret-count-announcement")).length).toBeLessThanOrEqual(2);

    // Un error: se dice cuántas líneas y cuál, una sola vez por pausa.
    await page.keyboard.press("Enter");
    await page.keyboard.type("V3: foo");
    await expect(region).toHaveText(/Hay \d+ líneas? sin leer.* línea 7\./, { timeout: 5_000 });
    // Al corregirla, se dice que se leyó bien.
    for (let k = 0; k < 3; k++) await page.keyboard.press("Backspace");
    await page.keyboard.type("pb, aum");
    await expect(region).toContainText("El patrón se leyó bien.", { timeout: 5_000 });
  });

  test("los bloques anuncian el conteo nuevo de la vuelta (con pausa) y las acciones", async ({ page }) => {
    await open(page, "?demo=colores");
    await page.getByTestId("tab-blocks").click();
    const live = page.getByTestId("studio-announcement");
    await page.getByTestId("block-add-color").first().click();
    await expect(live).toHaveText("Se agregó un cambio de lana.");

    await page.getByTestId("block-count").first().fill("9");
    await expect(live).toContainText(/V\d+: \d+ puntos/, { timeout: 5_000 });
    await expect(live).not.toContainText("Se agregó");
  });

  test("Posicionar con teclado: el foco pasa al panel, Escape lo cierra y vuelve al botón; se anuncia", async ({ page }) => {
    await open(page);
    const toggle = page.getByTestId("position-mode");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("position-target")).toBeFocused();
    await expect(page.getByTestId("studio-announcement")).toContainText("Posicionar activado");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("position-panel")).toHaveCount(0);
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("studio-announcement")).toContainText("Posicionar cerrado");
  });

  test("la leyenda del ancla explica las flechas por su largo, no solo por su color", async ({ page }) => {
    await open(page);
    await page.getByTestId("position-mode").click();
    await page.getByTestId("position-mode-surface").check();
    const legend = page.getByTestId("anchor-legend");
    await expect(legend).toBeVisible();
    await expect(legend).toContainText("Flecha larga");
    await expect(legend).toContainText("Flecha mediana");
    await expect(legend).toContainText("Flecha corta");
    await expect(legend).toContainText("no solo por su color");
  });

  test("el medidor expresa el estado en texto y la región viva empieza vacía", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("limits-announcement")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByTestId("limits-announcement")).toHaveText("");
    await expect(page.getByRole("meter")).toHaveAttribute("aria-valuetext", /de 40\.000 puntos recomendados en la escena/);
    await expect(page.getByTestId("shortcuts")).toBeVisible();
    await page.getByTestId("shortcuts").locator("summary").click();
    await expect(page.getByTestId("shortcuts")).toContainText("Escape cierra el modo y devuelve el foco al botón");
  });

  test("el diálogo del límite lleva el foco adentro, lo retiene, Escape cancela y el foco vuelve a «Agregar parte»", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const { store } = (window as unknown as { __loopitaAmigurumi: { store: { doc: { parts: Array<Record<string, unknown>> }; run(a: unknown): unknown } } }).__loopitaAmigurumi;
      const base = store.doc.parts[0]!;
      for (let i = 2; i <= 20; i++) store.run({ type: "addPart", part: { ...base, id: `x${i}`, name: `P${i}` } });
    });
    const add = page.getByTestId("add-part");
    await add.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("limit-dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el: HTMLDialogElement) => el.tagName === "DIALOG" && el.open && el.matches(":modal"))).toBe(true);
    await expect(dialog).toHaveAccessibleName("Límite recomendado");
    await expect(dialog).toHaveAccessibleDescription(/Esto supera el límite recomendado de 20 partes/);
    await expect(page.getByTestId("limit-cancel")).toBeFocused();
    // Tab no sale a la página de atrás.
    for (let k = 0; k < 5; k++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !document.activeElement?.closest("[data-testid=parts-panel]") && !document.activeElement?.closest("[data-testid=part-text-editor]"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(add).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.store.doc.parts.length)).toBe(20);
  });

  test("el diálogo de líneas sin leer lleva el foco a «Volver al texto» y lo devuelve a la pestaña «Bloques»", async ({ page }) => {
    await open(page);
    await caretToEnd(page);
    await page.keyboard.type("\nV2: zzz");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "unread");
    const blocksTab = page.getByTestId("tab-blocks");
    await blocksTab.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByTestId("unread-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("unread-back")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("tab-text")).toHaveAttribute("aria-selected", "true");
  });

  test("a 390 px, elegir una parte pasa a «Patrón» con el foco en el nombre de la parte (no se pierde)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page);
    const tabs = page.getByRole("tablist", { name: "Zonas del estudio" });
    await tabs.getByRole("tab", { name: "Partes" }).click();
    await page.getByTestId("part-open").first().click();
    await expect(page.getByTestId("editor-part-name")).toBeFocused();
  });
  test("a 390 px, tocar una pieza en el 3D pasa a «Patrón» y lleva el cursor a su vuelta (el foco no va a un cuadro oculto)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await open(page, "?demo=armar");
    const tabs = page.getByRole("tablist", { name: "Zonas del estudio" });
    await tabs.getByRole("tab", { name: "3D" }).click();
    const lienzo = page.getByTestId("visor-3d-lienzo");
    await expect(lienzo).toHaveAttribute("data-mode", "full");
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.viewer()), { timeout: 20_000 }).toBe(true);
    await lienzo.scrollIntoViewIfNeeded();
    const box = (await lienzo.boundingBox())!;
    // Un punto de la pantalla sobre una pieza, buscado con el mismo `pick` del visor.
    const ndc = await page.evaluate(() => {
      const v = (window as unknown as { __loopitaAmigurumi: { viewer(): { renderer: { pick(x: number, y: number): unknown } } } }).__loopitaAmigurumi.viewer();
      for (let y = 0.4; y >= -0.4; y -= 0.05) for (let x = -0.4; x <= 0.4; x += 0.05) if (v.renderer.pick(x, y)) return [x, y] as const;
      return null;
    });
    expect(ndc, "una pieza se ve en el lienzo").not.toBeNull();
    await page.mouse.click(box.x + ((ndc![0] + 1) / 2) * box.width, box.y + ((1 - ndc![1]) / 2) * box.height);
    await expect(tabs.getByRole("tab", { name: "Patrón" })).toHaveAttribute("aria-selected", "true");
    await expect(partText(page)).toBeVisible();
    await expect(partText(page)).toBeFocused();
  });
});

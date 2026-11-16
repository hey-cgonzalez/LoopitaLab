import type { Page } from "@playwright/test";
import type { WrittenPattern } from "@loopitalab/pattern-core";
import { caretToEnd, lineMarker, partText, textLines } from "./support/amigurumi.ts";
import { expect, test } from "./support/estudio.ts";
import { genIdaVueltaOps, runOpsDirect, runOpsWithTabs } from "./support/ida-vuelta.ts";

/*
 * QA de la fase 4 (T19, `qa-tester`), sin sesión, sobre `/dev/amigurumi`. E2E que sugirieron T14 y T15 y que no
 * quedaron en el repositorio, más la revisión de `guard()` frente a CA4-E12:
 *  - deshacer y rehacer con una parte con líneas sin leer; quitar una lana con otra parte con líneas sin leer;
 *  - marcas de vuelta con "V5–8" junto a notas y comentarios;
 *  - foco del teclado en la lista de partes después de mover y borrar;
 *  - un diálogo que cruza en una sola acción el límite de partes y el de puntos de la escena (BUG-QA4-2);
 *  - una acción de bloques que supera un límite: sin diálogo (T15-5) y con aviso junto a la vuelta (BUG-QA4-3);
 *  - CA4-E3 con tres semillas más y ediciones de texto variadas;
 *  - la política completa (`?bloques=completo`) con teclado y en móvil.
 */

type Hook = { store: { doc: WrittenPattern; run(a: unknown): { changed: boolean } } };
const docOf = (page: Page) => page.evaluate(() => (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.store.doc);
const status = (page: Page) => page.getByTestId("part-text-editor");

async function open(page: Page, query = "") {
  await page.goto(`/dev/amigurumi${query}`);
  await expect(partText(page)).toBeVisible();
  await expect(page.getByTestId("visor-3d")).toBeVisible();
}
const openPart = (page: Page, i: number) => page.getByTestId("part-item").nth(i).getByTestId("part-open").click();

test.describe("QA fase 4: líneas sin leer con otras acciones", () => {
  test("deshacer y rehacer en otra parte, y en la misma, conservan las líneas sin leer", async ({ page }) => {
    await open(page);
    await caretToEnd(page);
    await page.keyboard.type("\nV2: aum x6 (12)\nV3: zzz");
    await expect(status(page)).toHaveAttribute("data-status", "unread");

    // Otra parte: editar, deshacer y rehacer.
    await page.getByTestId("add-part").click();
    await expect(page.getByTestId("editor-part-name")).toHaveText("Parte 2");
    await caretToEnd(page);
    await page.keyboard.type("\nV2: aum x6 (12)");
    await expect.poll(async () => (await docOf(page)).parts[1]?.rounds.length).toBe(2);
    await page.getByTestId("undo").click();
    await expect.poll(async () => (await docOf(page)).parts[1]?.rounds.length).toBe(1);
    await page.getByTestId("redo").click();
    await expect.poll(async () => (await docOf(page)).parts[1]?.rounds.length).toBe(2);

    await openPart(page, 0);
    await expect(page.getByTestId("editor-part-name")).toHaveText("Cuerpo");
    await expect(partText(page)).toHaveValue(/V3: zzz/);
    await expect(status(page)).toHaveAttribute("data-status", "unread");

    // En la misma parte: deshacer quita la V2 leída, pero la línea sin leer sigue en el texto y fuera del documento.
    await page.getByTestId("undo").click();
    await page.getByTestId("undo").click();
    await expect(partText(page)).toHaveValue(/V3: zzz/);
    await page.getByTestId("redo").click();
    await page.getByTestId("redo").click();
    await expect(partText(page)).toHaveValue(/V3: zzz/);
    expect(JSON.stringify(await docOf(page))).not.toContain("zzz");
  });

  test("quitar una lana usada mientras otra parte tiene líneas sin leer: esas líneas se conservan", async ({ page }) => {
    await open(page, "?demo=colores");
    await page.getByTestId("add-part").click();
    await caretToEnd(page);
    await page.keyboard.type("\nV2: zzz @B");
    await expect(status(page)).toHaveAttribute("data-status", "unread");
    await openPart(page, 0);
    const yarns = page.locator("[data-zone=yarns]");
    await yarns.getByRole("button", { name: "Quitar lana B" }).click();
    await yarns.getByRole("button", { name: "Quitar y reemplazar" }).click();
    await expect.poll(async () => (await docOf(page)).yarns.map((y) => y.id)).toEqual(["A", "C"]);
    await expect(partText(page)).not.toHaveValue(/@B/);
    await openPart(page, 1);
    await expect(partText(page)).toHaveValue(/V2: zzz @B/);
    await expect(status(page)).toHaveAttribute("data-status", "unread");
  });
});

test.describe("QA fase 4: marcas, foco y límites", () => {
  test("las marcas de vuelta caen en su línea con un rango «V5–8» junto a notas y comentarios", async ({ page }) => {
    await open(page);
    await caretToEnd(page);
    await page.keyboard.type(
      ["", "V2: aum x6 (12)", "> coloca un marcador", "# esto no se guarda", "V3: [pb, aum] x6 (18)", "V4: 18 pb (18)", "> nota", "V5-8: [pb 2, aum] x6 (24)", "# otro comentario", "> nota del rango", "V9: 20 pb (20)"].join("\n"),
    );
    await page.getByTestId("written-title").focus();
    await expect(status(page)).toHaveAttribute("data-status", "synced");
    const lines = await textLines(page);
    const at = (prefix: string) => lines.findIndex((l) => l.startsWith(prefix)) + 1;
    // El rango que cambia el conteo (ROUND_RANGE_CHANGES) y la V9 que no cuadra: cada error en su línea.
    await expect.poll(() => lineMarker(page, at("V5-8"))).toBe("error");
    await expect.poll(() => lineMarker(page, at("V9"))).toBe("error");
    // Las vueltas que cuadran y las notas no llevan marca; los comentarios llevan la del aviso de # (PARSE_COMMENT).
    for (const l of [at("V4"), at("V3"), at("V2")]) expect(await lineMarker(page, l)).toBeNull();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (l.startsWith(">")) expect(await lineMarker(page, i + 1), `línea ${i + 1}: ${l}`).toBeNull();
      if (l.startsWith("#")) expect(await lineMarker(page, i + 1), `línea ${i + 1}: ${l}`).toBe("warning");
    }
  });

  test("foco del teclado en la lista de partes: al mover sigue a la parte", async ({ page }) => {
    await open(page);
    await page.getByTestId("add-part").click();
    await page.getByTestId("add-part").click();
    await expect(page.getByTestId("part-item")).toHaveCount(3);
    const third = page.getByTestId("part-item").nth(2);
    await third.getByRole("button", { name: "Subir «Parte 3»" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("part-item").nth(1)).toContainText("Parte 3");
    await expect(page.getByRole("button", { name: "Subir «Parte 3»" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("part-item").first()).toContainText("Parte 3");
    // Ya es la primera: «Subir» queda deshabilitado y el foco pasa al botón de abrir la parte.
    await expect(page.getByTestId("part-item").first().getByTestId("part-open")).toBeFocused();

  });

  test("BUG-QA4-4: al borrar una parte con el teclado el foco queda dentro de la lista de partes (hoy cae en el body)", async ({ page }) => {
    await open(page);
    await page.getByTestId("add-part").click();
    await page.getByTestId("add-part").click();
    await expect(page.getByTestId("part-item")).toHaveCount(3);
    await page.getByTestId("part-item").first().getByTestId("part-remove").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("part-remove-confirm")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("part-item")).toHaveCount(2);
    const inPanel = await page.evaluate(() => !!document.activeElement && document.activeElement !== document.body && !!document.activeElement.closest('[data-testid="parts-panel"]'));
    expect(inPanel, "después de borrar, el foco queda dentro de la lista de partes").toBe(true);
  });

  /** 20 partes y 39.996 puntos en la escena: agregar una parte de 6 puntos cruza los dos límites. */
  async function nearBothLimits(page: Page) {
    await page.evaluate(() => {
      const { store } = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi;
      const base = store.doc.parts[0]!;
      for (let i = 2; i <= 20; i++) {
        const n = i === 20 ? 2100 : 2105;
        store.run({ type: "addPart", part: { ...base, id: `x${i}`, name: `P${i}`, rounds: [{ number: 1, items: [{ type: "stitch", stitch: "sc", count: n }] }] } });
      }
    });
    await expect(page.getByTestId("parts-limit")).toHaveText(/20 de 20 partes recomendadas/);
    await expect(page.getByTestId("scene-stitches")).toHaveText(/39\.996 de 40\.000 puntos recomendados/);
  }

  test("una acción que cruza el límite de partes y el de la escena: un diálogo, Cancelar no cambia nada y Seguir igual no vuelve a preguntar por ninguno", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await nearBothLimits(page);
    const dialog = page.getByTestId("limit-dialog");
    await page.getByTestId("add-part").click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("20 partes");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect((await docOf(page)).parts).toHaveLength(20);

    await page.getByTestId("add-part").click();
    await dialog.getByRole("button", { name: "Seguir igual" }).click();
    await expect.poll(async () => (await docOf(page)).parts.length).toBe(21);
    await expect(page.getByTestId("scene-stitches")).toHaveText(/40\.002 de 40\.000/);
    // Ninguno de los dos vuelve a preguntar.
    await page.getByTestId("add-part").click();
    await expect.poll(async () => (await docOf(page)).parts.length).toBe(22);
    await expect(dialog).toBeHidden();
  });

  test("BUG-QA4-2: el diálogo nombra todos los límites que la acción supera (hoy solo el primero)", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await nearBothLimits(page);
    await page.getByTestId("add-part").click();
    const dialog = page.getByTestId("limit-dialog");
    await expect(dialog).toContainText("20 partes");
    await expect(dialog).toContainText("40.000 puntos en la escena", { timeout: 2_000 });
  });

  test("bloques (T15-5): subir una cantidad sobre 200 puntos no abre el diálogo y la advertencia aparece en el texto", async ({ page }) => {
    await open(page);
    await page.getByTestId("tab-blocks").click();
    await expect(page.getByTestId("block-editor")).toBeVisible();
    await page.locator('[data-block="0:0"]').getByTestId("block-count").fill("240");
    await page.getByTestId("block-insert-end").focus();
    await expect(page.getByTestId("limit-dialog")).toBeHidden();
    await expect.poll(async () => (await docOf(page)).parts[0]?.rounds[0]?.items[0]).toMatchObject({ count: 240 });
    await page.getByTestId("tab-text").click();
    await expect(page.getByTestId("part-review").locator('[data-kind="limit"]')).toContainText("supera los 200 puntos recomendados por vuelta");
  });

  test("BUG-QA4-3: en bloques, la vuelta que supera los puntos recomendados no muestra la advertencia junto a la vuelta", async ({ page }) => {
    await open(page);
    await page.getByTestId("tab-blocks").click();
    await page.locator('[data-block="0:0"]').getByTestId("block-count").fill("240");
    await page.getByTestId("block-insert-end").focus();
    await expect(page.locator('[data-round="0"]')).toContainText("200 puntos recomendados", { timeout: 2_000 });
  });
});

test.describe("QA fase 4: ida y vuelta texto ↔ bloques con más semillas (CA4-E3)", () => {
  for (const seed of [7, 99999, 20261116]) {
    test(`semilla ${seed}: 20 o más cambios de pestaña con ediciones de texto variadas dan el mismo documento que en una sola vista`, async ({ page, browser }) => {
      test.setTimeout(120_000);
      const ops = genIdaVueltaOps(seed);
      await open(page);
      const switches = await runOpsWithTabs(page, ops);
      expect(switches).toBeGreaterThanOrEqual(20);
      const viaTabs = await docOf(page);
      const ctx = await browser.newContext();
      try {
        const other = await ctx.newPage();
        await open(other);
        await runOpsDirect(other, ops);
        const direct = await docOf(other);
        expect(viaTabs.parts[0]).toEqual(direct.parts[0]);
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe("QA fase 4: política completa de bloques (?bloques=completo)", () => {
  const DEEP = "\nV2: [[[[pb, aum] x2, pb] x2, pb] x2, pb] x2 (12)";

  test("con teclado: se llega al nivel 5 con flechas y se edita su cantidad con Enter", async ({ page }) => {
    await open(page, "?bloques=completo");
    await caretToEnd(page);
    await page.keyboard.type(DEEP);
    await expect.poll(async () => (await docOf(page)).parts[0]?.rounds.length).toBe(2);
    await page.getByTestId("tab-blocks").click();
    const block = (k: string) => page.locator(`[data-block="${k}"]`);
    await block("1:0").focus();
    for (const k of ["1:0.0", "1:0.0.0", "1:0.0.0.0", "1:0.0.0.0.0"]) {
      await page.keyboard.press("ArrowRight");
      await expect(block(k)).toBeFocused();
    }
    await page.keyboard.press("ArrowDown");
    await expect(block("1:0.0.0.0.1")).toBeFocused();
    await expect(block("1:0.0.0.0.1")).toHaveAttribute("data-editable", "true");
    await page.keyboard.press("Enter");
    const count = block("1:0.0.0.0.1").getByTestId("block-count");
    await expect(count).toBeFocused();
    await count.selectText();
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await expect(block("1:0.0.0.0.1")).toBeFocused();
    await expect(page.getByTestId("block-round-count").nth(1)).toHaveAttribute("data-produced", "126");
    await page.getByTestId("tab-text").click();
    await expect(partText(page)).toHaveValue(/V2: \[\[\[\[pb, 3 aum\] x2, pb\] x2, pb\] x2, pb\] x2/);
  });

  test("@movil a 390 px: los niveles profundos se editan con toques y no hay desplazamiento horizontal", async ({ page }) => {
    await page.goto("/dev/amigurumi?bloques=completo");
    await expect(partText(page)).toBeVisible();
    await caretToEnd(page);
    await page.keyboard.type(DEEP);
    await expect.poll(async () => (await docOf(page)).parts[0]?.rounds.length).toBe(2);
    await page.getByTestId("tab-blocks").tap();
    const deep = page.locator('[data-block="1:0.0.0.0.1"]');
    await expect(deep).toHaveAttribute("data-editable", "true");
    await deep.scrollIntoViewIfNeeded();
    await deep.getByTestId("block-count").tap();
    await deep.getByTestId("block-count").fill("4");
    await expect.poll(async () => JSON.stringify((await docOf(page)).parts[0]?.rounds[1])).toContain('"count":4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

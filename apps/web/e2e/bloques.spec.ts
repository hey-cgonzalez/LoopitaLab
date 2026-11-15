import type { Page } from "@playwright/test";
import type { Item, WrittenPattern } from "@loopitalab/pattern-core";
import { caretToEnd, partText, textLines, viewerMeasures } from "./support/amigurumi.ts";
import { expect, test } from "./support/estudio.ts";

/*
 * Editor de bloques del estudio amigurumi sin sesión (T15 de la fase 4), sobre `/dev/amigurumi`:
 *  - editar punto, cantidad, hebra y lana; agrupar y desagrupar; subir y bajar; insertar y borrar vueltas; cada
 *    acción es un paso de deshacer y el texto y el 3D siguen al documento (CA4-E6);
 *  - ida y vuelta texto ↔ bloques: 20 cambios de pestaña con ediciones sembradas dan el mismo documento que las
 *    mismas ediciones sin cambiar de vista (CA4-E3);
 *  - líneas sin leer al cambiar de pestaña: "Volver al texto" o "Descartar las líneas sin leer";
 *  - niveles 3 a 6 en solo lectura con "Editar en el texto"; con `?bloques=completo` se editan (CA4-E11);
 *  - teclado básico del árbol; vuelta que cruza un límite recomendado pasa por el diálogo.
 * Con sesión (guardar y recargar): `sesion/bloques.spec.ts`.
 */

type Hook = {
  store: { doc: WrittenPattern; run(a: unknown): { changed: boolean } };
  viewer(): { controller: { counters: { buildScene: number } } } | null;
};
const docOf = (page: Page) => page.evaluate(() => (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.store.doc);
const roundsOf = async (page: Page) => (await docOf(page)).parts[0]!.rounds;
const builds = (page: Page) => page.evaluate(() => (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.viewer()?.controller.counters.buildScene ?? -1);

async function open(page: Page, query = "") {
  await page.goto(`/dev/amigurumi${query}`);
  await expect(partText(page)).toBeVisible();
  await expect(page.getByTestId("visor-3d")).toBeVisible();
}
const blocksTab = (page: Page) => page.getByTestId("tab-blocks");
const textTab = (page: Page) => page.getByTestId("tab-text");
async function toBlocks(page: Page) {
  await blocksTab(page).click();
  await expect(page.getByTestId("block-editor")).toBeVisible();
}
async function toText(page: Page) {
  await textTab(page).click();
  await expect(partText(page)).toBeVisible();
}
const block = (page: Page, key: string) => page.locator(`[data-block="${key}"]`);
const setRounds = (page: Page, text: string) => caretToEnd(page).then(() => page.keyboard.type(text));

test.describe("Editor de bloques (sin sesión)", () => {
  test("editar en bloques cambia el texto y el 3D; cada acción es un paso de deshacer (CA4-E6)", async ({ page }) => {
    await open(page);
    const measures = await viewerMeasures(page);
    const before = await builds(page);
    await toBlocks(page);
    await expect(page.getByTestId("block-round")).toHaveCount(1);
    await expect(page.getByTestId("block-round-count")).toHaveAttribute("data-produced", "6");

    // Cantidad: de 6 a 8. El conteo sale del motor; el patrón declaraba 6 y ahora no cuadra.
    await block(page, "0:0").getByTestId("block-count").fill("8");
    await expect(page.getByTestId("block-round-count")).toHaveAttribute("data-produced", "8");
    await expect(page.getByTestId("block-mismatch")).toContainText("No cuadra: el patrón declara 6 y los bloques dan 8");
    await page.getByTestId("block-mismatch").getByRole("button", { name: "Declarar 8" }).click();
    await expect(page.getByTestId("block-mismatch")).toHaveCount(0);
    await expect.poll(() => builds(page)).toBeGreaterThan(before);
    await expect.poll(() => viewerMeasures(page)).not.toBe(measures);

    // Punto y hebra.
    await block(page, "0:0").getByTestId("block-stitch").selectOption("hdc");
    await block(page, "0:0").getByTestId("block-loop").selectOption("back");
    expect((await roundsOf(page))[0]!.items[0]).toEqual({ type: "stitch", stitch: "hdc", count: 8, loop: "back" });

    // El texto es `formatPart` del documento.
    await toText(page);
    expect(await textLines(page)).toContain("V1: 8 mpa ht (8)");

    // Deshacer: cada acción es un paso (hebra, punto, declarar, cantidad).
    for (const expected of [{ stitch: "hdc", count: 8 }, { stitch: "sc", count: 8 }]) {
      await page.getByTestId("undo").click();
      expect((await roundsOf(page))[0]!.items[0]).toMatchObject(expected);
    }
    await page.getByTestId("undo").click();
    await page.getByTestId("undo").click();
    expect((await roundsOf(page))[0]).toMatchObject({ items: [{ stitch: "sc", count: 6 }], expected: 6 });
    await expect(page.getByTestId("undo")).toBeDisabled();
  });

  test("teclear una cantidad en bloques es un solo paso de deshacer", async ({ page }) => {
    await open(page);
    await toBlocks(page);
    const count = block(page, "0:0").getByTestId("block-count");
    await count.click();
    await count.selectText();
    await page.keyboard.type("12");
    await page.getByTestId("block-add-stitch").focus();
    expect((await roundsOf(page))[0]!.items[0]).toMatchObject({ count: 12 });
    await page.getByTestId("undo").click();
    expect((await roundsOf(page))[0]!.items[0]).toMatchObject({ count: 6 });
  });

  test("insertar y borrar vueltas renumeran; subir, bajar, agrupar y deshacer el grupo", async ({ page }) => {
    await open(page);
    await setRounds(page, "\nV2: aum x6 (12)");
    await expect.poll(async () => (await roundsOf(page)).length).toBe(2);
    await toBlocks(page);

    // Insertar una vuelta antes de la 2: la nueva es la V2 y la que había pasa a V3.
    await page.locator('[data-round="1"]').getByTestId("block-insert-before").click();
    await expect.poll(async () => (await roundsOf(page)).map((r) => r.number)).toEqual([1, 2, 3]);
    await expect(page.getByTestId("block-round-label")).toHaveText(["V1", "V2", "V3"]);
    await expect(page.locator('[data-round="1"]').getByTestId("block-round-count")).toHaveAttribute("data-produced", "6");

    // Borrar la nueva.
    await page.locator('[data-round="1"]').getByTestId("block-remove-round").click();
    await expect.poll(async () => (await roundsOf(page)).map((r) => r.number)).toEqual([1, 2]);

    // En la V2: agregar un punto, bajar/subir el aumento y agrupar.
    const r2 = page.locator('[data-round="1"]');
    await r2.getByTestId("block-add-stitch").click();
    expect((await roundsOf(page))[1]!.items.map((i) => (i as { stitch: string }).stitch)).toEqual(["inc", "sc"]);
    await block(page, "1:0").getByTestId("block-down").click();
    expect((await roundsOf(page))[1]!.items.map((i) => (i as { stitch: string }).stitch)).toEqual(["sc", "inc"]);
    await block(page, "1:1").getByTestId("block-up").click();
    expect((await roundsOf(page))[1]!.items.map((i) => (i as { stitch: string }).stitch)).toEqual(["inc", "sc"]);
    await block(page, "1:0").getByTestId("block-wrap-next").click();
    expect((await roundsOf(page))[1]!.items).toEqual([{ type: "group", times: 2, items: [{ type: "stitch", stitch: "inc", count: 6 }, { type: "stitch", stitch: "sc", count: 1 }] }]);
    await block(page, "1:0").getByTestId("block-times").fill("3");
    await expect(page.locator('[data-round="1"]').getByTestId("block-round-count")).toHaveAttribute("data-produced", "39");
    await block(page, "1:0").getByTestId("block-unwrap").click();
    expect((await roundsOf(page))[1]!.items).toHaveLength(6);
    await toText(page);
    expect((await textLines(page)).find((l) => l.startsWith("V2:"))).toMatch(/^V2: /);
  });

  test("cambios de lana: se ven y se editan en bloques", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.store.run({
        type: "addYarn",
        yarn: { id: "B", weight: 4, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#BA222C", paletteId: "rojo" } },
      });
    });
    await setRounds(page, "\nV2: 6 pb, @B, 6 pb (12)");
    await expect.poll(async () => (await roundsOf(page)).length).toBe(2);
    await toBlocks(page);
    await expect(block(page, "1:1")).toHaveAttribute("data-type", "color");
    await expect(block(page, "1:1").getByTestId("block-yarn")).toHaveValue("B");
    await block(page, "1:1").getByTestId("block-yarn").selectOption("A");
    expect((await roundsOf(page))[1]!.items[1]).toEqual({ type: "color", yarn: "A" });
  });

  test("niveles 3 a 6 en solo lectura con 'Editar en el texto'; los dos primeros se editan (CA4-E6)", async ({ page }) => {
    await open(page);
    await setRounds(page, "\nV2: [[[[pb, aum] x2, pb] x2, pb] x2, pb] x2 (12)");
    await expect.poll(async () => (await roundsOf(page)).length).toBe(2);
    await toBlocks(page);
    await expect(block(page, "1:0")).toHaveAttribute("data-editable", "true");
    await expect(block(page, "1:0.0")).toHaveAttribute("data-editable", "true");
    await expect(block(page, "1:0.0.0")).toHaveAttribute("data-editable", "false");
    await expect(block(page, "1:0.0.0.0")).toHaveAttribute("data-editable", "false");
    await expect(block(page, "1:0.0.0.0.0")).toHaveAttribute("data-editable", "false");
    // Todo se ve: los puntos del nivel 5.
    await expect(block(page, "1:0.0.0.0.0")).toContainText("pb");
    await expect(block(page, "1:0.0.0.0.0")).toHaveAttribute("aria-level", "5");
    // Sin campos de edición en los niveles de solo lectura, y un solo "Editar en el texto" por rama.
    await expect(block(page, "1:0.0.0").getByTestId("block-times")).toHaveCount(0);
    const toTextButton = block(page, "1:0.0.0").getByTestId("block-edit-in-text").first();
    await expect(toTextButton).toBeVisible();
    await toTextButton.click();
    await expect(partText(page)).toBeVisible();
    await expect(textTab(page)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => partText(page).evaluate((el: HTMLTextAreaElement) => el.value.slice(0, el.selectionStart).split("\n").length)).toBe(6);
  });

  test("política de la versión completa (?bloques=completo): se edita a todos los niveles (CA4-E11)", async ({ page }) => {
    await open(page, "?bloques=completo");
    await setRounds(page, "\nV2: [[[[pb, aum] x2, pb] x2, pb] x2, pb] x2 (12)");
    await expect.poll(async () => (await roundsOf(page)).length).toBe(2);
    await toBlocks(page);
    await expect(block(page, "1:0.0.0.0")).toHaveAttribute("data-editable", "true");
    await expect(page.getByTestId("block-edit-in-text")).toHaveCount(0);
    await block(page, "1:0.0.0.0.1").getByTestId("block-count").fill("4");
    const deep = (await roundsOf(page))[1]!.items as Item[];
    const level5 = (((((deep[0] as { items: Item[] }).items[0] as { items: Item[] }).items[0] as { items: Item[] }).items[0] as { items: Item[] }).items[1]) as { count: number };
    expect(level5.count).toBe(4);
  });

  test("líneas sin leer: 'Volver al texto' las conserva y 'Descartar las líneas sin leer' las quita (CA4-E6)", async ({ page }) => {
    await open(page);
    await setRounds(page, "\nV2: zzz");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "unread");
    const before = await roundsOf(page);

    await blocksTab(page).click();
    const dialog = page.getByTestId("unread-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Hay líneas sin leer en el texto");
    await expect(page.getByTestId("block-editor")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Volver al texto" }).click();
    await expect(dialog).toBeHidden();
    await expect(partText(page)).toHaveValue(/V2: zzz/);
    expect(await roundsOf(page)).toEqual(before);

    await blocksTab(page).click();
    await dialog.getByRole("button", { name: "Descartar las líneas sin leer" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("block-editor")).toBeVisible();
    await toText(page);
    await expect(partText(page)).not.toHaveValue(/zzz/);
    expect(await roundsOf(page)).toEqual(before);
  });

  test("teclado: flechas entre bloques, Enter a sus datos y Escape de vuelta; una sola parada de Tab por vuelta", async ({ page }) => {
    await open(page);
    await setRounds(page, "\nV2: 6 aum, [pb, aum] x2 (14)");
    await expect.poll(async () => (await roundsOf(page)).length).toBe(2);
    await toBlocks(page);
    const tree = page.locator('[data-round="1"] [role="tree"]');
    const stops = tree.locator('[role="treeitem"][tabindex="0"]');
    await expect(stops).toHaveCount(1);
    await expect(stops.first()).toHaveAttribute("data-block", "1:0");

    await block(page, "1:0").focus();
    await page.keyboard.press("ArrowDown");
    await expect(block(page, "1:1")).toBeFocused();
    await expect(block(page, "1:1")).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight"); // entra al grupo
    await expect(block(page, "1:1.0")).toBeFocused();
    await page.keyboard.press("ArrowLeft"); // sale al grupo
    await expect(block(page, "1:1")).toBeFocused();
    await page.keyboard.press("End");
    await expect(block(page, "1:1.1")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(block(page, "1:0")).toBeFocused();
    await expect(stops).toHaveCount(1);

    // Enter lleva a la cantidad; escribir; Enter y Escape vuelven al bloque.
    await page.keyboard.press("Enter");
    await expect(block(page, "1:0").getByTestId("block-count")).toBeFocused();
    await block(page, "1:0").getByTestId("block-count").selectText();
    await page.keyboard.type("7");
    await page.keyboard.press("Enter");
    await expect(block(page, "1:0")).toBeFocused();
    expect((await roundsOf(page))[1]!.items[0]).toMatchObject({ count: 7 });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(block(page, "1:0")).toBeFocused();

    // Tab desde el bloque va a sus datos (Tab, no solo flechas) y Alt+Abajo lo baja con el foco siguiéndolo.
    await page.keyboard.press("Alt+ArrowDown");
    await expect(block(page, "1:1")).toBeFocused();
    expect(((await roundsOf(page))[1]!.items[1] as { stitch: string; count: number }).count).toBe(7);
  });

  test("una vuelta que supera el límite recomendado pasa por el diálogo; Cancelar no la inserta (CA4-E12)", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const { store } = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi;
      for (let i = 0; i < 99; i++) store.run({ type: "insertRound", partId: store.doc.parts[0]!.id, index: i + 1, round: { number: 1, items: [{ type: "stitch", stitch: "sc", count: 6 }] } });
    });
    await expect.poll(async () => (await roundsOf(page)).length).toBe(100);
    await toBlocks(page);
    await page.getByTestId("block-insert-end").click();
    const dialog = page.getByTestId("limit-dialog");
    await expect(dialog).toContainText("100 vueltas por parte");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    expect(await roundsOf(page)).toHaveLength(100);
    await page.getByTestId("block-insert-end").click();
    await dialog.getByRole("button", { name: "Seguir igual" }).click();
    await expect.poll(async () => (await roundsOf(page)).length).toBe(101);
  });

  test("20 cambios de pestaña texto ↔ bloques con ediciones sembradas dan el mismo documento que sin cambiar de vista (CA4-E3)", async ({ page, browser }) => {
    // Generador con semilla (mulberry32): las mismas ediciones en las dos pasadas.
    const rng = (seed: number) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // `insert` lleva cuántos puntos deja la vuelta 1 (la vuelta nueva copia ese conteo; lo da el motor, aquí se modela
    // a mano porque la pasada B no tiene motor en la página).
    type Op = { kind: "count"; v: number } | { kind: "insert"; produced: number } | { kind: "wrap" } | { kind: "text"; n: number } | { kind: "stitch"; v: string };
    const next = rng(20261114);
    const ops: Op[] = [];
    let rounds = 1;
    const m = { s: "sc", c: 6, t: 2, g: false };
    const produced = () => (m.g ? m.t : 1) * m.c * (m.s === "inc" ? 2 : 1);
    for (let i = 0; i < 10; i++) {
      const r = next();
      if (r < 0.3) {
        const v = 1 + Math.floor(next() * 20);
        if (m.g) m.t = v;
        else m.c = v;
        ops.push({ kind: "count", v });
      } else if (r < 0.5 && rounds < 8) {
        ops.push({ kind: "insert", produced: produced() });
        rounds++;
      } else if (r < 0.7 && !m.g) {
        m.g = true;
        m.t = 2;
        ops.push({ kind: "wrap" });
      } else if (r < 0.85 && rounds < 8) {
        rounds++;
        ops.push({ kind: "text", n: rounds });
      } else if (!m.g) {
        m.s = ["hdc", "dc", "inc", "sc"][Math.floor(next() * 4)]!;
        ops.push({ kind: "stitch", v: m.s });
      } else {
        m.t = 1 + Math.floor(next() * 20);
        ops.push({ kind: "count", v: m.t });
      }
    }
    expect(ops.some((o) => o.kind === "insert") && ops.some((o) => o.kind === "text")).toBe(true);

    // Pasada A: cada edición en su vista, cambiando de pestaña antes y después (20 cambios).
    await open(page);
    let grp = false;
    for (const op of ops) {
      if (op.kind === "text") {
        await toText(page);
        await caretToEnd(page);
        await page.keyboard.type(`\nV${op.n}: 1 pb`);
        await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "synced");
      } else {
        await toBlocks(page);
        if (op.kind === "count") {
          const el = grp ? block(page, "0:0").getByTestId("block-times") : block(page, "0:0").getByTestId("block-count");
          await el.fill(String(op.v));
          await page.getByTestId("block-insert-end").focus();
        } else if (op.kind === "insert") await page.locator('[data-round="0"]').getByTestId("block-insert-after").click();
        else if (op.kind === "wrap") {
          await block(page, "0:0").getByTestId("block-wrap").click();
          grp = true;
        } else await block(page, "0:0").getByTestId("block-stitch").selectOption(op.v);
      }
    }
    await toText(page);
    await toBlocks(page);
    const viaTabs = await docOf(page);

    // Pasada B: las mismas ediciones como operaciones del almacén, sin cambiar de vista.
    const other = await (await browser.newContext()).newPage();
    try {
      await open(other);
      await other.evaluate((all: Op[]) => {
        const { store } = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi;
        const partId = store.doc.parts[0]!.id;
        let g = false;
        for (const op of all) {
          const first = () => store.doc.parts[0]!.rounds[0]!.items[0] as unknown as Record<string, unknown>;
          if (op.kind === "count") store.run(g ? { type: "updateItem", partId, roundIndex: 0, path: [0], item: { ...first(), times: op.v } } : { type: "updateItem", partId, roundIndex: 0, path: [0], item: { ...first(), count: op.v } });
          else if (op.kind === "insert") store.run({ type: "insertRound", partId, index: 1, round: { number: 1, items: [{ type: "stitch", stitch: "sc", count: op.produced }] } });
          else if (op.kind === "text") store.run({ type: "insertRound", partId, index: store.doc.parts[0]!.rounds.length, round: { number: op.n, items: [{ type: "stitch", stitch: "sc", count: 1 }] } });
          else if (op.kind === "wrap") {
            store.run({ type: "wrapInGroup", partId, roundIndex: 0, from: [0], to: [0], times: 2 });
            g = true;
          } else store.run({ type: "updateItem", partId, roundIndex: 0, path: [0], item: { ...first(), stitch: op.v } });
        }
      }, ops);
      const direct = await docOf(other);
      expect(viaTabs.parts[0]).toEqual(direct.parts[0]);
    } finally {
      await other.context().close();
    }
  });
});

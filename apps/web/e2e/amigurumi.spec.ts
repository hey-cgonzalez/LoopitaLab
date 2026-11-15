import type { Page } from "@playwright/test";
import type { WrittenPattern } from "@loopitalab/pattern-core";
import { caretToEnd, caretToLineEnd, lineMarker, partText, textLines, viewerMeasures } from "./support/amigurumi.ts";
import { expect, test } from "./support/estudio.ts";

/*
 * Estudio amigurumi sin sesión (T14 de la fase 4), sobre `/dev/amigurumi` (sin Supabase ni guardado):
 *  - límites recomendados visibles desde el inicio y diálogo "Seguir igual" o "Cancelar" (CA4-E12);
 *  - lectura en cada cambio, error en su línea, forma canónica solo al salir de la línea (CA4-E1, CA4-E2, CA4-E7);
 *  - aviso de los comentarios con # (CA4-E5), dialecto UK, partes (CA4-E8), lanas (CA4-E10);
 *  - el 3D sigue al documento y no cambia mientras hay líneas sin leer.
 * El guardado, la recarga y el respaldo de las líneas sin leer están en `sesion/amigurumi.spec.ts`.
 */

type Hook = { store: { doc: WrittenPattern; run(a: unknown): { changed: boolean } }; viewer(): { controller: { counters: { buildScene: number } } } | null };
const docOf = (page: Page) => page.evaluate(() => (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.store.doc);
const roundsOf = async (page: Page, part = 0) => (await docOf(page)).parts[part]?.rounds.length ?? 0;
const builds = (page: Page) => page.evaluate(() => (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi.viewer()?.controller.counters.buildScene ?? -1);

async function open(page: Page, query = "") {
  await page.goto(`/dev/amigurumi${query}`);
  await expect(partText(page)).toBeVisible();
  await expect(page.getByTestId("visor-3d")).toBeVisible();
}

test.describe("Estudio amigurumi (sin sesión)", () => {
  test("los límites recomendados se ven desde el inicio (CA4-E12)", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("scene-stitches")).toHaveText("6 de 40.000 puntos recomendados en la escena");
    await expect(page.getByTestId("parts-limit")).toHaveText("1 de 20 partes recomendadas");
    await expect(page.getByTestId("limits-meter")).toHaveAttribute("data-tone", "ok");
    const help = page.getByTestId("limits-help");
    await expect(help.getByText("¿Por qué hay límites recomendados?")).toBeVisible();
    await help.getByText("¿Por qué hay límites recomendados?").click();
    await expect(help).toContainText("No son límites del tejido");
    await expect(page.getByTestId("part-rounds")).toHaveText("1 de 100 vueltas recomendadas");
  });

  test("escribir vueltas: lee en cada cambio, marca el error en su línea y pone la forma canónica al salir de la línea", async ({ page }) => {
    await open(page);
    expect(await textLines(page)).toEqual(["Parte: Cuerpo", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)"]);
    await caretToEnd(page);
    await page.keyboard.type("\nV2: aum x6 (12)");
    // Se leyó y se aplicó, pero la línea donde está el cursor no cambia (CA4-E7): el cursor no salta.
    await expect.poll(() => roundsOf(page)).toBe(2);
    expect((await textLines(page))[5]).toBe("V2: aum x6 (12)");
    expect(await partText(page).evaluate((el: HTMLTextAreaElement) => el.selectionStart === el.value.length)).toBe(true);
    await expect(page.getByTestId("caret-count")).toContainText("V2: 12 puntos (trabaja sobre 6)");
    await expect(page.getByTestId("scene-stitches")).toHaveText("18 de 40.000 puntos recomendados en la escena");

    // Salir de la línea: forma canónica, y el cursor sigue al principio de la línea nueva.
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await textLines(page))[5]).toBe("V2: 6 aum (12)");
    expect(await partText(page).evaluate((el: HTMLTextAreaElement) => el.value.slice(0, el.selectionStart).split("\n").length)).toBe(7);

    // Una línea que no se lee ("V3", "V3:", "V3: f"… nunca se leen): error en la línea 7, el documento y el 3D no cambian.
    const before = await builds(page);
    await page.keyboard.type("V3: foo");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "unread");
    await expect.poll(() => lineMarker(page, 7)).toBe("error");
    await expect(page.getByTestId("read-errors")).toContainText("Línea 7, columna");
    expect(await roundsOf(page)).toBe(2);
    expect(await builds(page)).toBe(before);

    // Corregirla: se aplica; el validador marca junto a la vuelta que no cuadra (CA4-E2) y el 3D se vuelve a armar.
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("pb, aum");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "synced");
    await expect.poll(() => roundsOf(page)).toBe(3);
    await expect(page.getByTestId("part-review").locator('[data-code="ROUND_CONSUMPTION_MISMATCH"]')).toContainText("V3:");
    await expect.poll(() => lineMarker(page, 7)).toBe("error");
    expect(await builds(page)).toBeGreaterThan(before);
    await expect(page.getByTestId("written-draft")).toBeVisible();
  });

  test("el aviso de los comentarios con # (CA4-E5) y las notas con >", async ({ page }) => {
    await open(page);
    await caretToEnd(page);
    await page.keyboard.type("\n> Marca el inicio de la vuelta.\n# esto no se guarda");
    await expect(page.getByTestId("comment-warning")).toHaveText("Los comentarios con # no se guardan; usa > para una nota.");
    await expect.poll(async () => (await docOf(page)).parts[0]?.rounds[0]?.note).toBe("Marca el inicio de la vuelta.");
    expect(JSON.stringify(await docOf(page))).not.toContain("esto no se guarda");
  });

  test("dialecto UK: escribe R1 con dc y lee dc como punto bajo; el modo de lectura no se guarda", async ({ page }) => {
    await open(page, "?dialecto=uk");
    await expect(page.getByTestId("dialect-line")).toContainText("Reino Unido");
    expect(await textLines(page)).toContain("R1: 6 dc (6)");
    await caretToEnd(page);
    await page.keyboard.type("\nR2: inc x6 (12)\nR3: 12 tr (12)");
    await expect.poll(() => roundsOf(page)).toBe(3);
    const d = await docOf(page);
    expect(d.parts[0]?.rounds[2]?.items).toEqual([{ type: "stitch", stitch: "dc", count: 12 }]);
    expect(JSON.stringify(d)).not.toMatch(/es-uk/);
    // Salir de la línea R2 la deja en forma canónica UK.
    expect((await textLines(page))[5]).toBe("R2: 6 inc (12)");
  });

  test("partes: agregar, renombrar, fijar la cantidad, ordenar y borrar (CA4-E8)", async ({ page }) => {
    await open(page);
    await page.getByTestId("add-part").click();
    await expect(page.getByTestId("part-item")).toHaveCount(2);
    await expect(page.getByTestId("parts-limit")).toHaveText("2 de 20 partes recomendadas");
    await expect(page.getByTestId("editor-part-name")).toHaveText("Parte 2");

    const second = page.getByTestId("part-item").nth(1);
    await second.getByTestId("part-rename").click();
    await second.getByTestId("part-name-input").fill("Oreja");
    await second.getByTestId("part-name-input").press("Enter");
    await expect(page.getByTestId("editor-part-name")).toHaveText("Oreja");

    await second.getByRole("button", { name: "Una vez más «Oreja»" }).click();
    await expect(second.getByTestId("part-pieces")).toContainText("Oreja (1 de 2)");
    await expect(second.getByTestId("part-pieces")).toContainText("Oreja (2 de 2)");
    expect(await textLines(page)).toContain("Cantidad: 2");

    await second.getByRole("button", { name: "Subir «Oreja»" }).click();
    await expect(page.getByTestId("part-item").first()).toContainText("Oreja");

    await page.getByTestId("part-item").first().getByTestId("part-remove").click();
    await page.getByTestId("part-remove-confirm").click();
    await expect(page.getByTestId("part-item")).toHaveCount(1);
    await expect(page.getByTestId("editor-part-name")).toHaveText("Cuerpo");
    await expect(page.getByTestId("part-item").first().getByTestId("part-remove")).toBeDisabled();
  });

  test("diálogo del límite recomendado: Cancelar deja todo igual; Seguir igual aplica y no vuelve a preguntar (CA4-E12)", async ({ page }) => {
    await open(page);
    // 19 partes más con el almacén (rápido); la 21 se agrega con el botón.
    await page.evaluate(() => {
      const { store } = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi;
      const base = store.doc.parts[0]!;
      for (let i = 2; i <= 20; i++) store.run({ type: "addPart", part: { ...base, id: `x${i}`, name: `P${i}` } });
    });
    await expect(page.getByTestId("parts-limit")).toHaveText(/20 de 20 partes recomendadas/);
    await expect(page.getByTestId("parts-limit")).toHaveAttribute("data-tone", "near");

    await page.getByTestId("add-part").click();
    const dialog = page.getByTestId("limit-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Esto supera el límite recomendado de 20 partes");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect((await docOf(page)).parts).toHaveLength(20);

    await page.getByTestId("add-part").click();
    await dialog.getByRole("button", { name: "Seguir igual" }).click();
    await expect.poll(async () => (await docOf(page)).parts.length).toBe(21);
    await expect(page.getByTestId("parts-limit")).toHaveAttribute("data-tone", "over");
    await expect(page.getByTestId("parts-limit")).toContainText("Supera el límite recomendado");

    // No vuelve a preguntar por ese límite en la sesión.
    await page.getByTestId("add-part").click();
    await expect.poll(async () => (await docOf(page)).parts.length).toBe(22);
    await expect(dialog).toBeHidden();
    // Nada de esto entra al documento.
    expect(JSON.stringify(await docOf(page))).not.toMatch(/accepted|seguir/i);
  });

  test("escribir una vuelta de más de 200 puntos advierte junto a la vuelta, sin diálogo", async ({ page }) => {
    await open(page);
    await caretToEnd(page);
    await page.keyboard.type("\nV2: 240 pb");
    await expect.poll(() => roundsOf(page)).toBe(2);
    await expect(page.getByTestId("part-review").locator('[data-kind="limit"]')).toContainText("V2: supera los 200 puntos recomendados por vuelta");
    await expect(page.getByTestId("limit-dialog")).toBeHidden();
    await expect.poll(() => lineMarker(page, 6)).not.toBeNull();
  });

  test("lanas: el selector de la fase 3 funciona; quitar una lana usada pide la de reemplazo y actualiza los @ (CA4-E10)", async ({ page }) => {
    await open(page, "?demo=colores");
    expect((await partText(page).inputValue())).toContain("@B");
    const yarns = page.locator("[data-zone=yarns]");
    await yarns.getByRole("button", { name: "Editar lana B" }).click();
    await expect(page.getByTestId("yarn-picker")).toBeVisible();
    await page.keyboard.press("Escape");
    await yarns.getByRole("button", { name: "Quitar lana B" }).click();
    await expect(yarns.getByText("¿Con qué lana la reemplazas en el patrón?")).toBeVisible();
    await yarns.getByRole("button", { name: "Quitar y reemplazar" }).click();
    await expect.poll(async () => (await docOf(page)).yarns.map((y) => y.id)).toEqual(["A", "C"]);
    await expect(partText(page)).not.toHaveValue(/@B/);
  });

  test("el 3D sigue al documento, y Bloques y Posicionar quedan preparados y desactivados", async ({ page }) => {
    await open(page);
    const before = await viewerMeasures(page);
    await caretToEnd(page);
    await page.keyboard.type("\nV2: aum x6 (12)\nV3: [pb, aum] x6 (18)\nV4-8: 18 pb (18)");
    await expect.poll(() => viewerMeasures(page)).not.toBe(before);
    await expect(page.getByTestId("tab-blocks")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("position-mode")).toBeDisabled();
    await expect(page.getByTestId("written-description")).toContainText("Descripción del patrón");
    await expect(page.locator("#" + (await page.getByTestId("visor-3d-lienzo").getAttribute("aria-describedby"))!.split(" ")[1]!)).toContainText("Cuerpo");
  });

  test("sin WebGL: siluetas, y el estudio sigue editable", async ({ page }) => {
    await open(page, "?sinwebgl=1");
    await expect(page.getByTestId("visor-3d")).toHaveAttribute("data-mode", "sin-webgl");
    const before = await viewerMeasures(page);
    await caretToLineEnd(page, 5);
    await page.keyboard.type("\nV2: aum x6 (12)\nV3-6: 12 pb (12)");
    await expect.poll(() => viewerMeasures(page)).not.toBe(before);
  });
});

test.describe("Estudio amigurumi en 390 px", () => {
  test("@movil cada pestaña muestra su zona, sin desplazamiento horizontal", async ({ page }) => {
    await page.goto("/dev/amigurumi");
    const tabs = page.getByRole("tablist", { name: "Zonas del estudio" });
    await expect(tabs).toBeVisible();
    await expect(partText(page)).toBeVisible();
    for (const [name, testId] of [
      ["Partes", "parts-panel"],
      ["3D", "limits-meter"],
      ["Patrón", "part-text"],
    ] as const) {
      await tabs.getByRole("tab", { name }).click();
      await expect(page.getByTestId(testId)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  });
});

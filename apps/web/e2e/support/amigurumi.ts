import { expect, type Locator, type Page } from "@playwright/test";

/*
 * Ayudas de las E2E del estudio amigurumi (T14 de la fase 4), con y sin sesión.
 */

export const partText = (page: Page): Locator => page.getByTestId("part-text");

/** Lleva el cursor al final del texto de la parte (sin depender de los atajos de cada sistema). */
export async function caretToEnd(page: Page): Promise<void> {
  await partText(page).evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

/** Lleva el cursor al final de la línea `line` (desde 1). */
export async function caretToLineEnd(page: Page, line: number): Promise<void> {
  await partText(page).evaluate((el: HTMLTextAreaElement, n: number) => {
    el.focus();
    const lines = el.value.split("\n");
    const at = lines.slice(0, n).join("\n").length;
    el.setSelectionRange(at, at);
  }, line);
}

export const textLines = async (page: Page): Promise<string[]> => (await partText(page).inputValue()).split("\n");

/** Marca de la línea en el margen (`error`, `warning`, `limit`) o null. */
export const lineMarker = (page: Page, line: number) => page.locator(`[data-testid=text-gutter] [data-line="${line}"]`).getAttribute("data-marker");

/** Texto de las medidas o las siluetas del visor (cambia cuando el 3D se vuelve a armar con otra forma). */
export async function viewerMeasures(page: Page): Promise<string> {
  const measures = page.getByTestId("visor-3d-medidas");
  const silhouettes = page.getByTestId("visor-3d-siluetas");
  await expect(measures.or(silhouettes).first()).toBeVisible();
  return (await measures.count()) > 0 ? measures.innerText() : silhouettes.innerText();
}

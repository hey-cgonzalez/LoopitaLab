import type { Page } from "@playwright/test";
import { contextAs, createFromTemplate, expect, openDesignSection, test, stateFile } from "./support.ts";

/*
 * Accesibilidad y uso con una mano de "Tejiendo" (T13 de la fase 3; CA3-A1, CA3-T11). Cuenta: fer.
 * La plantilla "Banda en tubo" es un motivo de 8 × 8 repetido 12 veces, en redondo: 8 vueltas.
 */
test.use({ storageState: stateFile("fer") });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const TEJER = /\/proyectos\/([0-9a-f-]{36})\/tejer$/;
const counter = (page: Page) => page.getByTestId("knit-row-counter");
const live = (page: Page) => page.getByTestId("knit-announcement");
const CONTROLS = ["knit-prev", "knit-next", "knit-prev-repeat", "knit-next-repeat"];

async function startFromStudio(page: Page): Promise<string> {
  await openDesignSection(page);
  await page.getByTestId("knit-from-studio").getByRole("button", { name: "Tejer este diseño" }).click();
  await expect(page.getByTestId("knit-dialog").getByTestId("knit-preview")).toBeVisible();
  await page.getByTestId("knit-dialog").getByTestId("knit-confirm").click();
  await page.waitForURL(TEJER, { timeout: 20_000 });
  await expect(counter(page)).toBeVisible();
  return TEJER.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe("Tejiendo: accesibilidad y una mano", () => {
  test("el conflicto abre un <dialog> modal: Esc no lo cierra, el foco queda dentro y vuelve a «Siguiente»", async ({ page, browser, admin, watch }) => {
    await createFromTemplate(page, unique("A11y conflicto"));
    const projectId = await startFromStudio(page);
    const { context, page: other } = await contextAs(browser, "fer", watch);
    await other.goto(`/proyectos/${projectId}/tejer`);
    await expect(counter(other)).toHaveText("Vuelta 1 de 8");
    for (let k = 0; k < 3; k++) await page.getByTestId("knit-next").click();
    await expect(page.locator("[data-progress-status]")).toHaveAttribute("data-progress-status", "saved", { timeout: 10_000 });
    await expect.poll(async () => (await admin.from("project_progress").select("round_number").eq("project_id", projectId).single()).data?.round_number).toBe(4);

    await other.getByTestId("knit-next").click();
    const dialog = other.getByTestId("progress-conflict");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    expect(await dialog.evaluate((el: HTMLDialogElement) => el.tagName === "DIALOG" && el.open && el.matches(":modal"))).toBe(true);
    await expect(dialog).toHaveAttribute("role", "alertdialog");
    await expect(dialog).toHaveAccessibleName("Conflicto de avance");
    await expect(dialog).toHaveAccessibleDescription(/En otro dispositivo vas en la vuelta 4/);
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    // Esc no descarta: hay que elegir.
    await other.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el: HTMLDialogElement) => el.open)).toBe(true);
    // El foco no pasa a la página de atrás con Tab: queda en el diálogo (o sale al navegador, nunca a un botón inerte).
    for (let k = 0; k < 5; k++) {
      await other.keyboard.press("Tab");
      expect(await other.evaluate(() => !document.activeElement?.closest("[data-testid=knit-controls]") && !document.activeElement?.closest("[data-testid=hand-toggle]"))).toBe(true);
    }
    // Las teclas del patrón no mueven nada con el diálogo abierto.
    await other.keyboard.press("ArrowRight");
    await expect(counter(other)).toHaveText("Vuelta 2 de 8");

    await other.getByTestId("conflict-take-theirs").click();
    await expect(dialog).toHaveCount(0);
    await expect(counter(other)).toHaveText("Vuelta 4 de 8");
    await expect(other.getByTestId("knit-next")).toBeFocused();
    await context.close();
  });

  test("interruptor de mano: el orden del DOM cambia y coincide con el visual, y se recuerda", async ({ page }) => {
    await createFromTemplate(page, unique("A11y mano"));
    await startFromStudio(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const controls = page.getByTestId("knit-controls");
    const order = () =>
      controls.evaluate((el) => {
        const dom = [...el.querySelectorAll<HTMLElement>("[data-testid]")].map((b) => b.dataset.testid as string);
        const x = (id: string) => el.querySelector<HTMLElement>(`[data-testid=${id}]`)!.getBoundingClientRect().left;
        return { dom, nextRight: x("knit-next") > x("knit-prev"), nextRepRight: x("knit-next-repeat") > x("knit-prev-repeat") };
      });

    // Diestra (por defecto, perfil sin mano distinta): «Anterior» a la izquierda.
    await expect(page.getByTestId("hand-toggle")).toHaveAttribute("aria-checked", "false");
    let o = await order();
    expect(o.dom.indexOf("knit-prev")).toBeLessThan(o.dom.indexOf("knit-next"));
    expect(o.nextRight && o.nextRepRight).toBe(true);

    await page.getByTestId("hand-toggle").click();
    await expect(page.getByTestId("hand-toggle")).toHaveAttribute("aria-checked", "true");
    await expect(controls).toHaveAttribute("data-hand", "left");
    o = await order();
    expect(o.dom.indexOf("knit-next")).toBeLessThan(o.dom.indexOf("knit-prev"));
    expect(o.dom.indexOf("knit-next-repeat")).toBeLessThan(o.dom.indexOf("knit-prev-repeat"));
    expect(o.nextRight || o.nextRepRight, "el orden visual sigue al del DOM").toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("loopitalab:tejiendo:mano"))).toBe("left");

    // Tab recorre los botones como se ven: «Siguiente» (a la izquierda) antes que «Anterior».
    await page.getByTestId("knit-next").click(); // «Anterior» está desactivado en la vuelta 1
    await page.getByTestId("knit-next").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("knit-prev")).toBeFocused();

    await page.reload();
    await expect(page.getByTestId("hand-toggle")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("knit-controls")).toHaveAttribute("data-hand", "left");
    await page.getByTestId("hand-toggle").click(); // deja la cuenta como estaba
    expect(await page.evaluate(() => localStorage.getItem("loopitalab:tejiendo:mano"))).toBe("right");
  });

  test("a 390 px la barra cabe, los controles miden ≥ 56 px y quedan en el 40 % inferior (CA3-T11)", async ({ page }) => {
    await createFromTemplate(page, unique("A11y barra"));
    await startFromStudio(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(counter(page)).toBeVisible();
    expect(await noHScroll(page)).toBe(true);
    const bar = await page.getByTestId("knit-controls").boundingBox();
    expect(bar!.x).toBeGreaterThanOrEqual(0);
    expect(bar!.x + bar!.width).toBeLessThanOrEqual(390 + 0.5);
    for (const id of CONTROLS) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.height, `${id}: alto`).toBeGreaterThanOrEqual(56);
      expect(box.width, `${id}: ancho`).toBeGreaterThanOrEqual(56);
      expect(box.x, `${id}: dentro de la pantalla`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${id}: dentro de la pantalla`).toBeLessThanOrEqual(390 + 0.5);
      expect(box.y, `${id}: en el 40 % inferior`).toBeGreaterThanOrEqual(844 * 0.6);
      expect(box.y + box.height, `${id}: visible sin desplazar`).toBeLessThanOrEqual(844);
    }
  });

  test("320 px: cero desplazamiento horizontal en Tejiendo, lista de proyectos, ficha y Mis lanas", async ({ page }) => {
    const title = unique("A11y 320");
    await createFromTemplate(page, title);
    const projectId = await startFromStudio(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`/proyectos/${projectId}/tejer`);
    await expect(counter(page)).toBeVisible();
    expect(await noHScroll(page), "Tejiendo").toBe(true);
    await page.getByTestId("knit-chart-text").locator("summary").click(); // la tabla abierta tampoco desborda la página
    expect(await noHScroll(page), "Tejiendo con el gráfico en texto").toBe(true);
    for (const [name, url] of [["lista de proyectos", "/proyectos"], ["ficha", `/proyectos/${projectId}`], ["Mis lanas", "/lanas"]] as const) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await noHScroll(page), name).toBe(true);
    }
  });

  test("con poca altura (568 px) la barra no tapa el gráfico ni lo deja inutilizable", async ({ page }) => {
    await createFromTemplate(page, unique("A11y baja"));
    await startFromStudio(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.reload();
    await expect(counter(page)).toBeVisible();
    const bar = (await page.getByTestId("knit-controls").boundingBox())!;
    expect(bar.height, "la barra no ocupa más de la mitad de la altura").toBeLessThanOrEqual(568 / 2);
    // Por debajo de 1024 px la página desplaza entera y la barra queda fija abajo: no aplasta el contenido.
    expect(bar.y + bar.height, "la barra queda pegada al borde inferior").toBeGreaterThanOrEqual(568 - 1);
    const chart = page.getByTestId("knit-chart");
    for (const y of [0, 400, 900]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      const bar2 = (await page.getByTestId("knit-controls").boundingBox())!;
      expect(bar2.y + bar2.height, `barra fija con scroll ${y}`).toBeGreaterThanOrEqual(568 - 1);
    }
    // El gráfico se alcanza al desplazar, tiene altura útil y, centrado en el área libre, la barra no lo cubre.
    await chart.evaluate((el) => el.scrollIntoView({ block: "center" }));
    expect(Number(await chart.getAttribute("data-cell-px")), "casillas con tamaño mínimo (el de clampCellPx)").toBeGreaterThanOrEqual(4);
    const box = (await page.getByTestId("knit-chart-scroll").boundingBox())!;
    expect(box.height, "marco del gráfico con altura útil").toBeGreaterThanOrEqual(200);
    const free = bar.y;
    const midY = Math.min(Math.max(box.y + box.height / 2, 0), free - 4);
    const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("[data-testid=knit-controls]"), { x: box.x + box.width / 2, y: midY });
    expect(hit, "la barra no cubre el gráfico").toBe(false);
    // Un botón enfocado con el teclado no queda tapado por la barra (scroll-padding-bottom).
    await page.getByTestId("knit-chart-text").locator("summary").focus();
    const sum = (await page.getByTestId("knit-chart-text").locator("summary").boundingBox())!;
    expect(sum.y + sum.height, "el foco queda por encima de la barra").toBeLessThanOrEqual(bar.y + 1);
    // Y el gráfico sigue en pantalla completa a 320 sin desborde horizontal.
    expect(await noHScroll(page)).toBe(true);
  });

  test("la región viva no anuncia al cargar y anuncia una vez, completo, al avanzar", async ({ page }) => {
    await createFromTemplate(page, unique("A11y viva"));
    await startFromStudio(page);
    await page.reload();
    await expect(counter(page)).toBeVisible();
    const region = live(page);
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toHaveAttribute("role", "status");
    await expect(region).toHaveText("");

    // Cuenta los cambios de la región desde ahora: avanzar una vuelta debe dejar un solo anuncio.
    await page.evaluate(() => {
      const w = window as unknown as { __live: string[] };
      w.__live = [];
      const el = document.querySelector("[data-testid=knit-announcement]")!;
      new MutationObserver(() => w.__live.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true });
    });
    await page.getByTestId("knit-next").click();
    await expect(region).toHaveText(/^Vuelta 2 de 8, por el derecho, de derecha a izquierda, \d+ puntos\. En cada repetición: .+\.$/);
    expect(await page.evaluate(() => (window as unknown as { __live: string[] }).__live.filter((t) => t !== ""))).toHaveLength(1);

    await page.getByTestId("knit-next-repeat").click();
    await expect(region).toHaveText(/^Repetición 2 de 12 de la vuelta 2: .+$/);
    // Repetir la acción sin cambio (sigue en la misma repetición al retroceder al inicio) no deja anuncios vacíos de más.
    expect(await page.evaluate(() => (window as unknown as { __live: string[] }).__live.filter((t) => t !== ""))).toHaveLength(2);
  });

  test("el gráfico en texto marca la fila actual y sigue al avanzar; los puntos de repetición se leen sin color", async ({ page }) => {
    await createFromTemplate(page, unique("A11y texto"));
    await startFromStudio(page);
    const text = page.getByTestId("knit-chart-text");
    await expect(text).not.toHaveAttribute("open", "");
    await text.locator("summary").click();
    await expect(text.getByRole("table")).toBeVisible();
    await expect(text.locator("tbody tr")).toHaveCount(8);
    const current = text.locator("tr[aria-current=true]");
    await expect(current).toHaveCount(1);
    await expect(current.getByRole("rowheader")).toContainText("1");
    await expect(current).toContainText("(la que tejes ahora)");
    await expect(text.getByRole("columnheader", { name: "Vuelta" })).toBeVisible();

    await page.getByTestId("knit-next").click();
    await page.getByTestId("knit-next").click();
    await expect(text.locator("tr[aria-current=true]")).toHaveCount(1);
    await expect(text.locator("tr[aria-current=true]").getByRole("rowheader")).toContainText("3");

    // Puntos de repetición: lista con el estado en texto y `aria-current` en el actual.
    const dots = page.getByRole("list", { name: "Repeticiones de esta vuelta" });
    await expect(dots.getByRole("listitem")).toHaveCount(12);
    await expect(dots.locator("li[aria-current=step]")).toHaveCount(1);
    await expect(dots.locator("li[aria-current=step]")).toContainText("repetición 1 (actual)");
    await page.getByTestId("knit-next-repeat").click();
    await expect(dots.locator("li[aria-current=step]")).toContainText("repetición 2 (actual)");
    await expect(dots.getByRole("listitem").first()).toContainText("repetición 1 (hecha)");
  });

  test("el interruptor de pantalla encendida es un switch enfocable aunque el navegador no lo soporte", async ({ page }) => {
    await createFromTemplate(page, unique("A11y pantalla"));
    await startFromStudio(page);
    const toggle = page.getByTestId("wake-lock-toggle");
    await expect(toggle).toHaveAttribute("role", "switch");
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAccessibleDescription(/pantalla/i);
    const box = (await toggle.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test("borrar un proyecto desde la lista y la ficha: el foco empieza en «Cancelar» y vuelve a «Borrar» al cancelar", async ({ page }) => {
    const title = unique("A11y borrar");
    await createFromTemplate(page, title);
    const projectId = await startFromStudio(page);
    await page.goto("/proyectos");
    const card = page.getByTestId("project-card").filter({ hasText: title });
    await card.getByRole("button", { name: `Borrar ${title}`, exact: true }).click();
    await expect(card.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await card.getByRole("button", { name: "Cancelar" }).click();
    await expect(card.getByRole("button", { name: `Borrar ${title}`, exact: true })).toBeFocused();

    await page.goto(`/proyectos/${projectId}`);
    await page.getByTestId("project-delete").click();
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByTestId("project-delete")).toBeFocused();
  });
});

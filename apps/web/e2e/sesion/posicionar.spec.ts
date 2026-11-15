import type { Page } from "@playwright/test";
import { caretToEnd, partText } from "../support/amigurumi.ts";
import { expect, expectSaved, stateFile, test } from "./support.ts";

/*
 * Posicionado y armado con sesión y WebGL (T16 de la fase 4; decisión 3; CA4-V3, CA4-V4). Cuenta: eva.
 * Posicionar una oreja tocando la cabeza en el 3D, girarla, guardar y recargar; el JSON de la base
 * (`layout.placements`) y "Dónde va cada pieza" dicen la misma vuelta (forma C-17). Después, agregar 4 vueltas a la
 * cabeza no mueve el ancla (CA4-V3).
 *
 * WebGL por software (SwiftShader), con los mismos flags que `webglLaunch` de playwright.config.ts (no se importa el
 * archivo de configuración desde una prueba). `launchOptions` es del trabajador: esta prueba corre en uno propio.
 */
test.use({
  storageState: stateFile("eva"),
  launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
});

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const UUID = /\/disenos\/([0-9a-f-]{36})$/;

/** Cabeza (con un rango V5-9) y oreja que se teje 2 veces: la forma canónica de `parsePart`. */
const sc = (count: number) => ({ type: "stitch", stitch: "sc", count });
const st = (stitch: string, count: number) => ({ type: "stitch", stitch, count });
const group = (times: number, ...items: unknown[]) => ({ type: "group", items, times });
const HEAD = {
  id: "cabeza",
  name: "Cabeza",
  construction: "spiral",
  start: { type: "magic_ring" },
  startYarn: "A",
  rounds: [
    { number: 1, items: [sc(6)], expected: 6 },
    { number: 2, items: [st("inc", 6)], expected: 12 },
    { number: 3, items: [group(6, sc(1), st("inc", 1))], expected: 18 },
    { number: 4, items: [group(6, sc(2), st("inc", 1))], expected: 24 },
    { number: 5, items: [sc(24)], through: 9, expected: 24 },
    { number: 10, items: [group(6, sc(2), st("dec", 1))], expected: 18 },
    { number: 11, items: [group(6, sc(1), st("dec", 1))], expected: 12 },
    { number: 12, items: [st("dec", 6)], expected: 6 },
  ],
};
const EAR = {
  id: "oreja",
  name: "Oreja",
  construction: "spiral",
  start: { type: "magic_ring" },
  startYarn: "A",
  rounds: [
    { number: 1, items: [sc(6)], expected: 6 },
    { number: 2, items: [st("inc", 6)], expected: 12 },
    { number: 3, items: [sc(12)], through: 4, expected: 12 },
  ],
  copies: 2,
};

type StoredPlacement = { target: { part: string; copy: number }; at: { type: string; host?: { part: string; copy: number }; round?: number; stitch?: number; attach?: string; rotationDeg?: number[]; offsetCm?: number } };
type StoredDoc = { parts: Array<{ id: string; rounds: unknown[] }>; layout?: { placements: StoredPlacement[] } };

async function createAmigurumi(page: Page, title: string): Promise<string> {
  await page.goto("/disenos/nuevo");
  await page.getByRole("radio", { name: /Amigurumi/ }).check();
  await page.getByLabel("Nombre del diseño", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Crear amigurumi" }).click();
  await page.waitForURL(UUID, { timeout: 20_000 });
  await expect(partText(page)).toBeVisible({ timeout: 20_000 });
  return UUID.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

const lienzo = (page: Page) => page.getByTestId("visor-3d-lienzo");

/**
 * En "Posicionar", con "Cosida a otra pieza" elegido, toca una grilla del lienzo hasta tocar la cabeza: la selección
 * del visor dice entonces "Cabeza: V7, punto 12" y el ancla queda ahí. Un toque en la otra oreja la cose a esa oreja
 * (el siguiente toque en la cabeza la corrige); uno en la misma oreja solo avisa. Devuelve la vuelta visible y el
 * punto (desde 1) del toque en la cabeza.
 */
async function touchHead(page: Page): Promise<{ round: number; stitch: number }> {
  await lienzo(page).scrollIntoViewIfNeeded();
  const box = (await lienzo(page).boundingBox())!;
  const column = (await page.locator("[data-column=view]").boundingBox())!;
  const top = Math.max(box.y, column.y) + 4;
  const bottom = Math.min(box.y + box.height, column.y + column.height) - 4;
  const fractions = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75];
  for (const fy of fractions) {
    for (const fx of fractions) {
      const y = box.y + box.height * fy;
      if (y < top || y > bottom) continue;
      await page.mouse.click(box.x + box.width * fx, y);
      const m = /^Cabeza: V(\d+), punto (\d+)$/.exec((await page.getByTestId("visor-3d-seleccion").innerText()).trim());
      if (m) return { round: Number(m[1]), stitch: Number(m[2]) };
    }
  }
  throw new Error("No se encontró la cabeza en el lienzo");
}

const whereItem = (page: Page, part: string, copy: number) => page.locator(`[data-testid=where-list] li[data-part="${part}"][data-copy="${copy}"]`);
const whereText = (round: number, last: number) =>
  round >= last ? `Oreja (1 de 2): se cose a la pieza «Cabeza», sobre la V${round}, la última, contando desde el anillo mágico.` : `Oreja (1 de 2): se cose a la pieza «Cabeza», entre la V${round} y la V${round + 1}, contando desde el anillo mágico.`;

test.describe("Posicionar con sesión (WebGL)", () => {
  test("posicionar una oreja tocando la cabeza, girarla, guardar y recargar; la base y «Dónde va cada pieza» coinciden", async ({ page, admin }) => {
    test.setTimeout(120_000);
    const id = await createAmigurumi(page, unique("Osito armado"));
    const { data: row } = await admin.from("patterns").select("document").eq("id", id).single();
    const seeded = { ...(row!.document as Record<string, unknown>), parts: [HEAD, EAR] };
    expect((await admin.from("patterns").update({ document: seeded }).eq("id", id)).error).toBeNull();

    await page.reload();
    await expect(partText(page)).toBeVisible({ timeout: 20_000 });
    await expect(lienzo(page)).toHaveAttribute("data-mode", "full", { timeout: 30_000 });
    // Sin posiciones: las tres piezas se acomodan solas, y se avisa.
    await expect(page.getByTestId("unplaced-warning")).toContainText("Cabeza, Oreja (1 de 2), Oreja (2 de 2)");

    await page.getByTestId("position-mode").click();
    await expect(page.getByTestId("position-mode")).toHaveAttribute("aria-pressed", "true");
    const panel = page.getByTestId("position-panel");
    await panel.getByTestId("position-target").selectOption({ label: "Oreja (1 de 2)" });
    await panel.getByTestId("position-mode-surface").check();
    await expect(lienzo(page)).toHaveAttribute("data-positioning", "true");
    const hit = await touchHead(page);

    // El ancla queda en la vuelta y el punto tocados (número visible y punto desde 1 en la interfaz).
    await expect(panel.getByTestId("position-round")).toHaveValue(String(hit.round));
    await expect(panel.getByTestId("position-stitch")).toHaveValue(String(hit.stitch));
    // La vista previa del ancla usa el marco de la malla del anfitrión: la misma vuelta y el mismo punto (0-based).
    await expect(lienzo(page)).toHaveAttribute("data-anchor", `${hit.round}:${hit.stitch - 1}`);
    await expect(page.getByTestId("unplaced-warning")).toContainText("Cabeza, Oreja (2 de 2)");
    await expect(page.getByTestId("unplaced-warning")).not.toContainText("Oreja (1 de 2)");

    // Girarla sobre la normal.
    await panel.getByTestId("position-rot-normal").fill("30");
    await panel.getByTestId("position-rot-normal").press("Enter");
    await expect(panel.getByTestId("position-rot-normal-range")).toHaveValue("30");

    const expected = whereText(hit.round, 12);
    await expect(whereItem(page, "oreja", 0)).toHaveText(expected);
    await expect(panel.getByTestId("position-where")).toContainText(expected);
    await expectSaved(page);

    const stored = async () => {
      const { data } = await admin.from("patterns").select("document").eq("id", id).single();
      return data!.document as StoredDoc;
    };
    const ear0 = (d: StoredDoc) => d.layout?.placements.find((p) => p.target.part === "oreja" && p.target.copy === 0);
    const placed = ear0(await stored());
    expect(placed).toEqual({
      target: { part: "oreja", copy: 0 },
      at: { type: "surface", host: { part: "cabeza", copy: 0 }, round: hit.round, stitch: hit.stitch - 1, attach: "end", rotationDeg: [30, 0, 0] },
    });
    // Lo que dice "Dónde va cada pieza" sale de la misma vuelta que guarda la base, sin distancia en puntos.
    expect(expected).toContain(`V${placed!.at.round}`);
    expect(expected).not.toMatch(/a \d+ puntos?|inicio de la vuelta/);

    await page.reload();
    await expect(partText(page)).toBeVisible({ timeout: 20_000 });
    await expect(lienzo(page)).toHaveAttribute("data-mode", "full", { timeout: 30_000 });
    await expect(whereItem(page, "oreja", 0)).toHaveText(expected);
    await page.getByTestId("position-mode").click();
    await panel.getByTestId("position-target").selectOption({ label: "Oreja (1 de 2)" });
    await expect(panel.getByTestId("position-round")).toHaveValue(String(hit.round));
    await expect(panel.getByTestId("position-stitch")).toHaveValue(String(hit.stitch));
    await expect(panel.getByTestId("position-rot-normal")).toHaveValue("30");
    await expect(lienzo(page)).toHaveAttribute("data-anchor", `${hit.round}:${hit.stitch - 1}`);

    // CA4-V3: 4 vueltas más en la cabeza no mueven el ancla (se guarda el número visible).
    await page.getByTestId("part-open").first().click();
    await caretToEnd(page);
    await page.keyboard.type("\nV13-16: 6 pb (6)");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "synced");
    await page.getByTestId("written-title").focus();
    await expectSaved(page);
    await expect.poll(async () => (await stored()).parts[0]!.rounds.length).toBe(9);
    expect(ear0(await stored())?.at).toMatchObject({ round: hit.round, stitch: hit.stitch - 1 });
    await expect(whereItem(page, "oreja", 0)).toHaveText(whereText(hit.round, 16));
    await expect(lienzo(page)).toHaveAttribute("data-anchor", `${hit.round}:${hit.stitch - 1}`);
  });
});

import type { Page } from "@playwright/test";
import { caretToEnd, lineMarker, partText, textLines, viewerMeasures } from "../support/amigurumi.ts";
import { expect, expectSaved, stateFile, test } from "./support.ts";

/*
 * Estudio amigurumi con sesión (T14 de la fase 4). Cuenta: dani.
 *  - crear un amigurumi, escribir vueltas, ver el error en su línea, corregirlo, ver que el 3D se actualiza, guardar,
 *    recargar (CA4-E1, CA4-E2, CA4-E4, CA4-E7);
 *  - líneas sin leer en el respaldo local, recuperadas al recargar y nunca en el documento (CA4-E9);
 *  - dialecto UK del perfil (`profiles.pattern_dialect`): escribe con `formatPart(part, "uk")` y lee con `es-uk`.
 */
test.use({ storageState: stateFile("dani") });

/** Clave del respaldo local (`backupKey` de `src/lib/studio/backup.ts`). */
const backupKey = (owner: string, id: string) => `loopitalab:${owner}:diseno:${id}`;
const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const UUID = /\/disenos\/([0-9a-f-]{36})$/;

async function createAmigurumi(page: Page, title: string): Promise<string> {
  await page.goto("/disenos/nuevo");
  await page.getByRole("radio", { name: /Amigurumi/ }).check();
  await page.getByLabel("Nombre del diseño", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Crear amigurumi" }).click();
  await page.waitForURL(UUID, { timeout: 20_000 });
  await expect(partText(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("written-title")).toHaveValue(title);
  return UUID.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

type StoredPart = { rounds: Array<{ number: number; items: unknown[]; note?: string }>; finish?: string };

test.describe("Estudio amigurumi con sesión", () => {
  test("crear, escribir vueltas, ver y corregir el error en la línea, ver el 3D, guardar y recargar", async ({ page, admin }) => {
    const id = await createAmigurumi(page, unique("Pelota"));
    // Límites recomendados desde el inicio (CA4-E12).
    await expect(page.getByTestId("scene-stitches")).toContainText("de 40.000 puntos recomendados en la escena");
    await expect(page.getByTestId("parts-limit")).toHaveText("1 de 20 partes recomendadas");
    const measures = await viewerMeasures(page);

    await caretToEnd(page);
    await page.keyboard.type("\nV2: aum x6 (12)\nV3: foo");
    const errorLine = (await textLines(page)).length;
    await expect.poll(() => lineMarker(page, errorLine)).toBe("error");
    await expect(page.getByTestId("read-errors")).toContainText(`Línea ${errorLine}, columna`);

    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("[pb, aum] x6 (18)\n> Coloca un marcador.\nCierre: rellenar y cerrar.\n> Deja una hebra larga.");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "synced");
    await expect.poll(() => lineMarker(page, errorLine)).toBeNull();
    await expect.poll(() => viewerMeasures(page)).not.toBe(measures);
    // Salir del texto: la última línea pasa a su forma canónica.
    await page.getByTestId("written-title").focus();
    await expect.poll(async () => (await textLines(page)).some((l) => l === "V2: 6 aum (12)")).toBe(true);

    await expectSaved(page);
    const { data } = await admin.from("patterns").select("document").eq("id", id).single();
    const part = (data!.document as { parts: StoredPart[] }).parts[0]!;
    expect(part.rounds.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(part.rounds[2]?.note).toBe("Coloca un marcador.");
    expect(part.finish).toBe("rellenar y cerrar.\nDeja una hebra larga.");

    await page.reload();
    await expect(partText(page)).toBeVisible({ timeout: 20_000 });
    // Las notas y el cierre de varias líneas sobreviven a guardar y recargar (CA4-E4).
    await expect(partText(page)).toHaveValue(/V2: 6 aum \(12\)\nV3: \[pb, aum\] x6 \(18\)\n> Coloca un marcador\.\nCierre: rellenar y cerrar\.\n> Deja una hebra larga\.$/);
    await expect(page.getByTestId("recovery-banner")).toHaveCount(0);
  });

  test("las líneas sin leer quedan en el respaldo local y se recuperan al recargar; nunca entran al documento (CA4-E9)", async ({ page, admin, accounts }) => {
    const id = await createAmigurumi(page, unique("Oruga"));
    await caretToEnd(page);
    await page.keyboard.type("\nV2: zzz");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "unread");
    await expect
      .poll(() => page.evaluate((k) => window.localStorage.getItem(k) ?? "", backupKey(accounts.dani.id, id)))
      .toContain("V2: zzz");
    const { data } = await admin.from("patterns").select("document").eq("id", id).single();
    expect(JSON.stringify(data!.document)).not.toContain("zzz");

    await page.reload();
    const banner = page.getByTestId("recovery-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("líneas sin leer");
    await banner.getByRole("button", { name: "Recuperar cambios" }).click();
    await expect(partText(page)).toHaveValue(/V2: zzz/);
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "unread");

    // Descartar las líneas sin leer las saca del respaldo.
    await page.getByTestId("discard-unread").click();
    await expect(partText(page)).not.toHaveValue(/zzz/);
    await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k) ?? "", backupKey(accounts.dani.id, id))).not.toContain("zzz");
  });

  test("dialecto UK del perfil: escribe R1 con dc, lee dc como punto bajo y nunca guarda el modo de lectura", async ({ page, admin, accounts }) => {
    const set = (d: string) => admin.from("profiles").update({ pattern_dialect: d }).eq("id", accounts.dani.id);
    expect((await set("uk")).error).toBeNull();
    try {
      const id = await createAmigurumi(page, unique("Bear UK"));
      await expect(page.getByTestId("dialect-line")).toHaveAttribute("data-dialect", "uk");
      expect(await textLines(page)).toContain("R1: 6 dc (6)");
      await caretToEnd(page);
      await page.keyboard.type("\nR2: inc x6 (12)\nR3: 12 dc (12)");
      await page.getByTestId("written-title").focus();
      await expectSaved(page);
      const { data } = await admin.from("patterns").select("document").eq("id", id).single();
      const doc = data!.document as { parts: StoredPart[] };
      expect(doc.parts[0]!.rounds[2]!.items).toEqual([{ type: "stitch", stitch: "sc", count: 12 }]);
      expect(JSON.stringify(doc)).not.toMatch(/es-uk|"mode"/);
      await page.reload();
      await expect(partText(page)).toHaveValue(/R2: 6 inc \(12\)\nR3: 12 dc \(12\)/);
    } finally {
      await set("es");
    }
  });
});

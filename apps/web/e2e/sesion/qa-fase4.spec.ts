import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { caretToEnd, partText } from "../support/amigurumi.ts";
import { genIdaVueltaOps, runOpsDirect, runOpsWithTabs } from "../support/ida-vuelta.ts";
import { contextAs, createFromTemplate, expect, expectSaved, stateFile, test, waitForStudio } from "./support.ts";

/*
 * QA de la fase 4 con sesión (T19, `qa-tester`):
 *  - CA4-P7 en `/disenos/[id]`: el estudio de colorwork con sesión no pide el fragmento de `three` (ana);
 *  - CA4-M2: un diseño v1 guardado en la base (escrito y gráfico) se abre, se guarda como v2 y sigue igual (ana); un
 *    proyecto con una versión fijada v1 abre "Tejiendo" con los mismos pasos que su gemelo v2 (fer);
 *  - CA4-E3 con el documento guardado: 20 o más cambios de pestaña texto ↔ bloques dan, en la base, el mismo
 *    documento que las mismas ediciones en una sola vista (dani);
 *  - recuperar un respaldo con líneas sin leer cuando la versión del servidor es más nueva (dani).
 * CA4-V3 (4 vueltas más en la cabeza no mueven el ancla) ya está en `posicionar.spec.ts`.
 */

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const UUID = /\/disenos\/([0-9a-f-]{36})$/;
const TEJER = /\/proyectos\/([0-9a-f-]{36})\/tejer$/;

type Doc = Record<string, unknown> & { id: string; title: string; schemaVersion: number; kind: string; technique: string; origin: { kind: string } };

async function createAmigurumi(page: Page, title: string): Promise<string> {
  await page.goto("/disenos/nuevo");
  await page.getByRole("radio", { name: /Amigurumi/ }).check();
  await page.getByLabel("Nombre del diseño", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Crear amigurumi" }).click();
  await page.waitForURL(UUID, { timeout: 20_000 });
  await expect(partText(page)).toBeVisible({ timeout: 20_000 });
  return UUID.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

async function storedDoc(admin: SupabaseClient, id: string): Promise<{ schema_version: number; document: Doc; updated_at: string }> {
  const { data, error } = await admin.from("patterns").select("schema_version, document, updated_at").eq("id", id).single();
  if (error) throw new Error(`patterns: ${error.code ?? error.message}`);
  return data as never;
}

/** Inserta con la clave secreta un diseño v1 (el documento v2 con `schemaVersion: 1`, que es lo que migra la v1). */
async function insertV1(admin: SupabaseClient, owner: string, v2: Doc, title: string): Promise<{ id: string; v1: Doc }> {
  const id = crypto.randomUUID();
  const v1: Doc = { ...structuredClone(v2), id, title, schemaVersion: 1 };
  const { error } = await admin.from("patterns").insert({ id, owner_id: owner, title, technique: v1.technique, kind: v1.kind, schema_version: 1, origin: v1.origin.kind, document: v1 });
  if (error) throw new Error(`insert v1: ${error.code ?? error.message}`);
  return { id, v1 };
}

test.describe("QA fase 4 con sesión: colorwork y migración (ana)", () => {
  test.use({ storageState: stateFile("ana") });

  test("CA4-P7: /disenos/[id] de un gráfico no pide el fragmento de three", async ({ page }) => {
    const id = await createFromTemplate(page, unique("Sin three"));
    const scripts: Array<{ url: string; body: Buffer }> = [];
    page.on("response", async (r) => {
      if (r.request().resourceType() !== "script" || !r.ok()) return;
      try {
        scripts.push({ url: r.url(), body: await r.body() });
      } catch {
        // Sin cuerpo (redirección o navegación interrumpida).
      }
    });
    await page.goto(`/disenos/${id}`);
    await waitForStudio(page);
    await page.waitForLoadState("networkidle");
    expect(scripts.length, "se observaron los scripts de la página").toBeGreaterThan(0);
    expect(scripts.filter((s) => s.body.includes("isWebGLRenderer")).map((s) => s.url), "fragmentos de three en el colorwork").toEqual([]);
  });

  test("CA4-M2: un amigurumi v1 de la base se abre, se guarda como v2 (schema_version = 2) y sigue igual", async ({ page, admin, accounts }) => {
    const source = await createAmigurumi(page, unique("Fuente v1"));
    await caretToEnd(page);
    await page.keyboard.type("\nV2: aum x6 (12)\n> coloca un marcador\nV3-5: 12 pb (12)\nCierre: rellenar\n> y cerrar");
    await page.getByTestId("written-title").focus();
    await expectSaved(page);
    const v2 = (await storedDoc(admin, source)).document;
    const title = unique("Escrito v1");
    const { id, v1 } = await insertV1(admin, accounts.ana.id, v2, title);
    expect((await storedDoc(admin, id)).schema_version).toBe(1);

    await page.goto(`/disenos/${id}`);
    await expect(partText(page)).toBeVisible({ timeout: 20_000 });
    await expect(partText(page)).toHaveValue(/V3-5: 12 pb \(12\)\nCierre: rellenar\n> y cerrar/);
    await expect(page.getByTestId("recovery-banner")).toHaveCount(0);
    const renamed = `${title} (v2)`;
    await page.getByTestId("written-title").fill(renamed);
    await expectSaved(page);
    const after = await storedDoc(admin, id);
    expect(after.schema_version).toBe(2);
    expect(after.document).toEqual({ ...v1, title: renamed, schemaVersion: 2 });
  });

  test("CA4-M2: un gráfico v1 de la base se abre, se guarda como v2 y sigue igual", async ({ page, admin, accounts }) => {
    const source = await createFromTemplate(page, unique("Gráfico fuente"));
    const v2 = (await storedDoc(admin, source)).document;
    const title = unique("Gráfico v1");
    const { id, v1 } = await insertV1(admin, accounts.ana.id, v2, title);
    await page.goto(`/disenos/${id}`);
    await waitForStudio(page);
    const renamed = `${title} (v2)`;
    await page.getByLabel("Nombre del diseño", { exact: true }).fill(renamed);
    await expectSaved(page);
    const after = await storedDoc(admin, id);
    expect(after.schema_version).toBe(2);
    expect(after.document).toEqual({ ...v1, title: renamed, schemaVersion: 2 });
  });
});

test.describe("QA fase 4 con sesión: proyecto con versión fijada v1 (fer)", () => {
  test.use({ storageState: stateFile("fer") });

  async function knitFromList(page: Page, title: string): Promise<string> {
    await page.goto("/disenos");
    await page.getByRole("button", { name: `Tejer ${title}`, exact: true }).click();
    await expect(page.getByTestId("knit-dialog").getByTestId("knit-preview")).toBeVisible();
    await page.getByTestId("knit-confirm").click();
    await page.waitForURL(TEJER, { timeout: 20_000 });
    await expect(page.getByTestId("knit-row-counter")).toBeVisible();
    return TEJER.exec(new URL(page.url()).pathname)?.[1] ?? "";
  }

  async function steps(page: Page): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < 4; i++) {
      out.push([await page.getByTestId("knit-row-counter").innerText(), await page.getByTestId("knit-row-side").innerText(), await page.getByTestId("knit-runs").innerText(), await page.getByTestId("knit-repeat").innerText()].join(" | "));
      await page.getByTestId("knit-next").click();
    }
    return out;
  }

  test("CA4-M2: Tejiendo de una versión fijada v1 da los mismos pasos que la del mismo diseño en v2", async ({ page, admin, accounts }) => {
    const twinTitle = unique("Gemelo v2");
    const twin = await createFromTemplate(page, twinTitle);
    const v2 = (await storedDoc(admin, twin)).document;
    const title = unique("Fijado v1");
    await insertV1(admin, accounts.fer.id, v2, title);

    const p1 = await knitFromList(page, title);
    const { data: proj } = await admin.from("projects").select("pattern_version_id").eq("id", p1).single();
    const { data: ver } = await admin.from("pattern_versions").select("document").eq("id", proj!.pattern_version_id as string).single();
    expect((ver!.document as Doc).schemaVersion, "la versión fijada es la v1 de la base").toBe(1);
    const fromV1 = await steps(page);

    await knitFromList(page, twinTitle);
    const fromV2 = await steps(page);
    expect(fromV1).toEqual(fromV2);
    expect(fromV1[0]).toContain("Vuelta 1 de 8");
  });
});

test.describe("QA fase 4 con sesión: estudio amigurumi (dani)", () => {
  test.use({ storageState: stateFile("dani") });

  test("CA4-E3 con el documento guardado: 20 o más cambios de pestaña dan en la base el mismo documento que una sola vista", async ({ page, admin, browser, watch }) => {
    test.setTimeout(180_000);
    const id = await createAmigurumi(page, unique("Ida y vuelta"));
    const ops = genIdaVueltaOps(424242, 14);
    const switches = await runOpsWithTabs(page, ops);
    expect(switches).toBeGreaterThanOrEqual(20);
    await page.getByTestId("written-title").focus();
    await expectSaved(page);
    const saved = (await storedDoc(admin, id)).document as unknown as { parts: Array<Record<string, unknown>> };

    // Las mismas ediciones en una sola vista, en otra pestaña (`/dev/amigurumi`, sin guardar).
    const { context, page: other } = await contextAs(browser, "dani", watch);
    try {
      await other.goto("/dev/amigurumi");
      await expect(partText(other)).toBeVisible();
      await runOpsDirect(other, ops);
      const direct = await other.evaluate(() => (window as unknown as { __loopitaAmigurumi: { store: { doc: { parts: Array<Record<string, unknown>> } } } }).__loopitaAmigurumi.store.doc);
      // El id y el nombre por omisión ("Parte 1" en /disenos/nuevo, "Cuerpo" en /dev/amigurumi) no vienen de las ediciones.
      const strip = (p: Record<string, unknown>) => ({ ...p, id: "x", name: "x" });
      expect(strip(saved.parts[0]!)).toEqual(strip(direct.parts[0]!));
    } finally {
      await context.close();
    }
  });

  test("respaldo con líneas sin leer cuando el servidor tiene una versión más nueva: avisa, recupera el texto y nunca guarda las líneas sin leer", async ({ page, admin, accounts }) => {
    const id = await createAmigurumi(page, unique("Respaldo"));
    await caretToEnd(page);
    await page.keyboard.type("\nV2: aum x6 (12)");
    await page.getByTestId("written-title").focus();
    await expectSaved(page);
    await caretToEnd(page);
    await page.keyboard.type("\nV3: zzz");
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "unread");
    const key = `loopitalab:${accounts.dani.id}:diseno:${id}`;
    await expect.poll(() => page.evaluate((k) => window.localStorage.getItem(k) ?? "", key)).toContain("V3: zzz");

    // Otro lugar guarda después (el título, con la clave secreta): el servidor queda más nuevo que el respaldo.
    const before = await storedDoc(admin, id);
    const otherTitle = `${before.document.title} (otro equipo)`;
    const { error } = await admin.from("patterns").update({ title: otherTitle, document: { ...before.document, title: otherTitle } }).eq("id", id);
    expect(error).toBeNull();
    expect((await storedDoc(admin, id)).updated_at).not.toBe(before.updated_at);

    await page.reload();
    const banner = page.getByTestId("recovery-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("el diseño se guardó después desde otro lugar");
    await expect(banner).toContainText("Incluye líneas sin leer en 1 parte.");
    await banner.getByRole("button", { name: "Recuperar cambios" }).click();
    await expect(partText(page)).toHaveValue(/V2: 6 aum \(12\)\nV3: zzz/);
    await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "unread");
    // Lo recuperado reemplaza la versión del otro lugar (lo advierte el aviso); las líneas sin leer no entran.
    await expectSaved(page, 15_000);
    const after = await storedDoc(admin, id);
    expect(after.document.title).toBe(before.document.title);
    expect(JSON.stringify(after.document)).not.toContain("zzz");
  });
});

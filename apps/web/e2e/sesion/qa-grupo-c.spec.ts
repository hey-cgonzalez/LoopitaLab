import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chartGeom, clickCell, focusChart } from "../support/estudio.ts";
import { createFromTemplate, expect, expectSaved, saveStatus, stateFile, storedPattern, test } from "./support.ts";

/*
 * QA del grupo C de la fase 3 (T8 a T10) con sesión. Cuenta: eva (aparte: el tope de 500 llena su lista).
 *  - Tope de 500 lanas guardadas (CA3-L8): 499 filas insertadas con el cliente admin LOCAL; la 500 se crea desde la
 *    interfaz y la 501 recibe el mensaje claro, sin escribir nada.
 *  - Nota de más de 200 caracteres: la interfaz la frena y la base no cambia.
 *  - "Colores planos" se recuerda en `localStorage` y NUNCA llega al documento ni dispara el autoguardado.
 *  - Autoguardado CA-F6 repetido 5 veces: tiempos registrados como adjunto `autoguardado-5x.json`.
 */
test.use({ storageState: stateFile("eva") });
test.describe.configure({ mode: "serial" });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;

async function yarnCount(admin: SupabaseClient, owner: string): Promise<number> {
  const { count, error } = await admin.from("user_yarns").select("id", { count: "exact", head: true }).eq("owner_id", owner);
  if (error) throw new Error(`user_yarns: ${error.code ?? error.message}`);
  return count ?? 0;
}

/** Llena el formulario "Nueva lana" con lo mínimo válido (aran, 100 % lana, color personalizado). */
async function fillNewYarn(page: Page, hex: string, note?: string) {
  await page.getByRole("button", { name: "Nueva lana" }).click();
  const form = page.getByRole("form", { name: "Nueva lana" });
  await form.getByLabel("Buscar por nombre").fill("aran");
  await form.getByRole("button", { name: /Medio/ }).click();
  await form.getByLabel("Color personalizado (#RRGGBB)").fill(hex);
  if (note !== undefined) await form.getByLabel("Nota privada (opcional)").fill(note);
  return form;
}

test.describe("QA grupo C con sesión", () => {
  test("tope de 500 lanas: la 500 entra desde la interfaz y la 501 recibe un mensaje claro sin escribir", async ({ page, admin, accounts }) => {
    test.setTimeout(120_000);
    const owner = accounts.eva.id;
    await admin.from("user_yarns").delete().eq("owner_id", owner);
    const rows = Array.from({ length: 499 }, (_, i) => ({
      owner_id: owner,
      weight: 4,
      composition: [{ fiber: "lana", percent: 100 }],
      color_hex: `#${(0x100000 + i).toString(16).toUpperCase()}`,
      palette_id: null,
      note: `relleno ${i}`,
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await admin.from("user_yarns").insert(rows.slice(i, i + 100));
      expect(error, "sembrar 499 lanas").toBeNull();
    }
    expect(await yarnCount(admin, owner)).toBe(499);

    await page.goto("/lanas");
    await expect(page.getByTestId("yarn-count")).toContainText("499 de 500");

    const form = await fillNewYarn(page, "#0A0B0C", "la quinientos");
    await form.getByRole("button", { name: "Guardar lana" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Guardaste la lana" })).toBeVisible();
    await expect(page.getByTestId("yarn-count")).toContainText("500 de 500");
    expect(await yarnCount(admin, owner)).toBe(500);

    const again = await fillNewYarn(page, "#0D0E0F", "la quinientos uno");
    await again.getByRole("button", { name: "Guardar lana" }).click();
    await expect(page.getByText("Llegaste al tope de 500 lanas guardadas. Borra alguna que ya no uses para guardar otra.")).toBeVisible();
    // Sin el texto de la base (nombres de funciones o restricciones).
    await expect(page.locator("body")).not.toContainText(/user_yarns|quota|54000/);
    expect(await yarnCount(admin, owner)).toBe(500);
    const { data } = await admin.from("user_yarns").select("id").eq("owner_id", owner).eq("note", "la quinientos uno");
    expect(data ?? []).toHaveLength(0);
  });

  test("nota de más de 200 caracteres: la interfaz la frena y la base no cambia; 200 justos entra", async ({ page, admin, accounts }) => {
    const owner = accounts.eva.id;
    await admin.from("user_yarns").delete().eq("owner_id", owner);
    await page.goto("/lanas");
    const form = await fillNewYarn(page, "#102030", "x".repeat(201));
    await expect(form.getByText("201 de 200 caracteres")).toBeVisible();
    await form.getByRole("button", { name: "Guardar lana" }).click();
    await expect(form.getByText("La nota tiene 201 caracteres y el máximo es 200. Acórtala.")).toBeVisible();
    await expect(form.getByLabel("Nota privada (opcional)")).toHaveAttribute("aria-invalid", "true");
    expect(await yarnCount(admin, owner)).toBe(0);

    await form.getByLabel("Nota privada (opcional)").fill("y".repeat(200));
    await form.getByRole("button", { name: "Guardar lana" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Guardaste la lana" })).toBeVisible();
    const { data } = await admin.from("user_yarns").select("note").eq("owner_id", owner);
    expect(data?.[0]?.note).toHaveLength(200);
  });

  test("Colores planos: se recuerda en localStorage, nunca entra al documento ni dispara el autoguardado", async ({ page, admin }) => {
    const id = await createFromTemplate(page, unique("Colores planos"));
    const before = await storedPattern(admin, id);
    expect(before).not.toBeNull();
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"] !== undefined) posts.push(r.url());
    });

    await page.getByTestId("flat-colors").click();
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => localStorage.getItem("loopita:vista:colores-planos"))).toBe("1");
    // Más que el retardo del autoguardado (≤ 2 s, CA-F6): no se envía nada.
    await page.waitForTimeout(3_000);
    expect(posts, "Colores planos no dispara el autoguardado").toEqual([]);
    await expect(saveStatus(page)).toHaveAttribute("data-save-status", "saved");
    const after = await storedPattern(admin, id);
    expect(after?.updated_at, "la fila del diseño no se tocó").toBe(before?.updated_at);
    expect(JSON.stringify(after?.document)).toBe(JSON.stringify(before?.document));
    // Ninguna clave nueva en el documento (el título lleva "Colores planos" a propósito: se excluye).
    const { title: _title, ...rest } = (after?.document ?? {}) as Record<string, unknown>;
    expect(JSON.stringify(rest)).not.toMatch(/flat|plan[oa]s|fiberEffects/i);

    await page.reload();
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("flat-colors").click();
    await expect(page.getByTestId("flat-colors")).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("loopita:vista:colores-planos"))).toBe("0");
    expect((await storedPattern(admin, id))?.updated_at).toBe(before?.updated_at);
  });

  test("autoguardado CA-F6 repetido 5 veces: envío ≤ 2 s cada vez; tiempos registrados", async ({ page, admin }, testInfo) => {
    test.setTimeout(120_000);
    const id = await createFromTemplate(page, unique("Autoguardado 5x"));
    const g = await chartGeom(page);
    const samples: { i: number; sentMs: number; savedMs: number; cell: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const value = i % 2 === 0 ? 1 : 0; // B, A, B, A, B en la esquina: cada vez es un cambio real
      const action = page.waitForRequest((r) => r.method() === "POST" && r.headers()["next-action"] !== undefined, { timeout: 6_000 });
      await focusChart(page);
      await page.keyboard.press(String(value + 1));
      const t0 = Date.now();
      await clickCell(page, g, [0, 0]);
      await action;
      const sentMs = Date.now() - t0;
      await expectSaved(page, 6_000);
      const savedMs = Date.now() - t0;
      await expect.poll(async () => (await storedPattern(admin, id))?.document.chart.cells[0]).toBe(value);
      samples.push({ i: i + 1, sentMs, savedMs, cell: value });
    }
    const sent = samples.map((s) => s.sentMs);
    const summary = { samples, sentMin: Math.min(...sent), sentMax: Math.max(...sent), spread: Math.max(...sent) - Math.min(...sent) };
    console.log(`[autoguardado-5x] ${JSON.stringify(summary)}`);
    await testInfo.attach("autoguardado-5x.json", { body: JSON.stringify(summary, null, 2), contentType: "application/json" });
    for (const s of samples) expect(s.sentMs, `muestra ${s.i}: enviado a los ${s.sentMs} ms (tope CA-F6: 2 s)`).toBeLessThanOrEqual(2_000);
  });
});

import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chartGeom, clickCell, focusChart } from "../support/estudio.ts";
import { contextAs, createFromTemplate, expect, expectSaved, openDesignSection, saveStatus, stateFile, test, waitForStudio } from "./support.ts";

/*
 * QA final de la fase 3 (T16): huecos de cobertura de T12 en la pantalla "Tejiendo". Cuenta: fer.
 *  - CA3-T7: corte de red de verdad (`context.setOffline(true)`): se sigue avanzando, el estado lo dice, nada llega a
 *    la base, el avance queda en `localStorage` bajo la clave de la usuaria y al volver la red se guarda y se borra.
 *  - CA3-T6: `VERSION_CHANGED` en la interfaz: otro contexto pasa el proyecto a la versión nueva mientras se teje.
 *  - Relectura al volver a la pantalla (`visibilitychange`): adopta el avance de otro dispositivo y lo avisa.
 *  - CA3-T10: Wake Lock con `navigator.wakeLock` simulado: se pide al entrar, se vuelve a pedir al volver de segundo
 *    plano, se suelta al apagar el interruptor y al salir, y no se pide si la preferencia guardada es "apagada".
 * La plantilla "Banda en tubo" es un motivo de 8 × 8 repetido 12 veces, en redondo: 8 vueltas.
 */
test.use({ storageState: stateFile("fer") });

const unique = (base: string) => `${base} ${Date.now().toString(36)}`;
const TEJER = /\/proyectos\/([0-9a-f-]{36})\/tejer$/;
const counter = (page: Page) => page.getByTestId("knit-row-counter");
const progressStatus = (page: Page) => page.locator("[data-progress-status]");
const expectProgress = (page: Page, kind: string, timeout = 15_000) => expect(progressStatus(page)).toHaveAttribute("data-progress-status", kind, { timeout });

async function storedRound(admin: SupabaseClient, projectId: string): Promise<number | null> {
  const { data, error } = await admin.from("project_progress").select("round_number").eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`project_progress: ${error.code ?? error.message}`);
  return (data?.round_number as number | undefined) ?? null;
}

async function pinnedVersion(admin: SupabaseClient, projectId: string): Promise<string | null> {
  const { data, error } = await admin.from("projects").select("pattern_version_id").eq("id", projectId).single();
  if (error) throw new Error(`projects: ${error.code ?? error.message}`);
  return (data?.pattern_version_id as string | null) ?? null;
}

async function startFromStudio(page: Page): Promise<string> {
  await openDesignSection(page);
  await page.getByTestId("knit-from-studio").getByRole("button", { name: "Tejer este diseño" }).click();
  await expect(page.getByTestId("knit-dialog").getByTestId("knit-preview")).toBeVisible();
  await page.getByTestId("knit-dialog").getByTestId("knit-confirm").click();
  await page.waitForURL(TEJER, { timeout: 20_000 });
  await expect(counter(page)).toBeVisible();
  return TEJER.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

/** Simula que la pestaña pasa a segundo plano o vuelve (Chromium sin interfaz nunca la oculta de verdad). */
async function setVisibility(page: Page, state: "hidden" | "visible"): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => s === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test.describe("Tejiendo sin conexión (CA3-T7)", () => {
  // El corte de red deja en la consola el error del `fetch` de la Server Action: es lo esperado en esta prueba.
  test.use({ allowConsole: [/ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource|NetworkError|fetch failed/i] });

  test("con la red cortada se sigue avanzando, el estado lo dice, nada se pierde y al volver la red llega a la base", async ({ page, context, admin, accounts }) => {
    await createFromTemplate(page, unique("Sin red"));
    const projectId = await startFromStudio(page);
    const key = `loopitalab:${accounts.fer.id}:avance:${projectId}`;
    await page.getByTestId("knit-next").click();
    await expectProgress(page, "saved");
    await expect.poll(() => storedRound(admin, projectId)).toBe(2);
    expect(await page.evaluate((k) => localStorage.getItem(k), key), "confirmado por el servidor: no queda copia local").toBeNull();

    await context.setOffline(true);
    // Avanzar sigue funcionando al instante, con teclado y con botones.
    await page.getByTestId("knit-next").click();
    await expect(counter(page)).toHaveText("Vuelta 3 de 8");
    await page.keyboard.press("PageDown");
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");
    await expect(page.getByTestId("knit-chart")).toHaveAttribute("data-highlight-row", "3");

    // El estado lo dice (indicador visible, no solo color) y anuncia el reintento.
    await expectProgress(page, "offline");
    await expect(progressStatus(page)).toContainText("Sin conexión: tu avance se guardará al volver");
    await expect(progressStatus(page)).toContainText(/Reintentando en \d+ s\./);

    // Nada llegó a la base; el avance pendiente está en localStorage bajo la clave de la usuaria, solo con números e ids.
    expect(await storedRound(admin, projectId), "la base sigue en la vuelta 2").toBe(2);
    const raw = await page.evaluate((k) => localStorage.getItem(k), key);
    expect(raw, "avance local pendiente").not.toBeNull();
    const entry = JSON.parse(raw!) as Record<string, unknown>;
    expect(entry).toMatchObject({ v: 1, ownerId: accounts.fer.id, projectId, pointer: { rowsDone: 3, stitchesDone: 0 } });
    expect(Object.keys(entry).sort()).toEqual(["baseUpdatedAt", "ownerId", "pointer", "projectId", "savedAt", "v", "versionId"]);

    // Se sigue tejiendo sin red: retroceder y avanzar; el estado no pasa a "guardado" por error.
    await page.getByTestId("knit-prev").click();
    await expect(counter(page)).toHaveText("Vuelta 3 de 8");
    for (let k = 0; k < 3; k++) await page.getByTestId("knit-next").click();
    await expect(counter(page)).toHaveText("Vuelta 6 de 8");
    await expectProgress(page, "offline");
    expect(await storedRound(admin, projectId)).toBe(2);

    // Vuelve la red: el avance llega a la base (solo el último puntero), el estado vuelve a "guardado" y la copia local se borra.
    await context.setOffline(false);
    await expectProgress(page, "saved", 40_000);
    await expect.poll(() => storedRound(admin, projectId)).toBe(6);
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    await expect(page.getByTestId("progress-conflict"), "un mismo dispositivo no entra en conflicto consigo mismo").toHaveCount(0);

    // Y sobrevive a recargar.
    await page.reload();
    await expect(counter(page)).toHaveText("Vuelta 6 de 8");
  });
});

test.describe("Tejiendo con otro dispositivo (CA3-T6)", () => {
  test("VERSION_CHANGED: si otro contexto pasa el proyecto a la versión nueva, este avisa, no escribe y recarga", async ({ page, browser, admin, watch }) => {
    const title = unique("Cambio de versión");
    const patternId = await createFromTemplate(page, title);
    const projectId = await startFromStudio(page);
    await page.getByTestId("knit-next").click();
    await page.getByTestId("knit-next").click();
    await expectProgress(page, "saved");
    await expect.poll(() => storedRound(admin, projectId)).toBe(3);
    const before = await pinnedVersion(admin, projectId);

    // Otro dispositivo (misma cuenta): edita el diseño y pasa el proyecto a la versión actual.
    const { context: otherContext, page: other } = await contextAs(browser, "fer", watch);
    await other.goto(`/disenos/${patternId}`);
    await waitForStudio(other);
    const g = await chartGeom(other);
    await focusChart(other);
    await other.keyboard.press("2");
    await clickCell(other, g, [0, 6]);
    await expect(saveStatus(other)).not.toHaveAttribute("data-save-status", "saved");
    await expectSaved(other);
    await other.goto(`/proyectos/${projectId}`);
    await other.getByTestId("repin-open").click();
    await other.getByTestId("repin-confirm").click();
    await expect(other.getByTestId("repin-done")).toHaveText("Listo: el proyecto ahora sigue la versión 2.");
    const after = await pinnedVersion(admin, projectId);
    expect(after).not.toBe(before);
    expect(await storedRound(admin, projectId)).toBe(3);

    // Este dispositivo sigue con el plan viejo: al avanzar, el servidor responde VERSION_CHANGED.
    await page.getByTestId("knit-next").click();
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");
    await expectProgress(page, "version-changed");
    const alert = page.getByRole("alert").filter({ hasText: "cambió de versión" });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("button", { name: "Recargar" })).toBeVisible();
    expect(await storedRound(admin, projectId), "el puntero del plan viejo no se escribió").toBe(3);
    expect(await pinnedVersion(admin, projectId)).toBe(after);

    // Mientras no recargue, el teclado no avanza y los toques no escriben nada.
    await page.getByRole("heading", { level: 1 }).click();
    await page.keyboard.press("ArrowRight");
    await expect(counter(page)).toHaveText("Vuelta 4 de 8");
    await page.getByTestId("knit-next").click();
    await page.waitForTimeout(1500); // más que la pausa de envío (800 ms)
    expect(await storedRound(admin, projectId), "sigue sin escribir").toBe(3);
    await expectProgress(page, "version-changed");

    // Recargar: versión nueva, con el avance que tiene el servidor (no el optimista del plan viejo).
    await alert.getByRole("button", { name: "Recargar" }).click();
    await expect(counter(page)).toHaveText("Vuelta 3 de 8");
    await expectProgress(page, "saved");
    await expect(page.getByRole("alert").filter({ hasText: "cambió de versión" })).toHaveCount(0);
    await page.getByTestId("knit-next").click();
    await expectProgress(page, "saved");
    await expect.poll(() => storedRound(admin, projectId)).toBe(4);
    await otherContext.close();
  });

  test("al volver a la pantalla se relee el avance: adopta el del otro dispositivo y lo avisa, sin conflicto", async ({ page, browser, admin, watch }) => {
    await createFromTemplate(page, unique("Relectura"));
    const projectId = await startFromStudio(page);
    await expect(counter(page)).toHaveText("Vuelta 1 de 8");

    // La pestaña pasa a segundo plano sin nada pendiente.
    await setVisibility(page, "hidden");

    // Otro dispositivo avanza a la vuelta 5.
    const { context: otherContext, page: other } = await contextAs(browser, "fer", watch);
    await other.goto(`/proyectos/${projectId}/tejer`);
    for (let k = 0; k < 4; k++) await other.getByTestId("knit-next").click();
    await expectProgress(other, "saved");
    await expect.poll(() => storedRound(admin, projectId)).toBe(5);
    await otherContext.close();
    await expect(counter(page), "en segundo plano no cambia nada").toHaveText("Vuelta 1 de 8");

    // Al volver: se relee, se adopta y se avisa con la posición.
    await setVisibility(page, "visible");
    await expect(counter(page)).toHaveText("Vuelta 5 de 8", { timeout: 10_000 });
    await expect(page.getByTestId("knit-notice")).toHaveText("Se actualizó desde otro dispositivo: vas en la vuelta 5.");
    await expect(page.getByTestId("knit-chart")).toHaveAttribute("data-highlight-row", "4");
    await expect(page.getByTestId("progress-conflict")).toHaveCount(0);

    // Seguir desde ahí no choca: la relectura trajo también el `updated_at` del servidor.
    await page.getByTestId("knit-next").click();
    await expectProgress(page, "saved");
    await expect.poll(() => storedRound(admin, projectId)).toBe(6);
    await expect(page.getByTestId("progress-conflict")).toHaveCount(0);

    // Volver sin cambios en el servidor no avisa ni mueve nada.
    await page.reload();
    await expect(counter(page)).toHaveText("Vuelta 6 de 8");
    await setVisibility(page, "hidden");
    await setVisibility(page, "visible");
    await page.waitForTimeout(1500);
    await expect(counter(page)).toHaveText("Vuelta 6 de 8");
    await expect(page.getByTestId("knit-notice")).toHaveCount(0);
  });

  test("al ocultarse la pantalla el avance pendiente se envía de inmediato (sin esperar la pausa)", async ({ page, admin }) => {
    await createFromTemplate(page, unique("Ocultar"));
    const projectId = await startFromStudio(page);
    await page.getByTestId("knit-next").click();
    await setVisibility(page, "hidden"); // dentro de los 800 ms de pausa
    await expect.poll(() => storedRound(admin, projectId), { timeout: 5_000 }).toBe(2);
    await expectProgress(page, "saved");
  });
});

/** `navigator.wakeLock` simulado: cuenta pedidos y bloqueos activos; resuelve en otra tarea, como la API real. */
function mockWakeLock() {
  interface Sentinel {
    released: boolean;
    release(): Promise<void>;
    addEventListener(type: string, cb: () => void): void;
    fire(): void;
  }
  const state = { requests: 0, types: [] as string[], sentinels: [] as Sentinel[], fail: false };
  const api = {
    request(type: string): Promise<Sentinel> {
      state.requests += 1;
      state.types.push(type);
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (state.fail) return reject(new DOMException("NotAllowedError", "NotAllowedError"));
          const cbs: (() => void)[] = [];
          const s: Sentinel = {
            released: false,
            release() {
              s.fire();
              return Promise.resolve();
            },
            addEventListener(t, cb) {
              if (t === "release") cbs.push(cb);
            },
            fire() {
              if (s.released) return;
              s.released = true;
              for (const cb of cbs) cb();
            },
          };
          state.sentinels.push(s);
          resolve(s);
        }, 30);
      });
    },
  };
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: api });
  (window as unknown as { __wl: unknown }).__wl = {
    get requests() {
      return state.requests;
    },
    get types() {
      return state.types;
    },
    get active() {
      return state.sentinels.filter((s) => !s.released).length;
    },
    /** Lo que hace el navegador al ocultarse la pestaña: suelta los bloqueos y avisa con `release`. */
    systemRelease() {
      for (const s of state.sentinels) s.fire();
    },
    set fail(v: boolean) {
      state.fail = v;
    },
  };
}
type WL = { requests: number; types: string[]; active: number; systemRelease(): void; fail: boolean };
const wl = (page: Page) => page.evaluate(() => {
  const w = (window as unknown as { __wl: WL }).__wl;
  return { requests: w.requests, active: w.active, types: w.types };
});

test.describe("Pantalla encendida (CA3-T10, Wake Lock simulado)", () => {
  test("se pide al entrar, se vuelve a pedir al volver de segundo plano, y se suelta al apagar el interruptor y al salir", async ({ page }) => {
    await page.addInitScript(mockWakeLock);
    await createFromTemplate(page, unique("Wake"));
    expect((await wl(page)).requests, "el estudio no pide el bloqueo").toBe(0);
    const projectId = await startFromStudio(page);
    const toggle = page.getByTestId("wake-lock-toggle");

    // Al mostrar "Tejiendo": un pedido, de pantalla, y un bloqueo activo.
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await wl(page)).active).toBe(1);
    expect(await wl(page)).toMatchObject({ requests: 1, types: ["screen"] });
    await expect(page.getByTestId("wake-lock-failed")).toHaveCount(0);

    // Avanzar no vuelve a pedirlo.
    await page.getByTestId("knit-next").click();
    await page.getByTestId("knit-next").click();
    expect((await wl(page)).requests).toBe(1);

    // Segundo plano: el navegador suelta el bloqueo. Mientras está oculta no se pide.
    await page.evaluate(() => (window as unknown as { __wl: WL }).__wl.systemRelease());
    await setVisibility(page, "hidden");
    await page.waitForTimeout(300);
    expect(await wl(page)).toMatchObject({ requests: 1, active: 0 });

    // Al volver: se vuelve a pedir, una sola vez.
    await setVisibility(page, "visible");
    await expect.poll(async () => (await wl(page)).active).toBe(1);
    expect((await wl(page)).requests).toBe(2);
    // Un segundo `visibilitychange` con el bloqueo vigente no lo duplica.
    await setVisibility(page, "visible");
    await page.waitForTimeout(300);
    expect(await wl(page)).toMatchObject({ requests: 2, active: 1 });

    // Apagar el interruptor: se suelta y se recuerda. Encender: se pide otra vez.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => (await wl(page)).active).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem("loopitalab:tejiendo:pantalla"))).toBe("0");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await wl(page)).active).toBe(1);
    expect((await wl(page)).requests).toBe(3);

    // Salir de "Tejiendo" (navegación dentro de la aplicación): se suelta.
    await page.getByRole("link", { name: "← Proyecto" }).click();
    await page.waitForURL(`**/proyectos/${projectId}`);
    await expect.poll(async () => (await wl(page)).active).toBe(0);
  });

  /*
   * Dos fallas conocidas de KnitScreen.tsx (docs/qa-fase-3.md, BUG-QA3-1 y BUG-QA3-2). Las pruebas describen el
   * comportamiento correcto y van marcadas `test.fail`: pasan mientras la falla exista y se ponen en rojo cuando se
   * corrija. Al corregir, quitar la marca `test.fail` de cada una.
   */
  test("BUG-QA3-1: con el interruptor apagado, volver de segundo plano no vuelve a pedir el bloqueo", async ({ page }) => {
    test.fail(true, "BUG-QA3-1: `onVisibility` usa el `reacquire` del primer render (wakeOn = true); ver docs/qa-fase-3.md");
    await page.addInitScript(mockWakeLock);
    await createFromTemplate(page, unique("Wake vuelve"));
    await startFromStudio(page);
    const toggle = page.getByTestId("wake-lock-toggle");
    await expect.poll(async () => (await wl(page)).active).toBe(1);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect.poll(async () => (await wl(page)).active).toBe(0);
    const before = (await wl(page)).requests;
    await setVisibility(page, "hidden");
    await setVisibility(page, "visible");
    await page.waitForTimeout(500); // más que la demora del pedido simulado
    expect(await wl(page), "interruptor apagado: ni pedidos nuevos ni bloqueo activo").toMatchObject({ requests: before, active: 0 });
  });

  test("BUG-QA3-2: con la preferencia apagada, entrar a Tejiendo no deja la pantalla bloqueada", async ({ page }) => {
    test.fail(true, "BUG-QA3-2: el pedido del primer render se resuelve después de leer la preferencia y nadie lo suelta; ver docs/qa-fase-3.md");
    await page.addInitScript(mockWakeLock);
    await createFromTemplate(page, unique("Wake apagado"));
    const projectId = await startFromStudio(page);
    await page.evaluate(() => localStorage.setItem("loopitalab:tejiendo:pantalla", "0"));
    await page.goto(`/proyectos/${projectId}/tejer`);
    await expect(page.getByTestId("wake-lock-toggle")).toHaveAttribute("aria-checked", "false");
    await page.waitForTimeout(500); // más que la demora del pedido simulado
    expect((await wl(page)).active, "interruptor apagado: ningún bloqueo activo").toBe(0);
  });

  test("si el navegador rechaza el bloqueo, se avisa y la pantalla sigue funcionando", async ({ page }) => {
    await page.addInitScript(mockWakeLock);
    await page.addInitScript(() => {
      (window as unknown as { __wl: WL }).__wl.fail = true;
    });
    await createFromTemplate(page, unique("Wake rechazo"));
    await startFromStudio(page);
    await expect(page.getByTestId("wake-lock-failed")).toHaveText("No se pudo mantener la pantalla encendida. Puede apagarse sola mientras tejes.");
    await page.getByTestId("knit-next").click();
    await expect(counter(page)).toHaveText("Vuelta 2 de 8");
    // Apagar el interruptor quita el aviso.
    await page.getByTestId("wake-lock-toggle").click();
    await expect(page.getByTestId("wake-lock-failed")).toHaveCount(0);
  });
});

test.describe("Latencia en Tejiendo (CA3-P3)", () => {
  const BUDGET_MS = Number(process.env.E2E_LATENCY_BUDGET_MS ?? 100);
  const CPU_RATE = Number(process.env.E2E_CPU_RATE ?? 1);

  test(`row-to-paint en la pantalla real: 50 avances de fila bajo ${BUDGET_MS} ms (p95)`, async ({ page }, info) => {
    test.setTimeout(CPU_RATE > 1 ? 240_000 : 90_000);
    await createFromTemplate(page, unique("Latencia fila"));
    await startFromStudio(page);
    await expect(page.getByTestId("preview-canvas")).toBeVisible();
    if (CPU_RATE > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    }
    await page.waitForTimeout(500);
    // Del clic a dos frames pintados (cuadrícula y vista previa): 7 avances y 7 retrocesos, repetidos; 50 avances medidos.
    const times = await page.evaluate(async () => {
      const next = document.querySelector<HTMLButtonElement>("[data-testid=knit-next]")!;
      const prev = document.querySelector<HTMLButtonElement>("[data-testid=knit-prev]")!;
      const chart = document.querySelector<HTMLElement>("[data-testid=knit-chart]")!;
      const frames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const out: number[] = [];
      let wrong = 0;
      let row = Number(chart.dataset.highlightRow);
      let dir = 1;
      while (out.length < 50) {
        if (row >= 7) dir = -1;
        if (row <= 0) dir = 1;
        const t0 = performance.now();
        (dir === 1 ? next : prev).click();
        await frames();
        const dt = performance.now() - t0;
        row += dir;
        if (Number(chart.dataset.highlightRow) !== row) wrong++;
        if (dir === 1) out.push(dt);
        await pause(60 + (out.length % 5) * 30);
      }
      return { times: out.sort((a, b) => a - b), wrong };
    });
    const at = (q: number) => times.times[Math.min(times.times.length - 1, Math.ceil(times.times.length * q) - 1)] ?? Infinity;
    const result = { escenario: "tejiendo-banda-en-tubo", umbralMs: BUDGET_MS, cpu: CPU_RATE, fila: { n: times.times.length, p50: Math.round(at(0.5) * 10) / 10, p95: Math.round(at(0.95) * 10) / 10, max: Math.round(at(1) * 10) / 10 } };
    console.log(`[latencia] ${JSON.stringify(result)}`);
    await info.attach("latencia-tejiendo.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    info.annotations.push({ type: "latencia", description: `row-to-paint en Tejiendo: p95 ${result.fila.p95} ms (n ${result.fila.n}), umbral ${BUDGET_MS} ms, CPU ×${CPU_RATE}` });
    expect(times.wrong, "la fila resaltada de la cuadrícula siguió cada toque").toBe(0);
    expect(times.times.length).toBe(50);
    expect.soft(at(0.95), "CA3-P3: p95 de row-to-paint en Tejiendo").toBeLessThan(BUDGET_MS);
  });
});

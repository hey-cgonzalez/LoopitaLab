import { expect, type Page } from "@playwright/test";
import { caretToEnd, partText } from "./amigurumi.ts";

/*
 * Ida y vuelta texto ↔ bloques (CA4-E3; T19 de la fase 4). Genera, con semilla, una secuencia de ediciones sobre la
 * V1 (bloques: cantidad, punto, agrupar, insertar una vuelta después) y vueltas nuevas al final escritas en el texto
 * con sintaxis variada (alias US, cantidad después del punto, grupos, notas, rangos y hebra trasera).
 *  - `runOpsWithTabs`: cada edición en su vista, cambiando de pestaña dos veces antes de cada una;
 *  - `runOpsDirect`: las mismas ediciones sin salir de la vista de texto (los bloques, como operaciones del almacén).
 * Los dos deben dejar el mismo documento.
 */

export type Op =
  | { kind: "count"; v: number }
  | { kind: "insert"; produced: number }
  | { kind: "wrap" }
  | { kind: "stitch"; v: string }
  | { kind: "text"; text: string };

type Hook = { store: { doc: { parts: Array<{ id: string; rounds: Array<{ items: unknown[] }> }> }; run(a: unknown): { changed: boolean } } };

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genIdaVueltaOps(seed: number, n = 12): Op[] {
  const next = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(next() * (b - a + 1));
  const ops: Op[] = [];
  let concrete = 1;
  const m = { s: "sc", c: 6, t: 2, g: false };
  const produced = () => (m.g ? m.t : 1) * m.c * (m.s === "inc" ? 2 : 1);
  const TEXT: Array<(k: number, n: number) => { line: string; rounds: number }> = [
    (k, n) => ({ line: `V${n}: ${k} pb`, rounds: 1 }),
    (k, n) => ({ line: `V${n}: pb ${k}`, rounds: 1 }),
    (k, n) => ({ line: `V${n}: ${k} sc`, rounds: 1 }),
    (k, n) => ({ line: `V${n}: [pb, aum] x${k}`, rounds: 1 }),
    (k, n) => ({ line: `V${n}: ${k} pb (${k})\n> nota de la vuelta ${n}`, rounds: 1 }),
    (k, n) => ({ line: `V${n}-${n + 1}: ${k} pb (${k})`, rounds: 2 }),
    (k, n) => ({ line: `V${n}: ${k} pb ht`, rounds: 1 }),
    (k, n) => ({ line: `V${n}: 2 pb, aum x${k}`, rounds: 1 }),
  ];
  for (let i = 0; i < n; i++) {
    const r = next();
    if (r < 0.25) {
      const v = int(1, 20);
      if (m.g) m.t = v;
      else m.c = v;
      ops.push({ kind: "count", v });
    } else if (r < 0.4 && concrete < 10) {
      ops.push({ kind: "insert", produced: produced() });
      concrete++;
    } else if (r < 0.5 && !m.g) {
      m.g = true;
      m.t = 2;
      ops.push({ kind: "wrap" });
    } else if (r < 0.85 && concrete < 10) {
      const t = TEXT[int(0, TEXT.length - 1)]!(int(1, 18), concrete + 1);
      concrete += t.rounds;
      ops.push({ kind: "text", text: t.line });
    } else if (!m.g) {
      m.s = ["hdc", "dc", "inc", "sc"][int(0, 3)]!;
      ops.push({ kind: "stitch", v: m.s });
    } else {
      m.t = int(1, 20);
      ops.push({ kind: "count", v: m.t });
    }
  }
  if (!ops.some((o) => o.kind === "text")) ops.push({ kind: "text", text: `V${concrete + 1}: 3 sc` });
  if (!ops.some((o) => o.kind !== "text")) ops.push({ kind: "count", v: 9 });
  return ops;
}

const block = (page: Page, key: string) => page.locator(`[data-block="${key}"]`);

async function toBlocks(page: Page) {
  await page.getByTestId("tab-blocks").click();
  await expect(page.getByTestId("block-editor")).toBeVisible();
}
async function toText(page: Page) {
  await page.getByTestId("tab-text").click();
  await expect(partText(page)).toBeVisible();
}

async function typeText(page: Page, text: string) {
  await caretToEnd(page);
  await page.keyboard.type(`\n${text}`);
  await expect(page.getByTestId("part-text-editor")).toHaveAttribute("data-status", "synced");
}

/** Pasada con cambios de pestaña. Devuelve cuántos cambios de pestaña hizo. */
export async function runOpsWithTabs(page: Page, ops: Op[]): Promise<number> {
  let switches = 0;
  let grp = false;
  let view: "text" | "blocks" = "text";
  const go = async (to: "text" | "blocks") => {
    if (view === to) return;
    await (to === "text" ? toText(page) : toBlocks(page));
    view = to;
    switches++;
  };
  for (const op of ops) {
    // Ida y vuelta antes de cada edición.
    await go(view === "text" ? "blocks" : "text");
    await go(view === "text" ? "blocks" : "text");
    if (op.kind === "text") {
      await go("text");
      await typeText(page, op.text);
      continue;
    }
    await go("blocks");
    if (op.kind === "count") {
      await (grp ? block(page, "0:0").getByTestId("block-times") : block(page, "0:0").getByTestId("block-count")).fill(String(op.v));
      await page.getByTestId("block-insert-end").focus();
    } else if (op.kind === "insert") await page.locator('[data-round="0"]').getByTestId("block-insert-after").click();
    else if (op.kind === "wrap") {
      await block(page, "0:0").getByTestId("block-wrap").click();
      grp = true;
    } else await block(page, "0:0").getByTestId("block-stitch").selectOption(op.v);
  }
  await go(view === "text" ? "blocks" : "text");
  await go(view === "text" ? "blocks" : "text");
  return switches;
}

/** Pasada sin cambiar de vista: el texto se escribe; los bloques son operaciones del almacén. */
export async function runOpsDirect(page: Page, ops: Op[]): Promise<void> {
  for (const op of ops) {
    if (op.kind === "text") {
      await typeText(page, op.text);
      continue;
    }
    await page.evaluate((o: Op) => {
      const { store } = (window as unknown as { __loopitaAmigurumi: Hook }).__loopitaAmigurumi;
      const partId = store.doc.parts[0]!.id;
      const first = store.doc.parts[0]!.rounds[0]!.items[0] as Record<string, unknown>;
      const g = first.type === "group";
      if (o.kind === "count") store.run({ type: "updateItem", partId, roundIndex: 0, path: [0], item: g ? { ...first, times: o.v } : { ...first, count: o.v } });
      else if (o.kind === "insert") store.run({ type: "insertRound", partId, index: 1, round: { number: 1, items: [{ type: "stitch", stitch: "sc", count: o.produced }] } });
      else if (o.kind === "wrap") store.run({ type: "wrapInGroup", partId, roundIndex: 0, from: [0], to: [0], times: 2 });
      else if (o.kind === "stitch") store.run({ type: "updateItem", partId, roundIndex: 0, path: [0], item: { ...first, stitch: o.v } });
    }, op);
  }
}

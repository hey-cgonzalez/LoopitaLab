/**
 * Editor de bloques del estudio amigurumi (T15 de la fase 4; ADR 0011, sección 7; CA4-E3, CA4-E6 y CA4-E11), sin DOM:
 * - `blockTree` recursivo, `BlockEditPolicy` y `canEditBlock` (el único lugar del tope);
 * - las acciones sobre el almacén: una acción = un paso de deshacer, y el texto es siempre `formatPart` del documento;
 * - CA4-E11: el editor montado con la política de `LIMITS.maxNesting` edita, agrupa y mueve a 6 niveles sin cambiar
 *   otro código; y una revisión de código que ninguna comparación de profundidad vive fuera de `canEditBlock`;
 * - selección por rutas.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  concreteRounds,
  formatPart,
  LIMITS,
  newWrittenPattern,
  parsePart,
  validatePattern,
  type Item,
  type Part,
  type Round,
  type WrittenPattern,
} from "@loopitalab/pattern-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BlockEditor } from "@/components/amigurumi/BlockEditor.tsx";
import {
  BLOCK_EDIT_POLICY_V1,
  BlockActions,
  blockTree,
  canEditBlock,
  canEditChildrenOf,
  flattenBlocks,
  itemAt,
  newRoundAt,
  roundCountOf,
  sameSelection,
  selectionAfterRemove,
  type BlockEditPolicy,
} from "@/lib/amigurumi/blocks.ts";
import { deepEqual } from "@/lib/amigurumi/equal.ts";
import { WrittenStore, type WrittenAction } from "@/lib/amigurumi/store.ts";

const YARN_A = { id: "A", weight: 4 as const, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#E9DDBE", paletteId: "crudo" } };
const YARN_B = { id: "B", weight: 4 as const, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#BA222C", paletteId: "rojo" } };
const FULL: BlockEditPolicy = { maxEditDepth: LIMITS.maxNesting, dragAndDrop: false };
const PART = "p1";

const sc = (count: number): Item => ({ type: "stitch", stitch: "sc", count });
const grp = (times: number, ...items: Item[]): Item => ({ type: "group", times, items });

function docWith(rounds: Round[], extra: Partial<Part> = {}): WrittenPattern {
  const base = newWrittenPattern({ id: "d1", title: "Prueba", yarns: [YARN_A, YARN_B], partId: PART, partName: "Cuerpo" });
  return { ...base, parts: [{ ...(base.parts[0] as Part), rounds, ...extra }] };
}
const part = (store: WrittenStore): Part => store.doc.parts[0] as Part;
const roundOf = (store: WrittenStore, j = 0): Round => part(store).rounds[j] as Round;

/** Cinco grupos anidados con dos puntos adentro: los puntos están a 6 niveles de ítems. */
const nested = (): Item => grp(2, grp(2, grp(2, grp(2, grp(2, sc(2), sc(3))))));
const DEEP_STITCH = [0, 0, 0, 0, 0, 0] as const;

function store(rounds: Round[], extra: Partial<Part> = {}) {
  return new WrittenStore(docWith(rounds, extra));
}

describe("canEditBlock y BlockEditPolicy (el único lugar del tope)", () => {
  it("v1: se edita hasta el nivel 2 (1 = ítems de la vuelta); 3 a 6 son de solo lectura", () => {
    expect(BLOCK_EDIT_POLICY_V1).toEqual({ maxEditDepth: 2, dragAndDrop: false });
    expect(canEditBlock([0], BLOCK_EDIT_POLICY_V1)).toBe(true);
    expect(canEditBlock([0, 1], BLOCK_EDIT_POLICY_V1)).toBe(true);
    for (const n of [3, 4, 5, 6]) expect(canEditBlock(Array<number>(n).fill(0), BLOCK_EDIT_POLICY_V1)).toBe(false);
    expect(canEditBlock([], BLOCK_EDIT_POLICY_V1)).toBe(false);
  });

  it("versión completa: la política con LIMITS.maxNesting edita los 6 niveles", () => {
    for (let n = 1; n <= LIMITS.maxNesting; n++) expect(canEditBlock(Array<number>(n).fill(0), FULL)).toBe(true);
    expect(canEditBlock(Array<number>(LIMITS.maxNesting + 1).fill(0), FULL)).toBe(false);
  });

  it("agrupar o agregar adentro se pregunta por el nivel de los hijos (nunca deja un hijo que no se pueda editar)", () => {
    expect(canEditChildrenOf([0], BLOCK_EDIT_POLICY_V1)).toBe(true);
    expect(canEditChildrenOf([0, 0], BLOCK_EDIT_POLICY_V1)).toBe(false);
    expect(canEditChildrenOf([0, 0, 0, 0, 0], FULL)).toBe(true);
    expect(canEditChildrenOf([0, 0, 0, 0, 0, 0], FULL)).toBe(false);
  });
});

describe("blockTree", () => {
  const round: Round = { number: 1, items: [nested(), sc(1)] };

  it("es recursivo y llega al nivel 6 sin límite propio", () => {
    const tree = blockTree(round, FULL);
    const flat = flattenBlocks(tree);
    expect(Math.max(...flat.map((n) => n.path.length))).toBe(6);
    expect(Math.max(...flat.map((n) => n.depth))).toBe(5);
    expect(tree[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children?.map((n) => n.item)).toEqual([sc(2), sc(3)]);
  });

  it("el ítem es el del documento (sin copiar) y la ruta es la identidad", () => {
    const tree = blockTree(round, FULL);
    expect(tree[1]?.item).toBe(round.items[1]);
    expect(tree[0]?.item).toBe(round.items[0]);
    expect(itemAt(round.items, DEEP_STITCH)).toEqual(sc(2));
    expect(tree[0]?.siblings).toBe(2);
    expect(tree[1]?.index).toBe(1);
  });

  it("marca editable según la política: v1 hasta el nivel 2; completa, todos", () => {
    const v1 = flattenBlocks(blockTree(round, BLOCK_EDIT_POLICY_V1));
    expect(v1.filter((n) => n.editable).map((n) => n.path.length)).toEqual([1, 2, 1]);
    expect(v1.filter((n) => !n.editable)).toHaveLength(v1.length - 3);
    expect(flattenBlocks(blockTree(round, FULL)).every((n) => n.editable)).toBe(true);
  });
});

describe("acciones: una acción, un paso de deshacer, y el texto sigue al documento", () => {
  const base = (): WrittenStore => store([{ number: 1, items: [sc(6)] }, { number: 2, items: [{ type: "stitch", stitch: "inc", count: 6 }] }]);
  const actions = (s: WrittenStore, policy: BlockEditPolicy = BLOCK_EDIT_POLICY_V1) => new BlockActions({ store: s, policy });
  /** CA4-E3 en pequeño: lo que dibuja el texto es `formatPart` y se lee al mismo documento. */
  const textRoundTrips = (s: WrittenStore) => {
    for (const dialect of ["es", "us", "uk"] as const) {
      const text = formatPart(part(s), dialect);
      const back = parsePart(text, { id: PART, mode: dialect === "uk" ? "es-uk" : "es-us" });
      expect(back.ok).toBe(true);
      if (back.ok) expect(deepEqual(back.value, part(s))).toBe(true);
    }
  };

  it("cambiar punto, cantidad, hebra y lana", () => {
    const s = store([{ number: 1, items: [sc(6), { type: "color", yarn: "B" }, sc(2)] }]);
    const a = actions(s);
    expect(a.setStitch(PART, 0, [0], "hdc")).toBe(true);
    expect(a.setCount(PART, 0, [0], 8)).toBe(true);
    expect(a.setLoop(PART, 0, [0], "back")).toBe(true);
    expect(roundOf(s).items[0]).toEqual({ type: "stitch", stitch: "hdc", count: 8, loop: "back" });
    expect(a.setLoop(PART, 0, [0], "both")).toBe(true);
    expect(roundOf(s).items[0]).toEqual({ type: "stitch", stitch: "hdc", count: 8 });
    expect(a.setYarn(PART, 0, [1], "A")).toBe(true);
    expect(roundOf(s).items[1]).toEqual({ type: "color", yarn: "A" });
    // Un ítem de otra clase, un número inválido o uno sobre el tope duro no cambian nada.
    expect(a.setCount(PART, 0, [1], 3)).toBe(false);
    expect(a.setCount(PART, 0, [0], 0)).toBe(false);
    expect(a.setCount(PART, 0, [0], LIMITS.maxItemCount + 1)).toBe(false);
    expect(a.setCount(PART, 0, [9], 3)).toBe(false);
    textRoundTrips(s);
    // 5 acciones que cambiaron = 5 pasos: deshacer los recorre de a uno.
    let steps = 0;
    while (s.undo()) steps++;
    expect(steps).toBe(5);
  });

  it("los conteos salen del motor: `roundCountOf` es `concreteRounds`", () => {
    const s = base();
    expect(roundCountOf(part(s), 1)).toMatchObject({ produced: 12, consumed: 6 });
    expect(roundCountOf(part(s), 1)?.produced).toBe(concreteRounds(part(s))[1]?.count.produced);
    actions(s).setCount(PART, 0, [0], 7);
    expect(roundCountOf(part(s), 0)?.produced).toBe(7);
    expect(roundCountOf(part(s), 7)).toBeNull();
  });

  it("agrupar, cambiar las veces y deshacer el grupo (el conteo no cambia)", () => {
    const s = store([{ number: 1, items: [sc(1), { type: "stitch", stitch: "inc", count: 1 }, sc(2)] }]);
    const a = actions(s);
    const before = roundCountOf(part(s), 0)?.produced;
    expect(a.wrap(PART, 0, [0], [1], 3)).toEqual([0]);
    expect(roundOf(s).items).toEqual([grp(3, sc(1), { type: "stitch", stitch: "inc", count: 1 }), sc(2)]);
    expect(a.setTimes(PART, 0, [0], 4)).toBe(true);
    expect(roundCountOf(part(s), 0)?.produced).toBe(4 * 3 + 2);
    expect(a.setTimes(PART, 0, [0], 1)).toBe(true);
    expect(a.unwrap(PART, 0, [0])).toBe(true);
    expect(roundOf(s).items).toEqual([sc(1), { type: "stitch", stitch: "inc", count: 1 }, sc(2)]);
    expect(roundCountOf(part(s), 0)?.produced).toBe(before);
    textRoundTrips(s);
    // Cada acción es un paso.
    let steps = 0;
    while (s.undo()) steps++;
    expect(steps).toBe(4);
  });

  it("subir y bajar usan moveItem con `to` = la ruta después de mover", () => {
    const s = store([{ number: 1, items: [sc(1), { type: "stitch", stitch: "inc", count: 2 }, sc(3)] }]);
    const a = actions(s);
    const run = vi.spyOn(s, "dispatch");
    expect(a.moveBy(PART, 0, [0], 1)).toEqual([1]);
    expect(run).toHaveBeenCalledWith({ type: "moveItem", partId: PART, roundIndex: 0, from: [0], to: [1] });
    expect((roundOf(s).items[1] as { count: number }).count).toBe(1);
    expect(a.moveBy(PART, 0, [1], -1)).toEqual([0]);
    expect(roundOf(s).items.map((i) => (i as { count: number }).count)).toEqual([1, 2, 3]);
    expect(a.moveBy(PART, 0, [0], -1)).toBeNull();
    expect(a.moveBy(PART, 0, [2], 1)).toBeNull();
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(false);
  });

  it("agregar y borrar un ítem, con la selección que queda por ruta", () => {
    const s = store([{ number: 1, items: [grp(2, sc(1)), sc(3)] }]);
    const a = actions(s);
    expect(a.addItem(PART, 0, [], sc(1))).toEqual([2]);
    expect(a.addItem(PART, 0, [0], sc(2))).toEqual([0, 1]);
    expect(a.removeItem(PART, 0, [0, 1])).toEqual({ changed: true, select: [0, 0] });
    expect(a.removeItem(PART, 0, [2])).toEqual({ changed: true, select: [1] });
    // No deja un grupo vacío: el núcleo rechaza.
    expect(a.removeItem(PART, 0, [0, 0]).changed).toBe(false);
    textRoundTrips(s);
  });

  it("insertar y borrar vueltas renumeran; la vuelta nueva sigue la anterior y no inventa un conteo declarado", () => {
    const s = base();
    const a = actions(s);
    expect(newRoundAt(part(s), 1)).toEqual({ number: 1, items: [sc(6)] });
    expect(newRoundAt(part(s), 0)).toEqual({ number: 1, items: [sc(6)] });
    let inserted: boolean | undefined;
    a.insertRound(PART, 1, (ok) => (inserted = ok));
    expect(inserted).toBe(true);
    expect(part(s).rounds.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(roundOf(s, 1).expected).toBeUndefined();
    expect(a.removeRound(PART, 1)).toBe(true);
    expect(part(s).rounds.map((r) => r.number)).toEqual([1, 2]);
    expect(a.removeRound(PART, 0)).toBe(true);
    expect(a.removeRound(PART, 0)).toBe(false); // la única vuelta no se quita
    textRoundTrips(s);
  });

  it("insertar una vuelta pasa por guard() con la acción del almacén (límites recomendados)", () => {
    const s = base();
    const guard = vi.fn((action: WrittenAction, done?: (r: ReturnType<WrittenStore["run"]>) => void) => done?.(s.run(action)));
    const a = new BlockActions({ store: s, policy: BLOCK_EDIT_POLICY_V1, guard });
    let ok: boolean | undefined;
    a.insertRound(PART, 2, (v) => (ok = v));
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard.mock.calls[0]?.[0]).toMatchObject({ type: "insertRound", partId: PART, index: 2 });
    expect(ok).toBe(true);
    // Si guard no la aplica (la usuaria cancela), no hay cambio.
    const cancel = new BlockActions({ store: s, policy: BLOCK_EDIT_POLICY_V1, guard: (_a, done) => done?.({ doc: s.doc, changed: false, unplaced: [], applied: true }) });
    cancel.insertRound(PART, 0, (v) => (ok = v));
    expect(ok).toBe(false);
    expect(part(s).rounds).toHaveLength(3);
  });

  it("declarar el conteo del motor arregla 'no cuadra' sin tocar los puntos", () => {
    const s = store([{ number: 1, items: [sc(6)], expected: 6 }]);
    const a = actions(s);
    a.setCount(PART, 0, [0], 8);
    expect(roundOf(s).expected).toBe(6);
    expect(a.useEngineCount(PART, 0)).toBe(true);
    expect(roundOf(s).expected).toBe(8);
    expect(roundOf(s).items).toEqual([sc(8)]);
  });

  it("la política manda: v1 no edita el nivel 3, aunque el núcleo lo aceptaría", () => {
    const s = store([{ number: 1, items: [grp(2, grp(2, sc(2), sc(3)))] }]);
    const before = s.doc;
    const a = actions(s);
    expect(a.setCount(PART, 0, [0, 0, 0], 9)).toBe(false);
    expect(a.setStitch(PART, 0, [0, 0, 1], "dc")).toBe(false);
    expect(a.moveBy(PART, 0, [0, 0, 0], 1)).toBeNull();
    expect(a.removeItem(PART, 0, [0, 0, 0]).changed).toBe(false);
    expect(a.wrap(PART, 0, [0, 0], [0, 0], 2)).toBeNull(); // sus hijos quedarían en el nivel 3
    expect(a.addItem(PART, 0, [0, 0], sc(1))).toBeNull();
    expect(s.doc).toBe(before);
    // Lo que sí: el grupo del nivel 2 en sí (sus veces, subir/bajar, deshacerlo).
    expect(a.setTimes(PART, 0, [0, 0], 3)).toBe(true);
    expect(a.unwrap(PART, 0, [0, 0])).toBe(true);
  });
});

describe("CA4-E11: el editor montado con la política de 6 niveles edita a esa profundidad sin cambiar otro código", () => {
  const R: Round = { number: 1, items: [nested()] };
  const mount = (s: WrittenStore, policy: BlockEditPolicy) =>
    renderToStaticMarkup(
      createElement(BlockEditor, {
        store: s,
        part: part(s),
        yarns: s.doc.yarns,
        dialect: "es",
        policy,
        actions: new BlockActions({ store: s, policy }),
        onEditInText: () => {},
        announce: () => {},
      }),
    );
  const block = (html: string, key: string) => {
    const m = new RegExp(`<li[^>]*data-block="${key}"[^>]*>`).exec(html);
    return m?.[0] ?? "";
  };

  it("es un documento válido de 5 grupos anidados (6 niveles de ítems)", () => {
    expect(validatePattern(docWith([R])).savable).toBe(true);
  });

  it("v1: el nivel 6 se dibuja en solo lectura y con 'Editar en el texto'; los niveles 1 y 2 se editan", () => {
    const html = mount(store([R]), BLOCK_EDIT_POLICY_V1);
    expect(block(html, "0:0.0.0.0.0.0")).toContain('data-editable="false"');
    expect(block(html, "0:0.0.0.0.0.0")).toContain('aria-level="6"');
    expect(block(html, "0:0")).toContain('data-editable="true"');
    expect(block(html, "0:0.0")).toContain('data-editable="true"');
    expect(block(html, "0:0.0.0")).toContain('data-editable="false"');
    expect(html).toContain('data-testid="block-edit-in-text"');
    // Un botón de "Editar en el texto" por cada bloque de solo lectura de más arriba (el grupo del nivel 3), no por cada nivel.
    expect(html.match(/data-testid="block-edit-in-text"/g)).toHaveLength(1);
    // Todo se ve: los dos puntos del nivel 6 están en el HTML.
    expect(html).toContain("2 pb");
    expect(html).toContain("3 pb");
  });

  it("política completa: los mismos bloques del nivel 6 llevan sus campos y botones", () => {
    const html = mount(store([R]), FULL);
    expect(block(html, "0:0.0.0.0.0.0")).toContain('data-editable="true"');
    expect(html).not.toContain('data-testid="block-edit-in-text"');
    expect(html.match(/data-testid="block-count"/g)).toHaveLength(2);
    expect(html.match(/data-testid="block-times"/g)).toHaveLength(5);
  });

  it("política completa: edita, agrupa y mueve un ítem a 6 niveles, y cada acción se deshace", () => {
    const s = store([R]);
    const a = new BlockActions({ store: s, policy: FULL });
    const text0 = formatPart(part(s), "es");
    // Editar a 6 niveles.
    expect(a.setCount(PART, 0, DEEP_STITCH, 9)).toBe(true);
    expect(itemAt(roundOf(s).items, DEEP_STITCH)).toEqual(sc(9));
    // Mover a 6 niveles.
    expect(a.moveBy(PART, 0, DEEP_STITCH, 1)).toEqual([0, 0, 0, 0, 0, 1]);
    expect(itemAt(roundOf(s).items, DEEP_STITCH)).toEqual(sc(3));
    // Un ítem a 6 niveles no se puede agrupar (el hijo quedaría en el 7: el núcleo y la política lo rechazan).
    const before = s.doc;
    expect(a.wrap(PART, 0, [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], 2)).toBeNull();
    expect(s.doc).toBe(before);
    // Agrupar un ítem del nivel 5 (el grupo): su hijo pasa al 6.
    const wrapped = new WrittenStore(docWith([{ number: 1, items: [grp(2, grp(2, grp(2, grp(2, sc(1), sc(2)))))] }]));
    const w = new BlockActions({ store: wrapped, policy: FULL });
    expect(w.wrap(PART, 0, [0, 0, 0, 0, 1], [0, 0, 0, 0, 1], 2)).toEqual([0, 0, 0, 0, 1]);
    expect(w.wrap(PART, 0, [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], 2)).toEqual([0, 0, 0, 0, 0]);
    expect(w.unwrap(PART, 0, [0, 0, 0, 0, 0])).toBe(true);
    // Deshacer todo lo hecho a 6 niveles deja el texto original.
    while (s.undo());
    expect(formatPart(part(s), "es")).toBe(text0);
    expect(s.doc.parts[0]?.rounds).toEqual([R].map((r) => ({ ...r })));
  });

  it("con la política v1 las mismas acciones a 6 niveles no cambian nada (sin tocar otro código)", () => {
    const s = store([R]);
    const a = new BlockActions({ store: s, policy: BLOCK_EDIT_POLICY_V1 });
    const before = s.doc;
    expect(a.setCount(PART, 0, DEEP_STITCH, 9)).toBe(false);
    expect(a.moveBy(PART, 0, DEEP_STITCH, 1)).toBeNull();
    expect(a.wrap(PART, 0, DEEP_STITCH, DEEP_STITCH, 2)).toBeNull();
    expect(s.doc).toBe(before);
  });
});

describe("selección por rutas", () => {
  it("la selección es { partId, roundIndex, path } y se compara por ruta", () => {
    const a = { partId: PART, roundIndex: 1, path: [0, 2] };
    expect(sameSelection(a, { ...a, path: [0, 2] })).toBe(true);
    expect(sameSelection(a, { ...a, path: [0, 1] })).toBe(false);
    expect(sameSelection(a, { ...a, path: null })).toBe(false);
    expect(sameSelection({ ...a, path: null }, { ...a, path: null })).toBe(true);
    expect(sameSelection(null, null)).toBe(true);
    expect(sameSelection(a, null)).toBe(false);
  });

  it("al quitar un bloque, la selección pasa al hermano anterior, al siguiente o al grupo", () => {
    const r: Round = { number: 1, items: [sc(1), grp(2, sc(1), sc(2)), sc(3)] };
    expect(selectionAfterRemove(r, [1])).toEqual([0]);
    expect(selectionAfterRemove(r, [0])).toEqual([0]);
    expect(selectionAfterRemove(r, [1, 1])).toEqual([1, 0]);
    expect(selectionAfterRemove({ number: 1, items: [sc(1)] }, [0])).toBeNull();
    expect(selectionAfterRemove({ number: 1, items: [grp(2, sc(1))] }, [0, 0])).toEqual([0]);
  });

  it("mover con botones deja la selección en la ruta de destino", () => {
    const s = store([{ number: 1, items: [sc(1), sc(2), sc(3)] }]);
    const a = new BlockActions({ store: s, policy: BLOCK_EDIT_POLICY_V1 });
    expect(a.moveBy(PART, 0, [0], 1)).toEqual([1]);
    expect(a.moveBy(PART, 0, [1], 1)).toEqual([2]);
  });
});

describe("revisión de código: ninguna comparación de profundidad fuera de canEditBlock (CA4-E11, punto 2)", () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");
  const FILES = [
    "lib/amigurumi/blocks.ts",
    "components/amigurumi/BlockEditor.tsx",
    "components/amigurumi/UnreadTextDialog.tsx",
    "components/amigurumi/WrittenStudio.tsx",
    "app/dev/amigurumi/page.tsx",
  ];

  /** Quita comentarios y el cuerpo de `canEditBlock` (el único lugar permitido). */
  function withoutAllowed(src: string): string {
    let out = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const start = out.indexOf("export function canEditBlock");
    if (start >= 0) {
      const open = out.indexOf("{", out.indexOf(")", start));
      let depth = 0;
      let end = open;
      for (let i = open; i < out.length; i++) {
        if (out[i] === "{") depth++;
        else if (out[i] === "}" && --depth === 0) {
          end = i;
          break;
        }
      }
      out = out.slice(0, start) + out.slice(end + 1);
    }
    return out;
  }

  const CMP = String.raw`(?:<=|>=|===|!==|==|!=|<|>)`;
  const NAMES = String.raw`(?:depth|level|nesting|maxEditDepth|maxNesting|path\.length|from\.length|to\.length|parent\.length|policy\.\w+)`;
  const forward = new RegExp(String.raw`\b${NAMES}\b\s*${CMP}\s*[\w(]`);
  const backward = new RegExp(String.raw`[\w)]\s*${CMP}\s*\b${NAMES}\b`);

  const clean = (code: string) => code.replace(/=>/g, "→").replace(/<[A-Za-z][\w<>,\s|\[\]]*>/g, "");
  const found = (code: string) => clean(code).match(forward) ?? clean(code).match(backward);

  it("la búsqueda detecta lo que debe (y no lo que no)", () => {
    for (const bad of ["if (path.length > 2) {}", "const ok = node.depth <= 2;", "x = 2 < path.length", "if (level === 3) {}", "policy.maxEditDepth >= n"]) expect(found(bad), bad).not.toBeNull();
    for (const fine of ["const f = (a) => a.length;", "const l: Array<number> = [];", "const to = path.length - 1;", "i < items.length"]) expect(found(fine), fine).toBeNull();
  });

  for (const rel of FILES) {
    it(`${rel}: sin comparar profundidades ni leer policy.maxEditDepth`, () => {
      const code = withoutAllowed(read(rel));
      // `a > b` en genéricos o flechas (`=>`) no cuenta: se quitan antes de buscar.
      const cleaned = clean(code);
      expect(cleaned.match(forward), `${rel}: ${cleaned.match(forward)?.[0]}`).toBeNull();
      expect(cleaned.match(backward), `${rel}: ${cleaned.match(backward)?.[0]}`).toBeNull();
      // La política se lee en `canEditBlock` y se construye en la página de desarrollo; en ningún otro lugar.
      if (!/blocks\.ts$|dev\/amigurumi\/page\.tsx$/.test(rel)) {
        expect(cleaned).not.toMatch(/maxEditDepth/);
        expect(cleaned).not.toMatch(/LIMITS\.maxNesting/);
      }
    });
  }

  it("canEditBlock es el único lugar que lee maxEditDepth en blocks.ts", () => {
    const src = read("lib/amigurumi/blocks.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src.match(/policy\.maxEditDepth/g)).toHaveLength(1);
    expect(src.indexOf("policy.maxEditDepth")).toBeGreaterThan(src.indexOf("export function canEditBlock"));
    expect(src.indexOf("policy.maxEditDepth")).toBeLessThan(src.indexOf("export function canEditChildrenOf"));
  });
});

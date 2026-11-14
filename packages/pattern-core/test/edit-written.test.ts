/**
 * Operaciones de edición de patrones escritos (T6; ADR 0011, sección 6): pureza, no-ops,
 * profundidad completa (`LIMITS.maxNesting`), `moveItem` entre niveles, topes duros sí y
 * límites recomendados nunca, copias y partes sin referencias colgando en `layout`, y las
 * operaciones de lanas generalizadas a `Pattern`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIMITS,
  RECOMMENDED_WRITTEN_LIMITS,
  addPart,
  addYarn,
  clearPlacement,
  countRound,
  expandRound,
  insertItem,
  insertRound,
  moveItem,
  movePart,
  newWrittenPattern,
  recommendedLimitNotices,
  removeItem,
  removePart,
  removeRound,
  removeYarn,
  renamePart,
  reorderYarns,
  replacePartRounds,
  replaceRound,
  setAssembly,
  setCopies,
  setPartConstruction,
  setPartFinish,
  setPartStart,
  setPartStartYarn,
  setPlacement,
  unwrapGroup,
  updateItem,
  validatePattern,
  wrapInGroup,
  type Item,
  type Part,
  type Round,
  type WrittenPattern,
} from "../src/index.ts";
import { ballPattern, smallChart, yarnA, yarnB, yarnC } from "./support/fixtures.ts";

const sc = (count = 1): Item => ({ type: "stitch", stitch: "sc", count });
const savable = (p: WrittenPattern) => validatePattern(p).savable;

function deep(levels: number): Item[] {
  let items: Item[] = [sc()];
  for (let i = 0; i < levels; i++) items = [{ type: "group", times: 1, items }];
  return items;
}

/** Documento con una parte de una sola vuelta (`items`). */
function oneRound(items: Item[]): WrittenPattern {
  const d = ballPattern();
  d.yarns = [yarnA, yarnB, yarnC];
  d.parts[0]!.rounds = [{ number: 1, items }];
  return d;
}

function frozen<T>(v: T): T {
  if (typeof v === "object" && v !== null) {
    for (const k of Object.keys(v)) frozen((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}

describe("newWrittenPattern", () => {
  it("crea un documento valid de crochet con una parte de 6 pb en anillo mágico y origen manual", () => {
    const d = newWrittenPattern({ id: "n", title: "Nuevo", yarns: [yarnA, yarnB], partId: "cuerpo", partName: "Cuerpo" });
    assert.equal(validatePattern(d).valid, true);
    assert.equal(d.technique, "crochet");
    assert.deepEqual(d.origin, { kind: "manual" });
    assert.equal(d.parts[0]!.startYarn, "A");
    assert.equal(d.gauge, undefined);
    assert.notEqual(d.yarns[0], yarnA); // copia
  });

  it("nunca lanza con entradas dañadas", () => {
    for (const bad of [null, 5, "x", {}, { yarns: "no" }]) assert.doesNotThrow(() => newWrittenPattern(bad as never));
  });
});

describe("operaciones de partes", () => {
  it("son puras: nunca mutan la entrada (documento congelado)", () => {
    const d = frozen(ballPattern());
    const id = d.parts[0]!.id;
    assert.doesNotThrow(() => {
      renamePart(d, id, "Cabeza");
      setPartConstruction(d, id, "joined");
      setPartStart(d, id, { type: "chain", count: 6 });
      setPartStartYarn(d, id, "B");
      setPartFinish(d, id, "a\nb");
      setCopies(d, id, 3);
      addPart(d, { ...d.parts[0]!, id: "otra" });
      insertRound(d, id, 0, { number: 1, items: [sc(6)] });
      insertItem(d, id, 0, [0], sc());
      setAssembly(d, ["Coser."]);
    });
  });

  it("renamePart recorta; rechaza nombres vacíos, con saltos o sobre el tope", () => {
    const d = ballPattern();
    const id = d.parts[0]!.id;
    assert.equal(renamePart(d, id, "  Cabeza ").parts[0]!.name, "Cabeza");
    for (const bad of ["", "   ", "a\nb", "x".repeat(LIMITS.maxPartNameLength + 1)]) assert.equal(renamePart(d, id, bad), d, JSON.stringify(bad));
    assert.equal(renamePart(d, id, d.parts[0]!.name), d, "sin cambios: mismo objeto");
    assert.equal(renamePart(d, "no-existe", "x"), d);
  });

  it("addPart y movePart respetan ids únicos y LIMITS.maxParts, no los 20 recomendados", () => {
    let d = ballPattern();
    const base = d.parts[0]!;
    assert.equal(addPart(d, { ...base }), d, "id repetido");
    for (let i = 1; i < LIMITS.maxParts; i++) d = addPart(d, { ...base, id: `p${i}` });
    assert.equal(d.parts.length, LIMITS.maxParts);
    assert.ok(d.parts.length > RECOMMENDED_WRITTEN_LIMITS.parts);
    assert.ok(savable(d));
    assert.equal(addPart(d, { ...base, id: "extra" }), d, "tope duro");
    const moved = movePart(d, "p1", 0);
    assert.equal(moved.parts[0]!.id, "p1");
    assert.equal(movePart(d, "p1", 999), d);
    // Una parte con errores estructurales no entra.
    const e = ballPattern();
    assert.equal(addPart(e, { ...base, id: "mala", startYarn: "Z" }), e);
  });

  it("setPartStart y setPartConstruction no dejan un inicio imposible (cadeneta de 1 en hileras)", () => {
    const d = ballPattern();
    const id = d.parts[0]!.id;
    const chain = setPartStart(d, id, { type: "chain", count: 1 });
    assert.deepEqual(chain.parts[0]!.start, { type: "chain", count: 1 });
    assert.equal(setPartConstruction(chain, id, "flat"), chain);
    assert.equal(setPartStart(d, id, { type: "chain", count: 0 }), d);
    assert.equal(setPartStartYarn(d, id, "Z"), d, "lana inexistente");
  });

  it("setPartFinish normaliza (varias líneas) y quita con undefined o en blanco", () => {
    const d = ballPattern();
    const id = d.parts[0]!.id;
    const f = setPartFinish(d, id, "  Rellenar.  \r\nCerrar.  ");
    assert.equal(f.parts[0]!.finish, "Rellenar.\nCerrar.");
    assert.equal(Object.hasOwn(setPartFinish(f, id, undefined).parts[0]!, "finish"), false);
    assert.equal(Object.hasOwn(setPartFinish(f, id, "  \n ").parts[0]!, "finish"), false);
  });
});

describe("setCopies y removePart: sin referencias colgando en layout (CA4-E8, F4-62)", () => {
  function withLayout(): WrittenPattern {
    const d = ballPattern();
    const head = d.parts[0]!;
    d.parts.push({ ...head, id: "oreja", name: "Oreja", copies: 3 }, { ...head, id: "mono", name: "Moño" });
    d.layout = {
      placements: [
        { target: { part: head.id, copy: 0 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } },
        ...[0, 1, 2].map((copy) => ({ target: { part: "oreja", copy }, at: { type: "surface" as const, host: { part: head.id, copy: 0 }, round: 5, stitch: copy * 4, attach: "end" as const, rotationDeg: [0, 0, 0] as [number, number, number] } })),
        // El moño va cosido a la tercera oreja.
        { target: { part: "mono", copy: 0 }, at: { type: "surface", host: { part: "oreja", copy: 2 }, round: 3, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } },
      ],
    };
    assert.ok(validatePattern(d).valid);
    return d;
  }

  it("bajar de 3 a 2 quita la ubicación de la tercera y avisa qué pieza quedó sin ubicar", () => {
    const d = withLayout();
    const r = setCopies(d, "oreja", 2);
    assert.equal(r.pattern.parts[1]!.copies, 2);
    assert.deepEqual(r.unplaced, [{ part: "mono", copy: 0 }]);
    assert.ok(validatePattern(r.pattern).valid);
    assert.equal(r.pattern.layout!.placements.length, 3);
    // A 1, `copies` se omite.
    const one = setCopies(r.pattern, "oreja", 1);
    assert.equal(Object.hasOwn(one.pattern.parts[1]!, "copies"), false);
    assert.ok(validatePattern(one.pattern).valid);
  });

  it(`setCopies acepta hasta ${LIMITS.maxCopies} (sobre los ${RECOMMENDED_WRITTEN_LIMITS.copiesPerPart} recomendados) y nada fuera de 1 a ${LIMITS.maxCopies}`, () => {
    const d = withLayout();
    const up = setCopies(d, "oreja", LIMITS.maxCopies);
    assert.equal(up.pattern.parts[1]!.copies, LIMITS.maxCopies);
    assert.ok(recommendedLimitNotices(up.pattern).some((n) => n.limit === "copiesPerPart"));
    assert.ok(validatePattern(up.pattern).valid);
    for (const n of [0, LIMITS.maxCopies + 1, 2.5, NaN]) assert.equal(setCopies(d, "oreja", n).pattern, d, String(n));
    assert.equal(setCopies(d, "oreja", 3).pattern, d, "sin cambios");
  });

  it("removePart quita la parte, sus ubicaciones y las anclas que dependían de ella", () => {
    const d = withLayout();
    const r = removePart(d, "oreja");
    assert.deepEqual(r.unplaced, [{ part: "mono", copy: 0 }]);
    assert.deepEqual(r.pattern.parts.map((p) => p.id), [d.parts[0]!.id, "mono"]);
    assert.ok(validatePattern(r.pattern).valid);
    // Sin ubicaciones, `layout` desaparece.
    const all = removePart(removePart(r.pattern, "mono").pattern, d.parts[0]!.id);
    assert.equal(all.pattern.parts.length, 1, "no quita la única parte");
  });

  it("setPlacement y clearPlacement: reemplazan por copia y rechazan ciclos y copias inexistentes", () => {
    const d = withLayout();
    const head = d.parts[0]!.id;
    const cycle = setPlacement(d, { target: { part: head, copy: 0 }, at: { type: "surface", host: { part: "mono", copy: 0 }, round: 1, stitch: 0, attach: "end", rotationDeg: [0, 0, 0] } });
    assert.equal(cycle, d, "ciclo");
    assert.equal(setPlacement(d, { target: { part: "oreja", copy: 7 }, at: { type: "free", positionCm: [0, 0, 0], rotationDeg: [0, 0, 0] } }), d, "copia inexistente");
    const moved = setPlacement(d, { target: { part: "oreja", copy: 0 }, at: { type: "free", positionCm: [1, 2, 3], rotationDeg: [0, 0, 0] } });
    assert.equal(moved.layout!.placements.length, d.layout!.placements.length);
    assert.ok(validatePattern(moved).valid);
    const cleared = clearPlacement(moved, { part: "oreja", copy: 0 });
    assert.equal(cleared.layout!.placements.length, d.layout!.placements.length - 1);
    assert.equal(clearPlacement(cleared, { part: "oreja", copy: 0 }), cleared);
  });
});

describe("operaciones de vueltas", () => {
  it("replacePartRounds conserva los números escritos (borrador con numeración rota)", () => {
    const d = ballPattern();
    const id = d.parts[0]!.id;
    const r = replacePartRounds(d, id, [{ number: 1, items: [sc(6)] }, { number: 5, items: [sc(6)] }]);
    assert.deepEqual(r.parts[0]!.rounds.map((x) => x.number), [1, 5]);
    assert.equal(validatePattern(r).savable, true);
    assert.equal(validatePattern(r).valid, false);
    assert.equal(replacePartRounds(d, id, []), d, "sin vueltas no");
  });

  it("insertRound, removeRound y replaceRound renumeran las siguientes y conservan los rangos", () => {
    const d = ballPattern(); // V1, V2, V3, V4, V5-8, V9, V10, V11
    const id = d.parts[0]!.id;
    const nums = (p: WrittenPattern) => p.parts[0]!.rounds.map((r) => (r.through ? `${r.number}-${r.through}` : `${r.number}`));
    const ins = insertRound(d, id, 4, { number: 99, through: 100, items: [sc(24)], expected: 24 });
    assert.deepEqual(nums(ins), ["1", "2", "3", "4", "5-6", "7-10", "11", "12", "13"]);
    assert.ok(validatePattern(ins).valid);
    const rem = removeRound(ins, id, 4);
    assert.deepEqual(rem.parts[0]!.rounds, d.parts[0]!.rounds);
    const rep = replaceRound(d, id, 4, { number: 1, items: [sc(24)], expected: 24 });
    assert.deepEqual(nums(rep), ["1", "2", "3", "4", "5", "6", "7", "8"]);
    assert.equal(removeRound(oneRound([sc(6)]), "bolita", 0).parts[0]!.rounds.length, 1, "no quita la única vuelta");
  });

  it(`respetan LIMITS.maxRounds (${LIMITS.maxRounds}), no las ${RECOMMENDED_WRITTEN_LIMITS.roundsPerPart} recomendadas`, () => {
    const d = oneRound([sc(6)]);
    const id = d.parts[0]!.id;
    const near = insertRound(d, id, 1, { number: 2, through: LIMITS.maxRounds, items: [sc(6)] });
    assert.equal(near.parts[0]!.rounds[1]!.through, LIMITS.maxRounds);
    assert.ok(validatePattern(near).valid);
    assert.ok(recommendedLimitNotices(near).some((n) => n.limit === "roundsPerPart"));
    assert.equal(insertRound(near, id, 2, { number: 1, items: [sc(6)] }), near, "tope duro");
  });
});

describe("operaciones de ítems a profundidad completa (decisión 2)", () => {
  const id = "bolita";

  it(`insertItem, updateItem y removeItem llegan al nivel ${LIMITS.maxNesting} (rutas de ${LIMITS.maxNesting} índices); no hay tope de 2 niveles`, () => {
    const d = oneRound(deep(LIMITS.maxNesting - 1));
    assert.ok(savable(d));
    const deepest = Array.from({ length: LIMITS.maxNesting }, () => 0); // [0, 0, …, 0]: el pb, dentro de 5 grupos
    const up = updateItem(d, id, 0, deepest, { type: "stitch", stitch: "dc", count: 3, loop: "back" });
    assert.notEqual(up, d);
    assert.equal(JSON.stringify(up).includes('"stitch":"dc"'), true);
    const ins = insertItem(up, id, 0, [...deepest.slice(0, -1), 1], sc(2));
    assert.ok(savable(ins));
    const rem = removeItem(ins, id, 0, [...deepest.slice(0, -1), 1]);
    assert.deepEqual(rem, up);
    // Un grupo más adentro pasaría el tope duro: sin cambios.
    assert.equal(insertItem(d, id, 0, [...deepest.slice(0, -1), 1], { type: "group", times: 2, items: [sc()] }), d);
    assert.equal(wrapInGroup(d, id, 0, deepest, deepest, 2), d);
    // Rutas inexistentes: sin cambios.
    assert.equal(updateItem(d, id, 0, [5], sc()), d);
    assert.equal(updateItem(d, id, 0, [0, 0, 9], sc()), d);
    assert.equal(insertItem(d, id, 3, [0], sc()), d, "vuelta inexistente");
    assert.equal(removeItem(d, id, 0, deepest), d, "no deja un grupo vacío");
  });

  it("moveItem sube, baja y mueve entre grupos y niveles; `to` es la ruta después de mover", () => {
    const items: Item[] = [sc(1), { type: "group", times: 2, items: [sc(2), { type: "group", times: 3, items: [sc(3), sc(4)] }] }, sc(5)];
    const d = oneRound(items);
    const get = (p: WrittenPattern) => p.parts[0]!.rounds[0]!.items;
    // Bajar el primero (queda después del grupo).
    assert.deepEqual(get(moveItem(d, id, 0, [0], [1])).map((i) => i.type), ["group", "stitch", "stitch"]);
    // Del nivel 0 al nivel 2: el pb(5) entra al grupo interno.
    const into = moveItem(d, id, 0, [2], [1, 1, 0]);
    assert.deepEqual((get(into)[1] as { items: Item[] }).items[1], { type: "group", times: 3, items: [sc(5), sc(3), sc(4)] });
    // Del nivel 2 al nivel 0.
    const out = moveItem(d, id, 0, [1, 1, 1], [0]);
    assert.deepEqual(get(out)[0], sc(4));
    // Entre hermanos, mover no cambia el conteo; entre grupos sí (el pb pasa a repetirse).
    assert.equal(countRound(moveItem(d, id, 0, [0], [2]).parts[0]!.rounds[0]!, "A").produced, countRound(d.parts[0]!.rounds[0]!, "A").produced);
    assert.notEqual(countRound(into.parts[0]!.rounds[0]!, "A").produced, countRound(d.parts[0]!.rounds[0]!, "A").produced);
    // Sin cambios: ruta igual, destino fuera de rango, origen inexistente o grupo que quedaría vacío.
    assert.equal(moveItem(d, id, 0, [0], [0]), d);
    assert.equal(moveItem(d, id, 0, [0], [9]), d);
    assert.equal(moveItem(d, id, 0, [7], [0]), d);
    const lone = oneRound([{ type: "group", times: 2, items: [sc()] }, sc()]);
    assert.equal(moveItem(lone, id, 0, [0, 0], [1]), lone);
  });

  it("moveItem no deja pasar de LIMITS.maxNesting al meter un grupo más adentro", () => {
    // 5 grupos anidados: el pb del fondo está en la lista de nivel 6 (ruta de 6 índices).
    const items: Item[] = [...deep(LIMITS.maxNesting - 1), { type: "group", times: 2, items: [sc()] }];
    const d = oneRound(items);
    assert.ok(savable(d));
    const zeros = (n: number) => Array.from({ length: n }, () => 0);
    // Al nivel 5 cabe (su pb queda en el nivel 6); al nivel 6, su pb quedaría en el 7: sin cambios.
    assert.ok(savable(moveItem(d, id, 0, [1], zeros(LIMITS.maxNesting - 1))));
    assert.equal(moveItem(d, id, 0, [1], zeros(LIMITS.maxNesting)), d);
  });

  it("wrapInGroup y unwrapGroup: agrupar y deshacer no cambian lo que se teje", () => {
    const d = oneRound([sc(1), { type: "stitch", stitch: "inc", count: 1 }, { type: "color", yarn: "B" }, sc(2)]);
    const w = wrapInGroup(d, id, 0, [0], [1], 6);
    assert.deepEqual(w.parts[0]!.rounds[0]!.items[0], { type: "group", times: 6, items: [sc(1), { type: "stitch", stitch: "inc", count: 1 }] });
    const u = unwrapGroup(w, id, 0, [0]);
    const round = (p: WrittenPattern) => p.parts[0]!.rounds[0]!;
    assert.deepEqual(expandRound(round(u), "A"), expandRound(round(w), "A"));
    assert.deepEqual(unwrapGroup(wrapInGroup(d, id, 0, [1], [3], 1), id, 0, [1]), d);
    assert.equal(wrapInGroup(d, id, 0, [1], [0], 2), d, "rango al revés");
    assert.equal(wrapInGroup(d, id, 0, [0], [1], LIMITS.maxGroupTimes + 1), d, "tope de veces");
    assert.equal(unwrapGroup(d, id, 0, [0]), d, "no es grupo");
  });

  it(`respetan LIMITS.maxRoundStitches (${LIMITS.maxRoundStitches}) y LIMITS.maxItemCount, no los ${RECOMMENDED_WRITTEN_LIMITS.stitchesPerRound} recomendados`, () => {
    const d = oneRound([sc(6)]);
    const big = updateItem(d, id, 0, [0], { type: "stitch", stitch: "ch", count: LIMITS.maxItemCount });
    assert.ok(validatePattern(big).savable);
    assert.ok(recommendedLimitNotices(big).some((n) => n.limit === "stitchesPerRound"));
    assert.equal(updateItem(d, id, 0, [0], { type: "stitch", stitch: "ch", count: LIMITS.maxItemCount + 1 }), d);
    const x10 = wrapInGroup(big, id, 0, [0], [0], 10);
    assert.ok(validatePattern(x10).savable, "50.000 puntos justos");
    assert.equal(wrapInGroup(big, id, 0, [0], [0], 11), big, "55.000 pasa el tope");
  });
});

describe("lanas generalizadas a Pattern (ADR 0011, sección 6)", () => {
  it("addYarn y reorderYarns valen para patrones escritos; el gráfico sigue igual", () => {
    const d = ballPattern();
    const added = addYarn(d, yarnC);
    assert.equal(added.yarns.length, d.yarns.length + 1);
    assert.equal(addYarn(added, yarnC), added, "id repetido");
    const order = added.yarns.map((_, i) => i).reverse();
    const re = reorderYarns(added, order);
    assert.deepEqual(re.yarns.map((y) => y.id), added.yarns.map((y) => y.id).reverse());
    assert.deepEqual(re.parts, added.parts, "las partes nombran lanas por id: no cambian");
    const c = smallChart();
    assert.equal(addYarn(c, yarnC).kind, "chart");
  });

  it("removeYarn en un escrito reemplaza sus @id y startYarn por la lana de reemplazo", () => {
    const d = ballPattern();
    d.yarns = [yarnA, yarnB, yarnC];
    const p = d.parts[0]!;
    p.startYarn = "B";
    p.rounds[2] = { ...p.rounds[2]!, items: [{ type: "color", yarn: "B" }, { type: "group", times: 6, items: [sc(), { type: "color", yarn: "C" }, { type: "stitch", stitch: "inc", count: 1 }, { type: "color", yarn: "B" }] }] };
    const r = removeYarn(d, 1, 2); // quita B, reemplaza por C
    assert.deepEqual(r.yarns.map((y) => y.id), ["A", "C"]);
    assert.equal(r.parts[0]!.startYarn, "C");
    assert.equal(JSON.stringify(r.parts).includes('"yarn":"B"'), false);
    assert.ok(validatePattern(r).savable);
    assert.equal(removeYarn(d, 1, 1), d);
  });
});

describe("setAssembly", () => {
  it("normaliza los pasos, quita los vacíos y respeta LIMITS.maxNotes", () => {
    const d = ballPattern();
    const a = setAssembly(d, ["  Coser la cabeza.  \r\nCon aguja lanera. ", "   ", "Bordar."]);
    assert.deepEqual(a.assembly, ["Coser la cabeza.\nCon aguja lanera.", "Bordar."]);
    assert.equal(Object.hasOwn(setAssembly(a, []), "assembly"), false);
    assert.equal(setAssembly(d, Array.from({ length: LIMITS.maxNotes + 1 }, (_, i) => `Paso ${i}`)), d);
    assert.equal(setAssembly(a, ["Coser la cabeza.\nCon aguja lanera.", "Bordar."]), a, "sin cambios");
  });
});

describe("ninguna operación lanza con entradas dañadas", () => {
  it("documentos, rutas e ítems arbitrarios", () => {
    const bad: unknown[] = [null, undefined, 5, "x", {}, { kind: "written" }, { kind: "written", parts: [null], yarns: [] }, smallChart()];
    const ops: Array<(p: WrittenPattern) => unknown> = [
      (p) => renamePart(p, "a", "b"),
      (p) => movePart(p, "a", 0),
      (p) => setCopies(p, "a", 2),
      (p) => removePart(p, "a"),
      (p) => addPart(p, null as unknown as Part),
      (p) => replacePartRounds(p, "a", [null as unknown as Round]),
      (p) => insertRound(p, "a", 0, {} as Round),
      (p) => insertItem(p, "a", 0, [NaN], sc()),
      (p) => moveItem(p, "a", 0, [-1], [0]),
      (p) => wrapInGroup(p, "a", 0, [0], [0], 2),
      (p) => unwrapGroup(p, "a", 0, [0]),
      (p) => setPlacement(p, null as never),
      (p) => clearPlacement(p, null as never),
      (p) => setAssembly(p, null as never),
      (p) => addYarn(p, null as never),
      (p) => removeYarn(p, 0, 1),
      (p) => reorderYarns(p, null as never),
    ];
    for (const b of bad) for (const op of ops) assert.doesNotThrow(() => op(b as WrittenPattern));
    const d = ballPattern();
    for (const path of [[], [1.5], [-1], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "x"] as unknown as number[][]) {
      assert.equal(insertItem(d, "bolita", 0, path, sc()), d);
      assert.equal(removeItem(d, "bolita", 0, path), d);
    }
  });
});

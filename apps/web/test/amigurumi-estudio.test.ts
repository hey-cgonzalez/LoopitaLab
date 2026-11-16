/**
 * Estudio amigurumi (T14 de la fase 4; ADR 0011, secciones 3b, 6, 7 y 8; ADR 0010, T5-1 y T11-*), sin DOM:
 * - almacén fuera de React (operaciones de `edit-written.ts`, historial, ráfagas, `subscribe` y `getSnapshot`);
 * - editor de texto: lectura en cada cambio, forma canónica solo al salir de la línea, líneas sin leer fuera del
 *   documento y en el respaldo, aviso de `#`, dialecto (escribe con `formatPart`, lee con `readingModeFor`);
 * - límites recomendados (medidor y diálogo) con `recommendedLimitUsage`;
 * - revisión con la muestra supuesta y pistas de `data.hints`;
 * - traducción de vueltas concretas con rangos ("V5–8").
 */
import {
  formatPart,
  formatPartLines,
  newWrittenPattern,
  parsePart,
  RECOMMENDED_WRITTEN_LIMITS,
  validatePattern,
  type Part,
  type WrittenPattern,
} from "@loopitalab/pattern-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deepEqual } from "@/lib/amigurumi/equal.ts";
import { crossedLimit, limitSummary, LIMIT_NEAR_RATIO, toneOf } from "@/lib/amigurumi/limits.ts";
import { groupIssues, reviewWritten, stripHints, writtenValidateOptions } from "@/lib/amigurumi/review.ts";
import { concreteIndexOf, roundLabel, sourceIndexOfNumber, sourceOfConcrete } from "@/lib/amigurumi/rounds.ts";
import { applyPartFromText, WrittenStore } from "@/lib/amigurumi/store.ts";
import { canonicalLine, roundLinesIn, TextBuffers } from "@/lib/amigurumi/text-buffers.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";
import { Autosave, AUTOSAVE_DEBOUNCE_MS, backupKey, PENDING_TEXT_BACKUP_MS, readBackup, type AutosaveDeps, type BackupStorage } from "@/lib/studio/autosave.ts";
import { decideRecovery } from "@/lib/studio/backup-recovery.ts";

const ID = "aaaaaaaa-0000-4000-8000-0000000000a1";
const OWNER = "11111111-0000-4000-8000-0000000000a1";
const T0 = "2026-11-14T10:00:00.000000+00:00";
const T1 = "2026-11-14T10:00:05.000000+00:00";

const YARN_A = { id: "A", weight: 4 as const, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#E9DDBE", paletteId: "crudo" } };
const YARN_B = { id: "B", weight: 4 as const, composition: [{ fiber: "algodon", percent: 100 }], color: { hex: "#BA222C", paletteId: "rojo" } };

function doc(extra: Partial<WrittenPattern> = {}): WrittenPattern {
  return { ...newWrittenPattern({ id: ID, title: "Osito", yarns: [YARN_A, YARN_B], partName: "Cuerpo" }), ...extra };
}

function part(text: string, id = "p1"): Part {
  const r = parsePart(text, { id });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const EAR = part(["Parte: Oreja", "Cantidad: 2", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3-5: 12 pb (12)"].join("\n"), "oreja");

function memoryStorage(): BackupStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe("deepEqual", () => {
  it("no depende del orden de las claves y trata undefined como ausente", () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, x: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
  });
});

describe("almacén del amigurumi (fuera de React)", () => {
  it("getSnapshot y subscribe alimentan al visor; una acción sin efecto no avisa ni entra al historial", () => {
    const store = new WrittenStore(doc());
    const seen: WrittenPattern[] = [];
    store.subscribe(() => seen.push(store.getSnapshot()));
    expect(store.dispatch({ type: "movePart", partId: "p1", toIndex: 0 })).toBe(false);
    expect(seen).toHaveLength(0);
    expect(store.getState().canUndo).toBe(false);
    expect(store.dispatch({ type: "addPart", part: EAR })).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.parts.map((p) => p.id)).toEqual(["p1", "oreja"]);
    expect(store.getSnapshot()).toBe(store.doc);
  });

  it("deshacer y rehacer restauran el documento; el título queda fuera del historial", () => {
    const store = new WrittenStore(doc());
    store.dispatch({ type: "addPart", part: EAR });
    expect(store.setTitle("Osito panda")).toEqual({ ok: true, changed: true });
    expect(store.undo()).toBe(true);
    expect(store.doc.parts).toHaveLength(1);
    expect(store.doc.title).toBe("Osito panda");
    expect(store.redo()).toBe(true);
    expect(store.doc.parts).toHaveLength(2);
    expect(store.setTitle("").ok).toBe(false);
  });

  it("una ráfaga (teclas seguidas) es un solo paso de deshacer", () => {
    const store = new WrittenStore(doc());
    store.beginStroke();
    store.dispatch({ type: "renamePart", partId: "p1", name: "Cuer" });
    store.dispatch({ type: "renamePart", partId: "p1", name: "Cuerpo grande" });
    store.endStroke();
    store.undo();
    expect(store.doc.parts[0]?.name).toBe("Cuerpo");
    expect(store.getState().canUndo).toBe(false);
  });

  it("simulate no cambia el documento; removePart y setCopies informan las piezas sin ubicar", () => {
    const base = doc({ parts: [doc().parts[0] as Part, EAR] });
    const withLayout: WrittenPattern = {
      ...base,
      layout: { placements: [{ target: { part: "oreja", copy: 1 }, at: { type: "surface", host: { part: "p1", copy: 0 }, round: 1, stitch: 0, offsetCm: 0, rotationDeg: [0, 0, 0], attach: "end" } }] },
    };
    expect(validatePattern(withLayout).savable).toBe(true);
    const store = new WrittenStore(withLayout);
    const sim = store.simulate({ type: "removePart", partId: "p1" });
    expect(sim.unplaced).toEqual([{ part: "oreja", copy: 1 }]);
    expect(store.doc).toBe(withLayout);
    const r = store.run({ type: "setCopies", partId: "oreja", copies: 1 });
    expect(r.changed).toBe(true);
    expect(store.doc.layout).toBeUndefined();
  });

  it("quitar una lana usada la reemplaza en los @id y en startYarn (CA4-E10)", () => {
    const p = part(["Parte: Cuerpo", "Lana: B", "V1: 6 pb (6)", "V2: @A, aum x6 (12)"].join("\n"));
    const store = new WrittenStore(doc({ parts: [p] }));
    expect(store.dispatch({ type: "removeYarn", index: 0, replaceWith: 1 })).toBe(true);
    expect(store.doc.yarns.map((y) => y.id)).toEqual(["B"]);
    expect(formatPart(store.doc.parts[0] as Part)).toContain("V2: @B, 6 aum (12)");
    expect(validatePattern(store.doc).savable).toBe(true);
  });

  it("la muestra solo entra si es válida y null la quita", () => {
    const store = new WrittenStore(doc());
    expect(store.setGauge({ stitchesPer10cm: 0, rowsPer10cm: 20 }).ok).toBe(false);
    expect(store.setGauge({ stitchesPer10cm: 22, rowsPer10cm: 24 })).toEqual({ ok: true, changed: true });
    expect(store.doc.gauge).toEqual({ stitchesPer10cm: 22, rowsPer10cm: 24 });
    store.setGauge(null);
    expect("gauge" in store.doc).toBe(false);
  });
});

describe("aplicar una parte leída del texto", () => {
  it("cambia a la vez el inicio y la construcción en cualquier orden (dos pasadas)", () => {
    const flat = part(["Parte: Panel", "Inicio: cad 11", "Construcción: hileras", "Lana: A", "H1: 10 pb (10)"].join("\n"));
    const d = doc({ parts: [flat] });
    const target = part(["Parte: Panel", "Inicio: cad 1", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)"].join("\n"));
    const r = applyPartFromText(d, "p1", target);
    expect(r.applied).toBe(true);
    expect(deepEqual(r.doc.parts[0], target)).toBe(true);
  });

  it("un tope duro del núcleo deja el documento igual y applied = false", () => {
    const d = doc();
    const huge = part(["Parte: Cuerpo", "V1: 6 pb (6)", "V2: 60000 pb"].join("\n"));
    const r = applyPartFromText(d, "p1", huge);
    expect(r.applied).toBe(false);
    expect(r.doc.parts[0]).toEqual(d.parts[0]);
  });
});

describe("editor de texto por parte", () => {
  const setup = (dialect: "es" | "us" | "uk" = "es", d: WrittenPattern = doc()) => {
    const store = new WrittenStore(d);
    return { store, buffers: new TextBuffers(store, dialect) };
  };

  it("el texto inicial es formatPart del documento en el dialecto, con la línea de cada vuelta (formatPartLines)", () => {
    const { store, buffers } = setup();
    const v = buffers.view("p1")!;
    const f = formatPartLines(store.doc.parts[0] as Part, "es");
    expect(v.text).toBe(f.text);
    expect(v.roundLines).toEqual(f.roundLine);
    expect(v.status).toBe("synced");
    expect(buffers.view("p1")).toBe(v); // estable para useSyncExternalStore
  });

  it("lee en cada cambio y aplica al documento; el texto queda como se escribió (no salta mientras se escribe)", () => {
    const { store, buffers } = setup();
    const text = `${buffers.view("p1")!.text}\nV2: aum x6 (12)\nV3: [pb, aum] x6 (18)`;
    const r = buffers.input("p1", text)!;
    expect(r.view.status).toBe("synced");
    expect(r.view.text).toBe(text);
    expect(store.doc.parts[0]?.rounds).toHaveLength(3);
    expect(r.view.roundLines).toEqual([5, 6, 7]);
  });

  it("avisa aunque el documento no cambie (línea en blanco): el campo controlado muestra lo escrito", () => {
    const { store, buffers } = setup();
    const before = store.doc;
    const calls = vi.fn();
    buffers.subscribe(calls);
    const r = buffers.input("p1", `${buffers.view("p1")!.text}\n`)!;
    expect(store.doc).toBe(before);
    expect(calls).toHaveBeenCalled();
    expect(buffers.view("p1")).toBe(r.view);
    expect(r.view.text.endsWith("\n")).toBe(true);
  });

  it("forma canónica al salir de una línea bien leída (CA4-E7), y nunca si no se lee", () => {
    const { store, buffers } = setup();
    const base = buffers.view("p1")!.text;
    buffers.input("p1", `${base}\nV2: aum x6 (12)`);
    const left = buffers.leaveLine("p1", 5)!;
    expect(left.text.split("\n")[5]).toBe("V2: 6 aum (12)");
    expect(left.delta).toBe("V2: 6 aum (12)".length - "V2: aum x6 (12)".length);
    expect(buffers.view("p1")!.text).toBe(left.text);
    // La forma canónica no cambia el documento (RT2).
    const before = store.doc;
    expect(store.doc.parts[0]?.rounds[1]?.items).toEqual([{ type: "stitch", stitch: "inc", count: 6 }]);
    // Ya canónica: no hay nada que hacer.
    expect(buffers.leaveLine("p1", 5)).toBeNull();
    // Con una línea sin leer, no se toca nada y el documento sigue igual.
    const unread = `${left.text}\nV3: pb x6 (6)\nV4: zzz`;
    buffers.input("p1", unread);
    expect(buffers.leaveLine("p1", 6)).toBeNull();
    expect(buffers.view("p1")!.text).toBe(unread);
    expect(store.doc).toBe(before);
  });

  it("canonicalLine: vueltas, rangos, encabezados y notas", () => {
    const p = part(["Parte: Oreja", "Hacer 2", "Inicio: AM", "Lana: A", "V1: 6 pb (6)", "V2: 6 pb (6)", "V3: 6 pb (6)"].join("\n"));
    expect(canonicalLine("V2 a 3: pb x6 (6)", p, "es", "es-us")).toBe("V2-3: 6 pb (6)");
    expect(canonicalLine("hacer 2", p, "es", "es-us")).toBe("Cantidad: 2");
    expect(canonicalLine("construccion: espiral", p, "es", "es-us")).toBe("Construcción: espiral");
    expect(canonicalLine(">   nota   ", p, "es", "es-us")).toBe(">   nota");
    expect(canonicalLine("# comentario", p, "es", "es-us")).toBeNull();
    expect(canonicalLine("", p, "es", "es-us")).toBeNull();
    expect(canonicalLine("V1: 6 sc (6)", p, "us", "es-us")).toBe("R1: 6 sc (6)");
  });

  it("una línea que no se lee marca línea y columna; el documento no cambia y el texto va al respaldo (CA4-E1, CA4-E9)", () => {
    const { store, buffers } = setup();
    const before = store.doc;
    const text = `${buffers.view("p1")!.text}\nV2: aum x6, foo (12)`;
    const r = buffers.input("p1", text)!;
    expect(r.view.status).toBe("unread");
    expect(store.doc).toBe(before);
    const e = r.view.errors[0]!;
    expect(e.path).toMatch(/^texto:6:\d+$/);
    expect((e.data as { line: number }).line).toBe(6);
    expect(buffers.pendingTexts()).toEqual({ p1: text });
    // Corregir la línea la aplica y la saca del respaldo.
    buffers.input("p1", text.replace(", foo", ""));
    expect(buffers.pendingTexts()).toEqual({});
    expect(store.doc.parts[0]?.rounds).toHaveLength(2);
  });

  it("acepta ES y US mezclados en modo es-us (CA4-E1)", () => {
    const { store, buffers } = setup();
    buffers.input("p1", ["Parte: Cuerpo", "Inicio: AM", "V1: 6 sc (6)", "V2: inc x6 (12)", "V3: [pb, aum] x6 (18)"].join("\n"));
    expect(store.doc.parts[0]?.rounds).toHaveLength(3);
    expect(formatPart(store.doc.parts[0] as Part, "es")).toContain("V2: 6 aum (12)");
  });

  it("avisa de los comentarios con # (CA4-E5), también cuando la lectura falla", () => {
    const { buffers } = setup();
    const r = buffers.input("p1", `${buffers.view("p1")!.text}\n# esto no se guarda`)!;
    expect(r.view.status).toBe("synced");
    expect(r.view.warnings.map((w) => w.code)).toContain("PARSE_COMMENT");
    const bad = buffers.input("p1", `# nota\nV1: zzz`)!;
    expect(bad.view.status).toBe("unread");
    expect(bad.view.warnings.map((w) => w.code)).toContain("PARSE_COMMENT");
  });

  it("un cambio desde fuera (deshacer) vuelve a escribir el texto; uno con líneas sin leer se conserva", () => {
    const { store, buffers } = setup();
    buffers.input("p1", `${buffers.view("p1")!.text}\nV2: aum x6 (12)`);
    store.undo();
    expect(buffers.view("p1")!.text).toBe(formatPart(store.doc.parts[0] as Part, "es"));
    const unread = `${buffers.view("p1")!.text}\nV2: ???`;
    buffers.input("p1", unread);
    store.dispatch({ type: "renamePart", partId: "p1", name: "Cabeza" });
    expect(buffers.view("p1")!.text).toBe(unread);
    buffers.discard("p1");
    expect(buffers.view("p1")!.text).toContain("Parte: Cabeza");
  });

  it("el dialecto UK escribe con formatPart(part, 'uk') y lee con es-uk: dc es punto bajo", () => {
    const { store, buffers } = setup("uk");
    expect(buffers.mode).toBe("es-uk");
    expect(buffers.view("p1")!.text).toContain("R1: 6 dc (6)");
    buffers.input("p1", ["Part: Cuerpo", "Start: MR", "R1: 6 dc (6)", "R2: inc x6 (12)", "R3: 12 tr (12)"].join("\n"));
    const p = store.doc.parts[0] as Part;
    expect(p.rounds[0]?.items).toEqual([{ type: "stitch", stitch: "sc", count: 6 }]);
    expect(p.rounds[2]?.items).toEqual([{ type: "stitch", stitch: "dc", count: 12 }]);
    // El modo de lectura nunca entra al documento.
    expect(JSON.stringify(store.doc)).not.toMatch(/es-uk|mode/);
  });

  it("en US, dc es punto alto; en UK, sc da error con pista del otro dialecto", () => {
    const us = setup("us");
    us.buffers.input("p1", ["Part: Cuerpo", "R1: 6 sc (6)", "R2: 6 dc (6)"].join("\n"));
    expect(us.store.doc.parts[0]?.rounds[1]?.items).toEqual([{ type: "stitch", stitch: "dc", count: 6 }]);
    const uk = setup("uk");
    const r = uk.buffers.input("p1", ["Part: Cuerpo", "R1: 6 sc (6)"].join("\n"))!;
    expect(r.view.status).toBe("unread");
    expect(r.view.errors[0]?.code).toBe("PARSE_UNKNOWN_STITCH");
  });

  it("las notas (>) y un cierre de varias líneas entran al documento y vuelven igual (CA4-E4)", () => {
    const { store, buffers } = setup();
    const text = ["Parte: Cuerpo", "Inicio: AM", "Construcción: espiral", "Lana: A", "V1: 6 pb (6)", "> Marca el inicio.", "> Con un marcador.", "Cierre: rellenar y cerrar.", "> Deja una hebra larga."].join("\n");
    buffers.input("p1", text);
    const p = store.doc.parts[0] as Part;
    expect(p.rounds[0]?.note).toBe("Marca el inicio.\nCon un marcador.");
    expect(p.finish).toBe("rellenar y cerrar.\nDeja una hebra larga.");
    expect(formatPart(p, "es")).toBe(text);
  });

  it("roundLinesIn salta comentarios, notas y líneas vacías", () => {
    expect(roundLinesIn(["Parte: X", "", "# c", "V1: 6 pb (6)", "> n", "V2-4: 6 pb (6)"].join("\n"), "es-us")).toEqual([4, 6]);
  });

  it("bajar la cantidad desde el texto informa las piezas sin ubicar", () => {
    const withLayout: WrittenPattern = {
      ...doc({ parts: [doc().parts[0] as Part, EAR] }),
      layout: { placements: [{ target: { part: "p1", copy: 0 }, at: { type: "surface", host: { part: "oreja", copy: 1 }, round: 1, stitch: 0, offsetCm: 0, rotationDeg: [0, 0, 0], attach: "end" } }] },
    };
    const { buffers } = setup("es", withLayout);
    const text = buffers.view("oreja")!.text.replace("Cantidad: 2\n", "");
    const r = buffers.input("oreja", text)!;
    expect(r.unplaced).toEqual([{ part: "p1", copy: 0 }]);
  });

  it("restore devuelve al editor el texto sin leer de un respaldo", () => {
    const { buffers } = setup();
    buffers.restore({ p1: "V1: ???" });
    expect(buffers.view("p1")!.status).toBe("unread");
    expect(buffers.pendingTexts()).toEqual({ p1: "V1: ???" });
  });
});

describe("límites recomendados (solo advierten, del motor)", () => {
  it("tono: desde el 80 % avisa, sobre el valor supera", () => {
    expect(LIMIT_NEAR_RATIO).toBe(0.8);
    expect(toneOf(31_999, 40_000)).toBe("ok");
    expect(toneOf(32_000, 40_000)).toBe("near");
    expect(toneOf(40_000, 40_000)).toBe("near");
    expect(toneOf(40_001, 40_000)).toBe("over");
  });

  it("el medidor usa recommendedLimitUsage: puntos de la escena y partes desde el inicio (CA4-E12)", () => {
    const s = limitSummary(doc());
    expect(s.byLimit.sceneStitches.value).toBe(6);
    expect(s.byLimit.sceneStitches.recommended).toBe(RECOMMENDED_WRITTEN_LIMITS.sceneStitches);
    expect(s.byLimit.parts.value).toBe(1);
    expect(AMIGURUMI_TEXTS.limites.medidor(12_400)).toBe("12.400 de 40.000 puntos recomendados en la escena");
    expect(AMIGURUMI_TEXTS.limites.partes(6)).toBe("6 de 20 partes recomendadas");
  });

  it("una vuelta de más de 200 puntos se marca junto a ella (por número visible)", () => {
    const p = part(["Parte: Cuerpo", "V1: 6 pb (6)", "V2-3: 240 pb"].join("\n"));
    const s = limitSummary(doc({ parts: [p] }));
    expect([...(s.roundsOver.get("p1") ?? [])]).toEqual([2, 3]);
    expect(sourceIndexOfNumber(p, 3)).toBe(1);
  });

  it("crossedLimit: la acción que supera un límite pide confirmación una vez por límite en la sesión", () => {
    const many = doc({ parts: Array.from({ length: 20 }, (_, i) => ({ ...(doc().parts[0] as Part), id: `p${i + 1}`, name: `P${i + 1}` })) });
    const store = new WrittenStore(many);
    const add = { type: "addPart" as const, part: { ...(doc().parts[0] as Part), id: "p21", name: "P21" } };
    const sim = store.simulate(add);
    expect(crossedLimit(store.doc, sim.doc, new Set())?.limit).toBe("parts");
    expect(crossedLimit(store.doc, sim.doc, new Set(["parts"]))).toBeNull();
    // Cancelar no cambia nada (simulate no aplica); bajar la cantidad nunca pregunta.
    expect(store.doc).toBe(many);
    const ear = doc({ parts: [{ ...EAR, copies: 11 }] });
    const s2 = new WrittenStore(ear);
    expect(crossedLimit(s2.doc, s2.simulate({ type: "setCopies", partId: "oreja", copies: 10 }).doc, new Set())).toBeNull();
    expect(crossedLimit(s2.doc, s2.simulate({ type: "setCopies", partId: "oreja", copies: 12 }).doc, new Set())?.limit).toBe("copiesPerPart");
  });
});

describe("revisión diferida", () => {
  it("sin muestra valida con assumedGaugeOf (por parte, de suggestedGauge); con muestra, sin supuesto", () => {
    const d = doc();
    const o = writtenValidateOptions(d);
    const r = o.assumedGaugeOf?.(d.parts[0]!, 0);
    expect(r?.gauge).toBeDefined();
    expect(r?.stitch === "sc" || r?.stitch === "dc").toBe(true);
    expect(o.weightCat).toBeUndefined();
    const g = writtenValidateOptions(doc({ gauge: { stitchesPer10cm: 20, rowsPer10cm: 22 } }));
    expect(g.assumedGaugeOf).toBeUndefined();
    expect(g.weightCat).toBeUndefined();
  });

  it("los errores van junto a su vuelta (parts[i].rounds[j]) y las pistas aparte (data.hints)", () => {
    const p = part(["Parte: Cuerpo", "Construcción: cerrada", "V1: 6 pb (6)", "V2: 7 pb (7)"].join("\n"));
    const d = doc({ parts: [p] });
    const r = reviewWritten(d);
    expect(r.savable).toBe(true);
    expect(r.valid).toBe(false);
    const items = r.byPart.get("p1")?.byRound.get(1) ?? [];
    const mismatch = items.find((i) => i.issue.code === "ROUND_CONSUMPTION_MISMATCH")!;
    expect(mismatch.hints).toEqual(["join"]);
    expect(mismatch.issue.message.endsWith(AMIGURUMI_TEXTS.pistas.join)).toBe(true); // mismos textos que el motor
    expect(mismatch.message.endsWith(AMIGURUMI_TEXTS.pistas.join)).toBe(false);
    expect(mismatch.draft).toBe(true);
  });

  it("stripHints y groupIssues con problemas del documento", () => {
    expect(stripHints(`Algo. ${AMIGURUMI_TEXTS.pistas.ring}`, ["ring"])).toBe("Algo.");
    const g = groupIssues(doc(), [{ code: "X", severity: "warning", path: "yarns[0]", message: "m" }]);
    expect(g.general).toHaveLength(1);
    expect(g.warnings).toBe(1);
  });
});

describe("vueltas concretas y rangos (V5–8)", () => {
  const p = part(["Parte: Cuerpo", "V1: 6 pb (6)", "V2: aum x6 (12)", "V3-6: 12 pb (12)", "V7: dism x6 (6)"].join("\n"));
  it("el visor habla en vueltas concretas 0-based; el estudio en vueltas del documento y números visibles", () => {
    expect(concreteIndexOf(p, 2)).toBe(2); // V3 es la tercera vuelta tejida
    expect(concreteIndexOf(p, 3)).toBe(6); // V7 viene después de V3, V4, V5 y V6
    expect(sourceOfConcrete(p, 4)).toEqual({ sourceIndex: 2, number: 5 }); // V5, dentro de "V3-6"
    expect(sourceOfConcrete(p, 6)).toEqual({ sourceIndex: 3, number: 7 });
    expect(sourceOfConcrete(p, 99)).toBeNull();
    expect(roundLabel(p, 2)).toBe("V3–6");
  });
});

describe("respaldo local de las líneas sin leer (CA4-E9)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(save = vi.fn().mockResolvedValue({ ok: true, updatedAt: T1, draft: false })) {
    const store = new WrittenStore({ ...doc(), id: ID });
    const storage = memoryStorage();
    const autosave = new Autosave<WrittenPattern>(store, { patternId: ID, ownerId: OWNER, initialUpdatedAt: T0, save: save as unknown as AutosaveDeps<WrittenPattern>["save"], storage });
    autosave.start();
    return { store, storage, autosave, save };
  }

  it("se escribe poco después, sin ser un cambio del documento, y sobrevive al guardado", async () => {
    const { store, storage, autosave, save } = setup();
    autosave.setPendingText({ p1: "V1: ???" });
    expect(autosave.hasUnsaved).toBe(false);
    await vi.advanceTimersByTimeAsync(PENDING_TEXT_BACKUP_MS);
    expect(readBackup(storage, OWNER, ID)?.pendingText).toEqual({ p1: "V1: ???" });
    store.dispatch({ type: "renamePart", partId: "p1", name: "Cabeza" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(save.mock.calls[0]?.[1])).not.toContain("???");
    // Guardado: el respaldo queda solo por el texto sin leer.
    expect(readBackup(storage, OWNER, ID)?.pendingText).toEqual({ p1: "V1: ???" });
    autosave.setPendingText({});
    await vi.advanceTimersByTimeAsync(PENDING_TEXT_BACKUP_MS);
    expect(storage.data.has(backupKey(OWNER, ID))).toBe(false);
  });

  it("decideRecovery ofrece el respaldo con solo texto sin leer, y descarta el de partes que ya no existen", () => {
    const server = { ...doc(), id: ID };
    const offer = decideRecovery<WrittenPattern>({ v: 2, ownerId: OWNER, baseUpdatedAt: T0, savedAt: Date.now(), document: server, pendingText: { p1: "V1: ???", otra: "x" } }, server, T0);
    expect(offer.kind).toBe("offer");
    if (offer.kind === "offer") expect(offer.recovery.pendingText).toEqual({ p1: "V1: ???" });
    expect(decideRecovery<WrittenPattern>({ v: 2, ownerId: OWNER, baseUpdatedAt: T0, savedAt: Date.now(), document: server, pendingText: { otra: "x" } }, server, T0).kind).toBe("discard");
  });

  it("un texto sin leer dañado no invalida el respaldo; solo se ignora", () => {
    const storage = memoryStorage();
    storage.setItem(backupKey(OWNER, ID), JSON.stringify({ v: 2, ownerId: OWNER, baseUpdatedAt: T0, savedAt: Date.now(), document: doc(), pendingText: { p1: 5 } }));
    const b = readBackup(storage, OWNER, ID);
    expect(b).not.toBeNull();
    expect(b?.pendingText).toBeUndefined();
  });
});

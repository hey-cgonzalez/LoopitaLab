import { newChartPattern, readingDirection } from "@loopitalab/pattern-core";
import { PALETTE } from "@loopitalab/yarn-catalog";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextTabId, noticeReserve, revealOffset } from "@/lib/studio/a11y.ts";
import type { SaveStatus } from "@/lib/studio/autosave.ts";
import { contrastRatio, inkFor } from "@/lib/studio/color.ts";
import { columnLabel, moveFocus } from "@/lib/studio/editor-grid.ts";
import { SAVED_SPEAK_GAP_MS, saveAnnouncement, type SpokenSave } from "@/lib/studio/save-status.ts";
import { STUDIO_TEXTS, cellAnnouncement, editorLabel, lostStitchNote, readingNote, shapingLine, reviewSummary, yarnAddedText, yarnButtonLabel, yarnMovedText, yarnRemovedText } from "@/lib/studio-texts.ts";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** Valor de un token `--color-*` de globals.css. */
function token(name: string): string {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`Falta el token --color-${name}`);
  return m[1] as string;
}

describe("contraste de los tokens de color (WCAG 2.2 AA)", () => {
  const fondos = ["superficie", "fondo"] as const;
  it("el texto llega a 4,5:1 sobre la superficie y sobre el fondo", () => {
    for (const texto of ["marino", "tinta-suave", "error", "exito"]) {
      for (const f of fondos) {
        expect(contrastRatio(token(texto), token(f)), `${texto} sobre ${f}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("el texto blanco sobre los botones llenos llega a 4,5:1", () => {
    for (const f of ["marino", "indigo", "error", "exito"]) {
      expect(contrastRatio("#ffffff", token(f)), `blanco sobre ${f}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("el borde de los campos llega a 3:1 sobre la superficie y sobre el fondo (componentes de interfaz)", () => {
    for (const f of fondos) expect(contrastRatio(token("borde"), token(f)), `borde sobre ${f}`).toBeGreaterThanOrEqual(3);
  });
  it("el foco de dos tonos se ve sobre claro (marino) y sobre oscuro (mostaza), al menos 3:1", () => {
    for (const f of fondos) expect(contrastRatio(token("marino"), token(f))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(token("mostaza"), token("marino"))).toBeGreaterThanOrEqual(3);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*box-shadow:[^}]*var\(--color-marino\)/);
  });
  it("la letra de cada lana de la paleta propia se lee a 4,5:1 sobre su color", () => {
    for (const c of PALETTE) expect(contrastRatio(c.hex, inkFor(c.hex)), c.id).toBeGreaterThanOrEqual(4.5);
  });
  it("los campos del estudio usan el borde con contraste y no el separador decorativo", () => {
    for (const f of ["../src/components/studio/YarnPanel.tsx", "../src/components/studio/StudioSidebar.tsx"]) {
      const line = read(f)
        .split("\n")
        .find((l) => l.startsWith("const FIELD"));
      expect(line, f).toBeDefined();
      expect(line).toContain("border-borde");
      expect(line).not.toContain("border-linea");
    }
  });
});

describe("aviso fijo de prototipo (WCAG 2.4.11)", () => {
  it("reserva su alto medido como scroll-padding de la página", () => {
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-bottom:\s*calc\(var\(--aviso-alto,\s*0px\)\s*\+\s*1rem\)/);
    expect(read("../src/components/studio/StudioNotices.tsx")).toContain('"--aviso-alto"');
  });
  it("el valor publicado es el alto en px, redondeado hacia arriba, y 0 si no es válido", () => {
    expect(noticeReserve(47.2)).toBe("48px");
    expect(noticeReserve(0)).toBe("0px");
    expect(noticeReserve(Number.NaN)).toBe("0px");
    expect(noticeReserve(-5)).toBe("0px");
  });
});

describe("pestañas con teclado", () => {
  const ids = ["editor", "preview", "settings"] as const;
  it("flechas, Inicio y Fin; dan la vuelta en los extremos", () => {
    expect(nextTabId(ids, "editor", "ArrowRight")).toBe("preview");
    expect(nextTabId(ids, "settings", "ArrowRight")).toBe("editor");
    expect(nextTabId(ids, "editor", "ArrowLeft")).toBe("settings");
    expect(nextTabId(ids, "preview", "Home")).toBe("editor");
    expect(nextTabId(ids, "preview", "End")).toBe("settings");
  });
  it("otras teclas no mueven (Tab sigue su camino y no hay trampa)", () => {
    expect(nextTabId(ids, "editor", "Tab")).toBeNull();
    expect(nextTabId(ids, "editor", "Enter")).toBeNull();
    expect(nextTabId(ids, "otra" as never, "ArrowRight")).toBeNull();
  });
});

describe("la casilla enfocada se mantiene a la vista", () => {
  it("no mueve si ya se ve", () => {
    expect(revealOffset(100, 300, 150, 24)).toBe(100);
  });
  it("sube o baja lo justo, con margen", () => {
    expect(revealOffset(100, 300, 50, 24, 8)).toBe(42);
    expect(revealOffset(0, 300, 400, 24, 8)).toBe(132);
  });
  it("nunca devuelve un desplazamiento negativo ni NaN", () => {
    expect(revealOffset(0, 300, 2, 24, 8)).toBe(0);
    expect(revealOffset(10, Number.NaN, 5, 24)).toBe(10);
  });
});

describe("anuncio de la casilla enfocada (CA-A3)", () => {
  const chart = (workedIn: "rows" | "rounds") =>
    newChartPattern({
      id: "d",
      title: "T",
      width: 4,
      height: 4,
      repeat: { x: 1, y: 1 },
      workedIn,
      renderAs: workedIn === "rounds" ? "tube" : "flat",
      direction: "bottom_up",
      yarns: [{ id: "A", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#ffffff" } }],
    }).chart;

  it("E18: las casillas se numeran de derecha a izquierda; con espejo, de izquierda a derecha", () => {
    expect([0, 1, 2, 3].map((x) => columnLabel(x, 4, false))).toEqual([4, 3, 2, 1]);
    expect([0, 1, 2, 3].map((x) => columnLabel(x, 4, true))).toEqual([1, 2, 3, 4]);
    for (let w = 1; w < 12; w++) for (let x = 0; x < w; x++) {
      expect(columnLabel(x, w, false)).toBeGreaterThanOrEqual(1);
      expect(columnLabel(x, w, false) + columnLabel(x, w, true)).toBe(w + 1);
    }
    // El anuncio usa la misma numeración que los números dibujados.
    expect(cellAnnouncement(1, columnLabel(3, 4, false), "Lana A", "rounds")).toBe("Vuelta 1, casilla 1, Lana A");
  });
  it("la casilla donde se pierde un punto y las disminuciones dicen vuelta o fila", () => {
    expect(lostStitchNote(4, 2, "rounds")).toContain("(vuelta 4, casilla 2)");
    expect(lostStitchNote(4, 2, "rows")).toContain("(fila 4, casilla 2)");
    expect(shapingLine(31, 56, -8, -1, "rounds")).toBe("Vuelta 31: 56 pts, −8 en la vuelta, −1 por repetición");
    expect(shapingLine(31, 56, -8, -1, "rows")).toBe("Fila 31: 56 pts, −8 en la fila, −1 por repetición");
  });
  it("dice fila o vuelta, casilla y lana", () => {
    expect(cellAnnouncement(3, 5, "Lana B", "rows")).toBe("Fila 3, casilla 5, Lana B");
    expect(cellAnnouncement(3, 5, "Lana B", "rounds")).toBe("Vuelta 3, casilla 5, Lana B");
  });
  it("en ida y vuelta la dirección de lectura alterna por fila y el espejo la invierte", () => {
    const c = chart("rows");
    expect(readingDirection(c, 0)).toBe("right_to_left");
    expect(readingDirection(c, 1)).toBe("left_to_right");
    expect(readingDirection(c, 0, { mirror: true })).toBe("left_to_right");
    expect(readingDirection(c, 1, { mirror: true })).toBe("right_to_left");
  });
  it("el aviso de lectura sigue a la dirección y menciona el espejo", () => {
    expect(readingNote("rows", "right_to_left", false)).toBe("Esta fila se lee de derecha a izquierda. Se teje por el lado derecho.");
    expect(readingNote("rows", "left_to_right", false)).toBe("Esta fila se lee de izquierda a derecha. Se teje por el revés.");
    expect(readingNote("rows", "left_to_right", true)).toBe("Esta fila se lee de izquierda a derecha (lectura en espejo, para zurdas). Se teje por el lado derecho.");
    expect(readingNote("rows", "right_to_left", true)).toContain("Se teje por el revés.");
    expect(readingNote("rounds", "left_to_right", true)).toBe("Esta vuelta se lee de izquierda a derecha (lectura en espejo, para zurdas).");
    expect(readingNote("rounds", "right_to_left", false)).toBe("Esta vuelta se lee de derecha a izquierda.");
    const c = chart("rounds");
    expect(readingNote("rounds", readingDirection(c, 2, { mirror: true }), true)).toContain("de izquierda a derecha");
  });
  it("las flechas siguen la pantalla, también en espejo: arriba sube de fila y derecha va a la casilla siguiente", () => {
    expect(moveFocus({ x: 1, y: 1 }, "ArrowRight", 4, 4)).toEqual({ x: 2, y: 1 });
    expect(moveFocus({ x: 1, y: 1 }, "ArrowUp", 4, 4)).toEqual({ x: 1, y: 2 });
  });
  it("el nombre del editor incluye su tamaño", () => {
    expect(editorLabel(12, 10, "rows")).toBe("Editor del motivo: 12 puntos de ancho y 10 filas de alto");
    expect(editorLabel(1, 1, "rounds")).toBe("Editor del motivo: 1 punto de ancho y 1 vuelta de alto");
  });
  it("las instrucciones y los atajos documentan pintar con teclado y salir con Tab", () => {
    expect(STUDIO_TEXTS.accesibilidad.instrucciones).toContain("Mayús");
    expect(STUDIO_TEXTS.accesibilidad.instrucciones).toContain("Tab");
    const teclas = STUDIO_TEXTS.atajos.lista.map((a) => a.teclas);
    expect(teclas).toContain("Mayús + flechas");
    expect(teclas).toContain("Tab");
  });
});

describe("lanas: nombres y anuncios", () => {
  it("el nombre accesible de cada botón contiene su texto visible (WCAG 2.5.3)", () => {
    expect(yarnButtonLabel(STUDIO_TEXTS.lanas.quitar, "B")).toBe("Quitar lana B");
    expect(yarnButtonLabel(STUDIO_TEXTS.panelLanas.editar, "B")).toContain(STUDIO_TEXTS.panelLanas.editar);
    expect(yarnButtonLabel(STUDIO_TEXTS.panelLanas.subir, "B", " en la lista")).toBe("Subir lana B en la lista");
    expect(yarnButtonLabel(STUDIO_TEXTS.panelLanas.bajar, "B", " en la lista")).toBe("Bajar lana B en la lista");
    expect(yarnButtonLabel(STUDIO_TEXTS.panelLanas.editar, "B")).toBe("Editar lana B");
    expect(yarnButtonLabel(STUDIO_TEXTS.panelLanas.cerrar, "B")).toBe("Cerrar lana B");
    for (const verb of [STUDIO_TEXTS.lanas.quitar, STUDIO_TEXTS.panelLanas.subir, STUDIO_TEXTS.panelLanas.bajar, STUDIO_TEXTS.panelLanas.editar]) {
      expect(yarnButtonLabel(verb, "B")).not.toMatch(/lana lana/i);
      expect(yarnButtonLabel(verb, "B")).toContain(verb);
    }
  });
  it("cada botón de lana es distinto de los demás (no hay dos 'Quitar lana' iguales)", () => {
    const names = ["A", "B", "C"].map((l) => yarnButtonLabel(STUDIO_TEXTS.lanas.quitar, l));
    expect(new Set(names).size).toBe(3);
  });
  it("reordenar, quitar y agregar explican el cambio de letra", () => {
    expect(yarnMovedText("B", "A")).toBe("La lana B ahora es la lana A. El dibujo conserva sus colores.");
    expect(yarnRemovedText("A", "A", true)).toContain("cambiaron de letra");
    expect(yarnRemovedText("C", "A", false)).not.toContain("cambiaron de letra");
    expect(yarnAddedText("D")).toContain("lana D");
  });
});

describe("revisión: resumen para el lector de pantalla", () => {
  it("solo nombra lo que hay, con singular y plural", () => {
    expect(reviewSummary({ cannotKnit: 0, cannotSave: 0, warnings: 0, info: 0 })).toBe("Revisión del diseño: sin avisos.");
    expect(reviewSummary({ cannotKnit: 1, cannotSave: 0, warnings: 2, info: 0 })).toBe("Revisión del diseño: 1 error que impide tejer, 2 advertencias.");
    expect(reviewSummary({ cannotKnit: 0, cannotSave: 2, warnings: 0, info: 1 })).toBe("Revisión del diseño: 2 errores que impiden guardar, 1 aviso informativo.");
  });
  it("el mismo resultado da el mismo texto (la región viva no repite)", () => {
    const c = { cannotKnit: 1, cannotSave: 0, warnings: 3, info: 0 };
    expect(reviewSummary({ ...c })).toBe(reviewSummary({ ...c }));
  });
});

describe("guardado: qué se anuncia", () => {
  const saved: SaveStatus = { kind: "saved", draft: false, at: 0 };
  const speak = (s: SaveStatus, last: SpokenSave | null, now: number) => saveAnnouncement(s, last, now);

  it("calla mientras hay cambios pendientes o se está guardando", () => {
    expect(speak({ kind: "pending" }, null, 0)).toBeNull();
    expect(speak({ kind: "saving" }, null, 0)).toBeNull();
  });
  it("dice 'Guardado' y no lo repite en el siguiente minuto", () => {
    const first = speak(saved, null, 1000);
    expect(first?.text).toBe("Guardado");
    expect(speak(saved, first!.spoken, 1000 + 5_000)).toBeNull();
    expect(speak(saved, first!.spoken, 1000 + SAVED_SPEAK_GAP_MS)?.text).toBe("Guardado");
  });
  it("el borrador se dice una vez y explica por qué", () => {
    const first = speak({ kind: "saved", draft: true, at: 0 }, null, 0);
    expect(first?.text).toContain("borrador");
    expect(speak({ kind: "saved", draft: true, at: 1 }, first!.spoken, 10)).toBeNull();
  });
  it("sin conexión se dice al entrar y no en cada reintento", () => {
    const off: SaveStatus = { kind: "offline", attempt: 1, retryAt: 5000, reason: "network" };
    const first = speak(off, null, 0);
    expect(first?.text).toContain("Sin conexión");
    expect(speak({ ...off, attempt: 2, retryAt: 9000 }, first!.spoken, 4000)).toBeNull();
  });
  it("el conflicto y el bloqueo no se repiten: ya tienen su propia alerta", () => {
    expect(speak({ kind: "conflict", currentUpdatedAt: "x" }, null, 0)).toBeNull();
    expect(speak({ kind: "blocked", issues: [] }, null, 0)).toBeNull();
  });
});

import { NO_STITCH, newChartPattern, readingDirection, rowShapingColumns, type ChartPattern } from "@loopitalab/pattern-core";
import { isNumberedRow } from "@loopitalab/pattern-render";
import { describe, expect, it } from "vitest";
import { contrastRatio, inkFor } from "@/lib/studio/color.ts";
import { gridLayout, gridSize, lostStitchMarks, moveFocus, pointToCell, rowHasNumber, rowNumbering, rowSide, maxCellPx, clampCellPx } from "@/lib/studio/editor-grid.ts";
import { DocumentStore } from "@/lib/studio/store.ts";
import { applyTool, lineCells, toolForKey, yarnIndexForKey } from "@/lib/studio/tools.ts";
import { cellsOfMotifIndex } from "@/components/studio/draw-grid.ts";

const yarn = (id: string, hex: string) => ({ id, weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex } });
function doc(over: Partial<Parameters<typeof newChartPattern>[0]> = {}): ChartPattern {
  return newChartPattern({ id: "d1", title: "T", width: 4, height: 3, repeat: { x: 2, y: 2 }, workedIn: "rows", renderAs: "flat", direction: "bottom_up", yarns: [yarn("A", "#FFFFFF"), yarn("B", "#BA222C")], ...over });
}

describe("cuadrícula: puntero y teclado", () => {
  it("la fila 1 está abajo y x = 0 a la izquierda", () => {
    const l = gridLayout(4, 3, 10);
    expect(pointToCell(l, l.left + 1, l.top + l.rows * 10 - 1)).toEqual({ x: 0, y: 0 });
    expect(pointToCell(l, l.left + 39, l.top + 1)).toEqual({ x: 3, y: 2 });
    expect(pointToCell(l, l.left - 1, l.top + 1)).toBeNull();
    expect(pointToCell(l, Number.NaN, 0)).toBeNull();
  });
  it("las flechas se acotan a los bordes; arriba sube de fila", () => {
    expect(moveFocus({ x: 0, y: 0 }, "ArrowLeft", 4, 3)).toEqual({ x: 0, y: 0 });
    expect(moveFocus({ x: 0, y: 0 }, "ArrowUp", 4, 3)).toEqual({ x: 0, y: 1 });
    expect(moveFocus({ x: 1, y: 2 }, "ArrowUp", 4, 3)).toEqual({ x: 1, y: 2 });
    expect(moveFocus({ x: 1, y: 1 }, "End", 4, 3)).toEqual({ x: 3, y: 1 });
    expect(moveFocus({ x: 1, y: 1 }, "PageUp", 4, 30)).toEqual({ x: 1, y: 6 });
    const same = { x: 1, y: 1 };
    expect(moveFocus(same, "q", 4, 3)).toBe(same);
  });
  it("la vista completa pinta el motivo desde cualquier repetición (CA-F1)", () => {
    const d = doc();
    const s = new DocumentStore(d);
    const size = gridSize(d.chart, "full");
    expect([size.cols, size.rows]).toEqual([8, 6]);
    applyTool(s, "pencil", { x: 5, y: 4 }, 1); // repetición (1,1) → celda (1,1) del motivo
    expect(s.doc.chart.cells[1 * 4 + 1]).toBe(1);
    expect(cellsOfMotifIndex(d.chart, 8, 6, 1 * 4 + 1)).toContainEqual({ x: 5, y: 4 });
  });
  it("el zoom se acota para que el canvas quepa", () => {
    expect(maxCellPx(200, 200)).toBeLessThan(48);
    expect(clampCellPx(1000, 4, 3)).toBe(48);
    expect(clampCellPx(1, 4, 3)).toBe(4);
  });
});

describe("herramientas sobre el almacén", () => {
  it("lápiz, sin punto, relleno y cuentagotas", () => {
    const s = new DocumentStore(doc());
    expect(applyTool(s, "pencil", { x: 0, y: 0 }, 1)).toEqual({ kind: "edit", changed: true });
    expect(applyTool(s, "pencil", { x: 0, y: 0 }, 1)).toEqual({ kind: "edit", changed: false });
    expect(applyTool(s, "eyedropper", { x: 0, y: 0 }, 0)).toEqual({ kind: "pick", yarn: 1 });
    applyTool(s, "nostitch", { x: 1, y: 0 }, 0);
    expect(applyTool(s, "eyedropper", { x: 1, y: 0 }, 0)).toEqual({ kind: "pick", yarn: NO_STITCH });
    applyTool(s, "fill", { x: 3, y: 2 }, 1);
    expect(s.doc.chart.cells.filter((v) => v === 1).length).toBe(11); // todo menos la casilla sin punto y la (0,0) ya pintada cuenta: 12 - 1
  });
  it("un trazo con beginStroke/endStroke se deshace de una vez", () => {
    const s = new DocumentStore(doc());
    s.beginStroke();
    for (const c of lineCells({ x: 0, y: 0 }, { x: 3, y: 0 })) applyTool(s, "pencil", c, 1);
    s.endStroke();
    expect(s.doc.chart.cells.slice(0, 4)).toEqual([1, 1, 1, 1]);
    s.undo();
    expect(s.doc.chart.cells.slice(0, 4)).toEqual([0, 0, 0, 0]);
  });
  it("lineCells no deja huecos y toolForKey / yarnIndexForKey", () => {
    const cells = lineCells({ x: 0, y: 0 }, { x: 5, y: 2 });
    expect(cells[0]).toEqual({ x: 0, y: 0 });
    expect(cells.at(-1)).toEqual({ x: 5, y: 2 });
    for (let i = 1; i < cells.length; i++) expect(Math.max(Math.abs(cells[i]!.x - cells[i - 1]!.x), Math.abs(cells[i]!.y - cells[i - 1]!.y))).toBe(1);
    expect(["l", "R", "c", "s", "x"].map(toolForKey)).toEqual(["pencil", "fill", "eyedropper", "nostitch", null]);
    expect([yarnIndexForKey("2", 2), yarnIndexForKey("3", 2), yarnIndexForKey("0", 5)]).toEqual([1, null, null]);
  });
});

describe("numeración y lectura iguales al SVG", () => {
  it("rowSide sale de readingDirection y respeta el espejo", () => {
    for (const workedIn of ["rows", "rounds"] as const) {
      const c = doc({ workedIn }).chart;
      for (let y = 0; y < 4; y++)
        for (const mirror of [false, true]) expect(rowSide(c, y, mirror) === "right").toBe(readingDirection(c, y, { mirror }) === "right_to_left");
    }
  });
  it("numeración rala con casillas chicas usa isNumberedRow", () => {
    const c = doc({ workedIn: "rows" }).chart;
    const small = rowNumbering(c, 4);
    expect(small.sparse).toBe(true);
    for (let y = 0; y < 30; y++) expect(rowHasNumber(small, y, 30)).toBe(isNumberedRow(y + 1, 30));
    const big = rowNumbering(c, 24);
    expect(big.sparse).toBe(false);
    expect(rowHasNumber(big, 3, 30)).toBe(true);
  });
});

describe("se pierde un punto y contraste", () => {
  it("las marcas salen de rowShapingColumns, en cada repetición", () => {
    const d = doc({ renderAs: "circle", workedIn: "rounds", repeat: { x: 2, y: 1 } });
    const cells = d.chart.cells.slice();
    cells[1 * 4 + 3] = NO_STITCH; // fila 2, columna 4: se pierde un punto
    const c = { ...d.chart, cells };
    const marks = lostStitchMarks(c, "full");
    expect(rowShapingColumns(c, 1).decreases).toEqual([3]);
    expect([marks[1 * 8 + 3], marks[1 * 8 + 7], marks[1 * 8 + 2]]).toEqual([1, 1, 0]);
    expect(marks.reduce((a, b) => a + b, 0)).toBe(2);
  });
  it("la letra de cada lana tiene contraste de al menos 4,5:1", () => {
    for (const hex of ["#FFFFFF", "#000000", "#BA222C", "#CFA02A", "#808080", "#1A2540", "#767676", "#7F7F7F"]) expect(contrastRatio(hex, inkFor(hex))).toBeGreaterThanOrEqual(4.5);
  });
});

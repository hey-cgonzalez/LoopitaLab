import type { Issue } from "@loopitalab/pattern-core";
import { describe, expect, it } from "vitest";
import { compactRanges, groupIssueLines } from "@/lib/studio/issue-groups.ts";

const float = (row: number, yarn: number, length: number): Issue => ({
  code: "CHART_FLOAT_LONG",
  severity: "warning",
  path: "chart.cells",
  message: `En la vuelta ${row + 1}, la hebra mide ${length} puntos (≈${(length * 0.5).toFixed(1).replace(".", ",")} cm).`,
  data: { row, yarn, length, max: 5 },
});
const ctx = { workedIn: "rounds" as const, yarnLabel: (i: number) => (i === 3 ? "la lana D (#CFA92A)" : `la lana ${i}`) };

describe("compactRanges", () => {
  it("compacta rangos", () => {
    expect(compactRanges([2, 3, 4, 5, 8, 10, 11, 12, 19].filter((n) => n < 13))).toBe("2–5, 8, 10–12");
    expect(compactRanges([5, 3, 4, 3])).toBe("3 a 5");
    expect(compactRanges([2, 3])).toBe("2 y 3");
    expect(compactRanges([7])).toBe("7");
  });
});

describe("groupIssueLines", () => {
  it("agrupa hebras por lana con el peor largo", () => {
    const issues = [...Array.from({ length: 18 }, (_, k) => float(k + 1, 3, 10 + k)), float(0, 1, 7)];
    const lines = groupIssueLines(issues, ctx);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.text).toBe(
      "Vueltas 2 a 19: la hebra flotante de la lana D (#CFA92A) llega a 27 puntos (≈ 13,5 cm); conviene enganchar la hebra o cambiar el dibujo. Máximo sugerido: 5 puntos.",
    );
    expect(lines[0]?.details).toHaveLength(18);
    expect(lines[1]?.text).toContain("En la vuelta 1");
  });
  it("usa filas en ida y vuelta y rangos partidos", () => {
    const lines = groupIssueLines([float(1, 3, 6), float(2, 3, 6), float(5, 3, 6)], { ...ctx, workedIn: "rows" });
    expect(lines[0]?.text.startsWith("Filas 2 y 3, 6:")).toBe(true);
  });
  it("agrupa lanas por vuelta", () => {
    const mk = (row: number, colors: number): Issue => ({ code: "CHART_COLORS_PER_ROW", severity: "info", path: "p", message: "m", data: { row, colors } });
    const lines = groupIssueLines([mk(0, 3), mk(1, 4), mk(2, 3)], ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe("Vueltas 1 a 3: usan hasta 4 lanas; en colorwork de hebras lo habitual es 2 por vuelta.");
  });
  it("códigos sin data muestran la cantidad", () => {
    const i: Issue = { code: "OTRO", severity: "info", path: "p", message: "Algo pasa" };
    const lines = groupIssueLines([i, i, i], ctx);
    expect(lines[0]?.text).toBe("Algo pasa (se repite 3 veces)");
    expect(groupIssueLines([i], ctx)[0]?.text).toBe("Algo pasa");
  });
  it("orden estable por primera aparición", () => {
    const a: Issue = { code: "B", severity: "info", path: "p", message: "b" };
    const c: Issue = { code: "A", severity: "info", path: "p", message: "a" };
    expect(groupIssueLines([a, c, a], ctx).map((l) => l.code)).toEqual(["B", "A"]);
  });
});

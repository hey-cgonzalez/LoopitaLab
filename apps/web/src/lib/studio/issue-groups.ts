import type { Issue } from "@loopitalab/pattern-core";
import { issueGroupText, type WorkedIn } from "@/lib/studio-texts.ts";

/** Una línea de la revisión: agrupa avisos del mismo código (y lana) y conserva los originales. */
export interface IssueLine {
  key: string;
  code: string;
  text: string;
  /** Cantidad de avisos originales. */
  count: number;
  /** Mensajes originales, para el "ver detalle". */
  details: Issue[];
}

export interface GroupContext {
  workedIn: WorkedIn;
  /** Color hex de la lana por índice, si se conoce. */
  yarnLabel?: (index: number) => string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Compacta números ascendentes sin repetir en rangos: [2,3,4,5,8,10,11] -> "2–5, 8, 10–11". Un solo rango contiguo se escribe "2 a 19". */
export function compactRanges(values: readonly number[]): string {
  const v = [...new Set(values)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < v.length; ) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === (v[j] as number) + 1) j++;
    const a = v[i] as number;
    const b = v[j] as number;
    parts.push(a === b ? `${a}` : j - i === 1 ? `${a} y ${b}` : `${a}–${b}`);
    i = j + 1;
  }
  if (parts.length === 1 && v.length > 2) return `${v[0]} a ${v[v.length - 1]}`;
  if (parts.length === 1) return parts[0] as string;
  return parts.join(", ");
}

const rowOf = (i: Issue): number | null => (isNum(i.data?.row) ? i.data.row + 1 : null);

function cmOf(i: Issue): string | null {
  const m = /≈\s*([\d.,]+)\s*cm/.exec(i.message);
  return m ? (m[1] as string) : null;
}

/** Agrupa avisos por código (y lana). El orden sigue la primera aparición de cada grupo. */
export function groupIssueLines(issues: readonly Issue[], ctx: GroupContext): IssueLine[] {
  const buckets = new Map<string, Issue[]>();
  for (const i of issues) {
    const yarn = i.code === "CHART_FLOAT_LONG" && isNum(i.data?.yarn) ? `:${i.data.yarn}` : "";
    const key = `${i.code}${yarn}`;
    const b = buckets.get(key);
    if (b) b.push(i);
    else buckets.set(key, [i]);
  }
  const lines: IssueLine[] = [];
  for (const [key, list] of buckets) {
    const first = list[0] as Issue;
    const rows = list.map(rowOf).filter((r): r is number => r !== null);
    const base = { key, code: first.code, count: list.length, details: list };
    if (list.length === 1) {
      lines.push({ ...base, text: first.message });
      continue;
    }
    const known = rows.length === list.length;
    if (first.code === "CHART_FLOAT_LONG" && known) {
      const worst = list.reduce((a, b) => (((b.data?.length as number) ?? 0) > ((a.data?.length as number) ?? 0) ? b : a));
      const yarnIdx = worst.data?.yarn;
      const cm = cmOf(worst);
      const max = list.map((i) => i.data?.max).filter(isNum);
      lines.push({
        ...base,
        text: issueGroupText("float", {
          workedIn: ctx.workedIn,
          ranges: compactRanges(rows),
          count: list.length,
          rowCount: new Set(rows).size,
          yarn: isNum(yarnIdx) && ctx.yarnLabel ? ctx.yarnLabel(yarnIdx) : "una lana",
          ...(isNum(worst.data?.length) ? { length: worst.data.length } : {}),
          ...(cm ? { cm } : {}),
          ...(max.length ? { max: Math.min(...max) } : {}),
        }),
      });
    } else if (first.code === "CHART_COLORS_PER_ROW" && known) {
      const colors = Math.max(...list.map((i) => (isNum(i.data?.colors) ? i.data.colors : 0)));
      lines.push({
        ...base,
        text: issueGroupText("colors", { workedIn: ctx.workedIn, ranges: compactRanges(rows), count: list.length, rowCount: new Set(rows).size, ...(colors ? { colors } : {}) }),
      });
    } else {
      lines.push({ ...base, text: issueGroupText("generic", { workedIn: ctx.workedIn, ranges: "", count: list.length, rowCount: 0, message: first.message }) });
    }
  }
  return lines;
}

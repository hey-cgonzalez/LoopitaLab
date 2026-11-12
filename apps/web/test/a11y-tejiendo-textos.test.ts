import { yarnLetter } from "@loopitalab/pattern-core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HAND_STORAGE_KEY, readHandPreference, writeHandPreference } from "@/lib/projects/hand-pref.ts";
import { conflictQuestionText, PROJECT_TEXTS, repeatAnnouncement, repeatDotText, rowAnnouncementFull, rowCountText } from "@/lib/projects/texts.ts";
import { progressConflictMessage } from "@/lib/projects/messages.ts";

/* T13/T14: textos accesibles del modo tejiendo (anuncios, puntos de repetición), mano de los botones y vuelta/fila. */

const runs = [
  { yarn: 0, count: 3 },
  { yarn: 1, count: 2 },
];
const step = { number: 13, side: "right", reading: "right_to_left", stitches: 36, runs } as const;

describe("rowAnnouncementFull", () => {
  it("en redondo: vuelta, lado, sentido, puntos y lanas de una repetición", () => {
    expect(rowAnnouncementFull("rounds", step, 60, 8)).toBe("Vuelta 13 de 60, por el derecho, de derecha a izquierda, 36 puntos. En cada repetición: 3 A · 2 B.");
  });
  it("en filas dice fila, y por el revés lee de izquierda a derecha", () => {
    const t = rowAnnouncementFull("rows", { ...step, side: "wrong", reading: "left_to_right" }, 60, 8);
    expect(t).toBe("Fila 13 de 60, por el revés, de izquierda a derecha, 36 puntos. En cada repetición: 3 A · 2 B.");
    expect(t).not.toMatch(/vuelta/i);
  });
  it("sin repetición dice «Colores»; un punto va en singular; sin puntos lo avisa con la unidad correcta", () => {
    expect(rowAnnouncementFull("rows", { ...step, stitches: 1, runs: [{ yarn: 0, count: 1 }] }, 4, 1)).toBe("Fila 13 de 4, por el derecho, de derecha a izquierda, 1 punto. Colores: 1 A.");
    expect(rowAnnouncementFull("rounds", { ...step, stitches: 0, runs: [] }, 4, 1)).toBe(`Vuelta 13 de 4, por el derecho, de derecha a izquierda. ${PROJECT_TEXTS.tejiendo.sinPuntos("rounds")}`);
    expect(PROJECT_TEXTS.tejiendo.sinPuntos("rows")).toContain("Esta fila");
  });
});

describe("repeatAnnouncement y repeatDotText", () => {
  it("el índice llega en base 0 y se anuncia en base 1, con la unidad de trabajo", () => {
    expect(repeatAnnouncement("rounds", 13, 2, 8, runs)).toBe("Repetición 3 de 8 de la vuelta 13: 3 A · 2 B");
    expect(repeatAnnouncement("rows", 13, 0, 8, runs)).toBe("Repetición 1 de 8 de la fila 13: 3 A · 2 B");
    expect(repeatAnnouncement("rows", 13, 0, 8, [])).toBe("Repetición 1 de 8 de la fila 13");
  });
  it("cada punto dice si es actual, hecha o por hacer (el color nunca es lo único)", () => {
    expect(repeatDotText(2, 2)).toBe("repetición 3 (actual)");
    expect(repeatDotText(0, 2)).toBe("repetición 1 (hecha)");
    expect(repeatDotText(5, 2)).toBe("repetición 6 (por hacer)");
  });
  it("las letras de lana salen de yarnLetter", () => {
    expect(rowAnnouncementFull("rounds", step, 60, 8)).toContain(`3 ${yarnLetter(0)}`);
  });
});

describe("hand-pref", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("sin valor o con un valor raro devuelve null (manda la mano de la cuenta)", () => {
    const st = mem();
    expect(readHandPreference(st)).toBeNull();
    st.m.set(HAND_STORAGE_KEY, "zurda");
    expect(readHandPreference(st)).toBeNull();
    expect(readHandPreference(null)).toBeNull();
    expect(readHandPreference(undefined)).toBeNull();
  });
  it("guarda y lee left y right en loopitalab:tejiendo:mano", () => {
    const st = mem();
    writeHandPreference(st, "left");
    expect(st.m.get("loopitalab:tejiendo:mano")).toBe("left");
    expect(readHandPreference(st)).toBe("left");
    writeHandPreference(st, "right");
    expect(readHandPreference(st)).toBe("right");
  });
  it("un almacenamiento que lanza no rompe nada", () => {
    const boom = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(readHandPreference(boom)).toBeNull();
    expect(() => writeHandPreference(boom, "left")).not.toThrow();
    expect(() => writeHandPreference(null, "left")).not.toThrow();
  });
});

describe("vuelta y fila según workedIn (F3-9)", () => {
  it("rowCountText: singular y plural", () => {
    expect(rowCountText("rounds", 1)).toBe("1 vuelta");
    expect(rowCountText("rounds", 8)).toBe("8 vueltas");
    expect(rowCountText("rows", 1)).toBe("1 fila");
    expect(rowCountText("rows", 20)).toBe("20 filas");
  });
  it("los textos de Tejiendo y de la ficha nunca mezclan las dos palabras", () => {
    const T = PROJECT_TEXTS.tejiendo;
    const R = PROJECT_TEXTS.repin;
    const rowsOnly = [T.graficoConFila("rows"), T.repeticionesDeFila("rows"), T.sinPuntos("rows"), T.puntosEnLa("rows", 12), T.enLa("rows", 12), R.filaCambio("rows"), R.conservaFila("rows"), R.casillasACero("rows")];
    const roundsOnly = [T.graficoConFila("rounds"), T.repeticionesDeFila("rounds"), T.sinPuntos("rounds"), T.puntosEnLa("rounds", 12), T.enLa("rounds", 12), R.filaCambio("rounds"), R.conservaFila("rounds"), R.casillasACero("rounds")];
    for (const t of rowsOnly) expect(t, t).not.toMatch(/vuelta/i);
    for (const t of roundsOnly) expect(t, t).not.toMatch(/\bfilas?\b/i);
    expect(R.filaCambio("rounds")).toBe("La vuelta en la que vas se teje distinto en la versión nueva: revisa que tu tejido coincida antes de seguir.");
  });
  it("«en la vuelta» sale de la tarjeta de la fila, no de un literal", () => {
    expect(PROJECT_TEXTS.tejiendo.puntosPorRepeticion(1)).toBe("1 punto por repetición");
    expect(PROJECT_TEXTS.tejiendo.puntosMenos(2)).toBe("2 puntos menos que la anterior");
    expect(PROJECT_TEXTS.tejiendo.puntosMenos(1)).toBe("1 punto menos que la anterior");
  });
});

describe("una sola fuente del conflicto de avance", () => {
  const a = { rowsDone: 39, stitchesDone: 0 };
  const b = { rowsDone: 35, stitchesDone: 0 };
  it("el servidor y el diálogo dicen lo mismo; el diálogo solo añade la hora", () => {
    const server = progressConflictMessage("rows", 60, a, b);
    const dialog = conflictQuestionText("rows", 60, a, null, b);
    expect(dialog).toBe(server);
    expect(server).toBe("En otro dispositivo vas en la fila 40. Aquí vas en la fila 36. ¿Con cuál sigues?");
  });
});

describe("render estático", () => {
  it("KnitChartText marca la fila actual con aria-current y texto visible para lectores", async () => {
    const { newChartPattern } = await import("@loopitalab/pattern-core");
    const { planChart } = await import("@loopitalab/follow");
    const { KnitChartText } = await import("@/components/knit/KnitChartText");
    const yarns = [
      { id: "A", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#F4EBD9" } },
      { id: "B", weight: 4 as const, composition: [{ fiber: "lana", percent: 100 }], color: { hex: "#BA222C" } },
    ];
    const doc = newChartPattern({ id: "aaaaaaaa-0000-4000-8000-000000000001", title: "t", width: 4, height: 3, repeat: { x: 2, y: 1 }, workedIn: "rows", renderAs: "flat", direction: "bottom_up", yarns });
    const plan = planChart(doc, { mirror: false });
    const html = renderToStaticMarkup(createElement(KnitChartText, { plan, currentRow: 1 }));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain(PROJECT_TEXTS.tejiendo.filaActualTexto);
    expect(html).toContain("<table");
    expect(html).toContain(PROJECT_TEXTS.tejiendo.columnaFila);
    expect(html).not.toContain(PROJECT_TEXTS.tejiendo.columnaVuelta);
  });
});

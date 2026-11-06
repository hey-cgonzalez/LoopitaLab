/**
 * Seguridad del SVG (T7): se inserta en la web, así que ningún texto del documento puede
 * llegar crudo y ningún color sin revisar puede llegar a un atributo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePattern } from "@loopitalab/pattern-core";
import { chartToSvg, describeChart } from "../src/index.ts";
import { drawChart } from "../src/chart-svg.ts";
import { FALLBACK_HEX, escapeXml, safeHex } from "../src/xml.ts";
import { band } from "./support/fixtures.ts";
import { byClass, parseXml } from "./support/xml.ts";

const ATTACK = `</svg><script>alert("x")</script><img src=x onerror='alert(1)'>&amp;`;

describe("escapeXml", () => {
  it("escapa &, <, >, comillas dobles y simples", () => {
    assert.equal(escapeXml(`a & b < c > d "e" 'f'`), "a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;");
  });

  it("quita caracteres que XML no admite (controles y sustitutos sueltos) y conserva emojis y tildes", () => {
    assert.equal(escapeXml("a\u0000b\u0007c\u001Fd￾e\uD800f"), "abcdef");
    assert.equal(escapeXml("tab\tlínea\n🧶"), "tab\tlínea\n🧶");
  });
});

describe("safeHex", () => {
  it("solo deja pasar #RRGGBB (en mayúsculas)", () => {
    assert.equal(safeHex("#ba222c"), "#BA222C");
    for (const bad of ["red", "#fff", "#GGGGGG", `#123456" onload="x`, "url(javascript:alert(1))", "#1234567", "", null, 12]) {
      assert.equal(safeHex(bad), FALLBACK_HEX, String(bad));
    }
  });
});

describe("chartToSvg: escape del documento", () => {
  it("un título, notas y nota de lana con </svg><script> no aparecen crudos", () => {
    const p = band();
    p.title = ATTACK.slice(0, 100);
    p.notes = [`NOTA-DEL-PATRON ${ATTACK}`];
    p.yarns[0]!.note = `NOTA-PRIVADA ${ATTACK}`;
    assert.equal(validatePattern(p).savable, true);
    const svg = chartToSvg(p, { rowNumbers: true, symbols: true, showRepeats: true });
    assert.equal(svg.includes("<script"), false);
    assert.equal(svg.includes("<img"), false);
    assert.equal(svg.indexOf("</svg>"), svg.length - "</svg>".length, "un solo </svg>, al final");
    const root = parseXml(svg);
    // El título se conserva como texto (escapado), no se pierde.
    assert.equal(root.children.find((c) => c.name === "title")?.text, `Gráfico: ${p.title}`);
    // Las notas no forman parte del gráfico; la nota de la lana es privada (CLAUDE.md, regla 9).
    assert.equal(svg.includes("NOTA-DEL-PATRON"), false);
    assert.equal(svg.includes("NOTA-PRIVADA"), false);
  });

  it("un color inválido no llega al atributo (el validador lo rechaza y el dibujo también lo filtra)", () => {
    const p = band();
    const evil = `#123456" onload="alert(1)`;
    p.yarns[1]!.color.hex = evil;
    // Por la entrada pública: el documento no es savable y no se dibuja.
    const svg = chartToSvg(p, { symbols: true });
    assert.equal(svg.includes("onload"), false);
    // Por el dibujo directo (defensa en profundidad): el color se reemplaza por gris.
    const drawn = drawChart(p, { symbols: true }, { valid: true, savable: true, issues: [] });
    assert.equal(drawn.includes("onload"), false);
    const fills = byClass(parseXml(drawn), "c").map((c) => c.attrs.fill);
    assert.ok(fills.includes(FALLBACK_HEX));
    for (const f of fills) assert.match(f ?? "", /^(#[0-9A-F]{6}|url\(#lr-[0-9a-f]{8}-ns\))$/);
  });

  it("los mensajes del validador y los identificadores también se escapan", () => {
    const p = band();
    p.id = `x"><script>`;
    const issues = [{ code: "X", severity: "warning" as const, path: "", message: `<script>alert(1)</script> & "x"` }];
    const svg = drawChart(p, {}, { valid: true, savable: true, issues });
    assert.equal(svg.includes("<script"), false);
    parseXml(svg);
  });

  it("describeChart devuelve texto plano con el título tal cual (quien lo inserta lo escapa)", () => {
    const p = band();
    p.title = "Gorro <b>";
    assert.match(describeChart(p), /«Gorro <b>»/);
  });
});

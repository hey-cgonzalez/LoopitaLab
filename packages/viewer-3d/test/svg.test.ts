/**
 * `profileToSvg` (ADR 0010, secciones 3, 6b y 8): silueta con relleno de color plano para cuando
 * no hay WebGL2. Cuesta lo que las vueltas, no lo que los puntos.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SILHOUETTE_FALLBACK_HEX, profileToSvg } from "../src/index.ts";
import { fixtureAPart, fixtureBPart, profileOf, readPart } from "./support/fixtures.ts";

const pathOf = (svg: string) => /<path d="([^"]+)"/.exec(svg)?.[1] ?? "";

describe("profileToSvg", () => {
  it("silueta de revolución rellena con el color plano de la lana", () => {
    const svg = profileToSvg(profileOf(fixtureBPart()), { widthPx: 200, fill: "#e9ddbe", title: "Esfera" });
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="200" height="\d+" viewBox="0 0 200 \d+" role="img"><title>Esfera<\/title><path /);
    assert.match(svg, /fill="#E9DDBE"/);
    const pts = pathOf(svg).replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
    assert.ok(pts.every(Number.isFinite));
    const xs = pts.filter((_, i) => i % 2 === 0);
    assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= 200);
    // Simétrica respecto del centro.
    assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs) - 200) < 0.05);
  });

  it("el tambor (A) y la esfera (B) dan siluetas distintas con el mismo diámetro", () => {
    const a = profileToSvg(profileOf(fixtureAPart()));
    const b = profileToSvg(profileOf(fixtureBPart()));
    assert.notEqual(pathOf(a), pathOf(b));
  });

  it("panel en hileras: contorno escalonado", () => {
    const part = readPart("Parte: P\nInicio: cad 11\nConstrucción: hileras\nLana: A\nH1: 10 pb (10)\nH2: 10 pb (10)\nH3: dism, 8 pb (9)");
    const svg = profileToSvg(profileOf(part), { fill: "#112233" });
    assert.ok(pathOf(svg).split("L").length >= 12);
  });

  it("color inválido usa el gris de respaldo; el título se escapa; una parte vacía no dibuja nada", () => {
    const p = profileOf(fixtureAPart());
    assert.match(profileToSvg(p, { fill: "red" }), new RegExp(`fill="${SILHOUETTE_FALLBACK_HEX}"`));
    assert.match(profileToSvg(p, { fill: "#12345" }), new RegExp(`fill="${SILHOUETTE_FALLBACK_HEX}"`));
    const t = profileToSvg(p, { title: `<script>"x" & 'y'</script>` });
    assert.ok(t.includes("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;") && !t.includes("<script>"));
    const empty = profileToSvg({ kind: "revolution", spiral: true, rings: [{ round: 0, stitches: 0, radiusCm: 0, zCm: 0, heightCm: 0, strain: 1 }], heightCm: 0, maxDiameterCm: 0 });
    assert.ok(!empty.includes("<path"));
    assert.ok(!profileToSvg(p, { widthPx: NaN }).includes("NaN"));
  });
});

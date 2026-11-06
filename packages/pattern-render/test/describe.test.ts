import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NO_STITCH, stitchTotal } from "@loopitalab/pattern-core";
import { DESCRIBE_MAX_ISSUES, describeChart } from "../src/index.ts";
import { formatDecimal, formatInt } from "../src/xml.ts";
import { band, chartPattern, yarnA, yarnB, yarnC } from "./support/fixtures.ts";

describe("describeChart", () => {
  it("describe técnica, motivo, repeticiones, total, forma, dirección, muestra y lanas", () => {
    const text = describeChart(band());
    assert.match(text, /^Gráfico de colores a palillo: «Copa»\./);
    assert.match(text, /Motivo de 4 × 3 casillas \(ancho × alto\), repetido 5 veces a lo ancho y 2 veces a lo alto: gráfico completo de 20 × 6 casillas\./);
    assert.match(text, /6 vueltas y 120 puntos en total; cada vuelta tiene 20 puntos\./);
    assert.match(text, /Se teje en redondo, de abajo hacia arriba\. Vista: tubo\./);
    assert.match(text, /Muestra: 24 puntos y 28 vueltas en 10 cm; mide aproximadamente 8,3 cm de circunferencia y 2,1 cm de alto\./);
    assert.match(text, /2 lanas: A, #E9DDBE, 60 puntos; B, #BA222C, 60 puntos\./);
  });

  it("el total coincide con stitchTotal de pattern-core", () => {
    const p = band();
    assert.ok(describeChart(p).includes(`${formatInt(stitchTotal(p.chart))} puntos en total`));
  });

  it('usa "fila" de ida y vuelta y "vuelta" en redondo', () => {
    const p = chartPattern({ width: 2, height: 2, cells: [0, 0, 0, 0], workedIn: "rows", renderAs: "flat" }, [yarnA]);
    const text = describeChart(p);
    assert.match(text, /2 filas y 4 puntos en total; cada fila tiene 2 puntos/);
    assert.match(text, /Se teje de ida y vuelta/);
    assert.match(text, /sin repeticiones/);
    assert.match(text, /1 lana: A, #E9DDBE, 4 puntos\./);
    assert.doesNotMatch(text, /vuelta(s)? /);
  });

  it("nombra el color de la paleta si se entrega paletteName", () => {
    const names: Record<string, string> = { crudo: "Crudo", rojo: "Rojo" };
    const text = describeChart(band(), { paletteName: (id) => names[id] });
    assert.match(text, /A, Crudo \(#E9DDBE\), 60 puntos; B, Rojo \(#BA222C\), 60 puntos/);
  });

  it("informa lanas sin usar, casillas sin punto y el rango de puntos por vuelta", () => {
    // Cuña: 3, 2 y 1 puntos por repetición, 8 repeticiones; una lana sin usar.
    const cells = [0, 0, 0, 0, 0, NO_STITCH, 0, NO_STITCH, NO_STITCH];
    const p = chartPattern({ width: 3, height: 3, cells, repeat: { x: 8, y: 1 }, renderAs: "circle", direction: "top_down" }, [yarnA, yarnB]);
    const text = describeChart(p);
    assert.match(text, /entre 8 y 24 puntos por vuelta/);
    assert.match(text, /El motivo tiene 3 casillas sin punto\./);
    assert.match(text, /B, #BA222C, sin usar/);
    assert.match(text, /de arriba hacia abajo\. Vista: círculo\./);
    assert.match(text, /Sin muestra/);
  });

  it("cita las advertencias y errores de tejido, como máximo tres, y omite la información", () => {
    // Gráfico vacío: error de tejido CHART_EMPTY.
    const empty = chartPattern({ width: 2, height: 1, cells: [NO_STITCH, NO_STITCH] }, [yarnA]);
    const text = describeChart(empty);
    assert.match(text, /0 puntos en total\./);
    assert.match(text, /Avisos: El gráfico no tiene ningún punto\./);
    // Una lana sin usar es solo información: no aparece en los avisos.
    const p = band();
    p.yarns.push(structuredClone(yarnC));
    assert.doesNotMatch(describeChart(p), /Avisos/);
    assert.equal(DESCRIBE_MAX_ISSUES, 3);
  });

  it("resume los avisos que pasan de tres", () => {
    // Ida y vuelta en tubo (advertencia) + hebras largas en varias filas (advertencias).
    const row = [0, 1, 1, 1, 1, 1, 1, 1, 1, 0];
    const cells = [...row, ...row, ...row, ...row, ...row];
    const p = chartPattern({ width: 10, height: 5, cells, workedIn: "rows", renderAs: "tube" }, [yarnA, yarnB]);
    p.gauge = { stitchesPer10cm: 18, rowsPer10cm: 24 };
    const text = describeChart(p);
    assert.match(text, /Avisos: /);
    assert.match(text, /Y \d+ avisos? más\./);
  });

  it("nombra el canesú y la técnica crochet", () => {
    const p = band();
    p.chart.renderAs = "yoke";
    p.technique = "crochet";
    const text = describeChart(p);
    assert.match(text, /a crochet/);
    assert.match(text, /Vista: canesú \(por ahora se dibuja como tubo\)\./);
  });

  it("con errores estructurales no lanza y lo dice", () => {
    const p = band();
    (p.chart as { width: number }).width = 0;
    assert.match(describeChart(p), /No se puede describir el gráfico/);
    assert.doesNotThrow(() => describeChart(undefined as never));
  });

  it("formatea números en español", () => {
    assert.equal(formatInt(9999), "9999");
    assert.equal(formatInt(12500), "12.500");
    assert.equal(formatInt(1_000_000), "1.000.000");
    assert.equal(formatDecimal(7.14), "7,1");
    assert.equal(formatDecimal(50), "50");
    assert.equal(formatDecimal(12345.67), "12.345,7");
    void yarnB;
  });
});

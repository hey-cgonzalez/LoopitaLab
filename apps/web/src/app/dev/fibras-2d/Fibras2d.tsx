"use client";

import { newChartPattern, type Yarn } from "@loopitalab/pattern-core";
import { FIBERS } from "@loopitalab/yarn-catalog";
import { colorize, createCanvasRenderer, fitView, layoutGeometry, yarnLook } from "@loopitalab/stitch-render";
import { useEffect, useRef } from "react";

type Sample = { label: string; composition: Yarn["composition"] };

const W = 300;
const H = 240;

/** Un tubo de un solo color (12 × 10 puntos): se ve el punto, su halo y su brillo. */
function Swatch({ id, sample, hex, flat }: { id: string; sample: Sample; hex: string; flat: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const yarn: Yarn = { id: "A", weight: 3, composition: sample.composition, color: { hex } };
    const p = newChartPattern({ id: "fibra", title: "Fibra", width: 12, height: 10, repeat: { x: 1, y: 1 }, workedIn: "rounds", renderAs: "tube", direction: "bottom_up", yarns: [yarn], gauge: { stitchesPer10cm: 22, rowsPer10cm: 30 } });
    const r = createCanvasRenderer(canvas, { background: "#EFE9DF" });
    r.resize(W, H, 1);
    const layout = layoutGeometry(p.chart, { gauge: p.gauge!, shape: "tube", tubeRotation: 0 });
    colorize(layout, p.chart);
    r.setLooks([yarnLook(yarn, FIBERS, { fiberEffects: !flat })]);
    r.setLayout(layout);
    r.setView(fitView(layout.bounds, W, H, 12));
    r.requestRender();
    canvas.dataset.ready = "true";
    return () => r.destroy();
  }, [sample, hex, flat]);
  return (
    <figure className="grid gap-1">
      <canvas ref={ref} width={W} height={H} style={{ width: W, height: H }} data-testid={`fibra-2d-${id}`} />
      <figcaption className="text-sm">{sample.label}</figcaption>
    </figure>
  );
}

export function Fibras2d({ samples, hex }: { samples: Record<string, Sample>; hex: string }) {
  const entries = Object.entries(samples);
  return (
    <div className="flex flex-wrap gap-4" data-testid="fibras-2d">
      {entries.map(([k, s]) => (
        <Swatch key={k} id={k} sample={s} hex={hex} flat={false} />
      ))}
      <Swatch id="colores-planos" sample={{ label: "Colores planos", composition: samples.algodon!.composition }} hex={hex} flat />
    </div>
  );
}

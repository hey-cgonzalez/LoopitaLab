import { useId } from "react";
import { FABRIC_GAP, knitFabric } from "@/lib/knit-fabric";

/** Tejido decorativo con puntos en V y un motivo de colorwork. Sin JavaScript en el navegador. */
export function KnitFabric({ cols = 32, rows = 40, className }: { cols?: number; rows?: number; className?: string }) {
  const fabric = knitFabric(cols, rows);
  const patternId = `punto-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox={`0 0 ${fabric.width} ${fabric.height}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={patternId} width={fabric.stitchW} height={fabric.stitchH} patternUnits="userSpaceOnUse">
          <rect width={fabric.stitchW} height={fabric.stitchH} fill={FABRIC_GAP} />
          <path d={fabric.baseStitch} fill={fabric.baseColor} />
        </pattern>
      </defs>
      <rect width={fabric.width} height={fabric.height} fill={`url(#${patternId})`} />
      {fabric.paths.map((p) => (
        <path key={p.color} d={p.d} fill={p.color} />
      ))}
    </svg>
  );
}

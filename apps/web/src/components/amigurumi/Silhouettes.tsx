"use client";

import { summarizePart, type WrittenPattern } from "@loopitalab/pattern-core";
import { useMemo } from "react";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";
import { silhouettesOf } from "./metrics.ts";
import { measureText, VIEWER_3D_TEXTS } from "./texts.ts";

const A = AMIGURUMI_TEXTS.a11y;

/**
 * Siluetas de las piezas (`profileToSvg`) con el color plano de la lana inicial (ADR 0010, secciones 6b, 6c y 8):
 * sin WebGL2, con el contexto perdido o sobre `SCENE_HARD_STITCH_CAP`. No carga `three`: cuesta lo que las vueltas.
 * El SVG lo arma `viewer-3d` con números y el nombre escapado; no lleva texto de la usuaria sin escapar.
 * El dibujo es decorativo (`aria-hidden`): cada pieza lleva su texto (nombre, veces que se teje, vueltas y medidas) y la
 * descripción completa del patrón sigue en el estudio (T17; CA4-A2).
 */
export function Silhouettes({ pattern, reason }: { pattern: WrittenPattern; reason: string }) {
  const items = useMemo(() => silhouettesOf(pattern), [pattern]);
  const rounds = useMemo(() => new Map(pattern.parts.map((p) => [p.id, summarizePart(p).rounds] as const)), [pattern]);
  return (
    <div className="grid gap-3" data-testid="visor-3d-siluetas">
      <p className="text-sm" role="status">
        {reason}
      </p>
      <p className="text-sm text-tinta-suave">{A.siluetasAyuda}</p>
      <ul aria-label={A.siluetasEtiqueta} className="flex flex-wrap items-end gap-4">
        {items.map((s) => (
          <li key={s.partId} className="grid max-w-full justify-items-center gap-1 text-center text-sm" data-testid="silueta">
            <span aria-hidden="true" className="max-w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: s.svg }} />
            {/* Lo visible se oculta al lector de pantalla: lee solo la frase completa de abajo, una vez. */}
            <span aria-hidden="true" className="font-semibold">
              {s.name}
              {s.copies > 1 ? ` × ${s.copies}` : ""}
            </span>
            <span aria-hidden="true" className="text-tinta-suave">
              {measureText(s.heightCm, s.widthCm, s.assumed)}
            </span>
            <span className="sr-only">{A.silueta(s.name, s.copies, rounds.get(s.partId) ?? 0, measureText(s.heightCm, s.widthCm, s.assumed))}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-tinta-suave">{VIEWER_3D_TEXTS.soloEn3d}</p>
    </div>
  );
}

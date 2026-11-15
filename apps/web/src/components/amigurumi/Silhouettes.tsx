"use client";

import type { WrittenPattern } from "@loopitalab/pattern-core";
import { useMemo } from "react";
import { silhouettesOf } from "./metrics.ts";
import { measureText, VIEWER_3D_TEXTS } from "./texts.ts";

/**
 * Siluetas de las piezas (`profileToSvg`) con el color plano de la lana inicial (ADR 0010, secciones 6b, 6c y 8):
 * sin WebGL2, con el contexto perdido o sobre `SCENE_HARD_STITCH_CAP`. No carga `three`: cuesta lo que las vueltas.
 * El SVG lo arma `viewer-3d` con números y el nombre escapado; no lleva texto de la usuaria sin escapar.
 */
export function Silhouettes({ pattern, reason }: { pattern: WrittenPattern; reason: string }) {
  const items = useMemo(() => silhouettesOf(pattern), [pattern]);
  return (
    <div className="grid gap-3" data-testid="visor-3d-siluetas">
      <p className="text-sm" role="status">
        {reason}
      </p>
      <ul className="flex flex-wrap items-end gap-4">
        {items.map((s) => (
          <li key={s.partId} className="grid justify-items-center gap-1 text-center text-xs">
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: s.svg }} />
            <span className="font-semibold">
              {s.name}
              {s.copies > 1 ? ` × ${s.copies}` : ""}
            </span>
            <span className="text-tinta-suave">{measureText(s.heightCm, s.widthCm, s.assumed)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-tinta-suave">{VIEWER_3D_TEXTS.soloEn3d}</p>
    </div>
  );
}

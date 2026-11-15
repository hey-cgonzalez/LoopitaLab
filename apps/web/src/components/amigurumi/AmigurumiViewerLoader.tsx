"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AmigurumiViewerProps } from "./AmigurumiViewer.tsx";
import { VIEWER_3D_TEXTS as T } from "./texts.ts";

/**
 * `three` y r3f solo se cargan en el cliente y solo donde se monta este cargador (`next/dynamic` con `ssr: false`,
 * ADR 0010, sección 5): el JS inicial de las demás rutas no cambia.
 */
const AmigurumiViewer = dynamic(() => import("./AmigurumiViewer.tsx"), {
  ssr: false,
  loading: () => <p className="text-sm text-tinta-suave">{T.cargando}</p>,
});

/** Las siluetas también van aparte: el perfil y el SVG no entran en el JS inicial de la ruta. */
const Silhouettes = dynamic(() => import("./Silhouettes.tsx").then((m) => m.Silhouettes), {
  ssr: false,
  loading: () => <p className="text-sm text-tinta-suave">{T.cargando}</p>,
});

/** "Sin WebGL" = sin WebGL2 (enmienda V-2): un contexto que solo ofrece WebGL1 cuenta como sin WebGL. */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    const ok = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext(); // libera el contexto de prueba
    return ok;
  } catch {
    return false;
  }
}

export function AmigurumiViewerLoader(props: AmigurumiViewerProps & { forceNoWebGL?: boolean }) {
  const { forceNoWebGL, ...rest } = props;
  const [support, setSupport] = useState<"checking" | "webgl2" | "none">("checking");
  const pattern = useSyncExternalStore(props.source.subscribe, props.source.getSnapshot, props.source.getSnapshot);
  useEffect(() => setSupport(!forceNoWebGL && hasWebGL2() ? "webgl2" : "none"), [forceNoWebGL]);

  if (support === "checking") return <p className="text-sm text-tinta-suave">{T.cargando}</p>;
  if (support === "webgl2") return <AmigurumiViewer {...rest} />;
  return (
    <section className="grid gap-3" aria-label="Vista de las piezas" data-testid="visor-3d" data-mode="sin-webgl">
      <p className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm" role="note" data-testid="visor-3d-aviso">
        {T.avisoPrototipo}
      </p>
      <Silhouettes pattern={pattern} reason={T.sinWebgl} />
    </section>
  );
}

"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";
import { PrototypeEngine, type VisorApi, type VisorInfo } from "./engine.ts";

declare global {
  interface Window {
    __loopitaVisor?: VisorApi;
  }
}

/**
 * Prototipo T3b: lienzo r3f con `frameloop="demand"`. El motor es imperativo (`PrototypeEngine`); React solo lo monta
 * y muestra un panel con botones. Ninguna edición vuelve a renderizar un árbol proporcional a los puntos.
 */
export default function VisorPrototype() {
  const engine = useRef<PrototypeEngine | null>(null);
  const [info, setInfo] = useState<VisorInfo | null>(null);
  const [last, setLast] = useState<string>("");

  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
      delete window.__loopitaVisor;
    },
    [],
  );

  const run = async (label: string, fn: (api: VisorApi) => unknown) => {
    const e = engine.current;
    if (!e) return;
    const res = await fn(e.api());
    setLast(`${label}: ${JSON.stringify(res, (_k, v: unknown) => (typeof v === "number" ? Math.round(v * 100) / 100 : v))}`);
    setInfo(e.info());
  };

  return (
    <div className="grid gap-4">
      <p className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm" role="note">
        Vista aproximada (prototipo de medición). La forma y el tamaño reales dependen de tu tensión, la lana y el relleno. El
        halo y el brillo de la fibra son una aproximación visual. Teje una muestra para comprobar.
      </p>
      <div className="h-[600px] w-full max-w-[960px] overflow-hidden rounded-lg border border-borde" data-testid="visor-canvas">
        <Canvas
          frameloop="demand"
          dpr={[1, 2]}
          camera={{ fov: 40, position: [0, 0, 30] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={(state) => {
            const e = new PrototypeEngine(state.gl, state.scene, state.camera as THREE.PerspectiveCamera, state.invalidate);
            engine.current = e;
            window.__loopitaVisor = e.api();
            setInfo(e.info());
          }}
          aria-label="Vista 3D de prueba: esfera de punto bajo sintética"
          tabIndex={0}
        />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {[2448, 5000, 10000, 20000, 40000, 60000].map((n) => (
          <button key={n} type="button" className="rounded border border-borde px-2 py-1" onClick={() => run(`escena ${n}`, (a) => a.setScene(n))}>
            {n.toLocaleString("es-CL")} puntos
          </button>
        ))}
        <button type="button" className="rounded border border-borde px-2 py-1" onClick={() => run("editar vuelta", (a) => a.editToPaint())}>
          Editar una vuelta
        </button>
        <button type="button" className="rounded border border-borde px-2 py-1" onClick={() => run("recolorear", (a) => a.recolorToPaint())}>
          Cambiar lana de una vuelta
        </button>
        <button type="button" className="rounded border border-borde px-2 py-1" onClick={() => run("aspecto", (a) => a.setLooksToPaint(!(info?.fiber ?? true)))}>
          {info?.fiber === false ? "Activar aspecto por fibra" : "Colores planos"}
        </button>
        <button type="button" className="rounded border border-borde px-2 py-1" onClick={() => run("nivel", (a) => a.setLod(info?.lod === "smooth" ? "relief" : "smooth"))}>
          Nivel: {info?.lod ?? "relief"}
        </button>
        <button type="button" className="rounded border border-borde px-2 py-1" onClick={() => run("giro 3 s", (a) => a.orbit(3000))}>
          Medir giro (3 s)
        </button>
      </div>
      {info ? (
        <pre className="overflow-x-auto rounded bg-superficie p-3 text-xs" data-testid="visor-info">
          {JSON.stringify(info, null, 1)}
          {last ? `\n${last}` : ""}
        </pre>
      ) : null}
    </div>
  );
}

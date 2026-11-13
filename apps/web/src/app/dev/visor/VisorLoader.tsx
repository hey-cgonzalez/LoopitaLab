"use client";

import dynamic from "next/dynamic";

/** `three` y r3f solo se cargan en el cliente y solo en esta ruta (`ssr: false`, ADR 0010, sección 5). */
const VisorPrototype = dynamic(() => import("./VisorPrototype.tsx"), {
  ssr: false,
  loading: () => <p className="text-sm text-tinta-suave">Cargando la vista 3D…</p>,
});

export function VisorLoader() {
  return <VisorPrototype />;
}

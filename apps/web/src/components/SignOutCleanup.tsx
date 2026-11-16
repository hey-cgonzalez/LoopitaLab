"use client";

import { useEffect } from "react";
import { clearBrowserProgressQueues } from "@/lib/projects/progress-queue.ts";
import { clearBrowserBackups } from "@/lib/studio/backup.ts";

/**
 * Segunda capa del cierre de sesión (T20-M2): `/auth/salir` redirige a `/?salida=1` y aquí se vuelven a borrar los
 * respaldos y el avance local. Cubre otra pestaña con el estudio abierto que escribió después del primer borrado.
 */
export function SignOutCleanup() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("salida") !== "1") return;
    clearBrowserBackups();
    clearBrowserProgressQueues();
  }, []);
  return null;
}

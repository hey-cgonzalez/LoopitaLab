"use client";

import { useEffect } from "react";
import { browserProgressStorage, pruneProgressQueues } from "@/lib/projects/progress-queue.ts";
import { pruneBackups, type EnumerableStorage } from "@/lib/studio/backup.ts";

/** Limpia una vez, en cualquier página con sesión, los respaldos y el avance local de otra cuenta, viejos o caducados. */
export function SessionPrune({ ownerId }: { ownerId: string }) {
  useEffect(() => {
    try {
      pruneBackups(window.localStorage as EnumerableStorage, ownerId);
      pruneProgressQueues(browserProgressStorage(), ownerId);
    } catch {
      /* sin acceso al almacenamiento: no hay nada que limpiar */
    }
  }, [ownerId]);
  return null;
}

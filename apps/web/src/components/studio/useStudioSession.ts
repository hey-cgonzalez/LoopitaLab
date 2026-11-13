"use client";

import type { ChartPattern } from "@loopitalab/pattern-core";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { savePattern } from "@/app/disenos/actions";
import { browserProgressStorage, pruneProgressQueues } from "@/lib/projects/progress-queue.ts";
import { Autosave, pruneBackups, readBackup, type AutosaveDeps, type EnumerableStorage, type SaveStatus } from "@/lib/studio/autosave.ts";
import { decideRecovery, type Recovery } from "@/lib/studio/backup-recovery.ts";
import { DocumentStore } from "@/lib/studio/store.ts";

export type { Recovery };

export interface StudioSession {
  store: DocumentStore;
  autosave: Autosave;
  status: SaveStatus;
  recovery: Recovery | null;
  acceptRecovery(): void;
  dismissRecovery(): void;
}

function localStorageOrNull(): EnumerableStorage | null {
  try {
    return typeof window === "undefined" ? null : (window.localStorage as EnumerableStorage);
  } catch {
    return null; // acceso denegado (modo privado, política del navegador)
  }
}

/**
 * Monta el almacén del documento y el autoguardado de un diseño y los conecta con la página
 * (reconexión, cierre de pestaña, respaldo local). T9 usa `store` para las herramientas y la vista previa.
 */
export function useStudioSession(opts: { document: ChartPattern; updatedAt: string; ownerId: string; openedAsDraft: boolean; detached?: boolean }): StudioSession {
  const [{ store, autosave }] = useState(() => {
    const store = new DocumentStore(opts.document);
    // `detached`: página de desarrollo sin sesión. No llama al servidor ni escribe en el almacenamiento local.
    const save: AutosaveDeps["save"] = opts.detached ? async () => ({ ok: true, updatedAt: opts.updatedAt, draft: false }) : savePattern;
    const autosave = new Autosave(store, { patternId: opts.document.id, ownerId: opts.ownerId, initialUpdatedAt: opts.updatedAt, save, storage: opts.detached ? null : localStorageOrNull() });
    autosave.markOpenedAsDraft(opts.openedAsDraft);
    return { store, autosave };
  });

  // Sin suscripción al documento entero: cada componente lee su parte con `useStoreSelector` (T10).
  const status = useSyncExternalStore(autosave.subscribe, autosave.getStatus, autosave.getStatus);
  const [recovery, setRecovery] = useState<Recovery | null>(null);

  useEffect(() => {
    autosave.start();
    const onOnline = () => autosave.retryNow();
    const onHide = () => autosave.writeBackupNow();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") autosave.writeBackupNow();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      autosave.writeBackupNow();
      if (autosave.hasUnsaved) e.preventDefault(); // el navegador pregunta antes de cerrar
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);

    // ¿Quedó un respaldo de una sesión anterior que no alcanzó a guardarse? (sin almacenamiento en `detached`)
    const storage = opts.detached ? null : localStorageOrNull();
    // Primero se borra lo que no es de esta cuenta, lo de formato viejo y lo caducado (seguridad, ALTO-1).
    pruneBackups(storage, opts.ownerId);
    // Y lo mismo con el avance local del modo tejiendo (T17, B1).
    if (!opts.detached) pruneProgressQueues(browserProgressStorage(), opts.ownerId);
    const decision = decideRecovery(readBackup(storage, opts.ownerId, opts.document.id), opts.document, opts.updatedAt);
    if (decision.kind === "offer") {
      // Hasta que la usuaria decida, editar no pisa el respaldo ofrecido ni un guardado lo borra (T8, c).
      autosave.holdBackup(true);
      setRecovery(decision.recovery);
    } else if (decision.kind === "discard") {
      autosave.discardBackup();
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      autosave.stop();
      autosave.holdBackup(false);
    };
    // Los datos iniciales solo se leen al montar: el almacén es la fuente de verdad desde entonces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, store]);

  const acceptRecovery = useCallback(() => {
    // Sin efectos dentro de un actualizador de estado: en StrictMode se ejecutaría dos veces.
    if (!recovery) return;
    autosave.holdBackup(false);
    store.replace(recovery.document); // un paso de deshacer; el autoguardado lo envía
    setRecovery(null);
  }, [store, autosave, recovery]);

  const dismissRecovery = useCallback(() => {
    autosave.holdBackup(false);
    autosave.discardBackup();
    setRecovery(null);
  }, [autosave]);

  return { store, autosave, status, recovery, acceptRecovery, dismissRecovery };
}

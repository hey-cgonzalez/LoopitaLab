"use client";

import type { ChartPattern, Pattern } from "@loopitalab/pattern-core";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { savePattern } from "@/app/disenos/actions";
import { browserProgressStorage, pruneProgressQueues } from "@/lib/projects/progress-queue.ts";
import { Autosave, pruneBackups, readBackup, type AutosaveDeps, type AutosaveStore, type EnumerableStorage, type SaveStatus } from "@/lib/studio/autosave.ts";
import { SIGN_OUT_EVENT } from "@/lib/studio/backup.ts";
import { decideRecovery, type Recovery } from "@/lib/studio/backup-recovery.ts";
import { DocumentStore } from "@/lib/studio/store.ts";

export type { Recovery };

/** Lo que la sesión necesita del almacén: lo del autoguardado y reemplazar el documento (recuperar un respaldo). */
export interface SessionStore<P extends Pattern> extends AutosaveStore<P> {
  replace(doc: P): void;
}

export interface DesignSession<P extends Pattern, S extends SessionStore<P>> {
  store: S;
  autosave: Autosave<P>;
  status: SaveStatus;
  /** El texto sin leer no cupo en el respaldo local y quedó fuera (T20-B6). */
  pendingDropped: boolean;
  recovery: Recovery<P> | null;
  acceptRecovery(): void;
  dismissRecovery(): void;
}

export type StudioSession = DesignSession<ChartPattern, DocumentStore>;

function localStorageOrNull(): EnumerableStorage | null {
  try {
    return typeof window === "undefined" ? null : (window.localStorage as EnumerableStorage);
  } catch {
    return null; // acceso denegado (modo privado, política del navegador)
  }
}

export interface DesignSessionOptions<P extends Pattern, S extends SessionStore<P>> {
  document: P;
  updatedAt: string;
  ownerId: string;
  openedAsDraft: boolean;
  detached?: boolean;
  createStore(doc: P): S;
  /** Después de reemplazar el documento al recuperar un respaldo (el estudio amigurumi devuelve el texto sin leer). */
  onRecovered?(recovery: Recovery<P>): void;
}

/**
 * Monta el almacén del documento y el autoguardado de un diseño y los conecta con la página (reconexión, cierre de
 * pestaña, respaldo local). Lo comparten el estudio de colorwork y el amigurumi: el mismo guardado por `savable`, los
 * mismos conflictos y el mismo respaldo local (ADR 0006, E10 y E12).
 */
export function useDesignSession<P extends Pattern, S extends SessionStore<P>>(opts: DesignSessionOptions<P, S>): DesignSession<P, S> {
  const [{ store, autosave }] = useState(() => {
    const store = opts.createStore(opts.document);
    // `detached`: página de desarrollo sin sesión. No llama al servidor ni escribe en el almacenamiento local.
    const save: AutosaveDeps<P>["save"] = opts.detached ? async () => ({ ok: true, updatedAt: opts.updatedAt, draft: false }) : savePattern;
    const autosave = new Autosave<P>(store, { patternId: opts.document.id, ownerId: opts.ownerId, initialUpdatedAt: opts.updatedAt, save, storage: opts.detached ? null : localStorageOrNull() });
    autosave.markOpenedAsDraft(opts.openedAsDraft);
    return { store, autosave };
  });

  // Sin suscripción al documento entero: cada componente lee su parte con selectores (T10).
  const status = useSyncExternalStore(autosave.subscribe, autosave.getStatus, autosave.getStatus);
  const pendingDropped = useSyncExternalStore(autosave.subscribeNotice, autosave.getPendingDropped, () => false);
  const [recovery, setRecovery] = useState<Recovery<P> | null>(null);

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
    // T20-M2: cerrando sesión no se escribe nada más en el respaldo.
    const onSignOut = () => {
      autosave.stop();
      autosave.holdBackup(true);
    };
    window.addEventListener(SIGN_OUT_EVENT, onSignOut);
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
    const decision = decideRecovery<P>(readBackup(storage, opts.ownerId, opts.document.id), opts.document, opts.updatedAt);
    if (decision.kind === "offer") {
      // Hasta que la usuaria decida, editar no pisa el respaldo ofrecido ni un guardado lo borra (T8, c).
      autosave.holdBackup(true);
      setRecovery(decision.recovery);
    } else if (decision.kind === "discard") {
      autosave.discardBackup();
    }

    return () => {
      window.removeEventListener(SIGN_OUT_EVENT, onSignOut);
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

  const onRecovered = opts.onRecovered;
  const acceptRecovery = useCallback(() => {
    // Sin efectos dentro de un actualizador de estado: en StrictMode se ejecutaría dos veces.
    if (!recovery) return;
    autosave.holdBackup(false);
    // Un paso de deshacer; el autoguardado lo envía. Si el documento es el mismo del servidor (solo había texto sin
    // leer), no hace falta reemplazarlo.
    if (JSON.stringify(recovery.document) !== JSON.stringify(store.doc)) store.replace(recovery.document);
    onRecovered?.(recovery);
    setRecovery(null);
  }, [store, autosave, recovery, onRecovered]);

  const dismissRecovery = useCallback(() => {
    autosave.holdBackup(false);
    autosave.discardBackup();
    setRecovery(null);
  }, [autosave]);

  return { store, autosave, status, pendingDropped, recovery, acceptRecovery, dismissRecovery };
}

/**
 * Sesión del estudio de colorwork. T9 usa `store` para las herramientas y la vista previa.
 */
export function useStudioSession(opts: { document: ChartPattern; updatedAt: string; ownerId: string; openedAsDraft: boolean; detached?: boolean }): StudioSession {
  return useDesignSession<ChartPattern, DocumentStore>({ ...opts, createStore: (doc) => new DocumentStore(doc) });
}

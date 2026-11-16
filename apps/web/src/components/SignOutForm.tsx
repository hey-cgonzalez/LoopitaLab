"use client";

import { clearBrowserProgressQueues } from "@/lib/projects/progress-queue.ts";
import { announceSignOut, clearBrowserBackups } from "@/lib/studio/backup.ts";

/**
 * Cierre de sesión. Antes de enviar el POST a /auth/salir borra los respaldos locales de diseños
 * (`loopitalab:<uid>:diseno:*` y el formato viejo `loopitalab:diseno:*`): en un equipo compartido no deben quedar los diseños de otra persona (T8).
 * El formulario sigue siendo un POST normal: funciona aunque el borrado falle.
 */
export function SignOutForm() {
  return (
    <form
      action="/auth/salir"
      method="post"
      onSubmit={() => {
        // Primero la señal: los estudios abiertos dejan de respaldar (T20-M2). Si no, `beforeunload` y `pagehide` de
        // la navegación del formulario reescriben el respaldo (y el texto sin leer) justo después de borrarlo.
        announceSignOut();
        clearBrowserBackups();
        // También el avance de tejido que no alcanzó a enviarse (`loopitalab:<uid>:avance:*`, ADR 0009 §4).
        clearBrowserProgressQueues();
      }}
    >
      <button type="submit" className="rounded-full border-2 border-marino px-4 py-1.5 font-bold hover:bg-marino hover:text-white">
        Cerrar sesión
      </button>
    </form>
  );
}

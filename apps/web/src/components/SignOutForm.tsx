"use client";

import { clearBrowserBackups } from "@/lib/studio/backup.ts";

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
        clearBrowserBackups();
      }}
    >
      <button type="submit" className="rounded-full border-2 border-marino px-4 py-1.5 font-bold hover:bg-marino hover:text-white">
        Cerrar sesión
      </button>
    </form>
  );
}

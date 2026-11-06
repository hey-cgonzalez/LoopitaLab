"use client";

import { clearAllBackups, type EnumerableStorage } from "@/lib/studio/autosave.ts";

/**
 * Cierre de sesión. Antes de enviar el POST a /auth/salir borra los respaldos locales de diseños
 * (`loopitalab:diseno:*`): en un equipo compartido no deben quedar los diseños de otra persona (T8).
 * El formulario sigue siendo un POST normal: funciona aunque el borrado falle.
 */
export function SignOutForm() {
  return (
    <form
      action="/auth/salir"
      method="post"
      onSubmit={() => {
        try {
          clearAllBackups(window.localStorage as EnumerableStorage);
        } catch {
          /* sin acceso al almacenamiento: no hay nada que borrar */
        }
      }}
    >
      <button type="submit" className="rounded-full border-2 border-marino px-4 py-1.5 font-bold hover:bg-marino hover:text-white">
        Cerrar sesión
      </button>
    </form>
  );
}

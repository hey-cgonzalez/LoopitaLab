/** Mensaje general del formulario: error o confirmación. Se anuncia a lectores de pantalla. */
export function FormMessage({ message, tone }: { message?: string | undefined; tone: "error" | "ok" }) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-xl border-2 border-error/40 bg-error/5 px-4 py-3 font-bold text-error"
          : "rounded-xl border-2 border-exito/30 bg-exito/5 px-4 py-3 font-bold text-exito"
      }
    >
      {message}
    </p>
  );
}

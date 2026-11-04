"use client";

import { useFormStatus } from "react-dom";

/** Botón de envío que se deshabilita y cambia su texto mientras el formulario se procesa. */
export function SubmitButton({ children, pending }: { children: React.ReactNode; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={isPending}
      aria-disabled={isPending}
      className="w-full rounded-full bg-marino px-6 py-3 font-display text-lg font-semibold text-white transition-colors hover:bg-indigo disabled:cursor-wait disabled:opacity-70"
    >
      {isPending ? pending : children}
    </button>
  );
}

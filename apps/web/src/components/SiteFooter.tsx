import Link from "next/link";

/** Pie de página con enlaces legales, visible en todas las pantallas. */
export function SiteFooter() {
  return (
    <footer className="border-t-2 border-linea bg-superficie">
      <nav aria-label="Información legal" className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-5 text-sm text-tinta-suave">
        <span className="font-display font-bold text-marino">LoopitaLab</span>
        <Link href="/terminos" className="underline underline-offset-4 hover:text-marino">
          Términos de servicio
        </Link>
        <Link href="/privacidad" className="underline underline-offset-4 hover:text-marino">
          Política de privacidad
        </Link>
      </nav>
    </footer>
  );
}

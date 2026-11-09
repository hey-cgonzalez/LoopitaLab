import Link from "next/link";

/** Enlaces legales (Términos y Privacidad). Los usa el pie del sitio y, dentro del estudio, el aviso de prototipo. */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Información legal" className={`flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-tinta-suave ${className}`}>
      <Link href="/terminos" className="py-0.5 underline underline-offset-4 hover:text-marino">
        Términos de servicio
      </Link>
      <Link href="/privacidad" className="py-0.5 underline underline-offset-4 hover:text-marino">
        Política de privacidad
      </Link>
    </nav>
  );
}

/**
 * Pie de página con enlaces legales, visible en todas las pantallas. Compacto y pegado al fondo de la ventana cuando
 * el contenido es corto (`mt-auto` dentro del `body` en columna). En el estudio se oculta (ver globals.css) y los
 * enlaces se muestran dentro del estudio.
 */
export function SiteFooter() {
  return (
    <footer data-site-footer className="mt-auto border-t-2 border-linea bg-superficie">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2.5">
        <span className="font-display text-sm font-bold text-marino">LoopitaLab</span>
        <LegalLinks />
      </div>
    </footer>
  );
}

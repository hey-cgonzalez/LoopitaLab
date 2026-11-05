import Link from "next/link";

/** Estructura de las páginas legales: franja de borrador, título, fecha y contenido. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <div role="note" className="border-b-2 border-mostaza bg-mostaza/20 px-6 py-3 text-center font-bold">
        Borrador: pendiente de revisión legal antes del lanzamiento
      </div>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/" className="font-display text-2xl font-bold tracking-tight">
          LoopitaLab
        </Link>
        <h1 className="mt-8 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-2 text-tinta-suave">Última actualización del borrador: {updated}</p>
        <div className="mt-8 grid gap-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_li]:mt-1 [&_p]:mt-3 [&_section_a]:font-bold [&_section_a]:underline [&_section_a]:underline-offset-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </div>
      </main>
    </>
  );
}

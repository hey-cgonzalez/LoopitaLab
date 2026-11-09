import Link from "next/link";
import { KnitFabric } from "@/components/KnitFabric";

/** Estructura de las páginas de acceso: formulario a la izquierda, tejido a la derecha. */
export function AuthShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <KnitFabric rows={8} className="h-16 w-full sm:h-24 lg:hidden" />
      <main className="flex flex-col px-6 py-6 sm:px-12 lg:py-8">
        <Link href="/" className="self-start font-display text-2xl font-bold tracking-tight">
          LoopitaLab
        </Link>
        <div className="my-auto w-full max-w-md py-6">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight xl:text-5xl">{title}</h1>
          <p className="mt-3 text-tinta-suave">{intro}</p>
          <div className="mt-6">{children}</div>
        </div>
      </main>
      {/* El tejido llena la columna sin imponer alto: un SVG con h-full en la fila le pasaba su alto intrínseco. */}
      <div className="relative hidden lg:block">
        <KnitFabric className="absolute inset-0 size-full" />
      </div>
    </div>
  );
}

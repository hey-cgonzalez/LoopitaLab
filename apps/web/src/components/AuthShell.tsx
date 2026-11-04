import Link from "next/link";
import { KnitFabric } from "@/components/KnitFabric";

/** Estructura de las páginas de acceso: formulario a la izquierda, tejido a la derecha. */
export function AuthShell({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <KnitFabric rows={8} className="h-24 w-full lg:hidden" />
      <main className="flex flex-col px-6 py-10 sm:px-12 lg:py-14">
        <Link href="/" className="self-start font-display text-2xl font-bold tracking-tight">
          LoopitaLab
        </Link>
        <div className="my-auto w-full max-w-md py-10">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-3 text-tinta-suave">{intro}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <KnitFabric className="hidden h-full w-full lg:block" />
    </div>
  );
}

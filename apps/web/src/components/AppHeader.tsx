import Link from "next/link";

/** Barra superior de las páginas con sesión. */
export function AppHeader({ name }: { name: string }) {
  return (
    <header className="border-b-2 border-linea bg-superficie">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
        <Link href="/proyectos" className="font-display text-2xl font-bold tracking-tight">
          LoopitaLab
        </Link>
        <nav aria-label="Principal" className="flex gap-6">
          <Link href="/proyectos" className="underline-offset-4 hover:underline">
            Proyectos
          </Link>
          <Link href="/disenos" className="underline-offset-4 hover:underline">
            Mis diseños
          </Link>
          <Link href="/cuenta" className="underline-offset-4 hover:underline">
            Cuenta
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-tinta-suave">{name}</span>
          <form action="/auth/salir" method="post">
            <button type="submit" className="rounded-full border-2 border-marino px-4 py-1.5 font-bold hover:bg-marino hover:text-white">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";
import { SessionPrune } from "./SessionPrune";
import { SignOutForm } from "./SignOutForm";

/**
 * Barra superior de las páginas con sesión. Compacta (una línea desde 640 px) y fija arriba desde ese ancho, así la
 * navegación sigue a mano en las listas largas (globals.css reserva su alto con `scroll-padding-top`).
 * `wide`: sin ancho máximo, como el estudio a pantalla completa.
 */
export function AppHeader({ name, ownerId, wide = false }: { name: string; /** `user.id`: limpia una vez los respaldos locales ajenos o caducados. */ ownerId?: string; wide?: boolean }) {
  return (
    <>
    {ownerId ? <SessionPrune ownerId={ownerId} /> : null}
    <header data-app-header className="z-20 shrink-0 border-b-2 border-linea bg-superficie sm:sticky sm:top-0">
      <div className={`mx-auto flex flex-wrap items-center gap-x-6 gap-y-1 py-2 ${wide ? "px-3 sm:px-4" : "max-w-6xl px-4 sm:px-6"}`}>
        <Link href="/proyectos" className="py-1 font-display text-xl font-bold tracking-tight">
          LoopitaLab
        </Link>
        <nav aria-label="Principal" className="order-last flex w-full flex-wrap gap-x-5 sm:order-none sm:w-auto">
          <Link href="/proyectos" className="py-1 underline-offset-4 hover:underline">
            Proyectos
          </Link>
          <Link href="/disenos" className="py-1 underline-offset-4 hover:underline">
            Mis diseños
          </Link>
          <Link href="/lanas" className="py-1 underline-offset-4 hover:underline">
            Mis lanas
          </Link>
          <Link href="/cuenta" className="py-1 underline-offset-4 hover:underline">
            Cuenta
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden max-w-[16rem] truncate text-tinta-suave md:inline">{name}</span>
          <SignOutForm />
        </div>
      </div>
    </header>
    </>
  );
}

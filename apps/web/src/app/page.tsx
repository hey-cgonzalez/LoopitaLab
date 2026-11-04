import Link from "next/link";
import { KnitFabric } from "@/components/KnitFabric";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-dvh">
      <section className="relative isolate overflow-hidden bg-marino text-white">
        <KnitFabric rows={34} cols={48} className="absolute inset-0 -z-10 h-full w-full" />
        <div className="mx-auto flex min-h-[78dvh] max-w-5xl flex-col px-6 py-8">
          <div className="flex items-center justify-between gap-4">
            <span className="font-display text-2xl font-bold tracking-tight">LoopitaLab</span>
            <Link href={user ? "/proyectos" : "/ingresar"} className="rounded-full bg-white/10 px-4 py-2 font-bold backdrop-blur hover:bg-white/20">
              {user ? "Mis proyectos" : "Ingresar"}
            </Link>
          </div>
          <div className="mt-auto max-w-xl rounded-3xl bg-marino/90 p-8 backdrop-blur-sm sm:p-10">
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Diseña tu próximo tejido, punto a punto.</h1>
            <p className="mt-5 max-w-prose text-lg text-white/85">
              Patrones de colorwork a palillo y de amigurumi a crochet, con conteos que se revisan solos y el avance de cada proyecto guardado.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={user ? "/proyectos" : "/registro"}
                className="rounded-full bg-mostaza px-6 py-3 font-display text-lg font-semibold text-marino hover:bg-white"
              >
                {user ? "Ir a mis proyectos" : "Crear cuenta gratis"}
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-16 sm:grid-cols-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Colorwork</h2>
          <p className="mt-2 text-tinta-suave">Dibuja un motivo, repítelo y míralo tejido en tus colores antes de montar un solo punto.</p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Amigurumi</h2>
          <p className="mt-2 text-tinta-suave">Escribe cada vuelta como en un patrón de papel y el conteo se revisa al instante.</p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold">Tus proyectos</h2>
          <p className="mt-2 text-tinta-suave">Guarda dónde quedaste y retoma desde el celular o el computador.</p>
        </div>
        <p className="text-sm text-tinta-suave sm:col-span-3">Estamos construyendo los estudios de diseño. Por ahora puedes crear tu cuenta y tus proyectos.</p>
      </section>
    </div>
  );
}

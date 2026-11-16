import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { requireUser } from "@/lib/session";
import { listPatterns } from "./actions";
import { DesignList } from "./DesignList";

export const metadata: Metadata = { title: "Mis diseños" };

export default async function Page() {
  const { name } = await requireUser("/disenos");
  const result = await listPatterns();

  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Mis diseños</h1>
            <p className="mt-1 text-tinta-suave">Tus gráficos de colorwork y tus amigurumis escritos. Los gráficos se guardan solos mientras los editas.</p>
          </div>
          <Link href="/disenos/nuevo" className="rounded-full bg-marino px-6 py-2.5 font-bold text-white hover:bg-indigo">
            Nuevo diseño
          </Link>
        </div>
        {result.ok ? <DesignList designs={result.designs} /> : <FormMessage message={result.error} tone="error" />}
      </main>
    </>
  );
}

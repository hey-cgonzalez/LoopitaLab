import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { requireUser } from "@/lib/session";
import { listUserYarns } from "./actions";
import { YarnManager } from "./YarnManager";

export const metadata: Metadata = { title: "Mis lanas" };

export default async function Page() {
  const { name, user } = await requireUser("/lanas");
  const result = await listUserYarns();

  return (
    <>
      <AppHeader name={name} ownerId={user.id} />
      <main className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Mis lanas</h1>
          <p className="mt-1 text-tinta-suave">
            Las lanas que tienes, por grosor, composición y color. Son solo tuyas: las notas no se comparten con nadie ni se copian a un diseño si tú no lo pides.
          </p>
        </div>
        {result.ok ? <YarnManager initial={result.yarns} /> : <FormMessage message={result.error} tone="error" />}
      </main>
    </>
  );
}

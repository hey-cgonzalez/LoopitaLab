import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/session";
import { NewDesignWizard } from "./NewDesignWizard";

export const metadata: Metadata = { title: "Nuevo diseño" };

export default async function Page() {
  const { name } = await requireUser("/disenos/nuevo");
  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto grid w-full max-w-6xl content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Nuevo diseño</h1>
          <p className="mt-1 text-tinta-suave">Parte de una plantilla o responde unas preguntas. Después puedes cambiar todo en el estudio.</p>
        </div>
        <NewDesignWizard />
      </main>
    </>
  );
}

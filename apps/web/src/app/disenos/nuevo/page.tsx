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
      <main className="mx-auto grid max-w-3xl gap-8 px-6 py-10">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Nuevo diseño</h1>
          <p className="mt-2 text-tinta-suave">Parte de una plantilla o responde unas preguntas. Después puedes cambiar todo en el estudio.</p>
        </div>
        <NewDesignWizard />
      </main>
    </>
  );
}

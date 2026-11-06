import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { migratePattern, validatePattern, type ChartPattern } from "@loopitalab/pattern-core";
import { AppHeader } from "@/components/AppHeader";
import { StudioShell } from "@/components/studio/StudioShell";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Estudio de colorwork", robots: { index: false, follow: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Notice({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto grid max-w-3xl gap-4 px-6 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {children}
        <p>
          <Link href="/disenos" className="underline underline-offset-4">
            Volver a Mis diseños
          </Link>
        </p>
      </main>
    </>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase, user, name } = await requireUser(`/disenos/${id}`);

  // Lectura en el servidor con RLS; el filtro por dueña es defensa en profundidad.
  const { data, error } = await supabase
    .from("patterns")
    .select("document, updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle<{ document: unknown; updated_at: string }>();
  if (error) {
    console.error("diseños: abrir falló", error.code ?? "sin código");
    return (
      <Notice name={name} title="No pudimos abrir el diseño">
        <p className="text-tinta-suave">Revisa tu conexión y recarga la página en unos minutos.</p>
      </Notice>
    );
  }
  if (!data) notFound();

  // Todo documento que se abre pasa por migratePattern y validatePattern (ADR 0006, lectura).
  const migrated = migratePattern(data.document);
  if (!migrated.ok) {
    return (
      <Notice name={name} title="Este diseño no se puede abrir">
        <p className="text-tinta-suave">El documento guardado no tiene un formato que entendamos:</p>
        <ul className="list-disc pl-6">
          {migrated.issues.slice(0, 5).map((i) => (
            <li key={`${i.code}-${i.path}`}>{i.message}</li>
          ))}
        </ul>
      </Notice>
    );
  }
  const doc = migrated.document as ChartPattern;
  const result = validatePattern(doc);
  const errors = result.issues.filter((i) => i.severity === "error");

  if (!result.savable) {
    return (
      <Notice name={name} title="Este diseño tiene errores que impiden abrirlo en el editor">
        <p className="text-tinta-suave">Para no dañarlo, no lo abrimos en el estudio. Estos son los motivos:</p>
        <ul className="list-disc pl-6">
          {errors.slice(0, 8).map((i) => (
            <li key={`${i.code}-${i.path}`}>{i.message}</li>
          ))}
        </ul>
      </Notice>
    );
  }
  if (doc.kind !== "chart") {
    return (
      <Notice name={name} title="Este diseño es un patrón escrito">
        <p className="text-tinta-suave">El estudio de amigurumi todavía no está disponible. Este estudio abre solo gráficos de colorwork.</p>
      </Notice>
    );
  }

  return (
    <>
      <AppHeader name={name} />
      <StudioShell document={doc} updatedAt={data.updated_at} draftIssues={errors} />
    </>
  );
}

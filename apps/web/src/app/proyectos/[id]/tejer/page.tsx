import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { KnitScreen } from "@/components/knit/KnitScreen";
import { PROJECT_TEXTS } from "@/lib/projects/texts";
import { requireUser } from "@/lib/session";
import { loadProject } from "../../actions";

export const metadata: Metadata = { title: "Tejiendo", robots: { index: false, follow: false } };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pantalla "Tejiendo" (T12): abre el proyecto con `loadProject` (versión fijada, puntero, espejo) y monta `KnitScreen`. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { user, name, profile } = await requireUser(`/proyectos/${id}/tejer`);
  const r = await loadProject(id);

  if (!r.ok) {
    if (r.code === "NOT_FOUND") notFound();
    return (
      <>
        <AppHeader name={name} ownerId={user.id} />
        <main className="mx-auto grid max-w-3xl gap-4 px-6 py-10">
          <h1 className="font-display text-3xl font-bold tracking-tight">{PROJECT_TEXTS.tejiendo.noSePudoAbrir}</h1>
          <p className="text-tinta-suave">{r.code === "NOT_SAVABLE" ? PROJECT_TEXTS.proyectos.noSavable : r.error}</p>
          {r.issues && r.issues.length > 0 ? (
            <ul className="list-disc pl-6">
              {r.issues.slice(0, 8).map((i, k) => (
                <li key={`${i.code}-${i.path}-${k}`}>{i.message}</li>
              ))}
            </ul>
          ) : null}
          <p>
            <Link href={`/proyectos/${id}`} className="underline underline-offset-4">
              {PROJECT_TEXTS.tejiendo.volverAlProyecto}
            </Link>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader name={name} ownerId={user.id} wide />
      <KnitScreen
        project={r.project}
        document={r.document}
        valid={r.valid}
        issues={r.issues}
        mirror={r.mirror}
        pointer={r.pointer}
        progressUpdatedAt={r.progressUpdatedAt}
        newerVersionAvailable={r.newerVersionAvailable}
        ownerId={user.id}
        dominantHand={profile?.dominant_hand === "left" ? "left" : "right"}
      />
    </>
  );
}

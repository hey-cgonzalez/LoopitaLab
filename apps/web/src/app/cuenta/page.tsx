import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "./ProfileForm";
import { YourData } from "./YourData";

export const metadata: Metadata = { title: "Cuenta" };

export default async function Page() {
  const { user, profile, name } = await requireUser("/cuenta");
  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="max-w-xl">
          <h1 className="font-display text-4xl font-bold tracking-tight">Tu cuenta</h1>
          <p className="mt-2 text-tinta-suave">Ingresas con {user.email}.</p>
          <div className="mt-10">
            <ProfileForm
              displayName={profile?.display_name ?? ""}
              terminology={profile?.terminology ?? "es"}
              units={profile?.units ?? "metric"}
              dominantHand={profile?.dominant_hand ?? "right"}
            />
          </div>
          <YourData />
        </div>
      </main>
    </>
  );
}

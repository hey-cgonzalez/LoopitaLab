import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { isReauthDone } from "@/lib/auth-callback";
import { hasPassword as checkHasPassword } from "@/lib/password-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledProviders, identityLabel, reauthChoice } from "@/lib/auth-providers";
import { requireUser } from "@/lib/session";
import { ProfileForm } from "./ProfileForm";
import { YourData } from "./YourData";

export const metadata: Metadata = { title: "Cuenta" };

export default async function Page({ searchParams }: { searchParams: Promise<{ reauth?: string; reauth_error?: string }> }) {
  const { reauth, reauth_error } = await searchParams;
  const { user, profile, name } = await requireUser("/cuenta");
  const identities = user.identities ?? [];
  const methods = [...new Set(identities.map((i) => identityLabel(i.provider)).filter((l): l is string => Boolean(l)))];
  // Si falta la clave de servicio o la consulta falla, queda null: no se ofrecen acciones sensibles.
  let hasPassword: boolean | null = null;
  try {
    hasPassword = await checkHasPassword(createAdminClient(), user.id);
  } catch {
    hasPassword = null;
  }
  const choice = hasPassword === null ? null : reauthChoice(hasPassword, identities, enabledProviders());
  return (
    <>
      <AppHeader name={name} />
      <main className="mx-auto grid w-full max-w-6xl content-start gap-x-16 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:py-8">
        <div className="lg:col-span-2">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Tu cuenta</h1>
          <p className="mt-1 text-tinta-suave">Ingresas con {user.email}.</p>
        </div>
        <div>
            {profile ? (
              <ProfileForm
                displayName={profile.display_name ?? ""}
                terminology={profile.terminology}
                units={profile.units}
                dominantHand={profile.dominant_hand}
                mirrorKnitting={profile.mirror_knitting}
              />
            ) : (
              // Sin perfil leído no se muestra el formulario: guardar valores por defecto
              // pisaría las preferencias reales (QA F1).
              <p role="alert" className="text-tinta-suave">
                No pudimos cargar tus preferencias. Recarga la página en unos minutos.
              </p>
            )}
        </div>
        <div className="max-w-xl">
          {methods.length > 0 ? (
            <section aria-labelledby="formas-ingreso" className="mb-10">
              <h2 id="formas-ingreso" className="font-display text-xl font-bold">
                Formas de ingresar
              </h2>
              <ul className="mt-2 list-disc pl-6 text-tinta-suave">
                {methods.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <YourData choice={choice} reauthDone={isReauthDone("delete_account", reauth, reauth_error)} reauthFailed={reauth_error === "1"} />
        </div>
      </main>
    </>
  );
}

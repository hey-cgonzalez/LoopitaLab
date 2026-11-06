"use client";

import { useState } from "react";
import { FormMessage } from "@/components/FormMessage";
import { ProviderLogo } from "@/components/ProviderLogo";
import { OAUTH_START_ERROR } from "@/lib/auth-messages";
import { callbackUrl, enabledProviders, oauthOptions, providerLabel, type OAuthProvider } from "@/lib/auth-providers";
import { createClient } from "@/lib/supabase/client";

export const oauthButtonClass =
  "flex w-full items-center justify-center gap-3 rounded-full border-2 border-marino bg-white px-6 py-2.5 font-bold text-tinta hover:bg-marino hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70";

/**
 * Inicia el flujo OAuth. Si todo sale bien el navegador se va al proveedor; solo volvemos
 * con un mensaje si hubo un error.
 */
export async function startOAuth(provider: OAuthProvider, next: string, reauth: boolean): Promise<string | undefined> {
  try {
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: oauthOptions(provider, { redirectTo: callbackUrl(window.location.origin, next), reauth }),
    });
    return error ? OAUTH_START_ERROR : undefined;
  } catch {
    return OAUTH_START_ERROR;
  }
}

/** Botones "Continuar con…" + separador. No pinta nada si no hay proveedores habilitados. */
export function OAuthButtons({ next = "/", children }: { next?: string; children?: React.ReactNode }) {
  const providers = enabledProviders();
  const [busy, setBusy] = useState<OAuthProvider>();
  const [error, setError] = useState<string>();
  if (providers.length === 0) return null;

  async function onClick(p: OAuthProvider) {
    setError(undefined);
    setBusy(p);
    const failed = await startOAuth(p, next, false);
    if (failed) {
      setError(failed);
      setBusy(undefined);
    }
  }

  return (
    <div className="mb-6 grid gap-3">
      <FormMessage message={error} tone="error" />
      {providers.map((p) => (
        <button key={p} type="button" onClick={() => onClick(p)} disabled={busy !== undefined} aria-disabled={busy !== undefined} className={oauthButtonClass}>
          <ProviderLogo provider={p} />
          <span>{busy === p ? `Abriendo ${providerLabel(p)}…` : `Continuar con ${providerLabel(p)}`}</span>
        </button>
      ))}
      {children}
      <div className="flex items-center gap-3 text-sm text-tinta-suave" role="separator" aria-label="o con tu correo">
        <span className="h-px flex-1 bg-linea" />
        <span aria-hidden="true">o con tu correo</span>
        <span className="h-px flex-1 bg-linea" />
      </div>
    </div>
  );
}

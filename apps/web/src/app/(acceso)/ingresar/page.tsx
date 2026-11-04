import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { safeNext } from "@/lib/env";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Ingresar" };

const NOTICES: Record<string, string> = {
  enlace: "El enlace no es válido o ya venció. Pide uno nuevo e intenta otra vez.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthShell title="Vuelve a tus proyectos" intro="Ingresa para seguir tejiendo donde quedaste.">
      <SignInForm next={safeNext(next)} notice={error ? NOTICES[error] : undefined} />
    </AuthShell>
  );
}

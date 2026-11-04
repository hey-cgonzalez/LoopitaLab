import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function Page() {
  return (
    <AuthShell title="Crea tu cuenta" intro="Guarda tus diseños y el avance de cada proyecto, y retómalos desde cualquier dispositivo.">
      <SignUpForm />
    </AuthShell>
  );
}

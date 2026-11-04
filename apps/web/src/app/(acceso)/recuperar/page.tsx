import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function Page() {
  return (
    <AuthShell title="Recupera tu acceso" intro="Te enviaremos un enlace para crear una contraseña nueva.">
      <ResetForm />
    </AuthShell>
  );
}

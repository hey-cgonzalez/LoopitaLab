import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function Page() {
  return (
    <AuthShell title="Crea una contraseña nueva" intro="Después de guardarla vuelves directo a tus proyectos.">
      <NewPasswordForm />
    </AuthShell>
  );
}

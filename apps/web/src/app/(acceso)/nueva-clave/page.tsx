import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { hasRecentEmailProof } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?next=/nueva-clave");
  const viaEmail = await hasRecentEmailProof(supabase);

  return (
    <AuthShell
      title="Crea una contraseña nueva"
      intro={
        viaEmail
          ? "Después de guardarla vuelves directo a tus proyectos y se cierran tus otras sesiones."
          : "Por seguridad, confirma tu contraseña actual. Si no la recuerdas, cierra sesión y usa “Olvidé mi contraseña”."
      }
    >
      <NewPasswordForm needsCurrent={!viaEmail} />
    </AuthShell>
  );
}

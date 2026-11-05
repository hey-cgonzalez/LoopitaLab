import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { PASSWORD_STATUS_UNKNOWN } from "@/lib/auth-messages";
import { hasPassword as checkHasPassword } from "@/lib/password-status";
import { hasRecentEmailProof } from "@/lib/recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CreatePasswordLink, NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?next=/nueva-clave");
  const viaEmail = await hasRecentEmailProof(supabase);

  // Si falta la clave de servicio o la consulta falla, queda null. Sin el enlace del correo no se
  // ofrece nada; con el enlace se puede fijar la contraseña igual (N1: la recuperación no depende
  // de la clave secreta), porque ese camino no necesita saber si ya había una.
  let hasPassword: boolean | null = null;
  try {
    hasPassword = await checkHasPassword(createAdminClient(), user.id);
  } catch {
    hasPassword = null;
  }

  if (hasPassword === null && !viaEmail) {
    return (
      <AuthShell title="Contraseña" intro={PASSWORD_STATUS_UNKNOWN}>
        <p className="text-tinta-suave">Vuelve a intentarlo en unos minutos.</p>
      </AuthShell>
    );
  }

  // Sin contraseña y sin la prueba del enlace: se crea desde un enlace enviado al correo.
  // Con el enlace y estado desconocido se trata como "contraseña nueva" (solo cambia el texto).
  const known = hasPassword ?? true;
  const byLink = !known && !viaEmail;
  return (
    <AuthShell
      title={known ? "Crea una contraseña nueva" : "Crea una contraseña"}
      intro={
        viaEmail
          ? "Después de guardarla vuelves directo a tus proyectos y se cierran tus otras sesiones."
          : byLink
            ? `Es opcional: con una contraseña también puedes entrar con tu correo. Por seguridad, te enviamos un enlace a ${user.email ?? "tu correo"} para crearla.`
            : "Por seguridad, confirma tu contraseña actual. Si no la recuerdas, cierra sesión y usa “Olvidé mi contraseña”."
      }
    >
      {byLink ? <CreatePasswordLink /> : <NewPasswordForm needsCurrent={!viaEmail} hasPassword={known} />}
    </AuthShell>
  );
}

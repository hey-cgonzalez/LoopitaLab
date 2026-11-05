"use client";

import { useEffect, useRef, useState } from "react";
import { Captcha } from "@/components/Captcha";
import { Field } from "@/components/Field";
import { FormMessage } from "@/components/FormMessage";
import { deleteAccountMessage, exportMessage, reauthErrorMessage, requestReauthIntent } from "@/lib/account-messages";
import { CAPTCHA_MISSING, captchaEnabled, captchaOptions, captchaToken, resetCaptcha } from "@/lib/captcha";
import { createClient } from "@/lib/supabase/client";

const CONFIRM_TEXT = "ELIMINAR";
const EXPORT_FILENAME = "loopitalab-mis-datos.json";

export function YourData() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  // Al abrir el formulario, el foco pasa al primer campo.
  useEffect(() => {
    if (open) passwordRef.current?.focus();
  }, [open]);

  /**
   * La descarga pasa por fetch para poder mostrar un mensaje si falla (por ejemplo, el tope de
   * 5 por día). Si el servidor corta el envío a mitad, blob() falla y no se guarda un archivo
   * incompleto.
   */
  async function onExport() {
    setExportError(undefined);
    setExporting(true);
    try {
      const res = await fetch("/api/cuenta/exportar", { headers: { Accept: "application/json" } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setExportError(exportMessage(res.status, body?.error));
        return;
      }
      const blob = await res.blob().catch(() => null);
      if (!blob) {
        setExportError(exportMessage(0));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = EXPORT_FILENAME;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError(exportMessage(0));
    } finally {
      setExporting(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const errors: { password?: string; confirm?: string } = {};
    if (!password) errors.password = "Escribe tu contraseña.";
    if (confirm.trim() !== CONFIRM_TEXT) errors.confirm = `Escribe ${CONFIRM_TEXT} para confirmar.`;
    setFieldError(errors);
    setError(undefined);
    if (Object.keys(errors).length) return;
    if (captchaEnabled() && !captchaToken(form)) return setError(CAPTCHA_MISSING);

    setPending(true);
    try {
      // 1. El servidor emite un intento de re-autenticación y luego la contraseña se verifica
      //    aquí, en el navegador: Supabase Auth ve la IP real y el CAPTCHA, y crea la sesión
      //    nueva que el servidor exige (F2-M5).
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        setError(deleteAccountMessage(401));
        setPending(false);
        return;
      }
      const intentError = await requestReauthIntent("delete_account");
      if (intentError) {
        setError(intentError);
        setPending(false);
        return;
      }
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
        options: captchaOptions(form),
      });
      resetCaptcha();
      if (authError) {
        if (authError.code === "invalid_credentials") setFieldError({ password: reauthErrorMessage(authError.code) });
        else setError(reauthErrorMessage(authError.code));
        setPending(false);
        return;
      }

      // 2. El servidor consume el intento (una vez, menos de 5 minutos) y borra la cuenta.
      const res = await fetch("/api/cuenta/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_TEXT }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(deleteAccountMessage(res.status, body?.error));
        setPending(false);
        return;
      }
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      window.location.assign("/");
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
      resetCaptcha();
      setPending(false);
    }
  }

  return (
    <section id="tus-datos" aria-labelledby="tus-datos-titulo" className="mt-14 border-t-2 border-linea pt-10">
      <h2 id="tus-datos-titulo" className="font-display text-2xl font-bold">
        Tus datos
      </h2>
      <p className="mt-2 text-tinta-suave">Son tuyos: puedes llevártelos o borrarlos cuando quieras.</p>

      <div className="mt-6">
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          aria-disabled={exporting}
          className="inline-block rounded-full border-2 border-marino px-6 py-2.5 font-bold hover:bg-marino hover:text-white disabled:cursor-wait disabled:opacity-70"
        >
          {exporting ? "Preparando tus datos…" : "Descargar mis datos"}
        </button>
        <p className="mt-2 text-sm text-tinta-suave">
          Un archivo JSON con tu perfil y cuenta, patrones con sus versiones, proyectos, avance, notas, lanas, metadatos de tus subidas, denuncias y trabajos de IA. Las imágenes que subiste todavía no se incluyen.
        </p>
        <div className="mt-3">
          <FormMessage message={exportError} tone="error" />
        </div>
      </div>

      <div className="mt-10">
        <h3 className="font-display text-xl font-bold">Eliminar mi cuenta</h3>
        <p className="mt-2 text-tinta-suave">
          Se borran tu perfil, patrones, proyectos, notas, lanas y subidas. Tus patrones públicos o compartidos dejarán de estar disponibles, también para quienes los usaban en sus proyectos. No se puede deshacer. Te recomendamos descargar tus datos antes.
        </p>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            className="mt-4 rounded-full border-2 border-error px-6 py-2.5 font-bold text-error hover:bg-error hover:text-white"
          >
            Eliminar mi cuenta
          </button>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid max-w-md gap-5 rounded-2xl border-2 border-error/40 p-5" noValidate>
            <FormMessage message={error} tone="error" />
            <Field
              id="delete_password"
              label="Tu contraseña"
              type="password"
              autoComplete="current-password"
              required
              ref={passwordRef}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldError.password}
            />
            <Field
              id="delete_confirm"
              label={`Escribe ${CONFIRM_TEXT} para confirmar`}
              autoComplete="off"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={fieldError.confirm}
            />
            <Captcha />
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={pending}
                aria-disabled={pending}
                className="rounded-full bg-error px-6 py-2.5 font-display font-semibold text-white disabled:cursor-wait disabled:opacity-70"
              >
                {pending ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  setPassword("");
                  setConfirm("");
                  setError(undefined);
                  setFieldError({});
                }}
                className="rounded-full border-2 border-marino px-6 py-2.5 font-bold"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

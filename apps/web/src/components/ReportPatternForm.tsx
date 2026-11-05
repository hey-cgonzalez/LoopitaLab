"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { FormMessage } from "@/components/FormMessage";
import { SubmitButton } from "@/components/SubmitButton";
import { reportErrorMessage } from "@/lib/report-messages";
import { createClient } from "@/lib/supabase/client";

const REASONS = [
  ["copyright", "Infringe derechos de autor"],
  ["offensive", "Contenido ofensivo"],
  ["spam", "Spam o publicidad"],
  ["other", "Otro motivo"],
] as const;

type Reason = (typeof REASONS)[number][0];
const MAX_DETAILS = 1000;

interface State {
  needsLogin?: boolean;
  error?: string;
  ok?: string;
}

/**
 * Formulario para denunciar un patrón público. Inserta en public.pattern_reports (RLS).
 * Aún no está montado en ninguna vista: usarlo en la página pública del patrón con
 * <ReportPatternForm patternId={id} />.
 */
export function ReportPatternForm({ patternId }: { patternId: string }) {
  const [state, setState] = useState<State>({});
  const pathname = usePathname();

  async function action(form: FormData) {
    const reason = String(form.get("reason") ?? "") as Reason;
    const details = String(form.get("details") ?? "").trim();
    if (!REASONS.some(([v]) => v === reason)) return setState({ error: "Elige un motivo." });
    if (details.length > MAX_DETAILS) return setState({ error: `El detalle admite hasta ${MAX_DETAILS} caracteres.` });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setState({ needsLogin: true });

    const { error } = await supabase.from("pattern_reports").insert({ pattern_id: patternId, reason, details: details || null });
    if (!error) return setState({ ok: "Gracias. Recibimos tu denuncia y la vamos a revisar." });
    setState({ error: reportErrorMessage(error.code) });
  }

  if (state.ok) return <FormMessage message={state.ok} tone="ok" />;
  return (
    <form action={action} className="grid max-w-md gap-5">
      <FormMessage message={state.error} tone="error" />
      {state.needsLogin ? (
        <p role="alert" className="rounded-xl border-2 border-error/40 bg-error/5 px-4 py-3 font-bold text-error">
          Para denunciar un patrón necesitas una cuenta.{" "}
          <Link href={`/ingresar?next=${encodeURIComponent(pathname)}`} className="underline underline-offset-4">
            Ingresa aquí
          </Link>{" "}
          y vuelve a intentarlo.
        </p>
      ) : null}
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-bold">Motivo de la denuncia</legend>
        {REASONS.map(([value, label]) => (
          <label key={value} className="flex items-center gap-3">
            <input type="radio" name="reason" value={value} required className="size-5 accent-marino" />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-1.5">
        <label htmlFor="report-details" className="font-bold">
          Detalle
        </label>
        <textarea
          id="report-details"
          name="details"
          rows={4}
          maxLength={MAX_DETAILS}
          aria-describedby="report-details-help"
          className="rounded-xl border-2 border-linea bg-superficie px-4 py-3 text-marino"
        />
        <p id="report-details-help" className="text-sm text-tinta-suave">
          Opcional. Cuéntanos qué pasa, hasta {MAX_DETAILS} caracteres.
        </p>
      </div>
      <SubmitButton pending="Enviando…">Enviar denuncia</SubmitButton>
    </form>
  );
}

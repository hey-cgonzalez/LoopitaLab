"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DesignListItem } from "@/lib/designs/types";
import { deletePattern, duplicatePattern } from "./actions";

const SHAPE: Record<string, string> = { flat: "Plano", tube: "Tubo", circle: "Círculo", yoke: "Canesú" };
const dateFmt = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric" });

export function DesignList({ designs: initial }: { designs: DesignListItem[] }) {
  const router = useRouter();
  const [designs, setDesigns] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onDuplicate(d: DesignListItem) {
    setBusy(d.id);
    setMessage(null);
    try {
      const r = await duplicatePattern(d.id);
      if (r.ok) {
        router.push(`/disenos/${r.id}`);
        return;
      }
      setMessage({ tone: "error", text: r.error });
    } catch {
      setMessage({ tone: "error", text: "No pudimos duplicar el diseño. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(d: DesignListItem) {
    setBusy(d.id);
    setMessage(null);
    try {
      const r = await deletePattern(d.id);
      if (r.ok || r.code === "NOT_FOUND") {
        setDesigns((list) => list.filter((x) => x.id !== d.id));
        setConfirming(null);
        setMessage({ tone: "ok", text: `Borraste «${d.title}».` });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: r.error });
      }
    } catch {
      setMessage({ tone: "error", text: "No pudimos borrar el diseño. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <p role={message?.tone === "error" ? "alert" : "status"} className={message?.tone === "error" ? "font-bold text-error" : "font-bold text-exito"}>
        {message?.text}
      </p>
      {designs.length === 0 ? (
        <p className="max-w-2xl rounded-2xl border-2 border-dashed border-linea px-6 py-8 text-tinta-suave">
          Todavía no tienes diseños. Crea el primero con «Nuevo diseño»: puedes partir de una plantilla.
        </p>
      ) : (
        <ul className="grid divide-y-2 divide-linea border-y-2 border-linea">
          {designs.map((d) => {
            const isAi = d.origin !== "manual";
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-semibold">
                    <Link href={`/disenos/${d.id}`} className="underline-offset-4 hover:underline">
                      {d.title}
                    </Link>
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {d.renderAs ? SHAPE[d.renderAs] ?? d.renderAs : "Patrón escrito"}
                    {d.width !== null && d.height !== null ? ` · motivo de ${d.width} × ${d.height}` : ""} · actualizado el {dateFmt.format(new Date(d.updatedAt))}
                  </p>
                </div>
                {isAi ? <span className="rounded-full border-2 border-marino px-3 py-0.5 text-sm font-bold">Generado con IA</span> : null}
                {confirming === d.id ? (
                  <div role="group" aria-label={`Confirmar borrado de ${d.title}`} className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">¿Borrar «{d.title}»? No se puede deshacer.</span>
                    <button type="button" onClick={() => onDelete(d)} disabled={busy === d.id} className="rounded-full bg-error px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60">
                      Sí, borrar
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded-full border-2 border-marino px-4 py-2 font-bold hover:bg-marino hover:text-white">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {isAi ? (
                      <span id={`dup-${d.id}`} className="text-sm text-tinta-suave">
                        Los diseños con IA aún no se duplican.
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDuplicate(d)}
                      disabled={isAi || busy === d.id}
                      aria-describedby={isAi ? `dup-${d.id}` : undefined}
                      aria-label={`Duplicar ${d.title}`}
                      className="rounded-full border-2 border-marino px-4 py-2 font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40"
                    >
                      Duplicar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(d.id)}
                      aria-label={`Borrar ${d.title}`}
                      className="rounded-full border-2 border-error px-4 py-2 font-bold text-error hover:bg-error hover:text-white"
                    >
                      Borrar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

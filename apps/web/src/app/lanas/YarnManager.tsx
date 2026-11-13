"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE, weightLabel } from "@loopitalab/yarn-catalog";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { describeComposition } from "@/lib/yarns/form";
import { SAVED_YARNS_LIMIT, type SavedYarn } from "@/lib/yarns/saved";
import { deleteUserYarn } from "./actions";
import { YarnForm } from "./YarnForm";

const G = STUDIO_TEXTS.gestorLanas;
const btn = "min-h-11 rounded-full border-2 border-marino px-4 py-2 font-bold hover:bg-marino hover:text-white";
const colorName = (y: SavedYarn) => (y.color.paletteId ? PALETTE.find((c) => c.id === y.color.paletteId)?.nombre : undefined);
const yarnTitle = (y: SavedYarn) => `${weightLabel(y.weight)}, ${describeComposition(y.composition)}`;

export function YarnManager({ initial }: { initial: SavedYarn[] }) {
  const [yarns, setYarns] = useState(initial);
  const [form, setForm] = useState<{ editing: SavedYarn | null } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);

  // El aviso recibe el foco después de guardar o borrar: el botón que se usó ya no existe o cambió de lugar.
  const announce = (m: { tone: "ok" | "error"; text: string }) => setMessage({ ...m });
  // En un efecto: el aviso está oculto (`empty:hidden`) hasta que React lo dibuja con texto, y solo entonces puede tomar el foco.
  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  function onSaved(y: SavedYarn) {
    const isEdit = form?.editing != null;
    setYarns((list) => (isEdit ? list.map((x) => (x.id === y.id ? y : x)) : [y, ...list]));
    setForm(null);
    announce({ tone: "ok", text: isEdit ? G.guardadaEditada : G.guardadaNueva });
  }

  async function onDelete(y: SavedYarn) {
    setBusy(y.id);
    try {
      const r = await deleteUserYarn(y.id);
      if (r.ok || r.code === "NOT_FOUND") {
        setYarns((list) => list.filter((x) => x.id !== y.id));
        setConfirming(null);
        announce({ tone: "ok", text: G.borrada });
      } else announce({ tone: "error", text: r.error });
    } catch {
      announce({ tone: "error", text: G.borrarError });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-tinta-suave" data-testid="yarn-count">
          {yarns.length} de {SAVED_YARNS_LIMIT} lanas guardadas
        </p>
        <button
          ref={newRef}
          type="button"
          disabled={form !== null}
          onClick={() => {
            setMessage(null);
            setForm({ editing: null });
          }}
          className="rounded-full bg-marino px-6 py-2.5 font-bold text-white hover:bg-indigo disabled:opacity-40"
        >
          Nueva lana
        </button>
      </div>

      <p
        ref={statusRef}
        tabIndex={-1}
        role={message?.tone === "error" ? "alert" : "status"}
        className={`empty:hidden ${message?.tone === "error" ? "font-bold text-error" : "font-bold text-exito"}`}
      >
        {message?.text}
      </p>

      {form ? (
        <YarnForm
          key={form.editing?.id ?? "nueva"}
          editing={form.editing}
          onSaved={onSaved}
          onCancel={() => {
            setForm(null);
            requestAnimationFrame(() => newRef.current?.focus());
          }}
        />
      ) : null}

      {yarns.length === 0 ? (
        <div className="max-w-2xl rounded-2xl border-2 border-dashed border-linea px-6 py-8 text-tinta-suave">
          <p className="font-bold text-marino">Todavía no guardaste ninguna lana.</p>
          <p className="mt-1">
            Con «Nueva lana» anotas el grosor, la composición y el color de una lana que tienes, y después la usas en tus diseños sin volver a escribirla. Aquí no hay marcas ni catálogos: si quieres anotar la marca, va en la nota privada.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {yarns.map((y) => (
            <li key={y.id} data-testid="yarn-item" className="flex min-w-0 flex-col gap-3 rounded-2xl border-2 border-linea bg-superficie p-4">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" style={{ backgroundColor: y.color.hex }} className="size-12 shrink-0 rounded-xl border-2 border-borde" />
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold">{weightLabel(y.weight)}</p>
                  <p className="text-sm text-tinta-suave">{describeComposition(y.composition)}</p>
                  <p className="text-sm text-tinta-suave">
                    Color: {colorName(y) ? `${colorName(y)} (${y.color.hex})` : `personalizado (${y.color.hex})`}
                  </p>
                </div>
              </div>
              {y.note ? (
                <p className="break-words text-sm">
                  <span className="font-bold">Nota privada:</span> {y.note}
                </p>
              ) : null}
              {confirming === y.id ? (
                <div role="group" aria-label={G.confirmarGrupo} className="mt-auto flex flex-wrap items-center gap-2">
                  <span className="font-bold">{G.borrarPregunta}</span>
                  <button type="button" onClick={() => onDelete(y)} disabled={busy === y.id} className="min-h-11 rounded-full bg-error px-4 py-2 font-bold text-white hover:opacity-90 disabled:opacity-60">
                    {G.borrarConfirmar}
                  </button>
                  {/* El foco empieza en «Cancelar» (acción irreversible) y vuelve a «Borrar» si se cancela. */}
                  <button
                    type="button"
                    autoFocus
                    onClick={() => {
                      setConfirming(null);
                      requestAnimationFrame(() => document.getElementById(`borrar-lana-${y.id}`)?.focus());
                    }}
                    className={btn}
                  >
                    {G.cancelar}
                  </button>
                </div>
              ) : (
                <div className="mt-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Editar ${yarnTitle(y)}`}
                    onClick={() => {
                      setMessage(null);
                      setConfirming(null);
                      setForm({ editing: y });
                    }}
                    className={btn}
                  >
                    Editar
                  </button>
                  <button id={`borrar-lana-${y.id}`} type="button" aria-label={G.borrarDe(yarnTitle(y))} onClick={() => setConfirming(y.id)} className="min-h-11 rounded-full border-2 border-error px-4 py-2 font-bold text-error hover:bg-error hover:text-white">
                    {G.borrar}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

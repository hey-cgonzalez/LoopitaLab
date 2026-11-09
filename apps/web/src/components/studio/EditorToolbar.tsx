"use client";

import { yarnLetter } from "@loopitalab/pattern-core";
import type { GridView } from "@/lib/studio/editor-grid.ts";
import type { Tool } from "@/lib/studio/tools.ts";
import { STUDIO_TEXTS, yarnTitle, zoomAnnouncement } from "@/lib/studio-texts.ts";

const T = STUDIO_TEXTS;
// Compactos (alto ~32 px, sobre el mínimo de 24 px de WCAG 2.5.8) para que la cuadrícula tenga más alto.
const BTN = "rounded-full border-2 border-marino px-3 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const ON = "bg-marino text-white";

const TOOL_DEFS: { tool: Tool; label: string; key: string }[] = [
  { tool: "pencil", label: T.herramientas.lapiz, key: "L" },
  { tool: "fill", label: T.herramientas.relleno, key: "R" },
  { tool: "eyedropper", label: T.herramientas.cuentagotas, key: "C" },
  { tool: "nostitch", label: T.herramientas.sinPunto, key: "S" },
];

interface Props {
  tool: Tool;
  onTool(tool: Tool): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  zoomPercent: number;
  onZoom(direction: "in" | "out" | "fit"): void;
  view: GridView;
  /** El gráfico completo no cabe: solo se ofrece el motivo. */
  fullDisabled: boolean;
  hasRepeats: boolean;
  onView(view: GridView): void;
  activeYarn: number;
  activeHex: string;
}

/** Barra de herramientas del editor (zona `toolbar`). */
export function EditorToolbar(p: Props) {
  return (
    <section aria-label="Herramientas" data-zone="toolbar" className="grid shrink-0 gap-2 rounded-2xl border-2 border-linea bg-superficie p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Herramientas de dibujo" className="flex flex-wrap gap-1.5">
          {TOOL_DEFS.map((d) => (
            <button key={d.tool} type="button" onClick={() => p.onTool(d.tool)} aria-pressed={p.tool === d.tool} aria-keyshortcuts={d.key} title={`${d.label} (${d.key})`} className={`${BTN} ${p.tool === d.tool ? ON : ""}`}>
              {d.label}
              <span aria-hidden="true" className="ml-1.5 text-xs font-normal opacity-80 [@media(pointer:coarse)]:hidden">
                {d.key}
              </span>
            </button>
          ))}
        </div>
        <div role="group" aria-label="Historial" className="flex gap-1.5">
          <button type="button" onClick={p.onUndo} disabled={!p.canUndo} aria-keyshortcuts="Control+Z Meta+Z" title={`${T.herramientas.deshacer} (Ctrl o Cmd + Z)`} className={BTN}>
            {T.herramientas.deshacer}
          </button>
          <button type="button" onClick={p.onRedo} disabled={!p.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" title={`${T.herramientas.rehacer} (Ctrl o Cmd + Mayús + Z)`} className={BTN}>
            {T.herramientas.rehacer}
          </button>
        </div>
        <div role="group" aria-label={T.herramientas.zoom} className="flex items-center gap-1.5">
          <button type="button" onClick={() => p.onZoom("out")} aria-label={T.herramientas.zoomAlejar} title={`${T.herramientas.zoomAlejar} (−)`} className={BTN}>
            <span aria-hidden="true">−</span>
          </button>
          {/* Texto simple, sin región viva: cambia también al redimensionar la ventana y no debe hablar solo.
              El anuncio del zoom lo hace el estudio cuando la persona pulsa un botón de zoom. */}
          <span className="min-w-12 text-center text-sm font-bold">
            <span className="sr-only">{zoomAnnouncement(p.zoomPercent)}</span>
            <span aria-hidden="true">{p.zoomPercent} %</span>
          </span>
          <button type="button" onClick={() => p.onZoom("in")} aria-label={T.herramientas.zoomAcercar} title={`${T.herramientas.zoomAcercar} (+)`} className={BTN}>
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" onClick={() => p.onZoom("fit")} title={`${T.herramientas.zoomAjustar} (0)`} className={BTN}>
            {T.herramientas.zoomAjustar}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2" data-testid="active-yarn">
          <span aria-hidden="true" className="inline-block size-6 rounded border-2 border-marino" style={{ backgroundColor: p.activeHex }} />
          <span className="font-bold">
            {T.editor.lanaActiva}: {yarnTitle(yarnLetter(p.activeYarn))}
          </span>
        </p>
        {p.hasRepeats ? (
          <div role="group" aria-label={T.editor.vista} className="flex gap-1.5">
            <button type="button" onClick={() => p.onView("motif")} aria-pressed={p.view === "motif"} className={`${BTN} ${p.view === "motif" ? ON : ""}`}>
              {T.editor.verMotivo}
            </button>
            <button type="button" onClick={() => p.onView("full")} aria-pressed={p.view === "full"} disabled={p.fullDisabled} className={`${BTN} ${p.view === "full" ? ON : ""}`}>
              {T.editor.verCompleto}
            </button>
          </div>
        ) : null}
        {/* En la misma fila (se abre a todo el ancho). Con pantalla táctil como puntero principal no hay teclado a mano. */}
        <details className="text-sm open:basis-full [@media(pointer:coarse)]:hidden">
        <summary className="cursor-pointer py-1 font-bold underline-offset-4 hover:underline">{T.atajos.titulo}</summary>
        <p className="mt-2 text-tinta-suave">{T.atajos.nota}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {T.atajos.lista.map((a) => (
            <div key={a.teclas} className="contents">
              <dt className="font-mono font-bold">{a.teclas}</dt>
              <dd>{a.accion}</dd>
            </div>
          ))}
        </dl>
        </details>
      </div>
    </section>
  );
}

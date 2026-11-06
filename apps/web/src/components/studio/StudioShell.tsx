"use client";

import { NO_STITCH, yarnLetter, type ChartPattern, type Issue } from "@loopitalab/pattern-core";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useId, useState, type ReactNode } from "react";
import { savePatternVersion } from "@/app/disenos/actions";
import { DEFAULT_CELL_PX, type GridView } from "@/lib/studio/editor-grid.ts";
import {
  selectCanRedo,
  selectCanUndo,
  selectEdited,
  selectFullDisabled,
  selectHasRepeats,
  selectIsAi,
  selectTechnique,
  selectYarns,
} from "@/lib/studio/select.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import type { Tool } from "@/lib/studio/tools.ts";
import { STUDIO_TEXTS, yarnTitle } from "@/lib/studio-texts.ts";
import { ChartEditor } from "./ChartEditor";
import { EditorToolbar } from "./EditorToolbar";
import { PerfPanel } from "./PerfPanel";
import { PreviewPane } from "./PreviewPane";
import { SaveIndicator } from "./SaveIndicator";
import { PrototypeNotice } from "./StudioNotices";
import { StudioSidebar } from "./StudioSidebar";
import { useSidebarDoc, useStoreSelector } from "./useStoreSelector";
import { useStudioSession } from "./useStudioSession";
import { YarnPanel } from "./YarnPanel";

const T = STUDIO_TEXTS;

interface Props {
  document: ChartPattern;
  updatedAt: string;
  /** Errores de tejido con que se abrió el diseño (borrador). El panel de revisión los recalcula en vivo. */
  draftIssues: Issue[];
  /** Preferencia `mirror_knitting` del perfil: solo cambia la numeración y las flechas de lectura. */
  mirror?: boolean;
  /** Sin sesión ni guardado: para la página de desarrollo `/dev/estudio`. */
  detached?: boolean;
  /** Recolector `edit-to-paint` (T10). Solo lo activa `/dev/estudio?perf=1`; nunca en producción. */
  perf?: boolean;
}

type Tab = "editor" | "preview" | "settings";

const timeFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" });
const TABS: { id: Tab; label: string }[] = [
  { id: "editor", label: T.pestanas.editor },
  { id: "preview", label: T.pestanas.vista },
  { id: "settings", label: T.pestanas.ajustes },
];

const MemoSidebar = memo(StudioSidebar);

/** Tras una pincelada, el panel espera esta pausa antes de recalcular medidas y revisión. */
const SIDEBAR_CELLS_SETTLE_MS = 150;

/**
 * Panel lateral fuera del camino caliente (T10). Las pinceladas le llegan cuando la edición se detiene
 * (`useSidebarDoc`); el resto de los cambios, de inmediato pero diferidos (`useDeferredValue`): se renderiza en
 * segundo plano, después de que el cambio se pintó, y React puede interrumpirlo. La revisión sigue con su antirrebote.
 */
function SidebarSlot({ store, design }: { store: DocumentStore; design: ReactNode }) {
  const doc = useSidebarDoc(store, SIDEBAR_CELLS_SETTLE_MS);
  const deferred = useDeferredValue(doc);
  return <MemoSidebar store={store} doc={deferred} design={design} />;
}

/** ¿El foco está en un campo de texto? Ahí deshacer y rehacer son del campo, no del dibujo. */
function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/**
 * Estudio de colorwork (T8 + T9). Monta el almacén y el autoguardado y distribuye las zonas:
 * escritorio con panel lateral, editor y vista previa lado a lado; tableta y móvil con pestañas.
 * El estado del editor (herramienta, lana activa, zoom) es de interfaz; el patrón vive solo en el almacén.
 *
 * Camino caliente (T10): el shell no se suscribe al documento entero. Lee con selectores solo lo que muestra
 * (lanas, deshacer, repeticiones), así una pincelada no lo vuelve a renderizar; el editor lee el gráfico, la vista
 * previa se conecta directo al almacén y el panel lateral recibe el documento diferido.
 */
export function StudioShell({ document: initial, updatedAt, draftIssues, mirror = false, detached = false, perf = false }: Props) {
  const session = useStudioSession({ document: initial, updatedAt, openedAsDraft: draftIssues.length > 0, detached });
  const { store, autosave, status, recovery } = session;
  const yarns = useStoreSelector(store, selectYarns);
  const canUndo = useStoreSelector(store, selectCanUndo);
  const canRedo = useStoreSelector(store, selectCanRedo);
  const edited = useStoreSelector(store, selectEdited);
  const isAi = useStoreSelector(store, selectIsAi);
  const technique = useStoreSelector(store, selectTechnique);
  const fullDisabled = useStoreSelector(store, selectFullDisabled);
  const hasRepeats = useStoreSelector(store, selectHasRepeats);

  const titleId = useId();
  const [titleText, setTitleText] = useState(initial.title);
  const [titleProblems, setTitleProblems] = useState<string[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionMsg, setVersionMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);
  const [overwriting, setOverwriting] = useState(false);

  const [tab, setTab] = useState<Tab>("editor");
  const [tool, setTool] = useState<Tool>("pencil");
  const [activeId, setActiveId] = useState(() => initial.yarns[0]?.id ?? "A");
  const [view, setView] = useState<GridView>("motif");
  const [cellPx, setCellPx] = useState<number | null>(null);
  const [effectivePx, setEffectivePx] = useState(DEFAULT_CELL_PX);
  const [announce, setAnnounce] = useState("");

  const activeYarn = Math.max(0, yarns.findIndex((y) => y.id === activeId));
  const activeHex = yarns[activeYarn]?.color.hex ?? "#FFFFFF";

  // Deshacer y rehacer en toda la página (Ctrl/Cmd+Z, Ctrl/Cmd+Mayús+Z, Ctrl+Y), salvo dentro de un campo de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented || inTextField(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (k === "y" && !e.shiftKey) {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const toolLabels: Record<Tool, string> = { pencil: T.herramientas.lapiz, fill: T.herramientas.relleno, eyedropper: T.herramientas.cuentagotas, nostitch: T.herramientas.sinPunto };
  const changeTool = useCallback(
    (next: Tool) => {
      setTool(next);
      setAnnounce(`${T.accesibilidad.anuncioHerramienta}: ${toolLabels[next]}`);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const changeYarn = useCallback(
    (index: number) => {
      const y = store.doc.yarns[index];
      if (!y) return;
      setActiveId(y.id);
      setTool((t) => (t === "nostitch" || t === "eyedropper" ? "pencil" : t));
      setAnnounce(`${T.accesibilidad.anuncioLana}: ${yarnTitle(yarnLetter(index))}`);
    },
    [store],
  );
  const onPick = useCallback(
    (yarn: number) => {
      if (yarn === NO_STITCH) changeTool("nostitch");
      else {
        changeYarn(yarn);
        setTool("pencil");
      }
    },
    [changeTool, changeYarn],
  );
  const onZoom = useCallback(
    (d: "in" | "out" | "fit") => {
      if (d === "fit") return setCellPx(null);
      setCellPx(d === "in" ? Math.max(effectivePx + 1, Math.round(effectivePx * 1.25)) : Math.min(effectivePx - 1, Math.round(effectivePx / 1.25)));
    },
    [effectivePx],
  );

  function onTitle(raw: string) {
    setTitleText(raw);
    // El texto vive en el campo hasta que es válido: un título inválido bloquearía el guardado (ADR 0006, E10).
    const r = store.setTitle(raw);
    setTitleProblems(r.ok ? [] : r.problems);
  }

  async function onSaveVersion() {
    setVersionBusy(true);
    setVersionMsg(null);
    try {
      const upToDate = await autosave.saveNow();
      if (!upToDate) {
        setVersionMsg({ tone: "error", text: "Antes de guardar una versión hay que guardar los cambios, y todavía no se pudo. Revisa el estado del guardado." });
        return;
      }
      const r = await savePatternVersion(store.doc.id, versionLabel);
      setVersionMsg(r.ok ? { tone: "ok", text: `Versión ${r.version} guardada.` } : { tone: "error", text: r.error });
      if (r.ok) setVersionLabel("");
    } catch {
      setVersionMsg({ tone: "error", text: "No pudimos guardar la versión. Revisa tu conexión e intenta de nuevo." });
    } finally {
      setVersionBusy(false);
    }
  }

  function reloadFromServer() {
    autosave.stop();
    autosave.discardBackup();
    window.location.reload();
  }

  async function overwrite() {
    setOverwriting(true);
    try {
      await autosave.overwrite();
    } finally {
      setOverwriting(false);
    }
  }

  const show = (t: Tab) => (tab === t ? "block" : "hidden lg:block");

  const design = (
    <>
      {isAi ? (
        <p className="text-sm">
          <span className="rounded-full border-2 border-marino px-3 py-0.5 font-bold" data-testid="ai-label-sidebar">
            {T.misDisenos.etiquetaIa}
          </span>
        </p>
      ) : null}
      <p className="text-sm text-tinta-suave">
        {technique === "knit" ? T.subtitulo.palillo : T.subtitulo.crochet}
      </p>
      <div className="grid gap-2">
        <label htmlFor={`${titleId}-version`} className="font-bold">
          Nombre de la versión (opcional)
        </label>
        <input id={`${titleId}-version`} value={versionLabel} maxLength={80} onChange={(e) => setVersionLabel(e.target.value)} className="rounded-xl border-2 border-linea bg-superficie px-3 py-2" />
        <button type="button" onClick={onSaveVersion} disabled={versionBusy || detached} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo disabled:opacity-60">
          {versionBusy ? "Guardando versión…" : T.guardado.guardarVersion}
        </button>
        <p role="status" className={versionMsg?.tone === "error" ? "text-sm font-bold text-error" : "text-sm text-exito"}>
          {versionMsg?.text}
        </p>
        <p className="text-sm text-tinta-suave">{T.panel.guardarVersionAyuda}</p>
      </div>
    </>
  );

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <div className="border-b-2 border-linea bg-superficie">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-start gap-x-6 gap-y-3 px-4 py-3">
          <Link href="/disenos" className="py-2 text-sm underline underline-offset-4">
            ← Mis diseños
          </Link>
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={titleId} className="sr-only">
              Nombre del diseño
            </label>
            <input
              id={titleId}
              value={titleText}
              onChange={(e) => onTitle(e.target.value)}
              aria-invalid={titleProblems.length > 0 ? true : undefined}
              aria-describedby={titleProblems.length > 0 ? `${titleId}-error` : undefined}
              className="w-full rounded-xl border-2 border-linea bg-superficie px-3 py-2 font-display text-xl font-bold aria-invalid:border-error"
            />
            {titleProblems.length > 0 ? (
              <p id={`${titleId}-error`} className="mt-1 text-sm font-bold text-error">
                {titleProblems[0]} No se guarda hasta que lo corrijas.
              </p>
            ) : null}
          </div>
          {isAi ? (
            <span className="rounded-full border-2 border-marino px-3 py-1 text-sm font-bold" data-testid="ai-label">
              {T.misDisenos.etiquetaIa}
            </span>
          ) : null}
          <SaveIndicator status={status} />
        </div>
      </div>

      {recovery ? (
        <section aria-label="Cambios sin guardar de una sesión anterior" className="border-b-2 border-mostaza bg-superficie px-4 py-3">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1">
              Encontramos cambios sin guardar de {timeFmt.format(new Date(recovery.savedAt))}, de la última vez que abriste este diseño en este equipo.
              {recovery.serverIsNewer ? " Ojo: el diseño se guardó después desde otro lugar; si los recuperas, reemplazan esa versión." : ""}
              {edited ? ` ${T.respaldo.recuperacionEditando}` : ""}
            </p>
            <button type="button" onClick={session.acceptRecovery} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo">
              Recuperar cambios
            </button>
            <button type="button" onClick={session.dismissRecovery} className="rounded-full border-2 border-marino px-5 py-2 font-bold hover:bg-marino hover:text-white">
              Descartar
            </button>
          </div>
        </section>
      ) : null}

      {status.kind === "conflict" ? (
        <section role="alert" aria-label="Conflicto al guardar" className="border-b-2 border-error bg-superficie px-4 py-3">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4">
            <p className="min-w-0 flex-1">{T.guardado.conflicto}</p>
            <button type="button" onClick={reloadFromServer} className="rounded-full bg-marino px-5 py-2 font-bold text-white hover:bg-indigo">
              Recargar la versión guardada
            </button>
            <button type="button" onClick={overwrite} disabled={overwriting} className="rounded-full border-2 border-error px-5 py-2 font-bold text-error hover:bg-error hover:text-white disabled:opacity-60">
              {overwriting ? "Sobrescribiendo…" : "Sobrescribir con mi versión"}
            </button>
          </div>
          <p className="mx-auto mt-1 max-w-[1600px] text-sm text-tinta-suave">Recargar descarta lo que cambiaste aquí. Sobrescribir reemplaza lo guardado desde el otro lugar.</p>
        </section>
      ) : null}

      {status.kind === "blocked" ? (
        <section role="alert" aria-label="No se puede guardar" className="border-b-2 border-error bg-superficie px-4 py-3">
          <p className="mx-auto max-w-[1600px] font-bold text-error">No se puede guardar el diseño con estos errores:</p>
          <ul className="mx-auto max-w-[1600px] list-disc pl-6">
            {status.issues.slice(0, 5).map((i) => (
              <li key={`${i.code}-${i.path}`}>{i.message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div role="tablist" aria-label={T.pestanas.etiqueta} className="flex gap-2 border-b-2 border-linea bg-superficie px-4 py-2 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full border-2 border-marino px-4 py-2 font-bold ${tab === t.id ? "bg-marino text-white" : "hover:bg-marino hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 content-start gap-4 p-4 lg:grid-cols-[19rem_minmax(0,1.15fr)_minmax(0,1fr)]" data-testid="studio-layout">
        <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" className={`${show("settings")} lg:row-span-2`}>
          <SidebarSlot store={store} design={design} />
        </div>
        <div id="panel-editor" role="tabpanel" aria-labelledby="tab-editor" className={`${show("editor")} grid content-start gap-4`}>
          <EditorToolbar
            tool={tool}
            onTool={changeTool}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => store.undo()}
            onRedo={() => store.redo()}
            zoomPercent={Math.round((effectivePx / DEFAULT_CELL_PX) * 100)}
            onZoom={onZoom}
            view={view}
            fullDisabled={fullDisabled}
            hasRepeats={hasRepeats}
            onView={setView}
            activeYarn={activeYarn}
            activeHex={activeHex}
          />
          <YarnPanel store={store} yarns={yarns} activeId={activeId} onActiveChange={setActiveId} />
          <section aria-label="Editor del gráfico" data-zone="editor" className="rounded-2xl border-2 border-linea bg-superficie p-4">
            <h2 className="mb-2 font-display text-lg font-bold">{T.editor.titulo}</h2>
            <ChartEditor
              store={store}
              tool={tool}
              activeYarn={activeYarn}
              view={view}
              cellPx={cellPx}
              mirror={mirror}
              onToolChange={changeTool}
              onYarnChange={changeYarn}
              onPick={onPick}
              onZoom={onZoom}
              onEffectivePx={setEffectivePx}
            />
          </section>
        </div>
        <div id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" className={`${show("preview")} lg:self-start`}>
          <PreviewPane store={store} />
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only" data-testid="studio-announcement">
        {announce}
      </div>

      <PrototypeNotice />
      {perf ? <PerfPanel /> : null}
    </div>
  );
}

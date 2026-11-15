"use client";

import { NO_STITCH, yarnLetter, type ChartPattern, type Issue } from "@loopitalab/pattern-core";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { savePatternVersion } from "@/app/disenos/actions";
import { KnitStartButton } from "@/components/knit/KnitStartButton";
import { LegalLinks } from "@/components/SiteFooter";
import { nextTabId } from "@/lib/studio/a11y.ts";
import { DEFAULT_CELL_PX, type GridView } from "@/lib/studio/editor-grid.ts";
import {
  selectCanRedo,
  selectCanUndo,
  selectEdited,
  selectFullDisabled,
  selectHasRepeats,
  selectAssumedGauge,
  selectIsAi,
  selectTechnique,
  selectYarns,
} from "@/lib/studio/select.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import type { Tool } from "@/lib/studio/tools.ts";
import { PROJECT_TEXTS } from "@/lib/projects/texts.ts";
import { STUDIO_TEXTS, yarnTitle, zoomAnnouncement } from "@/lib/studio-texts.ts";
import { CHART_CANVAS_ID, ChartEditor } from "./ChartEditor";
import { EditorToolbar } from "./EditorToolbar";
import { PerfPanel } from "./PerfPanel";
import { PreviewPane } from "./PreviewPane";
import { SaveIndicator } from "./SaveIndicator";
import { SessionBanners } from "./SessionBanners";
import { PrototypeNotice } from "./StudioNotices";
import { StudioSidebar } from "./StudioSidebar";
import { useSidebarDoc, useStoreSelector } from "./useStoreSelector";
import { useStudioSession } from "./useStudioSession";
import { YarnPanel } from "./YarnPanel";

const T = STUDIO_TEXTS;

interface Props {
  document: ChartPattern;
  updatedAt: string;
  /** `user.id` de la dueña: identifica su respaldo local (seguridad, ALTO-1). En `/dev/estudio`, uno ficticio. */
  ownerId: string;
  /** Errores de tejido con que se abrió el diseño (borrador). El panel de revisión los recalcula en vivo. */
  draftIssues: Issue[];
  /** Preferencia `mirror_knitting` del perfil: solo cambia la numeración y las flechas de lectura. */
  mirror?: boolean;
  /** Sin sesión ni guardado: para la página de desarrollo `/dev/estudio`. */
  detached?: boolean;
  /**
   * Recolector `edit-to-paint` (T10). Solo lo activa `/dev/estudio?perf=1`, que en un build de producción existe
   * únicamente con `LOOPITA_DEV_PAGES=1` (medición local con `next start`; el despliegue real lo impide, ver
   * `src/lib/dev-pages.ts`).
   */
  perf?: boolean;
}

type Tab = "editor" | "preview" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "editor", label: T.pestanas.editor },
  { id: "preview", label: T.pestanas.vista },
  { id: "settings", label: T.pestanas.ajustes },
];

const TAB_IDS: readonly Tab[] = TABS.map((t) => t.id);

/** ¿Pantalla de tableta o móvil (menos de 1024 px, el punto `lg` de Tailwind), donde hay pestañas? */
function subscribeWide(notify: () => void): () => void {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
}
function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeWide, () => !window.matchMedia("(min-width: 1024px)").matches, () => false);
}

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
export function StudioShell({ document: initial, updatedAt, ownerId, draftIssues, mirror = false, detached = false, perf = false }: Props) {
  const session = useStudioSession({ document: initial, updatedAt, ownerId, openedAsDraft: draftIssues.length > 0, detached });
  const { store, autosave, status, recovery } = session;
  const yarns = useStoreSelector(store, selectYarns);
  const canUndo = useStoreSelector(store, selectCanUndo);
  const canRedo = useStoreSelector(store, selectCanRedo);
  const edited = useStoreSelector(store, selectEdited);
  const isAi = useStoreSelector(store, selectIsAi);
  const technique = useStoreSelector(store, selectTechnique);
  const fullDisabled = useStoreSelector(store, selectFullDisabled);
  const hasRepeats = useStoreSelector(store, selectHasRepeats);
  const gaugeAssumed = useStoreSelector(store, selectAssumedGauge);

  const titleId = useId();
  const [titleText, setTitleText] = useState(initial.title);
  const [titleProblems, setTitleProblems] = useState<string[]>([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [versionMsg, setVersionMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [versionBusy, setVersionBusy] = useState(false);

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
      if (d === "fit") {
        setCellPx(null);
        setAnnounce(T.accesibilidad.anuncioZoomAjustado);
        return;
      }
      const next = d === "in" ? Math.max(effectivePx + 1, Math.round(effectivePx * 1.25)) : Math.min(effectivePx - 1, Math.round(effectivePx / 1.25));
      setCellPx(next);
      // El tope real lo acota el editor; el aviso da el valor pedido, que es el que la persona ve en el botón.
      setAnnounce(zoomAnnouncement(Math.round((next / DEFAULT_CELL_PX) * 100)));
    },
    [effectivePx],
  );

  // Pestañas (tableta y móvil): flechas, Inicio y Fin mueven entre pestañas y activan la que reciben el foco.
  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, id: Tab) => {
    const to = nextTabId(TAB_IDS, id, e.key);
    if (!to) return;
    e.preventDefault();
    setTab(to);
    window.document.getElementById(`tab-${to}`)?.focus();
  };

  /** "Saltar al editor": en tableta y móvil primero muestra la pestaña del editor; después enfoca la cuadrícula. */
  function skipToEditor(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    setTab("editor");
    // La pestaña se muestra en el próximo render: el foco espera un frame.
    requestAnimationFrame(() => window.document.getElementById(CHART_CANVAS_ID)?.focus());
  }

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

  /** Antes de "Tejer este diseño" se vacía el autoguardado: el servidor fija lo que está guardado (ADR 0009 §3). */
  const flushBeforeKnit = useCallback(async (): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      if (await autosave.saveNow()) return { ok: true };
    } catch {
      /* cae al mensaje */
    }
    return { ok: false, message: PROJECT_TEXTS.tejer.guardarAntes };
  }, [autosave]);

  // Cada zona es una columna que desplaza por dentro (escritorio) o el panel de su pestaña (tableta y móvil).
  // `relative`: los textos `sr-only` (posición absoluta) quedan dentro de la columna; sin él alargarían la página.
  const show = (t: Tab) => (tab === t ? "flex" : "hidden lg:flex");
  // En escritorio las tres zonas se ven a la vez y no hay pestañas: sin rol de panel de pestaña (que apuntaría a una pestaña oculta).
  const compact = useCompactLayout();
  const panelA11y = (t: Tab) => (compact ? { role: "tabpanel" as const, "aria-labelledby": `tab-${t}` } : {});

  // Lanas: en escritorio encabezan la columna izquierda (así el editor usa todo el alto de la suya); en tableta y
  // móvil van en la pestaña del editor, debajo de la cuadrícula (que queda a la vista al abrir la pestaña), para
  // cambiar de lana mientras se pinta. El orden del DOM es el visual en los dos casos.
  const yarnPanel = <YarnPanel store={store} technique={technique} gaugeAssumed={gaugeAssumed} yarns={yarns} activeId={activeId} onActiveChange={setActiveId} />;

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
      {detached ? null : (
        <div className="grid gap-1" data-testid="knit-from-studio">
          <KnitStartButton patternId={initial.id} designTitle={titleText} beforeOpen={flushBeforeKnit} />
          <p className="text-sm text-tinta-suave">{T.panel.tejerAyuda}</p>
        </div>
      )}
      <div className="grid gap-2">
        <label htmlFor={`${titleId}-version`} className="font-bold">
          Nombre de la versión (opcional)
        </label>
        <input id={`${titleId}-version`} value={versionLabel} maxLength={80} onChange={(e) => setVersionLabel(e.target.value)} className="rounded-xl border-2 border-borde bg-superficie px-3 py-1.5" />
        <button type="button" onClick={onSaveVersion} disabled={versionBusy || detached} className="rounded-full bg-marino px-5 py-1.5 font-bold text-white hover:bg-indigo disabled:opacity-60">
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
    // Estudio a pantalla completa (`data-studio`, ver globals.css): ocupa el alto que deja la barra superior y nunca
    // desplaza la página; cada columna (o el panel de la pestaña) desplaza por dentro. `min-h` es el respaldo para
    // ventanas muy bajas: ahí la página sí desplaza y el aviso de prototipo queda pegado abajo.
    <div data-studio className="flex min-h-[30rem] min-w-0 flex-1 flex-col">
      {/* Primer elemento enfocable del estudio: sin él, la cuadrícula queda a ~50 tabulaciones (T11, ux-accesibilidad). */}
      <a
        href={`#${CHART_CANVAS_ID}`}
        onClick={skipToEditor}
        className="sr-only rounded-full bg-marino px-5 py-2 font-bold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50"
        data-testid="skip-to-editor"
      >
        {T.accesibilidad.saltarEditor}
      </a>
      <div className="shrink-0 border-b-2 border-linea bg-superficie">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 sm:px-4">
          <Link href="/disenos" className="py-1 text-sm underline underline-offset-4">
            ← Mis diseños
          </Link>
          <div className="min-w-[min(12rem,100%)] flex-1">
            <label htmlFor={titleId} className="sr-only">
              Nombre del diseño
            </label>
            <input
              id={titleId}
              value={titleText}
              onChange={(e) => onTitle(e.target.value)}
              aria-invalid={titleProblems.length > 0 ? true : undefined}
              aria-describedby={titleProblems.length > 0 ? `${titleId}-error` : undefined}
              className="w-full rounded-xl border-2 border-borde bg-superficie px-3 py-1 font-display text-lg font-bold aria-invalid:border-error"
            />
            {titleProblems.length > 0 ? (
              <p id={`${titleId}-error`} className="mt-1 text-sm font-bold text-error">
                {titleProblems[0]} No se guarda hasta que lo corrijas.
              </p>
            ) : null}
          </div>
          {isAi ? (
            <span className="rounded-full border-2 border-marino px-3 py-0.5 text-sm font-bold" data-testid="ai-label">
              {T.misDisenos.etiquetaIa}
            </span>
          ) : null}
          <SaveIndicator status={status} />
        </div>
      </div>

      <SessionBanners status={status} autosave={autosave} recovery={recovery} edited={edited} onAccept={session.acceptRecovery} onDismiss={session.dismissRecovery} />

      <div role="tablist" aria-label={T.pestanas.etiqueta} className="flex shrink-0 gap-2 border-b-2 border-linea bg-superficie px-3 py-1.5 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onKeyDown={(e) => onTabKey(e, t.id)}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full border-2 border-marino px-2 py-1.5 text-sm font-bold sm:text-base ${tab === t.id ? "bg-marino text-white" : "hover:bg-marino hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 p-3 lg:grid-cols-[20rem_minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1.15fr)_minmax(0,1fr)] 2xl:grid-cols-[24rem_minmax(0,1.2fr)_minmax(0,1fr)]"
        data-testid="studio-layout"
      >
        <div id="panel-settings" {...panelA11y("settings")} className={`${show("settings")} relative min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain`} data-column="settings">
          {compact ? null : yarnPanel}
          <SidebarSlot store={store} design={design} />
          {/* En tableta y móvil el pie del sitio no se ve (estudio a pantalla completa): los enlaces legales van aquí. */}
          {compact ? <LegalLinks className="px-2 pb-1" /> : null}
        </div>
        <div id="panel-editor" {...panelA11y("editor")} className={`${show("editor")} relative min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain`} data-column="editor">
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
          <section aria-label="Editor del gráfico" data-zone="editor" className="flex flex-1 flex-col rounded-2xl border-2 border-linea bg-superficie p-3">
            <h2 className="mb-2 font-display text-base font-bold">{T.editor.titulo}</h2>
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
          {compact ? yarnPanel : null}
        </div>
        <div id="panel-preview" {...panelA11y("preview")} className={`${show("preview")} relative min-h-0 flex-col overflow-y-auto overscroll-contain`} data-column="preview">
          <PreviewPane store={store} devBench={perf} />
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only" data-testid="studio-announcement">
        {announce}
      </div>

      {/* En escritorio, los enlaces legales del pie del sitio (oculto en el estudio) van en la franja del aviso. */}
      <PrototypeNotice aside={compact ? null : <LegalLinks />} />
      {perf ? <PerfPanel /> : null}
    </div>
  );
}

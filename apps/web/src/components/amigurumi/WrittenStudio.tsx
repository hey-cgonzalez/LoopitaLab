"use client";

import type { Dialect, Issue, LimitUsage, PartRef, RecommendedLimit, WrittenPattern } from "@loopitalab/pattern-core";
import { describeWritten } from "@loopitalab/pattern-render";
import { suggestedGauge } from "@loopitalab/yarn-catalog";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { LegalLinks } from "@/components/SiteFooter";
import { previewControls } from "@/components/studio/preview-controls.ts";
import { SaveIndicator } from "@/components/studio/SaveIndicator";
import { SessionBanners } from "@/components/studio/SessionBanners";
import { useSettledDoc } from "@/components/studio/useStoreSelector";
import { useDesignSession } from "@/components/studio/useStudioSession";
import { YarnPanel } from "@/components/studio/YarnPanel";
import { BLOCK_EDIT_POLICY_V1, BlockActions, type BlockEditPolicy } from "@/lib/amigurumi/blocks.ts";
import { crossedLimit, limitSummaryCache } from "@/lib/amigurumi/limits.ts";
import { reviewWritten } from "@/lib/amigurumi/review.ts";
import { modeOf, pieceRefs, placementOf, sameRef, surfaceFromPick, unplacedFromLayout, type PlacementMode } from "@/lib/amigurumi/placement.ts";
import { concreteIndexOf, sourceIndexOfNumber, sourceOfConcrete } from "@/lib/amigurumi/rounds.ts";
import { WrittenStore, type ActionResult, type WrittenAction } from "@/lib/amigurumi/store.ts";
import { TextBuffers } from "@/lib/amigurumi/text-buffers.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";
import { nextTabId } from "@/lib/studio/a11y.ts";
import type { Recovery } from "@/lib/studio/backup-recovery.ts";
import type { ViewerHandle, ViewerPick } from "./AmigurumiViewer.tsx";
import { AssemblyPanel } from "./AssemblyPanel.tsx";
import type { ViewerStatus } from "./controller.ts";
import { BlockEditor } from "./BlockEditor.tsx";
import { AmigurumiViewerLoader } from "./AmigurumiViewerLoader.tsx";
import { LimitDialog, LimitsMeter } from "./LimitsMeter.tsx";
import { PartsPanel, unplacedLabels } from "./PartsPanel.tsx";
import { PartTextEditor, type LineRequest } from "./PartTextEditor.tsx";
import { PositionPanel, roundWord } from "./PositionPanel.tsx";
import { UnreadTextDialog } from "./UnreadTextDialog.tsx";
import { WrittenGauge } from "./WrittenGauge.tsx";

const T = AMIGURUMI_TEXTS;
const BTN = "rounded-full border-2 border-marino px-3 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";

/** Pausas antes de la revisión del validador y de la descripción completa: nunca entre la edición y el dibujo (CA4-P5). */
const REVIEW_SETTLE_MS = 250;
const DESCRIBE_SETTLE_MS = 500;

type EditMode = "text" | "blocks";
const EDIT_MODES: readonly EditMode[] = ["text", "blocks"];

type Tab = "parts" | "editor" | "view";
const TABS: { id: Tab; label: string }[] = [
  { id: "parts", label: T.pestanas.partes },
  { id: "editor", label: T.pestanas.editor },
  { id: "view", label: T.pestanas.vista },
];
const TAB_IDS: readonly Tab[] = TABS.map((t) => t.id);

function subscribeWide(notify: () => void): () => void {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", notify);
  return () => mq.removeEventListener("change", notify);
}
function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeWide, () => !window.matchMedia("(min-width: 1024px)").matches, () => false);
}

function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export interface WrittenStudioProps {
  document: WrittenPattern;
  updatedAt: string;
  ownerId: string;
  /** Errores de tejido con que se abrió (borrador). La revisión los recalcula en vivo. */
  draftIssues: Issue[];
  /** `profiles.pattern_dialect`: con qué abreviaturas se escribe (se lee con `readingModeFor`). */
  dialect: Dialect;
  /** Sin sesión ni guardado (`/dev/amigurumi`). */
  detached?: boolean;
  /** Modo de medición del visor (`?perf=1`, solo en la página de desarrollo). */
  perf?: boolean;
  /** Expone el almacén y el visor para las E2E (solo en la página de desarrollo). */
  exposeForTests?: boolean;
  /** Siluetas sin WebGL a propósito (página de desarrollo, `?sinwebgl=1`). */
  forceNoWebGL?: boolean;
  /** Política del editor de bloques. Por omisión, la de la v1 (`BLOCK_EDIT_POLICY_V1`). */
  blockPolicy?: BlockEditPolicy;
}

declare global {
  interface Window {
    __loopitaAmigurumi?: { store: WrittenStore; buffers: TextBuffers; viewer: () => ViewerHandle | null };
  }
}

/**
 * Estudio amigurumi (T14 de la fase 4; ADR 0010 y 0011). El documento vive en un almacén fuera de React
 * (`WrittenStore`, con `subscribe` y `getSnapshot`) que alimenta a la lista de partes, al editor de texto y al visor 3D.
 * Escritorio con tres columnas (partes y lanas, patrón, 3D); tableta y móvil con pestañas.
 * El guardado es el del colorwork: `savable`, conflictos y respaldo local (más el texto sin leer).
 */
export function WrittenStudio({ document: initial, updatedAt, ownerId, draftIssues, dialect, detached = false, perf = false, exposeForTests = false, forceNoWebGL = false, blockPolicy = BLOCK_EDIT_POLICY_V1 }: WrittenStudioProps) {
  const buffersRef = useRef<TextBuffers | null>(null);
  const onRecovered = useCallback((r: Recovery<WrittenPattern>) => {
    if (r.pendingText) buffersRef.current?.restore(r.pendingText);
  }, []);
  const session = useDesignSession<WrittenPattern, WrittenStore>({
    document: initial,
    updatedAt,
    ownerId,
    openedAsDraft: draftIssues.length > 0,
    detached,
    createStore: (doc) => new WrittenStore(doc),
    onRecovered,
  });
  const { store, autosave, status, recovery } = session;
  const [buffers] = useState(() => new TextBuffers(store, dialect));
  buffersRef.current = buffers;
  const [controls] = useState(() => previewControls(store));
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const doc = state.doc;
  const deferredDoc = useDeferredValue(doc);
  const [limitsOf] = useState(limitSummaryCache);
  const limits = limitsOf(deferredDoc);

  const compact = useCompactLayout();
  const titleId = useId();
  const descId = useId();
  const [titleText, setTitleText] = useState(initial.title);
  const [titleProblems, setTitleProblems] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(initial.parts[0]?.id ?? "");
  const [activeYarn, setActiveYarn] = useState(initial.yarns[0]?.id ?? "A");
  const [tab, setTab] = useState<Tab>("editor");
  const [editMode, setEditMode] = useState<EditMode>("text");
  /** Cambio a bloques (o a otra parte desde bloques) con líneas sin leer: pregunta antes de seguir. */
  const [unreadPrompt, setUnreadPrompt] = useState<{ partId: string; proceed: () => void } | null>(null);
  const buffersVersion = useSyncExternalStore(buffers.subscribe, buffers.getVersion, buffers.getVersion);
  const [announce, setAnnounce] = useState("");
  const [lineRequest, setLineRequest] = useState<LineRequest | null>(null);
  const [textNotice, setTextNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ usage: LimitUsage; crossed: RecommendedLimit[]; run: () => void } | null>(null);
  /** Límites aceptados con "Seguir igual" en esta sesión: estado del estudio, nunca del documento. */
  const accepted = useRef(new Set<RecommendedLimit>());
  const viewerRef = useRef<ViewerHandle | null>(null);
  const highlight = useRef<{ partId: string; sourceIndex: number } | null>(null);
  const picked = useRef<{ partId: string; roundIndex: number } | null>(null);

  const selected = doc.parts.find((p) => p.id === selectedId) ?? doc.parts[0];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  // Texto sin leer → respaldo local (CA4-E9). No es un cambio del documento.
  useEffect(() => {
    const sync = () => autosave.setPendingText(buffers.pendingTexts());
    sync();
    return buffers.subscribe(sync);
  }, [autosave, buffers]);

  // Deshacer y rehacer del diseño (fuera de un campo de texto, que tiene el suyo).
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

  // Revisión diferida (validador con la muestra supuesta) y descripción completa (`describeWritten`).
  const settled = useSettledDoc<WrittenPattern>(store, REVIEW_SETTLE_MS);
  const review = useMemo(() => reviewWritten(settled), [settled]);
  const described = useSettledDoc<WrittenPattern>(store, DESCRIBE_SETTLE_MS);
  const description = useMemo(() => {
    const weight = described.yarns[0]?.weight;
    const s = typeof weight === "number" ? suggestedGauge(weight, "crochet") : undefined;
    const assumedGauge = s ? { stitchesPer10cm: s.stitchesPer10cm, rowsPer10cm: s.rowsPer10cm, gaugeStitch: s.assumption === "crochet-pa" ? ("dc" as const) : ("sc" as const) } : undefined;
    return describeWritten(described, { dialect, ...(assumedGauge ? { assumedGauge } : {}) });
  }, [described, dialect]);

  // ---------------------------------------------------------------- 3D: resaltado y selección

  const applyHighlight = useCallback(() => {
    const v = viewerRef.current;
    if (!v) return;
    const h = highlight.current;
    const part = h ? store.doc.parts.find((p) => p.id === h.partId) : undefined;
    if (!h || !part) {
      v.renderer.setHighlight(null);
      return;
    }
    const pick = picked.current;
    const fromPick = pick && pick.partId === h.partId && sourceOfConcrete(part, pick.roundIndex)?.sourceIndex === h.sourceIndex ? pick.roundIndex : null;
    const roundIndex = fromPick ?? concreteIndexOf(part, h.sourceIndex);
    v.renderer.setHighlight(roundIndex === null ? null : { partId: part.id, roundIndex });
  }, [store]);

  useEffect(() => store.subscribe(applyHighlight), [store, applyHighlight]);

  const onCaretRound = useCallback(
    (sourceIndex: number | null) => {
      highlight.current = sourceIndex === null || !selected ? null : { partId: selected.id, sourceIndex };
      if (sourceIndex === null) picked.current = null;
      applyHighlight();
    },
    [selected, applyHighlight],
  );

  // ---------------------------------------------------------------- posicionado (T16)

  const [positioning, setPositioning] = useState(false);
  const [posTarget, setPosTarget] = useState<PartRef>(() => ({ part: initial.parts[0]?.id ?? "", copy: 0 }));
  /** "Cosida" elegido para una pieza que todavía no tiene ancla (estado de la interfaz, nunca del documento). */
  const [surfaceChoice, setSurfaceChoice] = useState<PartRef | null>(null);
  const [posNotice, setPosNotice] = useState<string | null>(null);
  /** Piezas sin ubicar según la escena (`placed: false`); null sin escena (se usa el `layout`). */
  const [sceneUnplaced, setSceneUnplaced] = useState<{ key: string; refs: PartRef[] } | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  // La pieza elegida tiene que existir (borrar una parte o bajar sus copias).
  const refs = pieceRefs(doc);
  const target = refs.find((r) => sameRef(r, posTarget)) ?? refs[0] ?? posTarget;
  const docMode = modeOf(doc, target);
  const posMode: PlacementMode = surfaceChoice && sameRef(surfaceChoice, target) ? "surface" : docMode;
  const onPosMode = useCallback(
    (m: PlacementMode) => {
      setSurfaceChoice(m === "surface" ? target : null);
    },
    [target],
  );
  const onPosTarget = useCallback((r: PartRef) => {
    setPosTarget(r);
    setSurfaceChoice(null);
    setPosNotice(null);
  }, []);

  const onViewerStatus = useCallback((s: ViewerStatus) => {
    setViewerReady(s.unplaced !== null);
    const list = s.unplaced;
    const key = list ? JSON.stringify(list) : "";
    setSceneUnplaced((prev) => (list === null ? null : prev && prev.key === key ? prev : { key, refs: list }));
  }, []);

  /** Modo "Posicionar": tocar la superficie del anfitrión fija el ancla (vuelta visible y punto de `pick`). */
  const placeFromPick = useCallback(
    (p: ViewerPick) => {
      const hit: PartRef = { part: p.partId, copy: p.copy };
      if (posMode !== "surface") {
        // Fuera de "cosida", tocar una pieza la elige.
        onPosTarget(hit);
        return;
      }
      if (sameRef(hit, target)) {
        setPosNotice(T.posicion.noASiMisma);
        return;
      }
      const cur = store.doc;
      const placement = surfaceFromPick(cur, target, p, placementOf(cur, target));
      if (!placement) {
        setPosNotice(T.posicion.noSePudo);
        return;
      }
      const r = store.run({ type: "setPlacement", placement });
      if (!r.changed && JSON.stringify(placementOf(cur, target)) !== JSON.stringify(placement)) {
        setPosNotice(T.posicion.noSePudo);
        return;
      }
      setPosNotice(null);
      if (placement.at.type === "surface") {
        const host = cur.parts.find((x) => x.id === hit.part);
        const msg = T.posicion.cosidaEn(unplacedLabels(cur, [target])[0] ?? target.part, unplacedLabels(cur, [hit])[0] ?? hit.part, roundWord(host), placement.at.round, placement.at.stitch + 1);
        setAnnounce(msg);
      }
    },
    [posMode, target, store, onPosTarget],
  );

  const onPick = useCallback(
    (p: ViewerPick | null) => {
      if (positioning) {
        if (p) placeFromPick(p);
        return;
      }
      if (!p) {
        picked.current = null;
        return;
      }
      picked.current = { partId: p.partId, roundIndex: p.roundIndex };
      const part = store.doc.parts.find((x) => x.id === p.partId);
      if (!part) return;
      setSelectedId(part.id);
      const j = p.roundNumber !== null ? sourceIndexOfNumber(part, p.roundNumber) : null;
      const view = buffers.view(part.id);
      const line = j !== null ? view?.roundLines[j] : undefined;
      if (line !== undefined) setLineRequest({ partId: part.id, line, nonce: Date.now() });
    },
    [store, buffers, positioning, placeFromPick],
  );

  // E2E de la página de desarrollo: acceso al almacén y al visor.
  useEffect(() => {
    if (!exposeForTests) return;
    window.__loopitaAmigurumi = { store, buffers, viewer: () => viewerRef.current };
    return () => {
      delete window.__loopitaAmigurumi;
    };
  }, [exposeForTests, store, buffers]);

  // ---------------------------------------------------------------- acciones puntuales con límites recomendados

  const guard = useCallback(
    (action: WrittenAction, done?: (r: ActionResult) => void) => {
      const sim = store.simulate(action);
      if (!sim.changed) {
        done?.(sim);
        return;
      }
      const crossed = crossedLimit(store.doc, sim.doc, accepted.current);
      if (!crossed) {
        done?.(store.run(action));
        return;
      }
      // Todos los límites que esta acción supera: si sigue, no se vuelve a preguntar por ninguno de ellos.
      const all: RecommendedLimit[] = [crossed.limit];
      let next = crossed;
      const seen = new Set(accepted.current);
      while (next) {
        seen.add(next.limit);
        const more = crossedLimit(store.doc, sim.doc, seen);
        if (!more) break;
        all.push(more.limit);
        next = more;
      }
      setDialog({
        usage: crossed,
        crossed: all,
        run: () => done?.(store.run(action)),
      });
    },
    [store],
  );

  const blockActions = useMemo(() => new BlockActions({ store, policy: blockPolicy, guard }), [store, blockPolicy, guard]);

  const hasUnread = useCallback(
    (partId: string) => {
      const v = buffers.view(partId);
      return v !== null && v.status !== "synced";
    },
    [buffers],
  );

  function requestMode(next: EditMode) {
    if (next === editMode) return;
    if (next === "text") {
      setLineRequest(null);
      setEditMode("text");
      return;
    }
    if (selected && hasUnread(selected.id)) {
      setUnreadPrompt({ partId: selected.id, proceed: () => setEditMode("blocks") });
      return;
    }
    setEditMode("blocks");
  }

  // Si la parte abierta en bloques pasa a tener líneas sin leer (se tocó en el 3D, se recuperó un respaldo): al texto.
  useEffect(() => {
    if (editMode === "blocks" && selected && hasUnread(selected.id)) {
      setEditMode("text");
      setTextNotice(T.bloques.sinLeerForzado);
    }
  }, [editMode, selected, hasUnread, buffersVersion]);

  function selectPart(id: string) {
    const go = () => {
      setSelectedId(id);
      if (compact) setTab("editor");
    };
    if (editMode === "blocks" && hasUnread(id)) {
      setUnreadPrompt({ partId: id, proceed: go });
      return;
    }
    go();
  }

  /** "Editar en el texto" desde un bloque de solo lectura: al texto, en la línea de esa vuelta. */
  function editInText(roundIndex: number) {
    if (!selected) return;
    setEditMode("text");
    const line = buffers.view(selected.id)?.roundLines[roundIndex];
    setLineRequest(line !== undefined ? { partId: selected.id, line, nonce: Date.now() } : null);
  }

  const onEditTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, id: EditMode) => {
    const to = nextTabId(EDIT_MODES, id, e.key);
    if (!to) return;
    e.preventDefault();
    requestMode(to);
    window.document.getElementById(`wedit-tab-${to}`)?.focus();
  };

  function onTitle(raw: string) {
    setTitleText(raw);
    const r = store.setTitle(raw);
    setTitleProblems(r.ok ? [] : r.problems);
  }

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, id: Tab) => {
    const to = nextTabId(TAB_IDS, id, e.key);
    if (!to) return;
    e.preventDefault();
    setTab(to);
    window.document.getElementById(`wtab-${to}`)?.focus();
  };

  const show = (t: Tab) => (tab === t ? "flex" : "hidden lg:flex");
  const panelA11y = (t: Tab) => (compact ? { role: "tabpanel" as const, "aria-labelledby": `wtab-${t}` } : {});
  const isAi = doc.origin.kind !== "manual";
  const pendingRecovered = recovery?.pendingText ? Object.keys(recovery.pendingText).length : 0;

  if (!selected) return null;

  const whereOf = (r: PartRef) => (description.ok ? (description.placements.find((x) => x.part === r.part && x.copy === r.copy)?.text ?? null) : null);
  const unplacedRefs = sceneUnplaced ? sceneUnplaced.refs : unplacedFromLayout(deferredDoc);
  const manyPieces = refs.length > 1;

  return (
    <div data-studio className="flex min-h-[30rem] min-w-0 flex-1 flex-col" data-testid="written-studio">
      <div className="shrink-0 border-b-2 border-linea bg-superficie">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 sm:px-4">
          <Link href="/disenos" className="py-1 text-sm underline underline-offset-4">
            {T.volver}
          </Link>
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={titleId} className="sr-only">
              {T.nombreDiseno}
            </label>
            <input
              id={titleId}
              value={titleText}
              onChange={(e) => onTitle(e.target.value)}
              aria-invalid={titleProblems.length > 0 ? true : undefined}
              aria-describedby={titleProblems.length > 0 ? `${titleId}-error` : `${titleId}-sub`}
              className="w-full rounded-xl border-2 border-borde bg-superficie px-3 py-1 font-display text-lg font-bold aria-invalid:border-error"
              data-testid="written-title"
            />
            {titleProblems.length > 0 ? (
              <p id={`${titleId}-error`} className="mt-1 text-sm font-bold text-error">
                {titleProblems[0]} No se guarda hasta que lo corrijas.
              </p>
            ) : (
              <p id={`${titleId}-sub`} className="sr-only">
                {T.subtitulo}
              </p>
            )}
          </div>
          {isAi ? <span className="rounded-full border-2 border-marino px-3 py-0.5 text-sm font-bold">Generado con IA</span> : null}
          <SaveIndicator status={status} />
        </div>
      </div>

      <SessionBanners
        status={status}
        autosave={autosave}
        recovery={recovery}
        edited={state.revision > 0}
        onAccept={session.acceptRecovery}
        onDismiss={session.dismissRecovery}
        recoveryExtra={pendingRecovered > 0 ? `Incluye líneas sin leer en ${pendingRecovered === 1 ? "1 parte" : `${pendingRecovered} partes`}.` : undefined}
      />

      <div role="tablist" aria-label={T.pestanas.etiqueta} className="flex shrink-0 gap-2 border-b-2 border-linea bg-superficie px-3 py-1.5 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`wtab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`wpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onKeyDown={(e) => onTabKey(e, t.id)}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full border-2 border-marino px-2 py-1.5 text-sm font-bold sm:text-base ${tab === t.id ? "bg-marino text-white" : "hover:bg-marino hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 p-3 lg:grid-cols-[22rem_minmax(0,1.1fr)_minmax(0,1fr)] 2xl:grid-cols-[24rem_minmax(0,1.2fr)_minmax(0,1fr)]" data-testid="written-layout">
        <div id="wpanel-parts" {...panelA11y("parts")} className={`${show("parts")} relative min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain`} data-column="parts">
          <PartsPanel store={store} doc={deferredDoc} selectedId={selected.id} onSelect={selectPart} limits={limits} guard={guard} announce={setAnnounce} />
          <YarnPanel
            store={store}
            technique="crochet"
            gaugeAssumed={!deferredDoc.gauge}
            yarns={deferredDoc.yarns}
            activeId={activeYarn}
            onActiveChange={setActiveYarn}
            help={T.lanas.ayuda}
            replaceHelp={T.lanas.eligeReemplazo}
            replaceQuestion={T.lanas.reemplazoPregunta}
          />
          <WrittenGauge store={store} doc={deferredDoc} />
          {!review.valid && review.savable ? (
            <section role="status" className="grid gap-1 rounded-2xl border-2 border-mostaza bg-superficie px-3 py-2 text-sm" data-testid="written-draft">
              <h2 className="font-display text-base font-bold">{T.borradorTitulo}</h2>
              <p>{T.borradorTexto}</p>
            </section>
          ) : null}
          <p className="rounded-2xl border-2 border-linea bg-superficie px-3 py-2 text-sm text-tinta-suave" data-testid="knit-written-notice">
            {T.tejer}
          </p>
          {compact ? <LegalLinks className="px-2 pb-1" /> : null}
        </div>

        <div id="wpanel-editor" {...panelA11y("editor")} className={`${show("editor")} relative min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain`} data-column="editor">
          <section aria-label={T.editor.titulo} className="grid gap-3 rounded-2xl border-2 border-linea bg-superficie p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold" data-testid="editor-part-name">
                {selected.name}
              </h2>
              <div className="flex gap-2">
                <button type="button" className={BTN} onClick={() => store.undo()} disabled={!state.canUndo} data-testid="undo">
                  {T.editor.deshacer}
                </button>
                <button type="button" className={BTN} onClick={() => store.redo()} disabled={!state.canRedo} data-testid="redo">
                  {T.editor.rehacer}
                </button>
              </div>
            </div>
            <div role="tablist" aria-label="Forma de editar" className="flex gap-2" data-testid="editor-tabs">
              {EDIT_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  id={`wedit-tab-${m}`}
                  aria-selected={editMode === m}
                  aria-controls={`wedit-panel-${m}`}
                  tabIndex={editMode === m ? 0 : -1}
                  onClick={() => requestMode(m)}
                  onKeyDown={(e) => onEditTabKey(e, m)}
                  className={`${BTN} ${editMode === m ? "bg-marino text-white" : ""}`}
                  data-testid={m === "text" ? "tab-text" : "tab-blocks"}
                >
                  {m === "text" ? T.editor.pestanaTexto : T.editor.pestanaBloques}
                </button>
              ))}
            </div>
            <p className="text-sm text-tinta-suave" data-testid="dialect-line" data-dialect={dialect}>
              {T.editor.dialecto(dialect)}{" "}
              {detached ? null : (
                <Link href="/cuenta" className="underline underline-offset-2">
                  {T.editor.cambiarDialecto}
                </Link>
              )}
            </p>
            {editMode === "text" ? (
              <div id="wedit-panel-text" role="tabpanel" aria-labelledby="wedit-tab-text">
                <PartTextEditor
                  key={selected.id}
                  store={store}
                  buffers={buffers}
                  part={selected}
                  review={review.byPart.get(selected.id) ?? { byRound: new Map(), general: [] }}
                  limits={limits}
                  onCaretRound={onCaretRound}
                  lineRequest={lineRequest}
                  onUnplaced={(labels) => setTextNotice(T.partes.sinUbicar(labels.join(", ")))}
                />
              </div>
            ) : (
              <div id="wedit-panel-blocks" role="tabpanel" aria-labelledby="wedit-tab-blocks">
                <BlockEditor
                  key={selected.id}
                  store={store}
                  part={selected}
                  yarns={doc.yarns}
                  dialect={dialect}
                  policy={blockPolicy}
                  actions={blockActions}
                  review={review.byPart.get(selected.id)}
                  onEditInText={editInText}
                  announce={setAnnounce}
                  onRoundFocus={onCaretRound}
                />
              </div>
            )}
            {textNotice ? (
              <p role="status" className="rounded-lg border-l-4 border-mostaza pl-2 text-sm">
                {textNotice}
              </p>
            ) : null}
            {review.general.length > 0 ? (
              <ul className="grid gap-1 text-sm" data-testid="doc-review">
                {review.general.map((it, k) => (
                  <li key={`${it.issue.code}-${k}`} className={`rounded-lg border-l-4 pl-2 ${it.issue.severity === "error" ? "border-error" : "border-marino"}`}>
                    {it.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <div id="wpanel-view" {...panelA11y("view")} className={`${show("view")} relative min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain`} data-column="view">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold">{T.vista.titulo}</h2>
            <button
              type="button"
              aria-pressed={positioning}
              aria-describedby={`${descId}-pos`}
              onClick={() => {
                setPositioning((v) => !v);
                setPosNotice(null);
                if (!positioning) onPosTarget({ part: selected.id, copy: 0 });
              }}
              className={`${BTN} ${positioning ? "bg-marino text-white" : ""}`}
              data-testid="position-mode"
            >
              {T.vista.posicionar}
            </button>
            <p id={`${descId}-pos`} className="basis-full text-sm text-tinta-suave">
              {positioning ? (posMode === "surface" ? T.posicion.tocarAyuda : T.posicion.tocarElegir) : T.vista.posicionarAyuda}
            </p>
          </div>
          <LimitsMeter limits={limits} />
          <AmigurumiViewerLoader
            source={store}
            controls={controls}
            perf={perf}
            forceNoWebGL={forceNoWebGL}
            heightPx={compact ? 360 : 460}
            describedBy={descId}
            onPick={onPick}
            onStatus={onViewerStatus}
            anchorTarget={positioning ? target : null}
            positioning={positioning}
            onHandle={(h) => {
              viewerRef.current = h;
              if (h) applyHighlight();
            }}
          />
          {/* Debajo del visor: activar "Posicionar" no mueve el 3D. */}
          {positioning ? (
            <PositionPanel
              store={store}
              doc={doc}
              target={target}
              onTarget={onPosTarget}
              mode={posMode}
              onMode={onPosMode}
              whereText={whereOf(target)}
              notice={posNotice}
              onNotice={setPosNotice}
              announce={setAnnounce}
              viewerReady={viewerReady}
            />
          ) : null}
          <AssemblyPanel
            store={store}
            assembly={doc.assembly}
            placements={description.ok ? description.placements : null}
            showWhere={manyPieces || deferredDoc.layout !== undefined}
            unplaced={manyPieces ? unplacedLabels(deferredDoc, unplacedRefs) : []}
            announce={setAnnounce}
          />
          <details className="rounded-xl border-2 border-linea bg-superficie px-3 py-2 text-sm" data-testid="written-description">
            <summary className="cursor-pointer font-bold">{T.vista.descripcionTitulo}</summary>
            <p className="mt-1 text-tinta-suave">{T.vista.descripcionAyuda}</p>
            <p id={descId} className="mt-2 whitespace-pre-line">
              {description.text}
            </p>
          </details>
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only" data-testid="studio-announcement">
        {announce}
      </div>

      <UnreadTextDialog
        open={unreadPrompt !== null}
        onBack={() => {
          const p = unreadPrompt;
          setUnreadPrompt(null);
          if (!p) return;
          // Vuelve al texto de la parte que tiene las líneas sin leer.
          setSelectedId(p.partId);
          setLineRequest(null);
          setEditMode("text");
        }}
        onDiscard={() => {
          const p = unreadPrompt;
          setUnreadPrompt(null);
          if (!p) return;
          buffers.discard(p.partId);
          p.proceed();
        }}
      />

      <LimitDialog
        usage={dialog?.usage ?? null}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          const d = dialog;
          setDialog(null);
          if (!d) return;
          for (const l of d.crossed) accepted.current.add(l);
          d.run();
        }}
      />
    </div>
  );
}

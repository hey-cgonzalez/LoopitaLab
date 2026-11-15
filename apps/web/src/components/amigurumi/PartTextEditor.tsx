"use client";

import { COMMENT_WARNING, countRound, parseRound, type Part } from "@loopitalab/pattern-core";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LimitSummary } from "@/lib/amigurumi/limits.ts";
import type { PartReview, ReviewItem } from "@/lib/amigurumi/review.ts";
import { roundLabel, sourceIndexOfNumber } from "@/lib/amigurumi/rounds.ts";
import type { WrittenStore } from "@/lib/amigurumi/store.ts";
import type { PartText, TextBuffers } from "@/lib/amigurumi/text-buffers.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";

const T = AMIGURUMI_TEXTS.editor;
const A = AMIGURUMI_TEXTS.a11y;
const BTN = "rounded-full border-2 border-marino px-3 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
/** Mientras se escribe, el anuncio del conteo espera esta pausa (no se repite en cada tecla). */
const ANNOUNCE_MS = 700;
/** Agrupa las teclas seguidas en un solo paso del deshacer del diseño. */
const TYPING_IDLE_MS = 800;
const LINE_PX = 24;

type Marker = "error" | "warning" | "limit";

export interface LineRequest {
  partId: string;
  /** Línea desde 1. */
  line: number;
  nonce: number;
}

interface Props {
  store: WrittenStore;
  buffers: TextBuffers;
  part: Part;
  /** Revisión del validador (diferida); `undefined` mientras corre. */
  review: PartReview | undefined;
  limits: LimitSummary;
  /** Vuelta del documento (`part.rounds[j]`) donde está el cursor, para resaltarla en el 3D. */
  onCaretRound(sourceIndex: number | null): void;
  /** Pedido de llevar el cursor a una línea (al tocar un punto del 3D). */
  lineRequest: LineRequest | null;
  /** Piezas que quedaron sin ubicar al bajar la cantidad desde el texto. */
  onUnplaced(labels: string[]): void;
}

const lineOf = (text: string, offset: number) => {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
};
const offsetOfLine = (text: string, line: number) => {
  let off = 0;
  for (let l = 0; l < line; l++) {
    const k = text.indexOf("\n", off);
    if (k < 0) return text.length;
    off = k + 1;
  }
  return off;
};

/**
 * Editor de texto de una parte (ADR 0011, sección 7). Lee en cada cambio (`TextBuffers.input`); los errores de lectura
 * van con su línea y columna, y los del validador junto a su vuelta (`formatPartLines`). Al salir de una línea bien
 * leída la reescribe en forma canónica, nunca la línea del cursor (CA4-E7). Nada de esto espera al 3D.
 */
export function PartTextEditor({ store, buffers, part, review, limits, onCaretRound, lineRequest, onUnplaced }: Props) {
  const uid = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const lastLine = useRef<number | null>(null);
  const pendingSel = useRef<number | null>(null);
  const composing = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [caretLine, setCaretLine] = useState<number | null>(null);
  const [spoken, setSpoken] = useState("");

  const subscribe = useCallback(
    (l: () => void) => {
      const a = store.subscribe(l);
      const b = buffers.subscribe(l);
      return () => {
        a();
        b();
      };
    },
    [store, buffers],
  );
  const view = useSyncExternalStore(
    subscribe,
    () => buffers.view(part.id) as PartText,
    () => buffers.view(part.id) as PartText,
  );
  const text = view.text;

  // El cursor vuelve a su lugar cuando el texto cambió por la forma canónica (React escribe el valor nuevo).
  useLayoutEffect(() => {
    const el = ref.current;
    const at = pendingSel.current;
    pendingSel.current = null;
    if (el && at !== null && document.activeElement === el) el.setSelectionRange(at, at);
  }, [text]);

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
      store.endStroke();
    },
    [store, part.id],
  );

  // Cambiar de parte: el cursor anterior no cuenta como "salir de una línea" de la parte nueva.
  useEffect(() => {
    lastLine.current = null;
    setCaretLine(null);
    onCaretRound(null);
  }, [part.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pedido de ir a una línea (tocar un punto en el 3D o un error de la lista).
  useEffect(() => {
    if (!lineRequest || lineRequest.partId !== part.id) return;
    goToLine(lineRequest.line);
  }, [lineRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  function goToLine(line: number) {
    const el = ref.current;
    if (!el) return;
    const at = offsetOfLine(el.value, Math.max(0, line - 1));
    el.focus();
    el.setSelectionRange(at, at);
    el.scrollTop = Math.max(0, (line - 3) * LINE_PX);
    onCaret();
  }

  /** Salir de la línea `idx`: forma canónica si el texto está leído. El cursor (`caret`) se corre si estaba después. */
  function leave(idx: number, caret: number | null, nowLine: number | null) {
    const r = buffers.leaveLine(part.id, idx);
    if (!r || caret === null) return;
    pendingSel.current = nowLine !== null && nowLine > idx ? caret + r.delta : caret;
  }

  function onCaret() {
    const el = ref.current;
    if (!el || composing.current) return;
    const line = lineOf(el.value, el.selectionStart);
    const prev = lastLine.current;
    if (prev !== null && prev !== line) leave(prev, el.selectionStart, line);
    lastLine.current = line;
    if (line !== caretLine) setCaretLine(line);
  }

  function onBlur() {
    const el = ref.current;
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    store.endStroke();
    const prev = lastLine.current;
    lastLine.current = null;
    if (prev !== null) leave(prev, null, null);
    if (el) setCaretLine(null);
  }

  function onChange(next: string) {
    store.beginStroke();
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      idle.current = null;
      store.endStroke();
    }, TYPING_IDLE_MS);
    const r = buffers.input(part.id, next);
    if (r && r.unplaced.length > 0) onUnplaced(r.unplaced.map((u) => `${part.name} (${u.copy + 1})`));
  }

  // ---------------------------------------------------------------- derivados (del motor)

  const lines = useMemo(() => text.split("\n"), [text]);
  const roundAtLine = useMemo(() => {
    const m = new Map<number, number>();
    view.roundLines.forEach((line, j) => m.set(line, j));
    return m;
  }, [view.roundLines]);

  /** Conteo de la vuelta del cursor: `parseRound` y `countRound` del motor sobre esa línea (sirve aunque el resto no se lea). */
  const caretInfo = useMemo(() => {
    if (caretLine === null) return null;
    const line = lines[caretLine] ?? "";
    const r = parseRound(line, caretLine + 1, buffers.mode);
    if (!r.ok) return null;
    const c = countRound(r.value, part.startYarn);
    const range = r.value.through !== undefined && r.value.through !== r.value.number;
    const prefix = part.construction === "flat" ? "H" : "V";
    const label = range ? `${prefix}${r.value.number}–${r.value.through}` : `${prefix}${r.value.number}`;
    return { text: T.conteo(label, c.produced, c.consumed, range) };
  }, [caretLine, lines, buffers.mode, part.startYarn, part.construction]);

  // Resaltado en el 3D de la vuelta del cursor (la del documento: solo con el texto leído).
  const caretSource = caretLine !== null && view.status === "synced" ? (roundAtLine.get(caretLine + 1) ?? null) : null;
  useEffect(() => onCaretRound(caretSource), [caretSource, part]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Advertencias de puntos por vuelta (límite recomendado, del motor), por vuelta del documento. */
  const limitRounds = useMemo(() => {
    const set = new Set<number>();
    for (const n of limits.roundsOver.get(part.id) ?? []) {
      const j = sourceIndexOfNumber(part, n);
      if (j !== null) set.add(j);
    }
    return [...set].sort((a, b) => a - b);
  }, [limits, part]);

  const markers = useMemo(() => {
    const m = new Map<number, Marker>();
    const put = (line: number | undefined, k: Marker) => {
      if (line === undefined) return;
      const cur = m.get(line);
      if (cur === "error" || (cur === "warning" && k === "limit")) return;
      m.set(line, k);
    };
    for (const e of view.errors) put(Number((e.data as { line?: number } | undefined)?.line ?? 1), "error");
    for (const w of view.warnings) put(Number((w.data as { line?: number } | undefined)?.line ?? 1), "warning");
    if (view.status === "synced") {
      for (const [j, items] of review?.byRound ?? []) {
        const worst = items.some((i) => i.issue.severity === "error") ? "error" : items.some((i) => i.issue.severity === "warning") ? "warning" : null;
        if (worst) put(view.roundLines[j], worst);
      }
      for (const j of limitRounds) put(view.roundLines[j], "limit");
    }
    return m;
  }, [view, review, limitRounds]);

  const hasComment = view.warnings.some((w) => w.code === "PARSE_COMMENT");
  const roundItems = useMemo(() => [...(review?.byRound ?? new Map<number, ReviewItem[]>())].sort((a, b) => a[0] - b[0]), [review]);
  const reviewCount = roundItems.reduce((s, [, l]) => s + l.length, 0) + (review?.general.length ?? 0);

  // Qué se dice, en cadenas estables: la región viva solo cambia cuando cambia el texto (con una pausa), no en cada tecla.
  // La columna del error no entra en el anuncio: cambia con cada tecla de la misma línea.
  const firstError = view.errors[0];
  const errorSummary =
    view.status === "synced"
      ? ""
      : firstError
        ? A.lineasSinLeer(view.errors.length, Number((firstError.data as { line?: number } | undefined)?.line ?? 1), firstError.message)
        : T.sinAplicar;
  const firstReview = roundItems[0];
  const firstReviewItem = firstReview?.[1][0];
  const reviewSummary = view.status === "synced" && firstReview && firstReviewItem ? A.revisionAviso(reviewCount, `${roundLabel(part, firstReview[0])}: ${firstReviewItem.message}`) : "";
  const hadProblem = useRef(false);
  const caretText = caretInfo?.text ?? "";
  const editing = caretLine !== null;
  useEffect(() => {
    const t = setTimeout(() => {
      // Sin el cursor en el cuadro (al cargar, al salir) no se anuncia nada.
      if (!editing) {
        setSpoken("");
        return;
      }
      const said = [caretText];
      if (errorSummary) {
        hadProblem.current = true;
        said.push(errorSummary);
      } else if (hadProblem.current) {
        hadProblem.current = false;
        said.push(T.leido);
      } else if (reviewSummary) said.push(reviewSummary);
      setSpoken(said.filter(Boolean).join(" "));
    }, ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, [editing, caretText, errorSummary, reviewSummary]);

  return (
    <div className="grid gap-3" data-testid="part-text-editor" data-part={part.id} data-status={view.status}>
      <p id={`${uid}-help`} className="text-sm text-tinta-suave">
        {T.ayuda}
      </p>
      <div className="relative flex overflow-hidden rounded-xl border-2 border-borde bg-superficie focus-within:border-marino" style={{ height: `${LINE_PX * 18 + 16}px` }}>
        <div ref={gutterRef} aria-hidden="true" className="shrink-0 overflow-hidden border-r-2 border-linea bg-fondo py-2 text-right font-mono text-xs text-tinta-suave select-none" data-testid="text-gutter">
          {lines.map((_, i) => {
            const mk = markers.get(i + 1);
            return (
              <div key={i} className="flex items-center justify-end gap-1 px-1.5" style={{ height: LINE_PX }} data-line={i + 1} data-marker={mk ?? undefined}>
                {mk ? <span className={mk === "error" ? "font-bold text-error" : mk === "warning" ? "font-bold text-marino" : "font-bold text-indigo"}>{mk === "error" ? "×" : mk === "warning" ? "!" : "▲"}</span> : null}
                <span className="min-w-6">{i + 1}</span>
              </div>
            );
          })}
        </div>
        <label htmlFor={`${uid}-text`} className="sr-only">
          {T.etiquetaTexto(part.name)}
        </label>
        <textarea
          ref={ref}
          id={`${uid}-text`}
          value={text}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-invalid={view.status !== "synced" ? true : undefined}
          aria-describedby={`${uid}-help ${uid}-status`}
          onChange={(e) => onChange(e.target.value)}
          onSelect={onCaret}
          onKeyUp={onCaret}
          onClick={onCaret}
          onBlur={onBlur}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => {
            composing.current = false;
            onCaret();
          }}
          onScroll={(e) => {
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          data-focus-inset
          className="min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-2 font-mono text-sm whitespace-pre"
          style={{ lineHeight: `${LINE_PX}px` }}
          data-testid="part-text"
        />
      </div>

      <p className="min-h-6 text-sm" data-testid="caret-count">
        <span className="font-bold">{T.vueltaActual}: </span>
        {caretInfo ? caretInfo.text : T.sinVuelta}
      </p>
      <p role="status" aria-live="polite" className="sr-only" data-testid="caret-count-announcement">
        {spoken}
      </p>

      {/* Sin `role="status"`: la columna del error cambia con cada tecla y se repetiría. Lo que se dice va en la región de arriba. */}
      <div id={`${uid}-status`} className="grid gap-2" data-testid="read-status">
        {view.status === "synced" ? (
          <p className="text-sm text-exito">{T.leido}</p>
        ) : (
          <div className="grid gap-2 rounded-xl border-2 border-error px-3 py-2">
            <p className="font-bold text-error">{view.status === "unread" ? T.sinLeer : T.sinAplicar}</p>
            <ul className="grid gap-1 text-sm" data-testid="read-errors">
              {view.errors.map((e, k) => {
                const d = (e.data ?? {}) as { line?: number; column?: number };
                const line = Number(d.line ?? 1);
                return (
                  <li key={`${e.code}-${k}`} data-line={line}>
                    <button type="button" className="text-left underline underline-offset-2" onClick={() => goToLine(line)} aria-label={`${T.irALinea(line)}: ${e.message}`}>
                      <span className="font-bold">{T.lineaColumna(line, Number(d.column ?? 1))}:</span> {e.message}
                    </button>
                  </li>
                );
              })}
              {view.rejected.map((e, k) => (
                <li key={`${e.code}-${k}`}>{e.message}</li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={BTN} onClick={() => buffers.discard(part.id)} data-testid="discard-unread">
                {T.descartar}
              </button>
              <span className="text-sm text-tinta-suave">{T.descartarAyuda}</span>
            </div>
          </div>
        )}
        {hasComment ? (
          <p className="text-sm font-bold text-marino" data-testid="comment-warning">
            {COMMENT_WARNING}
          </p>
        ) : null}
      </div>

      <section aria-labelledby={`${uid}-review`} className="grid gap-2" data-testid="part-review">
        <h3 id={`${uid}-review`} className="font-display text-base font-bold">
          {T.revision}
        </h3>
        {review === undefined ? <p className="text-sm text-tinta-suave">{T.revisando}</p> : null}
        {review !== undefined && reviewCount === 0 && limitRounds.length === 0 && !limits.partsOverRounds.has(part.id) && !limits.partsOverCopies.has(part.id) ? (
          <p className="text-sm text-tinta-suave">{T.sinProblemas}</p>
        ) : null}
        <ul className="grid gap-1.5 text-sm">
          {review?.general.map((it, k) => <ReviewLine key={`g-${k}`} item={it} />)}
          {roundItems.map(([j, items]) =>
            items.map((it, k) => (
              <ReviewLine
                key={`${j}-${k}`}
                item={it}
                label={roundLabel(part, j)}
                line={view.status === "synced" ? view.roundLines[j] : undefined}
                onGo={goToLine}
                round={j}
              />
            )),
          )}
          {limitRounds.map((j) => (
            <li key={`lim-${j}`} className="rounded-lg border-l-4 border-mostaza pl-2" data-kind="limit" data-round={j}>
              {view.status === "synced" && view.roundLines[j] ? (
                <button type="button" className="text-left underline underline-offset-2" onClick={() => goToLine(view.roundLines[j] as number)}>
                  {T.limiteVuelta(roundLabel(part, j))}
                </button>
              ) : (
                T.limiteVuelta(roundLabel(part, j))
              )}
            </li>
          ))}
          {limits.partsOverRounds.has(part.id) ? (
            <li className="rounded-lg border-l-4 border-mostaza pl-2" data-kind="limit">
              {T.limiteVueltas}
            </li>
          ) : null}
          {limits.partsOverCopies.has(part.id) ? (
            <li className="rounded-lg border-l-4 border-mostaza pl-2" data-kind="limit">
              {T.limiteCopias}
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function ReviewLine({ item, label, line, onGo, round }: { item: ReviewItem; label?: string; line?: number; onGo?: (line: number) => void; round?: number }) {
  const tone = item.issue.severity === "error" ? "border-error" : item.issue.severity === "warning" ? "border-marino" : "border-linea";
  const head = label ? `${label}: ` : "";
  return (
    <li className={`grid gap-0.5 rounded-lg border-l-4 pl-2 ${tone}`} data-code={item.issue.code} data-severity={item.issue.severity} data-round={round}>
      {line !== undefined && onGo ? (
        <button type="button" className="text-left underline underline-offset-2" onClick={() => onGo(line)}>
          <span className="font-bold">{head}</span>
          {item.message}
        </button>
      ) : (
        <span>
          <span className="font-bold">{head}</span>
          {item.message}
        </span>
      )}
      {item.hints.map((h) => (
        <span key={h} className="text-tinta-suave" data-hint={h}>
          <span className="font-bold">{T.pista}:</span> {AMIGURUMI_TEXTS.pistas[h]}
        </span>
      ))}
    </li>
  );
}

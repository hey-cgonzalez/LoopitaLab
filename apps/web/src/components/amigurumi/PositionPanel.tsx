"use client";

import { LIMITS, type Part, type PartRef, type Placement, type WrittenPattern } from "@loopitalab/pattern-core";
import { useEffect, useId, useRef, useState } from "react";
import {
  freePlacement,
  hostRounds,
  pieceRefs,
  placementOf,
  sameRef,
  surfacePlacement,
  withSurface,
  wrapDeg,
  type PlacementMode,
} from "@/lib/amigurumi/placement.ts";
import type { WrittenStore } from "@/lib/amigurumi/store.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";
import { unplacedLabels } from "./PartsPanel.tsx";

const T = AMIGURUMI_TEXTS.posicion;
const BTN = "rounded-full border-2 border-marino px-3 py-1 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const FIELD = "rounded-xl border-2 border-borde bg-superficie px-2 py-1";

const refKey = (r: PartRef) => `${r.part}\u0000${r.copy}`;
const keyRef = (k: string): PartRef => {
  const [part = "", copy = "0"] = k.split("\u0000");
  return { part, copy: Number(copy) };
};

export const roundWord = (p: Part | undefined) => (p?.construction === "flat" ? "fila" : "vuelta");

interface Props {
  store: WrittenStore;
  doc: WrittenPattern;
  target: PartRef;
  onTarget(ref: PartRef): void;
  /** Modo efectivo de la pieza (el del documento, o "cosida" elegido y todavía sin ancla). */
  mode: PlacementMode;
  onMode(mode: PlacementMode): void;
  /** "Dónde va" de la pieza, de `describeWritten` (la misma lógica de "Dónde va cada pieza"). */
  whereText: string | null;
  /** Aviso del último toque o acción (lo pone también el estudio al tocar el 3D). */
  notice: string | null;
  onNotice(text: string | null): void;
  announce(text: string): void;
  /** Hay vista 3D con escena (si no, se avisa que se ubica con la vuelta y el punto). */
  viewerReady: boolean;
}

/**
 * Modo "Posicionar" (T16; decisión 3; ADR 0011, sección 2): elegir pieza y copia, coserla a otra tocando su superficie
 * en el 3D (lo maneja el estudio con `pick`) o con la vuelta y el punto (alternativa sin puntero), inclinar, girar y
 * separar, extremo cosido, pieza principal libre y "Quitar posición". Cada cambio es una operación de `edit-written.ts`
 * (un paso de deshacer por gesto: arrastrar un control va en una ráfaga).
 */
export function PositionPanel({ store, doc, target, onTarget, mode, onMode, whereText, notice, onNotice, announce, viewerReady }: Props) {
  const uid = useId();
  const refs = pieceRefs(doc);
  const labelOf = (r: PartRef) => unplacedLabels(doc, [r])[0] ?? r.part;
  const current = placementOf(doc, target);
  const targetLabel = labelOf(target);

  function run(placement: Placement | null, done?: string): boolean {
    if (!placement) {
      onNotice(T.noSePudo);
      return false;
    }
    const before = store.doc;
    const r = store.run({ type: "setPlacement", placement });
    if (!r.changed) {
      // Sin cambio: igual a lo que había (nada que avisar) o rechazado por un error estructural.
      if (JSON.stringify(placementOf(before, placement.target)) !== JSON.stringify(placement)) onNotice(T.noSePudo);
      return false;
    }
    onNotice(null);
    if (done) announce(done);
    return true;
  }

  function chooseMode(next: PlacementMode) {
    if (next === mode) return;
    if (next === "auto") {
      clear();
      onMode("auto");
      return;
    }
    if (next === "free") {
      if (run(freePlacement(target, [0, 0, 0], [0, 0, 0]), T.libreLista(targetLabel))) onMode("free");
      return;
    }
    onMode("surface");
    onNotice(null);
  }

  function clear() {
    const r = store.run({ type: "clearPlacement", ref: target });
    if (r.changed) {
      onNotice(T.quitada(targetLabel));
      announce(T.quitada(targetLabel));
    }
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="grid gap-3 rounded-2xl border-2 border-marino bg-superficie p-3 text-sm" data-testid="position-panel">
      <h3 id={`${uid}-title`} className="font-display text-base font-bold">
        {T.titulo}
      </h3>

      <label className="grid gap-1">
        <span className="font-bold">{T.pieza}</span>
        <select value={refKey(target)} onChange={(e) => onTarget(keyRef(e.target.value))} className={FIELD} data-testid="position-target">
          {refs.map((r) => (
            <option key={refKey(r)} value={refKey(r)}>
              {labelOf(r)}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="grid gap-1">
        <legend className="font-bold">{T.como}</legend>
        {(
          [
            ["surface", T.cosida],
            ["free", T.libre],
            ["auto", T.auto],
          ] as const
        ).map(([m, label]) => (
          <label key={m} className="inline-flex items-center gap-2">
            <input type="radio" name={`${uid}-mode`} checked={mode === m} onChange={() => chooseMode(m)} data-testid={`position-mode-${m}`} />
            {label}
          </label>
        ))}
        <p className="text-tinta-suave">{mode === "surface" ? T.cosidaAyuda : mode === "free" ? T.libreAyuda : T.autoAyuda}</p>
        {mode === "surface" && !viewerReady ? <p className="text-tinta-suave">{T.sinVisor}</p> : null}
      </fieldset>

      {mode === "surface" ? <SurfaceControls key={refKey(target)} doc={doc} store={store} target={target} current={current} run={run} labelOf={labelOf} /> : null}
      {mode === "free" && current?.at.type === "free" ? <FreeControls key={refKey(target)} store={store} target={target} current={current} run={run} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BTN} onClick={clear} disabled={!current} data-testid="position-clear">
          {T.quitar}
        </button>
      </div>

      {whereText ? (
        <p className="rounded-lg border-l-4 border-marino pl-2" data-testid="position-where">
          <span className="font-bold">{T.actual}: </span>
          {whereText}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg border-l-4 border-mostaza pl-2" data-testid="position-notice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- cosida

function SurfaceControls({
  doc,
  store,
  target,
  current,
  run,
  labelOf,
}: {
  doc: WrittenPattern;
  store: WrittenStore;
  target: PartRef;
  current: Placement | undefined;
  run(p: Placement | null, done?: string): boolean;
  labelOf(r: PartRef): string;
}) {
  const uid = useId();
  const at = current?.at.type === "surface" ? current.at : undefined;
  const hosts = pieceRefs(doc).filter((r) => !sameRef(r, target));
  const [hostKey, setHostKey] = useState(() => refKey(at?.host ?? hosts[0] ?? target));
  const [roundText, setRoundText] = useState(at ? String(at.round) : "");
  const [stitchText, setStitchText] = useState(at ? String(at.stitch + 1) : "1");
  const [error, setError] = useState<string | null>(null);

  // Un toque en el 3D (o deshacer) cambia el ancla: los campos la siguen.
  const anchorKey = at ? `${refKey(at.host)}|${at.round}|${at.stitch}` : "";
  useEffect(() => {
    if (!at) return;
    setHostKey(refKey(at.host));
    setRoundText(String(at.round));
    setStitchText(String(at.stitch + 1));
    setError(null);
  }, [anchorKey]);

  const host = keyRef(hostKey);
  const hostPart = doc.parts.find((p) => p.id === host.part);
  const rounds = hostPart ? hostRounds(hostPart) : [];
  const word = roundWord(hostPart);
  const first = rounds[0]?.number ?? 1;
  const last = rounds.at(-1)?.number ?? 1;
  const roundNumber = Number(roundText);
  const roundInfo = rounds.find((r) => r.number === roundNumber);

  function apply() {
    if (!hostPart) return;
    const r = Number(roundText);
    const info = rounds.find((x) => x.number === r);
    if (!Number.isInteger(r) || !info) {
      setError(T.vueltaNoExiste(word, first, last));
      return;
    }
    const k = Number(stitchText);
    if (!Number.isInteger(k) || k < 1 || k > info.stitches) {
      setError(T.puntoNoExiste(info.stitches));
      return;
    }
    setError(null);
    run(surfacePlacement(doc, target, host, r, k - 1, current), T.cosidaEn(labelOf(target), labelOf(host), word, r, k));
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      apply();
    }
  };

  const rot = at?.rotationDeg ?? [0, 0, 0];
  const setRot = (i: 0 | 1 | 2, v: number) => {
    if (!current || current.at.type !== "surface") return;
    const next = [...current.at.rotationDeg];
    next[i] = v;
    run(withSurface(current, { rotationDeg: next }));
  };

  return (
    <div className="grid gap-3" data-testid="position-surface">
      <fieldset className="grid gap-2 rounded-xl border-2 border-linea p-2">
        <legend className="px-1 font-bold">{T.anfitrion}</legend>
        <p className="text-tinta-suave">{T.tocarAyuda}</p>
        <label className="grid gap-1">
          <span className="sr-only">{T.anfitrion}</span>
          <select value={hostKey} onChange={(e) => setHostKey(e.target.value)} className={FIELD} data-testid="position-host">
            {hosts.map((r) => (
              <option key={refKey(r)} value={refKey(r)}>
                {labelOf(r)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span>{T.vuelta}</span>
            <input
              type="number"
              inputMode="numeric"
              min={first}
              max={last}
              value={roundText}
              onChange={(e) => setRoundText(e.target.value)}
              onKeyDown={onEnter}
              aria-describedby={`${uid}-round-help`}
              aria-invalid={error ? true : undefined}
              className={`${FIELD} w-20`}
              data-testid="position-round"
            />
          </label>
          <label className="grid gap-1">
            <span>{T.punto}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={roundInfo?.stitches}
              value={stitchText}
              onChange={(e) => setStitchText(e.target.value)}
              onKeyDown={onEnter}
              aria-describedby={`${uid}-stitch-help`}
              aria-invalid={error ? true : undefined}
              className={`${FIELD} w-20`}
              data-testid="position-stitch"
            />
          </label>
          <button type="button" className={BTN} onClick={apply} disabled={!hostPart} data-testid="position-apply">
            {T.coserAqui}
          </button>
        </div>
        <p id={`${uid}-round-help`} className="text-tinta-suave">
          {T.vueltasDe(first, last, word === "fila" ? "Filas" : "Vueltas")}
        </p>
        {roundInfo ? (
          <p id={`${uid}-stitch-help`} className="text-tinta-suave">
            {T.puntoAyuda(roundInfo.stitches)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="font-bold text-error" data-testid="position-error">
            {error}
          </p>
        ) : null}
      </fieldset>

      {at && current ? (
        <>
          <fieldset className="grid gap-1">
            <legend className="font-bold">{T.extremo}</legend>
            {(
              [
                ["end", T.extremoFinal],
                ["start", T.extremoInicio],
              ] as const
            ).map(([a, label]) => (
              <label key={a} className="inline-flex items-center gap-2">
                <input type="radio" name={`${uid}-attach`} checked={at.attach === a} onChange={() => run(withSurface(current, { attach: a }))} data-testid={`position-attach-${a}`} />
                {label}
              </label>
            ))}
          </fieldset>
          {/* rotationDeg = [sobre la normal, sobre la tangente, sobre el meridiano] (ADR 0010, T10-4). */}
          <AngleControl store={store} label={T.girar} help={T.girarAyuda} value={rot[0]} onChange={(v) => setRot(0, v)} testId="position-rot-normal" />
          <AngleControl store={store} label={T.inclinar} help={T.inclinarAyuda} value={rot[1]} onChange={(v) => setRot(1, v)} testId="position-rot-tangent" />
          <AngleControl store={store} label={T.ladear} help={T.ladearAyuda} value={rot[2]} onChange={(v) => setRot(2, v)} testId="position-rot-meridian" />
          <NumberField
            label={T.separar}
            help={T.separarAyuda(LIMITS.maxOffsetCm)}
            value={at.offsetCm ?? 0}
            step={0.1}
            min={-LIMITS.maxOffsetCm}
            max={LIMITS.maxOffsetCm}
            onCommit={(v) => run(withSurface(current, { offsetCm: v }))}
            testId="position-offset"
          />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- libre

function FreeControls({ store, target, current, run }: { store: WrittenStore; target: PartRef; current: Placement; run(p: Placement | null, done?: string): boolean }) {
  if (current.at.type !== "free") return null;
  const { positionCm, rotationDeg } = current.at;
  const setPos = (i: 0 | 1 | 2, v: number) => {
    const next = [...positionCm];
    next[i] = v;
    run(freePlacement(target, next, rotationDeg));
  };
  const setRot = (i: 0 | 1 | 2, v: number) => {
    const next = [...rotationDeg];
    next[i] = v;
    run(freePlacement(target, positionCm, next));
  };
  const max = LIMITS.maxPositionCm;
  return (
    <div className="grid gap-2" data-testid="position-free">
      <div className="flex flex-wrap gap-3">
        <NumberField label={T.posicionX} value={positionCm[0]} step={0.5} min={-max} max={max} onCommit={(v) => setPos(0, v)} testId="position-free-x" />
        <NumberField label={T.posicionY} value={positionCm[1]} step={0.5} min={-max} max={max} onCommit={(v) => setPos(1, v)} testId="position-free-y" />
        <NumberField label={T.posicionZ} value={positionCm[2]} step={0.5} min={-max} max={max} onCommit={(v) => setPos(2, v)} testId="position-free-z" />
      </div>
      {/* Euler XYZ, como `THREE.Euler` con orden "XYZ" (ADR 0010, T10-4). */}
      <AngleControl store={store} label={T.giroX} value={rotationDeg[0]} onChange={(v) => setRot(0, v)} testId="position-free-rx" />
      <AngleControl store={store} label={T.giroY} value={rotationDeg[1]} onChange={(v) => setRot(1, v)} testId="position-free-ry" />
      <AngleControl store={store} label={T.giroZ} value={rotationDeg[2]} onChange={(v) => setRot(2, v)} testId="position-free-rz" />
    </div>
  );
}

// ---------------------------------------------------------------- controles

/**
 * Ángulo de −180 a 180 (`LIMITS.maxRotationDeg`): deslizador y campo. Arrastrar el deslizador es UN paso de deshacer
 * (ráfaga del almacén entre `pointerdown` y `pointerup`); cada flecha del teclado y cada valor escrito, uno.
 */
function AngleControl({ store, label, help, value, onChange, testId }: { store: WrittenStore; label: string; help?: string; value: number; onChange(v: number): void; testId: string }) {
  const uid = useId();
  const max = LIMITS.maxRotationDeg;
  const end = () => store.endStroke();
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${uid}-range`} className="min-w-[5rem] font-bold">
          {label}
        </label>
        <input
          id={`${uid}-range`}
          type="range"
          min={-max}
          max={max}
          step={1}
          value={value}
          aria-valuetext={`${value} ${T.grados}`}
          aria-describedby={help ? `${uid}-help` : undefined}
          onPointerDown={() => store.beginStroke()}
          onPointerUp={end}
          onLostPointerCapture={end}
          onBlur={end}
          onChange={(e) => onChange(wrapDeg(Number(e.target.value)))}
          className="min-w-[8rem] flex-1"
          data-testid={`${testId}-range`}
        />
        <NumberField label={`${label} (${T.grados})`} hideLabel value={value} step={1} min={-max} max={max} onCommit={(v) => onChange(wrapDeg(v))} testId={testId} />
      </div>
      {help ? (
        <p id={`${uid}-help`} className="text-tinta-suave">
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** Campo numérico que confirma al salir o con Enter (un paso de deshacer) y sigue al documento si no tiene el foco. */
function NumberField({
  label,
  help,
  hideLabel = false,
  value,
  step,
  min,
  max,
  onCommit,
  testId,
}: {
  label: string;
  help?: string;
  hideLabel?: boolean;
  value: number;
  step: number;
  min: number;
  max: number;
  onCommit(v: number): void;
  testId: string;
}) {
  const uid = useId();
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  const commit = () => {
    const v = Number(text.replace(",", "."));
    if (text.trim() === "" || !Number.isFinite(v)) {
      setText(String(value));
      return;
    }
    const c = Math.max(min, Math.min(max, v));
    if (c !== value) onCommit(c);
    setText(String(c));
  };
  return (
    <span className="grid gap-1">
      <label htmlFor={`${uid}-n`} className={hideLabel ? "sr-only" : ""}>
        {label}
      </label>
      <input
        id={`${uid}-n`}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        aria-describedby={help ? `${uid}-help` : undefined}
        className={`${FIELD} w-24`}
        data-testid={testId}
      />
      {help ? (
        <span id={`${uid}-help`} className="text-tinta-suave">
          {help}
        </span>
      ) : null}
    </span>
  );
}

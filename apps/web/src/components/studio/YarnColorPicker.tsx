"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { paletteByFamily } from "@/lib/studio/yarn-edit.ts";
import { customColorInfo, paletteNavigate, palettePosition, parseHexInput, type NavKey } from "@/lib/studio/yarn-picker.ts";
import type { DocumentStore } from "@/lib/studio/store.ts";
import { STUDIO_TEXTS } from "@/lib/studio-texts.ts";
import { FIELD, previewHandlers } from "./yarn-picker-ui.ts";

const S = STUDIO_TEXTS.selectorLanas;
const FAMILIES = paletteByFamily();
const NAV_KEYS = new Set<string>(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

interface Props {
  store: DocumentStore;
  /** Posición de la lana en el diseño (a qué lana se le aplica la vista previa). */
  index: number;
  /** Letra de la lana que se edita (A, B…): entra en los nombres accesibles de la paleta (CA3-A2). */
  letter?: string;
  color: { hex: string; paletteId?: string };
  /** Elegir un color de la paleta (o "Usar {más cercano}"): un paso de deshacer. */
  onPick(color: { hex: string; paletteId?: string }): void;
  /** Cambio continuo del color personalizado (arrastrar el selector, escribir el hex): se agrupa en un paso. */
  onCustom(hex: string): void;
}

/**
 * Color de una lana: paleta propia por familias (una fila por familia, foco itinerante con flechas), selector
 * personalizado con "prácticamente igual a…". Al pasar el cursor o el foco por una muestra, la vista previa realista
 * la prueba sin tocar el documento; al elegir, `onPick` escribe (un paso de deshacer).
 */
export function YarnColorPicker({ store, index, letter, color, onPick, onCustom }: Props) {
  const uid = useId();
  const selectedPos = palettePosition(FAMILIES, color.hex);
  const [focusPos, setFocusPos] = useState<{ row: number; col: number }>(selectedPos ?? { row: 0, col: 0 });
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const [hexText, setHexText] = useState(color.hex.toUpperCase());
  const [lastHex, setLastHex] = useState(color.hex);
  // Un cambio de color que no vino de este campo (paleta, deshacer) actualiza el texto.
  if (lastHex !== color.hex) {
    setLastHex(color.hex);
    setHexText(color.hex.toUpperCase());
  }
  const parsed = parseHexInput(hexText);
  const hexInvalid = hexText.trim() !== "" && parsed === null;
  const info = customColorInfo(color.hex);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, row: number, col: number) {
    if (!NAV_KEYS.has(e.key)) return;
    e.preventDefault();
    const next = paletteNavigate(FAMILIES.map((f) => f.colors), { row, col }, e.key as NavKey);
    setFocusPos(next);
    refs.current.get(`${next.row}-${next.col}`)?.focus();
  }

  return (
    <fieldset className="grid gap-2" data-testid="color-picker">
      <legend className="font-bold">{letter ? `${STUDIO_TEXTS.lanas.colorPaleta}: ${S.colorDeLana(letter)}` : STUDIO_TEXTS.lanas.colorPaleta}</legend>
      <p className="text-sm text-tinta-suave">{S.paletaAyuda}</p>
      <div className="grid gap-1" role="group" aria-label={letter ? S.paletaDeLana(letter) : S.paleta}>
        {FAMILIES.map((f, row) => (
          <div key={f.family} role="group" aria-label={f.family} className="flex flex-wrap items-center gap-1" data-family={f.family}>
            <span className="w-20 shrink-0 text-xs text-tinta-suave" aria-hidden="true">
              {f.family}
            </span>
            {f.colors.map((c, col) => {
              const selected = color.paletteId === c.id;
              const tab = focusPos.row === row && focusPos.col === col;
              return (
                <button
                  key={c.id}
                  ref={(el) => {
                    if (el) refs.current.set(`${row}-${col}`, el);
                    else refs.current.delete(`${row}-${col}`);
                  }}
                  type="button"
                  data-swatch={c.id}
                  aria-pressed={selected}
                  aria-label={c.nombre}
                  title={c.nombre}
                  tabIndex={tab ? 0 : -1}
                  style={{ backgroundColor: c.hex }}
                  className={`relative grid size-8 place-items-center [@media(pointer:coarse)]:size-11 rounded-lg border-2 bg-clip-padding ${selected ? "border-marino ring-2 ring-marino ring-offset-1" : "border-borde hover:border-marino"}`}
                  {...previewHandlers(store, index, { color: { hex: c.hex, paletteId: c.id } })}
                  onFocus={(e) => {
                    setFocusPos({ row, col });
                    previewHandlers(store, index, { color: { hex: c.hex, paletteId: c.id } }).onFocus(e);
                  }}
                  onKeyDown={(e) => onKeyDown(e, row, col)}
                  onClick={() => onPick({ hex: c.hex, paletteId: c.id })}
                >
                  {selected ? (
                    <span aria-hidden="true" className="grid size-4 place-items-center rounded-full border border-marino bg-white text-[10px] font-bold leading-none text-marino">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="grid gap-1.5 border-t-2 border-linea pt-2">
        <p className="font-bold">{S.personalizado}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${uid}-picker`} className="sr-only">
            {S.personalizado}
          </label>
          <input
            id={`${uid}-picker`}
            type="color"
            value={color.hex.toLowerCase()}
            onChange={(e) => onCustom(e.target.value)}
            data-testid="custom-color"
            className="h-10 w-16 cursor-pointer rounded-lg border-2 border-borde bg-superficie p-0.5"
          />
          <label htmlFor={`${uid}-hex`} className="sr-only">
            {S.hexEtiqueta}
          </label>
          <input
            id={`${uid}-hex`}
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={hexText}
            maxLength={7}
            aria-invalid={hexInvalid ? true : undefined}
            aria-describedby={hexInvalid ? `${uid}-hex-err` : `${uid}-near`}
            onChange={(e) => {
              setHexText(e.target.value);
              const h = parseHexInput(e.target.value);
              if (h) {
                setLastHex(h);
                onCustom(h);
              }
            }}
            onBlur={() => setHexText(color.hex.toUpperCase())}
            data-testid="custom-hex"
            className={`${FIELD} w-28 font-mono aria-invalid:border-error`}
          />
        </div>
        {hexInvalid ? (
          <p id={`${uid}-hex-err`} role="alert" className="text-sm font-bold text-error">
            {S.hexInvalido}
          </p>
        ) : null}
        <div id={`${uid}-near`} className="grid gap-1 text-sm" aria-live="polite" aria-atomic="true" data-testid="near-color">
          {info.nearest ? (
            <>
              <p>
                {S.masCercano}: <strong>{info.nearest.color.nombre}</strong>
                {info.practicallySame ? <> ({S.practicamenteIgual})</> : null}.
              </p>
              <button
                type="button"
                data-testid="use-nearest"
                className="justify-self-start rounded-full border-2 border-marino px-2.5 py-1 text-sm font-bold hover:bg-marino hover:text-white"
                {...previewHandlers(store, index, { color: { hex: info.nearest.color.hex, paletteId: info.nearest.color.id } })}
                onClick={() => info.nearest && onPick({ hex: info.nearest.color.hex, paletteId: info.nearest.color.id })}
              >
                {S.usarColor} {info.nearest.color.nombre}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </fieldset>
  );
}

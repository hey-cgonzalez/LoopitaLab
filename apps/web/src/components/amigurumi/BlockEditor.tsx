"use client";

import { LOOPS, STITCHES, loopAbbrev, stitchAbbrev, type Dialect, type Item, type ItemPath, type Loop, type Part, type StitchCode, type Yarn } from "@loopitalab/pattern-core";
import { useEffect, useId, useRef, useState } from "react";
import {
  BlockActions,
  blockTree,
  canEditChildrenOf,
  flattenBlocks,
  parentOf,
  pathKey,
  roundCountOf,
  samePath,
  sameSelection,
  type BlockEditPolicy,
  type BlockNode,
  type BlockSelection,
} from "@/lib/amigurumi/blocks.ts";
import type { PartReview } from "@/lib/amigurumi/review.ts";
import { roundLabel } from "@/lib/amigurumi/rounds.ts";
import type { WrittenStore } from "@/lib/amigurumi/store.ts";
import { AMIGURUMI_TEXTS } from "@/lib/amigurumi/texts.ts";

const T = AMIGURUMI_TEXTS.bloques;
const A = AMIGURUMI_TEXTS.a11y;
/** Pausa antes de anunciar el conteo nuevo mientras se escribe una cantidad. */
const ANNOUNCE_MS = 700;
const BTN = "rounded-full border-2 border-marino px-2.5 py-0.5 text-sm font-bold enabled:hover:bg-marino enabled:hover:text-white disabled:opacity-40";
const FIELD = "rounded-lg border-2 border-borde bg-superficie px-2 py-0.5 text-sm";

/*
 * Editor de bloques de una parte (T15 de la fase 4; ADR 0011, sección 7).
 *
 * - **Un solo componente recursivo** (`BlockItem`) dibuja cualquier nivel; los niveles que la política no deja
 *   editar se dibujan con el mismo componente, en solo lectura, con "Editar en el texto".
 * - **Sin copia del patrón**: dibuja `part.rounds` (el documento) con `blockTree`. Cada acción es una operación del
 *   almacén (`BlockActions`) y un paso de deshacer.
 * - **La política es una propiedad**: aquí no se compara ninguna profundidad con un número (`canEditBlock`).
 * - **Selección por rutas** (`BlockSelection`); el foco sigue a la selección.
 * - **Teclado**: cada vuelta es un árbol con un solo punto de tabulación. Flechas arriba y abajo recorren los bloques;
 *   derecha entra al grupo y izquierda sale; Inicio y Fin; Enter lleva a los datos del bloque y Escape vuelve al
 *   bloque; Alt más flechas arriba o abajo mueven. (La pasada completa de accesibilidad es de T17.)
 * - Los conteos son del motor (`roundCountOf` → `concreteRounds`): la interfaz no cuenta.
 */

export interface BlockEditorProps {
  store: WrittenStore;
  part: Part;
  yarns: readonly Yarn[];
  dialect: Dialect;
  policy: BlockEditPolicy;
  actions: BlockActions;
  review?: PartReview | undefined;
  /** Para pruebas. */
  initialSelection?: BlockSelection | null;
  /** "Editar en el texto": la vuelta del documento (`part.rounds[j]`) a la que ir. */
  onEditInText(roundIndex: number): void;
  announce(text: string): void;
  /** Vuelta del documento con el foco, para resaltarla en el 3D (`null` al salir). */
  onRoundFocus?(sourceIndex: number | null): void;
}

interface Ctx {
  store: WrittenStore;
  part: Part;
  yarns: readonly Yarn[];
  dialect: Dialect;
  policy: BlockEditPolicy;
  actions: BlockActions;
  selection: BlockSelection | null;
  /** Foco y selección a un bloque (o a la vuelta, con `path: null`). */
  go(roundIndex: number, path: ItemPath | null): void;
  /** Selecciona sin mover el foco (el foco ya está ahí). */
  mark(roundIndex: number, path: ItemPath | null): void;
  /** Después del próximo dibujo, lleva el foco a esa ruta. */
  focusLater(roundIndex: number, path: ItemPath | null): void;
  onEditInText(roundIndex: number): void;
  announce(text: string): void;
}

const dataKey = (roundIndex: number, path: ItemPath) => `${roundIndex}:${pathKey(path)}`;

function describe(item: Item, ctx: Pick<Ctx, "dialect">): string {
  if (item.type === "stitch") {
    const loop = item.loop && item.loop !== "both" ? ` ${loopAbbrev(item.loop, ctx.dialect)}` : "";
    return `${T.puntoDescripcion(`${stitchAbbrev(item.stitch, ctx.dialect)}${loop}`, item.count)}`;
  }
  if (item.type === "group") return T.grupoDescripcion(item.times, item.items.length);
  return T.cambioDescripcion(item.yarn);
}

export function BlockEditor({ store, part, yarns, dialect, policy, actions, review, initialSelection = null, onEditInText, announce, onRoundFocus }: BlockEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<BlockSelection | null>(initialSelection);
  const pending = useRef<{ roundIndex: number; path: ItemPath | null } | null>(null);
  const uid = useId();

  const mark = (roundIndex: number, path: ItemPath | null) => {
    const next: BlockSelection = { partId: part.id, roundIndex, path };
    setSelection((cur) => (sameSelection(cur, next) ? cur : next));
  };
  const focusNow = (roundIndex: number, path: ItemPath | null): boolean => {
    const root = rootRef.current;
    if (!root) return false;
    const sel = path ? `[data-block="${dataKey(roundIndex, path)}"]` : `[data-round-heading="${roundIndex}"]`;
    const el = root.querySelector<HTMLElement>(sel);
    el?.focus();
    return el !== null;
  };
  const ctx: Ctx = {
    store,
    part,
    yarns,
    dialect,
    policy,
    actions,
    selection,
    mark,
    go: (roundIndex, path) => {
      mark(roundIndex, path);
      focusNow(roundIndex, path);
    },
    focusLater: (roundIndex, path) => {
      mark(roundIndex, path);
      pending.current = { roundIndex, path };
    },
    onEditInText,
    announce,
  };

  // Después de una acción, el foco sigue a la selección (los bloques se identifican por ruta).
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    focusNow(p.roundIndex, p.path);
  });

  // 3D: la vuelta con el foco se resalta.
  const focusedRound = selection && selection.partId === part.id ? selection.roundIndex : null;
  useEffect(() => {
    onRoundFocus?.(focusedRound !== null && focusedRound < part.rounds.length ? focusedRound : null);
  }, [focusedRound, part.rounds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambiar una cantidad o las veces de un grupo cambia los puntos de la vuelta: se anuncia el conteo nuevo con una
  // pausa (no en cada tecla) y solo si el foco sigue en el editor y la vuelta es la misma.
  const focusedCount = focusedRound !== null && focusedRound < part.rounds.length ? roundCountOf(part, focusedRound) : null;
  const countKey = focusedCount ? `${focusedRound}|${focusedCount.produced}|${focusedCount.perRound}` : "";
  const lastCount = useRef(countKey);
  useEffect(() => {
    const prev = lastCount.current;
    lastCount.current = countKey;
    if (!focusedCount || focusedRound === null || prev === countKey || prev.split("|")[0] !== String(focusedRound)) return;
    const t = setTimeout(() => {
      if (!rootRef.current?.contains(window.document.activeElement)) return;
      announce(A.vueltaCambio(roundLabel(part, focusedRound), T.conteo(focusedCount.produced, focusedCount.perRound)));
    }, ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, [countKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const insertRound = (index: number) => {
    actions.insertRound(part.id, index, (ok) => {
      if (!ok) {
        announce(T.sinCambio);
        return;
      }
      ctx.focusLater(index, [0]);
      announce(T.insertada(roundLabelAfterInsert(store, part.id, index)));
    });
  };

  const removeRound = (index: number) => {
    const label = roundLabel(part, index);
    if (!actions.removeRound(part.id, index)) {
      announce(T.unicaVuelta);
      return;
    }
    ctx.focusLater(Math.min(index, part.rounds.length - 2), null);
    announce(T.borrada(label));
  };

  return (
    <div ref={rootRef} className="grid gap-3" data-testid="block-editor" data-part={part.id}>
      <p id={`${uid}-help`} className="text-sm text-tinta-suave">
        {T.ayuda}
      </p>
      <ol className="grid gap-3">
        {part.rounds.map((round, j) => {
          const label = roundLabel(part, j);
          const count = roundCountOf(part, j);
          const items = review?.byRound.get(j) ?? [];
          const mismatch = count && round.expected !== undefined && round.expected !== count.produced;
          const tree = blockTree(round, policy);
          const flat = flattenBlocks(tree);
          const selectedHere = selection && selection.roundIndex === j && selection.path ? selection.path : null;
          const stop = (selectedHere && flat.find((n) => samePath(n.path, selectedHere))?.path) || flat[0]?.path;
          const lastRound = part.rounds.length === 1;
          return (
            <li key={j} className="grid gap-2 rounded-2xl border-2 border-linea bg-superficie p-2" data-testid="block-round" data-round={j} data-selected={selection?.roundIndex === j ? "true" : undefined}>
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
                onFocus={() => {
                  if (selection?.roundIndex !== j) mark(j, null);
                }}
              >
                <h3 tabIndex={-1} data-round-heading={j} className="font-display text-base font-bold outline-none focus-visible:underline" data-testid="block-round-label">
                  {label}
                </h3>
                {count ? (
                  <span className="text-sm" data-testid="block-round-count" data-produced={count.produced}>
                    {T.conteo(count.produced, count.perRound)}
                  </span>
                ) : null}
                {round.expected !== undefined && !mismatch ? <span className="text-sm text-tinta-suave">{T.declarado(round.expected)}</span> : null}
                <span className="flex flex-wrap gap-1.5">
                  <button type="button" className={BTN} onClick={() => insertRound(j)} data-testid="block-insert-before">
                    {T.insertarAntes}
                  </button>
                  <button type="button" className={BTN} onClick={() => insertRound(j + 1)} data-testid="block-insert-after">
                    {T.insertarDespues}
                  </button>
                  <button type="button" className={BTN} onClick={() => removeRound(j)} disabled={lastRound} aria-label={`${T.borrarVuelta} ${label}`} data-testid="block-remove-round">
                    {T.borrarVuelta}
                  </button>
                </span>
              </div>
              {mismatch && count && round.expected !== undefined ? (
                <p className="flex flex-wrap items-center gap-2 rounded-lg border-l-4 border-error pl-2 text-sm" data-testid="block-mismatch">
                  {T.noCuadra(round.expected, count.produced)}
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => {
                      actions.useEngineCount(part.id, j);
                      announce(A.conteoDeclarado(label, count.produced));
                    }}
                  >
                    {T.usarConteo(count.produced)}
                  </button>
                </p>
              ) : null}
              {items
                .filter((it) => !(mismatch && it.issue.code === "ROUND_EXPECTED_MISMATCH"))
                .map((it, k) => (
                  <p key={`${it.issue.code}-${k}`} className={`rounded-lg border-l-4 pl-2 text-sm ${it.issue.severity === "error" ? "border-error" : "border-marino"}`} data-code={it.issue.code}>
                    {it.message}
                  </p>
                ))}
              <ul role="tree" aria-label={T.etiquetaArbol(label)} aria-describedby={`${uid}-help`} className="grid gap-1.5" data-testid="block-tree">
                {tree.map((node) => (
                  <BlockItem key={node.path.join(".")} node={node} roundIndex={j} ctx={ctx} stop={stop} flat={flat} parentEditable />
                ))}
              </ul>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={BTN}
                  onClick={() => {
                    const path = actions.addItem(part.id, j, [], { type: "stitch", stitch: "sc", count: 1 });
                    if (path) {
                      ctx.focusLater(j, path);
                      announce(T.agregado);
                    } else announce(T.sinCambio);
                  }}
                  data-testid="block-add-stitch"
                >
                  {T.agregarPunto}
                </button>
                {yarns.length > 1 ? (
                  <button
                    type="button"
                    className={BTN}
                    onClick={() => {
                      const path = actions.addItem(part.id, j, [], { type: "color", yarn: (yarns.find((y) => y.id !== part.startYarn) ?? (yarns[0] as Yarn)).id });
                      if (path) {
                        ctx.focusLater(j, path);
                        announce(A.cambioAgregado);
                      } else announce(T.sinCambio);
                    }}
                    data-testid="block-add-color"
                  >
                    {T.cambioLana}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <button type="button" className={BTN} onClick={() => insertRound(part.rounds.length)} data-testid="block-insert-end">
          {T.insertarAlFinal}
        </button>
      </div>
    </div>
  );
}

/** "V4" de la vuelta recién insertada (con la numeración que le dio `insertRound`). */
function roundLabelAfterInsert(store: WrittenStore, partId: string, index: number): string {
  const p = store.doc.parts.find((x) => x.id === partId);
  return p ? roundLabel(p, index) : "";
}

interface ItemProps {
  node: BlockNode;
  roundIndex: number;
  ctx: Ctx;
  /** Ruta que es el punto de tabulación del árbol de la vuelta. */
  stop: ItemPath | undefined;
  flat: readonly BlockNode[];
  /** El padre se puede editar (la vuelta cuenta como editable): los solo lectura más altos muestran "Editar en el texto". */
  parentEditable: boolean;
}

/**
 * Un bloque (punto, grupo o cambio de lana) y, si es un grupo, sus hijos con ESTE mismo componente. No sabe de
 * niveles: solo pregunta `node.editable` (`canEditBlock`) y `canEditChildrenOf`.
 */
function BlockItem({ node, roundIndex, ctx, stop, flat, parentEditable }: ItemProps) {
  const { actions, part, dialect, yarns, selection } = ctx;
  const { item, path } = node;
  const key = dataKey(roundIndex, path);
  const isStop = stop !== undefined && samePath(stop, path);
  const selected = selection !== null && selection.roundIndex === roundIndex && selection.path !== null && samePath(selection.path, path);
  const tab = isStop ? 0 : -1;
  const li = useRef<HTMLLIElement>(null);
  const desc = describe(item, ctx);
  const editable = node.editable;
  const readOnlyRoot = !editable && parentEditable;
  const rowId = useId();

  const act = (to: ItemPath | null, message: string) => {
    if (to) {
      ctx.focusLater(roundIndex, to);
      ctx.announce(message);
    } else ctx.announce(T.sinCambio);
  };

  const move = (delta: -1 | 1) => {
    const to = actions.moveBy(part.id, roundIndex, path, delta);
    if (to) act(to, T.movido((to[to.length - 1] as number) + 1, node.siblings));
  };
  const remove = () => {
    const r = actions.removeItem(part.id, roundIndex, path);
    if (r.changed) {
      ctx.focusLater(roundIndex, r.select);
      ctx.announce(T.quitado);
    } else ctx.announce(T.sinCambio);
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLLIElement>) {
    if (e.target !== e.currentTarget) {
      // Dentro de los datos del bloque: Escape (o Enter en un campo de número) vuelve al bloque.
      const el = e.target as HTMLElement;
      if (e.key === "Escape" || (e.key === "Enter" && el.tagName === "INPUT")) {
        e.preventDefault();
        e.stopPropagation();
        li.current?.focus();
      }
      return;
    }
    e.stopPropagation();
    const i = flat.findIndex((n) => samePath(n.path, path));
    const goTo = (n: BlockNode | undefined) => {
      if (!n) return;
      e.preventDefault();
      ctx.go(roundIndex, n.path);
    };
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (editable) move(e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        goTo(flat[i + 1]);
        break;
      case "ArrowUp":
        goTo(flat[i - 1]);
        break;
      case "Home":
        goTo(flat[0]);
        break;
      case "End":
        goTo(flat[flat.length - 1]);
        break;
      case "ArrowRight":
        goTo(node.children?.[0]);
        break;
      case "ArrowLeft":
        goTo(flat.find((n) => samePath(n.path, parentOf(path))));
        break;
      case "Enter": {
        const first = li.current?.querySelector<HTMLElement>(`[data-row="${rowId}"] [data-ctl]`);
        if (first) {
          e.preventDefault();
          first.focus();
        }
        break;
      }
    }
  }

  return (
    <li
      ref={li}
      role="treeitem"
      aria-level={node.depth + 1}
      aria-posinset={node.index + 1}
      aria-setsize={node.siblings}
      aria-selected={selected}
      aria-expanded={node.children ? true : undefined}
      aria-label={desc}
      tabIndex={tab}
      data-block={key}
      data-path={pathKey(path)}
      data-depth={node.depth}
      data-type={item.type}
      data-editable={editable ? "true" : "false"}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) ctx.mark(roundIndex, path);
      }}
      className="rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marino"
    >
      <div
        data-row={rowId}
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 px-2 py-1 ${selected ? "border-marino" : "border-linea"} ${editable ? "" : "bg-fondo"}`}
        onFocus={() => ctx.mark(roundIndex, path)}
      >
        <BlockFields node={node} roundIndex={roundIndex} ctx={ctx} tab={tab} />
        {editable ? (
          <span className="flex flex-wrap gap-1.5">
            <button type="button" tabIndex={tab} data-ctl className={BTN} disabled={node.index === 0} onClick={() => move(-1)} aria-label={`${T.subir}: ${desc}`} data-testid="block-up">
              {T.subir}
            </button>
            <button type="button" tabIndex={tab} data-ctl className={BTN} disabled={node.index === node.siblings - 1} onClick={() => move(1)} aria-label={`${T.bajar}: ${desc}`} data-testid="block-down">
              {T.bajar}
            </button>
            {item.type === "group" && canEditChildrenOf(path, ctx.policy) ? (
              <button
                type="button"
                tabIndex={tab}
                data-ctl
                className={BTN}
                aria-label={`${T.agregarPuntoEn}: ${desc}`}
                onClick={() => {
                  const added = actions.addItem(part.id, roundIndex, path, { type: "stitch", stitch: "sc", count: 1 });
                  if (added) act(added, T.agregado);
                  else ctx.announce(T.sinCambio);
                }}
                data-testid="block-add-in-group"
              >
                {T.agregarPunto}
              </button>
            ) : null}
            {item.type === "group" ? (
              <button
                type="button"
                tabIndex={tab}
                data-ctl
                className={BTN}
                aria-label={`${T.desagrupar}: ${desc}`}
                onClick={() => {
                  if (actions.unwrap(part.id, roundIndex, path)) act(path, T.desagrupado);
                  else ctx.announce(T.sinCambio);
                }}
                data-testid="block-unwrap"
              >
                {T.desagrupar}
              </button>
            ) : (
              <>
                {canEditChildrenOf(path, ctx.policy) ? (
                  <button
                    type="button"
                    tabIndex={tab}
                    data-ctl
                    className={BTN}
                    aria-label={`${T.agrupar}: ${desc}`}
                    onClick={() => act(actions.wrap(part.id, roundIndex, path, path, 2), T.agrupado)}
                    data-testid="block-wrap"
                  >
                    {T.agrupar}
                  </button>
                ) : null}
                {canEditChildrenOf(path, ctx.policy) && node.index < node.siblings - 1 ? (
                  <button
                    type="button"
                    tabIndex={tab}
                    data-ctl
                    className={BTN}
                    aria-label={`${T.agruparConSiguiente}: ${desc}`}
                    onClick={() => act(actions.wrap(part.id, roundIndex, path, [...parentOf(path), node.index + 1], 2), T.agrupado)}
                    data-testid="block-wrap-next"
                  >
                    {T.agruparConSiguiente}
                  </button>
                ) : null}
              </>
            )}
            <button type="button" tabIndex={tab} data-ctl className={BTN} onClick={remove} aria-label={`${T.borrar}: ${desc}`} data-testid="block-remove">
              {T.borrar}
            </button>
          </span>
        ) : readOnlyRoot ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-tinta-suave" data-testid="block-readonly">
              {T.soloLectura} ({T.nivel(node.depth + 1)})
            </span>
            <button type="button" tabIndex={tab} data-ctl className={BTN} onClick={() => ctx.onEditInText(roundIndex)} aria-label={`${T.editarEnTexto}: ${desc}`} data-testid="block-edit-in-text">
              {T.editarEnTexto}
            </button>
          </span>
        ) : null}
      </div>
      {node.children ? (
        <ul role="group" className="ml-4 mt-1.5 grid gap-1.5 border-l-2 border-linea pl-2">
          {node.children.map((child) => (
            <BlockItem key={child.path.join(".")} node={child} roundIndex={roundIndex} ctx={ctx} stop={stop} flat={flat} parentEditable={editable} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Los datos del bloque: editables si la política lo permite; si no, el mismo texto en solo lectura. */
function BlockFields({ node, roundIndex, ctx, tab }: { node: BlockNode; roundIndex: number; ctx: Ctx; tab: 0 | -1 }) {
  const { actions, part, dialect, yarns, store } = ctx;
  const { item, path } = node;
  const [draft, setDraft] = useState<string | null>(null);
  const uid = useId();

  if (item.type === "stitch") {
    const def = STITCHES[item.stitch];
    const hasLoop = def.consumes > 0 && def.produces > 0;
    if (!node.editable) {
      const loop = item.loop && item.loop !== "both" ? ` ${loopAbbrev(item.loop, dialect)}` : "";
      return (
        <span className="font-bold" data-testid="block-label">
          {item.count} {stitchAbbrev(item.stitch, dialect)}
          {loop}
        </span>
      );
    }
    return (
      <>
        <label htmlFor={`${uid}-n`} className="sr-only">
          {T.cantidad}
        </label>
        <input
          id={`${uid}-n`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          tabIndex={tab}
          data-ctl
          value={draft ?? String(item.count)}
          aria-invalid={draft !== null && !(Number.isInteger(Number(draft)) && Number(draft) >= 1) ? true : undefined}
          className={`${FIELD} w-20`}
          data-testid="block-count"
          onFocus={() => store.beginStroke()}
          onBlur={() => {
            store.endStroke();
            setDraft(null);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            const k = Number(v);
            if (v.trim() !== "" && Number.isInteger(k)) actions.setCount(part.id, roundIndex, path, k);
          }}
        />
        <label htmlFor={`${uid}-s`} className="sr-only">
          {T.punto}
        </label>
        <select
          id={`${uid}-s`}
          tabIndex={tab}
          data-ctl
          value={item.stitch}
          className={FIELD}
          data-testid="block-stitch"
          onChange={(e) => {
            if (!actions.setStitch(part.id, roundIndex, path, e.target.value as StitchCode)) ctx.announce(T.sinCambio);
          }}
        >
          {(Object.keys(STITCHES) as StitchCode[]).map((c) => (
            <option key={c} value={c}>
              {stitchAbbrev(c, dialect)} ({STITCHES[c].nameEs})
            </option>
          ))}
        </select>
        {hasLoop ? (
          <>
            <label htmlFor={`${uid}-l`} className="sr-only">
              {T.hebra}
            </label>
            <select
              id={`${uid}-l`}
              tabIndex={tab}
              data-ctl
              value={item.loop ?? "both"}
              className={FIELD}
              data-testid="block-loop"
              onChange={(e) => {
                if (!actions.setLoop(part.id, roundIndex, path, e.target.value as Loop)) ctx.announce(T.sinCambio);
              }}
            >
              <option value="both">{T.hebraAmbas}</option>
              {(Object.keys(LOOPS) as Array<keyof typeof LOOPS>).map((l) => (
                <option key={l} value={l}>
                  {l === "back" ? T.hebraTrasera : T.hebraDelantera} ({loopAbbrev(l, dialect)})
                </option>
              ))}
            </select>
          </>
        ) : null}
      </>
    );
  }

  if (item.type === "group") {
    if (!node.editable) {
      return (
        <span className="font-bold" data-testid="block-label">
          {T.grupo}: {T.repite(item.times)}
        </span>
      );
    }
    return (
      <>
        <span className="font-bold">{T.grupo}</span>
        <label htmlFor={`${uid}-t`} className="text-sm">
          {T.veces}
        </label>
        <input
          id={`${uid}-t`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          tabIndex={tab}
          data-ctl
          value={draft ?? String(item.times)}
          aria-invalid={draft !== null && !(Number.isInteger(Number(draft)) && Number(draft) >= 1) ? true : undefined}
          className={`${FIELD} w-20`}
          data-testid="block-times"
          onFocus={() => store.beginStroke()}
          onBlur={() => {
            store.endStroke();
            setDraft(null);
          }}
          onChange={(e) => {
            const v = e.target.value;
            setDraft(v);
            const k = Number(v);
            if (v.trim() !== "" && Number.isInteger(k)) actions.setTimes(part.id, roundIndex, path, k);
          }}
        />
      </>
    );
  }

  // Cambio de lana
  const yarn = yarns.find((y) => y.id === item.yarn);
  const swatch = <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border-2 border-linea" style={{ backgroundColor: yarn?.color.hex ?? "transparent" }} />;
  if (!node.editable) {
    return (
      <span className="flex items-center gap-1 font-bold" data-testid="block-label">
        {swatch}@{item.yarn}
      </span>
    );
  }
  return (
    <>
      {swatch}
      <label htmlFor={`${uid}-y`} className="text-sm">
        {T.lanaNueva}
      </label>
      <select
        id={`${uid}-y`}
        tabIndex={tab}
        data-ctl
        value={item.yarn}
        className={FIELD}
        data-testid="block-yarn"
        onChange={(e) => {
          if (!actions.setYarn(part.id, roundIndex, path, e.target.value)) ctx.announce(T.sinCambio);
        }}
      >
        {yarns.map((y) => (
          <option key={y.id} value={y.id}>
            {y.id}
          </option>
        ))}
        {yarn ? null : <option value={item.yarn}>{item.yarn}</option>}
      </select>
    </>
  );
}

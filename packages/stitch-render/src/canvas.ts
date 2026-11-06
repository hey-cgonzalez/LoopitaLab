/**
 * Capa 3 del ADR 0004: backend Canvas 2D.
 *
 * - Un sprite por lana, nivel de sombra, orientación y tamaño en px del dispositivo, en
 *   caché. Plano y tubo dibujan con `drawImage` sin transformación (la rotación de 180°
 *   de `top_down` va horneada en el sprite y la compresión del tubo es el ancho de
 *   destino); el círculo usa `setTransform` por instancia.
 * - Cada dibujo hace tres pasadas: fondo de cada punto (agrupado por color en un solo
 *   trazado), la V (sprite) y el resaltado de fila. Así las puntas de la V quedan bajo
 *   la fila que se teje después y los huecos "sin punto" muestran el fondo.
 * - Redibujo incremental: las instancias tocadas marcan baldosas (`dirtyRegions`); las
 *   regiones van en un solo recorte, se limpian y se vuelven a dibujar en orden todas las
 *   instancias que las tocan (`queryGridRects`), incluidas las vecinas que se solapan.
 * - Modos (ver el README): baldosas periódicas en plano y tubo, búfer de la pieza cuando
 *   cabe, o punto a punto con recorte a lo visible.
 * - Nada del DOM es obligatorio: el canvas y la fábrica de sprites se pueden reemplazar
 *   por dobles de prueba (`createRenderer`).
 */
import { HIDDEN, STITCH_EXTENT, STITCH_OVERLAP, type FrameInfo, type StitchLayout, type StitchRenderer, type ViewState, type YarnLook } from "./types.ts";
import { hexToRgb, lookKey, neutralLook, tone } from "./look.ts";
import { buildGrid, dirtyRegions, instanceBounds, queryGridRects, tileClass, tilePlan, tileRect, tileRepresentative, type Rect, type SpatialGrid, type TilePlan } from "./regions.ts";
import { fitView } from "./view.ts";

export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

/** Subconjunto de `CanvasRenderingContext2D` que usa el backend. */
export interface Ctx2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  globalAlpha: number;
  lineWidth: number;
  lineCap: string;
  shadowBlur: number;
  shadowColor: string;
  imageSmoothingEnabled: boolean;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(image: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
}

/** Algo con tamaño en px y un contexto 2D: `HTMLCanvasElement`, `OffscreenCanvas` o un doble de prueba. */
export interface Surface {
  width: number;
  height: number;
  getContext(id: "2d"): unknown;
  convertToBlob?(opts?: { type?: string }): Promise<Blob>;
  toBlob?(cb: (b: Blob | null) => void, type?: string): void;
}

export interface RendererOptions {
  /** Color del fondo, que también se ve en los huecos "sin punto". */
  background?: string;
  devicePixelRatio?: number;
  /** Programa el próximo dibujo. Por defecto, `requestAnimationFrame`. */
  schedule?: (cb: () => void) => void;
  /** Fábrica de superficies para los sprites y `snapshot`. Por defecto, `OffscreenCanvas` o `<canvas>`. */
  createSurface?: (width: number, height: number) => Surface;
  /** Se llama después de cada dibujo, para instrumentar (benchmark, `edit-to-paint`). */
  onFrame?: (info: FrameInfo) => void;
  /** Color del resaltado de fila (con transparencia). */
  highlightColor?: string;
  /** Baldosas en plano y tubo con repeticiones (`tilePlan`). Por defecto, sí. */
  tiles?: boolean;
  /**
   * Búfer de la pieza completa cuando cabe en `MAX_TILE_PX` por lado: desplazarse es una
   * sola copia y las ediciones se dibujan de forma incremental en el búfer. Por defecto, sí.
   */
  backbuffer?: boolean;
}

/** Niveles de sombra del tubo que se hornean en sprites. */
export const SHADE_LEVELS = 12;
/** Por debajo de este ancho de punto (px del dispositivo) se dibuja solo el color, sin la V. */
export const LOD_MIN_PX = 3;
/**
 * En el círculo, la V con `setTransform` por punto cuesta unas 4 veces más que un
 * `drawImage` sin transformación (medido en Chrome 156). Con más puntos visibles que
 * este tope se dibuja solo el color: a ese tamaño la V casi no se distingue.
 */
export const ROTATED_SPRITE_BUDGET = 15_000;
/**
 * Cuadriláteros rotados por trazado. Rellenar un trazado enorme de cuadriláteros cuesta
 * de forma superlineal en Chrome (40.000 en un trazado: 4,7 s; en trozos de 64: 10 ms).
 */
export const QUAD_CHUNK = 64;
/** Lado máximo (px del dispositivo) de una baldosa de clase; con más zoom se dibuja punto a punto (pocos visibles). */
export const MAX_TILE_PX = 2048;
/** Tiempo sin cambios de escala para dar por terminado un zoom y volver a dibujar nítido. */
export const SETTLE_MS = 120;
const SPRITE_CACHE_MAX = 768;
const DEFAULT_BG = "#EFE9DF";
const DEFAULT_HIGHLIGHT = "rgba(255,214,90,0.42)";
const E = STITCH_EXTENT;
const EW = E.right - E.left;
const EH = E.bottom - E.top;

function defaultSurfaceFactory(width: number, height: number): Surface {
  const g = globalThis as unknown as { OffscreenCanvas?: new (w: number, h: number) => Surface; document?: { createElement(t: "canvas"): Surface } };
  if (typeof g.OffscreenCanvas === "function") return new g.OffscreenCanvas(width, height);
  if (g.document) {
    const c = g.document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  throw new Error("stitch-render: no hay canvas en este entorno; pasa `createSurface`.");
}

function defaultSchedule(cb: () => void): void {
  const g = globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => number };
  if (typeof g.requestAnimationFrame === "function") g.requestAnimationFrame(cb);
  else setTimeout(cb, 16);
}

/** Backend Canvas 2D sobre un canvas del DOM o un `OffscreenCanvas` (por ejemplo, en un Worker). */
export function createCanvasRenderer(canvas: HTMLCanvasElement | OffscreenCanvas, opts: RendererOptions = {}): StitchRenderer {
  return createRenderer(canvas as unknown as Surface, opts);
}

interface DrawEnv {
  ctx: Ctx2D;
  layout: StitchLayout;
  k: number;
  ox: number;
  oy: number;
  cos: Float32Array;
  sin: Float32Array;
  looks: readonly YarnLook[];
  rgb: readonly (readonly [number, number, number])[];
  sprite(yarn: number, level: number, rot: boolean): Surface | null;
  highlightRow: number | null;
  highlightColor: string;
  scratch: Scratch;
}

/** Búferes reutilizables entre dibujos (evitan asignar memoria en cada frame). */
export interface Scratch {
  keys: Uint16Array;
  order: Uint32Array;
  counts: Uint32Array;
  starts: Uint32Array;
}

export function createScratch(): Scratch {
  return { keys: new Uint16Array(0), order: new Uint32Array(0), counts: new Uint32Array(0), starts: new Uint32Array(0) };
}

/** Igual que `createCanvasRenderer`, sobre cualquier `Surface` (pruebas en Node). */
export function createRenderer(surface: Surface, opts: RendererOptions = {}): StitchRenderer {
  const ctx = surface.getContext("2d") as Ctx2D | null;
  if (!ctx) throw new Error("stitch-render: el canvas no entrega un contexto 2D.");
  const makeSurface = opts.createSurface ?? defaultSurfaceFactory;
  const schedule = opts.schedule ?? defaultSchedule;
  const background = opts.background ?? DEFAULT_BG;
  const highlightColor = opts.highlightColor ?? DEFAULT_HIGHLIGHT;
  let dpr = opts.devicePixelRatio ?? ((globalThis as { devicePixelRatio?: number }).devicePixelRatio || 1);
  let view: ViewState = { zoom: 1, panX: 0, panY: 0 };
  let layout: StitchLayout | null = null;
  let boxes: Float32Array = new Float32Array(0);
  let grid: SpatialGrid | null = null;
  /** La grilla se construye al primer uso: el primer frame tras `setLayout` es completo y no la necesita. */
  const getGrid = (): SpatialGrid | null => {
    if (!grid && layout) grid = buildGrid(layout, boxes);
    return grid;
  };
  let cos: Float32Array = new Float32Array(0);
  let sin: Float32Array = new Float32Array(0);
  let baseLooks: YarnLook[] = [];
  let override: { yarn: number; look: YarnLook } | null = null;
  let effLooks: YarnLook[] = [];
  let effRgb: [number, number, number][] = [];
  let highlightRow: number | null = null;
  /** Hay que volver a dibujar todo el contenido (disposición, aspecto). */
  let fullDirty = true;
  /** Cambió la vista o el tamaño del canvas: hay que volver a componer. */
  let viewDirty = true;
  let dirty: number[] = [];
  let dirtyMark: Uint8Array = new Uint8Array(0);
  let scheduled = false;
  let destroyed = false;
  const sprites = new Map<string, Surface>();
  const scratch = createScratch();
  // Baldosas (plano y tubo con repeticiones): ver `tilePlan`.
  let plan: TilePlan | null = null;
  let tiles: (Surface | null)[] = [];
  let tileK = -1;
  let tileContentDirty = true;
  const useTiles = opts.tiles !== false;
  const useBackbuffer = opts.backbuffer !== false;
  let bb: Surface | null = null;
  let bbK = -1;
  /** Escala del frame anterior: si cambia (zoom en curso), el búfer no conviene. */
  let lastK = -1;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;

  const recomputeLooks = () => {
    effLooks = baseLooks.slice();
    if (override && Number.isInteger(override.yarn) && override.yarn >= 0 && override.yarn < HIDDEN) {
      while (effLooks.length <= override.yarn) effLooks.push(neutralLook(""));
      effLooks[override.yarn] = override.look;
    }
    effRgb = effLooks.map((l) => hexToRgb(l.hex));
  };

  const spriteGetter = (cache: Map<string, Surface>, wDev: number, hDev: number, looks: readonly YarnLook[]) => {
    const pw = Math.max(1, Math.ceil(EW * wDev));
    const ph = Math.max(1, Math.ceil(EH * hDev));
    const memo: (Surface | null | undefined)[] = [];
    return (yarn: number, level: number, rot: boolean): Surface | null => {
      const slot = (yarn * SHADE_LEVELS + level) * 2 + (rot ? 1 : 0);
      const hit = memo[slot];
      if (hit !== undefined) return hit;
      const look = looks[yarn] ?? neutralLook("");
      const key = `${lookKey(look)}|${level}|${rot ? 1 : 0}|${pw}x${ph}`;
      let s = cache.get(key) ?? null;
      if (!s) {
        if (cache.size >= SPRITE_CACHE_MAX) cache.clear();
        s = makeSurface(pw, ph);
        const sctx = s.getContext("2d") as Ctx2D | null;
        if (sctx) paintSprite(sctx, look, level / (SHADE_LEVELS - 1), pw, ph, rot);
        cache.set(key, s);
      }
      memo[slot] = s;
      return s;
    };
  };

  const env = (c: Ctx2D, v: ViewState, ratio: number, cache: Map<string, Surface>): DrawEnv | null => {
    if (!layout) return null;
    const k = v.zoom * ratio;
    return {
      ctx: c,
      layout,
      k,
      ox: v.panX * ratio,
      oy: v.panY * ratio,
      cos,
      sin,
      looks: effLooks,
      rgb: effRgb,
      sprite: spriteGetter(cache, layout.geometry.stitchW * k, layout.geometry.stitchH * k, effLooks),
      highlightRow,
      highlightColor,
      scratch: c === ctx ? scratch : createScratch(),
    };
  };

  const markDirty = (i: number) => {
    if (fullDirty || i < 0 || i >= dirtyMark.length || dirtyMark[i]) return;
    dirtyMark[i] = 1;
    dirty.push(i);
    if (layout && dirty.length > layout.count / 2) fullDirty = true;
  };

  const invalidateRow = (row: number | null) => {
    if (row === null || !layout) return;
    const rs = layout.geometry.rowStart;
    if (row < 0 || row + 1 >= rs.length) return;
    for (let i = rs[row] as number; i < (rs[row + 1] as number); i++) markDirty(i);
  };

  const clearDirty = () => {
    for (const i of dirty) dirtyMark[i] = 0;
    dirty = [];
    fullDirty = false;
    viewDirty = false;
  };

  const paintFull = (e: DrawEnv, W: number, H: number): number => {
    e.ctx.setTransform(1, 0, 0, 1, 0, 0);
    e.ctx.fillStyle = background;
    e.ctx.fillRect(0, 0, W, H);
    const L = e.layout;
    // Instancias que se ven en el canvas.
    const x0 = (0 - e.ox) / e.k;
    const y0 = (0 - e.oy) / e.k;
    const x1 = (W - e.ox) / e.k;
    const y1 = (H - e.oy) / e.k;
    const ids = new Uint32Array(L.count);
    let n = 0;
    for (let i = 0; i < L.count; i++) {
      if ((boxes[i * 4] as number) <= x1 && (boxes[i * 4 + 2] as number) >= x0 && (boxes[i * 4 + 1] as number) <= y1 && (boxes[i * 4 + 3] as number) >= y0) ids[n++] = i;
    }
    drawInstances(e, ids, n);
    return n;
  };

  /** Todas las regiones sucias en un solo recorte y una sola pasada de dibujo. */
  const paintRegions = (e: DrawEnv, regions: readonly Rect[]): number => {
    const c = e.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    for (const r of regions) c.rect(r.x, r.y, r.w, r.h);
    c.clip();
    c.fillStyle = background;
    c.fill();
    const rects = regions.map((r) => ({ x: (r.x - e.ox) / e.k, y: (r.y - e.oy) / e.k, w: r.w / e.k, h: r.h / e.k }));
    const g = getGrid();
    const ids = g ? queryGridRects(g, boxes, rects) : new Uint32Array(0);
    drawInstances(e, ids, ids.length);
    c.restore();
    return ids.length;
  };

  const tilesFit = (k: number): boolean => {
    if (!plan || !layout) return false;
    for (let cj = 0; cj < plan.cy; cj++)
      for (let ci = 0; ci < plan.cx; ci++) {
        const r = tileRect(layout, plan, tileRepresentative(ci, plan.nx), tileRepresentative(cj, plan.ny));
        if (r.w * k > MAX_TILE_PX || r.h * k > MAX_TILE_PX) return false;
      }
    return true;
  };

  /** Dibuja cada baldosa de clase desde la disposición real (con las vecinas que se solapan). */
  const renderTiles = (e: DrawEnv): number => {
    const g = getGrid();
    if (!plan || !layout || !g) return 0;
    let drawn = 0;
    const next: (Surface | null)[] = [];
    for (let cj = 0; cj < plan.cy; cj++)
      for (let ci = 0; ci < plan.cx; ci++) {
        const r = tileRect(layout, plan, tileRepresentative(ci, plan.nx), tileRepresentative(cj, plan.ny));
        const w = Math.max(1, Math.ceil(r.w * e.k));
        const h = Math.max(1, Math.ceil(r.h * e.k));
        const old = tiles[cj * 3 + ci];
        const surf = old && old.width === w && old.height === h ? old : makeSurface(w, h);
        const tctx = surf.getContext("2d") as Ctx2D | null;
        next[cj * 3 + ci] = surf;
        if (!tctx) continue;
        tctx.setTransform(1, 0, 0, 1, 0, 0);
        tctx.fillStyle = background;
        tctx.fillRect(0, 0, w, h);
        const ids = queryGridRects(g, boxes, [r]);
        drawInstances({ ...e, ctx: tctx, ox: -r.x * e.k, oy: -r.y * e.k, highlightRow: null }, ids, ids.length);
        drawn += ids.length;
      }
    tiles = next;
    return drawn;
  };

  /** Compone la pieza copiando las baldosas de clase (posiciones redondeadas a px enteros). */
  const compositeTiles = (e: DrawEnv, W: number, H: number): number => {
    if (!plan || !layout) return 0;
    const c = e.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = background;
    c.fillRect(0, 0, W, H);
    let blits = 0;
    for (let j = 0; j < plan.ny; j++)
      for (let i = 0; i < plan.nx; i++) {
        const r = tileRect(layout, plan, i, j);
        const x0 = Math.round(r.x * e.k + e.ox);
        const y0 = Math.round(r.y * e.k + e.oy);
        const x1 = Math.round((r.x + r.w) * e.k + e.ox);
        const y1 = Math.round((r.y + r.h) * e.k + e.oy);
        if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H || x1 <= x0 || y1 <= y0) continue;
        const t = tiles[tileClass(j, plan.ny) * 3 + tileClass(i, plan.nx)];
        if (!t) continue;
        c.drawImage(t, 0, 0, r.w * tileK, r.h * tileK, x0, y0, x1 - x0, y1 - y0);
        blits++;
      }
    // El resaltado de fila no es periódico: va encima, punto a punto.
    if (e.highlightRow !== null) {
      const rs = layout.geometry.rowStart;
      const row = e.highlightRow;
      if (row >= 0 && row + 1 < rs.length) {
        const a = rs[row] as number;
        const b = rs[row + 1] as number;
        const ids = new Uint32Array(b - a);
        for (let q = 0; q < ids.length; q++) ids[q] = a + q;
        drawHighlight(e, ids, ids.length);
      }
    }
    return blits;
  };

  /** Vuelve a dibujar nítido cuando el zoom se detiene. */
  const scheduleSettle = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      if (destroyed) return;
      viewDirty = true;
      renderer.requestRender();
    }, SETTLE_MS);
  };

  const flush = (): FrameInfo | null => {
    if (destroyed || !layout) return null;
    if (!fullDirty && !viewDirty && dirty.length === 0) return null;
    const t0 = now();
    const e = env(ctx, view, dpr, sprites);
    if (!e) return null;
    let info: FrameInfo;
    const zooming = e.k !== lastK;
    lastK = e.k;
    const done = (i: FrameInfo): FrameInfo => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      clearDirty();
      i.ms = now() - t0;
      opts.onFrame?.(i);
      return i;
    };
    if (useTiles && tilesFit(e.k)) {
      let drawn = 0;
      const ratio = tileK > 0 ? e.k / tileK : 0;
      const scaleOnly = zooming && tiles.length > 0 && !tileContentDirty && ratio >= 0.5 && ratio <= 2;
      if (scaleOnly) scheduleSettle();
      else if (tileContentDirty || tileK !== e.k || tiles.length === 0) {
        drawn = renderTiles(e);
        tileK = e.k;
        tileContentDirty = false;
      }
      const blits = compositeTiles(e, surface.width, surface.height);
      return done({ full: true, regions: blits, drawn, ms: 0 });
    }
    const bw = Math.ceil(layout.bounds.width * e.k);
    const bh = Math.ceil(layout.bounds.height * e.k);
    // Durante un zoom con el búfer armado (factor 0,5 a 2), se copia escalado y se vuelve a
    // dibujar nítido cuando el zoom se detiene (`SETTLE_MS` sin cambios de escala).
    const fits = useBackbuffer && bw <= MAX_TILE_PX && bh <= MAX_TILE_PX;
    if (fits && zooming && bb && bbK > 0 && !fullDirty && dirty.length === 0 && e.k / bbK >= 0.5 && e.k / bbK <= 2) {
      const f = e.k / bbK;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, surface.width, surface.height);
      ctx.drawImage(bb, e.ox, e.oy, bb.width * f, bb.height * f);
      scheduleSettle();
      return done({ full: true, regions: 1, drawn: 0, ms: 0 });
    }
    // Durante un zoom (la escala cambia en cada frame) se dibuja directo; el búfer se arma
    // cuando la escala se repite (desplazamiento, edición o zoom terminado).
    if (fits && (!zooming || bbK === e.k)) {
      let drawn = 0;
      let regionCount = 0;
      const fresh = !bb || bb.width !== bw || bb.height !== bh;
      if (fresh) bb = makeSurface(Math.max(1, bw), Math.max(1, bh));
      const bctx = (bb as Surface).getContext("2d") as Ctx2D | null;
      if (bctx) {
        const be: DrawEnv = { ...e, ctx: bctx, ox: 0, oy: 0 };
        let regions: Rect[] | null = null;
        if (!fresh && bbK === e.k && !fullDirty && dirty.length > 0) {
          regions = dirtyRegions(boxes, dirty, { zoom: view.zoom, panX: 0, panY: 0 }, dpr, bw, bh);
          let area = 0;
          for (const r of regions) area += r.w * r.h;
          if (area > 0.6 * bw * bh) regions = null;
        }
        if (regions) {
          drawn = paintRegions(be, regions);
          regionCount = regions.length;
        } else if (fresh || bbK !== e.k || fullDirty || dirty.length > 0) {
          drawn = paintFull(be, bw, bh);
          regionCount = 1;
        }
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bbK = e.k;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, surface.width, surface.height);
      if (bb) ctx.drawImage(bb, Math.round(e.ox), Math.round(e.oy), bb.width, bb.height);
      return done({ full: regionCount === 1, regions: regionCount, drawn, ms: 0 });
    }
    let regions: Rect[] | null = null;
    if (!fullDirty && !viewDirty) {
      regions = dirtyRegions(boxes, dirty, view, dpr, surface.width, surface.height);
      let area = 0;
      for (const r of regions) area += r.w * r.h;
      if (area > 0.6 * surface.width * surface.height) regions = null;
    }
    if (!regions) {
      const drawn = paintFull(e, surface.width, surface.height);
      info = { full: true, regions: 1, drawn, ms: 0 };
    } else {
      const drawn = paintRegions(e, regions);
      info = { full: false, regions: regions.length, drawn, ms: 0 };
    }
    return done(info);
  };

  recomputeLooks();

  const renderer: StitchRenderer = {
    setLooks(looks) {
      baseLooks = looks.slice();
      recomputeLooks();
      fullDirty = true;
      tileContentDirty = true;
    },
    setLayout(l) {
      layout = l;
      boxes = instanceBounds(l);
      grid = null;
      cos = new Float32Array(l.count);
      sin = new Float32Array(l.count);
      for (let i = 0; i < l.count; i++) {
        cos[i] = Math.cos(l.angle[i] as number);
        sin[i] = Math.sin(l.angle[i] as number);
      }
      dirtyMark = new Uint8Array(l.count);
      dirty = [];
      fullDirty = true;
      plan = tilePlan(l);
      tiles = [];
      tileK = -1;
      tileContentDirty = true;
    },
    invalidate(instances) {
      if (instances.length > 0) tileContentDirty = true;
      for (let n = 0; n < instances.length; n++) markDirty(instances[n] as number);
    },
    setView(v) {
      if (!(v.zoom > 0) || !Number.isFinite(v.zoom) || !Number.isFinite(v.panX) || !Number.isFinite(v.panY)) return;
      if (v.zoom === view.zoom && v.panX === view.panX && v.panY === view.panY) return;
      view = { zoom: v.zoom, panX: v.panX, panY: v.panY };
      viewDirty = true;
    },
    getView: () => ({ ...view }),
    setPreviewOverride(o) {
      if (o === override || (o && override && o.yarn === override.yarn && lookKey(o.look) === lookKey(override.look))) return;
      const prev = override;
      override = o;
      recomputeLooks();
      tileContentDirty = true;
      // Solo cambian las instancias de esa lana.
      if (!layout) return;
      const ya = prev?.yarn ?? -1;
      const yb = o?.yarn ?? -1;
      for (let i = 0; i < layout.count; i++) {
        const v = layout.yarn[i];
        if (v === ya || v === yb) markDirty(i);
      }
    },
    setHighlightRow(row) {
      const r = row !== null && Number.isInteger(row) ? row : null;
      if (r === highlightRow) return;
      invalidateRow(highlightRow);
      highlightRow = r;
      invalidateRow(highlightRow);
    },
    requestRender() {
      if (scheduled || destroyed) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        flush();
      });
    },
    flush,
    resize(cssWidth, cssHeight, ratio) {
      if (ratio !== undefined && ratio > 0) dpr = ratio;
      const w = Math.max(1, Math.round(cssWidth * dpr));
      const h = Math.max(1, Math.round(cssHeight * dpr));
      if (surface.width !== w) surface.width = w;
      if (surface.height !== h) surface.height = h;
      viewDirty = true;
    },
    async snapshot({ width, height }) {
      if (!layout) throw new Error("stitch-render: no hay disposición para capturar.");
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      const s = makeSurface(w, h);
      const sctx = s.getContext("2d") as Ctx2D | null;
      if (!sctx) throw new Error("stitch-render: la captura no tiene contexto 2D.");
      const v = fitView(layout.bounds, w, h, 0);
      const savedHighlight = highlightRow;
      const e = env(sctx, v, 1, new Map());
      if (!e) throw new Error("stitch-render: no hay disposición para capturar.");
      e.highlightRow = savedHighlight;
      paintFull(e, w, h);
      if (typeof s.convertToBlob === "function") return s.convertToBlob({ type: "image/png" });
      if (typeof s.toBlob === "function") {
        const toBlob = s.toBlob.bind(s);
        return new Promise<Blob>((resolve, reject) => toBlob((b) => (b ? resolve(b) : reject(new Error("stitch-render: la captura falló."))), "image/png"));
      }
      throw new Error("stitch-render: la superficie no exporta imágenes.");
    },
    destroy() {
      destroyed = true;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = null;
      sprites.clear();
      layout = null;
      grid = null;
      bb = null;
      tiles = [];
    },
  };
  return renderer;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Dibuja las instancias `ids[0 .. n)` (en orden ascendente) en tres pasadas. No toca
 * el recorte ni el fondo: eso lo hace quien llama.
 */
export function drawInstances(e: DrawEnv, ids: ArrayLike<number>, n: number): void {
  const { ctx, layout: L, k, ox, oy } = e;
  const g = L.geometry;
  const wDev = g.stitchW * k;
  const hDev = g.stitchH * k;
  const circle = g.shape === "circle";
  let lod = wDev < LOD_MIN_PX || hDev < LOD_MIN_PX;
  const yarn = L.yarn;
  const shade = L.shade;
  const sx = L.scaleX;
  const sy = L.scaleY;
  const X = L.x;
  const Y = L.y;
  // ---- Pasada 1: fondo de cada punto, agrupado por (lana, sombra) en un trazado.
  // Las lanas sin aspecto (índice fuera de `looks`) comparten el grupo de respaldo.
  const nLooks = e.rgb.length;
  const groupCount = (nLooks + 1) * SHADE_LEVELS;
  const sc = e.scratch;
  if (sc.keys.length < n) {
    sc.keys = new Uint16Array(n);
    sc.order = new Uint32Array(n);
  }
  if (sc.counts.length < groupCount + 1) {
    sc.counts = new Uint32Array(groupCount + 1);
    sc.starts = new Uint32Array(groupCount + 1);
  }
  const keys = sc.keys;
  const order = sc.order;
  const counts = sc.counts;
  const starts = sc.starts;
  counts.fill(0, 0, groupCount + 1);
  const groupOf = (v: number) => (v < nLooks ? v : nLooks);
  for (let p = 0; p < n; p++) {
    const i = ids[p] as number;
    const v = yarn[i] as number;
    const s = shade[i] as number;
    if (v === HIDDEN || !(s > 0)) {
      keys[p] = groupCount;
      continue;
    }
    const level = Math.round(s * (SHADE_LEVELS - 1));
    const key = groupOf(v) * SHADE_LEVELS + level;
    keys[p] = key;
    counts[key] = (counts[key] as number) + 1;
  }
  let acc = 0;
  for (let key = 0; key < groupCount; key++) {
    starts[key] = acc;
    acc += counts[key] as number;
  }
  const visible = acc;
  if (circle && visible > ROTATED_SPRITE_BUDGET) lod = true;
  for (let p = 0; p < n; p++) {
    const key = keys[p] as number;
    if (key === groupCount) continue;
    order[starts[key] as number] = ids[p] as number;
    starts[key] = (starts[key] as number) + 1;
  }
  let p = 0;
  while (p < visible) {
    const first = order[p] as number;
    const key = groupOf(yarn[first] as number) * SHADE_LEVELS + Math.round((shade[first] as number) * (SHADE_LEVELS - 1));
    const v = Math.floor(key / SHADE_LEVELS);
    const f = (key % SHADE_LEVELS) / (SHADE_LEVELS - 1);
    const rgb = e.rgb[v] ?? [140, 140, 140];
    ctx.fillStyle = tone(rgb, lod ? f : f * 0.6);
    ctx.beginPath();
    const end = p + (counts[key] as number);
    let inPath = 0;
    for (; p < end; p++) {
      if (circle && inPath === QUAD_CHUNK) {
        ctx.fill();
        ctx.beginPath();
        inPath = 0;
      }
      inPath++;
      const i = order[p] as number;
      const hw = (wDev * (sx[i] as number)) / 2 + 0.5;
      const hh = (hDev * (sy[i] as number)) / 2 + 0.5;
      const cx = (X[i] as number) * k + ox;
      const cy = (Y[i] as number) * k + oy;
      if (!circle) {
        ctx.rect(cx - hw, cy - hh, 2 * hw, 2 * hh);
      } else {
        // Trapecio: el ancho sigue al radio (sector del anillo), así no quedan cuñas vacías
        // entre puntos vecinos. En bottom_up el lado v = +0,5 es el de afuera.
        const c = e.cos[i] as number;
        const s = e.sin[i] as number;
        const rm = Math.hypot((X[i] as number) - g.cx, (Y[i] as number) - g.cy) * k;
        const hr = hh - 0.5;
        const outAtBottom = g.direction !== "top_down";
        const wTop = rm > 0 ? (hw - 0.5) * (rm + (outAtBottom ? -hr : hr)) / rm + 0.5 : hw;
        const wBot = rm > 0 ? (hw - 0.5) * (rm + (outAtBottom ? hr : -hr)) / rm + 0.5 : hw;
        ctx.moveTo(cx - wTop * c + hh * s, cy - wTop * s - hh * c);
        ctx.lineTo(cx + wTop * c + hh * s, cy + wTop * s - hh * c);
        ctx.lineTo(cx + wBot * c - hh * s, cy + wBot * s + hh * c);
        ctx.lineTo(cx - wBot * c - hh * s, cy - wBot * s + hh * c);
        ctx.closePath();
      }
    }
    ctx.fill();
  }
  // ---- Pasada 2: la V, en orden de tejido.
  if (!lod) {
    for (let q = 0; q < n; q++) {
      const i = ids[q] as number;
      const v = yarn[i] as number;
      const s = shade[i] as number;
      if (v === HIDDEN || !(s > 0)) continue;
      const level = Math.round(s * (SHADE_LEVELS - 1));
      const w = wDev * (sx[i] as number);
      const h = hDev * (sy[i] as number);
      const cx = (X[i] as number) * k + ox;
      const cy = (Y[i] as number) * k + oy;
      if (!circle) {
        const rot = (L.angle[i] as number) > 1.5; // 0 o π
        const img = e.sprite(v, level, rot);
        if (!img) continue;
        if (rot) ctx.drawImage(img, cx - E.right * w, cy - E.bottom * h, EW * w, EH * h);
        else ctx.drawImage(img, cx + E.left * w, cy + E.top * h, EW * w, EH * h);
      } else {
        const img = e.sprite(v, level, false);
        if (!img) continue;
        const c = e.cos[i] as number;
        const sn = e.sin[i] as number;
        ctx.setTransform(c * w, sn * w, -sn * h, c * h, cx, cy);
        ctx.drawImage(img, E.left, E.top, EW, EH);
      }
    }
    if (circle) ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // ---- Pasada 3: resaltado de fila.
  drawHighlight(e, ids, n);
}

/** Resaltado de la fila `e.highlightRow` sobre las instancias dadas. */
export function drawHighlight(e: DrawEnv, ids: ArrayLike<number>, n: number): void {
  const hr = e.highlightRow;
  if (hr === null) return;
  const { ctx, layout: L, k, ox, oy } = e;
  const g = L.geometry;
  const circle = g.shape === "circle";
  const wDev = g.stitchW * k;
  const hDev = g.stitchH * k;
  ctx.fillStyle = e.highlightColor;
  ctx.beginPath();
  let inPath = 0;
  for (let q = 0; q < n; q++) {
    const i = ids[q] as number;
    if (L.row[i] !== hr || !((L.shade[i] as number) > 0)) continue;
    if (circle && inPath === QUAD_CHUNK) {
      ctx.fill();
      ctx.beginPath();
      inPath = 0;
    }
    inPath++;
    const hw = (wDev * (L.scaleX[i] as number)) / 2;
    const hh = (hDev * (L.scaleY[i] as number)) / 2;
    const cx = (L.x[i] as number) * k + ox;
    const cy = (L.y[i] as number) * k + oy;
    if (!circle) ctx.rect(cx - hw, cy - hh, 2 * hw, 2 * hh);
    else {
      const c = e.cos[i] as number;
      const s = e.sin[i] as number;
      ctx.moveTo(cx - hw * c + hh * s, cy - hw * s - hh * c);
      ctx.lineTo(cx + hw * c + hh * s, cy + hw * s - hh * c);
      ctx.lineTo(cx + hw * c - hh * s, cy + hw * s + hh * c);
      ctx.lineTo(cx - hw * c - hh * s, cy - hw * s + hh * c);
      ctx.closePath();
    }
  }
  if (inPath > 0) ctx.fill();
}

/**
 * Sprite de un punto derecho: dos "hojas" que forman la V, con sombreado sutil, la
 * torsión de la hebra y, según el aspecto, halo (mohair, alpaca), brillo (seda,
 * viscosa, bambú, lurex) o un contorno más definido (algodón, acrílico).
 * `f` es la luz (0 a 1). `rot` hornea la rotación de 180° de `top_down`.
 */
export function paintSprite(c: Ctx2D, look: YarnLook, f: number, pw: number, ph: number, rot: boolean): void {
  const rgb = hexToRgb(look.hex);
  // Unidades del punto → px del sprite.
  const sxu = pw / EW;
  const syu = ph / EH;
  if (rot) c.setTransform(-sxu, 0, 0, -syu, pw + E.left * sxu, ph + E.top * syu);
  else c.setTransform(sxu, 0, 0, syu, -E.left * sxu, -E.top * syu);
  const top = -0.5 - STITCH_OVERLAP * 0.62;
  const unitPx = Math.min(sxu, syu);
  for (const side of [-1, 1] as const) {
    // Hoja: de la punta superior al vértice inferior, por fuera y por dentro.
    c.beginPath();
    c.moveTo(side * 0.4, top);
    c.quadraticCurveTo(side * 0.52, 0.18, side * 0.02, 0.5);
    c.quadraticCurveTo(side * 0.02, -0.16, side * 0.4, top);
    c.closePath();
    const grad = c.createLinearGradient(side * 0.5, 0, 0, 0);
    grad.addColorStop(0, tone(rgb, f * 0.74));
    grad.addColorStop(0.5, tone(rgb, f, 0.07));
    grad.addColorStop(1, tone(rgb, f * 0.82));
    c.fillStyle = grad;
    if (look.halo > 0) {
      c.shadowColor = tone(rgb, f, 0.35, 0.65 * look.halo);
      c.shadowBlur = look.halo * unitPx * 0.22;
    }
    c.fill();
    c.shadowBlur = 0;
    // Contorno: más marcado con fibras definidas.
    c.strokeStyle = tone(rgb, f * 0.42, 0, 0.3 + 0.45 * look.definition);
    c.lineWidth = 0.035 + 0.03 * look.definition;
    c.stroke();
    // Torsión de la hebra.
    c.strokeStyle = tone(rgb, f * 0.55, 0, 0.12 + 0.12 * look.definition);
    c.lineWidth = 0.025;
    for (const t of [0.3, 0.62]) {
      const vy = top + (0.5 - top) * t;
      c.beginPath();
      c.moveTo(side * (0.42 - 0.3 * t + 0.08), vy - 0.07);
      c.lineTo(side * (0.42 - 0.3 * t - 0.1), vy + 0.08);
      c.stroke();
    }
    // Lomo de la hoja: luz suave, más intensa con brillo.
    c.lineCap = "round";
    c.strokeStyle = tone(rgb, f, 0.3 + 0.35 * look.sheen, 0.28 + 0.45 * look.sheen);
    c.lineWidth = 0.05 + 0.03 * look.sheen;
    c.beginPath();
    c.moveTo(side * 0.33, top + 0.12);
    c.quadraticCurveTo(side * 0.32, 0.12, side * 0.08, 0.4);
    c.stroke();
    // Halo: pelitos que salen del contorno.
    if (look.halo > 0) {
      const hairs = Math.round(4 + 8 * look.halo);
      c.strokeStyle = tone(rgb, f, 0.45, 0.35 * look.halo);
      c.lineWidth = 0.018;
      for (let h = 0; h < hairs; h++) {
        const t = (h + 0.5) / hairs;
        const hx = side * (0.42 + 0.08 * Math.sin(h * 2.3));
        const hy = top + (0.55 - top) * t;
        c.beginPath();
        c.moveTo(hx * (1 - 0.15 * t), hy);
        c.lineTo(hx * (1 - 0.15 * t) + side * 0.07, hy - 0.05 + 0.04 * Math.cos(h));
        c.stroke();
      }
    }
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}

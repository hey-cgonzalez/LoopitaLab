/**
 * Capa 1 del ADR 0004: disposición pura, sin DOM.
 *
 * - La geometría (dónde va cada punto) se separa del color (`colorize`): pintar una
 *   celda con otra lana no recalcula nada, solo reescribe `yarn` de sus instancias.
 * - Todos los conteos salen de `pattern-core` (CA-F2): `fullSize`, `rowStitchCounts`,
 *   `stitchTotal`. La orientación de `top_down` en plano y tubo sale de `wornOrientation`.
 * - Orden de las instancias = orden de dibujo = orden en que se tejen (fila 0 primero),
 *   así la V de una fila queda por debajo de la fila que se teje después.
 */
import { NO_STITCH, fullSize, rowStitchCounts, stitchTotal, wornOrientation, type Chart } from "@loopitalab/pattern-core";
import { HIDDEN, MAX_LAYOUT_INSTANCES, STITCH_EXTENT, type LayoutGeometry, type LayoutOptions, type LayoutShape, type StitchLayout } from "./types.ts";

const TAU = Math.PI * 2;
const DEFAULT_STITCH_PX = 12;

/** Forma efectiva: `yoke` (canesú) se dibuja como tubo en la fase 2 (ADR 0004). */
export function layoutShape(chart: Chart, opts: Pick<LayoutOptions, "shape"> = {}): LayoutShape {
  const s = opts.shape ?? chart.renderAs;
  return s === "circle" ? "circle" : s === "flat" ? "flat" : "tube";
}

/**
 * Instancias que tendría la disposición, sin construirla. En plano y tubo es una por
 * casilla del gráfico completo (las `NO_STITCH` quedan ocultas, para que pintarlas no
 * cambie la geometría); en el círculo, `stitchTotal`. Sirve para avisar en la interfaz
 * antes de superar `MAX_LAYOUT_INSTANCES`.
 */
export function layoutInstanceCount(chart: Chart, opts: Pick<LayoutOptions, "shape"> = {}): number {
  if (layoutShape(chart, opts) === "circle") return stitchTotal(chart);
  const { width, height } = fullSize(chart);
  return width * height;
}

function isPosInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1;
}

function checkInputs(chart: Chart, opts: LayoutOptions): { sw: number; sh: number } {
  if (!chart || !isPosInt(chart.width) || !isPosInt(chart.height) || !chart.repeat || !isPosInt(chart.repeat.x) || !isPosInt(chart.repeat.y) || !Array.isArray(chart.cells) || chart.cells.length !== chart.width * chart.height) {
    throw new TypeError("stitch-render: el gráfico no está bien formado (se espera un documento guardable).");
  }
  const g = opts.gauge;
  if (!g || !(g.stitchesPer10cm > 0) || !(g.rowsPer10cm > 0) || !Number.isFinite(g.stitchesPer10cm) || !Number.isFinite(g.rowsPer10cm)) {
    throw new RangeError("stitch-render: la muestra debe tener puntos y filas en 10 cm mayores que 0.");
  }
  const sw = opts.stitchPx ?? DEFAULT_STITCH_PX;
  if (!(sw > 0) || !Number.isFinite(sw)) throw new RangeError("stitch-render: stitchPx debe ser mayor que 0.");
  // Un punto mide 10/puntos cm de ancho y 10/filas cm de alto: alto/ancho = puntos/filas.
  return { sw, sh: (sw * g.stitchesPer10cm) / g.rowsPer10cm };
}

function allocate(count: number) {
  return {
    x: new Float32Array(count),
    y: new Float32Array(count),
    angle: new Float32Array(count),
    scaleX: new Float32Array(count),
    scaleY: new Float32Array(count),
    shade: new Float32Array(count),
    row: new Uint32Array(count),
    col: new Uint32Array(count),
    motifCell: new Uint32Array(count),
    yarn: new Uint8Array(count).fill(HIDDEN),
  };
}

function maskOf(chart: Chart): Uint8Array {
  const m = new Uint8Array(chart.cells.length);
  for (let i = 0; i < m.length; i++) m[i] = chart.cells[i] === NO_STITCH ? 0 : 1;
  return m;
}

/** CSR celda del motivo → instancias, en orden ascendente de instancia. */
function buildCellIndex(motifCell: Uint32Array, cells: number): { cellStart: Uint32Array; cellInstances: Uint32Array } {
  const cellStart = new Uint32Array(cells + 1);
  for (let i = 0; i < motifCell.length; i++) cellStart[(motifCell[i] as number) + 1] = (cellStart[(motifCell[i] as number) + 1] as number) + 1;
  for (let m = 0; m < cells; m++) cellStart[m + 1] = (cellStart[m + 1] as number) + (cellStart[m] as number);
  const fill = cellStart.slice(0, cells);
  const cellInstances = new Uint32Array(motifCell.length);
  for (let i = 0; i < motifCell.length; i++) {
    const m = motifCell[i] as number;
    cellInstances[fill[m] as number] = i;
    fill[m] = (fill[m] as number) + 1;
  }
  return { cellStart, cellInstances };
}

/**
 * Geometría. Se recalcula si cambian tamaño, repeticiones, forma, muestra, dirección o
 * rotación del tubo; en el círculo, también la máscara (`needsRelayout`).
 * Acepta cualquier documento guardable (ADR 0003, E10), incluido el gráfico vacío.
 * Deja `yarn` en `HIDDEN`: hay que llamar a `colorize` después.
 */
export function layoutGeometry(chart: Chart, opts: LayoutOptions): StitchLayout {
  const { sw, sh } = checkInputs(chart, opts);
  const shape = layoutShape(chart, opts);
  const total = layoutInstanceCount(chart, opts);
  if (total > MAX_LAYOUT_INSTANCES) {
    throw new RangeError(`stitch-render: ${total} puntos superan el máximo de la vista previa (${MAX_LAYOUT_INSTANCES}).`);
  }
  if (shape === "circle") return layoutCircle(chart, sw, sh);
  return layoutFlatOrTube(chart, shape, sw, sh, opts.tubeRotation ?? 0);
}

/** Margen: la V que más sobresale de su celda, en cualquier rotación. */
function padFor(sw: number, sh: number): number {
  const over = Math.max(-STITCH_EXTENT.top - 0.5, STITCH_EXTENT.bottom - 0.5, STITCH_EXTENT.right - 0.5);
  return over * Math.max(sw, sh);
}

function layoutFlatOrTube(chart: Chart, shape: "flat" | "tube", sw: number, sh: number, tubeRotation: number): StitchLayout {
  const { width: W, height: H } = fullSize(chart);
  const count = W * H;
  const a = allocate(count);
  const pad = padFor(sw, sh);
  const topDown = chart.direction === "top_down";
  const radius = (W * sw) / TAU;
  const cx = shape === "tube" ? pad + radius : pad + (W * sw) / 2;
  const cy = pad + (H * sh) / 2;
  const rot = Number.isFinite(tubeRotation) ? tubeRotation : 0;
  const displayToInstance = new Uint32Array(count);
  const rowStart = new Uint32Array(H + 1);
  for (let y = 0; y <= H; y++) rowStart[y] = y * W;
  const mw = chart.width;
  const mh = chart.height;
  for (let y = 0; y < H; y++) {
    const my = y % mh;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // Posición vista en la prenda: identidad en bottom_up, rotación de 180° en top_down.
      const p = wornOrientation(chart, x, y);
      const dc = p.x;
      const dr = p.y; // fila vista contada desde abajo
      displayToInstance[dr * W + dc] = i;
      a.row[i] = y;
      a.col[i] = x;
      a.motifCell[i] = my * mw + (x % mw);
      a.y[i] = pad + (H - 1 - dr + 0.5) * sh;
      a.angle[i] = topDown ? Math.PI : 0;
      a.scaleY[i] = 1;
      if (shape === "flat") {
        a.x[i] = pad + (dc + 0.5) * sw;
        a.scaleX[i] = 1;
        a.shade[i] = 1;
      } else {
        // Tubo visto de lado: la columna vista `dc` está en el ángulo φ; de frente si cos φ > 0.
        const phi = (TAU * (dc + 0.5)) / W - Math.PI / 2 + rot;
        const c = Math.cos(phi);
        a.x[i] = cx + radius * Math.sin(phi);
        a.scaleX[i] = c > 0 ? c : 0;
        a.shade[i] = c > 0 ? 0.55 + 0.45 * c : 0;
      }
    }
  }
  const { cellStart, cellInstances } = buildCellIndex(a.motifCell, mw * mh);
  const geometry: LayoutGeometry = {
    shape,
    stitchW: sw,
    stitchH: sh,
    fullWidth: W,
    fullHeight: H,
    motifWidth: mw,
    motifHeight: mh,
    repeatX: chart.repeat.x,
    repeatY: chart.repeat.y,
    direction: chart.direction,
    pad,
    cx,
    cy,
    radius: shape === "tube" ? radius : 0,
    tubeRotation: shape === "tube" ? rot : 0,
    rowStart,
    displayToInstance,
    perRepeat: null,
    stitchMask: maskOf(chart),
    cellStart,
    cellInstances,
  };
  const width = shape === "tube" ? 2 * radius + 2 * pad : W * sw + 2 * pad;
  return { count, ...a, bounds: { width, height: H * sh + 2 * pad }, geometry };
}

/**
 * Círculo (ADR 0005): un anillo por fila, todos del alto de una fila según la muestra.
 * `bottom_up`: anillo `k = H − 1 − y` (la fila 0 afuera). `top_down`: `k = y` (al centro).
 * La repetición `w` ocupa el sector `[w, w + 1) · 2π / R`; el punto `i` (contando solo
 * celdas con punto) va en `θ = (w + (i + 0,5) / c(y)) · 2π / R`, así no quedan huecos
 * radiales. Visto desde arriba, `x` creciente gira en sentido antihorario en
 * `bottom_up` y horario en `top_down` (validar con tejedora). El ángulo 0 apunta hacia
 * abajo en pantalla. La V abre hacia donde crece la labor: el centro en `bottom_up`,
 * afuera en `top_down`.
 */
const bottomUpOf = (chart: Chart) => chart.direction !== "top_down";

function layoutCircle(chart: Chart, sw: number, sh: number): StitchLayout {
  const { width: W, height: H } = fullSize(chart);
  const R = chart.repeat.x;
  const mw = chart.width;
  const mh = chart.height;
  // Conteos por vuelta: siempre de pattern-core (CA-F2).
  const counts = rowStitchCounts(chart);
  let count = 0;
  for (const n of counts) count += n;
  const a = allocate(count);
  const radius = H * sh;
  // Un punto muy ancho (anillo con pocos puntos) es un rectángulo tangente: sus esquinas
  // pueden salir del radio exterior. El margen cubre la esquina más lejana.
  let reach = 0;
  const radialOut = Math.max(-STITCH_EXTENT.top, STITCH_EXTENT.bottom);
  for (let y = 0; y < H; y++) {
    const n = counts[y] as number;
    if (n === 0) continue;
    const k = bottomUpOf(chart) ? H - 1 - y : y;
    const rMid = (k + 0.5) * sh;
    const halfW = ((TAU * rMid) / n) * (STITCH_EXTENT.right - STITCH_EXTENT.left) / 2;
    reach = Math.max(reach, Math.hypot(rMid + radialOut * sh, halfW));
  }
  const pad = Math.max(padFor(sw, sh), reach - radius);
  const cx = pad + radius;
  const cy = pad + radius;
  const bottomUp = chart.direction !== "top_down";
  const sense = bottomUp ? 1 : -1; // +1 antihorario en pantalla, −1 horario
  const rowStart = new Uint32Array(H + 1);
  const perRepeat = new Uint32Array(H);
  const ringDistortion = new Float32Array(H);
  // Columnas con punto de cada fila del motivo (posición, no conteo: el conteo se contrasta con pattern-core).
  const motifCols: number[][] = [];
  for (let my = 0; my < mh; my++) {
    const cols: number[] = [];
    for (let mx = 0; mx < mw; mx++) if (chart.cells[my * mw + mx] !== NO_STITCH) cols.push(mx);
    motifCols.push(cols);
  }
  let i = 0;
  for (let y = 0; y < H; y++) {
    rowStart[y] = i;
    const cols = motifCols[y % mh] as number[];
    const n = counts[y] as number;
    const c = n / R;
    if (c !== cols.length) throw new Error(`stitch-render: la fila ${y} no coincide con rowStitchCount (${n}).`);
    perRepeat[y] = c;
    const k = bottomUp ? H - 1 - y : y;
    const rMid = (k + 0.5) * sh;
    const scaleX = c > 0 ? (TAU * rMid) / (R * c) / sw : 0;
    ringDistortion[k] = scaleX;
    for (let w = 0; w < R; w++) {
      for (let j = 0; j < c; j++) {
        const mx = cols[j] as number;
        const theta = ((w + (j + 0.5) / c) * TAU) / R;
        const s = Math.sin(theta);
        const co = Math.cos(theta);
        a.x[i] = cx + sense * rMid * s;
        a.y[i] = cy + rMid * co;
        // Vector hacia donde abre la V: al centro (bottom_up) o hacia afuera (top_down).
        const dx = bottomUp ? -sense * s : sense * s;
        const dy = bottomUp ? -co : co;
        a.angle[i] = Math.atan2(dx, -dy);
        a.scaleX[i] = scaleX;
        a.scaleY[i] = 1;
        a.shade[i] = 1;
        a.row[i] = y;
        a.col[i] = w * mw + mx;
        a.motifCell[i] = (y % mh) * mw + mx;
        i++;
      }
    }
  }
  rowStart[H] = i;
  const { cellStart, cellInstances } = buildCellIndex(a.motifCell, mw * mh);
  const geometry: LayoutGeometry = {
    shape: "circle",
    stitchW: sw,
    stitchH: sh,
    fullWidth: W,
    fullHeight: H,
    motifWidth: mw,
    motifHeight: mh,
    repeatX: R,
    repeatY: chart.repeat.y,
    direction: chart.direction,
    pad,
    cx,
    cy,
    radius,
    tubeRotation: 0,
    rowStart,
    displayToInstance: null,
    perRepeat,
    stitchMask: maskOf(chart),
    cellStart,
    cellInstances,
  };
  const side = 2 * radius + 2 * pad;
  return { count, ...a, bounds: { width: side, height: side }, ringDistortion, geometry };
}

/**
 * Color. Escribe `layout.yarn` con la lana de cada instancia (`HIDDEN` si es `NO_STITCH`).
 * Con `cells` (índices de celdas del motivo), solo actualiza esas. Devuelve las
 * instancias tocadas, para `StitchRenderer.invalidate`.
 */
export function colorize(layout: StitchLayout, chart: Chart, cells?: readonly number[]): Uint32Array {
  const g = layout.geometry;
  if (chart.width !== g.motifWidth || chart.height !== g.motifHeight || chart.cells.length !== g.motifWidth * g.motifHeight) {
    throw new Error("stitch-render: el motivo cambió de tamaño; hay que recalcular la disposición.");
  }
  const src = chart.cells;
  const yarn = layout.yarn;
  const mc = layout.motifCell;
  if (!cells) {
    for (let i = 0; i < layout.count; i++) yarn[i] = toYarn(src[mc[i] as number]);
    const all = new Uint32Array(layout.count);
    for (let i = 0; i < all.length; i++) all[i] = i;
    return all;
  }
  const seen = cells.length > 1 ? new Set<number>() : null;
  let n = 0;
  for (const m of cells) {
    if (!Number.isInteger(m) || m < 0 || m >= src.length || seen?.has(m)) continue;
    seen?.add(m);
    n += (g.cellStart[m + 1] as number) - (g.cellStart[m] as number);
  }
  const out = new Uint32Array(n);
  let k = 0;
  const done = new Set<number>();
  for (const m of cells) {
    if (!Number.isInteger(m) || m < 0 || m >= src.length || done.has(m)) continue;
    done.add(m);
    const v = toYarn(src[m]);
    for (let p = g.cellStart[m] as number; p < (g.cellStart[m + 1] as number); p++) {
      const inst = g.cellInstances[p] as number;
      yarn[inst] = v;
      out[k++] = inst;
    }
  }
  return out;
}

function toYarn(v: number | undefined): number {
  return v === undefined || v === NO_STITCH || !(v >= 0) || v >= HIDDEN ? HIDDEN : v;
}

/**
 * true si la disposición ya no sirve para `chart` y hay que llamar a `layoutGeometry`:
 * cambió el tamaño, las repeticiones o la dirección, o, en el círculo, la máscara
 * (pintar o quitar "sin punto" cambia los conteos por vuelta). En plano y tubo, la
 * máscara solo oculta o muestra instancias: basta con `colorize`.
 * Con `cells`, solo revisa la máscara en esas celdas del motivo.
 * La forma, la muestra y la rotación del tubo son opciones: las compara quien las cambia.
 */
export function needsRelayout(layout: StitchLayout, chart: Chart, cells?: readonly number[]): boolean {
  const g = layout.geometry;
  if (chart.width !== g.motifWidth || chart.height !== g.motifHeight || chart.repeat.x !== g.repeatX || chart.repeat.y !== g.repeatY || chart.direction !== g.direction) return true;
  if (g.shape !== "circle") return false;
  const mask = g.stitchMask;
  if (cells) {
    for (const m of cells) if (Number.isInteger(m) && m >= 0 && m < mask.length && (chart.cells[m] === NO_STITCH ? 0 : 1) !== mask[m]) return true;
    return false;
  }
  for (let m = 0; m < mask.length; m++) if ((chart.cells[m] === NO_STITCH ? 0 : 1) !== mask[m]) return true;
  return false;
}

/** Instancias visibles (con punto y de frente). En todas las formas es `stitchTotal` sin la cara trasera del tubo. */
export function visibleCount(layout: StitchLayout): number {
  let n = 0;
  for (let i = 0; i < layout.count; i++) if (layout.yarn[i] !== HIDDEN && (layout.shade[i] as number) > 0) n++;
  return n;
}

/**
 * Instancia bajo un punto (en coordenadas de la disposición), o `null`. Es la inversa
 * exacta de la disposición: el punto cae en la celda (plano y tubo) o en el sector del
 * anillo (círculo) de la instancia. En plano y tubo devuelve también las instancias
 * ocultas (`NO_STITCH`): son casillas del motivo que se pueden volver a pintar. En el
 * tubo solo responde la cara visible.
 */
export function hitTest(layout: StitchLayout, px: number, py: number): number | null {
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const g = layout.geometry;
  const W = g.fullWidth;
  const H = g.fullHeight;
  if (g.shape === "circle") {
    const dx = px - g.cx;
    const dy = py - g.cy;
    const r = Math.hypot(dx, dy);
    const k = Math.floor(r / g.stitchH);
    if (k < 0 || k >= H) return null;
    const bottomUp = g.direction !== "top_down";
    const y = bottomUp ? H - 1 - k : k;
    const c = g.perRepeat?.[y] ?? 0;
    if (c === 0) return null;
    // Inversa de x = cx + sense·r·sin θ, y = cy + r·cos θ.
    let theta = Math.atan2(bottomUp ? dx : -dx, dy);
    if (theta < 0) theta += TAU;
    const t = (theta * g.repeatX) / TAU;
    let w = Math.floor(t);
    let j = Math.floor((t - w) * c);
    if (j >= c) j = c - 1;
    if (w >= g.repeatX) w = g.repeatX - 1;
    return (g.rowStart[y] as number) + w * c + j;
  }
  const drTop = Math.floor((py - g.pad) / g.stitchH);
  if (drTop < 0 || drTop >= H) return null;
  const dr = H - 1 - drTop;
  let dc: number;
  if (g.shape === "flat") {
    dc = Math.floor((px - g.pad) / g.stitchW);
  } else {
    const s = (px - g.cx) / g.radius;
    if (!(s >= -1 && s <= 1)) return null;
    const phi = Math.asin(s); // cara visible: cos φ ≥ 0
    let u = ((phi + Math.PI / 2 - g.tubeRotation) * W) / TAU;
    u = ((u % W) + W) % W;
    dc = Math.floor(u);
    if (dc >= W) dc = W - 1;
  }
  if (dc < 0 || dc >= W) return null;
  const i = g.displayToInstance?.[dr * W + dc];
  if (i === undefined) return null;
  if (g.shape === "tube" && !((layout.shade[i] as number) > 0)) return null;
  return i;
}

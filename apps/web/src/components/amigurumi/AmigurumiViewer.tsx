"use client";

import { concreteRounds, type PartRef, type WrittenPattern } from "@loopitalab/pattern-core";
import type { Lod } from "@loopitalab/viewer-3d";
import { createThreeRenderer, type AmigurumiRenderer, type PickResult } from "@loopitalab/viewer-3d/three";
import { Canvas, type RootState } from "@react-three/fiber";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { PreviewControls } from "@/components/studio/preview-controls.ts";
import { applyCameraAction, cameraKeyAction, framing, type Vec3 } from "./camera-keys.ts";
import { ViewerController, type ViewerStatus } from "./controller.ts";
import { Silhouettes } from "./Silhouettes.tsx";
import { measureText, VIEWER_3D_TEXTS as T } from "./texts.ts";

/** Documento fuera de React (ADR 0004): el visor se suscribe y lee la versión actual. */
export interface PatternSource {
  getSnapshot(): WrittenPattern;
  subscribe(listener: () => void): () => void;
}

/** Lo que el visor entrega a quien lo monta (página de desarrollo, mediciones y E2E). */
export interface ViewerHandle {
  renderer: AmigurumiRenderer;
  controller: ViewerController;
  gl: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
  /** Resuelve con `performance.now()` cuando termina el próximo frame dibujado (pide uno). */
  nextPaint(): Promise<number>;
  /** Vuelve a encuadrar la cámara en la escena. */
  frame(): void;
  /** Pierde el contexto WebGL a propósito (prueba de CA4-V5). */
  loseContext(): boolean;
  restoreContext(): boolean;
}

export interface AmigurumiViewerProps {
  source: PatternSource;
  controls: PreviewControls;
  /** Modo de medición (`?perf=1`): muestra los contadores. */
  perf?: boolean;
  onHandle?: (handle: ViewerHandle | null) => void;
  heightPx?: number;
  /**
   * Id de una descripción más completa que pone quien monta el visor (`describeWritten` en el estudio, T14; enmienda
   * T11-9): se suma a la corta del visor en `aria-describedby` del lienzo.
   */
  describedBy?: string;
  /**
   * Punto tocado: vuelta concreta 0-based (`roundIndex`), su número visible (de `concreteRounds`), el punto dentro
   * de la vuelta (`stitchInRound`, 0-based) y el punto del mundo en cm (`point`, ya con el giro de la raíz).
   */
  onPick?: (pick: ViewerPick | null) => void;
  /** Estado del visor después de cada escena (piezas sin ubicar, avisos). */
  onStatus?: (status: ViewerStatus) => void;
  /**
   * Pieza cuyo ancla se muestra (modo "Posicionar", T16). El marco sale de `surfaceFrame` con la malla del
   * anfitrión (`ViewerController.anchorFrame`), igual que `buildScene`.
   */
  anchorTarget?: PartRef | null;
  /** Modo "Posicionar": el puntero es una cruz y tocar fija el ancla (lo decide quien recibe `onPick`). */
  positioning?: boolean;
}

export interface ViewerPick {
  partId: string;
  copy: number;
  roundIndex: number;
  roundNumber: number | null;
  stitchInRound: number;
  point: [number, number, number];
}

/** Tamaños de la vista previa del ancla, en cm. */
const ANCHOR_DOT_CM = 0.3;
const ANCHOR_NORMAL_CM = 2;
const ANCHOR_AXIS_CM = 1.2;

const FOV = 40;

/**
 * Visor 3D amigurumi con r3f (ADR 0010, sección 5). Se carga con `next/dynamic` y `ssr: false`: `three` y r3f no
 * entran en el JS inicial de ninguna ruta. `frameloop="demand"`: dibuja solo cuando algo cambia. El renderer es
 * imperativo (`@loopitalab/viewer-3d/three`) y el documento llega por `source`, sin pasar por el árbol de React.
 */
export default function AmigurumiViewer({ source, controls, perf = false, onHandle, heightPx = 520, describedBy, onPick, onStatus, anchorTarget = null, positioning = false }: AmigurumiViewerProps) {
  const descId = useId();
  const [status, setStatus] = useState<ViewerStatus | null>(null);
  const [lost, setLost] = useState(false);
  const [lod, setLodState] = useState<Lod>("relief");
  const [picked, setPicked] = useState<(PickResult & { name: string; roundNumber: number | null }) | null>(null);
  const [description, setDescription] = useState("");
  const [counters, setCounters] = useState<string>("");
  const flat = useSyncExternalStore(controls.subscribe, controls.getFlatColors, () => false);
  const pattern = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);

  const controllerRef = useRef<ViewerController | null>(null);
  const rendererRef = useRef<AmigurumiRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const stateRef = useRef<RootState | null>(null);
  const framedRadius = useRef<number | null>(null);
  const homeRef = useRef<{ position: Vec3; target: Vec3 } | null>(null);
  const paintWaiters = useRef<Array<(t: number) => void>>([]);
  const down = useRef<{ x: number; y: number } | null>(null);
  const markerRef = useRef<AnchorMarker | null>(null);
  const anchorTargetRef = useRef<PartRef | null>(anchorTarget);
  anchorTargetRef.current = anchorTarget;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const [anchorAttr, setAnchorAttr] = useState("");

  /** Vista previa del ancla: el marco del controlador (malla del anfitrión), fuera de React. */
  const refreshAnchor = useCallback(() => {
    const marker = markerRef.current;
    const c = controllerRef.current;
    const target = anchorTargetRef.current;
    const frame = marker && c && target ? c.anchorFrame(target) : null;
    if (marker) {
      marker.show(frame);
      stateRef.current?.invalidate();
    }
    setAnchorAttr(frame ? `${frame.round}:${frame.stitch}` : "");
  }, []);

  controllerRef.current ??= new ViewerController({
    onStatus: (s) => {
      setStatus(s);
      onStatusRef.current?.(s);
      refreshAnchor();
    },
    flatColors: controls.flatColors,
  });

  useEffect(() => {
    refreshAnchor();
  }, [anchorTarget?.part, anchorTarget?.copy, refreshAnchor]);

  const frame = useCallback(() => {
    const r = rendererRef.current;
    const st = stateRef.current;
    const orbit = orbitRef.current;
    if (!r || !st || !orbit) return;
    const b = r.bounds();
    if (!b) return;
    const cam = st.camera as THREE.PerspectiveCamera;
    const f = framing(b.center, b.radius, FOV);
    cam.position.set(...f.position);
    cam.near = f.near;
    cam.far = f.far;
    cam.updateProjectionMatrix();
    orbit.target.set(...b.center);
    orbit.minDistance = f.distance * 0.15;
    orbit.maxDistance = f.distance * 6;
    orbit.update();
    homeRef.current = { position: f.position, target: b.center };
    framedRadius.current = b.radius;
    st.invalidate();
  }, []);

  /** Encuadra la primera vez y cuando la escena cambia mucho de tamaño (otra pieza), no en cada edición. */
  const maybeFrame = useCallback(() => {
    const b = rendererRef.current?.bounds();
    if (!b) return;
    const prev = framedRadius.current;
    if (prev === null || b.radius > prev * 1.4 || b.radius < prev / 1.4) frame();
  }, [frame]);

  // Documento → controlador (fuera de React: la suscripción llama al controlador directamente).
  useEffect(() => {
    const c = controllerRef.current!;
    c.update(source.getSnapshot());
    maybeFrame();
    return source.subscribe(() => {
      c.update(source.getSnapshot());
      maybeFrame();
    });
  }, [source, maybeFrame]);

  // "Colores planos" y vista previa al pasar el cursor: la misma preferencia del estudio de colorwork.
  useEffect(() => controls.bind(controllerRef.current!), [controls]);

  // Descripción accesible (sección 8): partes, copias y medidas estimadas, del motor. La descripción completa
  // (`describeWritten`, con vueltas y posiciones) la agrega el estudio en T14, que ya carga `pattern-render`.
  useEffect(() => {
    setDescription(sceneDescription(status));
  }, [status]);

  useEffect(() => {
    if (!perf) return;
    const id = setInterval(() => {
      const r = rendererRef.current;
      const c = controllerRef.current;
      if (r && c) setCounters(JSON.stringify({ visor: r.stats(), controlador: c.counters }, null, 1));
    }, 500);
    return () => clearInterval(id);
  }, [perf]);

  const onHandleRef = useRef(onHandle);
  onHandleRef.current = onHandle;
  // Liberación explícita al desmontar (sección 5). En desarrollo, React monta, desmonta y vuelve a montar los
  // efectos (modo estricto) sin desmontar el lienzo: se libera solo si no hubo un montaje nuevo en el mismo turno.
  const mounts = useRef(0);
  useEffect(() => {
    const id = ++mounts.current;
    return () => {
      setTimeout(() => {
        if (mounts.current !== id) return;
        controllerRef.current?.dispose();
        markerRef.current?.dispose();
        markerRef.current = null;
        orbitRef.current?.dispose();
        rendererRef.current?.dispose();
        rendererRef.current = null;
        onHandleRef.current?.(null);
      }, 0);
    };
  }, []);

  const onCreated = (state: RootState) => {
    stateRef.current = state;
    const gl = state.gl;
    const camera = state.camera as THREE.PerspectiveCamera;
    const renderer = createThreeRenderer({
      gl,
      scene: state.scene,
      camera,
      invalidate: () => state.invalidate(),
      setPixelRatio: (max) => {
        const device = window.devicePixelRatio || 1;
        state.setDpr(max === null ? Math.min(device, 2) : Math.min(device, max));
      },
    });
    rendererRef.current = renderer;
    markerRef.current?.dispose();
    markerRef.current = new AnchorMarker(state.scene);
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.enableDamping = false; // con frameloop="demand", la amortiguación pediría frames sin fin
    orbit.addEventListener("change", () => state.invalidate());
    orbitRef.current = orbit;
    // Fin de frame (para mediciones): lo primero que corre después de que r3f dibujó.
    const channel = new MessageChannel();
    state.scene.onAfterRender = () => {
      const waiters = paintWaiters.current;
      if (waiters.length === 0) return;
      paintWaiters.current = [];
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        const t = performance.now();
        for (const w of waiters) w(t);
      };
      channel.port1.onmessage = fire;
      channel.port2.postMessage(0);
      requestAnimationFrame(fire);
    };
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); // permite que el navegador lo restaure
      setLost(true);
    });
    canvas.addEventListener("webglcontextrestored", () => {
      setLost(false);
      state.invalidate();
    });
    controllerRef.current!.attach(renderer);
    refreshAnchor();
    frame();
    // Se guarda al montar: con el contexto perdido, `getExtension` devuelve null y ya no se podría restaurar.
    const loseExt = gl.getContext().getExtension("WEBGL_lose_context");
    const ext = () => loseExt;
    onHandleRef.current?.({
      renderer,
      controller: controllerRef.current!,
      gl,
      camera,
      orbit,
      nextPaint: () =>
        new Promise<number>((resolve) => {
          paintWaiters.current.push(resolve);
          state.invalidate();
        }),
      frame,
      loseContext: () => {
        const e = ext();
        e?.loseContext();
        return !!e;
      },
      restoreContext: () => {
        const e = ext();
        e?.restoreContext();
        return !!e;
      },
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const action = cameraKeyAction(e.key);
    const st = stateRef.current;
    const orbit = orbitRef.current;
    if (!action || !st || !orbit) return;
    e.preventDefault();
    if (action.type === "reset") {
      frame();
      return;
    }
    const cam = st.camera;
    const offset: Vec3 = [cam.position.x - orbit.target.x, cam.position.y - orbit.target.y, cam.position.z - orbit.target.z];
    const next = applyCameraAction(offset, action, { minDistance: orbit.minDistance, maxDistance: orbit.maxDistance });
    cam.position.set(orbit.target.x + next[0], orbit.target.y + next[1], orbit.target.z + next[2]);
    orbit.update();
    st.invalidate();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = down.current;
    down.current = null;
    const r = rendererRef.current;
    const canvas = stateRef.current?.gl.domElement;
    if (!start || !r || !canvas || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
    const rect = canvas.getBoundingClientRect();
    const hit = r.pick(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    if (!hit) {
      setPicked(null);
      r.setHighlight(null);
      onPick?.(null);
      return;
    }
    const part = source.getSnapshot().parts.find((p) => p.id === hit.partId);
    const roundNumber = part ? roundNumberOf(part, hit.roundIndex) : null;
    setPicked({ ...hit, name: part?.name ?? hit.partId, roundNumber });
    r.setHighlight({ partId: hit.partId, copy: hit.copy, roundIndex: hit.roundIndex });
    onPick?.({ partId: hit.partId, copy: hit.copy, roundIndex: hit.roundIndex, roundNumber, stitchInRound: hit.stitchInRound, point: hit.point });
  };

  const changeLod = (next: Lod) => {
    setLodState(next);
    rendererRef.current?.setLod(next);
  };

  const mode = status?.mode ?? "full";
  const showSilhouettes = lost || mode === "silhouettes";
  const assumed = status?.parts.some((p) => p.assumed) ?? false;

  return (
    <section className="grid gap-3" aria-label="Vista 3D" data-testid="visor-3d">
      {/* Regla de oro 8 (sección 7, enmienda C-11): siempre visible y sin botón para cerrarlo. */}
      <p className="rounded-md border border-borde bg-superficie px-3 py-2 text-sm" role="note" data-testid="visor-3d-aviso">
        {T.avisoPrototipo}
      </p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2" title={T.coloresPlanosAyuda}>
          <input type="checkbox" checked={flat} onChange={(e) => controls.setFlatColors(e.target.checked)} data-testid="visor-3d-colores-planos" />
          {T.coloresPlanos}
        </label>
        <fieldset className="inline-flex items-center gap-2">
          <legend className="sr-only">{T.nivel}</legend>
          <span>{T.nivel}:</span>
          {(["relief", "smooth"] as const).map((l) => (
            <label key={l} className="inline-flex items-center gap-1">
              <input type="radio" name={`${descId}-lod`} checked={lod === l} onChange={() => changeLod(l)} />
              {l === "relief" ? T.nivelRelieve : T.nivelLiso}
            </label>
          ))}
        </fieldset>
        {status?.updating ? (
          <span role="status" className="font-semibold" data-testid="visor-3d-actualizando">
            {T.actualizando}
          </span>
        ) : null}
      </div>
      <p className="sr-only">{T.coloresPlanosAyuda}</p>
      {mode === "degraded" ? (
        <p className="text-sm" role="status">
          {T.sobreRecomendado}
        </p>
      ) : status?.policy?.lodForced && lod === "relief" ? (
        <p className="text-sm text-tinta-suave">{T.nivelForzado}</p>
      ) : null}

      <div className="relative w-full overflow-hidden rounded-lg border border-borde" style={{ height: heightPx }}>
        <div
          className="absolute inset-0 outline-offset-2 focus-visible:outline-2"
          tabIndex={0}
          role="img"
          aria-label={T.etiquetaLienzo}
          aria-describedby={describedBy ? `${descId} ${describedBy}` : descId}
          onKeyDown={onKeyDown}
          onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={onPointerUp}
          data-testid="visor-3d-lienzo"
          data-mode={mode}
          data-lost={lost ? "true" : "false"}
          data-positioning={positioning ? "true" : "false"}
          data-anchor={anchorAttr}
          style={{ visibility: showSilhouettes ? "hidden" : "visible", cursor: positioning ? "crosshair" : undefined }}
        >
          <Canvas
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ fov: FOV, position: [0, 0, 30], near: 0.1, far: 1000 }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
            onCreated={onCreated}
          />
        </div>
        {showSilhouettes ? (
          <div className="absolute inset-0 overflow-auto bg-superficie p-4">
            <Silhouettes pattern={pattern} reason={lost ? T.contextoPerdido : T.sobreTope} />
          </div>
        ) : null}
      </div>

      <p id={descId} className="sr-only" data-testid="visor-3d-descripcion">
        {description}
      </p>

      <div className="grid gap-1 text-sm" aria-live="polite">
        <span className="font-semibold">{T.seleccion}</span>
        <span data-testid="visor-3d-seleccion">
          {picked
            ? `${picked.name}${picked.copy > 0 ? ` (copia ${picked.copy + 1})` : ""}: ${picked.roundNumber !== null ? `V${picked.roundNumber}` : `vuelta ${picked.roundIndex + 1}`}, punto ${picked.stitchInRound + 1}`
            : T.sinSeleccion}
        </span>
      </div>

      {status && status.parts.length > 0 ? (
        <div className="grid gap-1 text-sm">
          <span className="font-semibold">{T.medidasTitulo}</span>
          <ul className="grid gap-0.5" data-testid="visor-3d-medidas">
            {status.parts.map((p) => (
              <li key={p.partId}>
                {p.name}
                {p.copies > 1 ? ` (× ${p.copies})` : ""}: {measureText(p.heightCm, p.widthCm, p.assumed)}
              </li>
            ))}
          </ul>
          {assumed ? <p className="text-tinta-suave">{T.muestraSupuesta}</p> : null}
        </div>
      ) : null}

      {/* Avisos de la escena (`notes`: forma, anclas, muestra supuesta), con los textos provisionales de T18. */}
      {status && status.notes.length > 0 ? (
        <section className="grid gap-1 rounded-md border-2 border-mostaza px-3 py-2 text-sm" aria-label={T.avisosTitulo} data-testid="visor-3d-avisos-zona">
          <h3 className="font-semibold">{T.avisosTitulo}</h3>
          <ul className="grid list-disc gap-0.5 pl-5" data-testid="visor-3d-avisos">
            {status.notes.map((n, i) => (
              <li key={`${n.code}-${i}`} data-code={n.code}>
                {n.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {perf ? (
        <pre className="overflow-x-auto rounded bg-superficie p-3 text-xs" data-testid="visor-3d-contadores">
          {counters}
        </pre>
      ) : null}
    </section>
  );
}

/**
 * Vista previa del ancla (T16): un punto en el ancla y tres flechas con el marco (normal, tangente a la vuelta y
 * meridiano). Va en su propio grupo, con el mismo giro que la raíz del renderer (la pieza crece hacia +z y se muestra
 * de pie), así usa las coordenadas de `SceneInstance.matrix`. No entra en `pick` ni en `bounds`.
 */
class AnchorMarker {
  readonly #group = new THREE.Group();
  readonly #dot: THREE.Mesh;
  readonly #normal: THREE.ArrowHelper;
  readonly #tangent: THREE.ArrowHelper;
  readonly #meridian: THREE.ArrowHelper;
  readonly #scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    this.#group.name = "loopita-ancla";
    this.#group.rotation.x = -Math.PI / 2;
    this.#group.visible = false;
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    this.#dot = new THREE.Mesh(new THREE.SphereGeometry(ANCHOR_DOT_CM, 16, 12), material);
    const origin = new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0, 1);
    this.#normal = new THREE.ArrowHelper(dir, origin, ANCHOR_NORMAL_CM, 0x1a2540, 0.5, 0.3);
    this.#tangent = new THREE.ArrowHelper(dir, origin, ANCHOR_AXIS_CM, 0xba222c, 0.35, 0.22);
    this.#meridian = new THREE.ArrowHelper(dir, origin, ANCHOR_AXIS_CM, 0x2f7d32, 0.35, 0.22);
    for (const o of [this.#dot, this.#normal, this.#tangent, this.#meridian]) {
      o.renderOrder = 999;
      o.traverse((x) => {
        const m = (x as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.depthTest = false;
      });
      this.#group.add(o);
    }
    scene.add(this.#group);
  }

  show(frame: { anchor: [number, number, number]; normal: [number, number, number]; tangent: [number, number, number]; meridian: [number, number, number] } | null): void {
    if (!frame) {
      this.#group.visible = false;
      return;
    }
    const at = new THREE.Vector3(...frame.anchor);
    this.#dot.position.copy(at);
    for (const [arrow, d] of [
      [this.#normal, frame.normal],
      [this.#tangent, frame.tangent],
      [this.#meridian, frame.meridian],
    ] as const) {
      arrow.position.copy(at);
      arrow.setDirection(new THREE.Vector3(...d));
    }
    this.#group.visible = true;
  }

  dispose(): void {
    this.#scene.remove(this.#group);
    this.#group.traverse((x) => {
      const mesh = x as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    });
  }
}

/** "2 piezas: Cuerpo (≈ 9,2 cm de alto, …); Oreja, 2 copias (…)." */
function sceneDescription(status: ViewerStatus | null): string {
  if (!status || status.parts.length === 0) return "";
  const items = status.parts.map((p) => `${p.name}${p.copies > 1 ? `, ${p.copies} copias` : ""} (${measureText(p.heightCm, p.widthCm, p.assumed)})`);
  return `${status.parts.length === 1 ? "1 pieza" : `${status.parts.length} piezas`}, ${status.stitches.toLocaleString("es-CL")} puntos en total: ${items.join("; ")}.`;
}

/** Número visible de la vuelta concreta `index` (de `concreteRounds`, el motor). */
function roundNumberOf(part: WrittenPattern["parts"][number], index: number): number | null {
  return concreteRounds(part)[index]?.number ?? null;
}

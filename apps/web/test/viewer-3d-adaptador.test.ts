/**
 * Adaptador del visor 3D en la aplicación (T11 de la fase 4; ADR 0010, secciones 5, 6b, 6c y 8), sin GPU:
 * - el controlador arma la escena solo cuando cambia la forma, y con solo aspectos llama a `setLooks`
 *   (guardia de rendimiento: 0 `buildScene`, 0 mallas, 0 atributos);
 * - sobre el límite recomendado, una sola reconstrucción en curso con el último documento ("Actualizando 3D…");
 * - sobre `SCENE_HARD_STITCH_CAP`, no se arma nada (siluetas);
 * - aspectos con `yarnLook` de `stitch-render` y "Colores planos" = aspectos neutros, la misma preferencia
 *   (`loopita:vista:colores-planos`) que el estudio de colorwork;
 * - controles con teclado;
 * - límites de importación: lo que se carga sin WebGL no importa `three` ni r3f, y ninguna textura viene de un
 *   archivo de imagen.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIBERS } from "@loopitalab/yarn-catalog";
import { yarnLook } from "@loopitalab/stitch-render";
import type { SurfaceLook } from "@loopitalab/viewer-3d";
import { SCENE_HARD_STITCH_CAP, type RendererScene, type ViewerPolicy } from "@loopitalab/viewer-3d/three";
import { describe, expect, it } from "vitest";
import { applyCameraAction, cameraKeyAction, framing } from "@/components/amigurumi/camera-keys.ts";
import { ViewerController, type Schedule } from "@/components/amigurumi/controller.ts";
import { LookCache, surfaceLookOf } from "@/components/amigurumi/looks.ts";
import { metricsResolver, silhouettesOf } from "@/components/amigurumi/metrics.ts";
import { measureText, VIEWER_3D_TEXTS } from "@/components/amigurumi/texts.ts";
import { FLAT_COLORS_STORAGE_KEY, PreviewControls } from "@/components/studio/preview-controls.ts";
import { DEMOS } from "@/app/dev/visor-3d/demo-patterns.ts";

const demo = (key: string) => DEMOS.find((d) => d.key === key)!.build();

class FakeRenderer {
  scenes: Array<{ scene: RendererScene; looks: readonly SurfaceLook[] }> = [];
  looks: Array<readonly SurfaceLook[]> = [];
  previews: Array<{ yarn: number; look: SurfaceLook } | null> = [];
  setScene(scene: RendererScene, looks: readonly SurfaceLook[]): ViewerPolicy {
    this.scenes.push({ scene, looks });
    const n = scene.stitchCount ?? 0;
    return { mode: n > SCENE_HARD_STITCH_CAP ? "silhouettes" : n > 40_000 ? "degraded" : "full", lod: "relief", lodForced: false, maxPixelRatio: null };
  }
  setLooks(looks: readonly SurfaceLook[]) {
    this.looks.push(looks);
  }
  setPreviewOverride(o: { yarn: number; look: SurfaceLook } | null) {
    this.previews.push(o);
  }
}

/** Programador manual: guarda las tareas y las corre cuando la prueba quiere. */
function manualSchedule() {
  const tasks: Array<{ run: () => void; cancelled: boolean }> = [];
  const schedule: Schedule = (run) => {
    const t = { run, cancelled: false };
    tasks.push(t);
    return () => (t.cancelled = true);
  };
  const flush = () => {
    for (const t of tasks.splice(0)) if (!t.cancelled) t.run();
  };
  return { schedule, flush, pending: () => tasks.filter((t) => !t.cancelled).length };
}

describe("controlador: dentro del límite recomendado", () => {
  it("arma la escena en el mismo turno y luego solo lo que cambió", () => {
    const r = new FakeRenderer();
    const c = new ViewerController();
    c.attach(r);
    const p = demo("fixture-a");
    c.update(p);
    expect(c.counters.buildScene).toBe(1);
    expect(c.counters.partsBuilt).toBe(1);
    expect(r.scenes).toHaveLength(1);
    expect(r.scenes[0]!.scene.stitchCount).toBe(1_800);
    expect(c.status.mode).toBe("full");
    expect(c.status.updating).toBe(false);
    expect(c.status.parts[0]!.name).toBe("Cuerpo");
    // Misma referencia: nada.
    c.update(p);
    expect(c.counters.buildScene).toBe(1);
  });

  it("cambiar el color o la composición solo llama a setLooks: 0 buildScene, 0 mallas", () => {
    const r = new FakeRenderer();
    const c = new ViewerController();
    c.attach(r);
    const p = demo("fixture-a");
    c.update(p);
    const before = { ...c.counters };
    c.update({ ...p, yarns: [{ ...p.yarns[0]!, composition: [{ fiber: "mohair", percent: 100 }] }, ...p.yarns.slice(1)] });
    expect(c.counters.buildScene).toBe(before.buildScene);
    expect(c.counters.partsBuilt + c.counters.partsRecolored).toBe(before.partsBuilt + before.partsRecolored);
    expect(r.scenes).toHaveLength(1);
    expect(r.looks).toHaveLength(1);
    expect(r.looks[0]![0]!.halo).toBe(1);
    // Cambiar algo que no cambia el aspecto (el grosor) no llama a nada.
    const q = c.status;
    c.update({ ...p, yarns: [{ ...p.yarns[0]!, composition: [{ fiber: "mohair", percent: 100 }], weight: 5 }, ...p.yarns.slice(1)] });
    expect(r.looks).toHaveLength(1);
    expect(c.status).toBe(q);
  });

  it("cambiar la lana de una vuelta recolorea sin reconstruir la malla", () => {
    const r = new FakeRenderer();
    const c = new ViewerController();
    c.attach(r);
    const p = demo("fixture-a");
    c.update(p);
    const part = structuredClone(p.parts[0]!);
    part.rounds[14]!.items = [{ type: "color", yarn: "B" }, ...part.rounds[14]!.items];
    c.update({ ...p, parts: [part] });
    expect(c.counters.partsBuilt).toBe(1);
    expect(c.counters.partsRecolored).toBe(1);
    expect(r.scenes.at(-1)!.scene.updates?.[0]?.kind).toBe("recolored");
  });

  it("vista previa al pasar el cursor: setPreviewOverride, sin escena", () => {
    const r = new FakeRenderer();
    const c = new ViewerController();
    c.attach(r);
    c.update(demo("fixture-b"));
    c.previewYarn(0, { color: { hex: "#25A8A6" } });
    expect(r.previews.at(-1)).toEqual({ yarn: 0, look: yarnLook({ ...demo("fixture-b").yarns[0]!, color: { hex: "#25A8A6" } }, FIBERS, { fiberEffects: true }) });
    c.previewYarn(0, null);
    expect(r.previews.at(-1)).toBeNull();
    expect(r.scenes).toHaveLength(1);
  });
});

describe("controlador: fuera de los límites (sección 6c)", () => {
  it("sobre el límite recomendado: una sola reconstrucción en curso, con el último documento", () => {
    const r = new FakeRenderer();
    const s = manualSchedule();
    const c = new ViewerController({ schedule: s.schedule });
    c.attach(r);
    const big = demo("grande");
    c.update(big);
    expect(r.scenes).toHaveLength(0);
    expect(c.status.updating).toBe(true);
    expect(c.status.mode).toBe("degraded");
    // Dos ediciones más antes de que corra la tarea: siguen siendo una sola tarea.
    const e1 = { ...big, title: "1", parts: [{ ...big.parts[0]!, name: "Uno" }] };
    const e2 = { ...big, title: "2", parts: [{ ...big.parts[0]!, name: "Dos" }] };
    c.update(e1);
    c.update(e2);
    expect(s.pending()).toBe(1);
    expect(c.counters.superseded).toBe(2);
    s.flush();
    expect(r.scenes).toHaveLength(1);
    expect(c.counters.buildScene).toBe(1);
    expect(c.status.parts[0]!.name).toBe("Dos");
    expect(c.status.updating).toBe(false);
    expect(r.scenes[0]!.scene.stitchCount).toBe(61_200);
  });

  it("volver dentro del límite cancela lo pendiente y dibuja en el mismo turno", () => {
    const r = new FakeRenderer();
    const s = manualSchedule();
    const c = new ViewerController({ schedule: s.schedule });
    c.attach(r);
    c.update(demo("grande"));
    c.update(demo("fixture-a"));
    expect(r.scenes).toHaveLength(1);
    expect(r.scenes[0]!.scene.stitchCount).toBe(1_800);
    s.flush();
    expect(r.scenes).toHaveLength(1);
  });

  it("sobre SCENE_HARD_STITCH_CAP no arma mallas: escena vacía y siluetas", () => {
    const r = new FakeRenderer();
    const c = new ViewerController();
    c.attach(r);
    c.update(demo("tope"));
    expect(c.counters.buildScene).toBe(0);
    expect(r.scenes[0]!.scene.instances).toHaveLength(0);
    expect(r.scenes[0]!.scene.stitchCount).toBe(270_000);
    expect(c.status.mode).toBe("silhouettes");
    const sil = silhouettesOf(demo("tope"));
    expect(sil).toHaveLength(3);
    expect(sil[0]!.svg).toContain("<svg");
    expect(sil[0]!.svg).toContain(demo("tope").yarns[0]!.color.hex);
  });
});

describe("aspectos (sección 6b) y Colores planos", () => {
  it("son exactamente los de yarnLook (la misma fórmula que el 2D)", () => {
    const p = demo("fixture-a");
    for (const y of p.yarns) {
      expect(surfaceLookOf(y, false)).toEqual(yarnLook(y, FIBERS, { fiberEffects: true }));
      expect(surfaceLookOf(y, true)).toEqual(yarnLook(y, FIBERS, { fiberEffects: false }));
    }
  });

  it("Colores planos = aspecto neutro (halo, brillo y definición en 0) con el mismo color", () => {
    const y = { ...demo("fixture-a").yarns[0]!, composition: [{ fiber: "mohair", percent: 70 }, { fiber: "seda", percent: 30 }] };
    const fiber = surfaceLookOf(y, false);
    expect(fiber.halo).toBeGreaterThan(0);
    expect(surfaceLookOf(y, true)).toEqual({ hex: fiber.hex, halo: 0, sheen: 0, definition: 0 });
  });

  it("LookCache solo recalcula lo que cambió y avisa si cambió el aspecto", () => {
    const cache = new LookCache();
    const yarns = demo("fixture-a").yarns;
    expect(cache.update(yarns, false).changed).toBe(true);
    expect(cache.computed).toBe(3);
    expect(cache.update(yarns, false).changed).toBe(false);
    expect(cache.computed).toBe(3);
    expect(cache.update(yarns, true).changed).toBe(true);
    expect(cache.current.every((l) => l.halo === 0 && l.sheen === 0 && l.definition === 0)).toBe(true);
  });

  it("la preferencia es la del estudio de colorwork y nunca entra al documento", () => {
    const store = new Map<string, string>([[FLAT_COLORS_STORAGE_KEY, "1"]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(FLAT_COLORS_STORAGE_KEY).toBe("loopita:vista:colores-planos");
    const controls = new PreviewControls(storage);
    const r = new FakeRenderer();
    const c = new ViewerController({ flatColors: controls.flatColors });
    c.attach(r);
    controls.bind(c);
    const p = demo("fixture-a");
    const json = JSON.stringify(p);
    c.update(p);
    expect(r.scenes[0]!.looks.every((l) => l.halo === 0 && l.sheen === 0 && l.definition === 0)).toBe(true);
    controls.setFlatColors(false);
    expect(store.get(FLAT_COLORS_STORAGE_KEY)).toBe("0");
    expect(r.looks.at(-1)![0]).toEqual(surfaceLookOf(p.yarns[0]!, false));
    expect(c.counters.buildScene).toBe(1);
    expect(JSON.stringify(p)).toBe(json);
  });
});

describe("medidas y muestra supuesta (secciones 1 y 7)", () => {
  it("dice estimación, y supuesto si la muestra es supuesta", () => {
    expect(measureText(12.04, 8, false)).toBe("≈ 12 cm de alto, ≈ 8 cm de ancho, estimación");
    expect(measureText(12, 8.25, true)).toBe("≈ 12 cm de alto, ≈ 8,3 cm de ancho, estimación, supuesto");
  });

  it("sin muestra en el documento usa la sugerida para crochet y la marca como supuesta", () => {
    const p = demo("fixture-a");
    const { gauge: _g, ...rest } = p;
    const m = metricsResolver(rest)(p.parts[0]!);
    expect(m.assumed).toBe(true);
    expect(metricsResolver(p)(p.parts[0]!).assumed).toBe(false);
  });

  it("el aviso de prototipo menciona el relleno y la tensión de amigurumi (enmienda C-11)", () => {
    expect(VIEWER_3D_TEXTS.avisoPrototipo).toContain("redondea la pieza y puede cambiar sus medidas");
    expect(VIEWER_3D_TEXTS.avisoPrototipo).toContain("teje una muestra con tu ganchillo");
    expect(VIEWER_3D_TEXTS.soloEn3d).toContain("el halo y el brillo solo se ven en la vista 3D");
  });
});

describe("teclado (sección 5)", () => {
  it("flechas giran, + y − acercan, 0 restablece", () => {
    expect(cameraKeyAction("ArrowLeft")).toMatchObject({ type: "orbit" });
    expect(cameraKeyAction("+")).toMatchObject({ type: "zoom" });
    expect(cameraKeyAction("-")).toMatchObject({ type: "zoom" });
    expect(cameraKeyAction("0")).toEqual({ type: "reset" });
    expect(cameraKeyAction("a")).toBeNull();
    const limits = { minDistance: 1, maxDistance: 100 };
    const o: [number, number, number] = [0, 3, 10];
    const r0 = Math.hypot(...o);
    const rotated = applyCameraAction(o, cameraKeyAction("ArrowRight") as never, limits);
    expect(Math.hypot(...rotated)).toBeCloseTo(r0, 9);
    expect(rotated[0]).toBeGreaterThan(0);
    const zoomed = applyCameraAction(o, cameraKeyAction("+") as never, limits);
    expect(Math.hypot(...zoomed)).toBeLessThan(r0);
    expect(Math.hypot(...applyCameraAction(o, { type: "zoom", factor: 1e-6 }, limits))).toBeCloseTo(1, 9);
    // No pasa por el polo.
    let up = o;
    for (let i = 0; i < 40; i++) up = applyCameraAction(up, cameraKeyAction("ArrowUp") as never, limits);
    expect(up[1] / Math.hypot(...up)).toBeLessThan(1);
    const f = framing([0, 0, 0], 5, 40);
    expect(f.distance).toBeGreaterThan(5);
  });
});

describe("límites de importación (ADR 0010, secciones 5, 6b y 9; CA4-V8)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = resolve(here, "../src");
  const staticImports = (file: string): string[] =>
    [...readFileSync(file, "utf8").matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]!);
  const resolveLocal = (from: string, spec: string): string | null => {
    if (spec.startsWith("@/")) return join(src, spec.slice(2));
    if (spec.startsWith(".")) return resolve(dirname(from), spec);
    return null;
  };
  /** Módulos de terceros alcanzables por importaciones estáticas (no `import()` ni `import type`). */
  const reach = (entry: string): Set<string> => {
    const seen = new Set<string>();
    const external = new Set<string>();
    const walk = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const spec of staticImports(f)) {
        const local = resolveLocal(f, spec);
        if (local) walk(local);
        else external.add(spec);
      }
    };
    walk(entry);
    return external;
  };

  it("el cargador y las siluetas (sin WebGL2) no cargan three ni r3f", () => {
    for (const entry of ["components/amigurumi/AmigurumiViewerLoader.tsx", "components/amigurumi/Silhouettes.tsx", "app/dev/visor-3d/VisorDemo.tsx"]) {
      const ext = [...reach(join(src, entry))];
      expect(ext.filter((s) => s === "three" || s.startsWith("three/") || s.startsWith("@react-three") || s.endsWith("/three")), entry).toEqual([]);
    }
  });

  it("solo el componente del visor importa r3f, y nada fuera de components/amigurumi importa viewer-3d/three", () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
    for (const f of files(src)) {
      const imps = staticImports(f);
      if (imps.some((i) => i.startsWith("@react-three"))) expect(f).toMatch(/components\/amigurumi\/AmigurumiViewer\.tsx$/);
      if (imps.some((i) => i === "@loopitalab/viewer-3d/three" || i === "three" || i.startsWith("three/"))) expect(f).toMatch(/components\/amigurumi\//);
    }
  });

  it("ninguna textura viene de un archivo de imagen", () => {
    const dir = join(src, "components/amigurumi");
    for (const f of readdirSync(dir)) expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/TextureLoader|ImageLoader|\.(png|jpe?g|webp|ktx2)["']/i);
  });
});

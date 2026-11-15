/**
 * Material del visor (ADR 0010, sección 6b; enmienda V-2): `MeshStandardMaterial` extendido con
 * `onBeforeCompile`, que conserva las luces y el espacio de color de `three`.
 *
 * - **Tabla por lana en uniformes**: `uYarnColor[32]` (color lineal) y `uYarnLook[32]` (halo, brillo,
 *   definición). El atributo `yarn` la indexa en el sombreador de **vértices**; el color y el aspecto pasan al
 *   de fragmentos con *varyings* `flat` (el color de un punto no se mezcla con el del vecino). Sin textura de datos.
 * - Las constantes de fibra son `#define` fijos: cambiar aspectos solo cambia uniformes, nunca el programa.
 * - **Dos programas** en total (`relief` con mapa de normales y `smooth` sin él), con `customProgramCacheKey`
 *   explícito. Los materiales resaltados usan la misma clave y los mismos parámetros: comparten el programa y
 *   solo cambian sus uniformes (`uHighlight`).
 * - **Aspecto neutro = material base**: con halo, brillo y definición en 0, sin hebra suelta y sin resaltado,
 *   cada término suma 0 o multiplica por 1 (prueba de captura en el E2E).
 */
import * as THREE from "three";
import type { Lod, SurfaceLook } from "../types.ts";
import {
  FIBER_DEFINITION_RELIEF,
  FIBER_HALO_FRESNEL_POWER,
  FIBER_HALO_RIM,
  FIBER_HALO_SOFTEN,
  FIBER_SHEEN_ROUGHNESS,
  FIBER_SHEEN_SPECULAR,
  HIGHLIGHT_EMISSIVE,
  LOOP_EDGE_SHADE,
  LOOP_EDGE_WIDTH,
  MAX_YARNS,
  PROGRAM_CACHE_KEYS,
  RELIEF_NORMAL_SCALE,
  ROUGHNESS_BASE,
} from "./constants.ts";

/** Gris medio para las entradas de la tabla sin lana (mismo valor que `SILHOUETTE_FALLBACK_HEX`). */
const EMPTY_HEX = "#8C8C8C";

export interface YarnTable {
  color: { value: Float32Array };
  look: { value: Float32Array };
}

export function createYarnTable(): YarnTable {
  return { color: { value: new Float32Array(MAX_YARNS * 3) }, look: { value: new Float32Array(MAX_YARNS * 3) } };
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const tmp = new THREE.Color();

/**
 * Escribe la tabla: solo uniformes (ni atributos ni programa). `override` reemplaza una entrada (vista previa al
 * pasar el cursor). Devuelve cuántas entradas cambiaron, para el contador del modo de medición.
 */
export function writeLooks(table: YarnTable, looks: readonly SurfaceLook[], override: { yarn: number; look: SurfaceLook } | null = null): number {
  const c = table.color.value;
  const l = table.look.value;
  let changed = 0;
  for (let i = 0; i < MAX_YARNS; i++) {
    const look = override && override.yarn === i ? override.look : looks[i];
    const hex = typeof look?.hex === "string" && /^#[0-9a-fA-F]{6}$/.test(look.hex) ? look.hex : EMPTY_HEX;
    tmp.set(hex); // sRGB → lineal (ColorManagement activo), igual que `color` de MeshStandardMaterial
    const next = [tmp.r, tmp.g, tmp.b, clamp01(look?.halo ?? 0), clamp01(look?.sheen ?? 0), clamp01(look?.definition ?? 0)];
    const k = i * 3;
    if (c[k] !== Math.fround(next[0]!) || c[k + 1] !== Math.fround(next[1]!) || c[k + 2] !== Math.fround(next[2]!) || l[k] !== Math.fround(next[3]!) || l[k + 1] !== Math.fround(next[4]!) || l[k + 2] !== Math.fround(next[5]!)) changed++;
    c[k] = next[0]!;
    c[k + 1] = next[1]!;
    c[k + 2] = next[2]!;
    l[k] = next[3]!;
    l[k + 1] = next[4]!;
    l[k + 2] = next[5]!;
  }
  return changed;
}

const f = (x: number): string => x.toFixed(4);

const FIBER_DEFINES = `
#define FIBER_SHEEN_ROUGHNESS ${f(FIBER_SHEEN_ROUGHNESS)}
#define FIBER_SHEEN_SPECULAR ${f(FIBER_SHEEN_SPECULAR)}
#define FIBER_HALO_RIM ${f(FIBER_HALO_RIM)}
#define FIBER_HALO_SOFTEN ${f(FIBER_HALO_SOFTEN)}
#define FIBER_DEFINITION_RELIEF ${f(FIBER_DEFINITION_RELIEF)}
#define FIBER_HALO_FRESNEL_POWER ${f(FIBER_HALO_FRESNEL_POWER)}
#define LOOP_EDGE_SHADE ${f(LOOP_EDGE_SHADE)}
#define LOOP_EDGE_WIDTH ${f(LOOP_EDGE_WIDTH)}
#define HIGHLIGHT_EMISSIVE vec3(${HIGHLIGHT_EMISSIVE.map(f).join(", ")})
`;

/** Uniformes propios de un material (el resaltado); la tabla es compartida. */
export interface FiberUniforms {
  /** x, y: rango de vértices `[from, to)` resaltado (por `gl_VertexID`); z: 1 encendido, 0 apagado. */
  uHighlight: { value: THREE.Vector3 };
}

function patchShader(shader: THREE.WebGLProgramParametersWithUniforms, table: YarnTable, own: FiberUniforms, lod: Lod): void {
  shader.uniforms.uYarnColor = table.color;
  shader.uniforms.uYarnLook = table.look;
  shader.uniforms.uHighlight = own.uHighlight;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
attribute float yarn;
attribute float loop;
uniform vec3 uYarnColor[${MAX_YARNS}];
uniform vec3 uYarnLook[${MAX_YARNS}];
uniform vec3 uHighlight;
flat varying vec3 vYarnColor;
flat varying vec3 vYarnLook;
flat varying float vLoop;
flat varying float vHighlight;
varying float vStitchV;`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
int yarnIndex = clamp(int(yarn + 0.5), 0, ${MAX_YARNS - 1});
vYarnColor = uYarnColor[yarnIndex];
vYarnLook = uYarnLook[yarnIndex];
vLoop = loop;
float vertexId = float(gl_VertexID);
vHighlight = (vertexId >= uHighlight.x && vertexId < uHighlight.y) ? uHighlight.z : 0.0;
vStitchV = uv.y;`,
    );
  const normalMaps = THREE.ShaderChunk.normal_fragment_maps.replace("mapN.xy *= normalScale;", "mapN.xy *= normalScale * fiberRelief;");
  // En "smooth" no hay mapa de normales: la definición y el suavizado del halo no tienen dónde actuar (sección 6b).
  const loopEdge =
    lod === "relief"
      ? `float loopEdge = vLoop > 0.5 ? (1.0 - smoothstep(0.0, LOOP_EDGE_WIDTH, vStitchV)) : 0.0;
diffuseColor.rgb *= 1.0 - LOOP_EDGE_SHADE * loopEdge;`
      : "";
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
${FIBER_DEFINES}
flat varying vec3 vYarnColor;
flat varying vec3 vYarnLook;
flat varying float vLoop;
flat varying float vHighlight;
varying float vStitchV;`,
    )
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
diffuseColor.rgb *= vYarnColor;
${loopEdge}`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - FIBER_SHEEN_ROUGHNESS * vYarnLook.y, 0.05, 1.0);`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `float fiberRelief = (1.0 - FIBER_HALO_SOFTEN * vYarnLook.x) * (1.0 + FIBER_DEFINITION_RELIEF * vYarnLook.z);
${normalMaps}
float fiberFresnel = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), FIBER_HALO_FRESNEL_POWER);
diffuseColor.rgb += FIBER_HALO_RIM * vYarnLook.x * fiberFresnel * (vec3(1.0) - diffuseColor.rgb);`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
totalEmissiveRadiance += HIGHLIGHT_EMISSIVE * vHighlight;`,
    )
    .replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
reflectedLight.directSpecular *= 1.0 + FIBER_SHEEN_SPECULAR * vYarnLook.y;`,
    );
}

/** Parámetros comunes del material base y del extendido (los mismos: es lo que hace valer "neutro = base"). */
function baseParameters(lod: Lod, normalMap: THREE.Texture): THREE.MeshStandardMaterialParameters {
  return {
    color: 0xffffff,
    roughness: ROUGHNESS_BASE,
    metalness: 0,
    side: THREE.DoubleSide, // la última vuelta queda abierta: se ve el interior
    ...(lod === "relief" ? { normalMap, normalScale: new THREE.Vector2(RELIEF_NORMAL_SCALE, RELIEF_NORMAL_SCALE) } : {}),
  };
}

export interface FiberMaterial extends THREE.MeshStandardMaterial {
  userData: { lod: Lod; fiber: FiberUniforms };
}

/** Material extendido de un nivel de detalle. Todos los de un mismo nivel comparten el programa. */
export function createFiberMaterial(table: YarnTable, lod: Lod, normalMap: THREE.Texture): FiberMaterial {
  const m = new THREE.MeshStandardMaterial(baseParameters(lod, normalMap)) as FiberMaterial;
  const own: FiberUniforms = { uHighlight: { value: new THREE.Vector3(0, 0, 0) } };
  m.userData = { lod, fiber: own };
  m.onBeforeCompile = (shader) => patchShader(shader, table, own, lod);
  m.customProgramCacheKey = () => PROGRAM_CACHE_KEYS[lod];
  m.name = PROGRAM_CACHE_KEYS[lod];
  return m;
}

/**
 * `MeshStandardMaterial` **sin extender**, con un solo color: solo para el A/B del costo de la extensión (R4-19)
 * y la prueba "neutro = base". No lee la tabla por lana ni el atributo `yarn`.
 */
export function createBaseMaterial(lod: Lod, normalMap: THREE.Texture, hex: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ ...baseParameters(lod, normalMap), color: new THREE.Color(hex) });
  m.name = `loopita-base-${lod}`;
  return m;
}

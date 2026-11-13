import * as THREE from "three";

/**
 * Prototipo T3b del material con aspecto por fibra (ADR 0010, sección 6b). En T11 pasa a `viewer-3d/three`.
 *
 * - Un `MeshStandardMaterial` extendido con `onBeforeCompile` (conserva luces y espacio de color de `three`).
 * - Tabla por lana en UNIFORMES: `uYarnColor[32]` (color lineal) y `uYarnLook[32]` (halo, sheen, definition).
 *   El atributo `yarn` (Uint8) indexa la tabla en el sombreador de vértices; el color y el aspecto viajan al de
 *   fragmentos como `flat` (el color de un punto no se mezcla con el del vecino).
 * - Las constantes de fibra son `#define` fijos: cambiar el aspecto de una lana solo cambia uniformes, nunca el
 *   programa. Dos programas en total: "relief" (con mapa de normales) y "smooth" (sin él).
 * - Aspecto neutro (0, 0, 0) = exactamente el material base.
 */

export const MAX_YARNS = 32; // = LIMITS.maxYarns de pattern-core

// Constantes con nombre (valores iniciales sin calibrar; la calibración visual es T11c).
export const ROUGHNESS_BASE = 0.85;
export const FIBER_SHEEN_ROUGHNESS = 0.45;
export const FIBER_SHEEN_SPECULAR = 0.6;
export const FIBER_HALO_RIM = 0.55;
export const FIBER_HALO_SOFTEN = 0.7;
export const FIBER_DEFINITION_RELIEF = 0.8;

export interface SurfaceLook {
  hex: string;
  halo: number;
  sheen: number;
  definition: number;
}

export interface YarnTable {
  color: { value: Float32Array };
  look: { value: Float32Array };
}

export function createYarnTable(): YarnTable {
  return { color: { value: new Float32Array(MAX_YARNS * 3) }, look: { value: new Float32Array(MAX_YARNS * 3) } };
}

const tmp = new THREE.Color();

/** Escribe la tabla (solo uniformes: ni atributos ni programa). `override` = vista previa al pasar el cursor. */
export function writeLooks(table: YarnTable, looks: readonly SurfaceLook[], override: { yarn: number; look: SurfaceLook } | null = null): void {
  const c = table.color.value;
  const l = table.look.value;
  for (let i = 0; i < MAX_YARNS; i++) {
    const look = override && override.yarn === i ? override.look : looks[i];
    if (!look) {
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = 0.5;
      l[i * 3] = l[i * 3 + 1] = l[i * 3 + 2] = 0;
      continue;
    }
    tmp.set(look.hex); // sRGB → lineal (ColorManagement activo)
    c[i * 3] = tmp.r;
    c[i * 3 + 1] = tmp.g;
    c[i * 3 + 2] = tmp.b;
    l[i * 3] = look.halo;
    l[i * 3 + 1] = look.sheen;
    l[i * 3 + 2] = look.definition;
  }
}

const defines = `
#define FIBER_SHEEN_ROUGHNESS ${FIBER_SHEEN_ROUGHNESS.toFixed(4)}
#define FIBER_SHEEN_SPECULAR ${FIBER_SHEEN_SPECULAR.toFixed(4)}
#define FIBER_HALO_RIM ${FIBER_HALO_RIM.toFixed(4)}
#define FIBER_HALO_SOFTEN ${FIBER_HALO_SOFTEN.toFixed(4)}
#define FIBER_DEFINITION_RELIEF ${FIBER_DEFINITION_RELIEF.toFixed(4)}
`;

function patchShader(shader: THREE.WebGLProgramParametersWithUniforms, table: YarnTable): void {
  shader.uniforms.uYarnColor = table.color;
  shader.uniforms.uYarnLook = table.look;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
attribute float yarn;
uniform vec3 uYarnColor[${MAX_YARNS}];
uniform vec3 uYarnLook[${MAX_YARNS}];
flat varying vec3 vYarnColor;
flat varying vec3 vYarnLook;`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
int yarnIndex = int(yarn + 0.5);
vYarnColor = uYarnColor[yarnIndex];
vYarnLook = uYarnLook[yarnIndex];`,
    );
  const normalMaps = THREE.ShaderChunk.normal_fragment_maps.replace("mapN.xy *= normalScale;", "mapN.xy *= normalScale * fiberRelief;");
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
${defines}
flat varying vec3 vYarnColor;
flat varying vec3 vYarnLook;`,
    )
    .replace("#include <color_fragment>", "diffuseColor.rgb *= vYarnColor;")
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - FIBER_SHEEN_ROUGHNESS * vYarnLook.y, 0.05, 1.0);`,
    )
    .replace(
      "#include <normal_fragment_maps>",
      `float fiberRelief = (1.0 - FIBER_HALO_SOFTEN * vYarnLook.x) * (1.0 + FIBER_DEFINITION_RELIEF * vYarnLook.z);
${normalMaps}
float fiberFresnel = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
diffuseColor.rgb += FIBER_HALO_RIM * vYarnLook.x * fiberFresnel * (vec3(1.0) - diffuseColor.rgb);`,
    )
    .replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
reflectedLight.directSpecular *= 1.0 + FIBER_SHEEN_SPECULAR * vYarnLook.y;`,
    );
}

/** Textura de relieve del punto (mapa de normales procedural, sin archivos de imagen): una "V" de dos lazadas. */
export function createStitchNormalMap(size = 64): THREE.DataTexture {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // dos lóbulos inclinados (las dos patas de la V) y un surco al centro
      const lobe = (cx: number, tilt: number) => {
        const du = (u - cx - tilt * (v - 0.5)) / 0.2;
        const dv = (v - 0.5) / 0.48;
        return Math.max(0, 1 - du * du - dv * dv);
      };
      h[y * size + x] = Math.sqrt(lobe(0.3, 0.35)) + Math.sqrt(lobe(0.7, -0.35));
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.5;
      const len = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      data[k] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export type Lod = "relief" | "smooth";

/** Los dos materiales (uno por nivel de detalle) comparten la misma tabla de uniformes. */
export function createFiberMaterials(table: YarnTable, normalMap: THREE.Texture): Record<Lod, THREE.MeshStandardMaterial> {
  const make = (lod: Lod) => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: ROUGHNESS_BASE,
      metalness: 0,
      side: THREE.DoubleSide, // la última vuelta queda abierta: se ve el interior
      ...(lod === "relief" ? { normalMap, normalScale: new THREE.Vector2(0.9, 0.9) } : {}),
    });
    m.onBeforeCompile = (shader) => patchShader(shader, table);
    m.customProgramCacheKey = () => `loopita-fiber-${lod}`;
    m.name = `loopita-fiber-${lod}`;
    return m;
  };
  return { relief: make("relief"), smooth: make("smooth") };
}

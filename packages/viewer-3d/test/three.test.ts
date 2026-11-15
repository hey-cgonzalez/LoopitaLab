/**
 * Backend `three` sin GPU (ADR 0010, secciones 5, 6, 6b, 6c y 9): política de nivel de detalle y modo,
 * capacidad reservada, atributos actualizados en el lugar, tabla por lana en uniformes, parche del material
 * (todas las inserciones aplicadas, *varyings* `flat`, clave de programa explícita), relieve procedural y
 * límites entre paquetes. `three` es dependencia de desarrollo de este paquete.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import * as THREE from "three";
import { buildPartMesh, buildScene, colorizePartMesh } from "../src/index.ts";
import {
  LOD_STITCH_BUDGET,
  MAX_YARNS,
  PROGRAM_CACHE_KEYS,
  RECOMMENDED_SCENE_STITCHES,
  RESERVE_GROWTH,
  SCENE_HARD_STITCH_CAP,
  PartBuffers,
  createFiberMaterial,
  createStitchNormalMap,
  createYarnTable,
  grownCapacity,
  stitchHeightField,
  stitchLocation,
  vertexRangeOfStitches,
  viewerMode,
  viewerPolicy,
  writeLooks,
} from "../src/three/index.ts";
import { METRICS, fixtureAPart, forAll, genSavable, profileOf, readPart, roundPieceText, withYarns } from "./support/fixtures.ts";

const yarnIds = ["A", "B", "C"];

describe("política (secciones 6 y 6c)", () => {
  it("constantes iniciales de las enmiendas V-1 y V-4", () => {
    assert.equal(LOD_STITCH_BUDGET, 20_000);
    assert.equal(SCENE_HARD_STITCH_CAP, 200_000);
    assert.equal(RECOMMENDED_SCENE_STITCHES, 40_000);
    assert.equal(RESERVE_GROWTH, 1.5);
    assert.equal(MAX_YARNS, 32);
  });

  it("modo por puntos de la escena", () => {
    assert.equal(viewerMode(0), "full");
    assert.equal(viewerMode(40_000), "full");
    assert.equal(viewerMode(40_001), "degraded");
    assert.equal(viewerMode(200_000), "degraded");
    assert.equal(viewerMode(200_001), "silhouettes");
    assert.equal(viewerMode(Number.NaN), "full");
  });

  it("relief solo si se pide, dentro del presupuesto y con un contexto completo", () => {
    assert.deepEqual(viewerPolicy(1_800, "relief"), { mode: "full", lod: "relief", lodForced: false, maxPixelRatio: null });
    assert.deepEqual(viewerPolicy(20_001, "relief"), { mode: "full", lod: "smooth", lodForced: true, maxPixelRatio: null });
    assert.deepEqual(viewerPolicy(50_000, "relief"), { mode: "degraded", lod: "smooth", lodForced: true, maxPixelRatio: 1 });
    assert.deepEqual(viewerPolicy(1_800, "smooth"), { mode: "full", lod: "smooth", lodForced: false, maxPixelRatio: null });
    assert.equal(viewerPolicy(1_800, "relief", { limitedContext: true }).lod, "smooth");
    assert.equal(viewerPolicy(300_000, "relief").mode, "silhouettes");
  });

  it("la capacidad crece por 1,5 solo cuando no alcanza", () => {
    assert.equal(grownCapacity(100, 80), 100);
    assert.equal(grownCapacity(100, 100), 100);
    assert.equal(grownCapacity(100, 101), 152);
    assert.equal(grownCapacity(0, 0), 0);
    forAll("capacidad", (r) => ({ cur: r.int(0, 10_000), need: r.int(0, 20_000) }), ({ cur, need }) => {
      const c = grownCapacity(cur, need);
      assert.ok(c >= need && c >= cur);
      if (need > cur) assert.ok(c <= Math.ceil(need * 1.5));
    });
  });
});

describe("atributos reservados (sección 5)", () => {
  const meshA = () => buildPartMesh(fixtureAPart(), yarnIds, profileOf(fixtureAPart()));

  it("copia la malla, marca solo el rango usado y fija el rango de dibujo", () => {
    const mesh = meshA();
    const b = new PartBuffers(mesh);
    const g = b.geometry;
    assert.ok(b.vertexCapacity >= Math.ceil(mesh.vertexCount * 1.5) - 1);
    assert.deepEqual((g.getAttribute("position").array as Float32Array).subarray(0, mesh.vertexCount * 3), mesh.positions);
    assert.deepEqual((g.getAttribute("yarn").array as Uint8Array).subarray(0, mesh.vertexCount), mesh.yarn);
    assert.deepEqual((g.getAttribute("loop").array as Uint8Array).subarray(0, mesh.vertexCount), mesh.loop);
    assert.deepEqual((g.getIndex()!.array as Uint32Array).subarray(0, mesh.indexCount), mesh.indices);
    assert.deepEqual(g.drawRange, { start: 0, count: mesh.indexCount });
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    assert.deepEqual(pos.updateRanges, [{ start: 0, count: mesh.vertexCount * 3 }]);
    assert.equal(b.lastUpload.attributes, 6);
    assert.ok(g.boundingSphere && g.boundingSphere.radius > 0);
  });

  it("una malla más chica reutiliza los búferes (misma geometría, sin crecer)", () => {
    const b = new PartBuffers(meshA());
    const geometry = b.geometry;
    const small = buildPartMesh(fixtureAPart(20), yarnIds, profileOf(fixtureAPart(20)));
    const st = b.write(small);
    assert.equal(st.grew, false);
    assert.equal(b.geometry, geometry);
    assert.equal(b.geometry.drawRange.count, small.indexCount);
    assert.equal(b.growths, 0);
  });

  it("una malla que no cabe crece por 1,5 con geometría nueva y la anterior se libera", () => {
    const small = buildPartMesh(fixtureAPart(11), yarnIds, profileOf(fixtureAPart(11)));
    const big = buildPartMesh(fixtureAPart(60), yarnIds, profileOf(fixtureAPart(60)));
    const b = new PartBuffers(small);
    const old = b.geometry;
    let disposed = false;
    old.addEventListener("dispose", () => (disposed = true));
    const st = b.write(big);
    assert.equal(st.grew, true);
    assert.notEqual(b.geometry, old);
    assert.ok(disposed);
    assert.equal(b.vertexCapacity, Math.ceil(big.vertexCount * 1.5));
    assert.deepEqual((b.geometry.getAttribute("normal").array as Float32Array).subarray(0, big.vertexCount * 3), big.normals);
  });

  it("recolorear sube solo el rango de `yarn` (G6 de punta a punta)", () => {
    const part = readPart(`${roundPieceText("Cabeza", 6, 4, 3)}`, "cabeza");
    const mesh = buildPartMesh(part, yarnIds, profileOf(part));
    const b = new PartBuffers(mesh);
    const before = b.versions();
    const recolored = structuredClone(part);
    const r = recolored.rounds[3]!;
    r.items = [{ type: "color", yarn: "B" }, ...r.items];
    const range = colorizePartMesh(mesh, recolored, yarnIds);
    assert.ok(range.to > range.from);
    const st = b.writeYarnRange(range.from, range.to);
    assert.equal(st.attributes, 1);
    assert.equal(b.versions() - before, 1, "solo `yarn` sube de versión");
    assert.deepEqual((b.geometry.getAttribute("yarn") as THREE.BufferAttribute).updateRanges, [{ start: range.from, count: range.to - range.from }]);
    assert.deepEqual((b.geometry.getAttribute("yarn").array as Uint8Array).subarray(0, mesh.vertexCount), mesh.yarn);
    assert.deepEqual(b.writeYarnRange(5, 5), { attributes: 0, bytes: 0, grew: false });
  });

  it("documentos savable al azar: los atributos reservados son la malla (prefijo exacto)", () => {
    forAll(
      "atributos",
      (r) => genSavable(r),
      (doc) => {
        const ids = doc.yarns.map((y) => y.id);
        for (const part of doc.parts) {
          const mesh = buildPartMesh(part, ids, profileOf(part, METRICS));
          const b = new PartBuffers(mesh);
          assert.ok(b.vertexCapacity >= mesh.vertexCount && b.indexCapacity >= mesh.indexCount);
          assert.deepEqual((b.geometry.getAttribute("uv").array as Float32Array).subarray(0, mesh.vertexCount * 2), mesh.uvs);
          assert.deepEqual((b.geometry.getIndex()!.array as Uint32Array).subarray(0, mesh.indexCount), mesh.indices);
          b.dispose();
        }
      },
      60,
    );
  });
});

describe("selección y resaltado sin GPU", () => {
  const part = fixtureAPart();
  const mesh = buildPartMesh(part, yarnIds, profileOf(part));

  it("stitchLocation da la vuelta concreta y el punto dentro de ella", () => {
    assert.deepEqual(stitchLocation(mesh, 0), { roundIndex: 0, stitchInRound: 0 });
    assert.deepEqual(stitchLocation(mesh, 6), { roundIndex: 1, stitchInRound: 0 });
    assert.deepEqual(stitchLocation(mesh, 1_799), { roundIndex: 38, stitchInRound: 5 });
    assert.equal(stitchLocation(mesh, 1_800), null);
    assert.equal(stitchLocation(mesh, -1), null);
  });

  it("el rango de vértices de una vuelta contiene exactamente los triángulos de sus puntos", () => {
    for (const r of [0, 5, 20, 38]) {
      const s0 = mesh.roundStart[r]!;
      const s1 = mesh.roundStart[r + 1]!;
      const { from, to } = vertexRangeOfStitches(mesh, s0, s1);
      assert.ok(to > from);
      for (let t = 0; t < mesh.indexCount / 3; t++) {
        const inside = [0, 1, 2].every((k) => mesh.indices[t * 3 + k]! >= from && mesh.indices[t * 3 + k]! < to);
        const own = mesh.faceStitch[t]! >= s0 && mesh.faceStitch[t]! < s1;
        assert.equal(inside, own, `vuelta ${r}, triángulo ${t}`);
      }
    }
  });
});

describe("tabla por lana en uniformes (sección 6b)", () => {
  it("escribe color lineal y aspecto, acota y avisa cuántas entradas cambiaron", () => {
    const t = createYarnTable();
    assert.equal(t.color.value.length, 32 * 3);
    const n1 = writeLooks(t, [{ hex: "#FFFFFF", halo: 1, sheen: 0.5, definition: 2 }]);
    assert.ok(n1 >= 1);
    assert.deepEqual(Array.from(t.color.value.subarray(0, 3)), [1, 1, 1]);
    assert.deepEqual(Array.from(t.look.value.subarray(0, 3)), [1, 0.5, 1]);
    assert.equal(writeLooks(t, [{ hex: "#FFFFFF", halo: 1, sheen: 0.5, definition: 2 }]), 0, "lo mismo no cambia nada");
    const c = new THREE.Color("#BA222C");
    assert.equal(writeLooks(t, [{ hex: "#FFFFFF", halo: 1, sheen: 0.5, definition: 1 }], { yarn: 0, look: { hex: "#BA222C", halo: 0, sheen: 0, definition: 0 } }), 1);
    assert.ok(Math.abs(t.color.value[0]! - c.r) < 1e-6);
    assert.deepEqual(Array.from(t.look.value.subarray(0, 3)), [0, 0, 0]);
  });
});

describe("material (sección 6b; enmienda V-2)", () => {
  const compile = (lod: "relief" | "smooth") => {
    const table = createYarnTable();
    const m = createFiberMaterial(table, lod, createStitchNormalMap(8));
    const lib = THREE.ShaderLib.physical;
    const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
    const v0 = shader.vertexShader;
    const f0 = shader.fragmentShader;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    return { m, shader, v0, f0, table };
  };

  for (const lod of ["relief", "smooth"] as const) {
    it(`${lod}: todas las inserciones se aplican, con varyings flat y la tabla en el sombreador de vértices`, () => {
      const { m, shader, table } = compile(lod);
      assert.equal(m.customProgramCacheKey(), PROGRAM_CACHE_KEYS[lod]);
      const v = shader.vertexShader;
      const f = shader.fragmentShader;
      assert.match(v, /uniform vec3 uYarnColor\[32\];/);
      assert.match(v, /vYarnColor = uYarnColor\[yarnIndex\];/);
      assert.match(v, /flat varying vec3 vYarnColor;/);
      assert.match(f, /flat varying vec3 vYarnColor;/);
      assert.doesNotMatch(f, /uniform vec3 uYarnColor/, "la tabla no se lee en el de fragmentos");
      assert.doesNotMatch(f + v, /sampler2D uYarn|DataTexture/, "sin textura de datos");
      for (const s of ["diffuseColor.rgb *= vYarnColor;", "FIBER_SHEEN_ROUGHNESS * vYarnLook.y", "fiberFresnel", "HIGHLIGHT_EMISSIVE * vHighlight", "FIBER_SHEEN_SPECULAR * vYarnLook.y", "normalScale * fiberRelief"]) {
        assert.ok(f.includes(s), `falta «${s}»`);
      }
      assert.equal(f.includes("LOOP_EDGE_SHADE * loopEdge"), lod === "relief");
      assert.equal(shader.uniforms.uYarnColor, table.color, "la tabla es compartida, no se copia");
      assert.equal(m.normalMap !== null, lod === "relief");
    });
  }

  it("las constantes de fibra son #define fijos: el texto del programa no depende de las lanas", () => {
    const a = compile("relief");
    writeLooks(a.table, [{ hex: "#123456", halo: 1, sheen: 1, definition: 1 }]);
    const b = compile("relief");
    assert.equal(a.shader.fragmentShader, b.shader.fragmentShader);
    assert.equal(a.shader.vertexShader, b.shader.vertexShader);
  });

  it("el relieve es procedural (sin archivos de imagen) y simétrico entre las dos patas de la V", () => {
    const n = 16;
    const h = stitchHeightField(n);
    assert.ok(h.every(Number.isFinite));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) assert.ok(Math.abs(h[y * n + x]! - h[y * n + (n - 1 - x)]!) < 1e-6);
    const tex = createStitchNormalMap(n);
    assert.ok(tex instanceof THREE.DataTexture);
    assert.equal(tex.image.width, n);
  });
});

describe("escena completa en los búferes", () => {
  it("las copias comparten la geometría: una sola subida por parte", () => {
    const head = readPart(roundPieceText("Cabeza", 6, 6, 4), "cabeza");
    const ear = { ...readPart(roundPieceText("Oreja", 6, 2, 2), "oreja"), copies: 2 };
    const s = buildScene({ pattern: withYarns([head, ear]), metrics: () => METRICS });
    const ears = s.instances.filter((i) => i.partId === "oreja");
    assert.equal(ears.length, 2);
    assert.equal(ears[0]!.mesh, ears[1]!.mesh);
  });
});

describe("límites entre paquetes (CA4-V8, ADR 0010 sección 9)", () => {
  const src = new URL("../src/", import.meta.url);
  const files = (dir: URL): URL[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(new URL(`${e.name}/`, dir)) : e.name.endsWith(".ts") ? [new URL(e.name, dir)] : []));
  const imports = (u: URL) => [...readFileSync(u, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);

  it("viewer-3d no importa stitch-render, yarn-catalog, React ni r3f", () => {
    for (const f of files(src)) for (const i of imports(f)) assert.ok(!/stitch-render|yarn-catalog|^react|@react-three/.test(i), `${f.pathname} importa ${i}`);
  });

  it("solo src/three importa three; la parte pura no", () => {
    for (const f of files(src)) {
      const usesThree = imports(f).some((i) => i === "three" || i.startsWith("three/"));
      if (usesThree) assert.match(f.pathname, /\/src\/three\//, f.pathname);
    }
  });

  it("ninguna textura viene de un archivo de imagen", () => {
    for (const f of files(src)) assert.doesNotMatch(readFileSync(f, "utf8"), /TextureLoader|ImageLoader|\.(png|jpe?g|webp|ktx2)["']/i, f.pathname);
  });
});

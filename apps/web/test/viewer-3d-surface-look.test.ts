/**
 * `SurfaceLook` de `viewer-3d` tiene la misma forma que `YarnLook` de `stitch-render` (ADR 0010,
 * sección 6b). `viewer-3d` no importa `stitch-render` a propósito; esta prueba vive en la
 * aplicación, que usa los dos, y avisa si uno de los dos agrega, quita o cambia un campo.
 * La parte de tipos la revisa `pnpm --filter @loopitalab/web typecheck:test`.
 */
import { FIBERS } from "@loopitalab/yarn-catalog";
import { yarnLook, type YarnLook } from "@loopitalab/stitch-render";
import type { SurfaceLook } from "@loopitalab/viewer-3d";
import { describe, expect, it } from "vitest";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? ([keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : false) : false) : false) : false;

// Falla la compilación si las formas divergen (incluidos campos opcionales nuevos).
const sameShape: Same<SurfaceLook, YarnLook> = true;

describe("SurfaceLook (viewer-3d) y YarnLook (stitch-render)", () => {
  it("se asignan en los dos sentidos y yarnLook entrega exactamente los campos de SurfaceLook", () => {
    expect(sameShape).toBe(true);
    const look: SurfaceLook = yarnLook({ color: { hex: "#BA222C" }, composition: [{ fiber: "lana", percent: 100 }] }, FIBERS, { fiberEffects: true });
    const back: YarnLook = look;
    expect(Object.keys(back).sort()).toEqual(["definition", "halo", "hex", "sheen"]);
  });
});

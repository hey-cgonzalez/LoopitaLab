import type { Yarn } from "@loopitalab/pattern-core";
import { lookInputKey, lookKey, yarnLook, type YarnLookInput } from "@loopitalab/stitch-render";
import type { SurfaceLook } from "@loopitalab/viewer-3d";
import { FIBERS } from "@loopitalab/yarn-catalog";

/*
 * Aspectos del 3D calculados en la aplicación (ADR 0010, sección 6b): la misma fórmula del estudio de colorwork
 * (`yarnLook` de `stitch-render`, con los niveles de `yarn-catalog`). `viewer-3d` no importa ninguno de los dos:
 * `YarnLook` y `SurfaceLook` tienen la misma forma (lo vigila `test/viewer-3d-surface-look.test.ts`).
 *
 * "Colores planos" = `fiberEffects: false`: aspectos neutros, el mismo camino de código en el visor.
 * Se recalcula un aspecto solo si cambia su `lookInputKey`, y se avisa de un cambio solo si cambia su `lookKey`.
 */

export function surfaceLookOf(yarn: YarnLookInput, flat: boolean): SurfaceLook {
  return yarnLook(yarn, FIBERS, { fiberEffects: !flat });
}

export class LookCache {
  #inputKeys: string[] = [];
  #looks: SurfaceLook[] = [];
  #keys: string[] = [];
  /** Cuántas veces se llamó a `yarnLook` (contador del modo de medición). */
  computed = 0;

  /** Aspectos de las lanas; `changed` es false si los aspectos resultantes son los mismos que la vez anterior. */
  update(yarns: readonly Yarn[], flat: boolean): { looks: SurfaceLook[]; changed: boolean } {
    const list = Array.isArray(yarns) ? yarns : [];
    const fx = { fiberEffects: !flat };
    let changed = list.length !== this.#looks.length;
    const looks: SurfaceLook[] = [];
    const inputKeys: string[] = [];
    const keys: string[] = [];
    list.forEach((y, i) => {
      const ik = lookInputKey(y, fx);
      let look = this.#inputKeys[i] === ik ? this.#looks[i] : undefined;
      if (!look) {
        look = surfaceLookOf(y, flat);
        this.computed++;
      }
      const k = lookKey(look);
      if (k !== this.#keys[i]) changed = true;
      looks.push(look);
      inputKeys.push(ik);
      keys.push(k);
    });
    this.#inputKeys = inputKeys;
    this.#looks = looks;
    this.#keys = keys;
    return { looks, changed };
  }

  get current(): readonly SurfaceLook[] {
    return this.#looks;
  }
}

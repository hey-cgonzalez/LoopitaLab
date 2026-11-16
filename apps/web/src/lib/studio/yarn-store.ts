import type { Yarn } from "@loopitalab/pattern-core";

/*
 * Lo que el panel y el selector de lanas (fase 3, T9) necesitan de un almacén. Lo cumplen el almacén del colorwork
 * (`DocumentStore`) y el del amigurumi (`WrittenStore`): el mismo selector sirve en los dos estudios (CA4-E10). Cada
 * acción es una operación de `pattern-core` (`addYarn`, `removeYarn`, `reorderYarns`, generales para `Pattern`); en
 * un patrón escrito, quitar una lana reemplaza sus `@id` y `startYarn` por la de reemplazo.
 */

export type YarnAction =
  | { type: "addYarn"; yarn: Yarn }
  | { type: "updateYarn"; index: number; yarn: Yarn }
  | { type: "removeYarn"; index: number; replaceWith: number }
  | { type: "reorderYarns"; order: readonly number[] };

export interface YarnEditStore {
  readonly doc: { readonly yarns: readonly Yarn[] };
  /** Agrupa los cambios continuos (arrastrar el color, escribir un porcentaje) en un solo paso de deshacer. */
  beginStroke(): void;
  endStroke(): void;
  /** Devuelve true si el documento cambió. */
  dispatch(action: YarnAction): boolean;
}

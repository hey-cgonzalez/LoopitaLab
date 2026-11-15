/**
 * Igualdad estructural de datos JSON (objetos, listas y primitivos), sin depender del orden de las claves. Una clave
 * con `undefined` cuenta como ausente, igual que en `JSON.stringify`. Sirve para saber si una parte leída del texto
 * ya es la del documento (las operaciones y el lector arman los objetos con las claves en otro orden).
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => ra[k] !== undefined);
  const kb = Object.keys(rb).filter((k) => rb[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.hasOwn(rb, k) || !deepEqual(ra[k], rb[k])) return false;
  return true;
}
